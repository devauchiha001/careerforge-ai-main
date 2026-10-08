import { get, onValue, push, ref, remove, set, update } from "firebase/database";
import { database } from "./firebase";
import type { JobPosting, SavedJob, SavedJobStatus } from "../services/jobs/types";

export type CareerProfile = {
  displayName: string;
  email: string;
  photoURL?: string;
  headline?: string;
  targetRole?: string;
  targetRoles?: string[];
  location?: string;
  country?: string;
  region?: string;
  city?: string;
  preferredLocations?: string[];
  remotePreference?: "any" | "remote" | "hybrid" | "on-site";
  experienceLevel?: string;
  yearsExperience?: number | null;
  education?: string;
  skills?: string[];
  technicalSkills?: string[];
  softSkills?: string[];
  updatedAt: number;
};

export type ResumeCheck = { id: string; label: string; passed: boolean; tip: string };

export type ResumeData = {
  fileName: string;
  text: string;
  skills: string[];
  wordCount: number;
  score: number;
  checks: ResumeCheck[];
  contact: { email?: string; phone?: string; linkedin?: string; github?: string };
  uploadedAt: number;
};

export type GeneratedKind = "coverLetter" | "recruiterMessage" | "summary" | "interview" | "applicationIntro" | "whyHire";

export type GeneratedDoc = { text: string; source: "ai" | "template"; createdAt: number };

export type JobAnalysis = {
  id: string;
  jobTitle: string;
  company: string;
  jobDescription: string;
  score: number;
  skillScore: number;
  keywordScore: number;
  matchedSkills: string[];
  missingSkills: string[];
  matchedKeywords: string[];
  missingKeywords: string[];
  yearsRequired?: number;
  suggestions: string[];
  generated?: Partial<Record<GeneratedKind, GeneratedDoc>>;
  createdAt: number;
};

export const APPLICATION_STATUSES = ["saved", "applied", "interview", "offer", "rejected"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export type Application = {
  id: string;
  company: string;
  role: string;
  status: ApplicationStatus;
  url?: string;
  location?: string;
  notes?: string;
  source?: string;
  appliedOn?: string;
  analysisId?: string;
  score?: number;
  createdAt: number;
  updatedAt: number;
};

export type UserData = {
  profile: CareerProfile | null;
  resume: ResumeData | null;
  analyses: JobAnalysis[];
  applications: Application[];
  savedJobs: SavedJob[];
};

const userRef = (uid: string, path = "") => ref(database, `users/${uid}${path ? `/${path}` : ""}`);

/** Realtime Database rejects `undefined`; strip it (recursively) before writing. */
function clean<T>(value: T): T {
  if (Array.isArray(value)) return value.map(clean) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).filter(([, v]) => v !== undefined).map(([k, v]) => [k, clean(v)]),
    ) as T;
  }
  return value;
}

/** RTDB drops empty arrays and stores sparse ones as objects; normalise back to arrays. */
function arr<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value.filter((v) => v != null);
  if (value && typeof value === "object") return Object.values(value) as T[];
  return [];
}

function normaliseAnalysis(id: string, raw: Record<string, unknown>): JobAnalysis {
  const a = raw as unknown as JobAnalysis;
  return {
    ...a,
    id,
    jobTitle: a.jobTitle || "Untitled role",
    company: a.company || "",
    matchedSkills: arr(raw.matchedSkills),
    missingSkills: arr(raw.missingSkills),
    matchedKeywords: arr(raw.matchedKeywords),
    missingKeywords: arr(raw.missingKeywords),
    suggestions: arr(raw.suggestions),
  };
}

function normalise(raw: Record<string, any> | null): UserData {
  const profile = raw?.profile ? {
    ...raw.profile,
    targetRoles: arr<string>(raw.profile.targetRoles).length
      ? arr<string>(raw.profile.targetRoles)
      : raw.profile.targetRole ? [raw.profile.targetRole] : [],
    preferredLocations: arr<string>(raw.profile.preferredLocations),
    technicalSkills: arr<string>(raw.profile.technicalSkills).length
      ? arr<string>(raw.profile.technicalSkills)
      : arr<string>(raw.profile.skills),
    softSkills: arr<string>(raw.profile.softSkills),
    skills: arr<string>(raw.profile.technicalSkills).length
      ? arr<string>(raw.profile.technicalSkills)
      : arr<string>(raw.profile.skills),
  } : null;
  const resume = raw?.resume
    ? { ...raw.resume, skills: arr<string>(raw.resume.skills), checks: arr<ResumeCheck>(raw.resume.checks), contact: raw.resume.contact || {} }
    : null;
  const analyses = Object.entries<Record<string, unknown>>(raw?.analyses || {})
    .map(([id, a]) => normaliseAnalysis(id, a))
    .sort((a, b) => b.createdAt - a.createdAt);
  const applications = Object.entries<Omit<Application, "id">>(raw?.applications || {})
    .map(([id, a]) => ({ ...a, id, status: APPLICATION_STATUSES.includes(a.status) ? a.status : "saved" }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const savedJobs = Object.entries<Record<string, any>>(raw?.savedJobs || {})
    .flatMap(([id, saved]) => {
      if (!saved?.job || typeof saved.job !== "object" || !saved.job.title || !saved.job.applyUrl) return [];
      const status: SavedJobStatus = ["saved", "interested", "applied"].includes(saved.status) ? saved.status : "saved";
      const sourceLinks = Array.isArray(saved.job.sourceLinks)
        ? saved.job.sourceLinks.filter((link: unknown): link is { name: string; url: string } =>
          !!link && typeof link === "object"
          && typeof (link as { name?: unknown }).name === "string"
          && typeof (link as { url?: unknown }).url === "string")
        : [];
      return [{
        ...saved,
        id,
        job: {
          ...saved.job,
          skills: arr<string>(saved.job.skills),
          sources: arr<string>(saved.job.sources),
          sourceLinks: sourceLinks.length ? sourceLinks : undefined,
          locationRestrictions: arr<string>(saved.job.locationRestrictions),
          timezoneRestrictions: arr<string | number>(saved.job.timezoneRestrictions),
          eligibility: ["verified", "restricted", "unknown"].includes(saved.job.eligibility) ? saved.job.eligibility : "unknown",
        } as JobPosting,
        status,
      } as SavedJob];
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
  return { profile, resume, analyses, applications, savedJobs };
}

/** Streams everything stored for a user. Returns an unsubscribe function. */
export function subscribeToUserData(uid: string, onData: (data: UserData) => void, onError: (error: Error) => void) {
  return onValue(userRef(uid), (snapshot) => onData(normalise(snapshot.val())), onError);
}

// ---------- Profile ----------

/** Merges profile fields so existing data (headline, skills…) is never overwritten on sign-in. */
export async function saveCareerProfile(uid: string, profile: CareerProfile) {
  await update(userRef(uid, "profile"), clean(profile));
}

export async function updateCareerProfile(uid: string, changes: Partial<CareerProfile>) {
  await update(userRef(uid, "profile"), clean({ ...changes, updatedAt: Date.now() }));
}

export async function getCareerProfile(uid: string) {
  const snapshot = await get(userRef(uid, "profile"));
  return snapshot.exists() ? (snapshot.val() as CareerProfile) : null;
}

// ---------- Resume ----------

export async function saveResume(uid: string, resume: ResumeData) {
  await set(userRef(uid, "resume"), clean(resume));
}

export async function deleteResume(uid: string) {
  await remove(userRef(uid, "resume"));
}

// ---------- Job analyses ----------

export async function createAnalysis(uid: string, analysis: Omit<JobAnalysis, "id">) {
  const node = push(userRef(uid, "analyses"));
  await set(node, clean(analysis));
  return node.key!;
}

export async function saveGeneratedDoc(uid: string, analysisId: string, kind: GeneratedKind, doc: GeneratedDoc) {
  await set(userRef(uid, `analyses/${analysisId}/generated/${kind}`), clean(doc));
}

export async function deleteAnalysis(uid: string, analysisId: string) {
  await remove(userRef(uid, `analyses/${analysisId}`));
}

// ---------- Applications ----------

export type ApplicationInput = Omit<Application, "id" | "createdAt" | "updatedAt">;

export async function createApplication(uid: string, input: ApplicationInput) {
  const now = Date.now();
  const node = push(userRef(uid, "applications"));
  await set(node, clean({ ...input, createdAt: now, updatedAt: now }));
  return node.key!;
}

export async function updateApplication(uid: string, id: string, changes: Partial<ApplicationInput>) {
  await update(userRef(uid, `applications/${id}`), clean({ ...changes, updatedAt: Date.now() }));
}

export async function deleteApplication(uid: string, id: string) {
  await remove(userRef(uid, `applications/${id}`));
}

// ---------- Related jobs ----------

export async function saveJob(uid: string, job: JobPosting) {
  const now = Date.now();
  await set(userRef(uid, `savedJobs/${job.id}`), clean({
    job,
    status: "saved" satisfies SavedJobStatus,
    notes: "",
    savedAt: now,
    updatedAt: now,
  }));
}

export async function updateSavedJob(
  uid: string,
  id: string,
  changes: Partial<Pick<SavedJob, "status" | "notes">>,
) {
  await update(userRef(uid, `savedJobs/${id}`), clean({ ...changes, updatedAt: Date.now() }));
}

export async function deleteSavedJob(uid: string, id: string) {
  await remove(userRef(uid, `savedJobs/${id}`));
}

// ---------- Account ----------

/** Removes workspace data but keeps the basic account profile and preferences. */
export async function clearWorkspace(uid: string) {
  await update(userRef(uid), { resume: null, analyses: null, applications: null, savedJobs: null });
}
