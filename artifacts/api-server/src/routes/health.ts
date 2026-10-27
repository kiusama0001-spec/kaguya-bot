import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { getBotHealth } from "../lib/bot-health";

const router: IRouter = Router();

router.get("/healthz", async (_req, res) => {
  let database: "ok" | "unavailable" = "ok";
  try { await pool.query("SELECT 1"); } catch { database = "unavailable"; }
  const bot = getBotHealth().status;
  const status = database === "ok" && bot === "online" ? "ok" : "degraded";
  // Render should not restart an otherwise healthy HTTP service only because Telegram
  // credentials are missing or Telegram is temporarily unreachable. Preserve the degraded
  // signal in the payload, while failing the HTTP check only when PostgreSQL is unavailable.
  res.status(database === "ok" ? 200 : 503).json({ status, database, bot });
});

export default router;
