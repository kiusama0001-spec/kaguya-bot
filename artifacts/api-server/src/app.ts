import express, { type Express } from "express";
import { clerkMiddleware } from "@clerk/express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();
const clerkReady = Boolean(
  process.env.CLERK_SECRET_KEY && process.env.CLERK_PUBLISHABLE_KEY,
);
const extraOrigins = new Set(
  (process.env.ALLOWED_WEB_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use((req, res, next) => {
  const origin = req.get("origin");
  const requestHost = req.get("host");
  let isSameOrigin = false;
  if (origin && requestHost) {
    try {
      isSameOrigin = new URL(origin).host === requestHost;
    } catch {
      isSameOrigin = false;
    }
  }
  if (origin && !isSameOrigin && !extraOrigins.has(origin)) {
    res.status(403).json({ error: "Origen no permitido." });
    return;
  }
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
  }
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});
if (clerkReady) {
  app.use(
    clerkMiddleware({
      secretKey: process.env.CLERK_SECRET_KEY,
      publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
    }),
  );
}
app.use("/api/backup/restore", express.json({ limit: "12mb" }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

if (process.env.NODE_ENV === "production") {
  // Support a root-level Render start command and direct execution from the API workspace.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), "artifacts/kaguya/dist/public"),
    path.resolve(here, "../../kaguya/dist/public"),
  ];
  const webRoot = candidates.find((candidate) => existsSync(path.join(candidate, "index.html")));
  if (webRoot) {
    const indexFile = path.join(webRoot, "index.html");
    app.use(express.static(webRoot, { index: false, maxAge: "1h" }));
    app.get("/{*splat}", (req, res, next) => {
      if (req.path === "/api" || req.path.startsWith("/api/")) { next(); return; }
      res.sendFile(indexFile);
    });
  } else {
    logger.warn({ candidates }, "Frontend build not found; serving API only");
  }
}

export default app;
