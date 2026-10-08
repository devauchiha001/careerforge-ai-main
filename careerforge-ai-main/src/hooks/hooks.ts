import { useCallback, useEffect, useState } from "react";
import { subscribeToUserData, type UserData } from "../lib/database";

// ---------- Theme ----------

export type Theme = "light" | "dark";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme as Theme) || "dark");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#0b0d14" : "#f7f8fc");
    try {
      localStorage.setItem("cf-theme", theme);
    } catch {
      /* storage may be unavailable in private mode */
    }
  }, [theme]);

  const toggle = useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), []);
  return { theme, toggle };
}

// ---------- Hash routing (dashboard) ----------

export type Route = { page: string; id?: string };

function parseHash(): Route {
  const [page, id] = window.location.hash.replace(/^#\/?/, "").split("/");
  return { page: page || "overview", id: id || undefined };
}

export function useHashRoute() {
  const [route, setRoute] = useState<Route>(parseHash);
  useEffect(() => {
    const onChange = () => setRoute(parseHash());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export function navigate(page: string, id?: string) {
  window.location.hash = `/${page}${id ? `/${id}` : ""}`;
}

// ---------- Realtime user data ----------

export function useUserData(uid: string) {
  const [data, setData] = useState<UserData>({ profile: null, resume: null, analyses: [], applications: [], savedJobs: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    return subscribeToUserData(
      uid,
      (next) => {
        setData(next);
        setLoading(false);
      },
      (err) => {
        console.error("Failed to load workspace data:", err);
        setError(err);
        setLoading(false);
      },
    );
  }, [uid]);

  return { ...data, loading, error };
}
