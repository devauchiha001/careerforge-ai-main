import {
  GoogleAuthProvider,
  getRedirectResult,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from "firebase/auth";
import { auth } from "./firebase";
import { errorCode } from "./errors";

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

/** Cancelled sign-ins are user choices, not errors worth surfacing. */
export function isCancelledSignIn(error: unknown) {
  const code = errorCode(error);
  return code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request" || code === "auth/user-cancelled";
}

/** Signs in with a popup, falling back to a full-page redirect when popups are blocked. */
export async function signInWithGoogle(): Promise<User | null> {
  try {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (error) {
    const code = errorCode(error);
    if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
      await signInWithRedirect(auth, provider);
      return null;
    }
    throw error;
  }
}

/** Surfaces errors from a redirect sign-in that completed on page load. */
export function completeRedirectSignIn() {
  return getRedirectResult(auth);
}

export function signOutUser() {
  return signOut(auth);
}
