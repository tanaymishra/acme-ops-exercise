import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";

import { app } from "../app";
import { query } from "../db";

/**
 * Integration tests for overview dashboard performance & correctness (ACME-455).
 */
beforeAll(async () => {
  try {
    await query("select 1");
  } catch {
    throw new Error("Cannot reach Postgres database.");
  }
});

describe("GET /api/dashboard (ACME-455)", () => {
  it("returns fleet overview data structure correctly with all 200 organizations", async () => {
    const res = await request(app).get("/api/dashboard").expect(200);

    expect(res.body.organizations.length).toBe(200);
    expect(res.body.totals.organizations).toBe(200);
    expect(res.body.activity.length).toBe(30);

    // Verify properties on an organization row
    const firstOrg = res.body.organizations[0];
    expect(firstOrg).toHaveProperty("id");
    expect(firstOrg).toHaveProperty("name");
    expect(firstOrg).toHaveProperty("activeMembers");
    expect(firstOrg).toHaveProperty("events30d");
  });

  it("responds in less than 1500ms (verifying N+1 query elimination)", async () => {
    const start = Date.now();
    await request(app).get("/api/dashboard").expect(200);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(1500);
  });
});
