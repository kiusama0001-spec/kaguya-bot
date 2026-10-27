export const DRAW_ALGORITHM: string;
export function createContestSeed(): string;
export function commitContestSeed(seed: string): string;
export function hashParticipants(participantIds: string[]): string;
export function chooseWinnerIndex(seed: string, participantHash: string, participantCount: number): number;
export function verifyContestDraw(input: { seed: string; seedCommitment: string; participantIds: string[]; participantHash: string; winnerUserId: string }): { valid: boolean; reason: string; winnerUserId?: string };
