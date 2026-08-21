# Undercurrent — Build Notes

Running log of decisions, dead ends, and fixes. This file becomes the challenge article.
Newest entries at the bottom of each session.

---

## Session 1 — Wed Aug 20 (evening)

### Decision: Python for the Bedrock report Lambda only; TypeScript everywhere else

The developer's goal for this project includes getting more fluent in Python. The
tension: Amplify Gen 2's backend is TypeScript-defined, and its native `defineFunction`
path is Node-only — Python enters only through a CDK escape hatch.

Chosen split:

- **TypeScript:** all Amplify backend definitions, the weather aggregation Lambda, and
  the React frontend. The weather Lambda sits on the hot path and must call an AppSync
  mutation via Amplify's IAM-authed data client so the `WeatherState` subscription
  actually fires — hand-signing GraphQL requests from Python the night before deadline
  is how demos die.
- **Python 3.12:** the Bedrock "current report" Lambda. It is off the demo's critical
  path (on-demand button, Tier 2), needs only boto3 (already in the Lambda runtime, so
  zero packaging pain on Windows), and if it slips, Tier 1 is untouched.

Rejected: full-Python backend (would abandon AppSync subscriptions — the heart of the
app), and Python for both Lambdas (~2–4h of extra IAM/wiring on the riskiest wire in
the system).

### Decision: Mermaid for architecture diagrams

Diagrams live in `docs/architecture.md` as Mermaid blocks: GitHub renders them natively,
they're diffable text (good for the article's commit log), and they cost zero
dependencies.

### Environment facts (as found)

- Windows 11, Node v24, npm 11, Python 3.12.5 (via `py` launcher).
- Git repo with GitHub remote already in place (`SergioB03/Undercurrent`).
- AWS account exists but this machine had never used it: no AWS CLI, no credentials.
  CLI installed via winget; credentials + Amplify Hosting connection are the first
  console tasks.

### Decision: scaffold = Vite template + `create-amplify` on top

`npm create vite@latest` (react-ts template) into a temp dir merged into the repo root
(the root wasn't empty — LICENSE, .gitignore), then `npm create amplify@latest` to add
the `amplify/` backend folder. Kept the repo's existing comprehensive Node .gitignore
and appended Amplify-specific entries instead of taking Vite's smaller one.