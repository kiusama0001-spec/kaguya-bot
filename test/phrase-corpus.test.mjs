import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizePhrase, validatePhraseCorpus } from '../scripts/validate-phrase-corpus.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const corpus = JSON.parse(await readFile(path.join(root, 'data/kaguya-frases-es.json'), 'utf8'));
const targets = JSON.parse(await readFile(path.join(root, 'data/phrase-targets.json'), 'utf8'));

test('canonical Kaguya phrase corpus contains exactly 10,000 entries with exact requested category counts', () => {
  const counts = Object.fromEntries(Object.keys(targets).map((category) => [category, 0]));
  for (const entry of corpus) {
    assert.ok(Object.hasOwn(targets, entry.category), `unexpected category ${entry.category}`);
    assert.equal(typeof entry.text, 'string');
    assert.ok(entry.text.trim().length > 0);
    assert.ok(entry.text.length <= 2000);
    counts[entry.category]++;
  }
  assert.equal(corpus.length, 10_000);
  assert.deepEqual(counts, targets);
});

test('phrase uniqueness ignores punctuation, emojis, common openers, and swapping Kiu/Kalu or generic vocatives', () => {
  const keys = corpus.map((entry) => normalizePhrase(entry.text));
  assert.equal(new Set(keys).size, corpus.length);
});

test('all Kiwbot content is either preserved once or replaced by a non-duplicate contextual phrase', () => {
  assert.ok(corpus.some((entry) => entry.source === 'kiwbot'));
  assert.ok(corpus.some((entry) => entry.source === 'kaguya-authored'));
  assert.ok(corpus.every((entry) => ['kiwbot', 'kaguya-authored'].includes(entry.source)));
});

test('automatic phrase validator reports zero exact and approximate duplicates', async () => {
  const report = await validatePhraseCorpus();
  assert.equal(report.total, 10_000);
  assert.equal(report.exactDuplicates, 0);
  assert.equal(report.approximateDuplicates, 0);
  assert.equal(report.invalidEntries, 0);
  assert.equal(report.editorialReady, false);
  assert.equal(report.ready, false, 'a corpus with repeated clauses must not be marked ready');
});


test('phrase corpus reports repeated clause scaffolding separately from exact/fuzzy phrase uniqueness', async () => {
  const { auditRepeatedClauses } = await import('../scripts/validate-phrase-corpus.mjs');
  const report = auditRepeatedClauses([
    { category: 'a', text: 'La seguridad exige revisar cada paso antes de continuar; procura conservar la información.' },
    { category: 'b', text: 'La seguridad exige revisar cada paso antes de continuar; pide ayuda cuando haga falta.' },
    { category: 'c', text: 'Cada situación merece una respuesta distinta cuando cambia el contexto.' },
  ]);
  assert.equal(report.repeatedClauseCount, 1);
  assert.equal(report.repeatedClauseOccurrences, 1);
  assert.equal(report.editorialReady, false);
});


test('editorial audit identifies the high-frequency scaffolding in the real corpus and blocks readiness', async () => {
  const { auditRepeatedClauses } = await import('../scripts/validate-phrase-corpus.mjs');
  const audit = auditRepeatedClauses(corpus);
  assert.ok(audit.repeatedClauseCount > 0);
  assert.ok(audit.repeatedClauseOccurrences > 0);
  assert.equal(audit.editorialReady, false);
  assert.ok(audit.examples.some((item) => item.clause.includes('no todo se resuelve a fuerza de voluntad')));
});
