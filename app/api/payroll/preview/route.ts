import { NextResponse } from "next/server";
import { listEmployees, listAttendance } from "@/lib/db";
import { buildReport } from "@/lib/agent";
import { requireEmployer } from "@/lib/tenant";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const g = await requireEmployer(req.url);
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });

  const { searchParams } = new URL(req.url);
  const weekOffset  = Number(searchParams.get("weekOffset") ?? 0);
  const rawPeriod   = searchParams.get("period");
  const period      = (rawPeriod === "daily" ? "daily" : rawPeriod === "monthly" ? "monthly" : "weekly") as "daily" | "weekly" | "monthly";
  const rawIds      = searchParams.get("employeeIds");
  const employeeIds = rawIds ? rawIds.split(",").filter(Boolean) : null;

  const [allEmployees, attendance] = await Promise.all([
    listEmployees(g.employer),
    listAttendance(g.employer),
  ]);

  const employees = employeeIds
    ? allEmployees.filter((e) => employeeIds.includes(e.id))
    : allEmployees;

  // Balance check is done client-side against the employer's connected wallet
  const report = buildReport({
    employees,
    attendance,
    poolBalanceWei: 0n,
    weekOffset: weekOffset === -1 ? -1 : 0,
    period,
  });

  return NextResponse.json(report);
}
