const REQUIRED_ENV = {
  VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY,
  VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  VITE_FIREBASE_DATABASE_URL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  VITE_FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID,
} as const;

/** Names of required Firebase variables that are missing or blank. */
export function getMissingEnv(): string[] {
  return Object.entries(REQUIRED_ENV)
    .filter(([, value]) => !value || !String(value).trim())
    .map(([name]) => name);
}

export const GEMINI_MODEL = import.meta.env.VITE_GEMINI_MODEL?.trim() || "gemini-3.5-flash";
