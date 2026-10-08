import { normalizeJobicyResponse } from "../jobNormalizer";
import type { JobProvider } from "../jobProvider";

export const jobicyProvider: JobProvider = {
  id: "jobicy",
  name: "Jobicy",
  async fetchPage(cursor) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const url = new URL("https://jobicy.com/api/v2/remote-jobs");
      url.searchParams.set("count", "50");
      if (cursor) url.searchParams.set("cursor", cursor);
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error(`The job source is temporarily unavailable (HTTP ${response.status}).`);
      const payload: unknown = await response.json();
      const jobs = normalizeJobicyResponse(payload);
      const data = payload as { nextCursor?: unknown; hasMore?: unknown };
      const nextCursor = typeof data.nextCursor === "string" && data.nextCursor ? data.nextCursor : undefined;
      return { jobs, nextCursor, hasMore: data.hasMore === true && !!nextCursor };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("The Jobicy search timed out. Check your connection and try again.");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  },
};
