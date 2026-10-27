import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const targetPath = path.join(root, 'data/phrase-targets.json');
const corpusPath = path.join(root, 'data/kaguya-frases-es.json');

export function normalizePhrase(value) {
  let text = String(value ?? '').normalize('NFKC').toLocaleLowerCase('es-MX');
  // A phrase is not unique merely because it swaps a name, vocative, emoji, or punctuation.
  text = text.replace(/\b(?:kiu|kalu|criatura|idiota|mortal|alma perdida|pequeño desastre|personaje|ser humano|baboso|mi amo|amo|reina|querido|querida)\b/giu, ' ');
  text = text.replace(/^(?:a ver|vale|ajá|aja|bueno|mhm|interesante|escucha|mira|oye|espera|vamos|anda|claro|pues|ok|okay|sí|si|no|dime)\s*[,.:!¿?…-]*\s+/iu, '');
  text = text.replace(/[\p{P}\p{S}]/gu, ' ');
  return text.replace(/\s+/gu, ' ').trim();
}

function charShingles(text, size = 4) {
  const compact = ` ${text.replace(/\s+/gu, ' ')} `;
  const out = new Set();
  for (let i = 0; i <= compact.length - size; i++) out.add(compact.slice(i, i + size));
  return out;
}

function hashString(value, seed) {
  let hash = (2166136261 ^ seed) >>> 0;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619) >>> 0;
  return hash;
}

function levenshteinSimilarity(left, right) {
  if (left === right) return 1;
  if (!left.length || !right.length) return 0;
  if (Math.abs(left.length - right.length) / Math.max(left.length, right.length) > 0.12) return 0;
  let previous = new Uint16Array(right.length + 1);
  let current = new Uint16Array(right.length + 1);
  for (let j = 0; j <= right.length; j++) previous[j] = j;
  for (let i = 1; i <= left.length; i++) {
    current[0] = i;
    let rowMin = current[0];
    for (let j = 1; j <= right.length; j++) {
      const cost = left.charCodeAt(i - 1) === right.charCodeAt(j - 1) ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
      if (current[j] < rowMin) rowMin = current[j];
    }
    [previous, current] = [current, previous];
  }
  return 1 - previous[right.length] / Math.max(left.length, right.length);
}

export function findApproximateDuplicates(entries, threshold = 0.92) {
  const normalized = entries.map((entry) => normalizePhrase(entry.text));
  const shingleSets = normalized.map((text) => charShingles(text));
  const signatureSize = 24;
  const signatures = [];
  for (const shingles of shingleSets) {
    const values = Array(signatureSize).fill(0xffffffff);
    for (const shingle of shingles) {
      for (let seed = 0; seed < signatureSize; seed++) {
        const hash = hashString(shingle, Math.imul(seed + 1, 0x9e3779b1));
        if (hash < values[seed]) values[seed] = hash;
      }
    }
    signatures.push(values);
  }
  const buckets = new Map();
  const candidatePairs = new Set();
  const bands = 6;
  const rows = signatureSize / bands;
  for (let index = 0; index < signatures.length; index++) {
    for (let band = 0; band < bands; band++) {
      const start = band * rows;
      const key = `${band}:${signatures[index].slice(start, start + rows).join(',')}`;
      const prior = buckets.get(key) ?? [];
      for (const other of prior) candidatePairs.add(`${other}:${index}`);
      prior.push(index);
      buckets.set(key, prior);
    }
  }

  const pairs = [];
  for (const key of candidatePairs) {
    const [i, j] = key.split(':').map(Number);
    if (!normalized[i] || normalized[i] === normalized[j]) continue;
    const left = normalized[i]; const right = normalized[j];
    if (Math.abs(left.length - right.length) / Math.max(left.length, right.length, 1) > 0.12) continue;
    const a = shingleSets[i]; const b = shingleSets[j];
    let shared = 0;
    for (const item of a) if (b.has(item)) shared++;
    const jaccard = shared / Math.max(1, a.size + b.size - shared);
    if (jaccard < 0.75) continue;
    const similarity = levenshteinSimilarity(left, right);
    if (similarity >= threshold) {
      pairs.push({ leftIndex: i, rightIndex: j, similarity: Number(similarity.toFixed(4)), left: entries[i].text, right: entries[j].text, leftCategory: entries[i].category, rightCategory: entries[j].category });
    }
  }
  return pairs.sort((a, b) => b.similarity - a.similarity);
}

export function auditRepeatedClauses(entries, minimumWords = 7) {
  const occurrences = new Map();
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    if (typeof entry?.text !== "string") continue;
    const seenInEntry = new Set();
    for (const piece of entry.text.split(/[;.!?¿¡:]+/u)) {
      const normalized = normalizePhrase(piece);
      if (normalized.split(/\s+/u).filter(Boolean).length < minimumWords || seenInEntry.has(normalized)) continue;
      seenInEntry.add(normalized);
      const bucket = occurrences.get(normalized) ?? [];
      bucket.push({ index, category: entry.category, text: piece.trim() });
      occurrences.set(normalized, bucket);
    }
  }
  const repeated = [...occurrences.entries()].filter(([, rows]) => rows.length > 1)
    .map(([clause, rows]) => ({ clause, count: rows.length, entries: rows.slice(0, 8) }))
    .sort((a, b) => b.count - a.count);
  const repeatedOccurrences = repeated.reduce((sum, entry) => sum + entry.count - 1, 0);
  return {
    repeatedClauseCount: repeated.length,
    repeatedClauseOccurrences: repeatedOccurrences,
    examples: repeated.slice(0, 30),
    editorialReady: repeated.length === 0,
    note: "Este detector es una señal de reutilización de fragmentos, no una evaluación semántica humana. Un valor distinto de cero exige revisión editorial; no demuestra por sí solo que dos frases completas sean duplicadas.",
  };
}

export async function validatePhraseCorpus() {
  const [targets, entries] = await Promise.all([
    readFile(targetPath, 'utf8').then(JSON.parse),
    readFile(corpusPath, 'utf8').then(JSON.parse),
  ]);
  const counts = Object.fromEntries(Object.keys(targets).map((category) => [category, 0]));
  const exactSeen = new Map();
  const exactDuplicates = [];
  const invalid = [];
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    if (!entry || typeof entry.text !== 'string' || !entry.text.trim() || entry.text.length > 2000 || !Object.hasOwn(targets, entry.category)) {
      invalid.push({ index, category: entry?.category ?? null, message: 'Texto vacío, demasiado largo o categoría no configurada' });
      continue;
    }
    counts[entry.category]++;
    const normalized = normalizePhrase(entry.text);
    if (exactSeen.has(normalized)) exactDuplicates.push({ firstIndex: exactSeen.get(normalized), index, text: entry.text });
    else exactSeen.set(normalized, index);
  }
  const categoryReport = Object.entries(targets).map(([category, target]) => ({ category, target, actual: counts[category] ?? 0, deficit: Math.max(0, target - (counts[category] ?? 0)), excess: Math.max(0, (counts[category] ?? 0) - target) }));
  const approximateDuplicates = findApproximateDuplicates(entries);
  const clauseAudit = auditRepeatedClauses(entries);
  const report = {
    total: entries.length,
    targetTotal: Object.values(targets).reduce((sum, value) => sum + value, 0),
    kiwbotOriginal: entries.filter((entry) => entry.source === 'kiwbot').length,
    kaguyaAuthored: entries.filter((entry) => entry.source === 'kaguya-authored').length,
    exactDuplicates: exactDuplicates.length,
    approximateDuplicates: approximateDuplicates.length,
    invalidEntries: invalid.length,
    repeatedClauseCount: clauseAudit.repeatedClauseCount,
    repeatedClauseOccurrences: clauseAudit.repeatedClauseOccurrences,
    editorialReady: clauseAudit.editorialReady,
    editorialNote: clauseAudit.note,
    repeatedClauseExamples: clauseAudit.examples,
    categories: categoryReport,
    examples: { exact: exactDuplicates.slice(0, 10), approximate: approximateDuplicates.slice(0, 10), invalid: invalid.slice(0, 10) },
    ready: entries.length === Object.values(targets).reduce((sum, value) => sum + value, 0) && categoryReport.every((row) => row.actual === row.target) && exactDuplicates.length === 0 && approximateDuplicates.length === 0 && invalid.length === 0 && clauseAudit.editorialReady,
  };
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const report = await validatePhraseCorpus();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ready) process.exitCode = 1;
}
