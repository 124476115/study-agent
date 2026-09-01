# Study Agent — Acceptance Criteria

## T001 — Bootstrap

The following commands must all pass on a clean checkout:

```bash
npm test
npm run lint
npm run typecheck
npm run build
git diff --check
```

Additionally:

- The application starts locally.
- `/` renders a minimal "Study Agent" page.
- `GET /api/health` returns HTTP 200 with the deterministic payload:

  ```json
  {
    "status": "ok",
    "service": "study-agent"
  }
  ```

- No OpenCode integration exists yet.
- No SQLite/database dependency exists yet.
- No image/OCR functionality exists yet.
- No unrelated functionality is implemented.

For acceptance of later Tasks, update this file.

## T002 — OpenCode Server Adapter

Normal verification (must pass on a clean checkout, with no OpenCode Server
running):

```bash
npm test
npm run lint
npm run typecheck
npm run build
git diff --check
```

Additionally:

- `npm test` must succeed with no OpenCode Server running.
- `npm run test:opencode` requires an explicitly running local OpenCode
  Server; it must use `opencode/big-pickle`, require no Zen API key, send
  `Reply with exactly OK` through `lib/opencode.ts`, and confirm the
  extracted assistant text is exactly `OK`.
- The adapter's one-shot call (`askOnce`) must delete its owned session even
  when the model call or response parsing fails, and must not erase the
  original failure if cleanup also fails.
- No OpenCode endpoint is exposed to browser code.
- No Study-domain behavior (mistake analysis, persistence, review scheduling,
  OCR, etc.) is implemented in T002.
