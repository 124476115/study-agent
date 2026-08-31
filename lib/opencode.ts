import "server-only";

export interface ModelRef {
  providerID: string;
  modelID: string;
}

export interface OpenCodeConfig {
  baseUrl: string;
  model: ModelRef;
  timeoutMs: number;
}

const DEFAULT_BASE_URL = "http://127.0.0.1:4096";
const DEFAULT_MODEL = "opencode/big-pickle";
const DEFAULT_TIMEOUT_MS = 60_000;

export class OpenCodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenCodeError";
  }
}

export class OpenCodeUnavailableError extends OpenCodeError {
  constructor(message: string) {
    super(message);
    this.name = "OpenCodeUnavailableError";
  }
}

export class InvalidOpenCodeResponseError extends OpenCodeError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidOpenCodeResponseError";
  }
}

export class OpenCodeRequestError extends OpenCodeError {
  code: string;
  constructor(message: string, code = "request-error") {
    super(message);
    this.name = "OpenCodeRequestError";
    this.code = code;
  }
}

export class OpenCodeTimeoutError extends OpenCodeError {
  constructor(message: string) {
    super(message);
    this.name = "OpenCodeTimeoutError";
  }
}

export class OpenCodeCleanupError extends OpenCodeError {
  primaryError: Error;
  cleanupError: Error;
  constructor(primaryError: Error, cleanupError: Error) {
    super(
      `Operation failed and session cleanup also failed.\nprimary: ${primaryError.message}\ncleanup: ${cleanupError.message}`,
    );
    this.name = "OpenCodeCleanupError";
    this.primaryError = primaryError;
    this.cleanupError = cleanupError;
  }
}

export function parseModel(value: string): ModelRef {
  const trimmed = value.trim();
  if (trimmed === "") {
    throw new Error(`Invalid OPENCODE_MODEL: "${value}" is empty.`);
  }
  const separator = trimmed.indexOf("/");
  if (separator <= 0 || separator === trimmed.length - 1) {
    throw new Error(
      `Invalid OPENCODE_MODEL: "${value}" must be of the form "<provider>/<model>".`,
    );
  }
  return {
    providerID: trimmed.slice(0, separator),
    modelID: trimmed.slice(separator + 1),
  };
}

export function loadConfig(
  env: Record<string, string | undefined> = process.env,
): OpenCodeConfig {
  const rawBaseUrl = env.OPENCODE_BASE_URL;
  const baseUrl = rawBaseUrl === undefined ? DEFAULT_BASE_URL : rawBaseUrl.trim();
  const rawModel = env.OPENCODE_MODEL;
  const modelValue =
    rawModel === undefined ? DEFAULT_MODEL : rawModel.trim();
  const rawTimeout = env.OPENCODE_TIMEOUT_MS?.trim();
  let timeoutMs = DEFAULT_TIMEOUT_MS;
  if (rawTimeout !== undefined) {
    if (rawTimeout !== "") {
      const parsed = Number(rawTimeout);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`Invalid OPENCODE_TIMEOUT_MS: "${rawTimeout}" is not a positive number.`);
      }
      timeoutMs = parsed;
    } else {
      throw new Error("Invalid OPENCODE_TIMEOUT_MS: value is empty.");
    }
  }
  if (rawBaseUrl !== undefined && baseUrl === "") {
    throw new Error("Invalid OPENCODE_BASE_URL: value is empty.");
  }
  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    model: parseModel(modelValue),
    timeoutMs,
  };
}

interface TextPart {
  type: string;
  text?: unknown;
  synthetic?: boolean;
  [key: string]: unknown;
}

export function extractText(parts: unknown): string {
  if (!Array.isArray(parts)) {
    throw new InvalidOpenCodeResponseError(
      "Expected a message parts array but received: " + typeof parts,
    );
  }
  const chunks: string[] = [];
  for (const part of parts) {
    if (part === null || typeof part !== "object") continue;
    const p = part as TextPart;
    if (p.type !== "text") continue;
    if (typeof p.text !== "string") {
      throw new InvalidOpenCodeResponseError(
        "A text part did not contain a string 'text' field.",
      );
    }
    chunks.push(p.text);
  }
  if (chunks.length === 0) {
    throw new InvalidOpenCodeResponseError(
      "The assistant response contained no usable text.",
    );
  }
  return chunks.join("");
}

interface FetchLike {
  (input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

async function withTimeout<T>(
  timeoutMs: number,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(
        new OpenCodeTimeoutError(`OpenCode request timed out after ${timeoutMs}ms.`),
      );
    }, timeoutMs);
  });

  try {
    return await Promise.race([run(controller.signal), timeoutPromise]);
  } catch (err) {
    if (controller.signal.aborted) {
      throw new OpenCodeTimeoutError(
        `OpenCode request timed out after ${timeoutMs}ms.`,
      );
    }
    throw err;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function bodyErrorFrom(response: Response, body: unknown): OpenCodeRequestError {
  if (body !== null && typeof body === "object") {
    const obj = body as { name?: unknown; data?: { message?: unknown } };
    if (typeof obj.name === "string") {
      const message =
        obj.data && typeof obj.data.message === "string"
          ? obj.data.message
          : `OpenCode request failed with status ${response.status}.`;
      return new OpenCodeRequestError(message, obj.name);
    }
  }
  return new OpenCodeRequestError(
    `OpenCode request failed with status ${response.status}.`,
  );
}

async function requestJson(
  config: OpenCodeConfig,
  path: string,
  init: RequestInit,
  fetchImpl: FetchLike = fetch,
): Promise<{ response: Response; body: unknown }> {
  return withTimeout(config.timeoutMs, async (signal) => {
    let response: Response;
    try {
      response = await fetchImpl(`${config.baseUrl}${path}`, { ...init, signal });
    } catch (err) {
      const error = err as Error;
      throw new OpenCodeUnavailableError(
        `OpenCode Server unreachable at ${config.baseUrl}: ${error?.message ?? String(err)}`,
      );
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      if (!response.ok) {
        throw new OpenCodeRequestError(
          `OpenCode request failed with status ${response.status}.`,
        );
      }
      throw new InvalidOpenCodeResponseError(
        `OpenCode returned a non-JSON response with status ${response.status}.`,
      );
    }

    if (!response.ok) {
      throw bodyErrorFrom(response, body);
    }

    return { response, body };
  });
}

export async function checkHealth(
  config: OpenCodeConfig,
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  const { body } = await requestJson(config, "/global/health", { method: "GET" }, fetchImpl);
  if (body === null || typeof body !== "object") {
    throw new InvalidOpenCodeResponseError(
      "Expected a health object but received: " + typeof body,
    );
  }
  const healthy = (body as { healthy?: unknown }).healthy;
  if (healthy !== true) {
    throw new OpenCodeUnavailableError(
      "OpenCode Server reported an unhealthy state.",
    );
  }
}

export async function createSession(
  config: OpenCodeConfig,
  fetchImpl: FetchLike = fetch,
): Promise<string> {
  const { body } = await requestJson(
    config,
    "/session",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: { id: config.model.modelID, providerID: config.model.providerID },
      }),
    },
    fetchImpl,
  );
  if (body === null || typeof body !== "object") {
    throw new InvalidOpenCodeResponseError(
      "Expected a session object but received: " + typeof body,
    );
  }
  const id = (body as { id?: unknown }).id;
  if (typeof id !== "string" || id === "") {
    throw new InvalidOpenCodeResponseError(
      "Session response did not include a usable 'id'.",
    );
  }
  return id;
}

export async function sendMessage(
  config: OpenCodeConfig,
  sessionId: string,
  prompt: string,
  fetchImpl: FetchLike = fetch,
): Promise<string> {
  const { body } = await requestJson(
    config,
    `/session/${sessionId}/message`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: { providerID: config.model.providerID, modelID: config.model.modelID },
        parts: [{ type: "text", text: prompt }],
      }),
    },
    fetchImpl,
  );
  if (body === null || typeof body !== "object") {
    throw new InvalidOpenCodeResponseError(
      "Expected a message object but received: " + typeof body,
    );
  }
  const info = (body as { info?: unknown }).info;
  if (info !== null && typeof info === "object") {
    const infoError = (info as { error?: unknown }).error;
    if (infoError !== undefined && infoError !== null) {
      throw new OpenCodeRequestError(
        "The model returned an error.",
        "message-error",
      );
    }
  }
  const parts = (body as { parts?: unknown }).parts;
  return extractText(parts);
}

export async function deleteSession(
  config: OpenCodeConfig,
  sessionId: string,
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  const { response, body } = await requestJson(
    config,
    `/session/${sessionId}`,
    { method: "DELETE" },
    fetchImpl,
  );
  void response;
  if (body !== true) {
    throw new InvalidOpenCodeResponseError(
      "Delete session did not return the expected boolean confirmation.",
    );
  }
}

export async function askOnce(
  config: OpenCodeConfig,
  prompt: string,
  fetchImpl: FetchLike = fetch,
): Promise<string> {
  let sessionId: string;
  try {
    sessionId = await createSession(config, fetchImpl);
  } catch (err) {
    if (err instanceof Error) throw err;
    throw new OpenCodeRequestError(String(err));
  }

  let primary: Error | null = null;
  let text: string | null = null;
  try {
    text = await sendMessage(config, sessionId, prompt, fetchImpl);
  } catch (err) {
    primary = err instanceof Error ? err : new OpenCodeRequestError(String(err));
  }

  let cleanupError: Error | null = null;
  try {
    await deleteSession(config, sessionId, fetchImpl);
  } catch (err) {
    cleanupError = err instanceof Error ? err : new OpenCodeRequestError(String(err));
  }

  if (cleanupError !== null) {
    if (primary !== null) {
      throw new OpenCodeCleanupError(primary, cleanupError);
    }
    throw cleanupError;
  }

  if (primary !== null) {
    throw primary;
  }

  return text as string;
}
