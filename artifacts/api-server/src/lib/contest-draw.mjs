import { createHash, randomBytes } from "node:crypto";

export const DRAW_ALGORITHM = "sha256-seed-commitment-rejection-v2";

export function createContestSeed() {
  return randomBytes(32).toString("hex");
}

export function commitContestSeed(seed) {
  if (typeof seed !== "string" || !/^[a-f0-9]{64}$/i.test(seed)) {
    throw new Error("La semilla del sorteo debe tener 256 bits en hexadecimal.");
  }
  return createHash("sha256").update(seed, "utf8").digest("hex");
}

export function hashParticipants(participantIds) {
  if (!Array.isArray(participantIds) || participantIds.some((id) => !/^\d{1,24}$/.test(String(id)))) {
    throw new Error("La lista de participantes debe contener IDs numéricos de Telegram.");
  }
  const sorted = [...new Set(participantIds.map(String))].sort();
  if (sorted.length !== participantIds.length) throw new Error("La lista de participantes contiene IDs duplicados.");
  return createHash("sha256").update(sorted.join("\n"), "utf8").digest("hex");
}

/**
 * Deterministic, reproducible draw with rejection sampling to remove modulo bias.
 * Everyone can recompute the result from the previously committed seed and the frozen roster.
 */
export function chooseWinnerIndex(seed, participantHash, participantCount) {
  if (commitContestSeed(seed).length !== 64 || !/^[a-f0-9]{64}$/i.test(String(participantHash))) {
    throw new Error("La semilla o el hash de participantes es inválido.");
  }
  if (!Number.isSafeInteger(participantCount) || participantCount < 1 || participantCount > 50_000) {
    throw new Error("El número de participantes debe estar entre 1 y 50,000.");
  }
  const count = BigInt(participantCount);
  const range = 1n << 64n;
  const acceptanceLimit = range - (range % count);
  for (let counter = 0; counter < 1024; counter++) {
    const digest = createHash("sha256").update(`${seed}|${participantHash}|${counter}`, "utf8").digest("hex");
    const sample = BigInt(`0x${digest.slice(0, 16)}`);
    if (sample < acceptanceLimit) return Number(sample % count);
  }
  throw new Error("No se pudo obtener una muestra válida para el sorteo.");
}

export function verifyContestDraw({ seed, seedCommitment, participantIds, participantHash, winnerUserId }) {
  try {
    if (commitContestSeed(seed) !== seedCommitment) return { valid: false, reason: "seed_commitment_mismatch" };
    const sorted = [...participantIds].map(String).sort();
    const calculatedHash = hashParticipants(sorted);
    if (calculatedHash !== participantHash) return { valid: false, reason: "participant_hash_mismatch" };
    const winner = sorted[chooseWinnerIndex(seed, calculatedHash, sorted.length)];
    return { valid: winner === String(winnerUserId), reason: winner === String(winnerUserId) ? "ok" : "winner_mismatch", winnerUserId: winner };
  } catch (error) {
    return { valid: false, reason: error instanceof Error ? error.message : "invalid_draw" };
  }
}
