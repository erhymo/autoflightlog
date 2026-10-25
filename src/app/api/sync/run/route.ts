import { NextRequest, NextResponse } from "next/server";
import { listDueConnectors } from "@/lib/sync/server/connectorStore";
import { runConnectorSync } from "@/lib/sync/server/runSync";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Scheduled sync, invoked by Vercel Cron (see vercel.json). Vercel sends
 * `Authorization: Bearer <CRON_SECRET>` automatically when the CRON_SECRET
 * environment variable is set; the same header lets you trigger it by hand
 * with curl. Refuses to run at all if the secret isn't configured.
 */
export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  const header = req.headers.get("authorization") ?? "";
  if (header !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const nowIso = new Date().toISOString();
  const due = await listDueConnectors(nowIso);
  const results: Array<{ uid: string; connectorId: string; ok: boolean; error?: string; created?: number; updated?: number }> = [];

  for (const { uid, connector } of due) {
    // Stay well inside the function's time budget; whatever is left stays
    // due and is picked up on the next tick.
    if (Date.now() - startedAt > 45_000) break;
    const r = await runConnectorSync(uid, connector.id, { trigger: "cron" });
    results.push({
      uid,
      connectorId: connector.id,
      ok: r.ok,
      error: r.error,
      created: r.summary?.created,
      updated: r.summary?.updated,
    });
  }

  return NextResponse.json({ due: due.length, processed: results.length, results });
}
