import { useState, type DragEvent, type ReactNode } from "react";
import { CircleCheck, CircleX, ClipboardPaste, FileText, FileUp, Link2, Mail, Phone, RefreshCw, Target, Trash, UserRound } from "lucide-react";
import { Alert, Chips, ConfirmDialog, PageHeader, ScoreRing, Spinner, formatDate, useToast } from "../components/ui";
import { navigate } from "../hooks/hooks";
import { analyzeResume, countWords, scoreLabel } from "../lib/analysis";
import { deleteResume, saveResume, updateCareerProfile } from "../lib/database";
import { friendlyError } from "../lib/errors";
import { extractResumeText } from "../lib/pdf";
import type { Workspace } from "./Dashboard";

export default function ResumePage({ ws }: { ws: Workspace }) {
  const { user, resume, profile } = ws;
  const [replacing, setReplacing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const toast = useToast();

  if (!resume || replacing) {
    return (
      <>
        <PageHeader
          eyebrow="Resume analyzer"
          title={resume ? "Replace your resume" : "Upload your resume"}
          text="We'll extract your skills, check ATS-readiness and score your resume. Parsing happens in your browser."
          actions={resume && <button className="btn btn-ghost" onClick={() => setReplacing(false)}>Cancel</button>}
        />
        <ResumeUploader
          uid={user.uid}
          onDone={() => {
            setReplacing(false);
            toast.success("Resume analyzed and saved.");
          }}
        />
      </>
    );
  }

  const failed = resume.checks.filter((c) => !c.passed);
  const profileSkills = new Set(profile?.technicalSkills ?? profile?.skills ?? []);
  const newSkills = resume.skills.filter((s) => !profileSkills.has(s));

  async function syncSkills() {
    setSyncing(true);
    try {
      const technicalSkills = [...new Set([...(profile?.technicalSkills ?? profile?.skills ?? []), ...newSkills])];
      await updateCareerProfile(user.uid, { skills: technicalSkills, technicalSkills });
      toast.success(`Added ${newSkills.length} skill${newSkills.length === 1 ? "" : "s"} to your profile.`);
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setSyncing(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Resume analyzer"
        title="Your resume analysis"
        text={`${resume.fileName} · ${resume.wordCount} words · analyzed ${formatDate(resume.uploadedAt)}`}
        actions={
          <>
            <button className="btn btn-secondary" onClick={() => setReplacing(true)}><RefreshCw size={16} /> Replace</button>
            <button className="btn btn-primary" onClick={() => navigate("match")}><Target size={16} /> Match to a job</button>
            <button className="btn btn-secondary" onClick={() => navigate("jobs")}>Explore related jobs</button>
          </>
        }
      />

      <div className="grid-resume">
        <section className="card panel score-panel">
          <ScoreRing score={resume.score} size={150} label="Resume score" />
          <h2>{scoreLabel(resume.score)}</h2>
          <p className="muted">
            {failed.length ? `${failed.length} improvement${failed.length === 1 ? "" : "s"} could raise your score.` : "Your resume passes every check. Nice work!"}
          </p>
          <div className="contact-list">
            <ContactItem icon={<Mail size={15} />} value={resume.contact.email} label="Email" />
            <ContactItem icon={<Phone size={15} />} value={resume.contact.phone} label="Phone" />
            <ContactItem icon={<Link2 size={15} />} value={resume.contact.linkedin} label="LinkedIn" />
            <ContactItem icon={<Link2 size={15} />} value={resume.contact.github} label="GitHub" />
          </div>
        </section>

        <section className="card panel">
          <div className="panel-head"><h2>ATS readiness checks</h2><span className="muted small">{resume.checks.length - failed.length}/{resume.checks.length} passed</span></div>
          <ul className="checks">
            {[...failed, ...resume.checks.filter((c) => c.passed)].map((c) => (
              <li key={c.id} className={c.passed ? "pass" : "fail"}>
                {c.passed ? <CircleCheck size={18} /> : <CircleX size={18} />}
                <div><strong>{c.label}</strong>{!c.passed && <span>{c.tip}</span>}</div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card panel">
        <div className="panel-head">
          <h2>Detected skills <span className="muted">({resume.skills.length})</span></h2>
          {newSkills.length > 0 && (
            <button className="btn btn-secondary btn-sm" onClick={syncSkills} disabled={syncing}>
              {syncing ? <Spinner size={14} /> : <UserRound size={14} />} Add {newSkills.length} to profile
            </button>
          )}
        </div>
        <Chips items={resume.skills} empty="No known skills detected. Make sure your resume has a Skills section." />
      </section>

      <details className="card panel text-preview">
        <summary><FileText size={16} /> View extracted text</summary>
        <pre>{resume.text}</pre>
      </details>

      <div className="danger-row">
        <button className="btn btn-ghost btn-danger-text" onClick={() => setConfirmDelete(true)}><Trash size={16} /> Delete resume</button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete resume?"
        text="Your resume text and analysis will be removed. Saved job matches and applications are kept."
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          try {
            await deleteResume(user.uid);
            toast.success("Resume deleted.");
          } catch (e) {
            toast.error(friendlyError(e));
          }
        }}
      />
    </>
  );
}

function ContactItem({ icon, value, label }: { icon: ReactNode; value?: string; label: string }) {
  return (
    <div className={`contact-item ${value ? "" : "missing"}`}>
      {icon}
      <span title={value}>{value || `No ${label} found`}</span>
    </div>
  );
}

function ResumeUploader({ uid, onDone }: { uid: string; onDone: () => void }) {
  const [mode, setMode] = useState<"upload" | "paste">("upload");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");

  async function process(getText: () => Promise<string>, fileName: string) {
    setError(null);
    try {
      setBusy("Reading your resume…");
      const text = await getText();
      if (countWords(text) < 40) throw new Error("That resume looks too short to analyze. Please check the file or paste the full text.");
      setBusy("Analyzing and saving…");
      await saveResume(uid, analyzeResume(text, fileName));
      onDone();
    } catch (e) {
      console.error("Resume processing failed:", e);
      setError(friendlyError(e, "We couldn't process that resume."));
    } finally {
      setBusy(null);
    }
  }

  function onFile(file?: File) {
    if (file) process(() => extractResumeText(file), file.name);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    onFile(e.dataTransfer.files?.[0]);
  }

  return (
    <div className="card panel uploader">
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={mode === "upload"} className={mode === "upload" ? "active" : ""} onClick={() => setMode("upload")}><FileUp size={16} /> Upload file</button>
        <button role="tab" aria-selected={mode === "paste"} className={mode === "paste" ? "active" : ""} onClick={() => setMode("paste")}><ClipboardPaste size={16} /> Paste text</button>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {busy ? (
        <div className="dropzone busy"><Spinner size={28} /><strong>{busy}</strong></div>
      ) : mode === "upload" ? (
        <label
          className={`dropzone ${dragging ? "dragging" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <input type="file" accept=".pdf,.txt,.md,application/pdf,text/plain" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
          <div className="icon-tile lg"><FileUp size={26} /></div>
          <strong>Drop your resume here, or <span className="link">browse</span></strong>
          <span className="muted small">PDF or TXT · up to 8 MB</span>
        </label>
      ) : (
        <div className="stack">
          <textarea
            className="input textarea"
            rows={12}
            placeholder="Paste the full text of your resume here…"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
          />
          <div className="row-between">
            <span className="muted small">{countWords(pasted)} words</span>
            <button className="btn btn-primary" disabled={countWords(pasted) < 40} onClick={() => process(async () => pasted, "Pasted resume")}>
              Analyze resume
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
