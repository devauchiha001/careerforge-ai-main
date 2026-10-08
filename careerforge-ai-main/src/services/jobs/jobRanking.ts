import { extractSkills } from "../../lib/skills";
import type { CareerProfile, ResumeData } from "../../lib/database";
import type { JobPosting, JobRecommendation } from "./types";

export const MATCH_SCORE_WEIGHTS = {
  skill: 24,
  title: 14,
  keyword: 14,
  experience: 10,
  education: 8,
  location: 12,
  workMode: 10,
  seniority: 8,
} as const;

function words(value: string): Set<string> {
  return new Set(value.toLowerCase().match(/[a-z0-9+#.]{2,}/g) ?? []);
}

function overlapScore(left: string, right: string): number {
  const a = words(left);
  const b = words(right);
  if (!a.size || !b.size) return 60;
  const shared = [...a].filter((word) => b.has(word)).length;
  return Math.round((shared / Math.max(a.size, Math.min(b.size, 5))) * 100);
}

function listSkillSet(profile: CareerProfile | null, resume: ResumeData | null): Set<string> {
  return new Set([
    ...(profile?.technicalSkills ?? profile?.skills ?? []),
    ...(profile?.softSkills ?? []),
    ...(resume?.skills ?? []),
  ].map((skill) => skill.toLowerCase()));
}

function locations(profile: CareerProfile): string[] {
  return [
    profile.city,
    profile.region,
    profile.country,
    ...(profile.preferredLocations ?? []),
    profile.location,
  ].map((value) => value?.trim().toLowerCase() ?? "").filter(Boolean);
}

function locationScore(job: JobPosting, profile: CareerProfile | null): number {
  if (!profile) return 60;
  const preferences = locations(profile);
  if (!preferences.length) return 60;
  const jobLocation = `${job.location} ${(job.locationRestrictions ?? []).join(" ")}`.toLowerCase();
  if (/worldwide|anywhere|global|multiple locations/i.test(jobLocation)) return 100;
  if (preferences.some((value) => /^(worldwide|anywhere|global|open to remote)$/.test(value))) {
    return job.workMode === "Remote" ? 100 : 75;
  }
  if (!jobLocation || /not specified by source|eligibility not specified/i.test(jobLocation)) return 60;
  return preferences.some((value) => jobLocation.includes(value) || value.includes(jobLocation)) ? 100 : 35;
}

function locationEligibility(job: JobPosting, profile: CareerProfile | null): JobPosting["eligibility"] {
  const restrictions = job.locationRestrictions ?? [];
  const country = profile?.country?.trim().toLowerCase();
  if (!restrictions.length || !country) return "unknown";
  return restrictions.some((restriction) => restriction.trim().toLowerCase() === country)
    ? "verified"
    : "unknown";
}

function workModeScore(job: JobPosting, profile: CareerProfile | null): number {
  const preference = profile?.remotePreference;
  if (!preference || preference === "any") return 70;
  if (preference === "remote") return job.workMode === "Remote" ? 100 : 25;
  if (preference === "hybrid") return job.workMode === "Hybrid" ? 100 : 35;
  return job.workMode === "On-site" ? 100 : 20;
}

function experienceScore(job: JobPosting, profile: CareerProfile | null): number {
  if (job.yearsRequired === undefined || profile?.yearsExperience == null) return 60;
  if (job.yearsRequired <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round((profile.yearsExperience / job.yearsRequired) * 100)));
}

function educationScore(job: JobPosting, profile: CareerProfile | null): number {
  const requirements = job.educationRequirements ?? [];
  if (!requirements.length || !profile?.education?.trim()) return 60;
  return requirements.some((requirement) => overlapScore(requirement, profile.education!) >= 30) ? 100 : 25;
}

function seniorityRank(value?: string): number | undefined {
  if (!value) return undefined;
  if (/intern|entry|junior|associate/i.test(value)) return 0;
  if (/mid|intermediate/i.test(value)) return 1;
  if (/senior|sr\./i.test(value)) return 2;
  if (/lead|principal|staff|director|head|executive/i.test(value)) return 3;
  return undefined;
}

function seniorityScore(job: JobPosting, profile: CareerProfile | null): number {
  const jobRank = seniorityRank(job.experienceLevel);
  const profileRank = seniorityRank(profile?.experienceLevel);
  if (jobRank === undefined || profileRank === undefined) return 60;
  return Math.max(0, 100 - Math.abs(jobRank - profileRank) * 35);
}

function recommendation(score: number): JobRecommendation["recommendation"] {
  if (score >= 80) return "Strong match";
  if (score >= 65) return "Good match";
  if (score >= 45) return "Potential match";
  return "Low match";
}

export function rankJob(
  job: JobPosting,
  profile: CareerProfile | null,
  resume: ResumeData | null,
): JobRecommendation {
  const candidateSkills = listSkillSet(profile, resume);
  const jobSkills = [...new Set([...job.skills, ...extractSkills(job.description)])];
  const matchedSkills = jobSkills.filter((skill) => candidateSkills.has(skill.toLowerCase()));
  const missingSkills = jobSkills.filter((skill) => !candidateSkills.has(skill.toLowerCase()));
  const skillScore = jobSkills.length ? Math.round((matchedSkills.length / jobSkills.length) * 100) : 60;
  const targetRoles = profile?.targetRoles?.length ? profile.targetRoles : [profile?.targetRole || profile?.headline || ""];
  const titleScore = Math.max(0, ...targetRoles.map((role) => overlapScore(job.title, role)));
  const candidateText = [
    resume?.text ?? "",
    profile?.headline ?? "",
    ...(profile?.technicalSkills ?? profile?.skills ?? []),
    ...(profile?.softSkills ?? []),
  ].join(" ");
  const keywordScore = overlapScore(job.description, candidateText);
  const scores = {
    skill: skillScore,
    title: titleScore,
    keyword: keywordScore,
    experience: experienceScore(job, profile),
    education: educationScore(job, profile),
    location: locationScore(job, profile),
    workMode: workModeScore(job, profile),
    seniority: seniorityScore(job, profile),
  };
  const scoreBreakdown = [
    { factor: "Skills", score: scores.skill, weight: MATCH_SCORE_WEIGHTS.skill },
    { factor: "Job title", score: scores.title, weight: MATCH_SCORE_WEIGHTS.title },
    { factor: "Keywords", score: scores.keyword, weight: MATCH_SCORE_WEIGHTS.keyword },
    { factor: "Experience", score: scores.experience, weight: MATCH_SCORE_WEIGHTS.experience },
    { factor: "Education", score: scores.education, weight: MATCH_SCORE_WEIGHTS.education },
    { factor: "Location", score: scores.location, weight: MATCH_SCORE_WEIGHTS.location },
    { factor: "Work mode", score: scores.workMode, weight: MATCH_SCORE_WEIGHTS.workMode },
    { factor: "Seniority", score: scores.seniority, weight: MATCH_SCORE_WEIGHTS.seniority },
  ];
  const overallScore = Math.round(
    scoreBreakdown.reduce((total, item) => total + item.score * item.weight / 100, 0),
  );
  const strongest = matchedSkills.slice(0, 4);
  const gaps = missingSkills.slice(0, 3);
  const explanation = strongest.length
    ? `Your profile matches ${strongest.join(", ")}${gaps.length ? `. The listing also mentions ${gaps.join(", ")}, which are not present in your saved skills or resume.` : ". No listed skill gaps were detected."}`
    : "This estimate combines skill, role, keyword, experience, education, location, work-mode, and seniority compatibility. Add profile details for a more specific comparison.";

  return {
    job: { ...job, eligibility: locationEligibility(job, profile) },
    overallScore,
    scoreBreakdown,
    skillScore,
    titleScore,
    keywordScore,
    experienceScore: scores.experience,
    educationScore: scores.education,
    locationScore: scores.location,
    workModeScore: scores.workMode,
    seniorityScore: scores.seniority,
    matchedSkills: strongest,
    missingSkills: gaps,
    explanation,
    recommendation: recommendation(overallScore),
  };
}

export function rankJobs(
  jobs: JobPosting[],
  profile: CareerProfile | null,
  resume: ResumeData | null,
): JobRecommendation[] {
  return jobs.map((job) => rankJob(job, profile, resume));
}
