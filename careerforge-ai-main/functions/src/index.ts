import { onCall, HttpsError } from "firebase-functions/v2/https";

const HIMALAYAS_API = "https://himalayas.app/jobs/api";

export const himalayasJobs = onCall(
  {
    region: "us-central1",
    timeoutSeconds: 20,
    memory: "256MiB",
    maxInstances: 10,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in to search job listings.");
    }
    const cursor = request.data && typeof request.data === "object"
      ? (request.data as { cursor?: unknown }).cursor
      : undefined;
    if (cursor !== undefined && (typeof cursor !== "string" || cursor.length > 512)) {
      throw new HttpsError("invalid-argument", "The job page cursor is invalid.");
    }

    const url = new URL(HIMALAYAS_API);
    url.searchParams.set("limit", "50");
    if (cursor) url.searchParams.set("cursor", cursor);
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        console.error(`Himalayas API returned HTTP ${response.status}.`);
        throw new HttpsError("unavailable", "Himalayas job listings are temporarily unavailable.");
      }
      const body: unknown = await response.json();
      if (!body || typeof body !== "object" || !("jobs" in body) || !Array.isArray(body.jobs)) {
        console.error("Himalayas API returned a malformed response.");
        throw new HttpsError("unavailable", "Himalayas returned an unexpected job-feed response.");
      }
      return body;
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      console.error("Himalayas API request failed.", error);
      throw new HttpsError("unavailable", "Could not reach Himalayas. Try again later.");
    }
  },
);
