import type { JobAnalysis, ResumeCheck, ResumeData } from "./database";
import { extractSkills } from "./skills";

const MAX_STORED_TEXT = 40_000;

const ACTION_VERBS = [
  "achieved", "built", "created", "delivered", "designed", "developed", "drove", "improved", "increased",
  "implemented", "launched", "led", "managed", "optimized", "optimised", "reduced", "shipped", "automated",
  "architected", "streamlined", "migrated", "scaled", "spearheaded", "owned", "mentored", "resolved",
];

const STOPWORDS = new Set(
  ("a about above across after again against all also am an and any are as at be because been before being below between both but by can could did do does doing down during each etc few for from further had has have having he her here hers him his how i if in into is it its itself just me more most my no nor not of off on once only or other our ours out over own per same she should so some such than that the their theirs them then there these they this those through to too under until up very was we were what when where which while who whom why will with within without would you your yours " +
    // Generic job-posting vocabulary that says nothing about fit.
    "ability able join role position candidate candidates team teams work working company job jobs opportunity looking seeking we're you'll you're including include includes strong excellent good great plus preferred required requirements requirement responsibilities responsibility qualifications qualification experience experienced years year must nice have help new across within well using use used based like make ensure etc day days time full part benefits salary apply application equal employer environment world best people offer help bonus based skills skill knowledge understanding familiarity proficiency proficient related field degree bachelor master health insurance paid leave vacation competitive culture mission diverse diversity inclusive inclusion office hybrid remote perks equity compensation")
    .split(/\s+/),
);

/** Very light stemmer so "developing", "developed" and "develops" compare equal. */
function stem(word: string) {
  return word
    .toLowerCase()
    .replace(/(ations?|ings?|ments?|ers?|ed|es|s)$/u, "")
    .slice(0, 8);
}

function tokens(text: string) {
  return text.toLowerCase().match(/[a-z][a-z+#.\-]{2,}/g)?.map((t) => t.replace(/[.\-]+$/, "")) ?? [];
}

export function countWords(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

// ---------- Resume ----------

export function analyzeResume(rawText: string, fileName: string): ResumeData {
  const text = rawText.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").trim();
  const lower = text.toLowerCase();
  const skills = extractSkills(text);
  const wordCount = countWords(text);

  const contact = {
    email: text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0],
    phone: text.match(/(?:\+?\d[\d\s().-]{8,}\d)/)?.[0]?.trim(),
    linkedin: text.match(/linkedin\.com\/[\w\-/]+/i)?.[0],
    github: text.match(/github\.com\/[\w\-]+/i)?.[0],
  };

  const has = (re: RegExp) => re.test(lower);
  const metrics = (text.match(/\d+(?:\.\d+)?\s*(?:%|percent|x\b|k\b|\+)|[$₹€£]\s?\d/gi) ?? []).length;
  const verbs = ACTION_VERBS.filter((v) => new RegExp(`\\b${v}\\b`).test(lower)).length;

  const checks: ResumeCheck[] = [
    { id: "contact", label: "Contact details", passed: !!contact.email && !!contact.phone, tip: "Include a professional email address and phone number at the top." },
    { id: "links", label: "Professional links", passed: !!contact.linkedin || !!contact.github, tip: "Add your LinkedIn and/or GitHub/portfolio URL." },
    { id: "experience", label: "Experience section", passed: has(/\b(experience|employment|work history|internships?)\b/), tip: "Add an Experience (or Internships) section with roles, dates and outcomes." },
    { id: "education", label: "Education section", passed: has(/\b(education|university|college|degree|b\.?tech|bachelor|master)\b/), tip: "Add an Education section with your degree, institution and dates." },
    { id: "skills", label: "Skills section", passed: has(/\b(skills|technologies|tech stack|tools)\b/), tip: "Add a dedicated Skills section so ATS parsers can find your keywords." },
    { id: "projects", label: "Projects or achievements", passed: has(/\b(projects?|achievements?|accomplishments?|awards?)\b/), tip: "Showcase 2–3 projects or achievements with links and results." },
    { id: "metrics", label: "Quantified impact", passed: metrics >= 3, tip: "Quantify results — e.g. “cut load time by 40%” or “served 10k users”." },
    { id: "verbs", label: "Strong action verbs", passed: verbs >= 5, tip: "Start bullet points with verbs like Built, Led, Improved, Automated." },
    { id: "length", label: "Appropriate length", passed: wordCount >= 250 && wordCount <= 1100, tip: wordCount < 250 ? "Your resume looks short — expand on impact and responsibilities." : "Your resume is long — aim for 1–2 pages of focused content." },
    { id: "keywords", label: "Keyword coverage", passed: skills.length >= 8, tip: "List more of your relevant tools and technologies (aim for 8+)." },
  ];

  const weights: Record<string, number> = { contact: 12, links: 6, experience: 14, education: 8, skills: 12, projects: 8, metrics: 14, verbs: 10, length: 8, keywords: 8 };
  const score = Math.round(checks.reduce((sum, c) => sum + (c.passed ? weights[c.id] : 0), 0));

  return { fileName, text: text.slice(0, MAX_STORED_TEXT), skills, wordCount, score, checks, contact, uploadedAt: Date.now() };
}

// ---------- Job match ----------

function topKeywords(jd: string, exclude: Set<string>, limit = 18) {
  const counts = new Map<string, { word: string; count: number }>();
  for (const t of tokens(jd)) {
    if (t.length < 4 || STOPWORDS.has(t) || exclude.has(t)) continue;
    const key = stem(t);
    const entry = counts.get(key);
    if (entry) entry.count++;
    else counts.set(key, { word: t, count: 1 });
  }
  return [...counts.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, limit)
    .map(([key, { word }]) => ({ key, word }));
}

export function analyzeJobMatch(
  resume: Pick<ResumeData, "text" | "skills">,
  job: { jobTitle: string; company: string; jobDescription: string },
): Omit<JobAnalysis, "id"> {
  const jdSkills = extractSkills(job.jobDescription);
  const resumeSkills = new Set(resume.skills.length ? resume.skills : extractSkills(resume.text));
  const matchedSkills = jdSkills.filter((s) => resumeSkills.has(s));
  const missingSkills = jdSkills.filter((s) => !resumeSkills.has(s));

  const skillWords = new Set(jdSkills.flatMap((s) => s.toLowerCase().split(/\s+/)));
  const keywords = topKeywords(job.jobDescription, skillWords);
  const resumeStems = new Set(tokens(resume.text).map(stem));
  const matchedKeywords = keywords.filter((k) => resumeStems.has(k.key)).map((k) => k.word);
  const missingKeywords = keywords.filter((k) => !resumeStems.has(k.key)).map((k) => k.word);

  const skillScore = jdSkills.length ? matchedSkills.length / jdSkills.length : 0;
  const keywordScore = keywords.length ? matchedKeywords.length / keywords.length : 0;
  const score = Math.round(100 * (jdSkills.length ? 0.7 * skillScore + 0.3 * keywordScore : keywordScore));

  const yearsMatch = job.jobDescription.match(/(\d{1,2})\s*\+?\s*(?:-|–|to)?\s*(?:\d{1,2}\s*)?\+?\s*years?/i);
  const yearsRequired = yearsMatch ? Number(yearsMatch[1]) : undefined;

  const suggestions: string[] = [];
  if (missingSkills.length) {
    suggestions.push(`If you have experience with ${listJoin(missingSkills.slice(0, 4))}, add it to your Skills section and show it in a bullet point.`);
  }
  if (missingKeywords.length) {
    suggestions.push(`Mirror the job's language — work terms like ${listJoin(missingKeywords.slice(0, 5).map((k) => `“${k}”`))} into your summary or experience where they're accurate.`);
  }
  if (matchedSkills.length) {
    suggestions.push(`Lead with your strongest overlaps (${listJoin(matchedSkills.slice(0, 3))}) in your summary and top bullet points.`);
  }
  if (yearsRequired) {
    suggestions.push(`The role asks for about ${yearsRequired}+ years of experience — make your timeline and relevant project durations easy to spot.`);
  }
  if (job.jobTitle) {
    suggestions.push(`Use the exact job title “${job.jobTitle}” in your resume headline or summary to improve ATS matching.`);
  }
  if (score >= 75) suggestions.push("Strong match — tailor your cover letter to this company and apply soon.");
  else if (score < 45) suggestions.push("This is a stretch role. Consider building a small project that demonstrates the missing skills.");

  return {
    jobTitle: job.jobTitle.trim() || "Untitled role",
    company: job.company.trim(),
    jobDescription: job.jobDescription.trim().slice(0, MAX_STORED_TEXT),
    score,
    skillScore: Math.round(skillScore * 100),
    keywordScore: Math.round(keywordScore * 100),
    matchedSkills,
    missingSkills,
    matchedKeywords,
    missingKeywords,
    yearsRequired,
    suggestions,
    createdAt: Date.now(),
  };
}

export function listJoin(items: string[]) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function scoreTone(score: number): "good" | "warn" | "bad" {
  return score >= 70 ? "good" : score >= 45 ? "warn" : "bad";
}

export function scoreLabel(score: number) {
  return score >= 80 ? "Excellent" : score >= 70 ? "Strong" : score >= 55 ? "Fair" : score >= 40 ? "Needs work" : "Weak";
}
