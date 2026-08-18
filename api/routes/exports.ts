import { Router } from "express";

import { query } from "../db";
import { csvLine } from "../lib/csv";
import { HttpError, asString, parseId } from "../lib/http";
import { getOrganization } from "../queries/orgs";

export const exportsRouter = Router();

/** Rows pulled per round trip. The whole log will not fit in memory. */
const BATCH_SIZE = 1000;

type ExportRow = {
  id: string;
  created_at: Date;
  action: string;
  target_type: string;
  target_id: string | null;
  actor_name: string | null;
};

/**
 * Streams an organization's activity log as CSV.
 *
 * Optional `from` and `to` query parameters narrow the range; both are
 * YYYY-MM-DD as sent by the date pickers in the console.
 */
exportsRouter.get("/:id/export/activity.csv", async (req, res) => {
  const orgId = parseId(req.params.id, "Organization id");
  const from = asString(req.query.from) ?? null;
  const to = asString(req.query.to) ?? null;

  // FIX (ACME-431): When 'to' date is provided as YYYY-MM-DD (10 chars), extend it to end-of-day 
  // (23:59:59.999Z). Without this, SQL timestamp casting ('2026-08-18'::timestamptz) defaults to 
  // 00:00:00.000Z, truncating and omitting all activity events generated during the selected end date.
  const toParam = to ? (to.length === 10 ? `${to}T23:59:59.999Z` : to) : null;

  const organization = await getOrganization(orgId);
  if (!organization) throw new HttpError(404, "Organization not found.");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${organization.slug}-activity.csv"`,
  );

  res.write(csvLine(["id", "created_at", "action", "target_type", "target_id", "actor"]));

  let offset = 0;

  for (;;) {
    const rows = await query<ExportRow>(
      `
        select
          e.id::text,
          e.created_at,
          e.action,
          e.target_type,
          e.target_id,
          u.name as actor_name
        from audit_events e
        left join users u on u.id = e.actor_user_id
        where e.org_id = $1
          and ($2::timestamptz is null or e.created_at >= $2::timestamptz)
          and ($3::timestamptz is null or e.created_at <= $3::timestamptz)
        order by e.created_at desc, e.id desc
        limit $4 offset $5
      `,
      [orgId, from, toParam, BATCH_SIZE, offset],
    );

    if (rows.length === 0) break;

    for (const row of rows) {
      res.write(
        csvLine([
          row.id,
          row.created_at,
          row.action,
          row.target_type,
          row.target_id,
          row.actor_name,
        ]),
      );
    }

    if (rows.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }

  res.end();
});
