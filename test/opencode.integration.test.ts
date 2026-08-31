import { describe, expect, it } from "vitest";
import {
  OpenCodeUnavailableError,
  askOnce,
  checkHealth,
  createSession,
  deleteSession,
  loadConfig,
  sendMessage,
  type OpenCodeConfig,
} from "../lib/opencode";

const BASE_URL = process.env.OPENCODE_BASE_URL ?? "http://127.0.0.1:4096";

function config(): OpenCodeConfig {
  return loadConfig({
    ...process.env,
    OPENCODE_BASE_URL: BASE_URL,
    OPENCODE_MODEL: "opencode/big-pickle",
  });
}

async function sessionStatus(sessionId: string): Promise<number> {
  const response = await fetch(`${BASE_URL}/session/${sessionId}`);
  return response.status;
}

describe("opencode integration (requires running local OpenCode Server)", () => {
  it("can connect to the local OpenCode Server", async () => {
    try {
      await checkHealth(config());
      expect(true).toBe(true);
    } catch (err) {
      if (err instanceof OpenCodeUnavailableError) {
        throw new Error(
          `OpenCode Server unreachable at ${BASE_URL}; start 'opencode serve' first.`,
        );
      }
      throw err;
    }
  });

  it("runs a full adapter-owned session lifecycle and deletes the session", async () => {
    const cfg = config();
    const sessionId = await createSession(cfg);
    try {
      const text = await sendMessage(cfg, sessionId, "Reply with exactly OK");
      expect(text).toBe("OK");
      expect(await sessionStatus(sessionId)).toBe(200);
    } finally {
      await deleteSession(cfg, sessionId);
    }
    expect(await sessionStatus(sessionId)).toBe(404);
  });

  it("askOnce returns exactly OK and deletes its owned session on the real server", async () => {
    const cfg = config();
    const captured = new Set<string>();
    const realFetch = globalThis.fetch.bind(globalThis);

    const observingFetch = async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const response = await realFetch(input, init);
      if (
        init?.method === "POST" &&
        String(input).endsWith("/session")
      ) {
        const clone = response.clone();
        const body = await clone.json();
        if (typeof body?.id === "string") captured.add(body.id);
      }
      return response;
    };

    const text = await askOnce(cfg, "Reply with exactly OK", observingFetch);
    expect(text).toBe("OK");
    expect(captured.size).toBe(1);
    for (const id of captured) {
      expect(await sessionStatus(id)).toBe(404);
    }
  });
});
