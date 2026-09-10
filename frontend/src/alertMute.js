/**
 * alertMute.js
 * Shared mute flag for the global alert ringtone (AlertWatcher.jsx).
 * Persisted to localStorage so it survives page navigation and refresh.
 * A CustomEvent is dispatched on change so every mounted component
 * (AlertWatcher, the Mute button on the Alert Monitor page, etc.)
 * stays in sync instantly within the same tab.
 */
const MUTE_KEY   = "pr_alert_muted";
const EVENT_NAME = "pr-alert-mute-changed";

export function isAlertMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAlertMuted(next) {
  try {
    localStorage.setItem(MUTE_KEY, next ? "1" : "0");
  } catch {
    // ignore — worst case mute state just doesn't persist
  }
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: next }));
}

export function onAlertMuteChange(handler) {
  const listener = (e) => handler(!!e.detail);
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}
