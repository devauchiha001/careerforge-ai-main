const MESSAGES: Record<string, string> = {
  "auth/popup-closed-by-user": "The sign-in window was closed before finishing.",
  "auth/cancelled-popup-request": "Another sign-in window is already open.",
  "auth/unauthorized-domain": "This domain isn't authorized for sign-in. Add it under Firebase Console → Authentication → Settings → Authorized domains.",
  "auth/operation-not-allowed": "Google sign-in is disabled. Enable it under Firebase Console → Authentication → Sign-in method.",
  "auth/network-request-failed": "Network error — check your connection and try again.",
  "auth/too-many-requests": "Too many attempts. Please wait a moment and try again.",
  "auth/invalid-api-key": "The Firebase API key is invalid. Check VITE_FIREBASE_API_KEY in your .env file.",
  PERMISSION_DENIED: "The database rejected this request. Deploy the rules in database.rules.json (firebase deploy --only database).",
  "permission-denied": "The database rejected this request. Deploy the rules in database.rules.json (firebase deploy --only database).",
};

export function errorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) return String((error as { code: unknown }).code);
  if (error instanceof Error && /permission.denied/i.test(error.message)) return "PERMISSION_DENIED";
  return "";
}

/** Converts Firebase and other errors into a message suitable for the UI. */
export function friendlyError(error: unknown, fallback = "Something went wrong. Please try again."): string {
  const code = errorCode(error);
  if (MESSAGES[code]) return MESSAGES[code];
  if (error instanceof Error && error.message && !error.message.startsWith("Firebase:")) return error.message;
  return fallback;
}
