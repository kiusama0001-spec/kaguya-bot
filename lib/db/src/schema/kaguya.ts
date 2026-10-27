import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const telegramGroups = pgTable("kaguya_groups", {
  chatId: text("chat_id").primaryKey(),
  title: text("title").notNull(),
  memberCount: integer("member_count").notNull().default(0),
  enabled: boolean("enabled").notNull().default(true),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
});

export const groupMembers = pgTable(
  "kaguya_group_members",
  {
    chatId: text("chat_id").notNull().references(() => telegramGroups.chatId, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    username: text("username"),
    fullName: text("full_name").notNull(),
    status: text("status").notNull().default("active"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.chatId, table.userId] }),
    index("kaguya_group_members_search_idx").on(table.chatId, table.username),
  ],
);

export const groupSettings = pgTable("kaguya_group_settings", {
  groupId: text("group_id").primaryKey().references(() => telegramGroups.chatId, { onDelete: "cascade" }),
  aiEnabled: boolean("ai_enabled").notNull().default(true),
  moderationEnabled: boolean("moderation_enabled").notNull().default(true),
  antiFloodEnabled: boolean("anti_flood_enabled").notNull().default(true),
  welcomeText: text("welcome_text").notNull().default(""),
  goodbyeText: text("goodbye_text").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sanctions = pgTable(
  "kaguya_sanctions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    groupId: text("group_id").notNull().references(() => telegramGroups.chatId, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    username: text("username"),
    action: text("action").notNull(),
    status: text("status").notNull().default("active"),
    reason: text("reason"),
    actor: text("actor"),
    permissionsSnapshot: jsonb("permissions_snapshot").$type<Record<string, boolean> | null>(),
    previousUntilDate: integer("previous_until_date"),
    previousStatus: text("previous_status"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    restoredAt: timestamp("restored_at", { withTimezone: true }),
  },
  (table) => [
    index("kaguya_sanctions_group_status_idx").on(table.groupId, table.status, table.createdAt),
    index("kaguya_sanctions_expiry_idx").on(table.status, table.expiresAt),
  ],
);

export const messageTemplates = pgTable(
  "kaguya_message_templates",
  {
    type: text("type").notNull(),
    groupId: text("group_id").references(() => telegramGroups.chatId, { onDelete: "cascade" }),
    text: text("text").notNull().default(""),
    imageFileId: text("image_file_id"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("kaguya_message_templates_scope_idx").on(table.type, table.groupId)],
);

export const botSettings = pgTable("kaguya_bot_settings", {
  id: text("id").primaryKey().default("main"),
  aiEnabled: boolean("ai_enabled").notNull().default(true),
  personality: text("personality").notNull().default(""),
  timezone: text("timezone").notNull().default("America/Mexico_City"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const phrases = pgTable(
  "kaguya_phrases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    category: text("category").notNull(),
    tone: text("tone").notNull().default("neutral"),
    text: text("text").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    seedKey: text("seed_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("kaguya_phrases_category_idx").on(table.category, table.enabled),
    uniqueIndex("kaguya_phrases_seed_key_uidx").on(table.seedKey),
  ],
);

export const gifRecords = pgTable(
  "kaguya_gifs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    category: text("category").notNull(),
    fileId: text("file_id").notNull(),
    usageCount: integer("usage_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("kaguya_gifs_category_file_idx").on(table.category, table.fileId)],
);

export const reminders = pgTable(
  "kaguya_reminders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    chatId: text("chat_id").notNull(),
    text: text("text").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (table) => [index("kaguya_reminders_due_idx").on(table.status, table.dueAt)],
);

export const groupFilters = pgTable(
  "kaguya_group_filters",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    groupId: text("group_id").notNull().references(() => telegramGroups.chatId, { onDelete: "cascade" }),
    pattern: text("pattern").notNull(),
    isException: boolean("is_exception").notNull().default(false),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("kaguya_group_filters_lookup_idx").on(table.groupId, table.enabled)],
);

export const clients = pgTable(
  "kaguya_clients",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    contact: text("contact"),
    telegramChatId: text("telegram_chat_id"),
    notes: text("notes").notNull().default(""),
    rentAmountCents: integer("rent_amount_cents").notNull().default(0),
    dueDay: integer("due_day").notNull().default(1),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("kaguya_clients_status_due_idx").on(table.status, table.dueDay)],
);

export const clientPayments = pgTable(
  "kaguya_client_payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    period: text("period"),
    method: text("method").notNull().default("other"),
    notes: text("notes").notNull().default(""),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
    actor: text("actor"),
    idempotencyKey: uuid("idempotency_key").notNull().defaultRandom(),
  },
  (table) => [
    index("kaguya_client_payments_client_paid_idx").on(table.clientId, table.paidAt),
    uniqueIndex("kaguya_client_payments_idempotency_idx").on(table.idempotencyKey),
  ],
);

export const activityLog = pgTable(
  "kaguya_activity_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    action: text("action").notNull(),
    summary: text("summary").notNull(),
    actor: text("actor"),
    groupId: text("group_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("kaguya_activity_created_idx").on(table.createdAt)],
);

export const conversationMemory = pgTable(
  "kaguya_conversation_memory",
  {
    chatId: text("chat_id").notNull(),
    userId: text("user_id").notNull(),
    memoryEnabled: boolean("memory_enabled").notNull().default(false),
    summary: text("summary").notNull().default(""),
    messages: jsonb("messages").$type<Array<{ role: "user" | "assistant"; content: string }>>().notNull().default([]),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.chatId, table.userId] })],
);

export const botRuntime = pgTable("kaguya_bot_runtime", {
  id: text("id").primaryKey().default("poller"),
  nextUpdateOffset: integer("next_update_offset").notNull().default(0),
  lastSuccessfulPollAt: timestamp("last_successful_poll_at", { withTimezone: true }),
});


export const kaguyaEvents = pgTable(
  "kaguya_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    groupId: text("group_id").notNull().references(() => telegramGroups.chatId, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    kind: text("kind").notNull().default("event"),
    status: text("status").notNull().default("open"),
    closesAt: timestamp("closes_at", { withTimezone: true }),
    winnerUserId: text("winner_user_id"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    recurrenceRule: text("recurrence_rule").notNull().default("none"),
    seriesId: uuid("series_id").notNull().defaultRandom(),
    recurrenceIndex: integer("recurrence_index").notNull().default(0),
    drawSeed: text("draw_seed"),
    drawSeedCommitment: text("draw_seed_commitment"),
    participantHash: text("participant_hash"),
    drawAlgorithm: text("draw_algorithm"),
  },
  (table) => [
    index("kaguya_events_group_status_idx").on(table.groupId, table.status, table.closesAt),
    uniqueIndex("kaguya_events_series_index_idx").on(table.seriesId, table.recurrenceIndex),
  ],
);

export const eventParticipants = pgTable(
  "kaguya_event_participants",
  {
    eventId: uuid("event_id").notNull().references(() => kaguyaEvents.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    username: text("username"),
    fullName: text("full_name").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.eventId, table.userId] }),
    index("kaguya_event_participants_user_idx").on(table.userId, table.joinedAt),
  ],
);


export const rentInvoices = pgTable(
  "kaguya_rent_invoices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    period: text("period").notNull(),
    amountCents: integer("amount_cents").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("open"),
    notificationAttempts: integer("notification_attempts").notNull().default(0),
    lastNotificationClaimedAt: timestamp("last_notification_claimed_at", { withTimezone: true }),
    lastNotificationSentAt: timestamp("last_notification_sent_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("kaguya_rent_invoices_client_period_idx").on(table.clientId, table.period),
    index("kaguya_rent_invoices_due_idx").on(table.status, table.dueAt),
  ],
);
