import { mutedPermissions as buildMutedPermissions } from "./telegram-permissions.mjs";

const API_BASE = "https://api.telegram.org/bot";

export class TelegramApiError extends Error {
  readonly errorCode: number | undefined;

  constructor(message: string, errorCode?: number) {
    super(message);
    this.name = "TelegramApiError";
    this.errorCode = errorCode;
  }
}

export type TelegramChatMember = {
  status?: string;
  user?: { id?: number; username?: string; first_name?: string; last_name?: string };
  is_member?: boolean;
  until_date?: number;
  [key: string]: unknown;
};

export type ChatPermissionsSnapshot = Record<string, boolean>;

export function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

export async function telegramCall<T>(
  method: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new TelegramApiError("TELEGRAM_BOT_TOKEN no está configurado.");

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new TelegramApiError("No se pudo conectar con la API de Telegram.");
  }

  const result = (await response.json().catch(() => null)) as
    | { ok?: boolean; result?: T; description?: string; error_code?: number }
    | null;
  if (!response.ok || !result?.ok) {
    throw new TelegramApiError(
      result?.description ?? "Telegram no confirmó la operación.",
      result?.error_code,
    );
  }
  return result.result as T;
}

function numericTelegramUserId(userId: string): number {
  if (!/^\d+$/.test(userId)) throw new TelegramApiError("El ID del usuario de Telegram debe ser numérico.");
  const numeric = Number(userId);
  if (!Number.isSafeInteger(numeric) || numeric <= 0) throw new TelegramApiError("El ID del usuario de Telegram está fuera de rango.");
  return numeric;
}

export async function getChatMember(
  chatId: string,
  userId: string,
): Promise<TelegramChatMember> {
  return telegramCall<TelegramChatMember>("getChatMember", {
    chat_id: chatId,
    user_id: numericTelegramUserId(userId),
  });
}

export async function getChatPermissions(
  chatId: string,
): Promise<ChatPermissionsSnapshot | null> {
  const chat = await telegramCall<{ permissions?: Record<string, unknown> }>("getChat", {
    chat_id: chatId,
  });
  return extractPermissionFlags(chat.permissions);
}

export async function restrictMember(
  chatId: string,
  userId: string,
  permissions: ChatPermissionsSnapshot,
  untilDate?: number | null,
): Promise<boolean> {
  return telegramCall<boolean>("restrictChatMember", {
    chat_id: chatId,
    user_id: numericTelegramUserId(userId),
    permissions,
    use_independent_chat_permissions: true,
    ...(untilDate ? { until_date: untilDate } : {}),
  });
}

export async function banMember(
  chatId: string,
  userId: string,
  untilDate?: number,
): Promise<boolean> {
  return telegramCall<boolean>("banChatMember", {
    chat_id: chatId,
    user_id: numericTelegramUserId(userId),
    ...(untilDate ? { until_date: untilDate } : {}),
  });
}

export async function unbanMember(chatId: string, userId: string): Promise<boolean> {
  return telegramCall<boolean>("unbanChatMember", {
    chat_id: chatId,
    user_id: numericTelegramUserId(userId),
    only_if_banned: true,
  });
}

export async function sendTelegramMessage(chatId: string, text: string): Promise<unknown> {
  return telegramCall("sendMessage", {
    chat_id: chatId,
    text: text.slice(0, 4096),
    disable_web_page_preview: true,
  });
}

export type DownloadedTelegramFile = {
  bytes: Uint8Array;
  fileName: string;
  contentType: string;
  fileSize: number;
};

/** Downloads only a file path returned by Telegram's getFile API, with strict size/path limits. */
export async function downloadTelegramFile(
  fileId: string,
  options: { maxBytes: number; contentType?: string; defaultFileName: string },
): Promise<DownloadedTelegramFile> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new TelegramApiError("TELEGRAM_BOT_TOKEN no está configurado.");
  const file = await telegramCall<{ file_path?: string; file_size?: number }>("getFile", { file_id: fileId });
  const filePath = file.file_path;
  if (!filePath || filePath.includes("..") || !/^[A-Za-z0-9_./-]+$/.test(filePath)) {
    throw new TelegramApiError("Telegram devolvió una ruta de archivo no válida.");
  }
  if (typeof file.file_size === "number" && file.file_size > options.maxBytes) {
    throw new TelegramApiError(`El archivo supera el límite permitido de ${Math.floor(options.maxBytes / (1024 * 1024))} MB.`);
  }
  // The token is required by Telegram's file URL. Never log or return this URL.
  const url = `https://api.telegram.org/file/bot${token}/${filePath}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new TelegramApiError(`No se pudo descargar el archivo de Telegram (HTTP ${response.status}).`);
  const responseLength = response.headers.get("content-length");
  if (responseLength && Number(responseLength) > options.maxBytes) {
    throw new TelegramApiError(`El archivo descargado supera el límite permitido de ${Math.floor(options.maxBytes / (1024 * 1024))} MB.`);
  }
  if (!response.body) throw new TelegramApiError("Telegram devolvió un archivo sin contenido.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > options.maxBytes) {
        await reader.cancel();
        throw new TelegramApiError(`El archivo descargado supera el límite permitido de ${Math.floor(options.maxBytes / (1024 * 1024))} MB.`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const buffer = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
  const ext = filePath.split("/").pop()?.split(".").pop()?.toLowerCase() ?? "";
  const extensions: Record<string, string> = { ogg: "audio/ogg", oga: "audio/ogg", mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", webm: "audio/webm", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
  const allowedType = options.contentType && /^(audio|image)\/[a-z0-9.+-]+$/i.test(options.contentType) ? options.contentType : undefined;
  return {
    bytes: buffer,
    fileName: options.defaultFileName.includes(".") ? options.defaultFileName : `${options.defaultFileName}.${ext || "bin"}`,
    contentType: allowedType ?? extensions[ext] ?? "application/octet-stream",
    fileSize: buffer.byteLength,
  };
}

export async function sendTelegramVoice(chatId: string, audioBytes: Uint8Array, caption?: string): Promise<unknown> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new TelegramApiError("TELEGRAM_BOT_TOKEN no está configurado.");
  if (audioBytes.byteLength === 0 || audioBytes.byteLength > 20 * 1024 * 1024) {
    throw new TelegramApiError("El audio generado está vacío o supera el límite de 20 MB.");
  }
  const audioBuffer = Uint8Array.from(audioBytes).buffer as ArrayBuffer;
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("voice", new Blob([audioBuffer], { type: "audio/mpeg" }), "kaguya-voz.mp3");
  if (caption) form.append("caption", caption.slice(0, 1024));
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${token}/sendVoice`, {
      method: "POST", body: form, signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new TelegramApiError("No se pudo conectar con Telegram para enviar el audio.");
  }
  const result = await response.json().catch(() => null) as { ok?: boolean; result?: unknown; description?: string; error_code?: number } | null;
  if (!response.ok || !result?.ok) {
    throw new TelegramApiError(result?.description ?? "Telegram no confirmó el envío del audio.", result?.error_code);
  }
  return result.result;
}

export async function deleteTelegramMessage(chatId: string, messageId: number): Promise<boolean> {
  return telegramCall<boolean>("deleteMessage", { chat_id: chatId, message_id: messageId });
}

export async function sendTelegramAnimation(chatId: string, fileId: string, caption?: string): Promise<unknown> {
  return telegramCall("sendAnimation", {
    chat_id: chatId,
    animation: fileId,
    ...(caption ? { caption: caption.slice(0, 1024) } : {}),
  });
}

export async function sendTelegramPhoto(chatId: string, fileId: string, caption?: string): Promise<unknown> {
  return telegramCall("sendPhoto", {
    chat_id: chatId,
    photo: fileId,
    ...(caption ? { caption: caption.slice(0, 1024) } : {}),
  });
}

export function extractPermissionFlags(
  value: Record<string, unknown> | undefined,
): ChatPermissionsSnapshot | null {
  if (!value) return null;
  const flags: ChatPermissionsSnapshot = {};
  for (const [key, flag] of Object.entries(value)) {
    if (key.startsWith("can_") && typeof flag === "boolean") flags[key] = flag;
  }
  return Object.keys(flags).length > 0 ? flags : null;
}

export async function snapshotMemberPermissions(
  chatId: string,
  userId: string,
): Promise<{ permissions: ChatPermissionsSnapshot; untilDate: number | null; status: string }> {
  const member = await getChatMember(chatId, userId);
  if (member.status === "creator" || member.status === "administrator") {
    throw new TelegramApiError("Telegram no permite silenciar a un administrador del grupo.");
  }
  if (member.status === "left" || member.status === "kicked" || member.is_member === false) {
    throw new TelegramApiError("El usuario ya no es miembro del grupo.");
  }

  let permissions = extractPermissionFlags(member);
  if (member.status === "member" || member.status === "restricted" && !permissions) {
    permissions = await getChatPermissions(chatId);
  }
  if (!permissions) {
    throw new TelegramApiError(
      "Telegram no proporcionó permisos anteriores suficientes; no se aplicó el silencio.",
    );
  }

  return {
    permissions,
    untilDate: typeof member.until_date === "number" ? member.until_date : null,
    status: member.status ?? "unknown",
  };
}

export function mutedPermissions(previous: ChatPermissionsSnapshot): ChatPermissionsSnapshot {
  return buildMutedPermissions(previous);
}

export async function isChatAdministrator(
  chatId: string,
  userId: string,
): Promise<boolean> {
  const member = await getChatMember(chatId, userId);
  return member.status === "creator" || member.status === "administrator";
}
