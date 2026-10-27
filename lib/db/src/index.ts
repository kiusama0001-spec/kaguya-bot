import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { readFileSync } from "node:fs";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const sslMode = (process.env.PGSSLMODE ?? "").toLowerCase();
const sslRootCert = process.env.PGSSLROOTCERT;
const ssl = sslRootCert
  ? { ca: readFileSync(sslRootCert, "utf8"), rejectUnauthorized: true }
  : sslMode === "require"
    ? { rejectUnauthorized: true }
    : undefined;

export const pool = new Pool({ connectionString: process.env.DATABASE_URL, ...(ssl ? { ssl } : {}) });
export const db = drizzle(pool, { schema });

export * from "./schema";
