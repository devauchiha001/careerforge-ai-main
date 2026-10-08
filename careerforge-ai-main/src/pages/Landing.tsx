import { useState } from "react";
import {
  ArrowRight, BarChart3, CircleCheck, FileText, Menu, Moon, Search, ShieldCheck, Sparkles, Sun, Target, X, Zap,
} from "lucide-react";
import { Brand, ScoreRing, Spinner } from "../components/ui";
import type { Theme } from "../hooks/hooks";

const features = [
  { icon: FileText, title: "Resume Intelligence", text: "Turn your resume into structured career data and uncover your strongest skills." },
  { icon: Target, title: "JD Match Analysis", text: "Compare any job description against your profile and see exactly what is missing." },
  { icon: Search, title: "Related Job Discovery", text: "Browse real remote listings ranked against your resume and career profile." },
  { icon: Sparkles, title: "AI Application Builder", text: "Generate job-specific resumes, cover letters and recruiter messages." },
  { icon: BarChart3, title: "Application Tracker", text: "Keep every application, interview and offer organized in one pipeline." },
];

const steps = [
  { title: "Upload", text: "Import your resume PDF or paste the text." },
  { title: "Analyze", text: "Compare your skills with any job description." },
  { title: "Forge", text: "Create a tailored application and track it." },
];

type Props = { onSignIn: () => void; loading: boolean; theme: Theme; onToggleTheme: () => void };

export default function Landing({ onSignIn, loading, theme, onToggleTheme }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const cta = (label: string, className = "btn btn-primary btn-lg") => (
    <button className={className} onClick={onSignIn} disabled={loading}>
      {loading ? <Spinner size={18} label="Signing in…" /> : <>{label} <ArrowRight size={18} /></>}
    </button>
  );

  return (
    <div className="landing">
      <div className="landing-glow" aria-hidden />
      <nav className="landing-nav">
        <div className="container nav-inner">
          <a href="#top" className="brand-link" aria-label="CareerForge AI home"><Brand /></a>
          <div className={`nav-links ${menuOpen ? "open" : ""}`} onClick={() => setMenuOpen(false)}>
            <a href="#features">Features</a>
            <a href="#workflow">How it works</a>
            <a href="#get-started">Get started</a>
          </div>
          <div className="nav-actions">
            <button className="icon-btn" onClick={onToggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button className="btn btn-secondary btn-sm hide-xs" onClick={onSignIn} disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </button>
            <button className="icon-btn show-mobile" onClick={() => setMenuOpen((o) => !o)} aria-label="Toggle menu" aria-expanded={menuOpen}>
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </nav>

      <main id="top">
        <section className="container hero">
          <div className="hero-copy fade-up">
            <span className="pill"><Sparkles size={14} /> AI-powered career optimization</span>
            <h1>Build a career application <span className="gradient-text">that gets noticed.</span></h1>
            <p className="lead">
              CareerForge AI analyzes your resume against real job requirements, finds your gaps, and helps you create a stronger application in minutes.
            </p>
            <div className="hero-actions">
              {cta("Analyze my resume")}
              <a className="btn btn-secondary btn-lg" href="#features">Explore features</a>
            </div>
            <ul className="trust">
              <li><CircleCheck size={16} /> Resume analysis</li>
              <li><CircleCheck size={16} /> ATS optimization</li>
              <li><CircleCheck size={16} /> Interview preparation</li>
            </ul>
          </div>

          <div className="hero-preview fade-up delay-1" aria-label="Sample match report preview">
            <div className="preview-card">
              <div className="preview-head">
                <div>
                  <span className="muted small">Sample report</span>
                  <strong>Frontend Engineer · Acme</strong>
                </div>
                <span className="badge badge-good">Strong match</span>
              </div>
              <div className="preview-body">
                <ScoreRing score={82} size={112} label="ATS match" />
                <div className="preview-bars">
                  {[["Skills", 86], ["Keywords", 74], ["Resume quality", 88]].map(([label, value]) => (
                    <div key={label}>
                      <div className="row-between small"><span>{label}</span><span className="muted">{value}%</span></div>
                      <div className="progress tone-good"><span style={{ width: `${value}%` }} /></div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="preview-chips">
                <span className="chip chip-good">React</span><span className="chip chip-good">TypeScript</span>
                <span className="chip chip-good">REST APIs</span><span className="chip chip-bad">GraphQL</span>
              </div>
            </div>
            <div className="preview-float">
              <Zap size={16} /> Cover letter drafted
            </div>
          </div>
        </section>

        <section id="features" className="container section">
          <div className="section-heading">
            <span className="eyebrow">01 / Capabilities</span>
            <h2>One workspace for your entire job search.</h2>
          </div>
          <div className="feature-grid">
            {features.map(({ icon: Icon, title, text }) => (
              <article className="card feature-card" key={title}>
                <div className="icon-tile"><Icon size={20} /></div>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="workflow" className="container section workflow">
          <div>
            <span className="eyebrow">02 / Workflow</span>
            <h2>From resume to application-ready.</h2>
            <p className="lead">Upload once. CareerForge builds a structured profile you can reuse across every opportunity.</p>
            <p className="muted small privacy"><ShieldCheck size={16} /> Your resume is parsed in your browser and stored privately in your own account.</p>
          </div>
          <ol className="steps">
            {steps.map((s, i) => (
              <li key={s.title} className="card step">
                <b>{String(i + 1).padStart(2, "0")}</b>
                <div><strong>{s.title}</strong><span>{s.text}</span></div>
              </li>
            ))}
          </ol>
        </section>

        <section id="get-started" className="container section">
          <div className="cta-band">
            <div>
              <h2>Ready to land your next role?</h2>
              <p>Sign in with Google to start your free career workspace.</p>
            </div>
            {cta("Get started free")}
          </div>
        </section>
      </main>

      <footer className="container landing-footer">
        <Brand />
        <span>Built for smarter job applications. © {new Date().getFullYear()}</span>
      </footer>
    </div>
  );
}
