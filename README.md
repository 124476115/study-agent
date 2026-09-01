# Study Agent

A LAN-only mistake-analysis and review assistant.

## Getting started

```bash
npm install
npm run dev
```

- Home page: http://localhost:3000
- Health: http://localhost:3000/api/health

## Scripts

- `npm run dev` — development server
- `npm run build` — production build
- `npm run lint` — ESLint
- `npm run typecheck` — TypeScript type checking
- `npm test` — Vitest unit tests
- `npm run test:opencode` — integration test requiring a running local
  OpenCode Server

## OpenCode Server

The Study backend talks to a locally running OpenCode Server via
`lib/opencode.ts`. No API key is required.

```bash
opencode serve
```

Optional server-side environment variables (see `.env.example`):

- `OPENCODE_BASE_URL` — default `http://127.0.0.1:4096`
- `OPENCODE_MODEL` — default `opencode/big-pickle`
- `OPENCODE_TIMEOUT_MS` — default `60000`

See `docs/` for product, architecture, acceptance, and roadmap details.
