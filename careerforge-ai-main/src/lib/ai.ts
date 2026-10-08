import type { CareerProfile, GeneratedDoc, GeneratedKind, JobAnalysis, ResumeData } from "./database";
import { GEMINI_MODEL } from "./env";
import { firebaseApp } from "./firebase";
import { listJoin } from "./analysis";

export const GENERATED_KINDS: { kind: GeneratedKind; label: string; description: string }[] = [
  { kind: "coverLetter", label: "Cover letter", description: "A tailored, one-page cover letter." },
  { kind: "recruiterMessage", label: "Recruiter message", description: "A short LinkedIn or email outreach note." },
  { kind: "summary", label: "Resume summary", description: "A headline, summary and bullet rewrites for this role." },
  { kind: "interview", label: "Interview prep", description: "Likely questions with talking points." },
  { kind: "applicationIntro", label: "Application intro", description: "A concise, role-specific introduction for an application form." },
  { kind: "whyHire", label: "Why hire me", description: "A specific answer grounded in your resume and this role." },
];

type Context = { analysis: JobAnalysis; resume: ResumeData; profile: CareerProfile | null; name: string };

const INSTRUCTIONS: Record<GeneratedKind, string> = {
  coverLetter:
    "Write a concise, specific cover letter (250-350 words) for this job. Use only facts from the resume; never invent employers, degrees or numbers. Plain text, no markdown, no placeholders in square brackets.",
  recruiterMessage:
    "Write a short, friendly outreach message (under 110 words) to a recruiter or hiring manager for this job. Plain text, no markdown, no placeholders in square brackets.",
  summary:
    "Write (1) a one-line resume headline and (2) a 3-4 sentence professional summary tailored to this job, using only facts from the resume. Then list 3 suggested resume bullet rewrites that better match the job. Plain text with dashes for lists, no markdown bold.",
  interview:
    "List 8 likely interview questions for this job (mix of technical and behavioral). Under each, give 1-2 short talking points grounded in the candidate's resume, or note the gap if the resume lacks relevant experience. Plain text numbered list, no markdown bold.",
  applicationIntro:
    "Write a concise 2-3 sentence introduction for an application form, tailored to this role and employer. Use only facts from the resume and profile. Plain text, no markdown, no placeholders.",
  whyHire:
    "Answer 'Why should we hire you?' in 120-180 words for this specific role. Connect verified resume evidence and matched skills to the job requirements. Never invent metrics, experience, credentials or achievements; honestly acknowledge a relevant gap when needed. Plain text, no markdown.",
};

function buildPrompt(kind: GeneratedKind, { analysis, resume, profile, name }: Context) {
  return [
    INSTRUCTIONS[kind],
    "",
    `CANDIDATE NAME: ${name}`,
    profile?.headline ? `CANDIDATE HEADLINE: ${profile.headline}` : "",
    `JOB TITLE: ${analysis.jobTitle}`,
    analysis.company ? `COMPANY: ${analysis.company}` : "",
    `MATCHED SKILLS: ${analysis.matchedSkills.join(", ") || "none detected"}`,
    `MISSING SKILLS: ${analysis.missingSkills.join(", ") || "none"}`,
    "",
    "JOB DESCRIPTION:",
    analysis.jobDescription.slice(0, 8000),
    "",
    "RESUME:",
    resume.text.slice(0, 10000),
  ]
    .filter((line, i, all) => line !== "" || all[i - 1] !== "")
    .join("\n");
}

/** Deterministic fallback used when Firebase AI Logic is unavailable. */
function template(kind: GeneratedKind, { analysis, resume, profile, name }: Context): string {
  const company = analysis.company || "your company";
  const role = analysis.jobTitle;
  const strengths = analysis.matchedSkills.slice(0, 4);
  const strengthText = listJoin(strengths.length ? strengths : resume.skills.slice(0, 4)) || "my technical background";
  const gaps = analysis.missingSkills.slice(0, 3);

  switch (kind) {
    case "coverLetter":
      return [
        "Dear Hiring Manager,",
        `I'm excited to apply for the ${role} position at ${company}. My resume highlights ${strengthText}, which aligns with requirements in the posting, and I'd welcome the chance to discuss how my experience could contribute.`,
        `The role's focus on ${strengthText} is relevant to my background. I would be glad to share specific examples from my work and explain how I approach learning new tools and solving problems.`,
        gaps.length ? `I've noted that this role also involves ${listJoin(gaps)}. I'm actively strengthening these areas and am confident I can ramp up quickly.` : "",
        `I'd love to discuss how I can help ${company} reach its goals. Thank you for your time and consideration.`,
        `Sincerely,\n${name}`,
      ].filter(Boolean).join("\n\n");
    case "recruiterMessage":
      return [
        "Hi there,",
        `I came across the ${role} opening at ${company} and wanted to reach out. I work with ${strengthText}, which matches several of the core requirements in the posting. I'd love to learn more about the team and share how I could contribute.`,
        "Would you be open to a quick chat this week?",
        `Thanks,\n${name}`,
      ].join("\n\n");
    case "summary": {
      const headline = `${profile?.targetRole || role} | ${(strengths.length ? strengths : resume.skills).slice(0, 3).join(" · ")}`;
      return [
        `Headline\n${headline}`,
        `Summary\n${role}-focused candidate with resume-listed skills in ${strengthText}.${gaps.length ? ` Currently expanding expertise in ${listJoin(gaps.slice(0, 2))}.` : ""} Add a specific, truthful example of your work before using this summary.`,
        [
          "Bullet ideas (fill in your real details)",
          `- Built <project> using ${strengths[0] || "your core stack"}, resulting in <measurable outcome>.`,
          `- Improved <process or metric> by <X%> by applying ${strengths[1] || "a key skill"}.`,
          "- Collaborated with <team> to deliver <feature> on schedule.",
        ].join("\n"),
      ].join("\n\n");
    }
    case "interview": {
      const tech = [...analysis.matchedSkills, ...analysis.missingSkills].slice(0, 4);
      const questions = [
        `Tell me about yourself and why you're interested in the ${role} role at ${company}.`,
        ...tech.map((s) => `How have you used ${s}? Walk me through a specific project.`),
        "Describe a challenging problem you solved. What was your approach and the result?",
        "Tell me about a time you disagreed with a teammate or stakeholder. How did you resolve it?",
        "Where do you want to grow in the next two years?",
      ].slice(0, 8);
      return questions
        .map((q, i) => {
          const gap = analysis.missingSkills.find((s) => q.includes(`used ${s}?`));
          const tip = gap
            ? `   - Gap: ${gap} isn't on your resume. Be honest and explain how you'd ramp up quickly.`
            : "   - Use the STAR format (Situation, Task, Action, Result) and quantify the result.";
          return `${i + 1}. ${q}\n${tip}`;
        })
        .join("\n\n");
    }
    case "applicationIntro":
      return `I'm ${name}, a ${profile?.targetRole || role} candidate whose resume highlights ${strengthText}. Those skills align with this ${role} opportunity${analysis.company ? ` at ${company}` : ""}, and I'd welcome the chance to discuss how I could contribute while continuing to grow in the role.`;
    case "whyHire":
      return [
        `You should consider me for the ${role} role because my resume lists skills in ${strengthText}, which align with the requirements identified for this opportunity.`,
        matchedEvidence(resume.text, analysis.matchedSkills),
        gaps.length ? `I recognize that ${listJoin(gaps)} are areas I would need to develop further, and I would approach those requirements with a learning mindset.` : "I can bring the listed overlapping skills and a thoughtful, evidence-based approach to the work.",
      ].filter(Boolean).join("\n\n");
  }
}

function matchedEvidence(resumeText: string, skills: string[]): string {
  const evidence = skills.filter((skill) => resumeText.toLowerCase().includes(skill.toLowerCase())).slice(0, 3);
  return evidence.length
    ? `My resume specifically lists ${listJoin(evidence)}, giving me relevant skills to build on.`
    : "";
}

export type GenerationResult = GeneratedDoc & { notice?: string };

/** Generates a document with Gemini through Firebase AI Logic, falling back to a template. */
export async function generateDocument(kind: GeneratedKind, context: Context): Promise<GenerationResult> {
  try {
    const { getAI, getGenerativeModel, GoogleAIBackend } = await import("firebase/ai");
    const ai = getAI(firebaseApp, { backend: new GoogleAIBackend() });
    const model = getGenerativeModel(ai, { model: GEMINI_MODEL });
    const result = await model.generateContent(buildPrompt(kind, context));
    const text = result.response.text().replace(/\*\*(.+?)\*\*/g, "$1").trim();
    if (!text) throw new Error("Empty response");
    return { text, source: "ai", createdAt: Date.now() };
  } catch (error) {
    console.warn("Firebase AI Logic unavailable; using a template instead.", error);
    const code = String((error as { code?: string })?.code ?? "");
    const notice = code.includes("api-not-enabled")
      ? "Firebase AI Logic isn't enabled for this project, so a smart template was used. Enable it in Firebase Console → AI Logic to get Gemini-written drafts."
      : "Gemini couldn't be reached, so a smart template was used instead.";
    return { text: template(kind, context), source: "template", createdAt: Date.now(), notice };
  }
}
