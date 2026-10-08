import type { JobRecommendation, JobPosting } from "./types";

export type JobFilters = {
  query?: string;
  location?: string;
  employment?: string;
  experienceLevel?: string;
  skill?: string;
  workMode?: JobPosting["workMode"] | "all";
  source?: string;
  minimumMatch?: number;
  salaryOnly?: boolean;
  excludeIds?: ReadonlySet<string>;
};

export function filterJobs(jobs: JobRecommendation[], filters: JobFilters): JobRecommendation[] {
  const query = filters.query?.trim().toLowerCase() ?? "";
  const places = filters.location?.split(/[,\n]/).map((place) => place.trim().toLowerCase()).filter(Boolean) ?? [];
  const skill = filters.skill?.trim().toLowerCase() ?? "";

  return jobs.filter(({ job, overallScore }) => {
    const searchable = `${job.title} ${job.company} ${job.location} ${(job.locationRestrictions ?? []).join(" ")} ${job.description} ${job.skills.join(" ")}`.toLowerCase();
    return !filters.excludeIds?.has(job.id)
      && (!query || searchable.includes(query))
      && (!places.length || places.some((place) => job.location.toLowerCase().includes(place)))
      && (!filters.employment || filters.employment === "all" || job.employmentType?.toLowerCase().includes(filters.employment.toLowerCase()))
      && (!filters.experienceLevel || filters.experienceLevel === "all" || job.experienceLevel?.toLowerCase().includes(filters.experienceLevel.toLowerCase()))
      && (!skill || job.skills.some((item) => item.toLowerCase().includes(skill)))
      && (!filters.workMode || filters.workMode === "all" || job.workMode === filters.workMode)
      && (!filters.source || filters.source === "all" || (job.sources ?? [job.source]).includes(filters.source))
      && overallScore >= (filters.minimumMatch ?? 0)
      && (!filters.salaryOnly || !!job.salary);
  });
}
