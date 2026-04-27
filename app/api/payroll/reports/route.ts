import { NextResponse } from "next/server";
import { listReports } from "@/lib/db";
import { requireEmployer } from "@/lib/tenant";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const g = await requireEmployer(req.url);
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  return NextResponse.json(await listReports(g.employer));
}
