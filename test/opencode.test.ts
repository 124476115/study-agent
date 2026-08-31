import { describe, expect, it, vi } from "vitest";
import {
  OpenCodeCleanupError,
  OpenCodeRequestError,
  OpenCodeTimeoutError,
  OpenCodeUnavailableError,
  InvalidOpenCodeResponseError,
  askOnce,
  checkHealth,
  createSession,
  deleteSession,
  extractText,
  loadConfig,
  parseModel,
  sendMessage,
  type OpenCodeConfig,
} from "../lib/opencode";

const CONFIG: OpenCodeConfig = {
  baseUrl: "http://127.0.0.1:4096",
  model: { providerID: "opencode", modelID: "big-pickle" },
  timeoutMs: 1000,
};

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function textResponse(body: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.reject(new Error("not json")),
    text: () => Promise.resolve(body),
  } as unknown as Response;
}

describe("config", () => {
  it("uses defaults when env vars are absent", () => {
    const cfg = loadConfig({});
    expect(cfg.baseUrl).toBe("http://127.0.0.1:4096");
    expect(cfg.model).toEqual({ providerID: "opencode", modelID: "big-pickle" });
    expect(cfg.timeoutMs).toBe(60_000);
  });

  it("overrides from environment variables", () => {
    const cfg = loadConfig({
      OPENCODE_BASE_URL: "http://127.0.0.1:4097/",
      OPENCODE_MODEL: "hpc-ai/deepseek/deepseek-v4-pro",
      OPENCODE_TIMEOUT_MS: "25000",
    });
    expect(cfg.baseUrl).toBe("http://127.0.0.1:4097");
    expect(cfg.model).toEqual({
      providerID: "hpc-ai",
      modelID: "deepseek/deepseek-v4-pro",
    });
    expect(cfg.timeoutMs).toBe(25_000);
  });

  it("rejects malformed model config", () => {
    expect(() => parseModel("")).toThrow();
    expect(() => parseModel("provider-only")).toThrow();
    expect(() => parseModel("/model")).toThrow();
    expect(() => parseModel("provider/")).toThrow();
    expect(() => loadConfig({ OPENCODE_MODEL: "" })).toThrow();
  });

  it("rejects non-positive timeout", () => {
    expect(() => loadConfig({ OPENCODE_TIMEOUT_MS: "0" })).toThrow();
    expect(() => loadConfig({ OPENCODE_TIMEOUT_MS: "-5" })).toThrow();
    expect(() => loadConfig({ OPENCODE_TIMEOUT_MS: "abc" })).toThrow();
  });

  it("rejects explicitly empty or whitespace-only timeout", () => {
    expect(() => loadConfig({ OPENCODE_TIMEOUT_MS: "" })).toThrow();
    expect(() => loadConfig({ OPENCODE_TIMEOUT_MS: "   " })).toThrow();
  });

  it("parses provider and preserves model portion after the first slash", () => {
    expect(parseModel("opencode/big-pickle")).toEqual({
      providerID: "opencode",
      modelID: "big-pickle",
    });
    expect(parseModel("a/b/c")).toEqual({ providerID: "a", modelID: "b/c" });
  });
});

describe("health", () => {
  it("passes on healthy response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ healthy: true }));
    await expect(checkHealth(CONFIG, fetchImpl)).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:4096/global/health",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("throws unavailable when unhealthy", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ healthy: false }));
    await expect(checkHealth(CONFIG, fetchImpl)).rejects.toBeInstanceOf(
      OpenCodeUnavailableError,
    );
  });
});

describe("network failures", () => {
  it("maps fetch connection failure to unavailable", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValue(new TypeError("fetch failed"));
    await expect(checkHealth(CONFIG, fetchImpl)).rejects.toBeInstanceOf(
      OpenCodeUnavailableError,
    );
  });

  it("maps timeout abort to timeout error", async () => {
    const fetchImpl = vi.fn().mockImplementation(
      (_input: unknown, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
          );
        }),
    );
    const cfg = { ...CONFIG, timeoutMs: 20 };
    await expect(checkHealth(cfg, fetchImpl)).rejects.toBeInstanceOf(
      OpenCodeTimeoutError,
    );
  });

  it("times out even when the response body never completes", async () => {
    const stallResponse = {
      ok: true,
      status: 200,
      json: () => new Promise<unknown>(() => {}),
    } as unknown as Response;
    const fetchImpl = vi.fn().mockResolvedValue(stallResponse);
    const cfg = { ...CONFIG, timeoutMs: 20 };
    await expect(sendMessage(cfg, "ses_1", "hi", fetchImpl)).rejects.toBeInstanceOf(
      OpenCodeTimeoutError,
    );
  });
});

describe("createSession", () => {
  it("uses the exact { id, providerID } create shape", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ id: "ses_123", title: "x" }),
    );
    const id = await createSession(CONFIG, fetchImpl);
    expect(id).toBe("ses_123");
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:4096/session");
    expect(JSON.parse(String(init.body))).toEqual({
      model: { id: "big-pickle", providerID: "opencode" },
    });
  });

  it("throws invalid response when id missing", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ title: "x" }));
    await expect(createSession(CONFIG, fetchImpl)).rejects.toBeInstanceOf(
      InvalidOpenCodeResponseError,
    );
  });
});

describe("sendMessage", () => {
  it("uses the exact { providerID, modelID } message shape and extracts text", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({
          info: {},
          parts: [
            { type: "step-start", id: "p1" },
            { type: "text", text: "OK", id: "p2" },
            { type: "step-finish", id: "p3" },
          ],
        }),
      );
    const text = await sendMessage(CONFIG, "ses_123", "Reply with exactly OK", fetchImpl);
    expect(text).toBe("OK");
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:4096/session/ses_123/message");
    expect(JSON.parse(String(init.body))).toEqual({
      model: { providerID: "opencode", modelID: "big-pickle" },
      parts: [{ type: "text", text: "Reply with exactly OK" }],
    });
  });

  it("preserves text part order and concatenates", async () => {
    expect(
      extractText([
        { type: "text", text: "Hello" },
        { type: "text", text: " world" },
      ]),
    ).toBe("Hello world");
  });

  it("throws invalid response when no usable text", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ info: {}, parts: [{ type: "step-start", id: "p1" }] }),
      );
    await expect(sendMessage(CONFIG, "ses_123", "hi", fetchImpl)).rejects.toBeInstanceOf(
      InvalidOpenCodeResponseError,
    );
  });

  it("throws invalid response when a text part has non-string text", async () => {
    expect(() =>
      extractText([{ type: "text", text: 42 }]),
    ).toThrow(InvalidOpenCodeResponseError);
  });

  it("throws invalid response for malformed successful body", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(null));
    await expect(sendMessage(CONFIG, "ses_123", "hi", fetchImpl)).rejects.toBeInstanceOf(
      InvalidOpenCodeResponseError,
    );
  });

  it("throws request error when info.error is present", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ info: { error: { name: "err" } }, parts: [] }),
      );
    await expect(sendMessage(CONFIG, "ses_123", "hi", fetchImpl)).rejects.toBeInstanceOf(
      OpenCodeRequestError,
    );
  });
});

describe("HTTP classification", () => {
  it("maps non-2xx to request error (server reachable)", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ name: "UnknownError", data: { message: "boom", ref: "r1" } }, 500),
      );
    await expect(sendMessage(CONFIG, "ses_123", "hi", fetchImpl)).rejects.toBeInstanceOf(
      OpenCodeRequestError,
    );
  });

  it("maps 4xx error body to request error", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(
          { name: "NotFoundError", data: { message: "Session not found" } },
          404,
        ),
      );
    await expect(deleteSession(CONFIG, "ses_missing", fetchImpl)).rejects.toBeInstanceOf(
      OpenCodeRequestError,
    );
  });

  it("maps a 500 with a non-JSON body to a request error (server reachable)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(textResponse("<html>boom</html>", 500));
    const err = await deleteSession(CONFIG, "ses_1", fetchImpl).catch((e) => e);
    expect(err).toBeInstanceOf(OpenCodeRequestError);
    expect((err as OpenCodeRequestError).message).toContain("500");
  });

  it("maps malformed JSON to invalid response error", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(textResponse("<html>"));
    await expect(checkHealth(CONFIG, fetchImpl)).rejects.toBeInstanceOf(
      InvalidOpenCodeResponseError,
    );
  });
});

describe("askOnce lifecycle", () => {
  it("cleans up after success and returns text", async () => {
    const fetchImpl = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith("/session")) {
        return Promise.resolve(jsonResponse({ id: "ses_1" }));
      }
      if (url.includes("/message")) {
        return Promise.resolve(
          jsonResponse({ info: {}, parts: [{ type: "text", text: "OK" }] }),
        );
      }
      if (url.endsWith("/session/ses_1")) {
        return Promise.resolve(jsonResponse(true));
      }
      return Promise.reject(new Error("unexpected url: " + url));
    });
    const text = await askOnce(CONFIG, "Reply with exactly OK", fetchImpl);
    expect(text).toBe("OK");
    const deleteCalls = fetchImpl.mock.calls.filter(
      (c) => String(c[0]).endsWith("/session/ses_1") && c[1]?.method === "DELETE",
    );
    expect(deleteCalls.length).toBe(1);
  });

  it("cleans up after a send failure and rethrows the primary error", async () => {
    const fetchImpl = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith("/session") && !url.endsWith("/session/ses_1")) {
        return Promise.resolve(jsonResponse({ id: "ses_1" }));
      }
      if (url.includes("/message")) {
        return Promise.resolve(
          jsonResponse({ info: { error: { name: "APIError" } }, parts: [] }),
        );
      }
      if (url.endsWith("/session/ses_1")) {
        return Promise.resolve(jsonResponse(true));
      }
      return Promise.reject(new Error("unexpected"));
    });
    const err = await askOnce(CONFIG, "hi", fetchImpl).catch((e) => e);
    expect(err).toBeInstanceOf(OpenCodeRequestError);
    expect((err as OpenCodeRequestError).code).toBe("message-error");
    const deleteCalls = fetchImpl.mock.calls.filter(
      (c) => String(c[0]).endsWith("/session/ses_1") && c[1]?.method === "DELETE",
    );
    expect(deleteCalls.length).toBe(1);
  });

  it("cleans up after a parsing failure and rethrows the invalid response error", async () => {
    const fetchImpl = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith("/session") && !url.endsWith("/session/ses_1")) {
        return Promise.resolve(jsonResponse({ id: "ses_1" }));
      }
      if (url.includes("/message")) {
        return Promise.resolve(jsonResponse({ info: {}, parts: [] }));
      }
      if (url.endsWith("/session/ses_1")) {
        return Promise.resolve(jsonResponse(true));
      }
      return Promise.reject(new Error("unexpected"));
    });
    await expect(askOnce(CONFIG, "hi", fetchImpl)).rejects.toBeInstanceOf(
      InvalidOpenCodeResponseError,
    );
  });

  it("throws the cleanup error directly when cleanup fails after success", async () => {
    const fetchImpl = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith("/session")) {
        return Promise.resolve(jsonResponse({ id: "ses_1" }));
      }
      if (url.includes("/message")) {
        return Promise.resolve(
          jsonResponse({ info: {}, parts: [{ type: "text", text: "OK" }] }),
        );
      }
      if (url.endsWith("/session/ses_1")) {
        return Promise.resolve(
          jsonResponse({ name: "NotFoundError", data: { message: "gone" } }, 404),
        );
      }
      return Promise.reject(new Error("unexpected"));
    });
    const err = await askOnce(CONFIG, "hi", fetchImpl).catch((e) => e);
    expect(err).toBeInstanceOf(OpenCodeRequestError);
    expect((err as OpenCodeRequestError).code).toBe("NotFoundError");
  });

  it("preserves both original errors when primary and cleanup both fail", async () => {
    const fetchImpl = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith("/session") && !url.endsWith("/session/ses_1")) {
        return Promise.resolve(jsonResponse({ id: "ses_1" }));
      }
      if (url.includes("/message")) {
        return Promise.resolve(
          jsonResponse({ info: { error: { name: "APIError" } }, parts: [] }),
        );
      }
      if (url.endsWith("/session/ses_1")) {
        return Promise.reject(new OpenCodeUnavailableError("cleanup network down"));
      }
      return Promise.reject(new Error("unexpected"));
    });
    const err = await askOnce(CONFIG, "hi", fetchImpl).catch((e) => e);
    expect(err).toBeInstanceOf(OpenCodeCleanupError);
    const cleanupErr = err as OpenCodeCleanupError;
    expect(cleanupErr.primaryError).toBeInstanceOf(OpenCodeRequestError);
    expect((cleanupErr.primaryError as OpenCodeRequestError).code).toBe(
      "message-error",
    );
    expect(cleanupErr.cleanupError).toBeInstanceOf(OpenCodeUnavailableError);
  });
});
