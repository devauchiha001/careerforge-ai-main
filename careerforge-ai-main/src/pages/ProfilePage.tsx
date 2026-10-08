import { useState, type FormEvent, type KeyboardEvent } from "react";
import { LogOut, Moon, Save, Sun, Trash, X } from "lucide-react";
import { Alert, ConfirmDialog, PageHeader, Spinner, useToast } from "../components/ui";
import { clearWorkspace, updateCareerProfile } from "../lib/database";
import { friendlyError } from "../lib/errors";
import type { Theme } from "../hooks/hooks";
import { Avatar, type Workspace } from "./Dashboard";

type Props = { ws: Workspace; theme: Theme; onToggleTheme: () => void; onSignOut: () => void };

export default function ProfilePage({ ws, theme, onToggleTheme, onSignOut }: Props) {
  const { user, profile, resume } = ws;
  const initial = {
    displayName: profile?.displayName || user.displayName || "",
    headline: profile?.headline ?? "",
    targetRoles: (profile?.targetRoles?.length ? profile.targetRoles : profile?.targetRole ? [profile.targetRole] : []).join(", "),
    location: profile?.location ?? "",
    country: profile?.country ?? "",
    region: profile?.region ?? "",
    city: profile?.city ?? "",
    preferredLocations: (profile?.preferredLocations ?? []).join(", "),
    remotePreference: profile?.remotePreference ?? "any",
    experienceLevel: profile?.experienceLevel ?? "",
    yearsExperience: profile?.yearsExperience?.toString() ?? "",
    education: profile?.education ?? "",
  };
  const [form, setForm] = useState(initial);
  const [skills, setSkills] = useState<string[]>(profile?.technicalSkills ?? profile?.skills ?? []);
  const [skillInput, setSkillInput] = useState("");
  const [softSkills, setSoftSkills] = useState<string[]>(profile?.softSkills ?? []);
  const [softSkillInput, setSoftSkillInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const toast = useToast();

  const initialSoftSkills = profile?.softSkills ?? [];
  const dirty = JSON.stringify({ ...form, skills, softSkills }) !== JSON.stringify({ ...initial, skills: profile?.technicalSkills ?? profile?.skills ?? [], softSkills: initialSoftSkills });
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  function addSkill(raw: string) {
    const items = raw.split(",").map((s) => s.trim()).filter(Boolean);
    setSkills((current) => [...current, ...items.filter((s) => !current.some((c) => c.toLowerCase() === s.toLowerCase()))].slice(0, 60));
    setSkillInput("");
  }

  function addSoftSkill(raw: string) {
    const items = raw.split(",").map((item) => item.trim()).filter(Boolean);
    setSoftSkills((current) => [...current, ...items.filter((item) => !current.some((existing) => existing.toLowerCase() === item.toLowerCase()))].slice(0, 40));
    setSoftSkillInput("");
  }

  function onSkillKey(e: KeyboardEvent<HTMLInputElement>) {
    if ((e.key === "Enter" || e.key === ",") && skillInput.trim()) {
      e.preventDefault();
      addSkill(skillInput);
    } else if (e.key === "Backspace" && !skillInput && skills.length) {
      setSkills((s) => s.slice(0, -1));
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.displayName.trim()) return setError("Please enter your name.");
    setBusy(true);
    setError(null);
    try {
      const pending = skillInput.trim() ? [...skills, ...skillInput.split(",").map((s) => s.trim()).filter(Boolean)] : skills;
      const pendingSoft = softSkillInput.trim()
        ? [...softSkills, ...softSkillInput.split(",").map((item) => item.trim()).filter(Boolean)]
        : softSkills;
      const targetRoles = parseList(form.targetRoles);
      const preferredLocations = parseList(form.preferredLocations);
      await updateCareerProfile(user.uid, {
        displayName: form.displayName.trim(),
        headline: form.headline.trim(),
        targetRole: targetRoles[0] ?? "",
        targetRoles,
        location: form.location.trim(),
        country: form.country.trim(),
        region: form.region.trim(),
        city: form.city.trim(),
        preferredLocations,
        remotePreference: form.remotePreference,
        experienceLevel: form.experienceLevel.trim(),
        yearsExperience: form.yearsExperience ? Number(form.yearsExperience) : null,
        education: form.education.trim(),
        skills: pending,
        technicalSkills: pending,
        softSkills: pendingSoft,
      });
      setSkills(pending);
      setSoftSkills(pendingSoft);
      setSkillInput("");
      setSoftSkillInput("");
      toast.success("Profile saved.");
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow="Account" title="Career profile" text="This information personalizes your analyses and generated documents." />

      <form className="card panel form" onSubmit={submit}>
        <div className="profile-head">
          <Avatar user={user} size={56} />
          <div><strong>{form.displayName || "Your name"}</strong><span className="muted small">{user.email}</span></div>
        </div>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="form-grid">
          <label className="field"><span>Full name</span><input className="input" maxLength={80} value={form.displayName} onChange={set("displayName")} /></label>
          <label className="field"><span>Target roles</span><input className="input" maxLength={240} value={form.targetRoles} onChange={set("targetRoles")} placeholder="e.g. Product Designer, UX Researcher" /></label>
          <label className="field"><span>Headline</span><input className="input" maxLength={140} value={form.headline} onChange={set("headline")} placeholder="e.g. CS student building fast, accessible web apps" /></label>
          <label className="field"><span>Country</span><input className="input" maxLength={80} value={form.country} onChange={set("country")} placeholder="Country" /></label>
          <label className="field"><span>State / region</span><input className="input" maxLength={100} value={form.region} onChange={set("region")} placeholder="State, province, or region" /></label>
          <label className="field"><span>City</span><input className="input" maxLength={100} value={form.city} onChange={set("city")} placeholder="City" /></label>
          <label className="field"><span>Preferred locations</span><input className="input" maxLength={300} value={form.preferredLocations} onChange={set("preferredLocations")} placeholder="Cities, regions, or countries (comma-separated)" /></label>
          <label className="field"><span>Work preference</span><select className="input select" value={form.remotePreference} onChange={set("remotePreference")}><option value="any">Any work mode</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="on-site">On-site</option></select></label>
          <label className="field"><span>Experience level</span><select className="input select" value={form.experienceLevel} onChange={set("experienceLevel")}><option value="">Not specified</option><option value="Intern">Intern</option><option value="Entry">Entry level</option><option value="Mid">Mid level</option><option value="Senior">Senior</option><option value="Lead">Lead / principal</option></select></label>
          <label className="field"><span>Years of experience</span><input className="input" type="number" min="0" max="60" value={form.yearsExperience} onChange={set("yearsExperience")} placeholder="Optional" /></label>
          <label className="field"><span>Education</span><input className="input" maxLength={240} value={form.education} onChange={set("education")} placeholder="Degree, field, or relevant education" /></label>
        </div>
        <div className="field">
          <span>Skills</span>
          <div className="tag-input">
            {skills.map((s) => (
              <span key={s} className="chip">
                {s}
                <button type="button" onClick={() => setSkills(skills.filter((x) => x !== s))} aria-label={`Remove ${s}`}><X size={12} /></button>
              </span>
            ))}
            <input value={skillInput} onChange={(e) => setSkillInput(e.target.value)} onKeyDown={onSkillKey} onBlur={() => skillInput.trim() && addSkill(skillInput)} placeholder={skills.length ? "Add more…" : "Type a skill and press Enter"} aria-label="Add skill" />
          </div>
          {resume && resume.skills.some((s) => !skills.includes(s)) && (
            <button type="button" className="link small" onClick={() => setSkills([...new Set([...skills, ...resume.skills])])}>
              + Import {resume.skills.filter((s) => !skills.includes(s)).length} skills from your resume
            </button>
          )}
        </div>
        <div className="field">
          <span>Soft skills</span>
          <div className="tag-input">
            {softSkills.map((item) => <span key={item} className="chip">{item}<button type="button" onClick={() => setSoftSkills(softSkills.filter((value) => value !== item))} aria-label={`Remove ${item}`}><X size={12} /></button></span>)}
            <input value={softSkillInput} onChange={(event) => setSoftSkillInput(event.target.value)} onKeyDown={(event) => {
              if ((event.key === "Enter" || event.key === ",") && softSkillInput.trim()) { event.preventDefault(); addSoftSkill(softSkillInput); }
              else if (event.key === "Backspace" && !softSkillInput && softSkills.length) setSoftSkills((items) => items.slice(0, -1));
            }} onBlur={() => softSkillInput.trim() && addSoftSkill(softSkillInput)} placeholder={softSkills.length ? "Add more…" : "Communication, leadership…"} aria-label="Add soft skill" />
          </div>
        </div>
        <label className="field"><span>Additional location preference <em>optional</em></span><input className="input" maxLength={160} value={form.location} onChange={set("location")} placeholder="Any additional location details" /></label>
        <div className="row-end">
          <button className="btn btn-primary" disabled={busy || !dirty}>{busy ? <Spinner size={16} /> : <Save size={16} />} Save profile</button>
        </div>
      </form>

      <section className="card panel">
        <h2 className="panel-title">Appearance</h2>
        <div className="setting-row">
          <div><strong>Theme</strong><span className="muted small">Currently using {theme} mode.</span></div>
          <button className="btn btn-secondary" onClick={onToggleTheme}>{theme === "dark" ? <><Sun size={16} /> Light mode</> : <><Moon size={16} /> Dark mode</>}</button>
        </div>
      </section>

      <section className="card panel danger-zone">
        <h2 className="panel-title">Data & account</h2>
        <div className="setting-row">
          <div><strong>Sign out</strong><span className="muted small">Sign out of CareerForge on this device.</span></div>
          <button className="btn btn-secondary" onClick={onSignOut}><LogOut size={16} /> Sign out</button>
        </div>
        <div className="setting-row">
          <div><strong>Clear workspace</strong><span className="muted small">Delete your resume, analyses, saved jobs and applications. Your profile is kept.</span></div>
          <button className="btn btn-danger" onClick={() => setConfirmClear(true)}><Trash size={16} /> Clear data</button>
        </div>
      </section>

      <ConfirmDialog
        open={confirmClear}
        title="Clear your workspace?"
        text="This permanently deletes your resume, every job analysis, saved job and tracked application. This can't be undone."
        confirmLabel="Delete everything"
        onClose={() => setConfirmClear(false)}
        onConfirm={async () => {
          try {
            await clearWorkspace(user.uid);
            toast.success("Workspace cleared.");
          } catch (e) {
            toast.error(friendlyError(e));
          }

        }}
      />
    </>
  );
}

function parseList(value: string): string[] {
  return [...new Set(value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean))];
}
