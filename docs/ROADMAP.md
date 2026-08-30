# Study Agent — Roadmap

## Implemented

- **T001 — Bootstrap**: application skeleton, engineering governance,
  deterministic `/api/health`, unit-test infrastructure, and documentation.

## Planned (future Tasks)

- **T002+ — Data model & persistence**: application storage for study state
  and mistakes. No SQLite/database dependency in T001.
- **OpenCode integration**: Study backend communicates with a local OpenCode
  Server (browser never talks to it directly).
- **Mistake submission**: capture a student's mistake.
- **Structured analysis**: model-driven analysis behind a replaceable adapter.
- **Review workflow**: spaced/structured review of persisted mistakes.
- **Image upload & OCR**: ingest handwritten/screenshotted mistakes.
- **Authentication & LAN deployment**.

> These items are future directions. No claim is made that they exist in T001.
