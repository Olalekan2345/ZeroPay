import { NextResponse } from "next/server";
import { listEmployees, listAttendance, addReport, listReports } from "@/lib/db";
import { buildReport } from "@/lib/agent";
import { putJSON } from "@/lib/storage";
import { createPublicClient, http } from "viem";
import { zgGalileo } from "@/lib/chain";
import { PAYROLL_POOL_ABI } from "@/lib/abi/PayrollPool";
import { requireEmployer, resolvePoolAddress } from "@/lib/tenant";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const g = await requireEmployer(req.url);
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });

  const body        = await req.json().catch(() => ({}));
  const weekOffset  = body.weekOffset === -1 ? -1 : 0;
  const period: "daily" | "weekly" = body.period === "daily" ? "daily" : "weekly";
  const employeeIds: string[] | null = Array.isArray(body.employeeIds) && body.employeeIds.length > 0
    ? body.employeeIds
    : null;

  const [allEmployees, attendance, poolAddress] = await Promise.all([
    listEmployees(g.employer),
    listAttendance(g.employer),
    resolvePoolAddress(g.employer),
  ]);

  const employees = employeeIds
    ? allEmployees.filter((e) => employeeIds.includes(e.id))
    : allEmployees;
  let poolBalanceWei = 0n;
  if (poolAddress) {
    try {
      const c = createPublicClient({ chain: zgGalileo, transport: http() });
      poolBalanceWei = (await c.readContract({
        address: poolAddress,
        abi: PAYROLL_POOL_ABI,
        functionName: "balance",
      })) as bigint;
    } catch {}
  }
  const report = buildReport({
    employees,
    attendance,
    poolBalanceWei,
    weekOffset,
    period,
  });
  report.storageRef =
    body.storageRef ??
    (await putJSON({ kind: "payroll", employer: g.employer, ...report }));
  if (body.txHash) {
    report.txHash = body.txHash;
    const existing = await listReports(g.employer);
    if (!existing.find((r) => r.txHash === body.txHash)) {
      await addReport(g.employer, report);
    }
  }
  return NextResponse.json(report);
}
