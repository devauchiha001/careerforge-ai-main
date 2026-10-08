import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowLeft, ArrowRight, Bookmark, BookmarkCheck, BriefcaseBusiness, ExternalLink, Filter,
  MapPin, RefreshCw, Search, Sparkles, Target, WandSparkles,
} from "lucide-react";
import { Alert, EmptyState, PageHeader, Spinner, formatDate, timeAgo, useToast } from "../components/ui";
import { navigate } from "../hooks/hooks";
import {
  createAnalysis, createApplication, deleteSavedJob, saveJob, updateApplication,
  updateSavedJob,
} from "../lib/database";
import { analyzeJobMatch } from "../lib/analysis";
import { friendlyError } from "../lib/errors";
import { loadMoreJobs, searchJobs, type CachedJobs } from "../services/jobs/jobSearch";
import { rankJobs } from "../services/jobs/jobRanking";
import { filterJobs } from "../services/jobs/jobFiltering";
import type { JobPosting, JobRecommendation, SavedJob, SavedJobStatus } from "../services/jobs/types";
import type { Workspace } from "./Dashboard";

type Props = { ws: Workspace; jobId?: string };
type SortMode = "match" | "latest" | "salary";
type ViewMode = "recommended" | "saved";
type WorkModeFilter = JobPosting["workMode"] | "all";

export default function JobsPage({ ws, jobId }: Props) {
  const [feed, setFeed] = useState<CachedJobs>();
  const jobs = feed?.jobs ?? [];
  const fetchedAt = feed?.fetchedAt;
  const hasMore = feed?.hasMore ?? false;
  const [loadingMore, setLoadingMore] = useState(false);
  const [paginationError, setPaginationError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const stale = feed?.stale ?? false;
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("recommended");
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState(() => {
    const preferred = ws.profile?.preferredLocations?.[0]?.trim();
    const country = ws.profile?.country?.trim();
    if (preferred) {
      if (country && !/worldwide|anywhere|global/i.test(preferred) && !preferred.toLowerCase().includes(country.toLowerCase())) {
        return `${preferred}, ${country}`;
      }
      return preferred;
    }
    return [ws.profile?.city, ws.profile?.region, country].filter(Boolean).join(", ");
  });
  const [employment, setEmployment] = useState("all");
  const [level, setLevel] = useState("all");
  const [workMode, setWorkMode] = useState<WorkModeFilter>("all");
  const [source, setSource] = useState("all");
  const [skill, setSkill] = useState("");
  const [minimumMatch, setMinimumMatch] = useState(0);
  const [salaryOnly, setSalaryOnly] = useState(false);
  const [includeSaved, setIncludeSaved] = useState(false);
  const [sort, setSort] = useState<SortMode>("match");
  const [similarTo, setSimilarTo] = useState<string>();
  const [workingId, setWorkingId] = useState<string>();
  const toast = useToast();

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    searchJobs()
      .then((result) => {
        if (!mounted) return;
        setFeed(result);
        if (result.stale) setError("The feed could not be refreshed. Showing previously cached listings.");
        else if (result.providerFailures.length) setError("Some job sources are unavailable. Showing listings from the sources that responded.");
      })
      .catch((cause: unknown) => {
        if (mounted) setError(friendlyError(cause, "Couldn't load jobs. Check your connection and try again."));
      })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  async function loadNextPage() {
    if (!fetchedAt || loadingMore || !hasMore) return;
    setLoadingMore(true);
    setPaginationError(null);
    try {
      if (!feed) return;
      const result = await loadMoreJobs(feed);
      setFeed(result);
      if (result.providerFailures.length) setPaginationError("Some sources could not load another page. Other listings are still available; retry to continue.");
    } catch (cause) {
      setPaginationError(friendlyError(cause, "Couldn't load more jobs."));
    } finally {
      setLoadingMore(false);
    }
  }

  const ranked = useMemo(() => rankJobs(jobs, ws.profile, ws.resume), [jobs, ws.profile, ws.resume]);
  const savedIds = useMemo(() => new Set(ws.savedJobs.map((saved) => saved.id)), [ws.savedJobs]);
  const trackedUrls = useMemo(() => new Set(ws.applications.map((application) => application.url).filter((url): url is string => !!url)), [ws.applications]);
  const filters = useMemo(() => {
    const excludeIds = new Set(
      ranked
        .filter(({ job }) => !includeSaved && (savedIds.has(job.id) || trackedUrls.has(job.applyUrl)))
        .map(({ job }) => job.id),
    );
    const selected = filterJobs(ranked, {
      query,
      location,
      employment,
      experienceLevel: level,
      skill,
      workMode,
      source,
      minimumMatch,
      salaryOnly,
      excludeIds,
    });
    if (similarTo) {
      const current = ranked.find((item) => item.job.id === similarTo);
      return selected.filter((item) => item.job.id !== similarTo).sort((a, b) => {
        const similarityA = similarityScore(current, a);
        const similarityB = similarityScore(current, b);
        return similarityB - similarityA || b.overallScore - a.overallScore;
      });
    }
    return selected.sort((a, b) => {
      if (sort === "latest") return (b.job.postedAt ?? 0) - (a.job.postedAt ?? 0);
      if (sort === "salary") return (b.job.salaryValue ?? -1) - (a.job.salaryValue ?? -1);
      return b.overallScore - a.overallScore;
    });
  }, [ranked, savedIds, trackedUrls, query, location, employment, level, workMode, source, skill, minimumMatch, salaryOnly, sort, similarTo, includeSaved]);

  const selectedJob = jobId
    ? ranked.find((item) => item.job.id === jobId)
      ?? (ws.savedJobs.find((item) => item.job.id === jobId)
        ? rankJobs([ws.savedJobs.find((item) => item.job.id === jobId)!.job], ws.profile, ws.resume)[0]
        : undefined)
    : undefined;

  async function toggleSave(recommendation: JobRecommendation) {
    const id = recommendation.job.id;
    setWorkingId(id);
    try {
      if (savedIds.has(id)) {
        await deleteSavedJob(ws.user.uid, id);
        toast.info("Job removed from saved jobs.");
      } else {
        await saveJob(ws.user.uid, recommendation.job);
        toast.success("Job saved.");
      }
    } catch (cause) {
      toast.error(friendlyError(cause, "Couldn't update saved jobs."));
    } finally {
      setWorkingId(undefined);
    }
  }

  async function trackApplication(recommendation: JobRecommendation, markApplied = false): Promise<boolean> {
    const { job } = recommendation;
    setWorkingId(job.id);
    try {
      const existing = ws.applications.find((application) => application.url === job.applyUrl);
      if (markApplied && existing) {
        await updateApplication(ws.user.uid, existing.id, {
          status: "applied",
          appliedOn: existing.appliedOn || new Date().toISOString().slice(0, 10),
        });
      } else if (!existing) {
        await createApplication(ws.user.uid, {
          company: job.company,
          role: job.title,
          status: markApplied ? "applied" : "saved",
          url: job.applyUrl,
          location: job.location,
          source: job.source,
          appliedOn: markApplied ? new Date().toISOString().slice(0, 10) : undefined,
        });
      }
      toast.success(markApplied ? "Marked as applied and updated your tracker." : "Added to your application tracker.");
      return true;
    } catch (cause) {
      toast.error(friendlyError(cause, "Couldn't update your application tracker."));
      return false;
    } finally {
      setWorkingId(undefined);
    }
  }

  async function updateSavedStatus(saved: SavedJob, status: SavedJobStatus) {
    setWorkingId(saved.id);
    try {
      if (status === "applied") {
        const tracked = await trackApplication(rankJobs([saved.job], ws.profile, ws.resume)[0], true);
        if (tracked) await updateSavedJob(ws.user.uid, saved.id, { status });
        return;
      }
      await updateSavedJob(ws.user.uid, saved.id, { status });
      toast.success(status === "interested" ? "Marked as interested." : "Saved job updated.");
    } catch (cause) {
      toast.error(friendlyError(cause, "Couldn't update this saved job."));
    } finally {
      setWorkingId(undefined);
    }
  }

  async function analyzeForApplication(recommendation: JobRecommendation) {
    const { job } = recommendation;
    if (!ws.resume) {
      toast.info("Upload a resume before analyzing job fit.");
      navigate("resume");
      return;
    }
    if (job.description.trim().split(/\s+/).length < 30) {
      toast.info("This posting does not include enough description text for a reliable analysis.");
      return;
    }
    setWorkingId(job.id);
    try {
      const id = await createAnalysis(ws.user.uid, analyzeJobMatch(ws.resume, {
        jobTitle: job.title, company: job.company, jobDescription: job.description,
      }));
      navigate("match", id);
    } catch (cause) {
      toast.error(friendlyError(cause, "Couldn't create a job analysis."));
    } finally {
      setWorkingId(undefined);
    }
  }

  if (jobId) {
    return selectedJob
      ? <JobDetail
          recommendation={selectedJob}
          similar={ranked.filter((item) => item.job.id !== jobId).sort((a, b) => similarityScore(selectedJob, b) - similarityScore(selectedJob, a)).slice(0, 4)}
          isSaved={savedIds.has(jobId)}
          working={workingId === jobId}
          onBack={() => navigate("jobs")}
          onToggleSave={() => toggleSave(selectedJob)}
          onTrack={() => trackApplication(selectedJob)}
          onAnalyze={() => analyzeForApplication(selectedJob)}
          onFindSimilar={() => document.getElementById("similar-jobs")?.scrollIntoView({ behavior: "smooth" })}
          onOpenJob={(id) => navigate("jobs", id)}
        />
      : loading
        ? <div className="page-loading"><Spinner size={22} label="Loading job details…" /></div>
        : <EmptyState
            icon={<BriefcaseBusiness size={22} />}
            title="Job details unavailable"
            text="This posting may have expired or is no longer in the current feed. Your saved jobs remain available in Saved jobs."
            action={<button className="btn btn-secondary" onClick={() => navigate("jobs")}><ArrowLeft size={16} /> Back to Related Jobs</button>}
          />;
  }

  const currentRecommendations: Array<{ recommendation: JobRecommendation; saved?: SavedJob }> = view === "saved"
    ? ws.savedJobs.map((saved) => ({
        saved,
        recommendation: rankJobs([saved.job], ws.profile, ws.resume)[0],
      }))
    : filters.map((recommendation) => ({ recommendation }));

  return (
    <>
      <PageHeader
        eyebrow="Real remote opportunities"
        title="Related jobs"
        text="Explore live remote listings ranked against the skills and target role in your career profile."
        actions={
          <button className="btn btn-secondary" title="Fetch updated listings from connected job sources" onClick={() => { setError(null); setLoading(true); searchJobs(undefined, true).then((result) => { setFeed(result); if (result.stale) setError("The feed could not be refreshed. Showing previously cached listings."); else if (result.providerFailures.length) setError("Some job sources are unavailable. Showing listings from the sources that responded."); }).catch((cause: unknown) => setError(friendlyError(cause))).finally(() => setLoading(false)); }}>
          <RefreshCw size={16} /> Refresh listings
          </button>
        }
      />

      <div className="jobs-source-note">
        <Sparkles size={17} />
        <span>Live listings from Jobicy and Himalayas. Listings are source-provided, never AI-generated. Use the source link to review eligibility and apply; CareerForge Match Scores are profile-based estimates, not employer decisions.</span>
      </div>
      {error && <Alert tone={stale ? "info" : "error"}>{error}{fetchedAt ? ` Last feed update: ${formatDate(fetchedAt)}.` : ""}</Alert>}
      {!!feed?.providerFailures.length && (
        <Alert tone="info">
          Unavailable source{feed.providerFailures.length > 1 ? "s" : ""}: {feed.providerFailures.map((item) => `${item.providerName} (${item.message})`).join("; ")}
        </Alert>
      )}

      <div className="jobs-view-tabs tabs scroll" role="tablist" aria-label="Job list">
        <button role="tab" aria-selected={view === "recommended"} className={view === "recommended" ? "active" : ""} onClick={() => { setView("recommended"); setSimilarTo(undefined); }}>
          Recommended <span className="count">{filters.length}</span>
        </button>
        <button role="tab" aria-selected={view === "saved"} className={view === "saved" ? "active" : ""} onClick={() => { setView("saved"); setSimilarTo(undefined); }}>
          Saved jobs <span className="count">{ws.savedJobs.length}</span>
        </button>
      </div>
      {view === "recommended" && (
        <section className="card panel jobs-filters" aria-label="Filter job listings">
          {similarTo && (
            <div className="jobs-similar-banner">
              <span>Similar opportunities to {ranked.find((item) => item.job.id === similarTo)?.job.title ?? "this role"}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setSimilarTo(undefined)}>Clear</button>
            </div>
          )}
          <div className="jobs-filter-grid">
            <label className="field jobs-search-field">
              <span>Search jobs</span>
              <span className="input-icon"><Search size={16} /><input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Role, company, or keyword" /></span>
            </label>
            <label className="field"><span>Eligible location</span><span className="input-icon"><MapPin size={16} /><input className="input" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Worldwide, India, USA…" /></span></label>
            <label className="field"><span>Employment type</span>
              <select className="input select" value={employment} onChange={(event) => setEmployment(event.target.value)}>
                <option value="all">Any type</option>
                {uniqueValues(jobs.map((job) => job.employmentType)).map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className="field"><span>Experience level</span>
              <select className="input select" value={level} onChange={(event) => setLevel(event.target.value)}>
                <option value="all">Any level</option>
                {uniqueValues(jobs.map((job) => job.experienceLevel)).map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className="field"><span>Work mode</span>
              <select className="input select" value={workMode} onChange={(event) => {
                const value = event.target.value;
                setWorkMode(value === "Remote" || value === "Hybrid" || value === "On-site" ? value : "all");
              }}>
                <option value="all">Any work mode</option>
                <option value="Remote">Remote</option>
                <option value="Hybrid">Hybrid</option>
                <option value="On-site">On-site</option>
              </select>
            </label>
            <label className="field"><span>Job source</span>
              <select className="input select" value={source} onChange={(event) => setSource(event.target.value)}>
                <option value="all">All connected sources</option>
                {uniqueValues(jobs.flatMap((job) => job.sources ?? [job.source])).map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className="field"><span>Skill</span><input className="input" value={skill} onChange={(event) => setSkill(event.target.value)} placeholder="e.g. React" /></label>
            <label className="field"><span>Minimum match</span>
              <select className="input select" value={minimumMatch} onChange={(event) => setMinimumMatch(Number(event.target.value))}>
                <option value={0}>Any match</option><option value={40}>40%+</option><option value={60}>60%+</option><option value={80}>80%+</option>
              </select>
            </label>
            <label className="field"><span>Sort by</span>
              <select className="input select" value={sort} onChange={(event) => setSort(event.target.value as SortMode)}>
                <option value="match">Best match</option><option value="latest">Latest</option><option value="salary">Reported salary amount</option>
              </select>
            </label>
            <label className="jobs-checkbox"><input type="checkbox" checked={salaryOnly} onChange={(event) => setSalaryOnly(event.target.checked)} /> Only show postings with salary</label>
            <label className="jobs-checkbox"><input type="checkbox" checked={includeSaved} onChange={(event) => setIncludeSaved(event.target.checked)} /> Include saved or tracked jobs</label>
          </div>
          {sort === "salary" && <p className="muted small jobs-currency-note">Salary values are sorted as reported by the source; currencies are not converted.</p>}
          <p className="muted small">Some remote listings have provider location restrictions, and others do not specify eligibility. Confirm the allowed countries or regions on the original posting.</p>
        </section>
      )}

      {!ws.resume && !ws.profile?.skills?.length && !ws.profile?.targetRole && (
        <Alert tone="info">
          Add a target role or skills in your profile, or upload a resume, to make these match estimates more useful.
          <button className="link small" onClick={() => navigate(ws.resume ? "profile" : "resume")}>Set up your career profile</button>
        </Alert>
      )}

      {loading && !jobs.length && view !== "saved" ? (
        <div className="card jobs-loading"><Spinner size={22} label="Finding real job listings…" /><span className="muted small">The feed is cached for six hours to reduce requests.</span></div>
      ) : view === "saved" && !currentRecommendations.length ? (
        <EmptyState icon={<Bookmark size={22} />} title="No saved jobs yet" text="Save a job posting to keep it here and track your interest." action={<button className="btn btn-secondary" onClick={() => setView("recommended")}>Browse recommendations</button>} />
      ) : view === "recommended" && !currentRecommendations.length ? (
        <EmptyState icon={<Filter size={22} />} title={jobs.length ? "No jobs match these filters" : "No listings available"} text={jobs.length ? "Try broadening the search or lowering the minimum match score." : "The live job source returned no listings. Try again later."} action={jobs.length ? <button className="btn btn-secondary" onClick={() => { setQuery(""); setLocation(""); setEmployment("all"); setLevel("all"); setWorkMode("all"); setSkill(""); setMinimumMatch(0); setSalaryOnly(false); }}>Clear filters</button> : undefined} />
      ) : (
        <>
          <div className="jobs-results-heading">
            <span>{view === "saved" ? `${ws.savedJobs.length} saved` : `${filters.length} opportunities`}{fetchedAt && view === "recommended" ? ` · updated ${timeAgo(fetchedAt)}` : ""}</span>
            {ws.profile?.targetRole && view === "recommended" && <span className="jobs-target">Matching toward <strong>{ws.profile.targetRole}</strong></span>}
          </div>
          <div className="jobs-grid">
            {currentRecommendations.map(({ recommendation, saved }) => (
              <JobCard
                key={recommendation.job.id}
                recommendation={recommendation}
                saved={saved}
                isSaved={savedIds.has(recommendation.job.id)}
                working={workingId === recommendation.job.id}
                existingApplication={ws.applications.some((application) => application.url === recommendation.job.applyUrl)}
                onOpen={() => navigate("jobs", recommendation.job.id)}
                onToggleSave={() => toggleSave(recommendation)}
                onTrack={() => trackApplication(recommendation)}
                onMarkInterested={() => saved && updateSavedStatus(saved, saved.status === "interested" ? "saved" : "interested")}
                onMarkApplied={() => saved && updateSavedStatus(saved, "applied")}
                onNotes={async (notes) => { if (saved) await updateSavedJob(ws.user.uid, saved.id, { notes }); }}
              />
            ))}
          </div>
        </>
      )}
      {view === "recommended" && hasMore && (
        <div className="jobs-load-more">
          {paginationError && <Alert tone="error">{paginationError}</Alert>}
          <button className="btn btn-secondary" onClick={loadNextPage} disabled={loadingMore}>
            {loadingMore ? <Spinner size={16} label="Loading more jobs…" /> : <>Load more real jobs <ArrowRight size={15} /></>}
          </button>
          <span className="muted small">Additional listings load only when requested.</span>
        </div>
      )}
    </>
  );
}

function JobCard({
  recommendation, saved, isSaved, working, existingApplication, onOpen, onToggleSave, onTrack,
  onMarkInterested, onMarkApplied, onNotes,
}: {
  recommendation: JobRecommendation;
  saved?: SavedJob;
  isSaved: boolean;
  working: boolean;
  existingApplication: boolean;
  onOpen: () => void;
  onToggleSave: () => void;
  onTrack: () => void;
  onMarkInterested: () => void;
  onMarkApplied: () => void;
  onNotes: (notes: string) => void;
}) {
  const { job } = recommendation;
  const [notes, setNotes] = useState(saved?.notes ?? "");
  const [notesSaved, setNotesSaved] = useState(true);
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);

  async function submitNotes(event: FormEvent) {
    event.preventDefault();
    if (!saved) return;
    setSavingNotes(true);
    setNotesError(null);
    try {
      await onNotes(notes.trim());
      setNotesSaved(true);
    } catch {
      setNotesError("Your note could not be saved. Please try again.");
    } finally {
      setSavingNotes(false);
    }
  }

  return (
    <article className="card job-card">
      <div className="job-card-top">
        <div className="company-logo" aria-hidden>{job.company.slice(0, 1).toUpperCase()}</div>
        <div className="job-title-block"><h2>{job.title}</h2><span>{job.company}</span></div>
        <div className="job-card-score">
          <span className={`score-pill tone-${recommendation.overallScore >= 70 ? "good" : recommendation.overallScore >= 45 ? "warn" : "bad"}`}>{recommendation.overallScore}%</span>
          <small>CareerForge Match Score</small>
        </div>
      </div>
      <div className="job-card-meta">
        <span><MapPin size={14} />{job.location || "Location not specified"} · {job.workMode}</span>
        {job.employmentType && <span><BriefcaseBusiness size={14} />{job.employmentType}</span>}
        {job.experienceLevel && <span>{job.experienceLevel}</span>}
        {job.salary && <span>{job.salary}</span>}
        {!!job.timezoneRestrictions?.length && <span>Timezone limits: {job.timezoneRestrictions.join(", ")}</span>}
        {job.postedAt && <span>Posted {timeAgo(job.postedAt)}</span>}
      </div>
      <div className="job-source-badges">
        {(job.sourceLinks ?? [{ name: job.source, url: job.sourceUrl || job.applyUrl }]).map((link) => (
          <a key={`${link.name}:${link.url}`} className="chip" href={link.url} target="_blank" rel="noopener noreferrer">
            Source: {link.name} <ExternalLink size={12} />
          </a>
        ))}
        {job.eligibility === "verified"
          ? <span className="chip chip-good">Location matches source restrictions</span>
          : <span className="chip chip-warn">Eligibility not verified</span>}
      </div>
      <p className="job-description">{job.description || "The source did not provide a description. Open the original listing for details."}</p>
      <div className="job-skills">
        {recommendation.matchedSkills.length > 0 && <div><strong>Skills match</strong><div className="job-chips">{recommendation.matchedSkills.map((item) => <span className="chip chip-good" key={item}>{item}</span>)}</div></div>}
        {recommendation.missingSkills.length > 0 && <div><strong>Potential gaps</strong><div className="job-chips">{recommendation.missingSkills.map((item) => <span className="chip chip-warn" key={item}>{item}</span>)}</div></div>}
      </div>
      <details className="job-why">
        <summary><Sparkles size={15} /> Why this job?</summary>
        <p>{recommendation.explanation}</p>
        <div className="job-score-breakdown">
          {recommendation.scoreBreakdown.map((item) => <span key={item.factor}>{item.factor} {item.score}% · weight {item.weight}%</span>)}
        </div>
        <small>CareerForge Match Score is a transparent profile-based estimate, not an employer ATS score or hiring decision.</small>
      </details>
      {saved && (
        <div className="saved-job-controls">
          <form className="saved-job-note" onSubmit={submitNotes}>
            <label className="field"><span>Private note</span><input className="input" value={notes} maxLength={2000} onChange={(event) => { setNotes(event.target.value); setNotesSaved(false); }} placeholder="Add a reminder or recruiter detail" /></label>
            <button className="btn btn-secondary btn-sm" disabled={notesSaved || savingNotes}>{savingNotes ? <Spinner size={14} /> : "Save note"}</button>
          </form>
          {notesError && <span className="text-bad small">{notesError}</span>}
          <div className="saved-job-actions">
            <button className="btn btn-secondary btn-sm" onClick={onMarkInterested} disabled={working || saved.status === "applied"}>
              {saved.status === "interested" ? "Interested ✓" : "Mark interested"}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={onMarkApplied} disabled={working || saved.status === "applied"}>
              {saved.status === "applied" ? "Applied ✓" : "Mark applied"}
            </button>
          </div>
        </div>
      )}
      <div className="job-card-actions">
        <button className="btn btn-secondary btn-sm" onClick={onOpen}>View details <ArrowRight size={14} /></button>
        <button className="btn btn-secondary btn-sm" onClick={onToggleSave} disabled={working}>
          {working ? <Spinner size={14} /> : isSaved ? <BookmarkCheck size={15} /> : <Bookmark size={15} />}
          {isSaved ? "Saved" : "Save job"}
        </button>
        {existingApplication
          ? <button className="btn btn-ghost btn-sm" onClick={() => navigate("applications")}>In tracker</button>
          : <button className="btn btn-primary btn-sm" onClick={onTrack} disabled={working}>Add to tracker</button>}
        <a className="btn btn-ghost btn-sm" href={job.applyUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
          Open listing <ExternalLink size={14} />
        </a>
      </div>
      {saved && <span className="job-source-caption">Saved {formatDate(saved.savedAt)} · Source: {job.source}</span>}
      {!saved && <span className="job-source-caption">Provider listing: <a href={job.sourceUrl || job.applyUrl} target="_blank" rel="noopener noreferrer">{job.source}</a> · Confirm eligibility and application instructions on the source</span>}
    </article>
  );
}

function JobDetail({
  recommendation, similar, isSaved, working, onBack, onToggleSave, onTrack, onAnalyze, onFindSimilar, onOpenJob,
}: {
  recommendation: JobRecommendation;
  similar: JobRecommendation[];
  isSaved: boolean;
  working: boolean;
  onBack: () => void;
  onToggleSave: () => void;
  onTrack: () => void;
  onAnalyze: () => void;
  onFindSimilar: () => void;
  onOpenJob: (id: string) => void;
}) {
  const { job } = recommendation;
  return (
    <>
      <button className="btn btn-ghost btn-sm back" onClick={onBack}><ArrowLeft size={16} /> Related Jobs</button>
      <PageHeader
        eyebrow={`Real listing · ${job.source}`}
        title={job.title}
        text={`${job.company}${job.location ? ` · ${job.location}` : ""} · ${job.workMode}`}
        actions={
          <>
            <button className="btn btn-secondary" onClick={onToggleSave} disabled={working}>{isSaved ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}{isSaved ? "Saved" : "Save job"}</button>
            <button className="btn btn-secondary" onClick={onFindSimilar}><Search size={15} /> Find similar</button>
            <a className="btn btn-primary" href={job.applyUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Open listing <ExternalLink size={15} /></a>
          </>
        }
      />
      <div className="job-detail-meta">
        {job.employmentType && <span><BriefcaseBusiness size={15} />{job.employmentType}</span>}
        {job.experienceLevel && <span>{job.experienceLevel}</span>}
        {job.salary && <span>{job.salary}</span>}
        {job.postedAt && <span>Posted {formatDate(job.postedAt)}</span>}
        <span>{job.workMode} work</span>
      </div>
      <div className="job-source-badges">
        {(job.sourceLinks ?? [{ name: job.source, url: job.sourceUrl || job.applyUrl }]).map((link) => (
          <a key={`${link.name}:${link.url}`} className="chip" href={link.url} target="_blank" rel="noopener noreferrer">
            Source: {link.name} <ExternalLink size={12} />
          </a>
        ))}
        {job.eligibility === "verified"
          ? <span className="chip chip-good">Location matches source restrictions</span>
          : <span className="chip chip-warn">Eligibility not verified</span>}
      </div>

      <section className="card panel job-detail-match">
        <div className="job-detail-match-score">
          <span className={`score-pill tone-${recommendation.overallScore >= 70 ? "good" : recommendation.overallScore >= 45 ? "warn" : "bad"}`}>{recommendation.overallScore}%</span>
          <div><strong>{recommendation.recommendation}</strong><span className="muted small">CareerForge Match Score · not an employer ATS score</span></div>
        </div>
        <p>{recommendation.explanation}</p>
        <div className="job-score-breakdown">
          {recommendation.scoreBreakdown.map((item) => <span key={item.factor}>{item.factor} {item.score}% · weight {item.weight}%</span>)}
        </div>
        <div className="grid-2 job-detail-skills">
          <div><h3>Matching skills</h3><div className="job-chips">{recommendation.matchedSkills.length ? recommendation.matchedSkills.map((item) => <span className="chip chip-good" key={item}>{item}</span>) : <span className="muted small">No direct skill overlap detected yet.</span>}</div></div>
          <div><h3>Potential skill gaps</h3><div className="job-chips">{recommendation.missingSkills.length ? recommendation.missingSkills.map((item) => <span className="chip chip-warn" key={item}>{item}</span>) : <span className="muted small">No missing listed skills detected.</span>}</div></div>
        </div>
      </section>

      <div className="grid-2 job-detail-columns">
        <section className="card panel">
          <h2 className="panel-title">Job overview</h2>
          <div className="job-overview-grid">
            <div><span>Company</span><strong>{job.company}</strong></div>
            <div><span>Location eligibility</span><strong>{job.location || "Not specified by source"}</strong></div>
            <div><span>Work mode</span><strong>{job.workMode}</strong></div>
            {!!job.timezoneRestrictions?.length && <div><span>Timezone restrictions</span><strong>{job.timezoneRestrictions.join(", ")}</strong></div>}
            {job.employmentType && <div><span>Employment</span><strong>{job.employmentType}</strong></div>}
            {job.experienceLevel && <div><span>Experience</span><strong>{job.experienceLevel}</strong></div>}
            {job.salary && <div><span>Salary</span><strong>{job.salary}</strong></div>}
          </div>
        </section>
        <section className="card panel">
          <h2 className="panel-title">Why you might apply</h2>
          <p className="job-explanation">{recommendation.explanation}</p>
          {recommendation.missingSkills.length > 0 && <p className="muted small">Before applying, review the requirements for {recommendation.missingSkills.join(", ")} and highlight relevant learning or adjacent experience if accurate.</p>}
          <p className="job-caveat">CareerForge Match Score estimates fit using available listing/profile data. It is not an employer ATS score, guarantee, or hiring decision. Unavailable requirement data receives a neutral score.</p>
        </section>
      </div>

      <section className="card panel">
        <div className="panel-head"><h2>Job description</h2><a className="link small" href={job.applyUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Original posting <ExternalLink size={14} /></a></div>
        {job.description ? <p className="job-full-description">{job.description}</p> : <p className="muted">The source did not provide a description. View the original posting for full details.</p>}
      </section>

      <section className="card panel job-detail-next">
        <div><h2>Prepare your application</h2><p className="muted small">Use the existing job-match tools to tailor your resume and generate a cover letter, recruiter message, summary, or interview prep.</p></div>
        <button className="btn btn-primary" onClick={onAnalyze} disabled={working || job.description.trim().split(/\s+/).length < 30}>
          {working ? <Spinner size={16} /> : <WandSparkles size={16} />} Open match & application tools
        </button>
      </section>

      <section className="card panel" id="similar-jobs">
        <div className="panel-head"><h2>Find similar jobs</h2><span className="muted small">Ranked from the current real-job feed</span></div>
        {similar.length ? <div className="similar-jobs">{similar.map((item) => (
          <button className="similar-job" key={item.job.id} onClick={() => onOpenJob(item.job.id)}>
            <span className="similar-job-main"><strong>{item.job.title}</strong><span>{item.job.company} · {item.job.location || "Remote"} · Source: {item.job.source}</span></span>
            <span className="score-pill">{item.overallScore}%</span><ArrowRight size={15} />
          </button>
        ))}</div> : <p className="muted small">No similar listings are available in the current feed.</p>}
      </section>
      <p className="job-attribution">
        Original source listing{(job.sourceLinks ?? [{ name: job.source, url: job.sourceUrl || job.applyUrl }]).length > 1 ? "s" : ""}:{" "}
        {(job.sourceLinks ?? [{ name: job.source, url: job.sourceUrl || job.applyUrl }]).map((link, index) => (
          <span key={`${link.name}:${link.url}`}>{index > 0 ? ", " : ""}<a href={link.url} target="_blank" rel="noopener noreferrer">{link.name}</a></span>
        ))}. Confirm location eligibility and application instructions there.
      </p>
      <button className="btn btn-secondary" onClick={onTrack}><Target size={16} /> Add to Application Tracker</button>
    </>
  );
}

function similarityScore(current: JobRecommendation | undefined, other: JobRecommendation): number {
  if (!current) return other.overallScore;
  const title = wordsOverlap(current.job.title, other.job.title);
  const skills = wordsOverlap(current.job.skills.join(" "), other.job.skills.join(" "));
  const companyBonus = current.job.company === other.job.company ? 4 : 0;
  return title * 0.6 + skills * 0.4 + companyBonus;
}

function wordsOverlap(a: string, b: string): number {
  const left = new Set(a.toLowerCase().match(/[a-z0-9+#.]{2,}/g) ?? []);
  const right = new Set(b.toLowerCase().match(/[a-z0-9+#.]{2,}/g) ?? []);
  if (!left.size || !right.size) return 0;
  return [...left].filter((word) => right.has(word)).length / Math.max(left.size, right.size);
}

function uniqueValues(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => !!value))].sort((a, b) => a.localeCompare(b));
}
