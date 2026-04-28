import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { listEmployees, listAttendance, addReport, listReports, getOperatorKey } from "@/lib/db";
import { buildReport } from "@/lib/agent";
import { putJSON } from "@/lib/storage";
import { requireEmployer } from "@/lib/tenant";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const g = await requireEmployer(req.url);
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });

  const body       = await req.json().catch(() => ({}));
  const weekOffset = body.weekOffset === -1 ? -1 : 0;
  const period: "daily" | "weekly" | "monthly" = body.period === "daily" ? "daily" : body.period === "monthly" ? "monthly" : "weekly";
  const employeeIds: string[] | null = Array.isArray(body.employeeIds) && body.employeeIds.length > 0
    ? body.employeeIds : null;

  let agentBalanceWei = 0n;
  const rawKey = await getOperatorKey(g.employer);
  if (rawKey) {
    try {
      const rpc      = process.env.NEXT_PUBLIC_ZG_RPC_URL ?? "https://evmrpc-testnet.0g.ai";
      const provider = new ethers.JsonRpcProvider(rpc);
      const address  = new ethers.Wallet(rawKey.startsWith("0x") ? rawKey : "0x" + rawKey).address;
      agentBalanceWei = await provider.getBalance(address);
    } catch { /* show 0 on RPC failure */ }
  }

  const [allEmployees, attendance] = await Promise.all([
    listEmployees(g.employer),
    listAttendance(g.employer),
  ]);

  const employees = employeeIds
    ? allEmployees.filter((e) => employeeIds.includes(e.id))
    : allEmployees;

  const report = buildReport({ employees, attendance, poolBalanceWei: agentBalanceWei, weekOffset, period });
  report.storageRef = body.storageRef ?? (await putJSON({ kind: "payroll", employer: g.employer, ...report }));

  if (body.txHash) {
    report.txHash = body.txHash;
    const existing = await listReports(g.employer);
    if (!existing.find((r) => r.txHash === body.txHash)) {
      await addReport(g.employer, report);
    }
  }

  return NextResponse.json(report);
}
