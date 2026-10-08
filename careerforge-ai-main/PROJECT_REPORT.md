# CareerForge AI — Project Report

**Project type:** Responsive career-optimization web application  
**Technology:** React, TypeScript, Vite, Firebase  
**Updated:** October 8, 2026  
**Report scope:** Based on current source inspection and the build, test, and provider checks recorded below. Live Firebase services and deployed behavior have not been independently verified.

> **Current job sources:** Jobicy and Himalayas. Himalayas is accessed through an authenticated Firebase callable because its public API blocks browser-origin requests. The callable builds locally but has not been deployed or exercised through Firebase. The user confirmed having permission for API display and caching; the license document/scope was not independently reviewed.

## 1. Project overview

CareerForge AI is designed as a workspace to help users prepare and manage job applications. Its intended workflow is to analyze a resume, compare it with a job description, draft application materials, track applications, and maintain a reusable career profile.

The application is in the `careerforge-ai-main` folder. Its React entry point is `src/main.tsx`; authentication and app-level rendering are coordinated by `src/App.tsx`; the signed-in workspace and hash-route navigation are in `src/pages/Dashboard.tsx`.

## 2. Technology and architecture

- **Frontend:** React 19 and TypeScript.
- **Development and build:** Vite. The production build runs TypeScript project checks before bundling.
- **Icons:** Lucide React.
- **Authentication:** Firebase Authentication with Google sign-in, popup and redirect flows.
- **Database:** Firebase Realtime Database, with records organized under each user's UID.
- **PDF parsing:** `pdfjs-dist` extracts selectable PDF text in the browser.
- **AI writing:** Firebase AI Logic can request Gemini-generated drafts; deterministic templates are used as a fallback.
- **Navigation:** Hash-based routes in the signed-in dashboard.
- **Source organization:** UI pages in `src/pages`, shared components in `src/components`, hooks in `src/hooks`, and application logic and Firebase integration in `src/lib`.

## 3. Features implemented in the source

### Authentication and workspace

- Google sign-in and sign-out.
- Popup sign-in with redirect fallback when a popup is blocked or unsupported.
- A Firebase configuration screen when required environment variables are missing.
- Loading states for authentication and workspace data.
- Friendly messages for common authentication and database errors.
- Profile synchronization designed to preserve existing career-profile fields.

### Resume Analyzer

- Accepts PDF and text files or pasted resume text.
- Rejects files larger than 8 MB and reports unsupported or unreadable files.
- Extracts selectable PDF text in the browser. The original PDF is not uploaded to Firebase Storage by the inspected code.
- The README describes ATS-readiness checks, scoring, skill extraction, and contact-detail extraction.
- Resume data can be saved to and deleted from Realtime Database.
- Image-only scanned PDFs are not OCR-processed; users must paste text or provide a text-based PDF.

### Job Match

- Compares a job description with the resume/profile data.
- The data model supports overall, skill, and keyword scores; matched and missing skills and keywords; and suggestions.
- Analyses can be saved to and deleted from Realtime Database.
- A job analysis can store generated application documents.

### Related Jobs and Saved Jobs

- Loads real provider listings from Jobicy and Himalayas; the AI does not invent job posts. Himalayas is fetched through an authenticated Firebase callable function to handle its CORS restriction.
- Normalizes each provider's response, rejects incomplete or unsafe links, keeps source names and links when deduplicating, and caches aggregated pages in the browser for six hours. Provider failures are isolated so successful sources can still show results; additional pages load on demand.
- Ranks listings with a transparent weighted CareerForge Match Score: skills (24%), job-title similarity (14%), keywords (14%), experience (10%), education (8%), location (12%), work mode (10%), and seniority (8%). Missing data uses a neutral score; this is not an employer ATS score.
- Provides search and filters for arbitrary location terms, source, job type, experience level, work mode, skill, minimum match, and salary disclosure, with match/date/reported-salary sorting. Both currently integrated feeds provide remote listings.
- Shows original listing links, match explanations, skill overlaps/gaps, job details, and similar opportunities from the loaded feed.
- Users can save jobs, keep private notes, mark interest/applied, and add or update an application in the existing tracker.
- Saved listings are stored under `users/{uid}/savedJobs` and covered by the per-user Firebase access rules.

### AI Application Builder

The code supports generation of:

- Cover letters
- Recruiter messages
- Resume summaries
- Interview preparation
- Application introductions
- “Why should we hire you?” answers

Gemini generation uses Firebase AI Logic when available. If the service is unavailable or not configured, the app generates a built-in template and records whether the result came from AI or a template. Template output should be reviewed and edited before use.

### Application Tracker and Career Profile

- Application statuses include saved, applied, interview, offer, and rejected.
- The database layer supports creating, updating, and deleting applications.
- The editable profile supports multiple target roles, country/region/city and preferred locations, remote preference, experience level/years, education, technical skills, and soft skills. Legacy `targetRole` and `skills` fields remain normalized for compatibility.
- The dashboard includes responsive navigation and light/dark themes.

## 4. Firebase and environment configuration

Firebase initialization is in `src/lib/firebase.ts`; the Firebase Functions client is used for the Himalayas callable. Required Firebase variable names and optional Gemini model configuration are documented in `.env.example`. `src/main.tsx` checks for missing Firebase configuration before loading the main app.

`database.rules.json` grants authenticated users access only to their own `users/{uid}` branch; paths without a grant remain denied by Firebase's default-deny behavior. It validates selected fields and text lengths, including saved-job metadata, bounded descriptions/notes, and HTTP(S) application links. `firebase.json` points to the database rules and configures Firebase Hosting with a single-page-app rewrite.

### Setup requirements

1. Add Firebase web-app configuration to a local `.env` file using the variable names in `.env.example`.
2. Enable Google as a sign-in provider in Firebase Authentication.
3. Add development and production domains to Firebase Authentication's authorized domains.
4. Create a Realtime Database and deploy `database.rules.json`.
5. Enable Firebase AI Logic and Gemini access if AI-generated drafts are required. Otherwise, the template fallback is used.
6. Install Functions dependencies and deploy both rules and callable function as described in the deployment instructions below. Hosting can be deployed separately.

Do not include `.env` values in a report, public repository, or ChatGPT prompt. Firebase web configuration is client-visible by design; database rules and authentication—not secrecy of the web API key—must protect user data.

The project includes a Firebase Storage bucket setting, but the inspected implementation does not use Firebase Storage to upload resume files.

## 5. Data model

User data is stored under `users/{uid}` in Realtime Database:

- **Profile:** display name, email, optional photo, headline, legacy target role/location/skills plus target roles, country/region/city, preferred locations, work preference, experience, education, technical/soft skills, and update timestamp.
- **Resume:** file name, extracted text, detected skills, score, checks, contact details, and upload timestamp.
- **Analyses:** job title, company, job description, scores, matched/missing skills and keywords, suggestions, generated documents, and creation timestamp.
- **Applications:** company, role, status, optional URL, location, notes, applied date, related analysis, and timestamps.
- **Saved jobs:** normalized source listing, saved/interested/applied status, user note, and timestamps.

The database module normalizes stored list data and removes `undefined` values before writes.

## 6. User interface

`src/styles.css` defines the design system. It uses Inter for general interface text and Plus Jakarta Sans for headings, a purple/blue accent palette, dark/light theme tokens, responsive layout styles, and shared styles for cards, navigation, and controls.

`index.html` loads the fonts and applies the saved theme before the app renders, helping reduce a flash of the wrong theme.

## 7. Limitations and items requiring verification

- Source inspection cannot establish that the live Firebase project is configured correctly. Authentication providers, authorized domains, database availability, and deployed rules need to be checked in Firebase Console.
- Gemini output depends on Firebase AI Logic configuration and service access. Without it, the application uses templates.
- Resume parsing is not OCR and requires selectable text.
- Resume files are not stored in Firebase Storage by the inspected implementation.
- Related Jobs currently uses two remote-jobs sources (Jobicy and Himalayas), not an exhaustive job-board index. Listings depend on provider availability, source terms, and feed coverage.
- Feed data is cached in browser local storage for six hours. Job search requires an internet connection on initial load or after cache expiration. Neither provider requires an API key; Himalayas requires the authenticated Firebase Function to be deployed.
- Provider evidence below was checked on October 8, 2026. Provider documentation, terms, pricing, and availability can change.
- Related-job match percentages are transparent heuristics, not an AI assessment or guarantee. Experience and education factors use structured profile/listing data when available and a neutral score when it is missing.
- When Gemini generation is enabled, resume and job-description text are included in AI requests. Review relevant service terms and communicate data handling to users.
- ATS match scores are estimates and do not guarantee ranking by an employer's applicant-tracking system.
- A production build checks TypeScript and bundling but does not test live Firebase permissions, AI responses, or authenticated end-to-end behavior.
- The report does not claim the live service or every user flow has been tested.
- Neither provider guarantees city/country coverage. The UI supports global location preferences, but providers do not establish candidate eligibility for every listing; unverified eligibility is labelled and must be checked on the original posting.
- Provider URLs may lead to the source listing rather than an employer-direct application form.
- Himalayas display/caching is implemented based on the user's confirmation that they have permission. The permission document and scope have not been independently examined; confirm that it covers deployment, display audience, and the six-hour client cache.

## 8. Job provider and API assessment

**Assessment date:** October 8, 2026  
**Provider initially assessed:** Jobicy public remote-jobs API  
**Endpoint:** [https://jobicy.com/api/v2/remote-jobs?count=50](https://jobicy.com/api/v2/remote-jobs?count=50)

1. **Provider:** Jobicy. The adapter is implemented in `src/services/jobs/providers/jobicy.ts` and registered with the other providers in `src/services/jobs/providers/index.ts`.
2. **Reason for selection:** The public endpoint returned real job records without an API credential, supports cursor pagination, and fits the application's provider-adapter design. Resume/profile data is not sent to Jobicy by the job-feed request.
3. **India, Chennai, and Tamil Nadu coverage:** Not reliable enough to claim India-specific coverage. This is a remote-jobs feed, not a dedicated Chennai/Tamil Nadu or local on-site job feed. A live request using `geo=India` returned HTTP 400. A `tag=india` query returned a record whose listed geography was USA, so the tag result did not establish India eligibility. Some remote jobs may accept applicants in India, but eligibility must be confirmed on each original posting.
4. **Application links:** The observed API record has a `url` field pointing to a Jobicy job page. It did not expose a separate employer application URL field in the response examined. Users can follow the Jobicy page and apply if it provides an application route; direct-to-employer application links are not guaranteed by this response.
5. **API key:** No provider API key was required for the public endpoint tested. Do not add a `VITE_JOBICY_API_KEY` variable. The separate optional `VITE_GEMINI_MODEL` variable configures Gemini model selection, not job search.
6. **Free tier:** The endpoint was publicly accessible without authentication in the live check. No formal free-tier commitment, uptime guarantee, or service-level agreement was verified.
7. **Request limits:** A published request quota could not be verified. The API response had no rate-limit headers, and the documentation URL supplied by the API (`https://jobi.cy/apidocs`) was inaccessible during the check due to a Cloudflare challenge. The app requests up to 50 listings per page and uses on-demand pagination; this is application behavior, not a confirmed provider quota.
8. **Pricing and usage limits:** No authoritative public price, quota, or commercial usage allowance was verified. Do not treat the public endpoint as proof of unlimited or zero-cost commercial use.
9. **Terms of Service:** The live API response includes a notice asking users to credit Jobicy with a direct link and to direct application buttons to the original job URL from the feed. The [Jobicy Terms of Service](https://jobicy.com/terms-and-conditions) also state that website material is owned or licensed and restrict reproduction except as permitted by the terms. The material examined did not establish a clear license for commercial redistribution or long-term storage of full job descriptions. The current implementation provides source attribution and links back to Jobicy's supplied URL, but commercial use or broader republication should be confirmed with Jobicy.
10. **Environment variable:** None is needed for Jobicy in this integration. Firebase environment variables are separate and required for the app's Firebase services; Gemini configuration is optional.

**Assessment conclusion:** Jobicy supports real remote-job discovery without a key, but is not a dependable Chennai/Tamil Nadu source and does not guarantee employer-direct application URLs. Himalayas is now integrated as a second public source, but does not establish universal eligibility or provide an exhaustive, locally specific job index. Neither source should be presented as guaranteed India/local coverage. No mock jobs are part of either provider feed.

### Himalayas provider integration (current source state)

- **Provider and request route:** Public Himalayas jobs API (`https://himalayas.app/jobs/api`) is called server-side by the `himalayasJobs` Firebase callable because a browser request was blocked by CORS. Jobicy remains enabled as the other independent source.
- **Authentication and key:** The callable requires Firebase Authentication. The tested public endpoint did not require a Himalayas API key; no Himalayas secret or `VITE_JOBICY_API_KEY` is added. A signed-in Firebase project and deployed function are required for app access.
- **Pagination and resilience:** Cursor pagination is retained per provider. Sources are requested independently; partial failures do not discard successful records. The client cache is six hours, and duplicates preserve each source link.
- **Listing and eligibility data:** Himalayas fields are normalized from the provider response, including application/source URLs, title, company, remote mode, date when parseable, restrictions, and description. Remote does not imply worldwide eligibility; absent or inconclusive eligibility is presented as unverified. The Himalayas-hosted URL is a provider listing and is not represented as a direct employer application link.
- **Terms and permission:** The user stated that they have a license for API display and caching. The license document/scope was not independently reviewed. Deployment assumes that the permission covers the actual public display and six-hour local cache; confirm it and maintain required attribution.
- **Deployment verification:** The function implementation and Firebase deployment configuration are local source changes only. Firebase CLI 15.33.0 is installed, but project selection is not configured. Deployment, authenticated callable behavior, and live Firebase rules remain unverified. After selecting the project, deploy with `firebase deploy --only functions,database`.
- **Dependency audit:** `npm audit --omit=dev` in `functions` reports 9 moderate transitive advisories in the Google/Firebase dependency chain, including `uuid`. npm's suggested `--force` remediation would move `firebase-functions` to major version 7; no breaking upgrade was applied as part of this integration.

## 9. Recommended validation

1. Run `npm run build` and address any type-check or bundling failures.
2. Test Google sign-in, redirect completion, sign-out, profile persistence, and authorized-domain behavior.
3. Verify Realtime Database rules are deployed and confirm users cannot access another user's data.
4. Exercise resume upload/paste, PDF extraction, job matching, all document generators, Related Jobs feed/filter/detail flows, saved-job notes/statuses, and application create/edit/delete flows.
5. Test theme switching, keyboard accessibility, loading and error states, and desktop/tablet/mobile layouts.
6. Extend the automated tests to cover resume parsing, template fallbacks, and application workflows. The job-discovery unit tests currently pass but do not test Firebase end-to-end.

## 10. Summary

CareerForge AI is a React/TypeScript career workspace integrated with Firebase Authentication and Realtime Database. It includes resume parsing, job-match analysis, real remote-job discovery from Jobicy and Himalayas, heuristic job ranking, saved jobs, an application tracker, profile management, and AI-assisted document generation with template fallbacks. Production readiness still depends on deploying and testing Firebase rules/functions, validating the Firebase project configuration, and testing signed-in flows and responsive pages on target devices.

## 11. Current final verification (October 8, 2026)

- **Frontend build/type-check:** `npm run build` passed. This runs TypeScript project checks and creates the Vite production bundle.
- **Unit tests:** `npm test` passed: 11 tests covering provider normalizers, invalid URL/incomplete record rejection, malformed responses, duplicate handling and source preservation, independent provider pagination/failure, location eligibility, filters, and match-score breakdown.
- **Firebase Function build:** `npm run build` in `functions/` passed using the current local Node/TypeScript toolchain. This verifies TypeScript compilation, not Google Cloud deployment/runtime.
- **Live Himalayas endpoint:** A live unauthenticated HTTP request to `https://himalayas.app/jobs/api?limit=1` returned HTTP 200, a real posting with title, company, restriction, date, description and listing/application link fields, plus `nextCursor`. This verifies endpoint availability only; it does not exercise the app's callable.
- **No fabricated Related Jobs:** The Related Jobs implementation only accepts normalized provider-returned entries from Jobicy and Himalayas; its scoring and recommendations operate on those entries and do not create vacancies. The landing page has an explicitly labeled sample match-report illustration (“Frontend Engineer · Acme”); it is not a Related Jobs result or a real vacancy.
- **Features verified from implementation:** Search, location/type/experience/skill/minimum-score/salary/source filters, sorting by match/date/reported salary, heuristic match breakdown, details, similar-job links, original source links, saved-job operations, private notes, interested/applied status, and tracker create/update flows are wired in source. Signed-in database workflows were not exercised end-to-end.
- **Firebase rules correction:** Removed the top-level explicit `.read: false` and `.write: false` grants. Firebase rules cascade parent permissions, so those parent denials would prevent child per-user grants from working. The rules JSON parses successfully and the intended per-UID grants/field validations are present. Rules have not been deployed or tested against the live database/emulator; deploy and test them before relying on database access.
- **Environment files:** `.env` files were previously confirmed ignored and untracked; `.env.example` contains variable names with blank values. No provider key was introduced. Secret values were not inspected or included in this report.
- **Responsive/theme verification:** The landing page was checked in the browser at desktop (1440 px), tablet (768 px), and mobile (390 px); document scroll width matched viewport width at all three sizes. The light/dark toggle changed the active theme. Responsive breakpoints, reduced-motion rules, and theme persistence are present in source. The authenticated dashboard layouts were not tested at these widths.
- **Not verified live:** Google authentication, Realtime Database CRUD/rules enforcement, Firebase Function deployment/call behavior, Gemini requests, and saved-job/application workflows require a configured Firebase project and authenticated user. Source wiring is present, but this verification does not claim those external-service flows work.
- **Current test coverage:** `npm test` passes 11 unit tests, covering Jobicy/Himalayas normalization, unsafe/incomplete records, malformed feeds, duplicate removal with source preservation, provider failure isolation and cursor pagination, filters, location eligibility matching, and score breakdown. These are not substitutes for end-to-end tests.
- **Remaining provider limitations:** Both feeds provide remote listings, not guaranteed Chennai/Tamil Nadu coverage or eligibility. Jobicy and Himalayas links may lead to a provider listing instead of an employer application form. Provider quotas, pricing, and commercial terms are not established by these code tests. Confirm licensing for the actual use case.

## 12. Production-readiness and provider-integration changes

- Expanded the editable profile with target-role lists, country/region/city, preferred locations, work-mode preference, experience level/years, education, technical skills, and soft skills. Existing `targetRole` and `skills` records remain supported.
- Added independent match dimensions and published the score weights in the UI and README. The displayed score is explicitly named **CareerForge Match Score** and is not described as an ATS score.
- Added provider-specific adapters and an aggregation layer. Jobicy remains enabled; Himalayas is fetched by an authenticated server-side Firebase callable due to browser CORS restriction.
- Added independent cursors and provider-failure handling, duplicate merging that preserves each source link, a source filter, unverified-eligibility labeling, and more/source links in job cards and details.
- Added a reusable job-filtering module and a work-mode filter. Location matching accepts arbitrary user-supplied places; no India/Chennai default is built into the matching architecture.
- Added Vitest coverage for both provider normalizers, duplicate removal, malformed/unsafe listing rejection, location/work-mode/source filtering, provider failure isolation and pagination, and weighted match score components.
- Removed top-level Firebase read/write deny grants because Firebase cascades parent grants to descendants; the per-user `users/{uid}` guards remain. Updated rules still require deployment and actual Firebase/emulator testing before production use.
- `npm run build`, `npm test` (11 tests), and the Functions TypeScript build pass. The live Himalayas endpoint returned a real job record on October 8, 2026. Firebase deployment and authenticated integration tests were not performed.
- `npm audit --omit=dev` in `functions/` reports 9 moderate transitive advisories in the Google/Firebase dependency chain, including `uuid`. The suggested forced upgrade requires a `firebase-functions` major-version update; it was not applied.
- Environment review previously confirmed local `.env` files ignored and untracked, `.env.example` assignments blank, and no `VITE_JOBICY_API_KEY`. No secret values were opened or displayed.

### Firebase deployment

Deployment was not run. Firebase CLI 15.33.0 is installed, but there is no `.firebaserc` in the project and no Firebase project/deployment authorization was configured. After selecting your Firebase project, run from the application directory:

```bash
firebase login
firebase use <your-project-id>
npm --prefix functions install
firebase deploy --only functions,database
```

This deploys the authenticated Himalayas callable and the checked-in UID-scoped database rules. Cloud Functions deployment may require a billing-enabled Firebase plan and may incur charges; check the project plan first. The database rules can also be published in Firebase Console under **Realtime Database → Rules**, then tested with an authenticated user and a different UID. Until deployment and access tests pass, Firebase production readiness is unverified.
