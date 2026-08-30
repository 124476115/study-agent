# Study Agent — Product

## Vision

**V0.1** is a **LAN-only** mistake-analysis and review assistant. Students
submit mistakes they made in their studies, and the assistant produces a
structured analysis and drives a review workflow.

## Core flow (future)

The intended end-to-end flow is:

```
student submits mistake
→ Study backend
→ local OpenCode Server
→ model
→ structured analysis
→ local persistence
→ review workflow
```

> **Note:** This flow describes the intended product direction. As of V0.1,
> none of the later steps (OpenCode Server, model, structured analysis,
> persistence, review workflow) are implemented yet. See `docs/ROADMAP.md`.

## Current V0.1 scope (implemented)

- Minimal application skeleton.
- Home page identifying the application as "Study Agent".
- `GET /api/health` returning a deterministic health payload.
- Unit-test infrastructure and project documentation.

## Out of scope for V0.1

Authentication, database persistence, image upload, OCR, mistake analysis,
review logic, OpenCode integration, and LAN deployment arrive in later Tasks.
