/** Permission fields documented by Telegram Bot API ChatPermissions. */
export const SEND_PERMISSION_KEYS = Object.freeze([
  "can_send_messages",
  "can_send_audios",
  "can_send_documents",
  "can_send_photos",
  "can_send_videos",
  "can_send_video_notes",
  "can_send_voice_notes",
  "can_send_polls",
  "can_send_other_messages",
  "can_add_web_page_previews",
  "can_react_to_messages",
]);

/** Keeps non-sending capabilities unchanged, but explicitly blocks all send/reaction rights. */
export function mutedPermissions(previous = {}) {
  const result = { ...previous };
  for (const key of SEND_PERMISSION_KEYS) result[key] = false;
  return result;
}

/**
 * Restore conservatively: ordinary members inherit CURRENT group defaults; a currently
 * restricted member is restored from its saved individual permissions. If a saved
 * restriction has already expired, ordinary group defaults are restored instead.
 * Missing status/snapshot means we cannot prove the previous state and must not guess.
 */
export function permissionsForRestore({ previousStatus, snapshot, currentDefaults, previousUntilDate = null, nowSeconds = Math.floor(Date.now() / 1000) }) {
  if (previousStatus === "member") return currentDefaults && Object.keys(currentDefaults).length ? { ...currentDefaults } : null;
  if (previousStatus === "restricted") {
    if (previousUntilDate !== null && previousUntilDate <= nowSeconds) {
      return currentDefaults && Object.keys(currentDefaults).length ? { ...currentDefaults } : null;
    }
    return snapshot && Object.keys(snapshot).length ? { ...snapshot } : null;
  }
  return null;
}
