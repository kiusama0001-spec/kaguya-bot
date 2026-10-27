import { pool, db, reminders, sanctions, kaguyaEvents } from "@workspace/db";
import { and, eq, lte, isNotNull } from "drizzle-orm";
import { logger } from "./logger";
import { getChatPermissions, restrictMember, unbanMember, sendTelegramMessage } from "./telegram";
import { permissionsForRestore } from "./telegram-permissions.mjs";
import { createContestSeed, commitContestSeed } from "./contest-draw.mjs";

const WORKER_LOCK_KEY = 1262570067;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let stopping = false;
let task: Promise<void> | null = null;

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 500);
  return "Fallo desconocido al procesar la tarea.";
}

async function claimDueReminders(): Promise<Array<{ id: string; chat_id: string; text: string; attempts: number }>> {
  const result = await pool.query(
    `WITH due AS (
       SELECT id FROM kaguya_reminders
       WHERE status = 'pending' AND due_at <= now()
       ORDER BY due_at
       LIMIT 10
       FOR UPDATE SKIP LOCKED
     )
     UPDATE kaguya_reminders AS r
     SET status = 'sending', attempts = r.attempts + 1, claimed_at = now(), last_error = NULL
     FROM due WHERE r.id = due.id
     RETURNING r.id, r.chat_id, r.text, r.attempts`,
  );
  return result.rows;
}

async function processReminders(): Promise<void> {
  // Telegram's sendMessage has no idempotency key. If a worker dies while sending,
  // we cannot know whether Telegram accepted the message. Do not blindly retry: mark the
  // delivery ambiguous as failed and require an admin to review before a manual retry.
  await pool.query(
    `UPDATE kaguya_reminders
     SET status = 'failed', claimed_at = NULL,
         last_error = 'Delivery outcome unknown after worker interruption; automatic retry paused to avoid duplicate messages. Verify Telegram delivery before manual retry.'
     WHERE status = 'sending' AND claimed_at < now() - interval '2 minutes'`,
  );
  const due = await claimDueReminders();
  await Promise.allSettled(due.map(async (reminder) => {
    try {
      await sendTelegramMessage(reminder.chat_id, `⏰ Recordatorio\n${reminder.text}`);
      await pool.query(
        `UPDATE kaguya_reminders SET status = 'sent', sent_at = now(), claimed_at = NULL, last_error = NULL WHERE id = $1 AND status = 'sending'`,
        [reminder.id],
      );
    } catch (error) {
      const message = errorText(error);
      const finalFailure = reminder.attempts >= 3;
      await pool.query(
        `UPDATE kaguya_reminders
         SET status = $2, due_at = CASE WHEN $2 = 'pending' THEN now() + ($3::int * interval '1 second') ELSE due_at END,
             claimed_at = NULL, last_error = $4
         WHERE id = $1 AND status = 'sending'`,
        [reminder.id, finalFailure ? "failed" : "pending", 15 * reminder.attempts, message],
      );
      logger.warn({ reminderId: reminder.id, attempt: reminder.attempts, error: message }, "Reminder delivery failed");
    }
  }));
}


function currentMexicoPeriod(now = new Date()): { period: string; year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit" }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  return { period: `${year}-${String(month).padStart(2, "0")}`, year, month };
}

function rentDueDateUtc(year: number, month: number, dueDay: number): Date {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  // Noon in central Mexico is represented as 18:00 UTC; avoids a date boundary at midnight.
  return new Date(Date.UTC(year, month - 1, Math.min(Math.max(1, dueDay), lastDay), 18, 0, 0));
}

async function prepareCurrentRentInvoices(): Promise<void> {
  const { period, year, month } = currentMexicoPeriod();
  const { rows } = await pool.query<{ id: string; rent_amount_cents: number; due_day: number }>(
    `SELECT id, rent_amount_cents, due_day FROM kaguya_clients WHERE status = 'active' ORDER BY id`,
  );
  for (const client of rows) {
    await pool.query(
      `INSERT INTO kaguya_rent_invoices (client_id, period, amount_cents, due_at)
       VALUES ($1, $2, $3, $4) ON CONFLICT (client_id, period) DO NOTHING`,
      [client.id, period, client.rent_amount_cents, rentDueDateUtc(year, month, client.due_day)],
    );
  }
}

async function processRentNotifications(): Promise<void> {
  await prepareCurrentRentInvoices();
  // Claim before contacting Telegram. A crash after a successful send may delay the next
  // reminder until tomorrow, but cannot cause competing workers to send the same reminder.
  const { rows } = await pool.query<{
    id: string; client_id: string; period: string; amount_cents: number; due_at: Date;
    name: string; telegram_chat_id: string; paid_cents: number;
  }>(
    `WITH due AS (
       SELECT i.id, i.client_id, i.period, i.amount_cents, i.due_at, c.name, c.telegram_chat_id,
         COALESCE((SELECT SUM(p.amount_cents) FROM kaguya_client_payments p
                   WHERE p.client_id = i.client_id AND p.period = i.period), 0)::int AS paid_cents
       FROM kaguya_rent_invoices i JOIN kaguya_clients c ON c.id = i.client_id
       WHERE i.status = 'open' AND c.status = 'active' AND c.telegram_chat_id IS NOT NULL
         AND i.due_at <= now()
         AND (i.last_notification_claimed_at IS NULL OR i.last_notification_claimed_at < now() - interval '24 hours')
       ORDER BY i.due_at LIMIT 20 FOR UPDATE OF i SKIP LOCKED
     ), updated AS (
       UPDATE kaguya_rent_invoices i
       SET status = CASE WHEN due.paid_cents >= due.amount_cents THEN 'paid' ELSE 'open' END,
           last_notification_claimed_at = CASE WHEN due.paid_cents >= due.amount_cents THEN i.last_notification_claimed_at ELSE now() END,
           notification_attempts = CASE WHEN due.paid_cents >= due.amount_cents THEN i.notification_attempts ELSE i.notification_attempts + 1 END,
           last_error = NULL
       FROM due WHERE i.id = due.id
       RETURNING i.id, i.client_id, i.period, i.amount_cents, i.due_at, due.name, due.telegram_chat_id, due.paid_cents
     ) SELECT * FROM updated WHERE paid_cents < amount_cents`,
  );
  for (const invoice of rows) {
    const balanceCents = Math.max(0, Number(invoice.amount_cents) - Number(invoice.paid_cents));
    const dueDate = new Date(invoice.due_at).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", dateStyle: "long" });
    try {
      await sendTelegramMessage(invoice.telegram_chat_id,
        `📅 Recordatorio de renta (${invoice.period})\n` +
        `Cliente: ${String(invoice.name).slice(0, 120)}\n` +
        `Importe del periodo: $${(Number(invoice.amount_cents) / 100).toFixed(2)} MXN\n` +
        `Pagado: $${(Number(invoice.paid_cents) / 100).toFixed(2)} MXN\n` +
        `Saldo pendiente: $${(balanceCents / 100).toFixed(2)} MXN\n` +
        `Vencimiento: ${dueDate}`);
      await pool.query(`UPDATE kaguya_rent_invoices SET last_notification_sent_at = now(), last_error = NULL WHERE id = $1`, [invoice.id]);
    } catch (error) {
      const message = errorText(error);
      await pool.query(`UPDATE kaguya_rent_invoices SET last_error = $2 WHERE id = $1`, [invoice.id, message]);
      logger.warn({ invoiceId: invoice.id, error: message }, "Rent reminder failed; next attempt is rate-limited to avoid duplicates");
    }
  }
  // Mark invoices paid even when no notification is due.
  await pool.query(
    `UPDATE kaguya_rent_invoices i SET status = 'paid', last_error = NULL
     WHERE i.status = 'open' AND i.amount_cents <= COALESCE(
       (SELECT SUM(p.amount_cents) FROM kaguya_client_payments p WHERE p.client_id = i.client_id AND p.period = i.period), 0)`,
  );
}

async function processRecurringEvents(): Promise<void> {
  const { rows } = await pool.query<{
    id: string; group_id: string; title: string; description: string; kind: string; closes_at: Date;
    created_by: string | null; series_id: string; recurrence_rule: string; recurrence_index: number;
  }>(
    `SELECT e.id, e.group_id, e.title, e.description, e.kind, e.closes_at, e.created_by,
            e.series_id, e.recurrence_rule, e.recurrence_index
     FROM kaguya_events e
     WHERE e.status = 'closed' AND e.recurrence_rule IN ('daily','weekly','monthly')
       AND e.closes_at IS NOT NULL AND e.closes_at <= now()
       AND NOT EXISTS (SELECT 1 FROM kaguya_events child WHERE child.series_id = e.series_id AND child.recurrence_index = e.recurrence_index + 1)
     ORDER BY e.closes_at LIMIT 20`,
  );
  for (const event of rows) {
    const closesAt = new Date(event.closes_at);
    if (event.recurrence_rule === "daily") closesAt.setUTCDate(closesAt.getUTCDate() + 1);
    else if (event.recurrence_rule === "weekly") closesAt.setUTCDate(closesAt.getUTCDate() + 7);
    else {
      const originalDay = closesAt.getUTCDate();
      closesAt.setUTCDate(1);
      closesAt.setUTCMonth(closesAt.getUTCMonth() + 1);
      const lastDay = new Date(Date.UTC(closesAt.getUTCFullYear(), closesAt.getUTCMonth() + 1, 0)).getUTCDate();
      closesAt.setUTCDate(Math.min(originalDay, lastDay));
    }
    if (closesAt.getTime() <= Date.now()) {
      const now = new Date();
      if (event.recurrence_rule === "daily") now.setUTCDate(now.getUTCDate() + 1);
      else if (event.recurrence_rule === "weekly") now.setUTCDate(now.getUTCDate() + 7);
      else { const day = now.getUTCDate(); now.setUTCDate(1); now.setUTCMonth(now.getUTCMonth() + 1); now.setUTCDate(Math.min(day, new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate())); }
      closesAt.setTime(now.getTime());
    }
    try {
      // A recurring contest must commit to its seed before its next registration window opens.
      const drawSeed = event.kind === "contest" ? createContestSeed() : null;
      const drawSeedCommitment = drawSeed ? commitContestSeed(drawSeed) : null;
      const created = await pool.query(
        `INSERT INTO kaguya_events (group_id, title, description, kind, status, closes_at, created_by, series_id, recurrence_rule, recurrence_index, draw_seed, draw_seed_commitment)
         VALUES ($1,$2,$3,$4,'open',$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (series_id, recurrence_index) DO NOTHING RETURNING id`,
        [event.group_id, event.title, event.description, event.kind, closesAt, event.created_by, event.series_id, event.recurrence_rule, event.recurrence_index + 1, drawSeed, drawSeedCommitment],
      );
      if (created.rowCount && drawSeedCommitment) {
        try {
          await sendTelegramMessage(event.group_id, `🎟️ Nuevo concurso recurrente: ${event.title}\nID: ${String(created.rows[0].id).slice(0, 8)}\nCompromiso previo de semilla SHA-256: ${drawSeedCommitment}\nGuarda el hash antes del cierre. Consulta /evento ${String(created.rows[0].id).slice(0, 8)}.`);
        } catch (error) {
          logger.warn({ eventId: created.rows[0].id, error: errorText(error) }, "Recurring contest created but commitment announcement failed");
        }
      }
      logger.info({ previousEventId: event.id, recurrenceRule: event.recurrence_rule }, "Recurring Kaguya event advanced to the next scheduled instance");
    } catch (error) {
      logger.error({ eventId: event.id, error: errorText(error) }, "Could not create next recurring event instance");
    }
  }
}

async function reconcileSanctions(): Promise<void> {
  // Auto-close scheduled events so an expired registration window cannot remain open forever.
  await db.update(kaguyaEvents).set({ status: "closed", closedAt: new Date() })
    .where(and(eq(kaguyaEvents.status, "open"), lte(kaguyaEvents.closesAt, new Date()), isNotNull(kaguyaEvents.closesAt)));
  // Non-mute expirations are applied by Telegram via until_date; reconcile our local status.
  await db.update(sanctions).set({ status: "expired" })
    .where(and(eq(sanctions.status, "active"), lte(sanctions.expiresAt, new Date()), isNotNull(sanctions.expiresAt), eq(sanctions.action, "ban")));

  const result = await pool.query(
    `WITH due AS (
       SELECT id FROM kaguya_sanctions
       WHERE action = 'mute' AND status = 'active' AND expires_at IS NOT NULL AND expires_at <= now()
       ORDER BY expires_at FOR UPDATE SKIP LOCKED LIMIT 10
     )
     UPDATE kaguya_sanctions AS s SET status = 'restoring'
     FROM due WHERE s.id = due.id
     RETURNING s.id, s.group_id, s.user_id, s.permissions_snapshot, s.previous_until_date, s.previous_status`,
  );

  for (const row of result.rows) {
    try {
      const defaults = await getChatPermissions(row.group_id);
      const restored = permissionsForRestore({
        previousStatus: row.previous_status,
        snapshot: row.permissions_snapshot,
        currentDefaults: defaults,
        previousUntilDate: row.previous_until_date,
      });
      if (!restored) throw new Error("No hay datos suficientes para restaurar los permisos previos con seguridad.");
      await restrictMember(
        row.group_id,
        row.user_id,
        restored,
        row.previous_status === "restricted" && row.previous_until_date && row.previous_until_date > Math.floor(Date.now() / 1000)
          ? row.previous_until_date
          : null,
      );
      await pool.query(`UPDATE kaguya_sanctions SET status = 'expired', restored_at = now() WHERE id = $1 AND status = 'restoring'`, [row.id]);
    } catch (error) {
      const message = errorText(error);
      await pool.query(`UPDATE kaguya_sanctions SET status = 'active' WHERE id = $1 AND status = 'restoring'`, [row.id]);
      logger.error({ sanctionId: row.id, error: message }, "Could not reconcile expired mute; it remains visible for administrator review");
    }
  }
}

async function workLoop(client: import("pg").PoolClient): Promise<void> {
  while (!stopping) {
    try {
      await processReminders();
      await processRentNotifications();
      await processRecurringEvents();
      await reconcileSanctions();
    } catch (error) {
      logger.error({ error: errorText(error) }, "Kaguya persistent worker cycle failed");
    }
    await sleep(5000);
  }
  try { await client.query("SELECT pg_advisory_unlock($1)", [WORKER_LOCK_KEY]); } catch { /* client may be disconnected */ }
  client.release();
}

export async function startWorkers(): Promise<void> {
  if (task || stopping) return;
  stopping = false;
  const client = await pool.connect();
  try {
    const { rows } = await client.query("SELECT pg_try_advisory_lock($1) AS locked", [WORKER_LOCK_KEY]);
    if (!rows[0]?.locked) {
      client.release();
      logger.warn("Persistent worker is already active in another process; this instance will not duplicate jobs");
      return;
    }
  } catch (error) {
    client.release();
    throw error;
  }
  task = workLoop(client);
  void task.catch((error) => logger.error({ error: errorText(error) }, "Persistent worker stopped unexpectedly"))
    .finally(() => { task = null; });
}

export async function stopWorkers(): Promise<void> {
  stopping = true;
  // Wait for the current finite batch to settle before closing PostgreSQL.
  if (task) await task;
}

export async function cancelReminder(reminderId: string): Promise<boolean> {
  const [updated] = await db.update(reminders).set({ status: "cancelled", claimedAt: null })
    .where(and(eq(reminders.id, reminderId), eq(reminders.status, "pending"))).returning({ id: reminders.id });
  return Boolean(updated);
}
