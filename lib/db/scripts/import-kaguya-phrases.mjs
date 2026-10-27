import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { validatePhraseCorpus } from '../../../scripts/validate-phrase-corpus.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const entries = JSON.parse(await readFile(path.join(root, 'data/kaguya-frases-es.json'), 'utf8'));
const targets = JSON.parse(await readFile(path.join(root, 'data/phrase-targets.json'), 'utf8'));
const legacy = JSON.parse(await readFile(path.join(root, 'data/kiwbot-respuestas.json'), 'utf8'));
const corpusValidation = await validatePhraseCorpus();
if (!corpusValidation.ready) {
  throw new Error(`El corpus no supera el validador integral (entradas=${corpusValidation.total}, duplicados exactos=${corpusValidation.exactDuplicates}, aproximados=${corpusValidation.approximateDuplicates}, inválidas=${corpusValidation.invalidEntries}). Corrígelo antes de importar.`);
}

export function normalizePhrase(value) {
  let text = String(value ?? '').normalize('NFKC').toLocaleLowerCase('es-MX');
  text = text.replace(/\b(?:kiu|kalu|criatura|idiota|mortal|alma perdida|pequeño desastre|personaje|ser humano|baboso|mi amo|amo|reina|querido|querida)\b/giu, ' ');
  text = text.replace(/^(?:a ver|vale|ajá|aja|bueno|mhm|interesante|escucha|mira|oye|espera|vamos|anda|claro|pues|ok|okay|sí|si|no|dime)\s*[,.:!¿?…-]*\s+/iu, '');
  text = text.replace(/[\p{P}\p{S}]/gu, ' ');
  return text.replace(/\s+/gu, ' ').trim();
}

const normalizedSource = new Set(entries.map((entry) => normalizePhrase(entry.text)));
const hashKey = (text) => createHash('sha256').update(normalizePhrase(text), 'utf8').digest('hex');
const seen = new Map();
const counts = Object.fromEntries(Object.keys(targets).map((key) => [key, 0]));
for (const [index, entry] of entries.entries()) {
  if (!entry || !Object.hasOwn(targets, entry.category) || typeof entry.text !== 'string' || !entry.text.trim() || entry.text.length > 2000) {
    throw new Error(`Corpus inválido en la posición ${index}. Ejecuta pnpm phrases:validate:corpus.`);
  }
  const key = normalizePhrase(entry.text);
  if (!key || seen.has(key)) throw new Error(`Frase duplicada en las posiciones ${seen.get(key)} y ${index}.`);
  seen.set(key, index);
  counts[entry.category]++;
}
for (const [category, target] of Object.entries(targets)) {
  if (counts[category] !== target) throw new Error(`La categoría ${category} tiene ${counts[category]} frases; objetivo ${target}.`);
}
if (entries.length !== 10_000) throw new Error(`El corpus contiene ${entries.length} frases, no 10,000.`);
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL es obligatorio para importar las frases.');

const legacyTones = new Set(Object.keys(legacy));
const legacyTextSet = new Set(Object.values(legacy).flat().filter((value) => typeof value === 'string').map(normalizePhrase));
const sslMode = (process.env.PGSSLMODE ?? '').toLowerCase();
let ssl;
if (process.env.PGSSLROOTCERT) ssl = { ca: await readFile(process.env.PGSSLROOTCERT, 'utf8'), rejectUnauthorized: true };
else if (sslMode === 'require') ssl = { rejectUnauthorized: true };
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ...(ssl ? { ssl } : {}) });
const client = await pool.connect();
let inserted = 0;
let reused = 0;
let disabledLegacyDuplicates = 0;
try {
  await client.query('SELECT pg_advisory_lock($1)', [1262570069]);
  const existingResult = await client.query('SELECT id, category, tone, text, enabled, seed_key FROM kaguya_phrases ORDER BY created_at ASC, id ASC');
  const existing = existingResult.rows;
  const bySeedKey = new Map(existing.filter((row) => row.seed_key).map((row) => [row.seed_key, row]));
  const byNormalized = new Map();
  for (const row of existing) {
    const key = normalizePhrase(row.text);
    if (!byNormalized.has(key)) byNormalized.set(key, []);
    byNormalized.get(key).push(row);
  }
  const claimed = new Set();

  await client.query('BEGIN');
  try {
    for (const entry of entries) {
      const normalized = normalizePhrase(entry.text);
      const seedKey = hashKey(entry.text);
      const candidates = byNormalized.get(normalized) ?? [];
      const row = bySeedKey.get(seedKey) ?? candidates.find((candidate) => !claimed.has(candidate.id));
      if (row) {
        await client.query('UPDATE kaguya_phrases SET category = $1, tone = $2, seed_key = $3 WHERE id = $4', [entry.category, entry.tone.slice(0, 40), seedKey, row.id]);
        claimed.add(row.id);
        reused++;
      } else {
        const result = await client.query(
          'INSERT INTO kaguya_phrases (category, tone, text, enabled, seed_key) VALUES ($1, $2, $3, true, $4) ON CONFLICT (seed_key) DO NOTHING RETURNING id',
          [entry.category, entry.tone.slice(0, 40), entry.text, seedKey],
        );
        if (result.rowCount) inserted++;
        else {
          // A concurrent idempotent import may have inserted this seed key first.
          const duplicate = await client.query('SELECT id FROM kaguya_phrases WHERE seed_key = $1 LIMIT 1', [seedKey]);
          if (duplicate.rows[0]) claimed.add(duplicate.rows[0].id);
        }
      }
    }

    for (const row of existing) {
      if (claimed.has(row.id)) continue;
      // Legacy phrases removed from the canonical corpus are retained, disabled, and labelled for audit.
      // No phrase row is physically deleted by this import.
      const normalized = normalizePhrase(row.text);
      if (legacyTones.has(row.tone) && legacyTextSet.has(normalized) && !normalizedSource.has(normalized)) {
        await client.query("UPDATE kaguya_phrases SET category = 'legacy_duplicate_disabled', enabled = false, seed_key = NULL WHERE id = $1", [row.id]);
        disabledLegacyDuplicates++;
      } else if (legacyTones.has(row.tone) && legacyTextSet.has(normalized) && normalizedSource.has(normalized)) {
        // This row is an alternate spelling/punctuation/name variant of an active canonical phrase.
        await client.query("UPDATE kaguya_phrases SET category = 'legacy_duplicate_disabled', enabled = false, seed_key = NULL WHERE id = $1", [row.id]);
        disabledLegacyDuplicates++;
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }

  const result = await client.query('SELECT category, count(*)::int AS count FROM kaguya_phrases WHERE seed_key IS NOT NULL GROUP BY category ORDER BY category');
  const categoryCounts = Object.fromEntries(result.rows.map((row) => [row.category, row.count]));
  const missing = Object.fromEntries(Object.entries(targets).filter(([category, target]) => (categoryCounts[category] ?? 0) !== target).map(([category, target]) => [category, { expected: target, actual: categoryCounts[category] ?? 0 }]));
  process.stdout.write(JSON.stringify({
    corpusEntries: entries.length,
    normalizedUnique: seen.size,
    reusedExistingRows: reused,
    inserted,
    legacyDuplicatesRetainedButDisabled: disabledLegacyDuplicates,
    seedCategoryCounts: categoryCounts,
    categoriesMatchTargets: Object.keys(missing).length === 0,
    categoryMismatches: missing,
    note: 'Legacy duplicate rows are disabled and retained for audit; no rows are physically deleted.',
  }, null, 2) + '\n');
  if (Object.keys(missing).length) process.exitCode = 1;
} finally {
  try { await client.query('SELECT pg_advisory_unlock($1)', [1262570069]); } catch { /* the connection may be closed */ }
  client.release();
  await pool.end();
}
