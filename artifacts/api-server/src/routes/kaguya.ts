import { getAuth, clerkClient } from "@clerk/express";
import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { Router, type NextFunction, type Request, type Response } from "express";
import {
  CreateGifBody,
  CreateGifResponse,
  CreatePhraseBody,
  CreatePhraseResponse,
  CreateReminderBody,
  CreateReminderResponse,
  CreateSanctionBody,
  CreateSanctionParams,
  CreateSanctionResponse,
  GetBotSettingsResponse,
  GetDashboardResponse,
  GetGroupSettingsParams,
  GetGroupSettingsResponse,
  ListActivityQueryParams,
  ListActivityResponse,
  ListGifsResponse,
  ListGroupMembersParams,
  ListGroupMembersQueryParams,
  ListGroupMembersResponse,
  ListGroupsResponse,
  ListPhrasesQueryParams,
  ListPhrasesResponse,
  ListRemindersResponse,
  ListSanctionsParams,
  ListSanctionsQueryParams,
  ListSanctionsResponse,
  ListTemplatesResponse,
  RestoreSanctionParams,
  RestoreSanctionResponse,
  UpdateBotSettingsBody,
  UpdateBotSettingsResponse,
  UpdateGroupSettingsBody,
  UpdateGroupSettingsParams,
  UpdateGroupSettingsResponse,
  UpdateTemplateBody,
  UpdateTemplateParams,
  UpdateTemplateResponse,
} from "@workspace/api-zod";
import {
  activityLog,
  botSettings,
  clients,
  clientPayments,
  rentInvoices,
  pool,
  groupFilters,
  conversationMemory,
  eventParticipants,
  kaguyaEvents,
  gifRecords,
  groupMembers,
  groupSettings,
  messageTemplates,
  phrases,
  reminders,
  sanctions,
  telegramGroups,
} from "@workspace/db";
import { telegramConfigured, TelegramApiError, telegramCall, isChatAdministrator, snapshotMemberPermissions, mutedPermissions, restrictMember, banMember, unbanMember, sendTelegramMessage, getChatPermissions } from "../lib/telegram";
import { getBotHealth } from "../lib/bot-health";
import { sendTelegramPhoto } from "../lib/telegram";
import { permissionsForRestore } from "../lib/telegram-permissions.mjs";
import { logger } from "../lib/logger";
import { createContestSeed, commitContestSeed, hashParticipants, chooseWinnerIndex, DRAW_ALGORITHM } from "../lib/contest-draw.mjs";

const router = Router();
const GROUP_PERMISSION_ACTIONS = new Set(["ban", "mute", "warn", "kick"]);

type AdminRequest = Request & { kaguyaAdmin?: string };

function adminEmails(): Set<string> {
  return new Set(
    (process.env.KAGUYA_ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

function adminIds(): Set<string> {
  return new Set(
    (process.env.KAGUYA_ADMIN_CLERK_USER_IDS ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  );
}

async function requireAdmin(
  req: AdminRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!process.env.CLERK_SECRET_KEY || !process.env.CLERK_PUBLISHABLE_KEY) {
    res.status(503).json({ error: "Configura CLERK_SECRET_KEY y CLERK_PUBLISHABLE_KEY para habilitar el panel administrativo." });
    return;
  }
  if (adminEmails().size === 0 && adminIds().size === 0) {
    res.status(503).json({ error: "Configura KAGUYA_ADMIN_EMAILS o KAGUYA_ADMIN_CLERK_USER_IDS." });
    return;
  }

  let auth: ReturnType<typeof getAuth>;
  try { auth = getAuth(req); }
  catch {
    res.status(401).json({ error: "No hay una sesión Clerk válida. Inicia sesión para continuar." });
    return;
  }
  if (!auth.userId) {
    res.status(401).json({ error: "Inicia sesión para continuar." });
    return;
  }
  if (adminIds().has(auth.userId)) {
    req.kaguyaAdmin = auth.userId;
    next();
    return;
  }

  try {
    const user = await clerkClient.users.getUser(auth.userId);
    // Email-based allowlisting must only accept a verified Clerk address.
    const allowed = user.emailAddresses.some((address) =>
      address.verification?.status === "verified" &&
      adminEmails().has(address.emailAddress.toLowerCase()),
    );
    if (!allowed) {
      res.status(403).json({ error: "Esta cuenta no tiene permisos de administración." });
      return;
    }
    req.kaguyaAdmin = user.id;
    next();
  } catch {
    res.status(401).json({ error: "No se pudo verificar la sesión administrativa." });
  }
}

router.use(requireAdmin);

async function recordActivity(
  action: string,
  summary: string,
  actor: string | null,
  groupId: string | null = null,
): Promise<void> {
  await dbInsertActivity(action, summary, actor, groupId);
}

async function dbInsertActivity(
  action: string,
  summary: string,
  actor: string | null,
  groupId: string | null,
): Promise<void> {
  const { db } = await import("@workspace/db");
  await db.insert(activityLog).values({ action, summary, actor, groupId });
}

router.get("/dashboard", async (_req, res): Promise<void> => {
  const { db } = await import("@workspace/db");
  const [groups, members, active, pending, recent] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(telegramGroups),
    db.select({ count: sql<number>`count(*)::int` }).from(groupMembers),
    db.select({ count: sql<number>`count(*)::int` }).from(sanctions).where(eq(sanctions.status, "active")),
    db.select({ count: sql<number>`count(*)::int` }).from(reminders).where(eq(reminders.status, "pending")),
    db.select().from(activityLog).orderBy(desc(activityLog.createdAt)).limit(6),
  ]);
  const botHealth = getBotHealth();
  res.json(
    GetDashboardResponse.parse({
      groups: groups[0]?.count ?? 0,
      membersSeen: members[0]?.count ?? 0,
      activeSanctions: active[0]?.count ?? 0,
      pendingReminders: pending[0]?.count ?? 0,
      botStatus: botHealth.status,
      recentActivity: recent,
    }),
  );
});

router.get("/groups", async (_req, res): Promise<void> => {
  const { db } = await import("@workspace/db");
  const rows = await db.select().from(telegramGroups).orderBy(desc(telegramGroups.lastSeenAt));
  res.json(ListGroupsResponse.parse(rows));
});

router.get("/groups/:groupId/members", async (req, res): Promise<void> => {
  const params = ListGroupMembersParams.safeParse(req.params);
  const query = ListGroupMembersQueryParams.safeParse(req.query);
  if (!params.success || !query.success) {
    res.status(400).json({ error: "Parámetros de búsqueda inválidos." });
    return;
  }
  const { db } = await import("@workspace/db");
  const search = query.data.search?.trim();
  const conditions = search
    ? and(
        eq(groupMembers.chatId, params.data.groupId),
        or(ilike(groupMembers.fullName, `%${search}%`), ilike(groupMembers.username, `%${search}%`)),
      )
    : eq(groupMembers.chatId, params.data.groupId);
  const rows = await db.select().from(groupMembers).where(conditions).orderBy(desc(groupMembers.lastSeenAt)).limit(200);
  res.json(ListGroupMembersResponse.parse(rows));
});

router.get("/groups/:groupId/sanctions", async (req, res): Promise<void> => {
  const params = ListSanctionsParams.safeParse(req.params);
  const query = ListSanctionsQueryParams.safeParse(req.query);
  if (!params.success || !query.success) {
    res.status(400).json({ error: "Parámetros de sanciones inválidos." });
    return;
  }
  const { db } = await import("@workspace/db");
  const status = query.data.status;
  const conditions =
    status === "all"
      ? eq(sanctions.groupId, params.data.groupId)
      : and(eq(sanctions.groupId, params.data.groupId), eq(sanctions.status, status));
  const rows = await db.select().from(sanctions).where(conditions).orderBy(desc(sanctions.createdAt)).limit(200);
  res.json(ListSanctionsResponse.parse(rows));
});

async function notifySanction(groupId: string, type: string, username: string | null | undefined, userId: string, reason: string | null | undefined): Promise<void> {
  const { db } = await import("@workspace/db");
  const [groupTemplate] = await db.select().from(messageTemplates)
    .where(and(eq(messageTemplates.type, type), eq(messageTemplates.groupId, groupId))).limit(1);
  const [globalTemplate] = groupTemplate ? [] : await db.select().from(messageTemplates)
    .where(and(eq(messageTemplates.type, type), sql`${messageTemplates.groupId} is null`)).limit(1);
  const template = groupTemplate ?? globalTemplate;
  const target = username ? `@${username.replace(/^@/, "")}` : userId;
  const fallback = type === "mute" ? `🔇 ${target} recibió un silencio.`
    : type === "ban" ? `⛔ ${target} fue baneado.`
      : type === "kick" ? `👢 ${target} fue expulsado.`
        : `⚠️ Advertencia para ${target}${reason ? `: ${reason}` : "."}`;
  const body = (template?.text || fallback)
    .replaceAll("{username}", target)
    .replaceAll("{user_id}", userId)
    .replaceAll("{reason}", reason || "Sin motivo especificado");
  if (template?.imageFileId) await sendTelegramPhoto(groupId, template.imageFileId, body);
  else await sendTelegramMessage(groupId, body);
}

router.post("/groups/:groupId/sanctions", async (req: AdminRequest, res): Promise<void> => {
  const params = CreateSanctionParams.safeParse(req.params);
  const body = CreateSanctionBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Datos de sanción inválidos." });
    return;
  }
  if (!GROUP_PERMISSION_ACTIONS.has(body.data.action)) {
    res.status(400).json({ error: "Tipo de sanción no compatible." });
    return;
  }
  if (!telegramConfigured()) {
    res.status(503).json({ error: "Configura TELEGRAM_BOT_TOKEN para aplicar sanciones reales." });
    return;
  }

  const { db } = await import("@workspace/db");
  const [group] = await db.select().from(telegramGroups).where(eq(telegramGroups.chatId, params.data.groupId)).limit(1);
  if (!group) {
    res.status(404).json({ error: "El grupo todavía no ha sido detectado por Kaguya." });
    return;
  }

  let permissionSnapshot: Record<string, boolean> | null = null;
  let previousUntilDate: number | null = null;
  let previousStatus: string | null = null;
  if (body.data.action === "mute") {
    try {
      const snapshot = await snapshotMemberPermissions(params.data.groupId, body.data.userId);
      permissionSnapshot = snapshot.permissions;
      previousUntilDate = snapshot.untilDate;
      previousStatus = snapshot.status;
    } catch (error) {
      res.status(409).json({
        error: error instanceof Error ? error.message : "No se pudo verificar el estado previo del usuario.",
      });
      return;
    }
  }

  const expiry =
    body.data.durationSeconds === undefined
      ? null
      : new Date(Date.now() + body.data.durationSeconds * 1000);
  let pendingSanction: typeof sanctions.$inferSelect | undefined;
  try {
    await db.transaction(async (tx) => {
      const lockKey = `${params.data.groupId}:${body.data.userId}:${body.data.action}`;
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`);
      const [existing] = await tx
        .select()
        .from(sanctions)
        .where(
          and(
            eq(sanctions.groupId, params.data.groupId),
            eq(sanctions.userId, body.data.userId),
            eq(sanctions.action, body.data.action),
            sql`${sanctions.status} in ('active', 'applying')`,
          ),
        )
        .limit(1);
      if (existing) throw new Error("SANCTION_ALREADY_ACTIVE");
      const [created] = await tx
        .insert(sanctions)
        .values({
          groupId: params.data.groupId,
          userId: body.data.userId,
          username: body.data.username ?? null,
          action: body.data.action,
          status: "applying",
          reason: body.data.reason ?? null,
          actor: req.kaguyaAdmin ?? null,
          permissionsSnapshot: permissionSnapshot,
          previousUntilDate,
          previousStatus,
          expiresAt: expiry,
        })
        .returning();
      pendingSanction = created;
    });
  } catch (error) {
    if (error instanceof Error && error.message === "SANCTION_ALREADY_ACTIVE") {
      res.status(409).json({ error: "Ya existe una sanción activa de este tipo para esa persona." });
      return;
    }
    throw error;
  }

  if (!pendingSanction) {
    res.status(500).json({ error: "No se pudo reservar la sanción." });
    return;
  }

  let kickBanSucceeded = false;
  try {
    const untilDate = expiry ? Math.floor(expiry.getTime() / 1000) : undefined;
    if (body.data.action === "mute") {
      await restrictMember(
        params.data.groupId,
        body.data.userId,
        mutedPermissions(permissionSnapshot!),
        untilDate,
      );
    } else if (body.data.action === "ban") {
      await banMember(params.data.groupId, body.data.userId, untilDate);
    } else if (body.data.action === "kick") {
      await banMember(params.data.groupId, body.data.userId);
      kickBanSucceeded = true;
      await unbanMember(params.data.groupId, body.data.userId);
    }
    // A notification failure must never rewrite a sanction that Telegram already applied.
    try { await notifySanction(params.data.groupId, body.data.action, body.data.username, body.data.userId, body.data.reason); }
    catch (error) { logger.warn({ groupId: params.data.groupId, action: body.data.action, error: error instanceof Error ? error.message : "unknown" }, "Sanction applied but announcement failed"); }
    const oneShot = body.data.action === "warn" || body.data.action === "kick";
    const [applied] = await db
      .update(sanctions)
      .set({ status: oneShot ? "expired" : "active", ...(oneShot ? { restoredAt: new Date() } : {}) })
      .where(eq(sanctions.id, pendingSanction.id))
      .returning();
    await recordActivity(
      `sanction_${body.data.action}`,
      `${body.data.action} aplicado a ${body.data.username ? `@${body.data.username}` : body.data.userId}`,
      req.kaguyaAdmin ?? null,
      params.data.groupId,
    );
    res.status(201).json(CreateSanctionResponse.parse(applied));
  } catch (error) {
    // If kick's temporary ban succeeded but unban failed, keep it restorable instead of hiding it as failed.
    await db.update(sanctions).set({ status: kickBanSucceeded ? "active" : "failed" }).where(eq(sanctions.id, pendingSanction.id));
    const message = kickBanSucceeded
      ? "El ban temporal para expulsar se aplicó, pero Telegram no confirmó el unban. La sanción quedó activa para que puedas retirarla desde el panel."
      : error instanceof TelegramApiError
        ? error.message
        : "Telegram no confirmó la sanción; su estado quedó marcado como fallido.";
    res.status(502).json({ error: message });
  }
});

router.post("/sanctions/:sanctionId/restore", async (req: AdminRequest, res): Promise<void> => {
  const params = RestoreSanctionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Identificador de sanción inválido." });
    return;
  }
  if (!telegramConfigured()) {
    res.status(503).json({ error: "Configura TELEGRAM_BOT_TOKEN para restaurar la sanción en Telegram." });
    return;
  }

  const { db } = await import("@workspace/db");
  const [sanction] = await db.select().from(sanctions).where(eq(sanctions.id, params.data.sanctionId)).limit(1);
  if (!sanction) {
    res.status(404).json({ error: "No se encontró la sanción." });
    return;
  }
  if (sanction.status !== "active" && sanction.status !== "expired") {
    res.status(409).json({ error: "La sanción no está activa." });
    return;
  }
  try {
    if (sanction.action === "mute") {
      const currentDefaults = await getChatPermissions(sanction.groupId);
      const restorePermissions = permissionsForRestore({
        previousStatus: sanction.previousStatus,
        snapshot: sanction.permissionsSnapshot,
        currentDefaults,
        previousUntilDate: sanction.previousUntilDate,
      });
      if (!restorePermissions) {
        res.status(409).json({ error: "No hay datos suficientes para restaurar los permisos previos con seguridad. La sanción no se modificó." });
        return;
      }
      const previousUntil = sanction.previousStatus === "restricted" && sanction.previousUntilDate && sanction.previousUntilDate > Math.floor(Date.now() / 1000)
        ? sanction.previousUntilDate : null;
      await restrictMember(sanction.groupId, sanction.userId, restorePermissions, previousUntil);
    } else if (sanction.action === "ban" || sanction.action === "kick") {
      await unbanMember(sanction.groupId, sanction.userId);
    }
    const [restored] = await db
      .update(sanctions)
      .set({ status: "reversed", restoredAt: new Date() })
      .where(eq(sanctions.id, sanction.id))
      .returning();
    await recordActivity(
      `sanction_restore_${sanction.action}`,
      `Sanción retirada de ${sanction.username ? `@${sanction.username}` : sanction.userId}`,
      req.kaguyaAdmin ?? null,
      sanction.groupId,
    );
    res.json(RestoreSanctionResponse.parse(restored));
  } catch (error) {
    const message =
      error instanceof TelegramApiError
        ? error.message
        : "Telegram no confirmó la restauración. La sanción sigue registrada como activa.";
    res.status(502).json({ error: message });
  }
});

router.get("/groups/:groupId/settings", async (req, res): Promise<void> => {
  const params = GetGroupSettingsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Grupo inválido." });
    return;
  }
  const { db } = await import("@workspace/db");
  const [group] = await db.select().from(telegramGroups).where(eq(telegramGroups.chatId, params.data.groupId)).limit(1);
  if (!group) {
    res.status(404).json({ error: "Grupo no encontrado." });
    return;
  }
  const [settings] = await db.select().from(groupSettings).where(eq(groupSettings.groupId, group.chatId)).limit(1);
  const payload = {
    groupId: group.chatId,
    enabled: group.enabled,
    aiEnabled: settings?.aiEnabled ?? true,
    moderationEnabled: settings?.moderationEnabled ?? true,
    antiFloodEnabled: settings?.antiFloodEnabled ?? true,
    welcomeText: settings?.welcomeText ?? "",
    goodbyeText: settings?.goodbyeText ?? "",
  };
  res.json(GetGroupSettingsResponse.parse(payload));
});

router.patch("/groups/:groupId/settings", async (req: AdminRequest, res): Promise<void> => {
  const params = UpdateGroupSettingsParams.safeParse(req.params);
  const body = UpdateGroupSettingsBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Ajustes inválidos." });
    return;
  }
  const { db } = await import("@workspace/db");
  const [group] = await db.select().from(telegramGroups).where(eq(telegramGroups.chatId, params.data.groupId)).limit(1);
  if (!group) {
    res.status(404).json({ error: "Grupo no encontrado." });
    return;
  }
  const { enabled, ...settingsUpdate } = body.data;
  if (enabled !== undefined) {
    await db.update(telegramGroups).set({ enabled }).where(eq(telegramGroups.chatId, group.chatId));
  }
  await db
    .insert(groupSettings)
    .values({ groupId: group.chatId, ...settingsUpdate, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: groupSettings.groupId,
      set: { ...settingsUpdate, updatedAt: new Date() },
    });
  const [settings] = await db.select().from(groupSettings).where(eq(groupSettings.groupId, group.chatId)).limit(1);
  const output = {
    groupId: group.chatId,
    enabled: enabled ?? group.enabled,
    aiEnabled: settings?.aiEnabled ?? true,
    moderationEnabled: settings?.moderationEnabled ?? true,
    antiFloodEnabled: settings?.antiFloodEnabled ?? true,
    welcomeText: settings?.welcomeText ?? "",
    goodbyeText: settings?.goodbyeText ?? "",
  };
  await recordActivity("group_settings_update", `Ajustes actualizados para ${group.title}`, req.kaguyaAdmin ?? null, group.chatId);
  res.json(UpdateGroupSettingsResponse.parse(output));
});

router.get("/groups/:groupId/filters", async (req, res): Promise<void> => {
  const groupId = String(req.params.groupId ?? "");
  if (!/^-?\d+$/.test(groupId)) { res.status(400).json({ error: "Identificador de grupo inválido." }); return; }
  const { db } = await import("@workspace/db");
  const rows = await db.select().from(groupFilters).where(eq(groupFilters.groupId, groupId)).orderBy(desc(groupFilters.createdAt));
  res.json(rows);
});

router.post("/groups/:groupId/filters", async (req: AdminRequest, res): Promise<void> => {
  const groupId = String(req.params.groupId ?? "");
  const body = req.body as Record<string, unknown>;
  const pattern = typeof body.pattern === "string" ? body.pattern.trim() : "";
  const isException = body.isException === true;
  if (!/^-?\d+$/.test(groupId) || !pattern || pattern.length > 120 || /[\r\n]/.test(pattern) || (body.isException !== undefined && typeof body.isException !== "boolean")) {
    res.status(400).json({ error: "Filtro inválido. Usa un término literal de hasta 120 caracteres." }); return;
  }
  const { db } = await import("@workspace/db");
  const [group] = await db.select({ chatId: telegramGroups.chatId }).from(telegramGroups).where(eq(telegramGroups.chatId, groupId)).limit(1);
  if (!group) { res.status(404).json({ error: "Grupo no encontrado." }); return; }
  const [created] = await db.insert(groupFilters).values({ groupId, pattern, isException, enabled: body.enabled !== false }).returning();
  await recordActivity("filter_create", `${isException ? "Excepción" : "Filtro"} agregada al grupo`, req.kaguyaAdmin ?? null, groupId);
  res.status(201).json(created);
});

router.delete("/groups/:groupId/filters/:filterId", async (req: AdminRequest, res): Promise<void> => {
  const groupId = String(req.params.groupId ?? "");
  const filterId = String(req.params.filterId ?? "");
  if (!/^-?\d+$/.test(groupId) || !/^[0-9a-f-]{36}$/i.test(filterId)) { res.status(400).json({ error: "Identificadores inválidos." }); return; }
  const { db } = await import("@workspace/db");
  const [deleted] = await db.delete(groupFilters).where(and(eq(groupFilters.groupId, groupId), eq(groupFilters.id, filterId))).returning({ id: groupFilters.id });
  if (!deleted) { res.status(404).json({ error: "Filtro no encontrado." }); return; }
  await recordActivity("filter_delete", "Filtro eliminado", req.kaguyaAdmin ?? null, groupId);
  res.json({ deleted: true, id: deleted.id });
});

router.get("/clients", async (_req, res): Promise<void> => {
  const { db } = await import("@workspace/db");
  const rows = await db.select().from(clients).orderBy(desc(clients.createdAt)).limit(1000);
  const nowParts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  const year = Number(nowParts.find((part) => part.type === "year")?.value);
  const month = Number(nowParts.find((part) => part.type === "month")?.value);
  const currentPeriod = `${year}-${String(month).padStart(2, "0")}`;
  const [payments, invoices] = await Promise.all([
    db.select({ clientId: clientPayments.clientId, paidCents: sql<number>`coalesce(sum(${clientPayments.amountCents}), 0)::int` })
      .from(clientPayments).where(eq(clientPayments.period, currentPeriod)).groupBy(clientPayments.clientId),
    db.select().from(rentInvoices).where(eq(rentInvoices.period, currentPeriod)),
  ]);
  const paymentByClient = new Map(payments.map((row) => [row.clientId, Number(row.paidCents ?? 0)]));
  const invoiceByClient = new Map(invoices.map((row) => [row.clientId, row]));
  res.json(rows.map((client) => {
    const invoice = invoiceByClient.get(client.id);
    const dueAmountCents = invoice?.amountCents ?? client.rentAmountCents;
    const paidCents = paymentByClient.get(client.id) ?? 0;
    return { ...client, currentPeriod, currentDueAt: invoice?.dueAt ?? null, currentPaidCents: paidCents,
      currentBalanceCents: Math.max(0, dueAmountCents - paidCents), currentOverpaymentCents: Math.max(0, paidCents - dueAmountCents) };
  }));
});

router.get("/clients/:clientId/rent", async (req, res): Promise<void> => {
  const clientId = String(req.params.clientId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(clientId)) { res.status(400).json({ error: "Identificador de cliente inválido." }); return; }
  const { db } = await import("@workspace/db");
  const [client] = await db.select({ id: clients.id }).from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!client) { res.status(404).json({ error: "Cliente no encontrado." }); return; }
  const [invoices, payments] = await Promise.all([
    db.select().from(rentInvoices).where(eq(rentInvoices.clientId, clientId)).orderBy(desc(rentInvoices.period)).limit(60),
    db.select({ period: clientPayments.period, paidCents: sql<number>`coalesce(sum(${clientPayments.amountCents}), 0)::int` })
      .from(clientPayments).where(eq(clientPayments.clientId, clientId)).groupBy(clientPayments.period),
  ]);
  const paidByPeriod = new Map(payments.filter((p) => p.period).map((p) => [p.period as string, Number(p.paidCents ?? 0)]));
  res.json(invoices.map((invoice) => { const paidCents = paidByPeriod.get(invoice.period) ?? 0; return { ...invoice, paidCents, balanceCents: Math.max(0, invoice.amountCents - paidCents), overpaymentCents: Math.max(0, paidCents - invoice.amountCents) }; }));
});

router.post("/clients", async (req: AdminRequest, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const amount = body.rentAmountCents === undefined ? 0 : Number(body.rentAmountCents);
  const dueDay = body.dueDay === undefined ? 1 : Number(body.dueDay);
  const telegramChatId = body.telegramChatId == null || body.telegramChatId === "" ? null : String(body.telegramChatId).trim();
  if (!name || name.length > 160 || !Number.isInteger(amount) || amount < 0 || !Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31 || (telegramChatId !== null && !/^-?\d+$/.test(telegramChatId))) {
    res.status(400).json({ error: "Cliente inválido. Comprueba nombre, renta en centavos, día de vencimiento e ID numérico de Telegram." }); return;
  }
  const contact = typeof body.contact === "string" ? body.contact.slice(0, 200) : null;
  const notes = typeof body.notes === "string" ? body.notes.slice(0, 2000) : "";
  const { db } = await import("@workspace/db");
  const [created] = await db.insert(clients).values({ name, rentAmountCents: amount, dueDay, telegramChatId, contact, notes }).returning();
  await recordActivity("client_create", `Cliente creado: ${name}`, req.kaguyaAdmin ?? null);
  res.status(201).json(created);
});

router.patch("/clients/:clientId", async (req: AdminRequest, res): Promise<void> => {
  const clientId = String(req.params.clientId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(clientId)) { res.status(400).json({ error: "Identificador de cliente inválido." }); return; }
  const body = req.body as Record<string, unknown>;
  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) { if (typeof body.name !== "string" || !body.name.trim() || body.name.length > 160) { res.status(400).json({ error: "Nombre inválido." }); return; } update.name = body.name.trim(); }
  if (body.contact !== undefined) { if (body.contact !== null && typeof body.contact !== "string") { res.status(400).json({ error: "Contacto inválido." }); return; } update.contact = body.contact === null ? null : (body.contact as string).slice(0, 200); }
  if (body.notes !== undefined) { if (typeof body.notes !== "string") { res.status(400).json({ error: "Notas inválidas." }); return; } update.notes = body.notes.slice(0, 2000); }
  if (body.telegramChatId !== undefined) { const value = body.telegramChatId == null || body.telegramChatId === "" ? null : String(body.telegramChatId).trim(); if (value !== null && !/^-?\d+$/.test(value)) { res.status(400).json({ error: "telegramChatId debe ser un ID de chat numérico." }); return; } update.telegramChatId = value; }
  if (body.rentAmountCents !== undefined) { const value = Number(body.rentAmountCents); if (!Number.isInteger(value) || value < 0) { res.status(400).json({ error: "La renta debe estar expresada en centavos y no ser negativa." }); return; } update.rentAmountCents = value; }
  if (body.dueDay !== undefined) { const value = Number(body.dueDay); if (!Number.isInteger(value) || value < 1 || value > 31) { res.status(400).json({ error: "El día de vencimiento debe estar entre 1 y 31." }); return; } update.dueDay = value; }
  if (body.status !== undefined) { if (body.status !== "active" && body.status !== "inactive") { res.status(400).json({ error: "Estado de cliente inválido." }); return; } update.status = body.status; }
  const { db } = await import("@workspace/db");
  const [updated] = await db.update(clients).set(update as any).where(eq(clients.id, clientId)).returning();
  if (!updated) { res.status(404).json({ error: "Cliente no encontrado." }); return; }
  await recordActivity("client_update", `Cliente actualizado: ${updated.name}`, req.kaguyaAdmin ?? null);
  res.json(updated);
});

router.get("/clients/:clientId/payments", async (req, res): Promise<void> => {
  const clientId = String(req.params.clientId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(clientId)) { res.status(400).json({ error: "Identificador de cliente inválido." }); return; }
  const { db } = await import("@workspace/db");
  const rows = await db.select().from(clientPayments).where(eq(clientPayments.clientId, clientId)).orderBy(desc(clientPayments.paidAt));
  res.json(rows);
});

router.post("/clients/:clientId/payments", async (req: AdminRequest, res): Promise<void> => {
  const clientId = String(req.params.clientId ?? "");
  const body = req.body as Record<string, unknown>;
  const amountCents = Number(body.amountCents);
  const period = body.period == null || body.period === "" ? null : String(body.period);
  const paidAt = body.paidAt == null ? new Date() : new Date(String(body.paidAt));
  if (!/^[0-9a-f-]{36}$/i.test(clientId) || !Number.isInteger(amountCents) || amountCents <= 0 || !Number.isFinite(paidAt.getTime()) || (period !== null && !/^\d{4}-(0[1-9]|1[0-2])$/.test(period))) {
    res.status(400).json({ error: "Pago inválido. Importe en centavos y período opcional YYYY-MM." }); return;
  }
  const idempotencyKey = body.idempotencyKey == null ? null : String(body.idempotencyKey);
  if (idempotencyKey !== null && !/^[0-9a-f-]{36}$/i.test(idempotencyKey)) { res.status(400).json({ error: "idempotencyKey debe ser un UUID generado por el cliente para evitar pagos duplicados." }); return; }
  const method = typeof body.method === "string" && body.method.trim() ? body.method.trim().slice(0, 40) : "other";
  const notes = typeof body.notes === "string" ? body.notes.slice(0, 1000) : "";
  const { db } = await import("@workspace/db");
  const [client] = await db.select({ id: clients.id, name: clients.name }).from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!client) { res.status(404).json({ error: "Cliente no encontrado." }); return; }
  const paymentValues = { clientId, amountCents, period, method, notes, paidAt, actor: req.kaguyaAdmin ?? null, ...(idempotencyKey ? { idempotencyKey } : {}) };
  const [created] = await db.insert(clientPayments).values(paymentValues).onConflictDoNothing({ target: clientPayments.idempotencyKey }).returning();
  if (!created && idempotencyKey) {
    const [existing] = await db.select().from(clientPayments).where(eq(clientPayments.idempotencyKey, idempotencyKey)).limit(1);
    if (existing && existing.clientId === clientId && existing.amountCents === amountCents && existing.period === period &&
        existing.method === method && existing.notes === notes && existing.paidAt.getTime() === paidAt.getTime()) {
      res.json({ ...existing, duplicate: true }); return;
    }
    res.status(409).json({ error: "La clave de idempotencia ya se usó para otro pago." }); return;
  }
  if (!created) { res.status(409).json({ error: "No se pudo guardar el pago; no se confirmó ninguna operación." }); return; }
  if (period) {
    const [invoice] = await db.select({ amountCents: rentInvoices.amountCents }).from(rentInvoices)
      .where(and(eq(rentInvoices.clientId, clientId), eq(rentInvoices.period, period))).limit(1);
    if (invoice) {
      const [totals] = await db.select({ paidCents: sql<number>`coalesce(sum(${clientPayments.amountCents}), 0)::int` })
        .from(clientPayments).where(and(eq(clientPayments.clientId, clientId), eq(clientPayments.period, period)));
      if (Number(totals?.paidCents ?? 0) >= invoice.amountCents) {
        await db.update(rentInvoices).set({ status: "paid", lastError: null })
          .where(and(eq(rentInvoices.clientId, clientId), eq(rentInvoices.period, period)));
      }
    }
  }
  await recordActivity("client_payment", `Pago registrado para ${client.name}`, req.kaguyaAdmin ?? null);
  res.status(201).json(created);
});

router.get("/templates", async (_req, res): Promise<void> => {
  const { db } = await import("@workspace/db");
  const rows = await db
    .select()
    .from(messageTemplates)
    .where(sql`${messageTemplates.groupId} is null`)
    .orderBy(messageTemplates.type);
  res.json(ListTemplatesResponse.parse(rows));
});

router.put("/templates/:templateType", async (req: AdminRequest, res): Promise<void> => {
  const params = UpdateTemplateParams.safeParse(req.params);
  const body = UpdateTemplateBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Plantilla inválida." });
    return;
  }
  const { db } = await import("@workspace/db");
  const [saved] = await db
    .insert(messageTemplates)
    .values({ type: params.data.templateType, groupId: null, ...body.data, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [messageTemplates.type, messageTemplates.groupId],
      set: { ...body.data, updatedAt: new Date() },
    })
    .returning();
  await recordActivity("template_update", `Plantilla ${params.data.templateType} actualizada`, req.kaguyaAdmin ?? null);
  res.json(UpdateTemplateResponse.parse(saved));
});

router.get("/bot/settings", async (_req, res): Promise<void> => {
  const { db } = await import("@workspace/db");
  await db.insert(botSettings).values({ id: "main" }).onConflictDoNothing();
  const [settings] = await db.select().from(botSettings).where(eq(botSettings.id, "main")).limit(1);
  res.json(
    GetBotSettingsResponse.parse({
      aiEnabled: settings?.aiEnabled ?? true,
      personality: settings?.personality ?? "",
      timezone: settings?.timezone ?? "America/Mexico_City",
      groqConfigured: Boolean(process.env.GROQ_API_KEY),
      telegramConfigured: telegramConfigured(),
    }),
  );
});

router.patch("/bot/settings", async (req: AdminRequest, res): Promise<void> => {
  const body = UpdateBotSettingsBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Ajustes del bot inválidos." });
    return;
  }
  const { db } = await import("@workspace/db");
  await db
    .insert(botSettings)
    .values({ id: "main", ...body.data, updatedAt: new Date() })
    .onConflictDoUpdate({ target: botSettings.id, set: { ...body.data, updatedAt: new Date() } });
  const [settings] = await db.select().from(botSettings).where(eq(botSettings.id, "main")).limit(1);
  const output = {
    aiEnabled: settings?.aiEnabled ?? true,
    personality: settings?.personality ?? "",
    timezone: settings?.timezone ?? "America/Mexico_City",
    groqConfigured: Boolean(process.env.GROQ_API_KEY),
    telegramConfigured: telegramConfigured(),
  };
  await recordActivity("bot_settings_update", "Ajustes generales de Kaguya actualizados", req.kaguyaAdmin ?? null);
  res.json(UpdateBotSettingsResponse.parse(output));
});

router.get("/phrases", async (req, res): Promise<void> => {
  const query = ListPhrasesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Búsqueda de frases inválida." });
    return;
  }
  const { category, search, limit = 100, offset = 0 } = query.data;
  const { db } = await import("@workspace/db");
  const filters = [];
  if (category) filters.push(eq(phrases.category, category));
  if (search) filters.push(ilike(phrases.text, `%${search}%`));
  const rows = await db
    .select()
    .from(phrases)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(phrases.createdAt))
    .limit(limit)
    .offset(offset);
  res.json(ListPhrasesResponse.parse(rows));
});

router.post("/phrases", async (req: AdminRequest, res): Promise<void> => {
  const body = CreatePhraseBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Frase inválida." });
    return;
  }
  const { db } = await import("@workspace/db");
  const duplicate = await db.select({ id: phrases.id }).from(phrases).where(eq(phrases.text, body.data.text)).limit(1);
  if (duplicate.length) {
    res.status(409).json({ error: "Esa frase ya está registrada." });
    return;
  }
  const [created] = await db.insert(phrases).values(body.data).returning();
  await recordActivity("phrase_create", `Frase agregada a ${created.category}`, req.kaguyaAdmin ?? null);
  res.status(201).json(CreatePhraseResponse.parse(created));
});

router.patch("/phrases/:phraseId", async (req: AdminRequest, res): Promise<void> => {
  const phraseId = String(req.params.phraseId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(phraseId)) { res.status(400).json({ error: "Identificador de frase inválido." }); return; }
  const body = req.body as Record<string, unknown>;
  const update: Record<string, unknown> = {};
  if (body.category !== undefined) { if (typeof body.category !== "string" || !body.category.trim() || body.category.length > 80) { res.status(400).json({ error: "Categoría inválida." }); return; } update.category = body.category.trim(); }
  if (body.tone !== undefined) { if (typeof body.tone !== "string" || body.tone.length > 80) { res.status(400).json({ error: "Tono inválido." }); return; } update.tone = body.tone; }
  if (body.text !== undefined) { if (typeof body.text !== "string" || !body.text.trim() || body.text.length > 4000) { res.status(400).json({ error: "Texto inválido." }); return; } update.text = body.text.trim(); }
  if (body.enabled !== undefined) { if (typeof body.enabled !== "boolean") { res.status(400).json({ error: "enabled debe ser booleano." }); return; } update.enabled = body.enabled; }
  if (!Object.keys(update).length) { res.status(400).json({ error: "No hay campos válidos para actualizar." }); return; }
  const { db } = await import("@workspace/db");
  if (typeof update.text === "string") {
    const [duplicate] = await db.select({ id: phrases.id }).from(phrases).where(and(eq(phrases.text, update.text), sql`${phrases.id} <> ${phraseId}`)).limit(1);
    if (duplicate) { res.status(409).json({ error: "Otra frase ya tiene ese texto." }); return; }
  }
  const [updated] = await db.update(phrases).set(update).where(eq(phrases.id, phraseId)).returning();
  if (!updated) { res.status(404).json({ error: "Frase no encontrada." }); return; }
  await recordActivity("phrase_update", `Frase actualizada en ${updated.category}`, req.kaguyaAdmin ?? null);
  res.json(updated);
});

router.delete("/phrases/:phraseId", async (req: AdminRequest, res): Promise<void> => {
  const phraseId = String(req.params.phraseId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(phraseId)) { res.status(400).json({ error: "Identificador de frase inválido." }); return; }
  const { db } = await import("@workspace/db");
  const [deleted] = await db.delete(phrases).where(eq(phrases.id, phraseId)).returning({ id: phrases.id, category: phrases.category });
  if (!deleted) { res.status(404).json({ error: "Frase no encontrada." }); return; }
  await recordActivity("phrase_delete", `Frase eliminada de ${deleted.category}`, req.kaguyaAdmin ?? null);
  res.json({ deleted: true, id: deleted.id });
});

router.get("/gifs", async (_req, res): Promise<void> => {
  const { db } = await import("@workspace/db");
  const rows = await db.select().from(gifRecords).orderBy(desc(gifRecords.createdAt)).limit(200);
  res.json(ListGifsResponse.parse(rows));
});

router.post("/gifs", async (req: AdminRequest, res): Promise<void> => {
  const body = CreateGifBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Registro de GIF inválido." });
    return;
  }
  const { db } = await import("@workspace/db");
  const [created] = await db
    .insert(gifRecords)
    .values(body.data)
    .onConflictDoNothing()
    .returning();
  if (!created) {
    res.status(409).json({ error: "Ese identificador ya está registrado en esa categoría." });
    return;
  }
  await recordActivity("gif_create", `GIF registrado en ${created.category}`, req.kaguyaAdmin ?? null);
  res.status(201).json(CreateGifResponse.parse(created));
});

router.delete("/gifs/:gifId", async (req: AdminRequest, res): Promise<void> => {
  const gifId = String(req.params.gifId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(gifId)) { res.status(400).json({ error: "Identificador de GIF inválido." }); return; }
  const { db } = await import("@workspace/db");
  const [deleted] = await db.delete(gifRecords).where(eq(gifRecords.id, gifId)).returning({ id: gifRecords.id, category: gifRecords.category });
  if (!deleted) { res.status(404).json({ error: "GIF no encontrado." }); return; }
  await recordActivity("gif_delete", `GIF eliminado de ${deleted.category}`, req.kaguyaAdmin ?? null);
  res.json({ deleted: true, id: deleted.id });
});

router.get("/reminders", async (_req, res): Promise<void> => {
  const { db } = await import("@workspace/db");
  const rows = await db.select().from(reminders).orderBy(desc(reminders.dueAt)).limit(200);
  res.json(ListRemindersResponse.parse(rows));
});

router.post("/reminders", async (req: AdminRequest, res): Promise<void> => {
  const body = CreateReminderBody.safeParse(req.body);
  if (!body.success || new Date(body.data.dueAt).getTime() <= Date.now()) {
    res.status(400).json({ error: "El recordatorio debe tener datos válidos y una fecha futura." });
    return;
  }
  const { db } = await import("@workspace/db");
  const [created] = await db.insert(reminders).values({ ...body.data, dueAt: new Date(body.data.dueAt) }).returning();
  await recordActivity("reminder_create", "Recordatorio programado", req.kaguyaAdmin ?? null, created.chatId);
  res.status(201).json(CreateReminderResponse.parse(created));
});

router.delete("/reminders/:reminderId", async (req: AdminRequest, res): Promise<void> => {
  const reminderId = String(req.params.reminderId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(reminderId)) {
    res.status(400).json({ error: "Identificador de recordatorio inválido." });
    return;
  }
  const { db } = await import("@workspace/db");
  const [cancelled] = await db.update(reminders).set({ status: "cancelled", claimedAt: null })
    .where(and(eq(reminders.id, reminderId), eq(reminders.status, "pending")))
    .returning({ id: reminders.id, chatId: reminders.chatId });
  if (!cancelled) {
    res.status(409).json({ error: "El recordatorio no existe, ya se está enviando o ya terminó." });
    return;
  }
  await recordActivity("reminder_cancel", "Recordatorio cancelado", req.kaguyaAdmin ?? null, cancelled.chatId);
  res.json({ cancelled: true, id: cancelled.id });
});

router.post("/reminders/:reminderId/retry", async (req: AdminRequest, res): Promise<void> => {
  const reminderId = String(req.params.reminderId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(reminderId)) {
    res.status(400).json({ error: "Identificador de recordatorio inválido." });
    return;
  }
  const { db } = await import("@workspace/db");
  const [retried] = await db.update(reminders).set({ status: "pending", dueAt: new Date(), attempts: 0, claimedAt: null, lastError: null })
    .where(and(eq(reminders.id, reminderId), eq(reminders.status, "failed")))
    .returning({ id: reminders.id, chatId: reminders.chatId });
  if (!retried) {
    res.status(409).json({ error: "Solo se pueden reintentar recordatorios fallidos. Puede que el mensaje anterior sí haya llegado; compruébalo antes de confirmar el reintento." });
    return;
  }
  await recordActivity("reminder_retry", "Reintento manual de recordatorio fallido", req.kaguyaAdmin ?? null, retried.chatId);
  res.json({ queued: true, id: retried.id, warning: "El recordatorio volvió a la cola; confirma manualmente que el envío anterior no se entregó si el fallo fue ambiguo." });
});

router.get("/events", async (_req, res): Promise<void> => {
  const { db } = await import("@workspace/db");
  const [rows, counts] = await Promise.all([
    db.select().from(kaguyaEvents).orderBy(desc(kaguyaEvents.createdAt)).limit(100),
    db.select({ eventId: eventParticipants.eventId, count: sql<number>`count(*)::int` })
      .from(eventParticipants).groupBy(eventParticipants.eventId),
  ]);
  const countById = new Map(counts.map((row) => [row.eventId, row.count]));
  // Never return the secret seed before a completed draw. The commitment remains
  // visible so participants can record it before registrations close.
  res.json(rows.map((row) => ({
    ...row,
    drawSeed: row.drawAlgorithm && row.winnerUserId ? row.drawSeed : null,
    participantCount: countById.get(row.id) ?? 0,
  })));
});

router.post("/events", async (req: AdminRequest, res): Promise<void> => {
  const body = req.body as Record<string, unknown> | undefined;
  const groupId = typeof body?.groupId === "string" ? body.groupId.trim() : "";
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  const kind = body?.kind === "contest" ? "contest" : body?.kind === "event" ? "event" : null;
  const closeText = typeof body?.closesAt === "string" && body.closesAt.trim() ? body.closesAt : null;
  const closesAt = closeText ? new Date(closeText) : null;
  const recurrenceRule = ["none", "daily", "weekly", "monthly"].includes(String(body?.recurrenceRule ?? "none")) ? String(body?.recurrenceRule ?? "none") : null;
  if (!groupId || title.length < 1 || title.length > 150 || description.length > 2000 || !kind || !recurrenceRule ||
      (closeText && (!closesAt || !Number.isFinite(closesAt.getTime()) || closesAt.getTime() <= Date.now())) ||
      (recurrenceRule !== "none" && !closesAt)) {
    res.status(400).json({ error: "Evento inválido: revisa grupo, título, descripción, tipo, regla de recurrencia y cierre futuro. Los eventos recurrentes necesitan fecha de cierre." });
    return;
  }
  const { db } = await import("@workspace/db");
  const [group] = await db.select({ chatId: telegramGroups.chatId }).from(telegramGroups).where(eq(telegramGroups.chatId, groupId)).limit(1);
  if (!group) { res.status(404).json({ error: "El grupo todavía no ha sido detectado por Kaguya." }); return; }
  const seed = kind === "contest" ? createContestSeed() : null;
  const seedCommitment = seed ? commitContestSeed(seed) : null;
  const [created] = await db.insert(kaguyaEvents).values({
    groupId, title, description, kind, status: "open", closesAt, createdBy: req.kaguyaAdmin ?? null, recurrenceRule,
    ...(seed ? { drawSeed: seed, drawSeedCommitment: seedCommitment } : {}),
  }).returning();
  await recordActivity(kind === "contest" ? "contest_create" : "event_create", `${title} creado`, req.kaguyaAdmin ?? null, groupId);
  // Publish the SHA-256 commitment, not the secret seed. If the announcement
  // fails, the bot command /evento <id> still exposes the commitment.
  if (seedCommitment) {
    try { await sendTelegramMessage(groupId, `🎟️ Concurso creado: ${title}\nID: ${created.id.slice(0, 8)}\nCompromiso previo de semilla SHA-256: ${seedCommitment}\nGuarda este hash para verificar el sorteo después del cierre. Usa /evento ${created.id.slice(0, 8)} para consultarlo.`); }
    catch (error) { logger.warn({ eventId: created.id, error: error instanceof Error ? error.message : "unknown" }, "Contest created but commitment announcement failed"); }
  }
  res.status(201).json({ ...created, drawSeed: null, participantCount: 0 });
});

router.get("/events/:eventId/participants", async (req, res): Promise<void> => {
  const eventId = String(req.params.eventId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) { res.status(400).json({ error: "Identificador de evento inválido." }); return; }
  const { db } = await import("@workspace/db");
  const participants = await db.select().from(eventParticipants).where(eq(eventParticipants.eventId, eventId)).orderBy(desc(eventParticipants.joinedAt)).limit(500);
  res.json(participants);
});

router.post("/events/:eventId/close", async (req: AdminRequest, res): Promise<void> => {
  const eventId = String(req.params.eventId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) { res.status(400).json({ error: "Identificador de evento inválido." }); return; }
  const winnerUserId = typeof req.body?.winnerUserId === "string" && /^\d{1,24}$/.test(req.body.winnerUserId) ? req.body.winnerUserId : null;
  if (req.body?.winnerUserId != null && !winnerUserId) { res.status(400).json({ error: "El ID del ganador debe ser un ID numérico de Telegram." }); return; }
  const { db } = await import("@workspace/db");
  const [event] = await db.select().from(kaguyaEvents).where(eq(kaguyaEvents.id, eventId)).limit(1);
  if (!event) { res.status(404).json({ error: "No se encontró el evento." }); return; }
  if (event.status !== "open") { res.status(409).json({ error: "El evento ya está cerrado." }); return; }
  if (winnerUserId && event.kind !== "contest") {
    res.status(400).json({ error: "Solo los concursos pueden registrar un ganador." });
    return;
  }
  if (winnerUserId) {
    const [participant] = await db.select({ userId: eventParticipants.userId }).from(eventParticipants)
      .where(and(eq(eventParticipants.eventId, event.id), eq(eventParticipants.userId, winnerUserId))).limit(1);
    if (!participant) { res.status(400).json({ error: "El ganador debe ser una persona inscrita en el concurso." }); return; }
  }
  const [closed] = await db.update(kaguyaEvents).set({ status: "closed", winnerUserId, closedAt: new Date() })
    .where(and(eq(kaguyaEvents.id, event.id), eq(kaguyaEvents.status, "open"))).returning();
  if (!closed) { res.status(409).json({ error: "El evento cambió de estado y no se pudo cerrar." }); return; }
  await recordActivity(event.kind === "contest" ? "contest_close" : "event_close", `${event.title} cerrado`, req.kaguyaAdmin ?? null, event.groupId);
  res.json({ ...closed, drawSeed: null });
});

router.post("/events/:eventId/draw", async (req: AdminRequest, res): Promise<void> => {
  const eventId = String(req.params.eventId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) { res.status(400).json({ error: "Identificador de evento inválido." }); return; }
  const connection = await pool.connect();
  let event: any;
  let participants: string[] = [];
  let seed = "";
  let participantHash = "";
  let winnerUserId = "";
  const algorithm = DRAW_ALGORITHM;
  try {
    await connection.query("BEGIN");
    const result = await connection.query("SELECT * FROM kaguya_events WHERE id = $1 FOR UPDATE", [eventId]);
    event = result.rows[0];
    if (!event) { await connection.query("ROLLBACK"); res.status(404).json({ error: "No se encontró el evento." }); return; }
    if (event.kind !== "contest" || event.status !== "closed") { await connection.query("ROLLBACK"); res.status(409).json({ error: "El sorteo solo se puede ejecutar en un concurso cerrado." }); return; }
    if (event.draw_algorithm && event.participant_hash && event.winner_user_id) {
      const saved = await connection.query("SELECT user_id FROM kaguya_event_participants WHERE event_id = $1 ORDER BY user_id", [eventId]);
      const savedIds = saved.rows.map((row: { user_id: string }) => String(row.user_id));
      let proofValid = false;
      try {
        const calculatedHash = hashParticipants(savedIds);
        proofValid = Boolean(event.draw_seed && event.draw_seed_commitment &&
          commitContestSeed(String(event.draw_seed)) === String(event.draw_seed_commitment) &&
          calculatedHash === String(event.participant_hash) &&
          savedIds[chooseWinnerIndex(String(event.draw_seed), calculatedHash, savedIds.length)] === String(event.winner_user_id));
      } catch { proofValid = false; }
      if (!proofValid) {
        await connection.query("ROLLBACK");
        res.status(409).json({ error: "El resultado ya guardado no supera la verificación de semilla, padrón y ganador. Se bloqueó el reporte como verificable." });
        return;
      }
      await connection.query("COMMIT");
      res.json({ eventId, winnerUserId: event.winner_user_id, participantUserIds: savedIds, participantHash: event.participant_hash, seed: event.draw_seed, seedCommitment: event.draw_seed_commitment, algorithm: event.draw_algorithm, alreadyDrawn: true, verifiable: true });
      return;
    }
    if (event.winner_user_id) { await connection.query("ROLLBACK"); res.status(409).json({ error: "Ya se asignó manualmente un ganador. No se sobrescribió ni se convirtió en sorteo aleatorio." }); return; }
    if (!event.draw_seed || !event.draw_seed_commitment) {
      await connection.query("ROLLBACK");
      res.status(409).json({ error: "Este concurso es anterior al compromiso previo de semilla. Para no afirmar una verificabilidad que no existe, crea un concurso nuevo para usar el sorteo verificable." });
      return;
    }
    seed = String(event.draw_seed);
    if (commitContestSeed(seed) !== String(event.draw_seed_commitment)) {
      await connection.query("ROLLBACK");
      res.status(409).json({ error: "La semilla no coincide con el compromiso registrado al crear el concurso. El sorteo se bloqueó por integridad." });
      return;
    }
    const roster = await connection.query("SELECT user_id FROM kaguya_event_participants WHERE event_id = $1 ORDER BY user_id", [eventId]);
    participants = roster.rows.map((row: { user_id: string }) => String(row.user_id));
    if (!participants.length) { await connection.query("ROLLBACK"); res.status(409).json({ error: "No se puede sortear un concurso sin participantes." }); return; }
    participantHash = hashParticipants(participants);
    const winnerIndex = chooseWinnerIndex(seed, participantHash, participants.length);
    winnerUserId = participants[winnerIndex];
    const updated = await connection.query(
      `UPDATE kaguya_events SET winner_user_id = $2, participant_hash = $3, draw_algorithm = $4
       WHERE id = $1 AND winner_user_id IS NULL AND draw_algorithm IS NULL RETURNING id`,
      [eventId, winnerUserId, participantHash, algorithm],
    );
    if (updated.rowCount !== 1) { await connection.query("ROLLBACK"); res.status(409).json({ error: "El concurso cambió de estado; actualiza e inténtalo de nuevo." }); return; }
    await connection.query("COMMIT");
  } catch (error) {
    try { await connection.query("ROLLBACK"); } catch { /* retain original failure */ }
    throw error;
  } finally { connection.release(); }
  await recordActivity("contest_draw", `Sorteo verificable ejecutado para ${event.title}`, req.kaguyaAdmin ?? null, event.group_id);
  try {
    await sendTelegramMessage(event.group_id, `🎉 Sorteo verificado de «${event.title}»\nGanador: ID de Telegram ${winnerUserId}\nParticipantes: ${participants.length}\nHash del padrón: ${participantHash}\nAlgoritmo: ${algorithm}\nSemilla revelada: ${seed}\nLa lista ordenada de IDs se puede recuperar desde el panel para reproducir el cálculo.`);
  } catch (error) { logger.warn({ eventId, error: error instanceof Error ? error.message : "unknown" }, "Sorteo saved but Telegram announcement failed"); }
  res.json({ eventId, winnerUserId, participantUserIds: participants, participantHash, seed, seedCommitment: commitContestSeed(seed), algorithm, alreadyDrawn: false });
});

router.get("/events/:eventId/draw-proof", async (req, res): Promise<void> => {
  const eventId = String(req.params.eventId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) { res.status(400).json({ error: "Identificador de evento inválido." }); return; }
  const { db } = await import("@workspace/db");
  const [event] = await db.select().from(kaguyaEvents).where(eq(kaguyaEvents.id, eventId)).limit(1);
  if (!event || event.kind !== "contest") { res.status(404).json({ error: "No se encontró el concurso." }); return; }
  const participants = await db.select({ userId: eventParticipants.userId }).from(eventParticipants)
    .where(eq(eventParticipants.eventId, eventId)).orderBy(eventParticipants.userId);
  const participantUserIds = participants.map((row) => String(row.userId));
  const hasDraw = Boolean(event.drawSeed && event.drawSeedCommitment && event.participantHash && event.drawAlgorithm && event.winnerUserId);
  let verifiable = false;
  if (hasDraw) {
    try {
      const calculatedHash = hashParticipants(participantUserIds);
      verifiable = commitContestSeed(String(event.drawSeed)) === event.drawSeedCommitment &&
        calculatedHash === event.participantHash &&
        participantUserIds[chooseWinnerIndex(String(event.drawSeed), calculatedHash, participantUserIds.length)] === String(event.winnerUserId);
    } catch { verifiable = false; }
  }
  res.json({ eventId, winnerUserId: event.winnerUserId, participantUserIds, participantHash: event.participantHash,
    seed: hasDraw ? event.drawSeed : null, seedCommitment: event.drawSeedCommitment, algorithm: event.drawAlgorithm, verifiable });
});

router.patch("/events/:eventId/winner", async (req: AdminRequest, res): Promise<void> => {
  const eventId = String(req.params.eventId ?? "");
  const winnerUserId = typeof req.body?.winnerUserId === "string" && /^\d{1,24}$/.test(req.body.winnerUserId) ? req.body.winnerUserId : null;
  if (!/^[0-9a-f-]{36}$/i.test(eventId) || !winnerUserId) {
    res.status(400).json({ error: "Indica un evento válido y un ID numérico del ganador." });
    return;
  }
  const { db } = await import("@workspace/db");
  const [event] = await db.select().from(kaguyaEvents).where(eq(kaguyaEvents.id, eventId)).limit(1);
  if (!event) { res.status(404).json({ error: "No se encontró el evento." }); return; }
  if (event.kind !== "contest" || event.status !== "closed") {
    res.status(409).json({ error: "Solo puedes registrar el ganador de un concurso cerrado." });
    return;
  }
  if (event.winnerUserId || event.drawAlgorithm) {
    res.status(409).json({ error: "El concurso ya tiene un resultado. No se permite sobrescribir un ganador ni invalidar un sorteo." });
    return;
  }
  const [participant] = await db.select({ userId: eventParticipants.userId }).from(eventParticipants)
    .where(and(eq(eventParticipants.eventId, event.id), eq(eventParticipants.userId, winnerUserId))).limit(1);
  if (!participant) { res.status(400).json({ error: "El ganador debe ser una persona inscrita en el concurso." }); return; }
  const [updated] = await db.update(kaguyaEvents).set({ winnerUserId })
    .where(and(eq(kaguyaEvents.id, event.id), eq(kaguyaEvents.status, "closed"), eq(kaguyaEvents.kind, "contest"), isNull(kaguyaEvents.winnerUserId), isNull(kaguyaEvents.drawAlgorithm))).returning();
  if (!updated) { res.status(409).json({ error: "No se pudo guardar el resultado; actualiza la página." }); return; }
  await recordActivity("contest_winner_set", `Ganador registrado para ${event.title}`, req.kaguyaAdmin ?? null, event.groupId);
  res.json(updated);
});

const BACKUP_TABLES = [
  { name: "kaguya_groups", columns: ["chat_id", "title", "member_count", "enabled", "last_seen_at"], required: ["chat_id", "title"] },
  { name: "kaguya_group_settings", columns: ["group_id", "ai_enabled", "moderation_enabled", "anti_flood_enabled", "welcome_text", "goodbye_text", "updated_at"], required: ["group_id"] },
  { name: "kaguya_group_members", columns: ["chat_id", "user_id", "username", "full_name", "status", "last_seen_at"], required: ["chat_id", "user_id", "full_name"] },
  { name: "kaguya_sanctions", columns: ["id", "group_id", "user_id", "username", "action", "status", "reason", "actor", "permissions_snapshot", "previous_until_date", "previous_status", "created_at", "expires_at", "restored_at"], required: ["id", "group_id", "user_id", "action", "status"] },
  { name: "kaguya_message_templates", columns: ["type", "group_id", "text", "image_file_id", "updated_at"], required: ["type", "text"] },
  { name: "kaguya_bot_settings", columns: ["id", "ai_enabled", "personality", "timezone", "updated_at"], required: ["id"] },
  { name: "kaguya_phrases", columns: ["id", "category", "tone", "text", "enabled", "seed_key", "created_at"], required: ["category", "text"] },
  { name: "kaguya_gifs", columns: ["id", "category", "file_id", "usage_count", "created_at"], required: ["category", "file_id"] },
  { name: "kaguya_reminders", columns: ["id", "chat_id", "text", "due_at", "status", "attempts", "claimed_at", "last_error", "created_at", "sent_at"], required: ["chat_id", "text", "due_at", "status"] },
  { name: "kaguya_group_filters", columns: ["id", "group_id", "pattern", "is_exception", "enabled", "created_at"], required: ["group_id", "pattern"] },
  { name: "kaguya_clients", columns: ["id", "name", "contact", "telegram_chat_id", "notes", "rent_amount_cents", "due_day", "status", "created_at", "updated_at"], required: ["id", "name", "rent_amount_cents", "due_day", "status"] },
  { name: "kaguya_client_payments", columns: ["id", "client_id", "amount_cents", "period", "method", "notes", "paid_at", "actor", "idempotency_key"], required: ["id", "client_id", "amount_cents", "idempotency_key"] },
  { name: "kaguya_rent_invoices", columns: ["id", "client_id", "period", "amount_cents", "due_at", "status", "notification_attempts", "last_notification_claimed_at", "last_notification_sent_at", "last_error", "created_at"], required: ["id", "client_id", "period", "amount_cents", "due_at"] },
  { name: "kaguya_conversation_memory", columns: ["chat_id", "user_id", "memory_enabled", "summary", "messages", "updated_at"], required: ["chat_id", "user_id"] },
  { name: "kaguya_events", columns: ["id", "group_id", "title", "description", "kind", "status", "closes_at", "winner_user_id", "created_by", "created_at", "closed_at", "recurrence_rule", "series_id", "recurrence_index", "draw_seed", "draw_seed_commitment", "participant_hash", "draw_algorithm"], required: ["id", "group_id", "title", "kind", "status", "series_id", "recurrence_index"] },
  { name: "kaguya_event_participants", columns: ["event_id", "user_id", "username", "full_name", "joined_at"], required: ["event_id", "user_id", "full_name"] },
  { name: "kaguya_activity_log", columns: ["id", "action", "summary", "actor", "group_id", "created_at"], required: ["id", "action", "summary"] },
];

router.get("/backup/export", async (_req, res): Promise<void> => {
  const tables: Record<string, unknown[]> = {};
  let totalRows = 0;
  for (const definition of BACKUP_TABLES) {
    const { rows } = await pool.query(`SELECT ${definition.columns.join(", ")} FROM ${definition.name}`);
    tables[definition.name] = rows;
    totalRows += rows.length;
  }
  res.setHeader("Cache-Control", "no-store, private");
  res.setHeader("Content-Disposition", `attachment; filename="kaguya-backup-${new Date().toISOString().slice(0,10)}.json"`);
  res.json({ kind: "kaguya-backup", schemaVersion: 1, createdAt: new Date().toISOString(), rowCount: totalRows,
    notice: "Logical additive backup. Rate-limit counters and Telegram polling offset are intentionally excluded. Restoring uses merge-only semantics and never deletes or overwrites existing rows.", tables });
});

router.post("/backup/restore", async (req: AdminRequest, res): Promise<void> => {
  const payload = req.body as { kind?: unknown; schemaVersion?: unknown; tables?: unknown; confirm?: unknown; dryRun?: unknown };
  if (!payload || payload.kind !== "kaguya-backup" || payload.schemaVersion !== 1 || !payload.tables || typeof payload.tables !== "object" || Array.isArray(payload.tables)) {
    res.status(400).json({ error: "Archivo de respaldo inválido o versión no compatible." }); return;
  }
  const sourceTables = payload.tables as Record<string, unknown>;
  const definitions = new Map(BACKUP_TABLES.map((definition) => [definition.name, definition]));
  const unknown = Object.keys(sourceTables).filter((name) => !definitions.has(name));
  if (unknown.length) { res.status(400).json({ error: `El respaldo contiene tablas no permitidas: ${unknown.slice(0,5).join(", ")}.` }); return; }
  let totalRows = 0;
  const validated = new Map<string, Array<Record<string, unknown>>>();
  for (const [tableName, rawRows] of Object.entries(sourceTables)) {
    const definition = definitions.get(tableName)!;
    if (!Array.isArray(rawRows)) { res.status(400).json({ error: `La tabla ${tableName} debe ser una lista.` }); return; }
    totalRows += rawRows.length;
    if (totalRows > 50_000) { res.status(413).json({ error: "El respaldo supera el límite de 50,000 registros por restauración." }); return; }
    const rows: Array<Record<string, unknown>> = [];
    for (const raw of rawRows) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) { res.status(400).json({ error: `La tabla ${tableName} contiene un registro inválido.` }); return; }
      const row = raw as Record<string, unknown>;
      const extra = Object.keys(row).filter((column) => !definition.columns.includes(column));
      const missing = definition.required.filter((column) => !(column in row));
      if (extra.length || missing.length) { res.status(400).json({ error: `Columnas inválidas en ${tableName}; extras: ${extra.slice(0,3).join(",") || "ninguna"}; faltantes: ${missing.join(",") || "ninguna"}.` }); return; }
      rows.push(row);
    }
    validated.set(tableName, rows);
  }
  const report = { validated: true, totalRows, tableCounts: Object.fromEntries([...validated].map(([name, rows]) => [name, rows.length])), mode: "merge-only" };
  if (payload.dryRun !== false || payload.confirm !== true) { res.json({ ...report, dryRun: true, message: "Validación completa; no se modificó la base. Repite enviando dryRun=false y confirm=true para insertar únicamente filas nuevas." }); return; }
  const connection = await pool.connect();
  const imported: Record<string, number> = {};
  try {
    await connection.query("BEGIN");
    for (const definition of BACKUP_TABLES) {
      const rows = validated.get(definition.name) ?? [];
      let count = 0;
      for (const row of rows) {
        const columns = definition.columns.filter((column) => column in row);
        const values = columns.map((column) => row[column]);
        const placeholders = columns.map((_column, index) => `$${index + 1}`);
        if (definition.name === "kaguya_message_templates" && row.group_id == null) {
          const alreadyExists = await connection.query("SELECT 1 FROM kaguya_message_templates WHERE type = $1 AND group_id IS NULL LIMIT 1", [row.type]);
          if (alreadyExists.rowCount) continue;
        }
        const result = await connection.query(
          `INSERT INTO ${definition.name} (${columns.join(",")}) VALUES (${placeholders.join(",")}) ON CONFLICT DO NOTHING`, values,
        );
        count += result.rowCount ?? 0;
      }
      imported[definition.name] = count;
    }
    await connection.query("COMMIT");
  } catch (error) {
    await connection.query("ROLLBACK");
    logger.error({ error: error instanceof Error ? error.message : "unknown" }, "Backup restore transaction rolled back");
    res.status(400).json({ error: "Restauración cancelada y revertida. Comprueba las dependencias entre los registros y la versión del esquema." }); return;
  } finally { connection.release(); }
  await recordActivity("backup_restore", `Respaldo validado e importado en modo aditivo (${totalRows} filas revisadas)`, req.kaguyaAdmin ?? null);
  res.json({ ...report, dryRun: false, imported, message: "Restauración completada con inserciones nuevas; los registros existentes no se sobrescribieron ni borraron." });
});

router.get("/activity", async (req, res): Promise<void> => {
  const query = ListActivityQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Límite de actividad inválido." });
    return;
  }
  const { db } = await import("@workspace/db");
  const rows = await db.select().from(activityLog).orderBy(desc(activityLog.createdAt)).limit(query.data.limit);
  res.json(ListActivityResponse.parse(rows));
});

export default router;
