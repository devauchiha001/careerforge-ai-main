import { extractSkills } from "../../../lib/skills";
import { providerList, providerPlainText, providerText, validHttpUrl } from "../jobNormalizer";
import type { JobPosting } from "../types";

type RawHimalayasJob = Record<string, unknown>;

function number(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function postedDate(value: unknown): number | undefined {
  if (typeof value === "number" || (typeof value === "string" && /^\d+$/.test(value))) {
    const timestamp = number(value);
    return timestamp === undefined ? undefined : timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
  }
  if (typeof value !== "string") return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function yearsRequired(description: string, seniority: string[]): number | undefined {
  const text = `${seniority.join(" ")} ${description}`;
  const match = text.match(/\b(\d{1,2})\s*\+?\s*(?:years?|yrs?)(?:\s+of)?\s+(?:professional\s+)?experience\b/i);
  return match ? Number(match[1]) : undefined;
}

function educationRequirements(description: string): string[] {
  return [
    /\b(?:bachelor(?:'s)?|b\.?s\.?|b\.?a\.?)\b/i,
    /\b(?:master(?:'s)?|m\.?s\.?|m\.?a\.?)\b/i,
    /\b(?:ph\.?d\.?|doctorate)\b/i,
    /\bassociate(?:'s)? degree\b/i,
    /\bdiploma\b/i,
  ].flatMap((pattern) => {
    const match = description.match(pattern);
    return match ? [match[0]] : [];
  });
}

function salary(raw: RawHimalayasJob): string | undefined {
  const min = number(raw.minSalary);
  const max = number(raw.maxSalary);
  if (min === undefined && max === undefined) return undefined;
  const format = (value: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
  const range = min !== undefined && max !== undefined ? `${format(min)}–${format(max)}` : format(min ?? max!);
  const currency = providerText(raw.currency);
  const period = providerText(raw.salaryPeriod);
  return `${currency ? `${currency} ` : ""}${range}${period ? ` / ${period}` : ""}`;
}

export function normalizeHimalayasJob(raw: RawHimalayasJob): JobPosting | null {
  const providerJobId = providerText(raw.guid);
  const title = providerText(raw.title);
  const company = providerText(raw.companyName);
  const applyUrl = validHttpUrl(providerText(raw.applicationLink) || providerJobId);
  if (!providerJobId || !title || !company || !applyUrl) return null;

  const description = providerPlainText(providerText(raw.description) || providerText(raw.excerpt));
  const locationRestrictions = providerList(raw.locationRestrictions);
  const timezoneRestrictions = (Array.isArray(raw.timezoneRestrictions) ? raw.timezoneRestrictions : [])
    .filter((value): value is string | number =>
      typeof value === "string" || (typeof value === "number" && Number.isFinite(value)));
  const seniority = providerList(raw.seniority);
  const postedAt = postedDate(raw.pubDate);

  return {
    id: `himalayas-${providerJobId}`,
    providerJobId,
    title,
    company,
    location: locationRestrictions.length ? locationRestrictions.join(", ") : "Remote · eligibility not specified",
    workMode: "Remote",
    eligibility: "unknown",
    employmentType: providerText(raw.employmentType) || undefined,
    experienceLevel: seniority.join(", ") || undefined,
    yearsRequired: yearsRequired(description, seniority),
    educationRequirements: educationRequirements(description),
    description,
    skills: [...new Set([...providerList(raw.categories), ...extractSkills(description)])],
    salary: salary(raw),
    salaryValue: number(raw.minSalary) ?? number(raw.maxSalary),
    salaryCurrency: providerText(raw.currency) || undefined,
    salaryPeriod: providerText(raw.salaryPeriod) || undefined,
    postedAt,
    applyUrl,
    source: "Himalayas",
    sources: ["Himalayas"],
    sourceUrl: validHttpUrl(providerJobId) ?? applyUrl,
    sourceLinks: [{ name: "Himalayas", url: validHttpUrl(providerJobId) ?? applyUrl }],
    locationRestrictions,
    timezoneRestrictions,
  };
}

export function normalizeHimalayasResponse(value: unknown): { jobs: JobPosting[]; nextCursor?: string; hasMore: boolean } {
  if (!value || typeof value !== "object" || !("jobs" in value) || !Array.isArray(value.jobs)) {
    throw new Error("Himalayas returned an unexpected job-feed response.");
  }
  const payload = value as { jobs: unknown[]; nextCursor?: unknown };
  const jobs = payload.jobs
    .filter((job): job is RawHimalayasJob => !!job && typeof job === "object")
    .map(normalizeHimalayasJob)
    .filter((job): job is JobPosting => job !== null);
  const nextCursor = typeof payload.nextCursor === "string" && payload.nextCursor ? payload.nextCursor : undefined;
  return {
    jobs: [...new Map(jobs.map((job) => [job.id, job])).values()],
    nextCursor,
    hasMore: !!nextCursor,
  };
}
