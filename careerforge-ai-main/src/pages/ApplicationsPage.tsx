import { useMemo, useState, type FormEvent } from "react";
import { BriefcaseBusiness, Calendar, ExternalLink, MapPin, Pencil, Plus, Search, Target, Trash } from "lucide-react";
import { Alert, ConfirmDialog, EmptyState, Modal, PageHeader, Spinner, formatDate, useToast } from "../components/ui";
import {
  APPLICATION_STATUSES, createApplication, deleteApplication, updateApplication,
  type Application, type ApplicationInput, type ApplicationStatus,
} from "../lib/database";
import { scoreTone } from "../lib/analysis";
import { friendlyError } from "../lib/errors";
import type { Workspace } from "./Dashboard";

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  saved: "Saved",
  applied: "Applied",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
};

type Filter = ApplicationStatus | "all";

export default function ApplicationsPage({ ws }: { ws: Workspace }) {
  const { user, applications } = ws;
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Application | "new" | null>(null);
  const [toDelete, setToDelete] = useState<Application | null>(null);
  const toast = useToast();

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return applications.filter(
      (a) => (filter === "all" || a.status === filter) && (!q || `${a.company} ${a.role} ${a.location ?? ""} ${a.notes ?? ""}`.toLowerCase().includes(q)),
    );
  }, [applications, filter, query]);

  async function changeStatus(app: Application, status: ApplicationStatus) {
    try {
      const appliedOn = status === "applied" && !app.appliedOn ? new Date().toISOString().slice(0, 10) : app.appliedOn;
      await updateApplication(user.uid, app.id, { status, appliedOn });
      toast.success(`${app.company} moved to ${STATUS_LABELS[status]}.`);
    } catch (e) {
      toast.error(friendlyError(e));
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Application tracker"
        title="Your applications"
        text="Keep every application, interview and opportunity organized in one place."
        actions={<button className="btn btn-primary" onClick={() => setEditing("new")}><Plus size={16} /> Add application</button>}
      />

      <div className="toolbar">
        <div className="tabs scroll" role="tablist">
          {(["all", ...APPLICATION_STATUSES] as Filter[]).map((f) => {
            const count = f === "all" ? applications.length : applications.filter((a) => a.status === f).length;
            return (
              <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? "active" : ""} onClick={() => setFilter(f)}>
                {f === "all" ? "All" : STATUS_LABELS[f]} <span className="count">{count}</span>
              </button>
            );
          })}
        </div>
        <label className="search">
          <Search size={16} />
          <input className="input" placeholder="Search company, role…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search applications" />
        </label>
      </div>

      {!applications.length ? (
        <EmptyState
          icon={<BriefcaseBusiness size={22} />}
          title="No applications yet"
          text="Add applications manually, or track one directly from a job match analysis."
          action={<button className="btn btn-primary" onClick={() => setEditing("new")}><Plus size={16} /> Add your first application</button>}
        />
      ) : !visible.length ? (
        <EmptyState icon={<Search size={22} />} title="No matches" text="No applications match your filters." action={<button className="btn btn-secondary btn-sm" onClick={() => { setFilter("all"); setQuery(""); }}>Clear filters</button>} />
      ) : (
        <div className="app-grid">
          {visible.map((app) => (
            <article key={app.id} className="card app-card">
              <div className="app-top">
                <div className="company-logo" aria-hidden>{app.company.charAt(0).toUpperCase()}</div>
                <div className="app-title">
                  <strong>{app.role}</strong>
                  <span>{app.company}</span>
                </div>
                {typeof app.score === "number" && (
                  <a href={app.analysisId ? `#/match/${app.analysisId}` : undefined} className={`score-pill tone-${scoreTone(app.score)}`} title="ATS match score">{app.score}%</a>
                )}
              </div>
              <div className="app-meta">
                {app.location && <span><MapPin size={14} /> {app.location}</span>}
                <span><Calendar size={14} /> {app.appliedOn ? `Applied ${formatDate(app.appliedOn)}` : `Added ${formatDate(app.createdAt)}`}</span>
                {app.source && <span>{app.source}</span>}
              </div>
              {app.notes && <p className="app-notes">{app.notes}</p>}
              <div className="app-actions">
                <select className={`input select status-select status-${app.status}`} value={app.status} onChange={(e) => changeStatus(app, e.target.value as ApplicationStatus)} aria-label="Change status">
                  {APPLICATION_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
                <div className="icon-group">
                  {app.analysisId && <a className="icon-btn" href={`#/match/${app.analysisId}`} aria-label="View job match"><Target size={16} /></a>}
                  {app.url && <a className="icon-btn" href={app.url} target="_blank" rel="noopener noreferrer" aria-label="Open job posting"><ExternalLink size={16} /></a>}
                  <button className="icon-btn" onClick={() => setEditing(app)} aria-label="Edit application"><Pencil size={16} /></button>
                  <button className="icon-btn" onClick={() => setToDelete(app)} aria-label="Delete application"><Trash size={16} /></button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {editing && (
        <ApplicationForm
          uid={user.uid}
          app={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(msg) => { setEditing(null); toast.success(msg); }}
        />
      )}

      <ConfirmDialog
        open={!!toDelete}
        title="Delete application?"
        text={`“${toDelete?.role}” at ${toDelete?.company} will be permanently removed.`}
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          try {
            await deleteApplication(user.uid, toDelete!.id);
            toast.success("Application deleted.");
          } catch (e) {
            toast.error(friendlyError(e));
          }
        }}
      />
    </>
  );
}

function ApplicationForm({ uid, app, onClose, onSaved }: { uid: string; app: Application | null; onClose: () => void; onSaved: (msg: string) => void }) {
  const [form, setForm] = useState({
    company: app?.company ?? "",
    role: app?.role ?? "",
    status: app?.status ?? ("saved" as ApplicationStatus),
    url: app?.url ?? "",
    location: app?.location ?? "",
    appliedOn: app?.appliedOn ?? "",
    notes: app?.notes ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const company = form.company.trim();
    const role = form.role.trim();
    if (!company || !role) return setError("Company and role are required.");
    let url = form.url.trim();
    if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
    if (url) {
      try { new URL(url); } catch { return setError("Please enter a valid job posting URL."); }
    }
    setBusy(true);
    setError(null);
    const input: ApplicationInput = { ...form, company, role, url, location: form.location.trim(), notes: form.notes.trim() };
    try {
      if (app) {
        await updateApplication(uid, app.id, input);
        onSaved("Application updated.");
      } else {
        await createApplication(uid, input);
        onSaved("Application added.");
      }
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      title={app ? "Edit application" : "Add application"}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" form="app-form" className="btn btn-primary" disabled={busy}>
            {busy ? <Spinner size={16} /> : null} {app ? "Save changes" : "Add application"}
          </button>
        </>
      }
    >
      <form id="app-form" className="form" onSubmit={submit} noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="form-grid">
          <label className="field"><span>Company</span><input className="input" required maxLength={120} value={form.company} onChange={set("company")} placeholder="Acme Inc." /></label>
          <label className="field"><span>Role</span><input className="input" required maxLength={120} value={form.role} onChange={set("role")} placeholder="Frontend Engineer" /></label>
          <label className="field">
            <span>Status</span>
            <select className="input select" value={form.status} onChange={set("status")}>
              {APPLICATION_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          </label>
          <label className="field"><span>Applied on <em>optional</em></span><input className="input" type="date" value={form.appliedOn} onChange={set("appliedOn")} /></label>
          <label className="field"><span>Location <em>optional</em></span><input className="input" maxLength={120} value={form.location} onChange={set("location")} placeholder="Remote · Bengaluru" /></label>
          <label className="field"><span>Job posting URL <em>optional</em></span><input className="input" type="url" maxLength={500} value={form.url} onChange={set("url")} placeholder="https://…" /></label>
        </div>
        <label className="field"><span>Notes <em>optional</em></span><textarea className="input textarea" rows={4} maxLength={2000} value={form.notes} onChange={set("notes")} placeholder="Recruiter name, interview dates, follow-ups…" /></label>
      </form>
    </Modal>
  );
}
