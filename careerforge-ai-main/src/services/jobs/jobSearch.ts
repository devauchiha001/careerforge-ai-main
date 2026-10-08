import type { JobProvider } from "./jobProvider";
import type { JobPosting, JobSearchPage, ProviderFailure, ProviderPageState } from "./types";

const CACHE_TTL = 6 * 60 * 60 * 1000;
const MAX_CACHED_JOBS = 200;
const CACHE_VERSION = "v3";

export type CachedJobs = JobSearchPage & { fetchedAt: number; stale?: boolean };
const pending = new Map<string, Promise<CachedJobs>>();

function failure(provider: JobProvider, error: unknown): ProviderFailure {
  const message = error instanceof Error ? error.message : "Could not load listings from this source.";
  return { providerId: provider.id, providerName: provider.name, message };
}

function readCache(key: string): CachedJobs | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const cache = JSON.parse(raw) as Partial<CachedJobs>;
    if (!Array.isArray(cache.jobs) || !Number.isFinite(cache.fetchedAt)) return null;
    return {
      jobs: cache.jobs,
      fetchedAt: cache.fetchedAt!,
      stale: cache.stale === true || Date.now() - cache.fetchedAt! >= CACHE_TTL,
      providerIds: Array.isArray(cache.providerIds) ? cache.providerIds : [],
      providerPages: cache.providerPages && typeof cache.providerPages === "object" ? cache.providerPages : {},
      providerFailures: Array.isArray(cache.providerFailures) ? cache.providerFailures : [],
      hasMore: cache.hasMore === true,
    };
  } catch {
    return null;
  }
}

function writeCache(key: string, result: CachedJobs) {
  try {
    localStorage.setItem(key, JSON.stringify(result));
  } catch {
    // Storage may be unavailable or full; the in-memory response remains usable.
  }
}

function canonicalUrl(job: JobPosting): string {
  try {
    const url = new URL(job.sourceUrl || job.applyUrl);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|ref$|source$)/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return "";
  }
}

function fingerprint(job: JobPosting): string {
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return `${normalize(job.title)}|${normalize(job.company)}|${normalize(job.location)}`;
}

export function deduplicateJobs(jobs: JobPosting[]): JobPosting[] {
  const unique = new Map<string, JobPosting>();
  const byUrl = new Map<string, string>();
  const byFingerprint = new Map<string, string>();
  for (const job of jobs) {
    const url = canonicalUrl(job);
    const titleAndLocation = fingerprint(job);
    const existingKey = (url && byUrl.get(url)) || byFingerprint.get(titleAndLocation);
    const existing = existingKey ? unique.get(existingKey) : undefined;
    if (!existingKey || !existing) {
      const key = job.id;
      unique.set(key, job);
      if (url) byUrl.set(url, key);
      byFingerprint.set(titleAndLocation, key);
      continue;
    }
    const sources = [...new Set([...(existing.sources ?? [existing.source]), ...(job.sources ?? [job.source])])];
    const merged: JobPosting = {
      ...existing,
      sources,
      source: existing.source,
      sourceUrl: existing.sourceUrl || job.sourceUrl,
      sourceLinks: [...new Map(
        [...(existing.sourceLinks ?? [{ name: existing.source, url: existing.sourceUrl || existing.applyUrl }]),
          ...(job.sourceLinks ?? [{ name: job.source, url: job.sourceUrl || job.applyUrl }])]
          .map((link) => [`${link.name}:${link.url}`, link]),
      ).values()],
      eligibility: existing.eligibility === "restricted" || job.eligibility === "restricted"
        ? "restricted"
        : existing.eligibility === "verified" && job.eligibility === "verified" ? "verified" : "unknown",
      locationRestrictions: [...new Set([...(existing.locationRestrictions ?? []), ...(job.locationRestrictions ?? [])])],
      timezoneRestrictions: [...new Set([...(existing.timezoneRestrictions ?? []), ...(job.timezoneRestrictions ?? [])])],
    };
    unique.set(existingKey, merged);
    const mergedUrl = canonicalUrl(merged);
    if (mergedUrl) byUrl.set(mergedUrl, existingKey);
    byFingerprint.set(fingerprint(merged), existingKey);
  }
  return [...unique.values()];
}

function cacheKey(providers: JobProvider[]): string {
  return `careerforge-${CACHE_VERSION}-${providers.map(({ id }) => id).sort().join("-")}-jobs`;
}

function withOverallPageState(page: JobSearchPage): JobSearchPage {
  const pages = Object.values(page.providerPages);
  const hasMore = pages.some((state) => state.hasMore);
  return { ...page, hasMore, nextCursor: undefined };
}

/** Fetches all enabled public providers independently and preserves partial results. */
export async function searchJobs(providers?: JobProvider[], forceRefresh = false): Promise<CachedJobs> {
  const enabledProviders = providers ?? (await import("./providers")).JOB_PROVIDERS;
  const key = cacheKey(enabledProviders);
  const cached = readCache(key);
  if (cached && !cached.stale && !forceRefresh) return cached;
  const activeRequest = pending.get(key);
  if (activeRequest) return activeRequest;

  const request = (async () => {
    const results = await Promise.allSettled(enabledProviders.map((provider) => provider.fetchPage()));
    const providerPages: Record<string, ProviderPageState> = {};
    const providerFailures: ProviderFailure[] = [];
    const allJobs: JobPosting[] = [];
    results.forEach((result, index) => {
      const provider = enabledProviders[index];
      if (result.status === "fulfilled") {
        allJobs.push(...result.value.jobs);
        providerPages[provider.id] = {
          nextCursor: result.value.nextCursor,
          hasMore: result.value.hasMore && !!result.value.nextCursor,
        };
      } else {
        providerFailures.push(failure(provider, result.reason));
        providerPages[provider.id] = { hasMore: false };
      }
    });
    const jobs = deduplicateJobs(allJobs).slice(0, MAX_CACHED_JOBS);
    const page = withOverallPageState({
      jobs,
      hasMore: false,
      providerPages,
      providerIds: enabledProviders.map(({ id }) => id),
      providerFailures,
    });
    if (providerFailures.length === enabledProviders.length && cached?.jobs.length) {
      const staleResult = {
        ...cached,
        stale: true,
        providerFailures,
      };
      writeCache(key, staleResult);
      return staleResult;
    }
    const result: CachedJobs = { ...page, fetchedAt: Date.now() };
    if (jobs.length >= MAX_CACHED_JOBS) result.hasMore = false;
    writeCache(key, result);
    return result;
  })().finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}

/** Paginates every provider that has a cursor and retains successful pages if another provider fails. */
export async function loadMoreJobs(
  current: CachedJobs,
  providers?: JobProvider[],
): Promise<CachedJobs> {
  const enabledProviders = providers ?? (await import("./providers")).JOB_PROVIDERS;
  if (!current.hasMore || current.jobs.length >= MAX_CACHED_JOBS) return current;
  const key = cacheKey(enabledProviders);
  const requestKey = `${key}:${enabledProviders.map((provider) => current.providerPages[provider.id]?.nextCursor ?? "").join("|")}`;
  const activeRequest = pending.get(requestKey);
  if (activeRequest) return activeRequest;

  const request = (async () => {
    const moreProviders = enabledProviders.filter((provider) => current.providerPages[provider.id]?.hasMore
      && current.providerPages[provider.id]?.nextCursor);
    const results = await Promise.allSettled(moreProviders.map((provider) =>
      provider.fetchPage(current.providerPages[provider.id]?.nextCursor)));
    const providerPages = { ...current.providerPages };
    const providerFailures = current.providerFailures.filter((item) =>
      !moreProviders.some((provider) => provider.id === item.providerId));
    const newJobs: JobPosting[] = [...current.jobs];

    results.forEach((result, index) => {
      const provider = moreProviders[index];
      if (result.status === "fulfilled") {
        newJobs.push(...result.value.jobs);
        providerPages[provider.id] = {
          nextCursor: result.value.nextCursor,
          hasMore: result.value.hasMore && !!result.value.nextCursor,
        };
      } else {
        providerFailures.push(failure(provider, result.reason));
      }
    });
    const jobs = deduplicateJobs(newJobs).slice(0, MAX_CACHED_JOBS);
    const page = withOverallPageState({
      jobs,
      hasMore: false,
      providerPages,
      providerIds: current.providerIds,
      providerFailures,
    });
    const result: CachedJobs = {
      ...page,
      fetchedAt: Date.now(),
      stale: results.length > 0 && results.every((item) => item.status === "rejected"),
    };
    if (jobs.length >= MAX_CACHED_JOBS) result.hasMore = false;
    writeCache(key, result);
    return result;
  })().finally(() => pending.delete(requestKey));
  pending.set(requestKey, request);
  return request;
}
