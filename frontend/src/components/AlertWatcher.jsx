/**
 * AlertWatcher.jsx
 * Global alert ringtone + toast notifications.
 *
 * Mounted once in App.jsx (outside the page router) so it keeps polling
 * Grafana alerts and ringing on ANY tab of the app — not just while the
 * user has the "Alert Monitor" page open. This mirrors what the team
 * needs: as long as the laptop is online and the user is logged in, the
 * ringtone must keep sounding for unescalated alerts, and every new
 * alert should pop up a notification card in the bottom-right corner.
 */
import React, { useEffect, useRef, useState } from "react";
import { isAlertMuted, onAlertMuteChange } from "../alertMute.js";

const POLL_MS        = 30000;      // sinkron dengan AlertPage
const RING_REPEAT_MS = 5 * 60 * 1000;
const SEEN_KEY        = "pr_alert_watcher_seen"; // alert keys yang sudah pernah muncul (untuk toast "baru")

function shortName(name) {
  return (name || "")
    .replace(/^Resource\s+/i, "")
    .replace(/^Uptime\s+-\s+/i, "Uptime - ")
    .replace(/^DatasourceNoData$/i, "Datasource No Data")
    .replace(/^\[ALERT\]\s*/i, "")
    .replace(/\s{2,}/g, " ").trim();
}

function fmtDur(min) {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function playAlertSound() {
  try {
    const audio = new Audio("/alert.mp3");
    audio.volume = 0.7;
    audio.play().catch(() => {
      // Browser blocked autoplay before any user interaction on this page
      // load. Sound resumes automatically after the user's first click.
    });
  } catch {
    // ignore
  }
}

function loadSeen() {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || "[]")); }
  catch { return new Set(); }
}
function saveSeen(set) {
  try {
    // Keep the set from growing forever — trim to the most recent 500 keys.
    const arr = [...set].slice(-500);
    localStorage.setItem(SEEN_KEY, JSON.stringify(arr));
  } catch { /* ignore */ }
}

export default function AlertWatcher() {
  const [muted, setMuted] = useState(() => isAlertMuted());
  const [toasts, setToasts] = useState([]); // {id, title, message}
  const seenRef  = useRef(loadSeen());
  const ringRef  = useRef(null);
  const firstRunRef = useRef(true);

  useEffect(() => onAlertMuteChange(setMuted), []);

  useEffect(() => {
    let cancelled = false;

    const tick = () => {
      Promise.all([
        fetch("/api/grafana/alerts").then(r => r.json()).catch(() => ({ alerts: [] })),
        fetch("/api/alerts/eskalasi").then(r => r.json()).catch(() => ({})),
      ]).then(([alertsRes, eskalasiMap]) => {
        if (cancelled) return;
        const alerts   = (alertsRes.alerts || []).filter(a => a.duration_min >= 5);
        const eskalasi = new Set(Object.keys(eskalasiMap || {}));

        // ── Toast untuk setiap alert baru yang belum pernah terlihat ──
        if (!firstRunRef.current) {
          const fresh = alerts.filter(a => {
            const key = `${a.name}||${a.resource}||${a.active_at}`;
            return !seenRef.current.has(key);
          });
          if (fresh.length) {
            const newToasts = fresh.slice(0, 5).map(a => ({
              id: `${a.name}||${a.resource}||${a.active_at}||${Date.now()}`,
              folder: a.folder,
              title: shortName(a.name),
              resource: a.resource && a.resource !== "-" ? a.resource : null,
              duration: fmtDur(a.duration_min),
            }));
            setToasts(prev => [...newToasts, ...prev].slice(0, 8));
            newToasts.forEach(t => {
              setTimeout(() => {
                setToasts(prev => prev.filter(x => x.id !== t.id));
              }, 12000);
            });
          }
        }
        alerts.forEach(a => seenRef.current.add(`${a.name}||${a.resource}||${a.active_at}`));
        saveSeen(seenRef.current);
        firstRunRef.current = false;

        // ── Ringtone: bunyi selama ada alert aktif belum dieskalasikan ──
        const pending = alerts
          .filter(a => a.duration_min >= 10)
          .filter(a => !eskalasi.has(`${a.name}||${a.resource}||${a.active_at}`));

        if (ringRef.current) { clearInterval(ringRef.current); ringRef.current = null; }
        if (pending.length > 0 && !muted) {
          playAlertSound();
          ringRef.current = setInterval(playAlertSound, RING_REPEAT_MS);
        }
      });
    };

    tick();
    const poll = setInterval(tick, POLL_MS);

    // Keep polling even when the tab is backgrounded — most browsers still
    // run setInterval in background tabs (just throttled), which is enough
    // for a 30s poll. Re-check immediately whenever the tab becomes visible
    // again so a freshly-focused tab doesn't wait a full cycle.
    const onVisible = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(poll);
      if (ringRef.current) clearInterval(ringRef.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [muted]);

  const dismiss = (id) => setToasts(prev => prev.filter(t => t.id !== id));

  if (!toasts.length) return null;

  return (
    <div style={{
      position: "fixed", top: 70, right: 24, zIndex: 9998,
      display: "flex", flexDirection: "column", gap: 8,
      pointerEvents: "none",
    }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          pointerEvents: "auto",
          width: 320,
          background: "var(--bg2)",
          border: "1px solid #EF444455",
          borderLeft: "4px solid #EF4444",
          borderRadius: 10,
          padding: "12px 14px",
          boxShadow: "0 8px 28px rgba(0,0,0,.35)",
          animation: "alertToastIn .35s cubic-bezier(.16,1,.3,1) forwards",
        }}>
          <style>{`
            @keyframes alertToastIn {
              from { transform: translateX(110%); opacity: 0; }
              to   { transform: translateX(0);     opacity: 1; }
            }
          `}</style>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>🚨</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#F87171", textTransform: "uppercase", letterSpacing: ".05em" }}>
                Alert Baru — {t.folder}
              </div>
              <div style={{ fontSize: 12, color: "var(--text2)", fontWeight: 600, marginTop: 3 }}>
                {t.title}
              </div>
              {t.resource && (
                <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>{t.resource}</div>
              )}
              <div style={{ fontSize: 9, color: "var(--muted3)", marginTop: 3 }}>Durasi: {t.duration}</div>
            </div>
            <button onClick={() => dismiss(t.id)}
              style={{ background: "none", border: "none", color: "var(--muted3)",
                fontSize: 13, cursor: "pointer", lineHeight: 1, flexShrink: 0 }}>✕</button>
          </div>
        </div>
      ))}
    </div>
  );
}
