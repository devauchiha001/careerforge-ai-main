export type JobPosting = {
  id: string;
  providerJobId?: string;
  title: string;
  company: string;
  location: string;
  workMode: "Remote" | "Hybrid" | "On-site";
  employmentType?: string;
  experienceLevel?: string;
  yearsRequired?: number;
  educationRequirements?: string[];
  locationRestrictions?: string[];
  timezoneRestrictions?: Array<string | number>;
  eligibility: "verified" | "restricted" | "unknown";
  description: string;
  skills: string[];
  salary?: string;
  salaryValue?: number;
  salaryCurrency?: string;
  salaryPeriod?: string;
  postedAt?: number;
  applyUrl: string;
  source: string;
  sources?: string[];
  sourceUrl?: string;
  sourceLinks?: Array<{ name: string; url: string }>;
};

export type JobProviderPage = {
  jobs: JobPosting[];
  nextCursor?: string;
  hasMore: boolean;
};

export type ProviderPageState = { nextCursor?: string; hasMore: boolean };
export type ProviderFailure = { providerId: string; providerName: string; message: string };
export type JobSearchPage = JobProviderPage & {
  providerPages: Record<string, ProviderPageState>;
  providerIds: string[];
  providerFailures: ProviderFailure[];
};

export type JobRecommendation = {
  job: JobPosting;
  overallScore: number;
  scoreBreakdown: Array<{ factor: string; score: number; weight: number }>;
  skillScore: number;
  titleScore: number;
  keywordScore: number;
  experienceScore: number;
  educationScore: number;
  locationScore: number;
  workModeScore: number;
  seniorityScore: number;
  matchedSkills: string[];
  missingSkills: string[];
  explanation: string;
  recommendation: "Strong match" | "Good match" | "Potential match" | "Low match";
};

export type SavedJobStatus = "saved" | "interested" | "applied";

export type SavedJob = {
  id: string;
  job: JobPosting;
  status: SavedJobStatus;
  notes?: string;
  savedAt: number;
  updatedAt: number;
};
