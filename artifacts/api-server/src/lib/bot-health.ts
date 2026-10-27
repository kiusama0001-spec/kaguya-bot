let polling = false;
let lastSuccessfulPollAt: number | null = null;
let lastErrorAt: number | null = null;

export function setPolling(value: boolean): void {
  polling = value;
}

export function recordPollSuccess(at = Date.now()): void {
  lastSuccessfulPollAt = at;
  lastErrorAt = null;
}

export function recordPollError(at = Date.now()): void {
  lastErrorAt = at;
}

export function getBotHealth(): {
  status: "online" | "offline" | "needs_setup";
  lastSuccessfulPollAt: number | null;
  lastErrorAt: number | null;
} {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    return { status: "needs_setup", lastSuccessfulPollAt, lastErrorAt };
  }
  const recent = lastSuccessfulPollAt !== null && Date.now() - lastSuccessfulPollAt < 60_000;
  const latestPollFailed = lastErrorAt !== null && (lastSuccessfulPollAt === null || lastErrorAt > lastSuccessfulPollAt);
  return {
    status: polling && recent && !latestPollFailed ? "online" : "offline",
    lastSuccessfulPollAt,
    lastErrorAt,
  };
}
