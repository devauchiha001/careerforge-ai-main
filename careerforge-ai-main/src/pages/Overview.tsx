import { ArrowRight, BriefcaseBusiness, CircleCheck, CircleDashed, FileText, Search, Target, Upload, UserRound } from "lucide-react";
import { Chips, EmptyState, PageHeader, Progress, timeAgo } from "../components/ui";
import { navigate } from "../hooks/hooks";
import { APPLICATION_STATUSES } from "../lib/database";
import { scoreLabel, scoreTone } from "../lib/analysis";
import { STATUS_LABELS } from "./ApplicationsPage";
import type { Workspace } from "./Dashboard";

export default function Overview({ ws }: { ws: Workspace }) {
  const { user, profile, resume, analyses, applications, savedJobs } = ws;
  const firstName = (profile?.displayName || user.displayName || "").split(" ")[0] || "there";
  const latest = analyses[0];
  const interviews = applications.filter((a) => a.status === "interview" || a.status === "offer").length;
  const profileFields = [
    profile?.headline,
    profile?.targetRoles?.length || profile?.targetRole,
    profile?.country || profile?.city || profile?.location,
    profile?.technicalSkills?.length || profile?.skills?.length ? "y" : "",
  ];
  const profileCompletion = Math.round((profileFields.filter(Boolean).length / profileFields.length) * 100);

  const steps = [
    { done: !!resume, label: "Upload your resume", page: "resume" },
    { done: analyses.length > 0, label: "Analyze a job description", page: "match" },
    { done: savedJobs.length > 0, label: "Discover and save a real job", page: "jobs" },
    { done: applications.length > 0, label: "Track your first application", page: "applications" },
    { done: profileCompletion === 100, label: "Complete your career profile", page: "profile" },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <>
      <PageHeader
        eyebrow="Career workspace"
        title={`Welcome, ${firstName}.`}
        text={doneCount === steps.length ? "Your workspace is fully set up. Keep the momentum going." : "Your career optimization workspace is ready."}
        actions={
          <button className="btn btn-primary" onClick={() => navigate(resume ? "match" : "resume")}>
            {resume ? <><Target size={18} /> Analyze a job</> : <><Upload size={18} /> Upload resume</>}
          </button>
        }
      />

      <div className="stat-grid">
        <button className="card stat-card" onClick={() => navigate("resume")}>
          <span className="stat-label">Resume score</span>
          <strong className={resume ? `text-${scoreTone(resume.score)}` : ""}>{resume ? resume.score : "—"}</strong>
          <small>{resume ? `${scoreLabel(resume.score)} · ${resume.skills.length} skills found` : "Upload a resume to get scored"}</small>
        </button>
        <button className="card stat-card" onClick={() => navigate("match", latest?.id)}>
          <span className="stat-label">Latest ATS match</span>
          <strong className={latest ? `text-${scoreTone(latest.score)}` : ""}>{latest ? `${latest.score}%` : "—"}</strong>
          <small>{latest ? `${latest.jobTitle}${latest.company ? ` · ${latest.company}` : ""}` : "Analyze a job to get your score"}</small>
        </button>
        <button className="card stat-card" onClick={() => navigate("applications")}>
          <span className="stat-label">Applications</span>
          <strong>{applications.length}</strong>
          <small>{interviews ? `${interviews} at interview or offer stage` : "Applications tracked"}</small>
        </button>
        <button className="card stat-card" onClick={() => navigate("jobs")}>
          <span className="stat-label">Saved jobs</span>
          <strong>{savedJobs.length}</strong>
          <small>{savedJobs.length ? "Opportunities you saved" : "Explore real remote jobs"}</small>
        </button>
        <button className="card stat-card" onClick={() => navigate("profile")}>
          <span className="stat-label">Profile</span>
          <strong>{profileCompletion}%</strong>
          <small>{profileCompletion === 100 ? "Profile complete" : "Complete your career profile"}</small>
        </button>
      </div>

      <div className="grid-2">
        <section className="card panel">
          <div className="panel-head">
            <h2>Getting started</h2>
            <span className="muted small">{doneCount}/{steps.length} done</span>
          </div>
          <Progress value={(doneCount / steps.length) * 100} />
          <ul className="checklist">
            {steps.map((s) => (
              <li key={s.label}>
                <a href={`#/${s.page}`} className={s.done ? "done" : ""}>
                  {s.done ? <CircleCheck size={18} /> : <CircleDashed size={18} />}
                  <span>{s.label}</span>
                  <ArrowRight size={16} className="chev" />
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section className="card panel">
          <div className="panel-head">
            <h2>Application pipeline</h2>
            <a href="#/applications" className="link small">Open tracker <ArrowRight size={14} /></a>
          </div>
          {applications.length ? (
            <div className="pipeline">
              {APPLICATION_STATUSES.map((status) => {
                const count = applications.filter((a) => a.status === status).length;
                return (
                  <div key={status} className="pipeline-row">
                    <span className={`status status-${status}`}>{STATUS_LABELS[status]}</span>
                    <div className="pipeline-bar"><span className={`bar-${status}`} style={{ width: `${(count / applications.length) * 100}%` }} /></div>
                    <b>{count}</b>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState icon={<BriefcaseBusiness size={22} />} title="No applications yet" text="Keep every application, interview and opportunity organized in one place." action={<button className="btn btn-secondary btn-sm" onClick={() => navigate("applications")}>Open tracker</button>} />
          )}
        </section>
      </div>

      <div className="workspace-grid">
        <article className="card tool-card">
          <div className="icon-tile"><FileText size={20} /></div>
          <h3>Resume Analyzer</h3>
          <p>Upload your resume and let CareerForge extract your skills, experience and career signals.</p>
          {resume && <Chips items={resume.skills.slice(0, 6)} />}
          <a className="link" href="#/resume">{resume ? "View analysis" : "Start analysis"} <ArrowRight size={16} /></a>
        </article>
        <article className="card tool-card">
          <div className="icon-tile"><Target size={20} /></div>
          <h3>Job Match</h3>
          <p>Paste a job description to discover your match score, missing keywords and skill gaps.</p>
          <a className="link" href="#/match">Analyze a job <ArrowRight size={16} /></a>
        </article>
        <article className="card tool-card">
          <div className="icon-tile"><Search size={20} /></div>
          <h3>Related Jobs</h3>
          <p>Discover real remote opportunities, ranked against your saved skills and target role.</p>
          <a className="link" href="#/jobs">Explore jobs <ArrowRight size={16} /></a>
        </article>
        <article className="card tool-card">
          <div className="icon-tile"><UserRound size={20} /></div>
          <h3>Career Profile</h3>
          <p>Set your headline, target role and skills so every generated document sounds like you.</p>
          <a className="link" href="#/profile">Edit profile <ArrowRight size={16} /></a>
        </article>
      </div>

      {analyses.length > 0 && (
        <section className="card panel">
          <div className="panel-head"><h2>Recent job matches</h2><a href="#/match" className="link small">View all <ArrowRight size={14} /></a></div>
          <ul className="list">
            {analyses.slice(0, 4).map((a) => (
              <li key={a.id}>
                <a href={`#/match/${a.id}`} className="list-row">
                  <span className={`score-pill tone-${scoreTone(a.score)}`}>{a.score}%</span>
                  <div className="list-main"><strong>{a.jobTitle}</strong><span>{a.company || "—"}</span></div>
                  <span className="muted small">{timeAgo(a.createdAt)}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
