import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DRAW_ALGORITHM,
  createContestSeed,
  commitContestSeed,
  hashParticipants,
  chooseWinnerIndex,
  verifyContestDraw,
} from '../artifacts/api-server/src/lib/contest-draw.mjs';

test('contest seeds are 256-bit random hex values committed by SHA-256', () => {
  const first = createContestSeed();
  const second = createContestSeed();
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.notEqual(first, second);
  assert.match(commitContestSeed(first), /^[a-f0-9]{64}$/);
  assert.equal(commitContestSeed(first), commitContestSeed(first));
  assert.equal(DRAW_ALGORITHM, 'sha256-seed-commitment-rejection-v2');
});

test('participant hash is stable, sorted, and rejects duplicate or invalid Telegram IDs', () => {
  assert.equal(hashParticipants(['99', '2', '45']), hashParticipants(['45', '99', '2']));
  assert.notEqual(hashParticipants(['2', '45']), hashParticipants(['2', '99']));
  assert.throws(() => hashParticipants(['2', '2']), /duplicados/);
  assert.throws(() => hashParticipants(['not-an-id']), /numéricos/);
});

test('winner selection is deterministic and always returns an in-range unbiased sample', () => {
  const seed = 'a'.repeat(64);
  const hash = hashParticipants(['100', '200', '300', '400', '500']);
  const first = chooseWinnerIndex(seed, hash, 5);
  assert.equal(first, chooseWinnerIndex(seed, hash, 5));
  assert.ok(Number.isInteger(first) && first >= 0 && first < 5);
  assert.throws(() => chooseWinnerIndex(seed, hash, 0), /entre 1 y 50,000/);
  assert.throws(() => chooseWinnerIndex('nope', hash, 5), /semilla|hexadecimal/i);
});

test('draw proof verifies commitment, frozen participant roster and chosen winner', () => {
  const seed = 'f'.repeat(64);
  const ids = ['771', '32', '118'];
  const participantHash = hashParticipants(ids);
  const winnerUserId = ids[chooseWinnerIndex(seed, participantHash, ids.length)];
  const proof = { seed, seedCommitment: commitContestSeed(seed), participantIds: ids, participantHash, winnerUserId };
  assert.deepEqual(verifyContestDraw(proof), { valid: true, reason: 'ok', winnerUserId });
  assert.equal(verifyContestDraw({ ...proof, seedCommitment: '0'.repeat(64) }).reason, 'seed_commitment_mismatch');
  assert.equal(verifyContestDraw({ ...proof, participantIds: ['771', '32', '999'] }).reason, 'participant_hash_mismatch');
  assert.equal(verifyContestDraw({ ...proof, winnerUserId: '999' }).reason, 'winner_mismatch');
});
