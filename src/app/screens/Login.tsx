import { useState } from "react";
import { useStore } from "../store";
import { IconRadar } from "../icons";

export function Login() {
  const { login } = useStore();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="glow-header" />
      <form className="card login-card enter" onSubmit={submit}>
        <span className="logo-mark" style={{ width: 52, height: 52, margin: "0 auto", borderRadius: 16 }}>
          <IconRadar size={28} strokeWidth={1.75} />
        </span>
        <h1 className="t-headline-md" style={{ marginTop: 18 }}>
          <span className="grad-text">Distress Radar</span>
        </h1>
        <p className="t-muted" style={{ margin: "6px 0 0", fontSize: 14 }}>
          UAE distressed property deals, tracked daily.
        </p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="App password"
          aria-label="App password"
          autoFocus
        />
        {error && <p className="error-text">{error}</p>}
        <button className="btn btn-primary" style={{ width: "100%", marginTop: 16 }} disabled={busy}>
          {busy ? "Signing in…" : "Enter the radar"}
        </button>
      </form>
    </div>
  );
}
