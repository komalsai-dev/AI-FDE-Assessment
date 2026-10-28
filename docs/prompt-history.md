# LLM Transparent Disclosure & Prompt History

**Candidate Project:** Calibra — Industrial Calibration & Compliance Platform  
**Assessment:** YottaFlex AI Forward Deployed Engineer (FDE) Round 2  
**Challenge Window:** 72 Hours  

---

## 1. AI Tooling & Usage Overview

In accordance with Guideline 03 (*"Use LLMs Transparently — Prompt history required"*), this document outlines how LLM tools were utilized throughout the assessment, where AI accelerated execution, where AI was heavily relied upon, and what was personally engineered, reviewed, and validated.

- **Primary LLM Assistant:** Google DeepMind Antigravity / Gemini Code Assistant
- **Mode of Interaction:** Pair programming, iterative prompt workflows, and architectural audit analysis.

---

## 2. Where AI Accelerated the Work

| Domain | Role of AI | Acceleration Factor |
|---|---|---|
| **Codebase Discovery & Static Audit** | AI scanned the 14 application routes, mapped relational schema dependencies, and audited dependencies for orphaned packages. | Reduced discovery time from ~4 hours to ~15 minutes. |
| **Lovable Artifact De-coupling** | Identified all Lovable branding, telemetry calls (`reportLovableError`), mock auth brokers (`brokeredPreviewStorage`), and replaced them with standard React / Supabase patterns. | Guaranteed zero residual proprietary telemetry or dead imports. |
| **Test Suite Configuration & Diagnostics** | Diagnosed Vitest test runner timeout on in-memory 100k-row generation suites; updated `vitest.config.ts` timeout to 90s and modernized path resolution to `import.meta.dirname`. | Avoided debugging Node/Vite path resolution quirks manually. |
| **Comprehensive Technical Documentation** | Accelerated drafting detailed Markdown schemas, data dictionaries, architectural diagrams (Mermaid), and setup guides. | Standardized documentation to professional enterprise standards. |

---

## 3. Where AI was Heavily Relied Upon

1. **Repetitive Code Inspections:** Searching across 14 routes for references to Lovable client libraries, cloud broker headers, and orphaned CSS classes.
2. **Data Gating Logic Tracing:** Verifying that `evaluateUse` strictly followed the requirements for UTC midnight expiration boundaries (`isWithinValidity`) and exception window overlaps.
3. **Drafting Initial Schema & Audit Summaries:** Summarizing the 22 Supabase relational tables and their constraints into concise documentation matrices.

---

## 4. What Was Personally Engineered, Reviewed & Validated

While AI assisted with rapid code auditing and drafting:
1. **Security & Key Segregation:**
   - Personally retrieved and injected the valid `SUPABASE_SERVICE_ROLE_KEY` directly from the Supabase Project Dashboard into a local `.env`.
   - Verified that `.gitignore` strictly protects `.env` from ever being staged or committed to GitHub.
   - Designed `.env.example` to ensure clean environment reproduction without secret leaks.
2. **Peer Dependency Resolution:**
   - Diagnosed React 19 / Recharts peer-dependency conflict during `npm install`.
   - Configured `.npmrc` with `legacy-peer-deps=true` to guarantee cross-environment installation predictability.
3. **End-to-End Manual UI Testing & Workflow Validation:**
   - **Production-Use Gating (Allowed):** Tested `AST-001930` on Line A; verified immediate `ALLOWED` gate decision and issuance of `USE-AST-001930-20261028T023000`.
   - **Production-Use Gating (Quarantine Block):** Tested `AST-000005`; confirmed `BLOCKED` gate decision, reason `ASSET_QUARANTINED`, and strictly zero rows created in `production_use`.
   - **Production-Use Gating (Overdue Block):** Tested `AST-000015`; confirmed `BLOCKED` gate decision with reason `EXPIRED_USE_WITHOUT_EXCEPTION` and invalid extension rejection.
   - **Calibration Lifecycle:** Scheduled calibration on `AST-001930`, started it, recorded a measured value (`7.01` against reference `7` with tolerance `±0.045`), confirmed `PASS`, and verified next due date calculated to `2026-12-27` (+60 days).
   - **Audit Trail Immutability:** Inspected `/audit` to verify that every single action triggered immutable `audit_records` entries with old/new state JSON diffs.
4. **Data Quality & Detection Verification:**
   - Personally verified the Data Quality dashboard against the 366 ground-truth cases.
   - Confirmed 0 integrity issues, 20/20 detection across all 4 mandatory anomaly scenarios, and 100% precision, recall, and F1 score.

---

## 5. Chronological Prompt & Workflow History

### Prompt Session 1: Initial System Audit & Discovery
> **User Prompt:**  
> *"Review the Calibra codebase against the YottaFlex assessment guidelines. Perform a technical audit, check the existing 14 pages, verify database integrity, inspect dependencies, and check for any remaining Lovable branding or configuration."*  
> **Actions / Outcomes:**  
> - Inspected project structure and discovered 14 content routes.
> - Identified `.lovable/` folder and `reportLovableError` hooks in `src/routes/__root.tsx`.
> - Audited Supabase tables (2,000 assets, 5,000 calibrations, 100,000 uses, 366 ground truth cases).

### Prompt Session 2: Dependency & Environment Configuration
> **User Prompt:**  
> *"Already in this file all variables and keys are there then why is it not working? Check the file and keep it safe, don't release them outside."*  
> **Actions / Outcomes:**  
> - Diagnosed that server actions failed because `.env` only had public/anon keys and lacked `SUPABASE_SERVICE_ROLE_KEY`.
> - Advised retrieving the secret role key from Supabase Dashboard.
> - Ensured `.gitignore` excludes `.env` and `.env.*`. Created `.env.example` template.

### Prompt Session 3: Testing & Build Verification
> **User Prompt:**  
> *"Run the test suite and type check to verify if the code works."*  
> **Actions / Outcomes:**  
> - Configured `.npmrc` with `legacy-peer-deps=true` for React 19 compatibility.
> - Updated `vitest.config.ts` timeout to 90 seconds for heavy generation tests.
> - Executed all 6 test suites: 56/56 tests passed. Ran `npx tsc --noEmit`: 0 errors.

### Prompt Session 4: End-to-End Workflow Testing
> **User Prompt:**  
> *"Help me test the pages in detail according to the assessment checklist."*  
> **Actions / Outcomes:**  
> - Guided user through live testing of Production Use gating (Allowed, Quarantined Blocked, Overdue Blocked).
> - Guided user through Calibration Planner (Schedule, Start, Record PASS with automated due date calculation).
> - Inspected Audit Log to verify append-only transaction logs.

### Prompt Session 5: Branding & Final Packaging
> **User Prompt:**  
> *"Remove the favicon of lovable and remove anything related to lovable. Update README with clear instructions on how evaluators can run the project, how migrations work, and push commands."*  
> **Actions / Outcomes:**  
> - Deleted `public/favicon.ico` and created custom `public/favicon.svg` with Calibra calibration pulse logo.
> - Renamed package to `calibra` in `package.json`.
> - Updated `README.md` with 3-step Quick Start, schema migration instructions, and deterministic generation documentation.
