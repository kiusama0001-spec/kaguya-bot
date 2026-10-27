import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, "../migrations");
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required to create the Kaguya schema.");

const sslMode = (process.env.PGSSLMODE ?? "").toLowerCase();
let ssl;
if (process.env.PGSSLROOTCERT) {
  ssl = { ca: await readFile(process.env.PGSSLROOTCERT, "utf8"), rejectUnauthorized: true };
} else if (sslMode === "require") {
  // Keep certificate validation enabled; configure PGSSLROOTCERT if the server uses a private CA.
  ssl = { rejectUnauthorized: true };
}
const pool = new pg.Pool({ connectionString, ...(ssl ? { ssl } : {}) });
try {
  // Every migration is idempotent; migrations are applied in lexical order.
  for (const filename of ["0001_kaguya.sql", "0002_runtime_reliability.sql", "0003_filters_clients.sql", "0004_events_contests.sql", "0005_financial_reliability.sql", "0006_distributed_rate_limits.sql", "0007_phrase_corpus_seed_keys.sql", "0008_contest_seed_commitment.sql"]) {
    const sql = await readFile(path.join(migrationsDir, filename), "utf8");
    await pool.query(sql);
    process.stdout.write(`Applied ${filename}.\n`);
  }
  process.stdout.write("Kaguya PostgreSQL schema is ready.\n");
} finally {
  await pool.end();
}
