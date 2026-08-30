# Study Agent — Architecture

## Architecture invariants

These are invariant design constraints. Changing any of them requires an
explicit `ARCHITECTURE_DECISION_REQUIRED` review.

1. The browser must never communicate directly with OpenCode Server.
2. OpenCode Server will eventually listen only on `127.0.0.1`.
3. The Study backend will be the only component allowed to communicate with
   OpenCode.
4. Persistent study state belongs in application storage, never in LLM
   conversational memory.
5. Deterministic logic must remain normal application code when an LLM is
   unnecessary.
6. Model/provider choice must remain replaceable.
7. Failure of the model runtime must never corrupt persisted study data.
8. No Zen API key should be required for the initial Big Pickle runtime
   design.
9. LAN exposure belongs to the Study Web application, not OpenCode Server.

## Current component layout (V0.1)

- **Study Web (Next.js App Router)** — serves the minimal UI and the
  `GET /api/health` endpoint.
- No OpenCode integration, database, or model code exists yet.

## Responsibilities

- All runtime-facing logic stays deterministic where possible.
- Model-specific code, when introduced, must live behind adapters.
