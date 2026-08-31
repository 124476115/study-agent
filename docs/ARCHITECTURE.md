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
- **OpenCode adapter (`lib/opencode.ts`)** — a server-only HTTP boundary
  between the Study backend and a locally running OpenCode Server
  (`opencode/big-pickle` by default). No database or Study-domain model
  behavior exists yet.

## OpenCode adapter

The adapter speaks the OpenCode Server HTTP contract directly using native
`fetch` + `AbortController`. It is the only component allowed to talk to
OpenCode, and it is never imported by browser code.

Configuration comes from server-side environment variables (defaults apply
when a variable is absent; malformed values are rejected, never silently
ignored):

- `OPENCODE_BASE_URL` — default `http://127.0.0.1:4096`
- `OPENCODE_MODEL` — default `opencode/big-pickle` (`<provider>/<model>`)
- `OPENCODE_TIMEOUT_MS` — default `60000`

No API key is required. The model is replaceable through configuration.

## Responsibilities

- All runtime-facing logic stays deterministic where possible.
- Model-specific code, when introduced, must live behind adapters.
