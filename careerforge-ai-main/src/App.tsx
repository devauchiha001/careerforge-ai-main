import { lazy, Suspense, useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "./lib/firebase";
import { completeRedirectSignIn, isCancelledSignIn, signInWithGoogle, signOutUser } from "./lib/auth";
import { getCareerProfile, saveCareerProfile } from "./lib/database";
import { friendlyError } from "./lib/errors";
import { Brand, Spinner, ToastProvider, useToast } from "./components/ui";
import { useTheme } from "./hooks/hooks";
import Landing from "./pages/Landing";

const Dashboard = lazy(() => import("./pages/Dashboard"));

/** Keeps the stored profile in sync with the auth account without overwriting user edits. */
async function syncProfile(user: User) {
  const existing = await getCareerProfile(user.uid);
  await saveCareerProfile(user.uid, {
    displayName: existing?.displayName || user.displayName || "",
    email: user.email || "",
    photoURL: user.photoURL || undefined,
    updatedAt: existing?.updatedAt ?? Date.now(),
  });
}

function LoadingScreen({ label }: { label: string }) {
  return (
    <div className="loading-screen">
      <div className="loader-mark"><Brand compact /></div>
      <Spinner label={label} />
    </div>
  );
}

function AppContent() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const { theme, toggle } = useTheme();
  const toast = useToast();

  useEffect(() => {
    completeRedirectSignIn().catch((error) => {
      if (!isCancelledSignIn(error)) toast.error(friendlyError(error, "Google sign-in could not be completed."));
    });

    return onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
      if (currentUser) {
        syncProfile(currentUser).catch((error) => console.error("Profile sync failed:", error));
      }
    });
  }, [toast]);

  async function handleSignIn() {
    try {
      setAuthLoading(true);
      await signInWithGoogle();
    } catch (error) {
      if (!isCancelledSignIn(error)) {
        console.error("Google sign-in failed:", error);
        toast.error(friendlyError(error, "Google sign-in could not be completed. Please check Firebase Authentication and try again."));
      }
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSignOut() {
    try {
      await signOutUser();
      window.location.hash = "";
      toast.info("You've been signed out.");
    } catch (error) {
      toast.error(friendlyError(error, "Sign-out failed. Please try again."));
    }
  }

  if (loading) return <LoadingScreen label="Loading CareerForge AI…" />;
  if (user) {
    return (
      <Suspense fallback={<LoadingScreen label="Opening your workspace…" />}>
        <Dashboard user={user} onSignOut={handleSignOut} theme={theme} onToggleTheme={toggle} />
      </Suspense>
    );
  }
  return <Landing onSignIn={handleSignIn} loading={authLoading} theme={theme} onToggleTheme={toggle} />;
}

export default function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}
