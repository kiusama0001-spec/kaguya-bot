import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { findApproximateDuplicates, normalizePhrase } from '../../../scripts/validate-phrase-corpus.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const targets = JSON.parse(await readFile(path.join(root, 'data/phrase-targets.json'), 'utf8'));
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL es obligatorio para validar las cantidades reales de PostgreSQL.');
  process.exit(2);
}
const sslMode = (process.env.PGSSLMODE ?? '').toLowerCase();
let ssl;
if (process.env.PGSSLROOTCERT) ssl = { ca: await readFile(process.env.PGSSLROOTCERT, 'utf8'), rejectUnauthorized: true };
else if (sslMode === 'require') ssl = { rejectUnauthorized: true };
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ...(ssl ? { ssl } : {}) });
try {
  const { rows } = await pool.query('SELECT category, text FROM kaguya_phrases WHERE seed_key IS NOT NULL ORDER BY category, seed_key');
  const counts = new Map();
  const seen = new Map();
  const exactDuplicates = [];
  for (const row of rows) {
    counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
    const key = normalizePhrase(row.text);
    if (seen.has(key)) exactDuplicates.push({ text: row.text.slice(0, 120), categories: [seen.get(key), row.category] });
    else seen.set(key, row.category);
  }
  const approximateDuplicates = findApproximateDuplicates(rows);
  const categories = Object.entries(targets).map(([category, target]) => ({ category, target, actual: counts.get(category) ?? 0, deficit: Math.max(0, target - (counts.get(category) ?? 0)), excess: Math.max(0, (counts.get(category) ?? 0) - target) }));
  const report = { totalSeedRows: rows.length, targetTotal: Object.values(targets).reduce((sum, n) => sum + n, 0), exactDuplicates: exactDuplicates.length, approximateDuplicates: approximateDuplicates.length, categories, ready: rows.length === 10_000 && categories.every((row) => row.actual === row.target) && exactDuplicates.length === 0 && approximateDuplicates.length === 0 };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ready) process.exitCode = 1;
} finally {
  await pool.end();
}
