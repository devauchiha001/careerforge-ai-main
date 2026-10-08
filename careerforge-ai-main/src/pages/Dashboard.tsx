import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { BriefcaseBusiness, FileText, LayoutDashboard, LogOut, Menu, Moon, Search, Sun, Target, UserRound, X } from "lucide-react";
import { Alert, Brand, Spinner } from "../components/ui";
import { navigate, useHashRoute, useUserData, type Theme } from "../hooks/hooks";
import { friendlyError } from "../lib/errors";
import type { UserData } from "../lib/database";
import Overview from "./Overview";
import ResumePage from "./ResumePage";
import JobMatchPage from "./JobMatchPage";
import ApplicationsPage from "./ApplicationsPage";
import ProfilePage from "./ProfilePage";
import JobsPage from "./JobsPage";

export type Workspace = UserData & { user: User };

const NAV = [
  { page: "overview", label: "Overview", icon: LayoutDashboard },
  { page: "resume", label: "Resume Analyzer", icon: FileText },
  { page: "match", label: "Job Match", icon: Target },
  { page: "jobs", label: "Related Jobs", icon: Search },
  { page: "applications", label: "Applications", icon: BriefcaseBusiness },
  { page: "profile", label: "Profile", icon: UserRound },
] as const;

type Props = { user: User; onSignOut: () => void; theme: Theme; onToggleTheme: () => void };

export default function Dashboard({ user, onSignOut, theme, onToggleTheme }: Props) {
  const route = useHashRoute();
  const data = useUserData(user.uid);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const active = NAV.some((n) => n.page === route.page) ? route.page : "overview";
  const ws: Workspace = { ...data, user };

  useEffect(() => {
    setDrawerOpen(false);
    window.scrollTo({ top: 0 });
  }, [route.page, route.id]);

  const displayName = data.profile?.displayName || user.displayName || user.email || "Account";
  const counts: Record<string, number | undefined> = {
    match: data.analyses.length || undefined,
    jobs: data.savedJobs.length || undefined,
    applications: data.applications.length || undefined,
  };

  return (
    <div className="shell">
      <aside className={`sidebar ${drawerOpen ? "open" : ""}`} aria-label="Main navigation">
        <div className="sidebar-head">
          <a href="#/overview" className="brand-link"><Brand /></a>
          <button className="icon-btn show-mobile" onClick={() => setDrawerOpen(false)} aria-label="Close menu"><X size={20} /></button>
        </div>
        <nav className="side-nav">
          {NAV.map(({ page, label, icon: Icon }) => (
            <a key={page} href={`#/${page}`} className={`side-link ${active === page ? "active" : ""}`} aria-current={active === page ? "page" : undefined}>
              <Icon size={18} /> <span>{label}</span>
              {counts[page] ? <span className="count">{counts[page]}</span> : null}
            </a>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="user-chip">
            <Avatar user={user} />
            <div className="user-meta">
              <strong>{displayName}</strong>
              <span>{user.email}</span>
            </div>
          </div>
          <button className="btn btn-ghost btn-block" onClick={onSignOut}><LogOut size={16} /> Sign out</button>
        </div>
      </aside>
      {drawerOpen && <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} />}

      <div className="main">
        <header className="topbar">
          <button className="icon-btn show-mobile" onClick={() => setDrawerOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
          <span className="show-mobile"><Brand /></span>
          <div className="topbar-title hide-mobile">{NAV.find((n) => n.page === active)?.label}</div>
          <div className="topbar-actions">
            <button className="icon-btn" onClick={onToggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button className="avatar-btn" onClick={() => navigate("profile")} aria-label="Open profile"><Avatar user={user} /></button>
          </div>
        </header>

        <main className="content">
          {data.error && (
            <Alert tone="error">
              <strong>Couldn't load your workspace.</strong> {friendlyError(data.error)}
            </Alert>
          )}
          {data.loading ? (
            <div className="page-loading"><Spinner size={22} label="Loading your workspace…" /></div>
          ) : (
            <div className="page fade-up" key={active}>
              {active === "overview" && <Overview ws={ws} />}
              {active === "resume" && <ResumePage ws={ws} />}
              {active === "match" && <JobMatchPage ws={ws} analysisId={route.id} />}
              {active === "jobs" && <JobsPage ws={ws} jobId={route.id} />}
              {active === "applications" && <ApplicationsPage ws={ws} />}
              {active === "profile" && <ProfilePage ws={ws} theme={theme} onToggleTheme={onToggleTheme} onSignOut={onSignOut} />}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export function Avatar({ user, size = 34 }: { user: User; size?: number }) {
  const [broken, setBroken] = useState(false);
  const initials = (user.displayName || user.email || "?").split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <span className="avatar" style={{ width: size, height: size }}>
      {user.photoURL && !broken
        ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
        : <span>{initials}</span>}
    </span>
  );
}
