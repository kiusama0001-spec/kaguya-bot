import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const sourcePath = path.join(repoRoot, "data/kiwbot-respuestas.json");
const source = JSON.parse(await readFile(sourcePath, "utf8"));
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL es obligatorio para importar las frases.");

function categoryFor(sourceCategory) {
  if (["amo", "amor_amo", "defensa_amo", "cumplido_amo", "quien_amo", "amo_falso"].includes(sourceCategory)) return "especial_kiu";
  if (sourceCategory === "kalu") return "especial_kalu";
  if (sourceCategory === "general") return "personalidad_conversacion_general";
  if (sourceCategory === "bdsm") return "bdsm_educativo";
  if (["ayuda", "confusion", "fallback", "porque", "que_haces", "quien_eres"].includes(sourceCategory)) return "ayuda_errores_comandos";
  if (["despedida", "saludo", "buenos_dias", "buenas_noches"].includes(sourceCategory)) return "eventos_bienvenidas_despedidas_concursos";
  if (["risa", "broma", "sorpresa", "diva", "insulto"].includes(sourceCategory)) return "gifs_bromas_reacciones";
  if (["pokemon", "pokedex"].includes(sourceCategory)) return "pokemon_pokedex";
  if (["moderacion", "administracion", "ban", "mute", "warn", "kick", "reglas", "spam"].includes(sourceCategory)) return "moderacion_administracion";
  if (["recordatorio", "recordatorios", "cliente", "clientes", "renta", "rentas", "pago", "pagos"].includes(sourceCategory)) return "recordatorios_clientes_rentas_pagos";
  if (["amor", "cumplido", "enojada", "celos", "como_estas", "aburrido", "si", "no", "opinion", "hambre", "cansancio", "triste", "feliz", "enojo_usuario", "chisme", "perdon", "gracias", "pregunta_personal"].includes(sourceCategory)) return "ia_estados_animo_contexto";
  return "personalidad_conversacion_general";
}
const normalize = (value) => value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("es-MX");
const seen = new Set();
const candidates = [];
let skippedInvalid = 0;
let skippedDuplicate = 0;
for (const [sourceCategory, items] of Object.entries(source)) {
  if (!Array.isArray(items)) continue;
  for (const item of items) {
    if (typeof item !== "string" || !item.trim() || item.trim().length > 4000) { skippedInvalid++; continue; }
    const key = normalize(item);
    if (seen.has(key)) { skippedDuplicate++; continue; }
    seen.add(key);
    candidates.push({ category: categoryFor(sourceCategory), tone: sourceCategory, text: item.trim() });
  }
}

const sslMode = (process.env.PGSSLMODE ?? "").toLowerCase();
let ssl;
if (process.env.PGSSLROOTCERT) ssl = { ca: await readFile(process.env.PGSSLROOTCERT, "utf8"), rejectUnauthorized: true };
else if (sslMode === "require") ssl = { rejectUnauthorized: true };
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ...(ssl ? { ssl } : {}) });
try {
  await pool.query("SELECT pg_advisory_lock($1)", [1262570068]);
  const existing = await pool.query("SELECT lower(regexp_replace(btrim(text), '\\s+', ' ', 'g')) AS normalized FROM kaguya_phrases");
  const normalizedExisting = new Set(existing.rows.map((row) => row.normalized));
  const toInsert = candidates.filter((entry) => {
    const key = normalize(entry.text);
    if (normalizedExisting.has(key)) return false;
    normalizedExisting.add(key);
    return true;
  });
  await pool.query("BEGIN");
  try {
    for (let i = 0; i < toInsert.length; i += 100) {
      const batch = toInsert.slice(i, i + 100);
      const values = [];
      const placeholders = batch.map((entry, index) => {
        const base = index * 3;
        values.push(entry.category, entry.tone, entry.text);
        return `($${base + 1}, $${base + 2}, $${base + 3}, true)`;
      });
      await pool.query(`INSERT INTO kaguya_phrases (category, tone, text, enabled) VALUES ${placeholders.join(", ")}`, values);
    }
    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }
  const counts = await pool.query("SELECT category, count(*)::int AS count FROM kaguya_phrases GROUP BY category ORDER BY category");
  process.stdout.write(JSON.stringify({ imported: toInsert.length, ignoredExistingOrDuplicate: candidates.length - toInsert.length, skippedInvalid, skippedDuplicate, categoryCounts: counts.rows }, null, 2) + "\n");
} finally {
  try { await pool.query("SELECT pg_advisory_unlock($1)", [1262570068]); } catch { /* connection can already be closing */ }
  await pool.end();
}
