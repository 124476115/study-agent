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
