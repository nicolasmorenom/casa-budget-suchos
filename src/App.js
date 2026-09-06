import React, { useState, useEffect, createContext, useContext } from "react";
import { auth, googleProvider, db } from "./firebase";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import {
  doc, setDoc, getDoc, updateDoc, arrayUnion, collection
} from "firebase/firestore";
import Dashboard from "./pages/Dashboard";
import "./App.css";

export const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

const SESSION_KEY = "casaBudget_lastActive";
const SESSION_MAX = 24 * 60 * 60 * 1000;

// ── Generate a 6-char household code ─────────────────────────────────────────
function genCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// ── Login Screen ──────────────────────────────────────────────────────────────
function LoginScreen({ onLogin, error }) {
  return (
    <div className="login-bg">
      <div className="login-card">
        <div className="login-logo">
          <svg width="44" height="44" viewBox="0 0 40 40" fill="none">
            <rect width="40" height="40" rx="12" fill="#c9931a" fillOpacity="0.15"/>
            <path d="M10 20 Q20 10 30 20 Q20 30 10 20Z" fill="#c9931a" opacity="0.9"/>
            <circle cx="20" cy="20" r="4" fill="#c9931a"/>
          </svg>
        </div>
        <h1 className="login-title">Casa Budget</h1>
        <p className="login-sub">Household finances, together</p>
        {error && <p className="login-error">{error}</p>}
        <button className="google-btn" onClick={onLogin}>
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/>
            <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z"/>
            <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18l2.67-2.07z"/>
            <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.3z"/>
          </svg>
          Continue with Google
        </button>
        <p className="login-note">Free to try · No credit card required</p>
      </div>
    </div>
  );
}

// ── Household Setup (new users) ───────────────────────────────────────────────
function HouseholdSetup({ user, onDone }) {
  const [mode, setMode]       = useState(null); // "create" | "join"
  const [name, setName]       = useState("");
  const [code, setCode]       = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const handleCreate = async () => {
    if (!name.trim()) { setError("Please enter a household name"); return; }
    setLoading(true); setError("");
    try {
      let hhCode, hhRef;
      // Try up to 5 codes in case of collision
      for (let i = 0; i < 5; i++) {
        hhCode = genCode();
        hhRef  = doc(db, "households", hhCode);
        const snap = await getDoc(hhRef);
        if (!snap.exists()) break;
      }
      await setDoc(hhRef, {
        name:      name.trim(),
        code:      hhCode,
        members:   [user.uid],
        memberEmails: [user.email],
        ownerId:   user.uid,
        createdAt: new Date().toISOString(),
        plan:      "free",
      });
      await setDoc(doc(db, "users", user.uid), {
        householdId: hhCode,
        name: user.displayName, email: user.email, photo: user.photoURL,
        lastLogin: new Date().toISOString(),
      }, { merge: true });
      onDone(hhCode);
    } catch(e) { setError("Failed to create household: " + e.message); }
    setLoading(false);
  };

  const handleJoin = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) { setError("Please enter a code"); return; }
    setLoading(true); setError("");
    try {
      const hhRef  = doc(db, "households", trimmed);
      const snap   = await getDoc(hhRef);
      if (!snap.exists()) { setError("No household found with that code. Check and try again."); setLoading(false); return; }
      await updateDoc(hhRef, {
        members:      arrayUnion(user.uid),
        memberEmails: arrayUnion(user.email),
      });
      await setDoc(doc(db, "users", user.uid), {
        householdId: trimmed,
        name: user.displayName, email: user.email, photo: user.photoURL,
        lastLogin: new Date().toISOString(),
      }, { merge: true });
      onDone(trimmed);
    } catch(e) { setError("Failed to join: " + e.message); }
    setLoading(false);
  };

  return (
    <div className="login-bg">
      <div className="login-card" style={{ maxWidth: 400 }}>
        <h1 className="login-title" style={{ fontSize: 22 }}>Welcome, {user.displayName?.split(" ")[0]}!</h1>
        <p className="login-sub" style={{ marginBottom: 24 }}>Set up your household to get started</p>

        {!mode && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button className="google-btn" style={{ background: "var(--gold)", color: "#fff", justifyContent: "center" }}
              onClick={() => setMode("create")}>
              🏠 Create a new household
            </button>
            <button className="google-btn" style={{ background: "var(--surface2)", color: "var(--text)", justifyContent: "center" }}
              onClick={() => setMode("join")}>
              🔑 Join with an invite code
            </button>
          </div>
        )}

        {mode === "create" && (
          <div>
            <div style={{ fontSize: 13, color: "var(--text3)", marginBottom: 14 }}>
              Give your household a name — you can invite your partner later with a 6-letter code.
            </div>
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label>Household name</label>
              <input value={name} onChange={e => setName(e.target.value)}
                placeholder="e.g. The Moreno Family" autoFocus
                onKeyDown={e => e.key === "Enter" && handleCreate()} />
            </div>
            {error && <p className="login-error">{error}</p>}
            <button className="google-btn" style={{ background: "var(--gold)", color: "#fff", justifyContent: "center", marginBottom: 10 }}
              onClick={handleCreate} disabled={loading}>
              {loading ? "Creating…" : "Create household"}
            </button>
            <button onClick={() => { setMode(null); setError(""); }}
              style={{ background: "none", border: "none", color: "var(--text3)", fontSize: 13, cursor: "pointer", width: "100%", textAlign: "center" }}>
              ← Back
            </button>
          </div>
        )}

        {mode === "join" && (
          <div>
            <div style={{ fontSize: 13, color: "var(--text3)", marginBottom: 14 }}>
              Ask your partner for their 6-letter household code and enter it below.
            </div>
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label>Invite code</label>
              <input value={code} onChange={e => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. ABC123" maxLength={6} autoFocus
                style={{ fontFamily: "monospace", letterSpacing: "0.2em", fontSize: 20, textAlign: "center" }}
                onKeyDown={e => e.key === "Enter" && handleJoin()} />
            </div>
            {error && <p className="login-error">{error}</p>}
            <button className="google-btn" style={{ background: "var(--gold)", color: "#fff", justifyContent: "center", marginBottom: 10 }}
              onClick={handleJoin} disabled={loading}>
              {loading ? "Joining…" : "Join household"}
            </button>
            <button onClick={() => { setMode(null); setError(""); }}
              style={{ background: "none", border: "none", color: "var(--text3)", fontSize: 13, cursor: "pointer", width: "100%", textAlign: "center" }}>
              ← Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Error Boundary ────────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  render() {
    if (this.state.error) {
      return (
        <div className="login-bg">
          <div className="login-card" style={{ textAlign: "left" }}>
            <h1 className="login-title" style={{ fontSize: 18, marginBottom: 12 }}>Something went wrong</h1>
            <p style={{ fontSize: 13, color: "rgba(26,26,46,0.6)", marginBottom: 12 }}>
              The app crashed. Details:
            </p>
            <pre style={{ fontSize: 11, background: "#f0f1f7", padding: 12, borderRadius: 8, overflowX: "auto", color: "#d94f4f", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
              {this.state.error?.message || String(this.state.error)}
            </pre>
            <button className="google-btn" style={{ marginTop: 16 }} onClick={() => window.location.reload()}>
              Reload app
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser]             = useState(null);
  const [household, setHousehold]   = useState(null);  // { id, name, code, members }
  const [loading, setLoading]       = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [error, setError]           = useState("");

  // Stamp activity for 24h session
  useEffect(() => {
    const stamp = () => localStorage.setItem(SESSION_KEY, Date.now().toString());
    ["click","keydown","touchstart","scroll"].forEach(e => window.addEventListener(e, stamp, { passive: true }));
    return () => ["click","keydown","touchstart","scroll"].forEach(e => window.removeEventListener(e, stamp));
  }, []);

  const loadHousehold = async (uid) => {
    const userSnap = await getDoc(doc(db, "users", uid));
    const hhId     = userSnap.data()?.householdId;
    if (!hhId) return null;
    const hhSnap   = await getDoc(doc(db, "households", hhId));
    if (!hhSnap.exists()) return null;
    return { id: hhId, ...hhSnap.data() };
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      try {
        if (u) {
          // 24h session check
          const lastActive = parseInt(localStorage.getItem(SESSION_KEY) || "0");
          if (lastActive > 0 && Date.now() - lastActive > SESSION_MAX) {
            localStorage.removeItem(SESSION_KEY);
            await signOut(auth);
            setError("Session expired. Please sign in again.");
            setUser(null); setLoading(false); return;
          }
          localStorage.setItem(SESSION_KEY, Date.now().toString());

          // Load or detect household
          const hh = await loadHousehold(u.uid);
          if (hh) {
            setHousehold(hh);
            setNeedsSetup(false);
            // Update last login
            try {
              await setDoc(doc(db, "users", u.uid), {
                name: u.displayName, email: u.email, photo: u.photoURL,
                lastLogin: new Date().toISOString(),
              }, { merge: true });
            } catch(e) { /* non-fatal */ }
          } else {
            setNeedsSetup(true);
          }
          setUser(u);
        } else {
          setUser(null); setHousehold(null); setNeedsSetup(false);
        }
      } catch(e) {
        console.error("Auth error:", e);
        setError("Authentication error: " + e.message);
      } finally {
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  const login = async () => {
    setError("");
    try { await signInWithPopup(auth, googleProvider); }
    catch(e) {
      if (e.code === "auth/popup-closed-by-user") return;
      if (e.code === "auth/unauthorized-domain") {
        setError("Add this domain in Firebase Auth → Authorized domains.");
      } else {
        setError("Sign-in failed: " + e.message);
      }
    }
  };

  const handleHouseholdDone = async (hhId) => {
    const hhSnap = await getDoc(doc(db, "households", hhId));
    setHousehold({ id: hhId, ...hhSnap.data() });
    setNeedsSetup(false);
  };

  const handleSignOut = async () => {
    localStorage.removeItem(SESSION_KEY);
    await signOut(auth);
    setUser(null); setHousehold(null); setNeedsSetup(false);
  };

  if (loading) return (
    <div className="login-bg">
      <div style={{ color: "var(--text2)", fontSize: 14, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <div style={{ width: 28, height: 28, border: "2px solid var(--border2)", borderTopColor: "var(--gold)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/>
        Loading…
      </div>
    </div>
  );

  return (
    <ErrorBoundary>
      <AuthContext.Provider value={{ user, household, signOut: handleSignOut }}>
        {!user      && <LoginScreen onLogin={login} error={error} />}
        {user && needsSetup && <HouseholdSetup user={user} onDone={handleHouseholdDone} />}
        {user && !needsSetup && household && <Dashboard householdId={household.id} />}
      </AuthContext.Provider>
    </ErrorBoundary>
  );
}
