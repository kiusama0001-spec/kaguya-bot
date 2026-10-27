import app from "./app";
import { logger } from "./lib/logger";
import { pool } from "@workspace/db";
import { startTelegramBot, stopTelegramBot } from "./lib/telegram-bot";
import { startWorkers, stopWorkers } from "./lib/workers";
import type { Server } from "node:http";

const port = Number(process.env.PORT ?? 10000);
if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new Error(`Invalid PORT value: "${process.env.PORT}"`);

const server: Server = app.listen(port, () => {
  logger.info({ port }, "Kaguya API and web panel listening");
});
server.on("error", (error) => {
  logger.error({ error }, "Could not start Kaguya HTTP server");
  process.exitCode = 1;
});

// The web service stays available even when Telegram/Groq is temporarily unavailable.
void startTelegramBot().catch((error) => logger.error({ error }, "Telegram startup failed"));
void startWorkers().catch((error) => logger.error({ error }, "Persistent worker startup failed"));

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Graceful shutdown started");
  const closeHttp = new Promise<void>((resolve) => server.close(() => resolve()));
  await Promise.allSettled([stopTelegramBot(), stopWorkers(), closeHttp]);
  try { await pool.end(); } catch (error) { logger.warn({ error }, "Database pool did not close cleanly"); }
  logger.info("Graceful shutdown complete");
}

process.once("SIGTERM", () => { void shutdown("SIGTERM").finally(() => process.exit()); });
process.once("SIGINT", () => { void shutdown("SIGINT").finally(() => process.exit()); });
