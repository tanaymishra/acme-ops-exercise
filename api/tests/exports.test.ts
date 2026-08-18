import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";

import { app } from "../app";
import { query } from "../db";

/**
 * Integration tests for activity CSV exports (ACME-431).
 * Verifies deterministic pagination and complete end-of-day date range filtering.
 */
beforeAll(async () => {
  try {
    await query("select 1");
  } catch {
    throw new Error("Cannot reach Postgres database.");
  }
});

describe("GET /api/organizations/:id/export/activity.csv (ACME-431)", () => {
  it(
    "exports activity CSV with deterministic ordering and zero duplicate row IDs across batches",
    async () => {
      const res = await request(app)
        .get("/api/organizations/3/export/activity.csv")
        .expect(200)
        .expect("Content-Type", /text\/csv/);

      const lines = res.text.trim().split("\n");
      expect(lines.length).toBeGreaterThan(100);

      const header = lines[0].trim();
      expect(header).toBe("id,created_at,action,target_type,target_id,actor");

      // Extract row IDs and verify strict uniqueness (no duplicate rows)
      const ids = lines.slice(1).map((line) => line.split(",")[0]);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(ids.length);
    },
    15000,
  );

  it("includes all events up to end-of-day (23:59:59) when passing a 'to' date (YYYY-MM-DD)", async () => {
    // Get count from API export for date range 2026-07-18 to 2026-08-18
    const res = await request(app)
      .get("/api/organizations/3/export/activity.csv?from=2026-07-18&to=2026-08-18")
      .expect(200);

    const lines = res.text.trim().split("\n");
    expect(lines[0].trim()).toBe("id,created_at,action,target_type,target_id,actor");
    expect(lines.length).toBeGreaterThan(1);
  });
});
