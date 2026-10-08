/**
 * Skill dictionary used for resume and job-description matching.
 * Each entry is [canonical name, ...aliases]. Aliases are matched case-insensitively
 * on word boundaries; entries prefixed with "=" are matched case-sensitively
 * (used for short, ambiguous names like "Go", "R" or "C").
 */
const SKILLS: string[][] = [
  // Languages
  ["JavaScript", "javascript", "js", "es6"],
  ["TypeScript", "typescript", "ts"],
  ["Python", "python"],
  ["Java", "java"],
  ["C++", "c++", "cpp"],
  ["C#", "c#", "csharp"],
  ["C", "=C"],
  ["Go", "golang", "=Go"],
  ["Rust", "rust"],
  ["Ruby", "ruby"],
  ["PHP", "php"],
  ["Swift", "swift"],
  ["Kotlin", "kotlin"],
  ["Scala", "scala"],
  ["R", "=R"],
  ["Dart", "dart"],
  ["SQL", "sql"],
  ["Bash", "bash", "shell scripting", "shell"],
  ["MATLAB", "matlab"],
  // Frontend
  ["React", "react", "react.js", "reactjs"],
  ["Next.js", "next.js", "nextjs"],
  ["Vue", "vue", "vue.js", "vuejs"],
  ["Angular", "angular"],
  ["Svelte", "svelte"],
  ["HTML", "html", "html5"],
  ["CSS", "css", "css3"],
  ["Sass", "sass", "scss"],
  ["Tailwind CSS", "tailwind", "tailwindcss"],
  ["Redux", "redux"],
  ["Webpack", "webpack"],
  ["Vite", "vite"],
  ["React Native", "react native"],
  ["Flutter", "flutter"],
  ["Accessibility", "accessibility", "a11y", "wcag"],
  // Backend
  ["Node.js", "node.js", "nodejs", "node"],
  ["Express", "express.js", "expressjs"],
  ["Django", "django"],
  ["Flask", "flask"],
  ["FastAPI", "fastapi"],
  ["Spring Boot", "spring boot", "spring framework"],
  [".NET", ".net", "asp.net", "dotnet"],
  ["Ruby on Rails", "rails", "ruby on rails"],
  ["Laravel", "laravel"],
  ["GraphQL", "graphql"],
  ["REST APIs", "restful", "rest api", "rest apis", "rest services"],
  ["gRPC", "grpc"],
  ["Microservices", "microservices", "microservice"],
  // Data
  ["PostgreSQL", "postgresql", "postgres"],
  ["MySQL", "mysql"],
  ["MongoDB", "mongodb", "mongo"],
  ["Redis", "redis"],
  ["Firebase", "firebase", "firestore"],
  ["DynamoDB", "dynamodb"],
  ["Elasticsearch", "elasticsearch"],
  ["Kafka", "kafka"],
  ["Spark", "spark", "pyspark"],
  ["Hadoop", "hadoop"],
  ["Airflow", "airflow"],
  ["Snowflake", "snowflake"],
  ["Pandas", "pandas"],
  ["NumPy", "numpy"],
  ["scikit-learn", "scikit-learn", "sklearn"],
  ["TensorFlow", "tensorflow"],
  ["PyTorch", "pytorch"],
  ["Machine Learning", "machine learning", "ml"],
  ["Deep Learning", "deep learning"],
  ["NLP", "nlp", "natural language processing"],
  ["Computer Vision", "computer vision"],
  ["LLMs", "llm", "llms", "large language models", "generative ai", "genai"],
  ["Data Analysis", "data analysis", "data analytics"],
  ["Data Visualization", "data visualization", "data visualisation"],
  ["Statistics", "statistics", "statistical"],
  ["Power BI", "power bi", "powerbi"],
  ["Tableau", "tableau"],
  ["Excel", "microsoft excel", "ms excel", "advanced excel", "spreadsheets"],
  ["ETL", "etl"],
  // Cloud & DevOps
  ["AWS", "aws", "amazon web services"],
  ["Azure", "azure"],
  ["Google Cloud", "gcp", "google cloud"],
  ["Docker", "docker"],
  ["Kubernetes", "kubernetes", "k8s"],
  ["Terraform", "terraform"],
  ["CI/CD", "ci/cd", "continuous integration", "continuous delivery", "continuous deployment"],
  ["GitHub Actions", "github actions"],
  ["Jenkins", "jenkins"],
  ["Linux", "linux", "unix"],
  ["Git", "git", "github", "gitlab"],
  ["Serverless", "serverless", "lambda"],
  ["Monitoring", "monitoring", "observability", "prometheus", "grafana", "datadog"],
  ["Security", "security", "cybersecurity", "owasp"],
  // Practices
  ["Testing", "unit testing", "testing", "test automation", "tdd"],
  ["Jest", "jest"],
  ["Cypress", "cypress"],
  ["Playwright", "playwright"],
  ["Selenium", "selenium"],
  ["System Design", "system design", "distributed systems"],
  ["Data Structures", "data structures", "algorithms"],
  ["OOP", "oop", "object-oriented", "object oriented"],
  ["Agile", "agile", "scrum", "kanban"],
  ["Jira", "jira"],
  ["Figma", "figma"],
  ["UI/UX", "ui/ux", "ux", "user experience", "ui design"],
  ["SEO", "seo"],
  ["Product Management", "product management"],
  ["Project Management", "project management", "pmp"],
  // Soft skills
  ["Communication", "communication", "communicator"],
  ["Leadership", "leadership", "mentoring", "mentored", "led a team"],
  ["Collaboration", "collaboration", "cross-functional", "teamwork"],
  ["Problem Solving", "problem solving", "problem-solving"],
  ["Stakeholder Management", "stakeholder management", "stakeholders"],
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

type Matcher = { name: string; insensitive?: RegExp; sensitive?: RegExp };

const MATCHERS: Matcher[] = SKILLS.map(([name, ...aliases]) => {
  const plain = aliases.filter((a) => !a.startsWith("="));
  const exact = aliases.filter((a) => a.startsWith("=")).map((a) => a.slice(1));
  // Boundaries: not preceded/followed by a letter, digit or +/#, so "c++" and "c#" don't match "c".
  const build = (list: string[], flags: string) =>
    list.length ? new RegExp(`(?<![A-Za-z0-9+#])(?:${list.map(escape).join("|")})(?![A-Za-z0-9+#&]|-[A-Za-z])`, flags) : undefined;
  // Single-letter / word-like names ("Go", "R", "C") only count inside list-like
  // contexts such as "Python, Go, Rust", so prose like "Go to…" doesn't match.
  const buildExact = (list: string[]) =>
    list.length
      ? new RegExp(`(?:^|[\\s,;/|(•·:])(?:${list.map(escape).join("|")})(?=[ \\t]*(?:[,;/|)•·]|$))`, "m")
      : undefined;
  return { name, insensitive: build(plain, "i"), sensitive: buildExact(exact) };
});

/** Returns canonical skill names found in the text, in dictionary order. */
export function extractSkills(text: string): string[] {
  return MATCHERS.filter((m) => m.insensitive?.test(text) || m.sensitive?.test(text)).map((m) => m.name);
}
