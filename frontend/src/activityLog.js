/**
 * activityLog.js
 * Helper to record engineer activity to backend /api/activity
 */

function getCurrentUser() {
  return {
    username: sessionStorage.getItem("pr_user")    || "unknown",
    display:  sessionStorage.getItem("pr_display") || "Unknown",
  };
}

/**
 * Log an activity entry.
 * @param {string} action   - Short action label e.g. "Generate Report"
 * @param {string} category - "report" | "alert" | "task" | "auth" | "general"
 * @param {string} detail   - Extra detail string
 */
export function logActivity(action, category = "general", detail = "") {
  const { username, display } = getCurrentUser();
  if (!username || username === "unknown") return;
  fetch("/api/activity", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, display, action, category, detail }),
  }).catch(() => {});
}
