import { Link, matchPath, RouterProvider, useRouter } from "./router";
import { StoreProvider, useStore } from "./store";
import {
  IconBell,
  IconBookmark,
  IconGrid,
  IconLogout,
  IconRadar,
  IconSliders,
} from "./icons";
import { Dashboard } from "./screens/Dashboard";
import { DealDetail } from "./screens/DealDetail";
import { Saved } from "./screens/Saved";
import { Settings } from "./screens/Settings";
import { Login } from "./screens/Login";

const nav = [
  { to: "/", label: "Dashboard", icon: IconGrid },
  { to: "/saved", label: "Saved", icon: IconBookmark },
  { to: "/settings", label: "Settings", icon: IconSliders },
];

function navActive(path: string, to: string): boolean {
  return to === "/" ? path === "/" || path.startsWith("/deals") : path.startsWith(to);
}

function Logo() {
  return (
    <Link to="/" className="logo" aria-label="Distress Radar home">
      <span className="logo-mark">
        <IconRadar size={20} strokeWidth={1.75} />
      </span>
      <span className="logo-word grad-text">DISTRESS RADAR</span>
    </Link>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { path } = useRouter();
  const { dataSource, logout } = useStore();

  return (
    <div className="shell">
      <aside className="sidebar">
        <Logo />
        <nav className="nav-desktop">
          {nav.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={`nav-item${navActive(path, to) ? " active" : ""}`}
              aria-current={navActive(path, to) ? "page" : undefined}
            >
              <Icon size={19} strokeWidth={navActive(path, to) ? 2 : 1.5} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-foot">
          <p className="t-caps" style={{ margin: 0 }}>
            Radar status
          </p>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--ink-2)" }}>
            <span className={`dot ${dataSource === "live" ? "dot-ok" : "dot-warn"}`} />{" "}
            {dataSource === "live" ? "Live listings feed" : "Demo snapshot"}
          </p>
          <button
            onClick={logout}
            className="btn-ghost"
            style={{ marginTop: 10, padding: "6px 8px", fontSize: 13, display: "inline-flex", gap: 8, alignItems: "center" }}
          >
            <IconLogout size={15} /> Sign out
          </button>
        </div>
      </aside>

      <header className="topbar">
        <Logo />
        <Link to="/saved" className="icon-btn" aria-label="Alerts">
          <IconBell size={20} />
        </Link>
      </header>

      <main className="main">
        <div className="container">{children}</div>
      </main>

      <nav className="tabbar">
        {nav.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className={`tab${navActive(path, to) ? " active" : ""}`}
            aria-current={navActive(path, to) ? "page" : undefined}
          >
            <Icon size={22} strokeWidth={navActive(path, to) ? 2 : 1.5} />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function Routes() {
  const { path } = useRouter();
  const { phase, loadError } = useStore();

  if (phase === "loading") {
    return (
      <div className="login-wrap">
        <p className="t-muted">Loading Distress Radar…</p>
      </div>
    );
  }
  if (phase === "login") return <Login />;
  if (phase === "error") {
    return (
      <div className="login-wrap">
        <div className="card login-card">
          <h1 className="t-headline-md">Can’t reach the radar</h1>
          <p className="t-muted" style={{ fontSize: 14 }}>
            {loadError ?? "The API did not respond."}
          </p>
        </div>
      </div>
    );
  }

  const deal = matchPath("/deals/:id", path);
  if (deal) {
    return (
      <Shell>
        <DealDetail id={deal.id} />
      </Shell>
    );
  }
  if (path.startsWith("/saved")) {
    return (
      <Shell>
        <Saved />
      </Shell>
    );
  }
  if (path.startsWith("/settings")) {
    return (
      <Shell>
        <Settings />
      </Shell>
    );
  }
  return (
    <Shell>
      <Dashboard />
    </Shell>
  );
}

export function App() {
  return (
    <RouterProvider>
      <StoreProvider>
        <Routes />
      </StoreProvider>
    </RouterProvider>
  );
}
