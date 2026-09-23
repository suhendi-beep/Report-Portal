import React, { useState } from "react";

export default function OCILoginModal({ onClose, onSuccess }) {
  const [step, setStep] = useState("credentials"); // credentials, otp, success
  const [tenancy, setTenancy] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [taskId, setTaskId] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCredentialsSubmit = async (e) => {
    e.preventDefault();
    
    if (!tenancy || !email || !password) {
      setError("Semua field harus diisi");
      return;
    }
    
    setLoading(true);
    setError("");
    
    try {
      const res = await fetch("/api/oci/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          tenancy: tenancy, 
          username: email, 
          password: password 
        })
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Login failed");
      }
      
      // Simpan task ID dan langsung ke step OTP
      setTaskId(data.task_id);
      setStep("otp");
      setError(""); // Clear error
      
    } catch (err) {
      setError(err.message || "Connection failed");
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = async (e) => {
    e.preventDefault();
    
    if (!otp || otp.length !== 6) {
      setError("OTP harus 6 digit");
      return;
    }
    
    setLoading(true);
    setError("");
    
    try {
      const res = await fetch("/api/oci/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          task_id: taskId, 
          otp: otp 
        })
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "OTP submission failed");
      }
      
      // Success!
      setStep("success");
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1500);
      
    } catch (err) {
      setError(err.message || "OTP verification failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerContent}>
            <span style={styles.icon}>🔐</span>
            <span style={styles.title}>
              {step === "credentials" && "Connect to OCI"}
              {step === "otp" && "Enter OTP Code"}
              {step === "success" && "Connected!"}
            </span>
          </div>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Body */}
        <div style={styles.body}>
          
          {/* Error Alert */}
          {error && (
            <div style={styles.errorBox}>
              ⚠️ {error}
            </div>
          )}

          {/* STEP 1: Credentials */}
          {step === "credentials" && (
            <form onSubmit={handleCredentialsSubmit}>
              
              <label style={styles.label}>Tenancy</label>
              <select 
                style={styles.select}
                value={tenancy}
                onChange={e => setTenancy(e.target.value)}
                disabled={loading}
                required
              >
                <option value="">— Select Tenancy —</option>
                <option value="ilcspsdcloudaccount">ilcspsdcloudaccount</option>
                <option value="pelindo">pelindo</option>
              </select>

              <label style={styles.label}>Email</label>
              <input
                type="email"
                style={styles.input}
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="user@example.com"
                disabled={loading}
                required
              />

              <label style={styles.label}>Password</label>
              <input
                type="password"
                style={styles.input}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={loading}
                required
              />

              <button 
                type="submit" 
                style={{...styles.btn, ...(loading ? styles.btnDisabled : {})}}
                disabled={loading}
              >
                {loading ? "Connecting..." : "→ Continue"}
              </button>
              
            </form>
          )}

          {/* STEP 2: OTP */}
          {step === "otp" && (
            <form onSubmit={handleOtpSubmit}>
              
              <p style={styles.note}>
                📧 OTP telah dikirim ke email <strong>{email}</strong>
                <br/>
                <span style={{fontSize: 11, color: "var(--muted)"}}>
                  (Check inbox atau spam folder)
                </span>
              </p>
              
              <label style={styles.label}>OTP Code (6 digit)</label>
              <input
                type="text"
                style={{...styles.input, fontSize: 20, letterSpacing: 8, textAlign: "center"}}
                value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                autoFocus
                disabled={loading}
                required
              />

              <button 
                type="submit" 
                style={{...styles.btn, ...(loading || otp.length !== 6 ? styles.btnDisabled : {})}}
                disabled={loading || otp.length !== 6}
              >
                {loading ? "Verifying..." : "✓ Verify & Connect"}
              </button>
              
              <button 
                type="button"
                style={styles.backBtn}
                onClick={() => {
                  setStep("credentials");
                  setOtp("");
                  setError("");
                }}
                disabled={loading}
              >
                ← Back
              </button>
              
            </form>
          )}

          {/* STEP 3: Success */}
          {step === "success" && (
            <div style={styles.successBox}>
              <div style={styles.successIcon}>✓</div>
              <p style={styles.successText}>Successfully connected to OCI!</p>
            </div>
          )}
          
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
  },
  modal: {
    background: "var(--bg2)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    width: "90%",
    maxWidth: 420,
    boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 20px",
    borderBottom: "1px solid var(--border)",
  },
  headerContent: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  icon: {
    fontSize: 20,
  },
  title: {
    fontSize: 16,
    fontWeight: 600,
    color: "var(--text)",
  },
  closeBtn: {
    background: "none",
    border: "none",
    color: "var(--muted)",
    fontSize: 20,
    cursor: "pointer",
    padding: "4px 8px",
    lineHeight: 1,
  },
  body: {
    padding: "20px 24px 24px",
  },
  errorBox: {
    background: "rgba(239,68,68,0.1)",
    border: "1px solid rgba(239,68,68,0.3)",
    color: "#F87171",
    padding: "10px 12px",
    borderRadius: 6,
    fontSize: 12,
    marginBottom: 16,
  },
  label: {
    display: "block",
    fontSize: 11,
    fontWeight: 600,
    color: "var(--muted2)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginTop: 12,
    marginBottom: 6,
  },
  select: {
    width: "100%",
    background: "var(--surface2)",
    border: "1px solid var(--border2)",
    color: "var(--text)",
    fontFamily: "inherit",
    fontSize: 13,
    padding: "10px 12px",
    borderRadius: 7,
    outline: "none",
    cursor: "pointer",
  },
  input: {
    width: "100%",
    background: "var(--surface2)",
    border: "1px solid var(--border2)",
    color: "var(--text)",
    fontFamily: "inherit",
    fontSize: 13,
    padding: "10px 12px",
    borderRadius: 7,
    outline: "none",
  },
  note: {
    fontSize: 12,
    color: "var(--muted)",
    marginBottom: 16,
    lineHeight: 1.6,
  },
  btn: {
    width: "100%",
    background: "#B11226",
    color: "#fff",
    border: "none",
    fontFamily: "inherit",
    fontSize: 13,
    fontWeight: 600,
    padding: "11px",
    borderRadius: 7,
    cursor: "pointer",
    marginTop: 20,
  },
  btnDisabled: {
    opacity: 0.6,
    cursor: "not-allowed",
  },
  backBtn: {
    width: "100%",
    background: "none",
    border: "1px solid var(--border2)",
    color: "var(--muted)",
    fontFamily: "inherit",
    fontSize: 12,
    padding: "9px",
    borderRadius: 7,
    cursor: "pointer",
    marginTop: 10,
  },
  successBox: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "40px 20px",
    gap: 16,
  },
  successIcon: {
    width: 64,
    height: 64,
    borderRadius: "50%",
    background: "#059669",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 32,
    fontWeight: "bold",
  },
  successText: {
    fontSize: 14,
    color: "var(--text)",
    fontWeight: 600,
  },
};
