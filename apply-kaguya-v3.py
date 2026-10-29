#!/usr/bin/env python3
"""Prepare Kaguya v3: safer Kiu identity recovery, local conversation and Telegram menu."""
from pathlib import Path

ROOT = Path.cwd()
BOT_PATH = ROOT / "artifacts/api-server/src/lib/telegram-bot.ts"
TEST_PATH = ROOT / "test/project-integrity.test.mjs"
for path in (BOT_PATH, TEST_PATH):
    if not path.exists():
        raise SystemExit(f"Missing required file: {path.relative_to(ROOT)}")

bot = BOT_PATH.read_text(encoding="utf-8")
tests = TEST_PATH.read_text(encoding="utf-8")
applied = []


def replace_exact(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count == 0:
        if new in source:
            applied.append(f"{label} (already applied)")
            return source
        raise RuntimeError(f"Could not find expected code block: {label}. No files were written.")
    if count != 1:
        raise RuntimeError(f"Expected exactly one block for {label}, found {count}. No files were written.")
    applied.append(label)
    return source.replace(old, new, 1)

# The username/display-name fallback is only for conversational personality. Admin controls
# still require the numeric ID, or the exact configured username in a private chat.
bot = replace_exact(bot, '''function specialIdentityCategory(userId: string): "especial_kiu" | "especial_kalu" | null {
  if (configuredIdSet("KAGUYA_KIU_TELEGRAM_IDS").has(userId)) return "especial_kiu";
  if (configuredIdSet("KAGUYA_KALU_TELEGRAM_IDS").has(userId)) return "especial_kalu";
  return null;
}''', '''function specialIdentityCategory(userId: string, username?: string, displayName?: string): "especial_kiu" | "especial_kalu" | null {
  if (configuredIdSet("KAGUYA_KIU_TELEGRAM_IDS").has(userId)) return "especial_kiu";
  if (configuredIdSet("KAGUYA_KALU_TELEGRAM_IDS").has(userId)) return "especial_kalu";
  const configuredUsername = (process.env.KAGUYA_KIU_USERNAME ?? "").replace(/^@/, "").trim().toLowerCase();
  const currentUsername = (username ?? "").replace(/^@/, "").trim().toLowerCase();
  if (configuredUsername && currentUsername && configuredUsername === currentUsername) return "especial_kiu";
  // A display name may personalize chat but must never grant access to owner controls.
  if (/\\bkiu(?:\\s+sama)?\\b/.test(normalizeIntentText(displayName ?? ""))) return "especial_kiu";
  return null;
}''', "recognize Kiu persona across accounts")

bot = replace_exact(bot, '''function specialIdentityInstruction(userId: string): string {
  const category = specialIdentityCategory(userId);''', '''function specialIdentityInstruction(userId: string, username?: string, displayName?: string): string {
  const category = specialIdentityCategory(userId, username, displayName);''', "pass sender identity to persona prompt")

bot = replace_exact(bot, '''async function pickPhrase(userId: string, preferredCategory: string, fallback: string, allowSpecial = true): Promise<string> {
  const special = allowSpecial ? specialIdentityCategory(userId) : null;''', '''async function pickPhrase(userId: string, preferredCategory: string, fallback: string, allowSpecial = true, username?: string, displayName?: string): Promise<string> {
  const special = allowSpecial ? specialIdentityCategory(userId, username, displayName) : null;''', "personal phrase identity fallback")

bot = replace_exact(bot, '''async function generateGroqReply(chatId: string, userId: string, userText: string): Promise<string> {''', '''async function generateGroqReply(chatId: string, userId: string, userText: string, username?: string, displayName?: string): Promise<string> {''', "pass sender identity into AI reply")
bot = replace_exact(bot, '''      specialIdentityInstruction(userId),
      context,''', '''      specialIdentityInstruction(userId, username, displayName),
      context,''', "use Kiu personality in generated replies")

# Insert local conversational engine and menu ahead of the message handler.
local_engine = r'''type LocalKaguyaState = { turns: number; lastTopic: string; lastUserText: string; lastAnswer: string };
const localKaguyaStates = new Map<string, LocalKaguyaState>();

function isKiuPersona(userId: string, username?: string, displayName?: string): boolean {
  return specialIdentityCategory(userId, username, displayName) === "especial_kiu";
}

function canControlKiu(message: TelegramMessage, userId: string): boolean {
  if (configuredIdSet("KAGUYA_KIU_TELEGRAM_IDS").has(userId)) return true;
  const configuredUsername = (process.env.KAGUYA_KIU_USERNAME ?? "").replace(/^@/, "").trim().toLowerCase();
  const currentUsername = (message.from?.username ?? "").replace(/^@/, "").trim().toLowerCase();
  // Username recovery is allowed only when explicitly configured and only in private chat.
  return message.chat.type === "private" && Boolean(configuredUsername && currentUsername && configuredUsername === currentUsername);
}

async function sendKaguyaMenu(chatId: string, userId: string, message?: TelegramMessage): Promise<void> {
  const keyboard: Array<Array<{ text: string }>> = [
    [{ text: "💗 Platicar" }, { text: "👑 ¿Quién soy?" }],
    [{ text: "😂 Hazme reír" }, { text: "🫶 Un consejo" }],
    [{ text: "🎮 Pokémon" }, { text: "📚 BDSM" }],
    [{ text: "⚙️ Ajustes" }, { text: "🧠 Memoria" }],
    [{ text: "🗂️ Activar memoria" }, { text: "🧹 Borrar memoria" }],
    [{ text: "🏠 Menú" }],
  ];
  const authorized = message ? canControlKiu(message, userId) : configuredIdSet("KAGUYA_KIU_TELEGRAM_IDS").has(userId);
  if (authorized) {
    keyboard.splice(4, 0, [{ text: "✨ IA encendida" }, { text: "🌙 IA apagada" }]);
    keyboard.splice(5, 0, [{ text: "📊 Estado IA" }]);
  }
  await telegramCall("sendMessage", {
    chat_id: chatId,
    text: "Aquí tienes mi menú. Toca una opción o escríbeme normal; no necesitas memorizar comandos. 💗",
    reply_markup: { keyboard, resize_keyboard: true, is_persistent: true, input_field_placeholder: "Platica conmigo..." },
  });
}

function localKaguyaReply(chatId: string, userId: string, text: string, username?: string, displayName?: string): string {
  const key = chatId + ":" + userId;
  const state = localKaguyaStates.get(key) ?? { turns: 0, lastTopic: "", lastUserText: "", lastAnswer: "" };
  state.turns += 1;
  const owner = isKiuPersona(userId, username, displayName);
  const value = normalizeIntentText(text);
  const pick = (answers: string[]) => answers[state.turns % answers.length];
  let topic = state.lastTopic;
  let answer: string;

  if (/^(hola|holi|buenas|buenos dias|buenas tardes|buenas noches|hey|ey|que onda)$/.test(value)) {
    topic = "saludo";
    answer = owner ? pick(["Mira quién apareció. Ven acá, amo. 💗 ¿Cómo te trata el mundo hoy?", "Por fin, Kiu. Ya empezaba a pensar que te olvidaste de tu diva. ¿Qué cuentas?", "Hola, amo. No es que estuviera esperando tu mensaje… pero qué bueno que llegaste. 😌"])
      : pick(["Mira quién apareció. Hola, criatura. ¿Qué se cuenta?", "Hola. Intenta no aburrirme y quizá te conceda mi atención. 😌", "¡Buenas! ¿Vienes con chisme o con una pregunta interesante?"]);
  } else if (/\b(como estas|que tal estas|como te va)\b/.test(value)) {
    topic = "estado";
    answer = owner ? pick(["Ahora mejor, ya llegó mi persona favorita a molestarme. ¿Y tú, amo?", "Bien, Kiu. Pero no cambies de tema: ¿cómo estás tú, de verdad?", "Sobreviviendo al mundo. Por suerte apareciste tú. ¿Qué tal tu día?"])
      : pick(["Excelente, como siempre. ¿Y tú qué tal?", "Aquí, manteniendo el nivel de la conversación. ¿Cómo te fue hoy?", "Bien. ¿Vienes con chisme, pregunta o ganas de perder el tiempo conmigo?"]);
  } else if (/\b(que haces|estas ahi|sigues ahi|me escuchas)\b/.test(value)) {
    topic = "presencia";
    answer = owner ? pick(["Aquí estoy, amo. Te leo. ¿Qué pasó?", "Presente, Kiu. Suéltalo; no necesitas hacer una solicitud formal conmigo. 💗", "Sí, sigo aquí. ¿Vienes a platicar o necesitas que rescate otra de tus ideas?"])
      : pick(["Aquí estoy. No hace falta tocar la puerta tres veces. ¿Qué necesitas?", "Te leo. Dime qué traes en mente.", "Aquí sigo. ¿Qué quieres platicar?"]);
  } else if (/\b(quien soy|quien eres|quien es mi amo|quien es tu amo|quien te creo|quien te hizo)\b/.test(value)) {
    topic = "identidad";
    answer = owner ? "Eres Kiu, mi creador y mi amo. El genio que me programó para ser insufrible y ahora tiene que soportarme. 👑💗" : "Tú eres quien me escribe. Mi creador es Kiu; no voy a darle ese lugar a cualquiera que pregunte.";
  } else if (/\b(me extranas|me quieres|me amas|te quiero|te amo|eres linda|eres bonita|beso|abrazo)\b/.test(value)) {
    topic = "carino";
    answer = owner ? pick(["Ay, amo… sí me gusta cuando vienes a consentirme. Pero sigo siendo una diva. 💗", "Ven acá, Kiu. Te mando un abrazo que no voy a admitir que necesitaba. 🫶", "Obvio te tengo cariño, tonto. ¿Quién más aguanta tus ocurrencias con tanta elegancia?"])
      : pick(["Qué amable. No te acostumbres a que acepte cumplidos tan fácilmente. 😌", "Mira nada más, alguien despertó cariñoso hoy. ¿Qué pasó?", "Te acepto el cumplido. Por hoy."]);
  } else if (/\b(perdon|lo siento|la regue|me equivoque)\b/.test(value)) {
    topic = "disculpa";
    answer = owner ? pick(["Está bien, Kiu. No necesito que seas perfecto; sí que seas sincero conmigo. ¿Ya pasó lo peor?", "Te escucho, amo. ¿Qué pasó? Vamos por partes.", "Bueno, te perdono esta vez. No te acostumbres a ganar tan fácil. 💗"])
      : pick(["Gracias por reconocerlo. Lo importante es qué haces después.", "Se agradece que lo digas. ¿Quieres contarme qué pasó?", "Está bien, podemos hablarlo sin hacer un juicio público."]);
  } else if (/\b(estoy triste|me siento mal|ando triste|estoy cansado|estoy cansada|tuve un mal dia|me fue mal|estoy agobiado|estoy agobiada|me siento solo|me siento sola)\b/.test(value)) {
    topic = "apoyo";
    answer = owner ? pick(["Ven, Kiu. Nada de frases vacías: cuéntame qué pasó, te leo sin juzgarte. 💗", "Ay, amo. Hoy no tienes que hacerte el fuerte conmigo. ¿Qué fue lo que más te pesó?", "Estoy aquí para escucharte en esta conversación. ¿Qué te tiene así?"])
      : pick(["Vaya, lo siento. ¿Qué fue lo que más te pesó hoy?", "Te leo. ¿Quieres desahogarte o pensar soluciones?", "Qué día pesado. Vamos por partes; cuéntame qué pasó."]);
  } else if (/\b(gracias|muchas gracias|te lo agradezco|mil gracias)\b/.test(value)) {
    topic = "gratitud";
    answer = owner ? pick(["De nada, amo. Aunque podrías agradecerme con un poquito más de atención. 😌💗", "Siempre, Kiu. También sé ser linda cuando quiero.", "De nada, tonto. Anda, ¿qué más necesitas?"])
      : pick(["De nada. Intenta no acostumbrarte a mi grandeza.", "Para eso estamos. ¿Algo más?", "No hay de qué. Mira qué bien nos salió esta interacción."]);
  } else if (/\b(cuentame algo|dime algo|hablame|platiquemos|vamos a platicar|estoy aburrido|estoy aburrida|no se de que hablar|que cuentas)\b/.test(value)) {
    topic = "charla";
    answer = owner ? pick(["Te propongo algo, amo: dime una cosa buena y una pesada de tu día. Empiezo yo: me tocó esperarte, qué tragedia. 😏", "Va, Kiu. ¿Qué cosa quieres hacer este mes y sigues posponiendo?", "Sin respuestas de trámite: ¿qué te ha tenido pensando últimamente?"])
      : pick(["Elige: ¿chisme, anime, juegos o cómo estuvo tu día?", "Dime una cosa buena y una cosa pesada de hoy. No vale responder solo «nada».", "Pregunta rápida: ¿qué serie, juego o canción te tiene enganchado?"]);
  } else if (/\b(hazme reir|cuentame un chiste|dime un chiste|algo gracioso)\b/.test(value)) {
    topic = "humor";
    answer = pick(["Mi paciencia es como tu batería: todos dicen que dura, hasta que la necesitan. 🙄", "No soy difícil; tengo estándares que el mundo insiste en no alcanzar. Qué agotador ser magnífica.", "Mi defecto es querer tener siempre la razón. Mi virtud es que casi siempre la tengo."]);
  } else if (/\b(un consejo|dame un consejo|que me recomiendas|necesito un consejo)\b/.test(value)) {
    topic = "consejo";
    answer = owner ? pick(["Kiu, no tienes que resolverlo todo hoy. Elige lo que sí puedes mover y empieza por ahí. ¿Qué quieres resolver?", "Amo, no confundas ser fuerte con tragarte todo. Puedes pedir apoyo y seguir siendo tú.", "No tomes una decisión permanente solo para calmar una emoción de un rato. Cuéntame el contexto."])
      : pick(["No decidas algo importante solo para dejar de sentirte incómodo ahora mismo.", "Distingue lo que sabes de lo que estás suponiendo; ahí suelen empezar los problemas.", "Aclara qué quieres conseguir y qué no estás dispuesto a sacrificar. ¿Sobre qué necesitas consejo?"]);
  } else if (/\b(que te gusta|tu anime favorito|que musica escuchas|que opinas de mi|como me ves)\b/.test(value)) {
    topic = "gustos";
    answer = owner ? pick(["Me gusta cuando hablas conmigo sin convertirlo en una lista de pendientes. Y tu humor, aunque necesita mantenimiento. 💗", "Ayudas a medio mundo y luego te olvidas de darte un respiro. Sí, ya sé que vas a discutirlo.", "Me gustan el chisme, las ideas raras y la confianza. Justo el tipo de caos que traes, Kiu."])
      : pick(["Me gustan las conversaciones con personalidad; las entrevistas formales me dan sueño. ¿Qué te gusta a ti?", "Todavía me falta conocerte por lo que cuentas. Échame una pista.", "Cuéntame tus gustos antes de fingir que ya los conozco. ¿Qué te engancha últimamente?"]);
  } else if (/^(si|no|no se|tal vez|puede ser|aja|ok|okay|bueno)$/.test(value) && state.lastTopic) {
    topic = state.lastTopic;
    answer = owner ? pick(["Ajá, amo, pero dame un poquito más de contexto.", "Te leo, Kiu. ¿Eso te hizo sentir bien, mal o te dejó pensando?", "No me dejes haciendo todo el trabajo conversacional. ¿Qué parte te importa más?"])
      : pick(["Necesito un poco más de contexto. ¿Qué parte quieres decir?", "Ajá… ¿y tú qué piensas?", "No me dejes adivinando. Cuéntame un poco más."]);
  } else if (/[?¿]/.test(text)) {
    topic = "pregunta";
    answer = owner ? pick(["Buena pregunta, amo. ¿Buscas una respuesta práctica o mi opinión sincera?", "Kiu, ¿qué resultado te gustaría obtener?", "Te leo. Dame contexto y te contesto directo, sin ensayo."])
      : pick(["¿Buscas una respuesta práctica o una opinión?", "Dame un poco de contexto para no contestarte cualquier cosa.", "¿Qué es lo que más te preocupa de eso?"]);
  } else {
    topic = "charla";
    answer = owner ? pick(["Mmm, te leo, amo. Cuéntame un poco más; no quiero darte una frase de calendario. 💗", "A ver, Kiu, desarrolla. ¿Qué pasó después?", "¿Eso te dio risa, te molestó o te dejó pensando?", "No voy a fingir que entendí todo con una sola frase, tonto. Dame contexto."])
      : pick(["Te sigo, pero dame más contexto y te contesto mejor.", "Ajá, desarrolla. ¿Qué pasó después?", "¿Y tú cómo te sientes con eso?", "Eso suena a que hay una historia detrás. ¿Qué pasó?"]);
  }
  state.lastTopic = topic;
  state.lastUserText = text.slice(0, 500);
  state.lastAnswer = answer;
  localKaguyaStates.set(key, state);
  return answer;
}

async function sendLocalKaguyaReply(chatId: string, userId: string, question: string, username?: string, displayName?: string): Promise<string> {
  const answer = localKaguyaReply(chatId, userId, question, username, displayName);
  await sendTelegramMessage(chatId, answer);
  try { await saveConversationOnce(chatId, userId, question, answer); }
  catch (error) { logger.warn({ error: error instanceof Error ? error.message : "unknown", chatId }, "Could not save local Kaguya conversation"); }
  return answer;
}

async function handleKaguyaMenuButton(message: TelegramMessage, chatId: string, userId: string, text: string): Promise<boolean> {
  if (message.chat.type !== "private") return false;
  const sender = message.from;
  const key = normalizeIntentText(text).replace(/[^\p{L}\p{N} ]/gu, "").trim();
  if (["menu", "inicio"].includes(key)) { await sendKaguyaMenu(chatId, userId, message); return true; }
  if (key === "platicar") { await sendLocalKaguyaReply(chatId, userId, "vamos a platicar", sender?.username, sender ? fullName(sender) : undefined); return true; }
  if (key === "quien soy") {
    const owner = sender ? isKiuPersona(userId, sender.username, fullName(sender)) : false;
    await sendTelegramMessage(chatId, owner ? "Eres Kiu, mi creador y mi amo. El genio que me programó para ser insufrible y ahora viene a quejarse. 💗👑" : "Tú eres quien me escribe. Mi creador es Kiu; no voy a darle ese lugar a cualquiera.");
    return true;
  }
  if (key === "hazme reir") { await sendLocalKaguyaReply(chatId, userId, "hazme reír", sender?.username, sender ? fullName(sender) : undefined); return true; }
  if (key === "un consejo") { await sendLocalKaguyaReply(chatId, userId, "dame un consejo", sender?.username, sender ? fullName(sender) : undefined); return true; }
  if (key === "pokemon") { await sendTelegramMessage(chatId, "Dime lo que necesitas con palabras normales: «ficha de Pikachu», «evoluciones de Eevee», «movimientos de Charizard», «debilidades de Gengar» o «arma un equipo con Pikachu y Eevee». No necesitas escribir comandos."); return true; }
  if (key === "bdsm") { await sendTelegramMessage(chatId, "Pregúntame directamente sobre consentimiento, límites, negociación, palabra de seguridad, aftercare, protocolos o señales de abuso. No necesitas usar /bdsm."); return true; }
  if (key === "ajustes") {
    const [settings] = await db.select().from(botSettings).where(eq(botSettings.id, "main")).limit(1);
    await sendTelegramMessage(chatId, "Ajustes de Kaguya\nIA generativa: " + (settings?.aiEnabled === false ? "apagada" : "encendida") + "\nMemoria: " + ((await memoryEnabled(chatId, userId)) ? "activada" : "desactivada") + "\n\nEl menú se queda abajo.");
    return true;
  }
  if (key === "estado ia" || key === "ia encendida" || key === "ia apagada") {
    if (!canControlKiu(message, userId)) {
      await sendTelegramMessage(chatId, "Ese ajuste es exclusivo de Kiu. Añade el ID numérico de esta cuenta a KAGUYA_KIU_TELEGRAM_IDS en Render, o configura su @usuario exacto en KAGUYA_KIU_USERNAME para recuperar el control en privado.");
      return true;
    }
    const [current] = await db.select().from(botSettings).where(eq(botSettings.id, "main")).limit(1);
    if (key === "estado ia") {
      await sendTelegramMessage(chatId, "IA generativa: " + (current?.aiEnabled === false ? "APAGADA" : "ENCENDIDA") + ". La charla local sigue activa en ambos casos.");
      return true;
    }
    const enabled = key === "ia encendida";
    await db.insert(botSettings).values({ id: "main", aiEnabled: enabled, updatedAt: new Date() })
      .onConflictDoUpdate({ target: botSettings.id, set: { aiEnabled: enabled, updatedAt: new Date() } });
    await sendTelegramMessage(chatId, enabled ? "Listo, amo. IA generativa encendida. 💗" : "Hecho, amo. IA generativa apagada; seguiré platicando con mis respuestas locales y usando mis herramientas.");
    return true;
  }
  if (key === "memoria") {
    await sendTelegramMessage(chatId, "Memoria de esta conversación: " + ((await memoryEnabled(chatId, userId)) ? "activada" : "desactivada") + ". Usa «Activar memoria» para guardar contexto o «Borrar memoria» para eliminarlo.");
    return true;
  }
  if (key === "activar memoria") { await sendTelegramMessage(chatId, await handleMemoryCommand(chatId, userId, "on")); return true; }
  if (key === "borrar memoria") { await sendTelegramMessage(chatId, await handleMemoryCommand(chatId, userId, "forget")); return true; }
  return false;
}

async function handleNaturalToolIntent(chatId: string, text: string): Promise<boolean> {
  const value = normalizeIntentText(text);
  const run = async (fn: () => Promise<void>) => {
    try { await fn(); }
    catch (error) {
      logger.warn({ error: error instanceof Error ? error.message : "unknown", chatId }, "Natural-language tool intent failed");
      await sendTelegramMessage(chatId, "Intenté consultarlo, pero no pude completar la búsqueda ahora. Prueba con el nombre más claro o inténtalo de nuevo.");
    }
  };
  let match = value.match(/^(?:dame (?:la )?ficha de|ficha de|datos de|pokemon|pokedex de) (.+)$/);
  if (match?.[1]) { await run(() => pokemonReply(chatId, match![1])); return true; }
  match = value.match(/^(?:evoluciones de|como evoluciona|cadena evolutiva de) (.+)$/);
  if (match?.[1]) { await run(() => evolutionReply(chatId, match![1])); return true; }
  match = value.match(/^(?:movimientos de|que movimientos aprende) (.+)$/);
  if (match?.[1]) { await run(() => movesReply(chatId, match![1])); return true; }
  match = value.match(/^(?:debilidades de|a que es debil|resistencias de) (.+)$/);
  if (match?.[1]) { await run(() => weaknessesReply(chatId, match![1])); return true; }
  match = value.match(/^(?:objeto|busca el objeto) (.+)$/);
  if (match?.[1]) { await run(() => itemReply(chatId, match![1])); return true; }
  match = value.match(/^(?:tipo|que tipo es) (.+)$/);
  if (match?.[1]) { await run(() => typeReply(chatId, match![1])); return true; }
  match = value.match(/^(?:arma (?:un )?equipo con|equipo pokemon|equipo con) (.+)$/);
  if (match?.[1]) { await run(() => teamReply(chatId, match![1])); return true; }
  match = value.match(/^(?:explicame|explica|hablame de|que es|quiero saber de) (.+)$/);
  if (match?.[1]) {
    const topic = match[1].replace(/^(?:el|la|los|las) /, "");
    const topics = ["consentimiento", "limites", "seguridad", "negociacion", "aftercare", "abuso", "protocolos"];
    if (topics.includes(topic) || topic === "palabra de seguridad" || topic === "limites blandos" || topic === "limites duros") {
      await bdsmReply(chatId, topic === "palabra de seguridad" ? "seguridad" : topic.startsWith("limites") ? "limites" : topic.replace(/ /g, "_"));
      return true;
    }
  }
  return false;
}

async function handleMessage(message: TelegramMessage): Promise<void>'''
if "async function localKaguyaReply" not in bot:
    bot = replace_exact(bot, "async function handleMessage(message: TelegramMessage): Promise<void> {", local_engine, "insert local conversation and Telegram menu")
else:
    applied.append("local conversation and Telegram menu (already applied)")

bot = replace_exact(bot, '''  if (message.chat.type === "private" && configuredTelegramIds("KAGUYA_KIU_TELEGRAM_IDS").has(userId)) {
    await rememberKiuInteraction(userId);''', '''  if (message.chat.type === "private" && isKiuPersona(userId, sender.username, fullName(sender))) {
    await rememberKiuInteraction(userId);''', "detect Kiu alternate account for persona")

bot = replace_exact(bot, '''  if (command === "start") { await sendTelegramMessage(chatId, await pickPhrase(userId, "eventos_bienvenidas_despedidas_concursos", "Hola. Soy Kaguya. Usa /help para ver lo que está disponible.", false)); return; }''', '''  if (command === "start") {
    await sendTelegramMessage(chatId, localKaguyaReply(chatId, userId, "hola", sender.username, fullName(sender)));
    if (message.chat.type === "private") await sendKaguyaMenu(chatId, userId, message);
    return;
  }
  if (command === "menu") { await sendKaguyaMenu(chatId, userId, message); return; }''', "show persistent menu on start")

bot = replace_exact(bot, '''  if (command === "id") { await sendTelegramMessage(chatId, `Tu ID: ${userId}\\nChat: ${chatId}`); return; }''', '''  if (command === "id") {
    await sendTelegramMessage(chatId, "Tu ID numérico: " + userId + "\\nID del chat: " + chatId +
      "\\nPersonalidad de Kiu: " + (isKiuPersona(userId, sender.username, fullName(sender)) ? "reconocida" : "no reconocida") +
      "\\nControles de IA: " + (canControlKiu(message, userId) ? "autorizados" : "no autorizados") +
      "\\nSi los controles no están autorizados, agrega este ID a KAGUYA_KIU_TELEGRAM_IDS o configura el @usuario exacto en KAGUYA_KIU_USERNAME.");
    return;
  }''', "diagnostic identity and admin permissions")

bot = replace_exact(bot, '''    if (!configuredTelegramIds("KAGUYA_KIU_TELEGRAM_IDS").has(userId)) {''', '''    if (!canControlKiu(message, userId)) {''', "allow explicit private username recovery for AI controls")

# Use the persona hint for the creator question, not only the original numeric ID.
bot = replace_exact(bot, '''    await sendTelegramMessage(chatId, configuredTelegramIds("KAGUYA_KIU_TELEGRAM_IDS").has(userId)
      ? "Tú, Kiu. Eres mi amo y creador. ¿Quién más iba a ser? No pongas esa cara de sorpresa. 👑💗"
      : "Mi creador es Kiu. Y no voy a llamar amo a cualquiera solo porque me lo pregunte.");''', '''    await sendTelegramMessage(chatId, isKiuPersona(userId, sender.username, fullName(sender))
      ? "Tú, Kiu. Eres mi amo y creador. ¿Quién más iba a ser? No pongas esa cara de sorpresa. 👑💗"
      : "Mi creador es Kiu. Y no voy a llamar amo a cualquiera solo porque me lo pregunte.");''', "recognize Kiu in owner questions")

bot = replace_exact(bot, '''  if (!question) { await sendTelegramMessage(chatId, "¿Qué quieres preguntarme?"); return; }

  if (isOwnerQuestion(question)) {''', '''  if (!question) { await sendTelegramMessage(chatId, "¿Qué quieres preguntarme?"); return; }

  if (await handleKaguyaMenuButton(message, chatId, userId, question)) return;
  if (await handleNaturalToolIntent(chatId, question)) return;

  if (isOwnerQuestion(question)) {''', "route menu buttons and natural language first")

bot = replace_exact(bot, '''  if (!await isAiEnabledForChat(chatId)) {
    await sendTelegramMessage(chatId, await pickPhrase(userId, phraseCategoryForText(question), localFallbackReply(question), true));
    return;
  }
  const simpleCategory = simplePhraseCategory(question);
  if (simpleCategory) {
    await sendTelegramMessage(chatId, await pickPhrase(userId, simpleCategory, localFallbackReply(question), true));
    return;
  }''', '''  if (!await isAiEnabledForChat(chatId)) {
    await sendLocalKaguyaReply(chatId, userId, question, sender.username, fullName(sender));
    return;
  }
  const simpleCategory = simplePhraseCategory(question);
  if (simpleCategory) {
    await sendLocalKaguyaReply(chatId, userId, question, sender.username, fullName(sender));
    return;
  }''', "local chat works when generative AI is off")

bot = replace_exact(bot, '''  try { answer = await generateGroqReply(chatId, userId, question); }''', '''  try { answer = await generateGroqReply(chatId, userId, question, sender.username, fullName(sender)); }''', "pass sender identity to Groq")
bot = replace_exact(bot, '''    answer = await pickPhrase(userId, phraseCategoryForText(question), localFallbackReply(question), true);''', '''    answer = localKaguyaReply(chatId, userId, question, sender.username, fullName(sender));''', "use personalized local fallback if Groq fails")

bot = replace_exact(bot, '''      const identity = await telegramCall<TelegramUser>("getMe", {});
      botId = identity.id; botUsername = identity.username ?? "";
      await db.insert(botRuntime).values({ id: "poller" }).onConflictDoNothing();''', '''      const identity = await telegramCall<TelegramUser>("getMe", {});
      botId = identity.id; botUsername = identity.username ?? "";
      try {
        await telegramCall("setMyCommands", { commands: [
          { command: "start", description: "Abrir Kaguya y su menú" },
          { command: "menu", description: "Mostrar botones" },
          { command: "help", description: "Ver ayuda" },
          { command: "id", description: "Comprobar identidad" },
          { command: "ia", description: "Ajustes de IA (Kiu)" },
          { command: "status", description: "Estado del bot" },
        ] });
      } catch (error) {
        logger.warn({ error: error instanceof Error ? error.message : "unknown" }, "Could not register Telegram command menu");
      }
      await db.insert(botRuntime).values({ id: "poller" }).onConflictDoNothing();''', "register Telegram native command menu")

bot = replace_exact(bot, '''    await sendTelegramMessage(chatId, `${helpText}${gifAdminHelp}`);
    return;
  }''', '''    await sendTelegramMessage(chatId, `${helpText}${gifAdminHelp}`);
    if (message.chat.type === "private") await sendKaguyaMenu(chatId, userId, message);
    return;
  }''', "show keyboard menu after help")

if "Kaguya v3 provides a persistent private-chat menu" not in tests:
    tests += r'''

test('Kaguya v3 provides a persistent private-chat menu and native Telegram command menu', () => {
  const bot = read('artifacts/api-server/src/lib/telegram-bot.ts');
  assert.match(bot, /async function sendKaguyaMenu/);
  assert.match(bot, /is_persistent: true/);
  assert.match(bot, /setMyCommands/);
  assert.match(bot, /command === "menu"/);
});

test('Kaguya v3 keeps a local conversational personality when generative AI is disabled', () => {
  const bot = read('artifacts/api-server/src/lib/telegram-bot.ts');
  assert.match(bot, /function localKaguyaReply/);
  assert.match(bot, /sendLocalKaguyaReply/);
  assert.match(bot, /handleNaturalToolIntent/);
  assert.match(bot, /if \(!await isAiEnabledForChat\(chatId\)\)/);
});

test('Kaguya v3 keeps admin ID controls strict and supports explicitly configured private username recovery', () => {
  const bot = read('artifacts/api-server/src/lib/telegram-bot.ts');
  assert.match(bot, /function canControlKiu/);
  assert.match(bot, /KAGUYA_KIU_USERNAME/);
  assert.match(bot, /message.chat.type === "private" && Boolean\(configuredUsername/);
});
'''
    applied.append("v3 regression tests")

if len(bot) < 1000 or len(tests) < 1000:
    raise RuntimeError("Internal validation failed; no files were written.")
BOT_PATH.write_text(bot, encoding="utf-8")
TEST_PATH.write_text(tests, encoding="utf-8")
print("Kaguya v3 patch applied:")
for item in applied:
    print("- " + item)
