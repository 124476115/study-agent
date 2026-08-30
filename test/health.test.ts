import { describe, expect, it } from "vitest";
import { GET } from "../app/api/health/route";

describe("GET /api/health", () => {
  it("returns HTTP 200 with the deterministic health payload", async () => {
    const response = GET();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toEqual({
      status: "ok",
      service: "study-agent",
    });
  });

  it("does not emit nondeterministic fields", async () => {
    const response = GET();
    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual(["service", "status"]);
  });
});
