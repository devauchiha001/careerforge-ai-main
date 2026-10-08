import { describe, expect, it } from "vitest";
import { normalizeJobicyJob, normalizeJobicyResponse } from "./jobNormalizer";
import { normalizeHimalayasJob, normalizeHimalayasResponse } from "./providers/himalayasNormalizer";
import { deduplicateJobs, loadMoreJobs, searchJobs } from "./jobSearch";
import { filterJobs } from "./jobFiltering";
import { MATCH_SCORE_WEIGHTS, rankJob } from "./jobRanking";
import type { JobPosting, JobRecommendation } from "./types";

const validJob = (overrides: Partial<JobPosting> = {}): JobPosting => ({
  id: "jobicy-1",
  title: "Senior Software Engineer",
  company: "Example Co",
  location: "Berlin, Germany",
  workMode: "Remote",
  eligibility: "unknown",
  employmentType: "Full-Time",
  experienceLevel: "Senior",
  yearsRequired: 5,
  educationRequirements: ["Bachelor"],
  description: "Build React and TypeScript applications using cloud platforms.",
  skills: ["React", "TypeScript"],
  postedAt: Date.parse("2026-10-01"),
  applyUrl: "https://jobicy.com/jobs/1",
  source: "Jobicy",
  ...overrides,
});

describe("Jobicy job normalization", () => {
  it("normalizes real source fields and keeps only safe HTTP(S) posting URLs", () => {
    const job = normalizeJobicyJob({
      id: 10,
      jobTitle: "Engineer",
      companyName: "Acme",
      jobGeo: "Berlin, Germany",
      jobDescription: "<p>Build React apps. 5+ years of professional experience. Bachelor's degree preferred.</p>",
      jobLevel: "Senior",
      pubDate: "2026-10-01T00:00:00Z",
      url: "https://jobicy.com/jobs/10",
    });
    expect(job).toMatchObject({
      id: "jobicy-10",
      title: "Engineer",
      company: "Acme",
      location: "Berlin, Germany",
      workMode: "Remote",
      source: "Jobicy",
      applyUrl: "https://jobicy.com/jobs/10",
      yearsRequired: 5,
      experienceLevel: "Senior",
    });
    expect(job?.educationRequirements).toContain("Bachelor's");
  });

  it("rejects incomplete records and unsafe URLs", () => {
    expect(normalizeJobicyJob({ id: 1, jobTitle: "Engineer", companyName: "Acme", url: "javascript:alert(1)" })).toBeNull();
    expect(normalizeJobicyJob({ id: 2, companyName: "Acme", url: "https://jobicy.com/jobs/2" })).toBeNull();
    expect(normalizeJobicyJob({ id: 3, jobTitle: "Engineer", url: "https://jobicy.com/jobs/3" })).toBeNull();
  });

  it("removes duplicate ids from source results", () => {
    const record = { id: 5, jobTitle: "Engineer", companyName: "Acme", jobGeo: "Global", url: "https://jobicy.com/jobs/5" };
    expect(normalizeJobicyResponse({ jobs: [record, record] })).toHaveLength(1);
  });

  it("rejects malformed feed payloads", () => {
    expect(() => normalizeJobicyResponse({ listings: [] })).toThrow(/unexpected response/i);
    expect(() => normalizeJobicyResponse({ jobs: null })).toThrow(/job list/i);
  });
});

describe("Himalayas job normalization and provider aggregation", () => {
  const himalayasJob = {
    guid: "https://himalayas.app/jobs/123",
    title: "Senior Software Engineer",
    companyName: "Example Co",
    applicationLink: "https://himalayas.app/jobs/123/apply",
    description: "<p>Build React and TypeScript applications. 5 years of experience.</p>",
    locationRestrictions: ["Germany"],
    seniority: ["Senior"],
    pubDate: 1_700_000_000,
  };

  it("normalizes source fields, preserves restriction data, and does not assume remote means worldwide", () => {
    const job = normalizeHimalayasJob(himalayasJob);
    expect(job).toMatchObject({
      title: "Senior Software Engineer",
      company: "Example Co",
      source: "Himalayas",
      sourceUrl: "https://himalayas.app/jobs/123",
      applyUrl: "https://himalayas.app/jobs/123/apply",
      workMode: "Remote",
      eligibility: "unknown",
      locationRestrictions: ["Germany"],
      yearsRequired: 5,
    });
    expect(job?.postedAt).toBe(1_700_000_000_000);
  });

  it("rejects incomplete or unsafe Himalayas listings and removes repeated provider IDs", () => {
    expect(normalizeHimalayasJob({ ...himalayasJob, applicationLink: "javascript:alert(1)" })).toBeNull();
    expect(normalizeHimalayasJob({ ...himalayasJob, companyName: "" })).toBeNull();
    expect(normalizeHimalayasResponse({ jobs: [himalayasJob, himalayasJob] }).jobs).toHaveLength(1);
    expect(() => normalizeHimalayasResponse({ jobs: null })).toThrow(/unexpected job-feed response/i);
  });

  it("deduplicates equivalent provider listings while retaining both source names", () => {
    const jobicy = validJob();
    const himalayas = normalizeHimalayasJob({
      ...himalayasJob,
      locationRestrictions: ["Berlin, Germany"],
      title: jobicy.title,
      companyName: jobicy.company,
      description: jobicy.description,
    })!;
    const combined = deduplicateJobs([jobicy, himalayas]);
    expect(combined).toHaveLength(1);
    expect(combined[0].sources).toEqual(["Jobicy", "Himalayas"]);
  });

  it("keeps successful provider pages available when another provider fails", async () => {
    const providers = [
      {
        id: "test-source-ok",
        name: "Test Source",
        fetchPage: async (cursor?: string) => cursor
          ? { jobs: [], nextCursor: "page-3", hasMore: true }
          : { jobs: [validJob()], nextCursor: "page-2", hasMore: true },
      },
      {
        id: "test-source-error",
        name: "Unavailable Source",
        fetchPage: async () => { throw new Error("Provider offline"); },
      },
    ];
    const firstPage = await searchJobs(providers);
    expect(firstPage.jobs).toHaveLength(1);
    expect(firstPage.providerFailures[0]).toMatchObject({ providerId: "test-source-error", message: "Provider offline" });
    expect(firstPage.providerPages["test-source-ok"]).toMatchObject({ nextCursor: "page-2", hasMore: true });

    const nextPage = await loadMoreJobs(firstPage, providers);
    expect(nextPage.jobs).toHaveLength(1);
    expect(nextPage.providerPages["test-source-ok"]).toMatchObject({ nextCursor: "page-3", hasMore: true });
  });
});

describe("job filtering and match score", () => {
  const profile = {
    displayName: "Candidate",
    email: "candidate@example.test",
    targetRoles: ["Software Engineer"],
    country: "Germany",
    city: "Berlin",
    preferredLocations: ["Berlin, Germany"],
    remotePreference: "remote" as const,
    experienceLevel: "Senior",
    yearsExperience: 6,
    education: "Bachelor of Science",
    technicalSkills: ["React", "TypeScript"],
    softSkills: ["Communication"],
    updatedAt: 0,
  };

  it("calculates a bounded, weighted and fully exposed score breakdown", () => {
    const recommendation = rankJob(validJob(), profile, null);
    const totalWeight = Object.values(MATCH_SCORE_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
    const recomputed = Math.round(recommendation.scoreBreakdown.reduce(
      (sum, item) => sum + item.score * item.weight / 100,
      0,
    ));
    expect(totalWeight).toBe(100);
    expect(recommendation.overallScore).toBe(recomputed);
    expect(recommendation.overallScore).toBeGreaterThanOrEqual(0);
    expect(recommendation.overallScore).toBeLessThanOrEqual(100);
    expect(recommendation.scoreBreakdown.map((item) => item.factor)).toEqual([
      "Skills", "Job title", "Keywords", "Experience", "Education", "Location", "Work mode", "Seniority",
    ]);
    expect(recommendation.locationScore).toBe(100);
    expect(recommendation.workModeScore).toBe(100);
    expect(recommendation.experienceScore).toBe(100);
    expect(recommendation.educationScore).toBe(100);
  });

  it("only marks location eligibility as matched when the provider explicitly lists the profile country", () => {
    const restrictedJob = validJob({ locationRestrictions: ["Germany"] });
    expect(rankJob(restrictedJob, profile, null).job.eligibility).toBe("verified");
    expect(rankJob(restrictedJob, { ...profile, country: "France" }, null).job.eligibility).toBe("unknown");
    expect(rankJob(validJob(), profile, null).job.eligibility).toBe("unknown");
  });

  it("filters by search, global location, work mode, match threshold, and excluded ids", () => {
    const recommendations = [
      { ...rankJob(validJob(), profile, null), overallScore: 90 },
      { ...rankJob(validJob({ id: "other", location: "Toronto, Canada", workMode: "Hybrid" }), profile, null), overallScore: 75 },
    ] as JobRecommendation[];

    expect(filterJobs(recommendations, { query: "engineer", location: "Berlin, Germany", workMode: "Remote" }))
      .toHaveLength(1);
    expect(filterJobs(recommendations, { location: "Toronto, Canada", workMode: "Hybrid" })[0].job.id)
      .toBe("other");
    expect(filterJobs(recommendations, { minimumMatch: 80, excludeIds: new Set(["jobicy-1"]) }))
      .toHaveLength(0);
  });
});
