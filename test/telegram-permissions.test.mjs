import test from 'node:test';
import assert from 'node:assert/strict';
import { mutedPermissions, permissionsForRestore, SEND_PERMISSION_KEYS } from '../artifacts/api-server/src/lib/telegram-permissions.mjs';

test('silence explicitly disables every send/reaction permission in current Telegram API', () => {
  const previous = Object.fromEntries(SEND_PERMISSION_KEYS.map((key) => [key, true]));
  const muted = mutedPermissions(previous);
  for (const key of SEND_PERMISSION_KEYS) assert.equal(muted[key], false, `${key} should be false`);
});

test('mutedPermissions does not mutate the previous snapshot', () => {
  const previous = { can_send_messages: true, can_react_to_messages: true, can_pin_messages: false };
  mutedPermissions(previous);
  assert.deepEqual(previous, { can_send_messages: true, can_react_to_messages: true, can_pin_messages: false });
});

test('silence preserves unrelated permission flags and does not broaden them', () => {
  const muted = mutedPermissions({ can_send_messages: true, can_react_to_messages: true, can_pin_messages: false });
  assert.equal(muted.can_pin_messages, false);
  assert.equal(muted.can_send_messages, false);
  assert.equal(muted.can_react_to_messages, false);
});

test('ordinary members inherit current group defaults, not a stale snapshot', () => {
  assert.deepEqual(permissionsForRestore({
    previousStatus: 'member',
    snapshot: { can_send_messages: false },
    currentDefaults: { can_send_messages: true, can_react_to_messages: true },
  }), { can_send_messages: true, can_react_to_messages: true });
});

test('ordinary members cannot be restored if group defaults are unavailable', () => {
  assert.equal(permissionsForRestore({ previousStatus: 'member', snapshot: { can_send_messages: true }, currentDefaults: null }), null);
});

test('still-active prior restriction restores its exact individual snapshot', () => {
  const snapshot = { can_send_messages: false, can_send_photos: true, can_react_to_messages: false };
  assert.deepEqual(permissionsForRestore({ previousStatus: 'restricted', snapshot, currentDefaults: { can_send_messages: true }, previousUntilDate: 4_000_000_000, nowSeconds: 1_800_000_000 }), snapshot);
});

test('expired prior restriction falls back to current group defaults', () => {
  assert.deepEqual(permissionsForRestore({ previousStatus: 'restricted', snapshot: { can_send_messages: false }, currentDefaults: { can_send_messages: true }, previousUntilDate: 100, nowSeconds: 200 }), { can_send_messages: true });
});

test('unknown prior status is not guessed', () => {
  assert.equal(permissionsForRestore({ previousStatus: null, snapshot: { can_send_messages: true }, currentDefaults: { can_send_messages: true } }), null);
});

test('restricted member without a snapshot is not granted guessed permissions', () => {
  assert.equal(permissionsForRestore({ previousStatus: 'restricted', snapshot: null, currentDefaults: { can_send_messages: true } }), null);
});

test('expired status timestamps and missing expiry behave deterministically', () => {
  const defaults = { can_send_messages: true, can_react_to_messages: false };
  assert.deepEqual(permissionsForRestore({ previousStatus: 'restricted', snapshot: { can_send_messages: false }, currentDefaults: defaults, previousUntilDate: null, nowSeconds: 200 }), { can_send_messages: false });
  assert.deepEqual(permissionsForRestore({ previousStatus: 'restricted', snapshot: { can_send_messages: false }, currentDefaults: defaults, previousUntilDate: 200, nowSeconds: 200 }), defaults);
});
