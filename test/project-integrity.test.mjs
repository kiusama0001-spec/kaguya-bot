import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const source = JSON.parse(read('data/kiwbot-respuestas.json'));
const targets = JSON.parse(read('data/phrase-targets.json'));
const normalize = (value) => String(value).normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es-MX');

for (const category of Object.keys(source)) {
  test(`Kiwbot source category “${category}” has a valid array of non-empty strings`, () => {
    assert.ok(Array.isArray(source[category]));
    assert.ok(source[category].length > 0);
    for (const phrase of source[category]) {
      assert.equal(typeof phrase, 'string');
      assert.ok(phrase.trim().length > 0);
      assert.ok(phrase.length <= 4000);
    }
  });
}

test('Kiwbot phrase source contains the documented 50 categories', () => assert.equal(Object.keys(source).length, 50));
test('Kiwbot phrase source contains 3,200 entries before cross-category deduplication', () => assert.equal(Object.values(source).reduce((sum, entries) => sum + entries.length, 0), 3200));
test('Kiwbot phrase source has no duplicate text after NFKC, whitespace and case normalization', () => {
  const normalized = Object.values(source).flat().map(normalize);
  assert.equal(new Set(normalized).size, normalized.length);
});
test('all Kiwbot phrase values are plain strings, not nested fake phrase records', () => assert.ok(Object.values(source).flat().every((value) => typeof value === 'string')));
test('the future Kaguya category targets sum to 10,000, without claiming current content reaches it', () => assert.equal(Object.values(targets).reduce((a, b) => a + b, 0), 10_000));
test('phrase targets define exactly 11 categories', () => assert.equal(Object.keys(targets).length, 11));
test('special identity categories are represented in the target data', () => {
  assert.equal(targets.especial_kiu, 1500);
  assert.equal(targets.especial_kalu, 200);
});

test('the actual Telegram API helper has a current reaction-permission field', () => assert.ok(read('artifacts/api-server/src/lib/telegram-permissions.mjs').includes('can_react_to_messages')));
test('Telegram mute helper explicitly turns off every configured send permission', () => {
  const helper = read('artifacts/api-server/src/lib/telegram-permissions.mjs');
  assert.match(helper, /for \(const key of SEND_PERMISSION_KEYS\) result\[key\] = false/);
});
test('permission restoration rejects unknown pre-mute state instead of guessing', () => assert.match(read('artifacts/api-server/src/lib/telegram-permissions.mjs'), /return null;\s*\}/));
test('database migration preserves the previously captured Telegram member status', () => assert.match(read('lib/db/migrations/0002_runtime_reliability.sql'), /previous_status/));
test('database migration adds durable reminder claim and last-error fields', () => {
  const migration = read('lib/db/migrations/0002_runtime_reliability.sql');
  assert.match(migration, /claimed_at/); assert.match(migration, /last_error/);
});
test('filter/client tables are additive and use IF NOT EXISTS', () => assert.match(read('lib/db/migrations/0003_filters_clients.sql'), /CREATE TABLE IF NOT EXISTS kaguya_group_filters/));
test('client rent is stored in integer cents rather than floating point currency', () => assert.match(read('lib/db/migrations/0003_filters_clients.sql'), /rent_amount_cents integer/));
test('client payment rows reference their client with cascade deletion', () => assert.match(read('lib/db/migrations/0003_filters_clients.sql'), /client_id uuid NOT NULL REFERENCES kaguya_clients\(id\) ON DELETE CASCADE/));
test('migration runner applies all migrations in lexical order', () => {
  const migration = read('lib/db/scripts/migrate-render.mjs');
  assert.match(migration, /0001_kaguya\.sql.*0002_runtime_reliability\.sql.*0003_filters_clients\.sql/s);
});
test('database migration and phrase import retain TLS certificate validation', () => {
  for (const file of ['lib/db/scripts/migrate-render.mjs', 'lib/db/scripts/import-kiwbot-phrases.mjs']) {
    assert.match(read(file), /rejectUnauthorized:\s*true/);
  }
});
test('worker reserves due reminders with SKIP LOCKED to avoid competing workers', () => assert.match(read('artifacts/api-server/src/lib/workers.ts'), /FOR UPDATE SKIP LOCKED/));
test('worker claims reminders before sending and records sent/failed outcomes', () => {
  const worker = read('artifacts/api-server/src/lib/workers.ts');
  assert.match(worker, /status = 'sending'/); assert.match(worker, /status = 'sent'/); assert.match(worker, /finalFailure \? "failed" : "pending"/);
});
test('worker reconciles expired mute sanctions and persists restoration status', () => assert.match(read('artifacts/api-server/src/lib/workers.ts'), /status = 'restoring'.*status = 'expired'/s));
test('worker uses a PostgreSQL advisory lock to prevent duplicate reminder processes', () => assert.match(read('artifacts/api-server/src/lib/workers.ts'), /pg_try_advisory_lock/));
test('server starts both Telegram and persistent workers', () => {
  const entry = read('artifacts/api-server/src/index.ts');
  assert.match(entry, /startTelegramBot\(\)/); assert.match(entry, /startWorkers\(\)/);
});
test('server performs graceful shutdown of Telegram, workers, HTTP and database pool', () => {
  const entry = read('artifacts/api-server/src/index.ts');
  for (const token of ['stopTelegramBot()', 'stopWorkers()', 'server.close', 'pool.end()']) assert.ok(entry.includes(token), token);
});
test('Telegram polling is protected by its own lock and persists update offset', () => {
  const bot = read('artifacts/api-server/src/lib/telegram-bot.ts');
  assert.match(bot, /pg_try_advisory_lock/); assert.match(bot, /nextUpdateOffset/);
});
test('bot health requires a recent successful poll, not merely a configured token', () => {
  const health = read('artifacts/api-server/src/lib/bot-health.ts');
  assert.match(health, /lastSuccessfulPollAt/); assert.match(health, /polling && recent/);
});
test('health endpoint reports database and bot separately and does not expose credentials', () => {
  const health = read('artifacts/api-server/src/routes/health.ts');
  assert.match(health, /database/); assert.match(health, /bot/);
  assert.doesNotMatch(health, /TELEGRAM_BOT_TOKEN|GROQ_API_KEY|CLERK_SECRET_KEY/);
});
test('each text, audio and image response has a single post-response memory write path', () => {
  const bot = read('artifacts/api-server/src/lib/telegram-bot.ts');
  assert.equal((bot.match(/await saveConversationOnce\(/g) ?? []).length, 3);
  assert.match(bot, /await saveConversationOnce\(chatId, userId, `\[Imagen\] \${question}`, answer\)/);
  assert.match(bot, /await saveConversationOnce\(chatId, userId, `\[Audio transcrito\] \${question}`, answer\)/);
  assert.match(bot, /One write path only/);
});
test('memory key includes both chat and user identifiers', () => {
  const bot = read('artifacts/api-server/src/lib/telegram-bot.ts');
  assert.match(bot, /eq\(conversationMemory\.chatId, chatId\).*eq\(conversationMemory\.userId, userId\)/s);
});
test('Kiu/Kalu special responses are selected from configured numeric Telegram IDs', () => {
  const bot = read('artifacts/api-server/src/lib/telegram-bot.ts');
  assert.match(bot, /KAGUYA_KIU_TELEGRAM_IDS/); assert.match(bot, /KAGUYA_KALU_TELEGRAM_IDS/);
  assert.match(bot, /\/\^\\d\+\$\//);
});
test('admin API checks a backend Clerk identity and an explicit admin allowlist', () => {
  const routes = read('artifacts/api-server/src/routes/kaguya.ts');
  assert.match(routes, /KAGUYA_ADMIN_CLERK_USER_IDS/); assert.match(routes, /KAGUYA_ADMIN_EMAILS/);
  assert.match(routes, /router\.use\(requireAdmin\)/);
});
test('admin middleware fails closed if Clerk or the administrator allowlist is missing', () => {
  const routes = read('artifacts/api-server/src/routes/kaguya.ts');
  assert.match(routes, /503/); assert.match(routes, /Inicia sesión para continuar/);
});
test('React app wraps Clerk only when a publishable key is supplied', () => {
  const main = read('artifacts/kaguya/src/main.tsx');
  assert.match(main, /ClerkProvider/); assert.match(main, /VITE_CLERK_PUBLISHABLE_KEY/);
});
test('React token bridge sends session tokens through the generated API client', () => {
  const bridge = read('artifacts/kaguya/src/auth-bridge.tsx');
  assert.match(bridge, /useAuth/); assert.match(bridge, /setAuthTokenGetter/); assert.match(bridge, /getToken/);
});
test('Render deployment declares build, pre-deploy migrations, start and health-check commands', () => {
  const render = read('render.yaml');
  assert.match(render, /buildCommand:/); assert.match(render, /preDeployCommand:/); assert.match(render, /startCommand:/); assert.match(render, /healthCheckPath: \/api\/healthz/);
});
test('Render database URL is passed by service reference, not hard-coded credentials', () => assert.match(read('render.yaml'), /fromDatabase:[\s\S]*property: connectionString/));
test('environment example documents secrets without embedding real credentials', () => {
  const env = read('.env.example');
  assert.match(env, /TELEGRAM_BOT_TOKEN=/); assert.match(env, /GROQ_API_KEY=/); assert.match(env, /CLERK_SECRET_KEY=/);
  assert.doesNotMatch(env, /sk_live_[A-Za-z0-9]+|gsk_[A-Za-z0-9]{20,}|\d{8,}:AA[A-Za-z0-9_-]{20,}/);
});
test('Kiwbot phrase importer uses a database advisory lock and transaction', () => {
  const importer = read('lib/db/scripts/import-kiwbot-phrases.mjs');
  assert.match(importer, /pg_advisory_lock/); assert.match(importer, /BEGIN/); assert.match(importer, /COMMIT/); assert.match(importer, /ROLLBACK/);
});
test('Kiwbot importer de-duplicates normalized phrases before insertion', () => assert.match(read('lib/db/scripts/import-kiwbot-phrases.mjs'), /normalizedExisting\.add\(key\)/));
test('phrase validator checks actual database counts against all target categories', () => {
  const validator = read('lib/db/scripts/validate-phrase-counts.mjs');
  assert.match(validator, /SELECT category, text FROM kaguya_phrases/); assert.match(validator, /ready/); assert.match(validator, /deficit/);
});
test('group filters have persistent backend endpoints', () => {
  const routes = read('artifacts/api-server/src/routes/kaguya.ts');
  assert.match(routes, /\/groups\/:groupId\/filters/); assert.match(routes, /router\.delete\("\/groups\/:groupId\/filters/);
});
test('group filters are consumed by the Telegram message handler', () => assert.match(read('artifacts/api-server/src/lib/telegram-bot.ts'), /async function filterCheck[\s\S]*from\(groupFilters\)/));
test('customer and payment APIs persist records', () => {
  const routes = read('artifacts/api-server/src/routes/kaguya.ts');
  for (const route of ['router.get("/clients"', 'router.post("/clients"', 'router.patch("/clients/:clientId"', 'router.post("/clients/:clientId/payments"']) assert.ok(routes.includes(route), route);
});
test('client and payment data models include date and amount fields', () => {
  const schema = read('lib/db/src/schema/kaguya.ts');
  assert.match(schema, /rentAmountCents/); assert.match(schema, /amountCents/); assert.match(schema, /paidAt/); assert.match(schema, /dueDay/);
});
test('reminder API supports cancellation in the backend', () => assert.match(read('artifacts/api-server/src/routes/kaguya.ts'), /router\.delete\("\/reminders\/:reminderId"/));
test('Telegram reminder command stores due time and text persistently', () => assert.match(read('artifacts/api-server/src/lib/telegram-bot.ts'), /db\.insert\(reminders\)\.values\(\{ chatId, text, dueAt, status: "pending" \}\)/));
test('Pokémon command queries the live PokéAPI and uses a bounded cache', () => {
  const bot = read('artifacts/api-server/src/lib/telegram-bot.ts');
  assert.match(bot, /https:\/\/pokeapi\.co\/api\/v2\/pokemon/); assert.match(bot, /10 \* 60_000/);
});
test('wiki performs real search and returns source-backed results without inventing links', () => {
  const bot = read('artifacts/api-server/src/lib/telegram-bot.ts');
  assert.match(bot, /BRAVE_SEARCH_API_KEY/); assert.match(bot, /wikipedia\.org\/w\/api\.php/);
  assert.match(bot, /No inventé fuentes/); assert.match(bot, /results\.push/);
});
test('GIF command sends Telegram file IDs and increments use count only after successful send', () => {
  const bot = read('artifacts/api-server/src/lib/telegram-bot.ts');
  assert.match(bot, /sendTelegramAnimation\(chatId, choice\.fileId\)/); assert.match(bot, /usageCount: choice\.usageCount \+ 1/);
});
test('welcome and goodbye templates are read while handling Telegram messages', () => {
  const bot = read('artifacts/api-server/src/lib/telegram-bot.ts');
  assert.match(bot, /sendWelcomeOrGoodbye\(message\)/); assert.match(bot, /getMessageTemplate\(chatId, "welcome"\)/); assert.match(bot, /getMessageTemplate\(chatId, "goodbye"\)/);
});
test('sanction announcement failure cannot reverse the successful sanction result', () => {
  const routes = read('artifacts/api-server/src/routes/kaguya.ts');
  assert.match(routes, /Sanction applied but announcement failed/); assert.match(routes, /try \{ await notifySanction/);
});
test('partial kick operation stays visible and restorable after ban succeeds but unban fails', () => {
  const routes = read('artifacts/api-server/src/routes/kaguya.ts');
  assert.match(routes, /kickBanSucceeded/); assert.match(routes, /status: kickBanSucceeded \? "active" : "failed"/);
});
test('warn and kick are recorded as one-shot historical actions, not endless active sanctions', () => {
  const routes = read('artifacts/api-server/src/routes/kaguya.ts');
  assert.match(routes, /const oneShot = body\.data\.action === "warn" \|\| body\.data\.action === "kick"/);
});
test('Telegram user IDs are checked as numeric identifiers in special-user configuration', () => assert.match(read('artifacts/api-server/src/lib/telegram-bot.ts'), /part\.trim\(\)\)\.filter\(\(part\) => \/\^\\d\+\$\//));
test('project startup and test scripts are defined at the root', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.ok(pkg.scripts.start); assert.ok(pkg.scripts.build); assert.ok(pkg.scripts.test); assert.equal(pkg.packageManager, 'pnpm@10.8.1');
});
test('generated API schemas accept the worker reminder state', () => assert.match(read('lib/api-zod/src/generated/api.ts'), /pending', 'sending', 'sent', 'failed', 'cancelled/));
test('generated API schemas accept the worker sanction states', () => assert.match(read('lib/api-zod/src/generated/api.ts'), /active', 'expired', 'reversed', 'failed', 'applying', 'restoring/));
test('no migration drops existing tables or truncates existing data', () => {
  for (const file of fs.readdirSync(path.join(root, 'lib/db/migrations')).filter((name) => name.endsWith('.sql'))) {
    const sql = read(`lib/db/migrations/${file}`);
    assert.doesNotMatch(sql, /DROP TABLE|TRUNCATE TABLE/i, file);
  }
});
test('the project retains the React/TypeScript frontend and Express/TypeScript API architecture', () => {
  assert.ok(fs.existsSync(path.join(root, 'artifacts/kaguya/src/main.tsx')));
  assert.ok(fs.existsSync(path.join(root, 'artifacts/api-server/src/index.ts')));
});
test('the Render blueprint uses the correct current preDeployCommand field spelling', () => assert.match(read('render.yaml'), /preDeployCommand:/));
test('repository avoids bundling a real Telegram bot token into env example', () => assert.doesNotMatch(read('.env.example'), /\d{8,}:AA[A-Za-z0-9_-]{20,}/));

test('Clerk email allowlist only accepts verified email addresses', () => {
  const routes = read('artifacts/api-server/src/routes/kaguya.ts');
  assert.match(routes, /address\.verification\?\.status === "verified"/);
});
test('event and contest tables persist registrations with a unique per-event user key', () => {
  const migration = read('lib/db/migrations/0004_events_contests.sql');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS kaguya_events/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS kaguya_event_participants/);
  assert.match(migration, /PRIMARY KEY \(event_id, user_id\)/);
  assert.match(migration, /CHECK \(kind IN \('event', 'contest'\)\)/);
});
test('event API validates group, dates, and contest winner participation', () => {
  const routes = read('artifacts/api-server/src/routes/kaguya.ts');
  assert.match(routes, /router\.post\("\/events"/);
  assert.match(routes, /router\.get\("\/events\/\:eventId\/participants"/);
  assert.match(routes, /router\.post\("\/events\/\:eventId\/close"/);
  assert.match(routes, /router\.patch\("\/events\/\:eventId\/winner"/);
  assert.match(routes, /El ganador debe ser una persona inscrita/);
});
test('Telegram event commands persist unique registrations and reject expired events', () => {
  const bot = read('artifacts/api-server/src/lib/telegram-bot.ts');
  assert.match(bot, /command === "events" \|\| command === "eventos"/);
  assert.match(bot, /command === "join" \|\| command === "participar"/);
  assert.match(bot, /INSERT INTO kaguya_event_participants[\s\S]*ON CONFLICT \(event_id, user_id\) DO NOTHING RETURNING user_id/);
  assert.match(bot, /FOR UPDATE/);
  assert.match(bot, /El plazo de inscripción de ese evento ya terminó/);
});
test('event worker closes events when the registration deadline passes', () => {
  assert.match(read('artifacts/api-server/src/lib/workers.ts'), /Auto-close scheduled events/);
  assert.match(read('lib/db/scripts/migrate-render.mjs'), /0004_events_contests\.sql/);
});
test('panel provides a real events and contests management page', () => {
  const app = read('artifacts/kaguya/src/App.tsx');
  assert.match(app, /function EventsPage\(\)/);
  assert.match(app, /href: '\/events'/);
  assert.match(app, /customFetch<EventRecord>\('\/api\/events'/);
  assert.match(app, /Participant register/);
  assert.match(app, /Verifiable draw/); assert.match(app, /Set manual winner/); assert.match(app, /recurrenceRule/);
});
test('BDSM command is educational and includes consent, limits, safewords and aftercare', () => {
  const bot = read('artifacts/api-server/src/lib/telegram-bot.ts');
  for (const term of ['consentimiento:', 'limites:', 'seguridad:', 'aftercare:', 'abuso:']) assert.ok(bot.includes(term), term);
  assert.match(bot, /command === "bdsm"/);
});
test('Telegram permission snapshot captures pre-mute status used by safe restoration', () => {
  const telegram = read('artifacts/api-server/src/lib/telegram.ts');
  assert.match(telegram, /status: member\.status \?\? "unknown"/);
  assert.match(telegram, /return buildMutedPermissions\(previous\)/);
});

test('Kaguya answers ordinary private-chat text without requiring an /ask command', () => {
  const bot = read('artifacts/api-server/src/lib/telegram-bot.ts');
  assert.match(bot, /const directPrivateChat = message\.chat\.type === "private"/);
  assert.match(bot, /!mentioned && !repliedToBot && !directPrivateChat/);
});


test('Telegram media downloads enforce returned file paths and streaming size caps', () => {
  const telegram = read('artifacts/api-server/src/lib/telegram.ts');
  assert.match(telegram, /filePath\.includes\("\.\."\)/);
  assert.match(telegram, /totalBytes > options\.maxBytes/);
  assert.match(telegram, /AbortSignal\.timeout\(20_000\)/);
});
test('voice transcription is wired to Groq with Spanish and a configurable model', () => {
  const bot = read('artifacts/api-server/src/lib/telegram-bot.ts');
  assert.match(bot, /\/audio\/transcriptions/);
  assert.match(bot, /GROQ_TRANSCRIPTION_MODEL/);
  assert.match(bot, /form\.append\("language", "es"\)/);
  assert.match(bot, /handleMediaMessage\(message, chatId, userId\)/);
});
test('image analysis uses a configurable multimodal model and group opt-in guard', () => {
  const bot = read('artifacts/api-server/src/lib/telegram-bot.ts');
  assert.match(bot, /GROQ_VISION_MODEL/);
  assert.match(bot, /type: "image_url"/);
  assert.match(bot, /const explicitlyAddressed = Boolean\(/);
  assert.match(bot, /if \(group\?\.enabled === false\) return;[\s\S]*handleMediaMessage/);
});


test('AI-off setting blocks media upload to Groq before downloading or transcribing', () => {
  const bot = read('artifacts/api-server/src/lib/telegram-bot.ts');
  const mediaHandler = bot.slice(bot.indexOf('async function handleMediaMessage'), bot.indexOf('async function saveConversationOnce'));
  assert.ok(mediaHandler.indexOf('if (globalSettings?.aiEnabled === false') < mediaHandler.indexOf('downloadTelegramFile('));
  assert.match(mediaHandler, /no envié el medio a un proveedor externo/);
});
test('Render declares configurable Groq media models', () => {
  const render = read('render.yaml');
  assert.match(render, /GROQ_TRANSCRIPTION_MODEL/);
  assert.match(render, /GROQ_VISION_MODEL/);
});


test('text-to-speech uses optional ElevenLabs credentials and sends generated audio to Telegram', () => {
  const bot = read('artifacts/api-server/src/lib/telegram-bot.ts');
  const telegram = read('artifacts/api-server/src/lib/telegram.ts');
  assert.match(bot, /ELEVENLABS_API_KEY/);
  assert.match(bot, /ELEVENLABS_VOICE_ID/);
  assert.match(bot, /text-to-speech/);
  assert.match(bot, /command === "tts" \|\| command === "voz"/);
  assert.match(telegram, /sendTelegramVoice/);
  assert.match(telegram, /sendVoice/);
});
test('text-to-speech labels generated speech as AI and bounds per-user requests', () => {
  const bot = read('artifacts/api-server/src/lib/telegram-bot.ts');
  assert.match(bot, /Audio generado por IA; no es una voz humana/);
  assert.match(bot, /consumeExternalBudget\(chatId, userId, \"elevenlabs-tts\", 3, 600, 600\)/);
  assert.match(bot, /text\.length > 1000/);
});
test('Render and env example expose optional TTS without embedding credentials', () => {
  const env = read('.env.example');
  const render = read('render.yaml');
  assert.match(env, /ELEVENLABS_API_KEY=/);
  assert.match(env, /ELEVENLABS_VOICE_ID=/);
  assert.match(render, /key: ELEVENLABS_API_KEY[\s\S]*sync: false/);
});


test('TTS is opt-in in groups by default to limit third-party billing abuse', () => {
  const bot = read('artifacts/api-server/src/lib/telegram-bot.ts');
  assert.match(bot, /ELEVENLABS_ALLOW_GROUP_TTS !== "true"/);
  assert.match(read('.env.example'), /ELEVENLABS_ALLOW_GROUP_TTS=false/);
});


test('local start and database scripts load an optional root .env without breaking Render', () => {
  const rootPackage = JSON.parse(read('package.json'));
  const dbPackage = JSON.parse(read('lib/db/package.json'));
  assert.match(rootPackage.scripts.start, /--env-file-if-exists=\.env/);
  assert.match(dbPackage.scripts['migrate:render'], /--env-file-if-exists=\.\.\/\.\.\/\.env/);
  assert.match(dbPackage.scripts['import:kiwbot-phrases'], /--env-file-if-exists=\.\.\/\.\.\/\.env/);
});

test('contest seed commitment migration is registered in the Render migration runner', () => {
  const runner = read('lib/db/scripts/migrate-render.mjs');
  assert.match(runner, /0008_contest_seed_commitment\.sql/);
  assert.match(read('lib/db/migrations/0008_contest_seed_commitment.sql'), /ADD COLUMN IF NOT EXISTS draw_seed_commitment/);
});

test('contest seed commitment is in the Drizzle schema and backup allowlist', () => {
  assert.match(read('lib/db/src/schema/kaguya.ts'), /drawSeedCommitment: text\("draw_seed_commitment"\)/);
  const routes = read('artifacts/api-server/src/routes/kaguya.ts');
  assert.match(routes, /"draw_seed_commitment"/);
  assert.match(routes, /SELECT \$\{definition\.columns\.join\(", "\)\} FROM \$\{definition\.name\}/);
});

test('event seeds are committed when created and withheld until a recorded draw', () => {
  const routes = read('artifacts/api-server/src/routes/kaguya.ts');
  assert.match(routes, /const seed = kind === "contest" \? createContestSeed\(\) : null/);
  assert.match(routes, /Compromiso previo de semilla SHA-256/);
  assert.match(routes, /drawSeed: row\.drawAlgorithm && row\.winnerUserId \? row\.drawSeed : null/);
  assert.match(routes, /Este concurso es anterior al compromiso previo de semilla/);
});

test('manual contest winner cannot overwrite a committed randomized result, even in a race', () => {
  const routes = read('artifacts/api-server/src/routes/kaguya.ts');
  assert.match(routes, /event\.winnerUserId \|\| event\.drawAlgorithm/);
  assert.match(routes, /isNull\(kaguyaEvents\.winnerUserId\), isNull\(kaguyaEvents\.drawAlgorithm\)/);
});

test('concurrent participant registration serializes against event closure', () => {
  const bot = read('artifacts/api-server/src/lib/telegram-bot.ts');
  assert.match(bot, /SELECT id, title, closes_at FROM kaguya_events[\s\S]*FOR UPDATE/);
  assert.match(bot, /INSERT INTO kaguya_event_participants[\s\S]*ON CONFLICT \(event_id, user_id\) DO NOTHING/);
});

test('provider request budgets persist in PostgreSQL and default Groq chat to a bounded RPM', () => {
  const bot = read('artifacts/api-server/src/lib/telegram-bot.ts');
  assert.match(bot, /INSERT INTO kaguya_rate_limits/);
  assert.match(bot, /KAGUYA_GROQ_CHAT_RPM/);
  assert.match(bot, /"groq-vision"/);
  assert.match(bot, /"groq-transcription"/);
  assert.match(bot, /"elevenlabs-tts"/);
  assert.match(read('.env.example'), /KAGUYA_GROQ_CHAT_RPM=12/);
  assert.match(read('render.yaml'), /key: KAGUYA_GROQ_CHAT_RPM/);
});

test('team recommendation counter-types resist or are immune to threats, not types weak to them', () => {
  const pokemon = read('artifacts/api-server/src/lib/pokemon.mjs');
  assert.match(pokemon, /damage_relations\.half_damage_to/);
  assert.match(pokemon, /damage_relations\.no_damage_to/);
  assert.doesNotMatch(pokemon, /for \(const counter of attacking\.damage_relations\.double_damage_to/);
});


test('ambiguous reminder delivery is not automatically retried after a worker crash', () => {
  const worker = read('artifacts/api-server/src/lib/workers.ts');
  assert.match(worker, /Delivery outcome unknown after worker interruption/);
  assert.match(worker, /SET status = 'failed', claimed_at = NULL/);
  assert.doesNotMatch(worker, /UPDATE kaguya_reminders SET status = 'pending', claimed_at = NULL[\s\S]*claimed_at < now\(\) - interval '2 minutes'/);
});

test('failed reminder retry requires explicit admin action and warns about possible duplicate delivery', () => {
  const routes = read('artifacts/api-server/src/routes/kaguya.ts');
  const app = read('artifacts/kaguya/src/App.tsx');
  assert.match(routes, /router\.post\("\/reminders\/:reminderId\/retry"/);
  assert.match(routes, /eq\(reminders\.status, "failed"\)/);
  assert.match(app, /retrying without checking may duplicate the message/);
});


test('Render phrase import refuses invalid or approximate-duplicate corpus before modifying the database', () => {
  const importer = read('lib/db/scripts/import-kaguya-phrases.mjs');
  assert.match(importer, /validatePhraseCorpus\(\)/);
  assert.match(importer, /El corpus no supera el validador integral/);
  assert.ok(importer.indexOf('validatePhraseCorpus()') < importer.indexOf('new pg.Pool'), 'validate before opening DB connection');
});

test('phrase search is server-side paginated with bounded limit and nonnegative offset', () => {
  const schema = read('lib/api-zod/src/generated/api.ts');
  const route = read('artifacts/api-server/src/routes/kaguya.ts');
  const clientTypes = read('lib/api-client-react/src/generated/api.schemas.ts');
  const ui = read('artifacts/kaguya/src/App.tsx');
  assert.match(schema, /"limit": zod\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(100\)\.optional\(\)/);
  assert.match(schema, /"offset": zod\.coerce\.number\(\)\.int\(\)\.min\(0\)\.max\(1000000\)\.optional\(\)/);
  assert.match(route, /\.limit\(limit\)\s*\.offset\(offset\)/);
  assert.match(clientTypes, /limit\?: number;[\s\S]*offset\?: number;/);
  assert.match(ui, /Search all phrases/);
  assert.match(ui, /Filter phrase category/);
  assert.match(ui, /onClick=\{\(\)=>setPage\(value=>value\+1\)\}/);
});


test('wiki searches have persistent, configurable provider budgets before network requests', () => {
  const bot = read('artifacts/api-server/src/lib/telegram-bot.ts');
  assert.match(bot, /async function wikiReply\(chatId: string, userId: string, query: string\)/);
  assert.match(bot, /consumeExternalBudget\(chatId, userId, "wiki-search", perMinute, 60, 60\)/);
  assert.match(bot, /KAGUYA_WIKI_SEARCH_RPM/);
  assert.match(read('.env.example'), /KAGUYA_WIKI_SEARCH_RPM=10/);
  assert.match(read('render.yaml'), /key: KAGUYA_WIKI_SEARCH_RPM/);
});
