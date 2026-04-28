import { NextResponse } from "next/server";
import { listEmployees, listAttendance, addReport } from "@/lib/db";
import { buildReport } from "@/lib/agent";
import { putJSON } from "@/lib/storage";
import { requireEmployer } from "@/lib/tenant";

export const runtime = "nodejs";

/**
 * Computes payroll and persists the report.
 * Transaction sending is handled client-side by the employer's connected wallet.
 */
export async function POST(req: Request) {
  const g = await requireEmployer(req.url);
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });

  const body       = await req.json().catch(() => ({}));
  const weekOffset = body.weekOffset === -1 ? -1 : 0;
  const period: "daily" | "weekly" | "monthly" =
    body.period === "daily" ? "daily" : body.period === "monthly" ? "monthly" : "weekly";
  const employeeIds: string[] | null =
    Array.isArray(body.employeeIds) && body.employeeIds.length > 0 ? body.employeeIds : null;
  const txHash: string | undefined = body.txHash;

  const [allEmployees, attendance] = await Promise.all([
    listEmployees(g.employer),
    listAttendance(g.employer),
  ]);

  const employees = employeeIds
    ? allEmployees.filter((e) => employeeIds.includes(e.id))
    : allEmployees;

  // Balance check is done client-side; pass 0 here so the report is always generated
  const report = buildReport({ employees, attendance, poolBalanceWei: 0n, weekOffset, period });

  report.storageRef = await putJSON({ kind: "payroll", employer: g.employer, ...report });
  if (txHash) report.txHash = txHash as `0x${string}`;

  await addReport(g.employer, report);
  return NextResponse.json(report);
}
