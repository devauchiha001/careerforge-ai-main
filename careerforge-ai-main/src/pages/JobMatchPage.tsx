import { useState, type FormEvent } from "react";
import { ArrowLeft, BriefcaseBusiness, Check, Copy, FileText, Lightbulb, Plus, RefreshCw, Sparkles, Target, Trash, WandSparkles } from "lucide-react";
import { Alert, Chips, ConfirmDialog, EmptyState, PageHeader, Progress, ScoreRing, Spinner, timeAgo, useToast } from "../components/ui";
import { navigate } from "../hooks/hooks";
import { analyzeJobMatch, countWords, scoreLabel, scoreTone } from "../lib/analysis";
import { GENERATED_KINDS, generateDocument } from "../lib/ai";
import { createAnalysis, createApplication, deleteAnalysis, saveGeneratedDoc, type GeneratedKind, type JobAnalysis } from "../lib/database";
import { friendlyError } from "../lib/errors";
import type { Workspace } from "./Dashboard";

export default function JobMatchPage({ ws, analysisId }: { ws: Workspace; analysisId?: string }) {
  if (analysisId) {
    const analysis = ws.analyses.find((a) => a.id === analysisId);
    if (!analysis) {
      return (
        <EmptyState
          icon={<Target size={22} />}
          title="Analysis not found"
          text="This job match may have been deleted."
          action={<button className="btn btn-secondary" onClick={() => navigate("match")}><ArrowLeft size={16} /> Back to Job Match</button>}
        />
      );
    }
    return <AnalysisDetail ws={ws} analysis={analysis} />;
  }
  return <MatchHome ws={ws} />;
}

function MatchHome({ ws }: { ws: Workspace }) {
  const { user, resume, analyses } = ws;
  const [form, setForm] = useState({ jobTitle: "", company: "", jobDescription: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<JobAnalysis | null>(null);
  const toast = useToast();
  const words = countWords(form.jobDescription);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!resume) return;
    if (words < 30) return setError("Paste the full job description (at least 30 words) for an accurate match.");
    setError(null);
    setBusy(true);
    try {
      const id = await createAnalysis(user.uid, analyzeJobMatch(resume, form));
      toast.success("Job analyzed.");
      navigate("match", id);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow="Job match" title="Analyze a job" text="Paste a job description to discover your match score, missing keywords and skill gaps." />

      {!resume ? (
        <EmptyState
          icon={<FileText size={22} />}
          title="Upload your resume first"
          text="Job matching compares the job description against your resume, so we need that first."
          action={<button className="btn btn-primary" onClick={() => navigate("resume")}>Upload resume</button>}
        />
      ) : (
        <form className="card panel form" onSubmit={submit}>
          {error && <Alert tone="error">{error}</Alert>}
          <div className="form-grid">
            <label className="field">
              <span>Job title</span>
              <input className="input" required maxLength={120} placeholder="e.g. Frontend Engineer" value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} />
            </label>
            <label className="field">
              <span>Company <em>optional</em></span>
              <input className="input" maxLength={120} placeholder="e.g. Acme Inc." value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
            </label>
          </div>
          <label className="field">
            <span>Job description</span>
            <textarea className="input textarea" required rows={11} placeholder="Paste the complete job description, including requirements and responsibilities…" value={form.jobDescription} onChange={(e) => setForm({ ...form, jobDescription: e.target.value })} />
          </label>
          <div className="row-between">
            <span className="muted small">{words} words · matched against <b>{resume.fileName}</b></span>
            <button className="btn btn-primary" disabled={busy}>
              {busy ? <Spinner size={16} label="Analyzing…" /> : <><Target size={16} /> Analyze match</>}
            </button>
          </div>
        </form>
      )}

      <section className="card panel">
        <div className="panel-head"><h2>Previous analyses</h2><span className="muted small">{analyses.length}</span></div>
        {analyses.length ? (
          <ul className="list">
            {analyses.map((a) => (
              <li key={a.id} className="list-row">
                <span className={`score-pill tone-${scoreTone(a.score)}`}>{a.score}%</span>
                <a href={`#/match/${a.id}`} className="list-main"><strong>{a.jobTitle}</strong><span>{a.company || "—"} · {timeAgo(a.createdAt)}</span></a>
                <button className="icon-btn" onClick={() => setToDelete(a)} aria-label={`Delete analysis for ${a.jobTitle}`}><Trash size={16} /></button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small">Your job analyses will appear here.</p>
        )}
      </section>

      <ConfirmDialog
        open={!!toDelete}
        title="Delete analysis?"
        text={`The match analysis for “${toDelete?.jobTitle}” and any generated documents will be removed.`}
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          try {
            await deleteAnalysis(user.uid, toDelete!.id);
            toast.success("Analysis deleted.");
          } catch (e) {
            toast.error(friendlyError(e));
          }
        }}
      />
    </>
  );
}

function AnalysisDetail({ ws, analysis }: { ws: Workspace; analysis: JobAnalysis }) {
  const { user, applications } = ws;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tracking, setTracking] = useState(false);
  const toast = useToast();
  const tracked = applications.find((a) => a.analysisId === analysis.id);

  async function track() {
    setTracking(true);
    try {
      await createApplication(user.uid, {
        company: analysis.company || "Unknown company",
        role: analysis.jobTitle,
        status: "saved",
        analysisId: analysis.id,
        score: analysis.score,
        notes: "",
      });
      toast.success("Added to your application tracker.");
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setTracking(false);
    }
  }

  return (
    <>
      <button className="btn btn-ghost btn-sm back" onClick={() => navigate("match")}><ArrowLeft size={16} /> All analyses</button>
      <PageHeader
        eyebrow={analysis.company || "Job match"}
        title={analysis.jobTitle}
        text={`Analyzed ${timeAgo(analysis.createdAt)}${analysis.yearsRequired ? ` · asks for ~${analysis.yearsRequired}+ years` : ""}`}
        actions={
          <>
            {tracked ? (
              <button className="btn btn-secondary" onClick={() => navigate("applications")}><BriefcaseBusiness size={16} /> View in tracker</button>
            ) : (
              <button className="btn btn-primary" onClick={track} disabled={tracking}>
                {tracking ? <Spinner size={16} /> : <Plus size={16} />} Track application
              </button>
            )}
            <button className="icon-btn bordered" onClick={() => setConfirmDelete(true)} aria-label="Delete analysis"><Trash size={16} /></button>
          </>
        }
      />

      <div className="grid-resume">
        <section className="card panel score-panel">
          <ScoreRing score={analysis.score} size={150} label="ATS match" />
          <h2>{scoreLabel(analysis.score)} match</h2>
          <div className="sub-scores">
            <div><div className="row-between small"><span>Skills</span><b>{analysis.skillScore}%</b></div><Progress value={analysis.skillScore} /></div>
            <div><div className="row-between small"><span>Keywords</span><b>{analysis.keywordScore}%</b></div><Progress value={analysis.keywordScore} /></div>
          </div>
        </section>

        <section className="card panel">
          <h2 className="panel-title">Skills</h2>
          <h4 className="sub">Matched <span className="muted">({analysis.matchedSkills.length})</span></h4>
          <Chips items={analysis.matchedSkills} tone="good" empty="No overlapping skills detected." />
          <h4 className="sub">Missing <span className="muted">({analysis.missingSkills.length})</span></h4>
          <Chips items={analysis.missingSkills} tone="bad" empty="You cover every skill we detected. 🎉" />
          <h4 className="sub">Keywords found</h4>
          <Chips items={analysis.matchedKeywords} tone="neutral" empty="None of the job's top keywords appear in your resume." />
          <h4 className="sub">Keywords to add</h4>
          <Chips items={analysis.missingKeywords} tone="neutral" empty="Your resume already uses the job's key terms." />
        </section>
      </div>

      <section className="card panel">
        <h2 className="panel-title"><Lightbulb size={18} /> Recommendations</h2>
        <ol className="suggestions">
          {analysis.suggestions.map((s) => <li key={s}>{s}</li>)}
        </ol>
      </section>

      <ApplicationBuilder ws={ws} analysis={analysis} />

      <ConfirmDialog
        open={confirmDelete}
        title="Delete analysis?"
        text="This match analysis and its generated documents will be removed. Tracked applications are kept."
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          try {
            await deleteAnalysis(user.uid, analysis.id);
            toast.success("Analysis deleted.");
            navigate("match");
          } catch (e) {
            toast.error(friendlyError(e));
          }
        }}
      />
    </>
  );
}

function ApplicationBuilder({ ws, analysis }: { ws: Workspace; analysis: JobAnalysis }) {
  const { user, resume, profile } = ws;
  const [kind, setKind] = useState<GeneratedKind>("coverLetter");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  const doc = analysis.generated?.[kind];

  async function generate() {
    if (!resume) return;
    setBusy(true);
    setNotice(null);
    try {
      const name = profile?.displayName || user.displayName || "Your Name";
      const result = await generateDocument(kind, { analysis, resume, profile, name });
      await saveGeneratedDoc(user.uid, analysis.id, kind, { text: result.text, source: result.source, createdAt: result.createdAt });
      if (result.notice) setNotice(result.notice);
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!doc) return;
    try {
      await navigator.clipboard.writeText(doc.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Couldn't access the clipboard. Select the text and copy it manually.");
    }
  }

  return (
    <section className="card panel builder">
      <div className="panel-head">
        <h2 className="panel-title"><Sparkles size={18} /> AI application builder</h2>
      </div>
      <div className="tabs scroll" role="tablist">
        {GENERATED_KINDS.map((k) => (
          <button key={k.kind} role="tab" aria-selected={kind === k.kind} className={kind === k.kind ? "active" : ""} onClick={() => { setKind(k.kind); setNotice(null); }}>
            {k.label}{analysis.generated?.[k.kind] && <span className="dot" aria-label="generated" />}
          </button>
        ))}
      </div>

      {!resume ? (
        <Alert tone="info">Upload your resume to generate tailored documents.</Alert>
      ) : busy ? (
        <div className="doc-loading"><Spinner size={22} label="Drafting with Gemini…" /><div className="skeleton" /><div className="skeleton short" /><div className="skeleton" /></div>
      ) : doc ? (
        <>
          {notice && <Alert tone="warn">{notice}</Alert>}
          <div className="doc-meta">
            <span className={`badge ${doc.source === "ai" ? "badge-accent" : ""}`}>{doc.source === "ai" ? "Written by Gemini" : "Smart template"}</span>
            <span className="muted small">{timeAgo(doc.createdAt)}</span>
            <div className="doc-actions">
              <button className="btn btn-ghost btn-sm" onClick={copy}>{copied ? <><Check size={15} /> Copied</> : <><Copy size={15} /> Copy</>}</button>
              <button className="btn btn-ghost btn-sm" onClick={generate}><RefreshCw size={15} /> Regenerate</button>
            </div>
          </div>
          <pre className="doc">{doc.text}</pre>
        </>
      ) : (
        <div className="builder-empty">
          <p className="muted">{GENERATED_KINDS.find((k) => k.kind === kind)?.description} Tailored to {analysis.jobTitle}{analysis.company ? ` at ${analysis.company}` : ""}.</p>
          <button className="btn btn-primary" onClick={generate}><WandSparkles size={16} /> Generate</button>
        </div>
      )}
    </section>
  );
}
