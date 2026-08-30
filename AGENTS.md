# Study Agent — Engineering Governance

This file governs how work proceeds in this repository. It applies to every
Task, whether performed by humans or automated agents.

## Working scope

- Work only within the current Task scope.
- Do not implement future Tasks unless explicitly requested.
- Do not introduce abstractions "for later" (adapters, repositories, service
  layers, clients) before the later Task defines their contracts.

## Architecture

- Do not change architectural invariants without reporting
  `ARCHITECTURE_DECISION_REQUIRED`. Invariants are recorded in
  `docs/ARCHITECTURE.md`.

## Verification

- Verify assumptions against the actual repository/runtime rather than
  inventing APIs.
- Run the required verification (`npm test`, `npm run lint`, `npm run
  typecheck`, `npm run build`, `git diff --check`) before reporting
  completion.
- Existing passing tests must not be removed merely to make a Task pass.

## Git

- Never commit unless the human operator explicitly gives commit approval.
- Do not modify Git history.
- Do not expose secrets or credentials.

## Engineering

- Keep model-specific code behind adapters when model integration is later
  added.
- Prefer deterministic application logic over LLM calls when appropriate.
- Keep the health/status contract deterministic: no timestamps, uptime,
  hostnames, or version discovery.
