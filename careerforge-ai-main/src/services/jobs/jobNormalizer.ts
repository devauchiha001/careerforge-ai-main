import { extractSkills } from "../../lib/skills";
import type { JobPosting } from "./types";

type RawJob = Record<string, unknown>;

export function providerText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function number(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export function providerList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
  return typeof value === "string" ? value.split(/[,|]/).map((item) => item.trim()).filter(Boolean) : [];
}

export function providerPlainText(value: string): string {
  if (!value) return "";
  try {
    const document = new DOMParser().parseFromString(value, "text/html");
    document.querySelectorAll("script, style").forEach((element) => element.remove());
    return (document.body.textContent || "").replace(/\s+/g, " ").trim().slice(0, 12_000);
  } catch {
    return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 12_000);
  }
}

export function validHttpUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function salaryText(min?: number, max?: number, currency?: string, period?: string): string | undefined {
  if (min === undefined && max === undefined) return undefined;
  const amount = (value: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
  const range = min !== undefined && max !== undefined
    ? `${amount(min)}–${amount(max)}`
    : amount(min ?? max!);
  return `${currency ? `${currency} ` : ""}${range}${period ? ` / ${period.toLowerCase()}` : ""}`;
}

function detectedEducation(textValue: string): string[] {
  const patterns = [
    /\b(?:bachelor(?:'s)?|b\.?s\.?|b\.?a\.?|undergraduate)\b/i,
    /\b(?:master(?:'s)?|m\.?s\.?|m\.?a\.?|postgraduate)\b/i,
    /\b(?:ph\.?d\.?|doctorate)\b/i,
    /\bassociate(?:'s)? degree\b/i,
    /\bdiploma\b/i,
  ];
  return [...new Set(patterns.flatMap((pattern) => {
    const match = textValue.match(pattern);
    return match ? [match[0]] : [];
  }))];
}

function detectedYears(textValue: string): number | undefined {
  const match = textValue.match(/\b(\d{1,2})\s*\+?\s*(?:years?|yrs?)(?:\s+of)?\s+(?:professional\s+)?experience\b/i)
    ?? textValue.match(/\bminimum\s+of\s+(\d{1,2})\s+years?\b/i);
  return match ? Number(match[1]) : undefined;
}

/** Normalizes Jobicy's public feed while discarding incomplete or unsafe listings. */
export function normalizeJobicyJob(raw: RawJob): JobPosting | null {
  const rawId = raw.id;
  const id = typeof rawId === "string" || typeof rawId === "number" ? `jobicy-${rawId}` : "";
  const title = providerText(raw.jobTitle);
  const company = providerText(raw.companyName);
  const applyUrl = validHttpUrl(providerText(raw.url));
  if (!id || !title || !company || !applyUrl) return null;

  const description = providerPlainText(providerText(raw.jobDescription) || providerText(raw.jobExcerpt));
  const tags = providerList(raw.jobTags);
  const skills = [...new Set([...extractSkills(`${tags.join(" ")} ${description}`)])];
  const min = number(raw.salaryMin);
  const max = number(raw.salaryMax);
  const salaryCurrency = providerText(raw.salaryCurrency) || undefined;
  const salaryPeriod = providerText(raw.salaryPeriod) || undefined;
  const dateValue = providerText(raw.pubDate);
  const parsedDate = dateValue ? Date.parse(dateValue) : Number.NaN;
  const jobTypes = providerList(raw.jobType);
  const location = providerText(raw.jobGeo) || "Not specified by source";
  const experienceLevel = providerText(raw.jobLevel) || undefined;
  const requirementsText = `${experienceLevel ?? ""} ${description}`;
  const rawMode = providerText(raw.workMode).toLowerCase();
  const workMode = rawMode.includes("hybrid")
    ? "Hybrid"
    : rawMode.includes("on-site") || rawMode.includes("onsite")
      ? "On-site"
      : "Remote";

  return {
    id,
    title,
    company,
    location,
    workMode,
    eligibility: "unknown",
    employmentType: jobTypes.length ? jobTypes.join(", ") : undefined,
    experienceLevel,
    yearsRequired: detectedYears(requirementsText),
    educationRequirements: detectedEducation(description),
    description,
    skills,
    salary: salaryText(min, max, salaryCurrency, salaryPeriod),
    salaryValue: min ?? max,
    salaryCurrency,
    salaryPeriod,
    postedAt: Number.isFinite(parsedDate) ? parsedDate : undefined,
    applyUrl,
    source: "Jobicy",
    sources: ["Jobicy"],
    sourceUrl: applyUrl,
    sourceLinks: [{ name: "Jobicy", url: applyUrl }],
  };
}

export function normalizeJobicyResponse(value: unknown): JobPosting[] {
  if (!value || typeof value !== "object" || !("jobs" in value)) {
    throw new Error("The job source returned an unexpected response.");
  }
  const jobs = (value as { jobs?: unknown }).jobs;
  if (!Array.isArray(jobs)) throw new Error("The job source did not return a job list.");
  const normalized = jobs
    .filter((job): job is RawJob => !!job && typeof job === "object")
    .map(normalizeJobicyJob)
    .filter((job): job is JobPosting => job !== null);
  return [...new Map(normalized.map((job) => [job.id, job])).values()];
}
