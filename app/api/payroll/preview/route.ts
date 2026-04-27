import { NextResponse } from "next/server";
import { listEmployees, listAttendance } from "@/lib/db";
import { buildReport } from "@/lib/agent";
import { createPublicClient, http } from "viem";
import { zgGalileo } from "@/lib/chain";
import { PAYROLL_POOL_ABI } from "@/lib/abi/PayrollPool";
import { requireEmployer, resolvePoolAddress } from "@/lib/tenant";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const g = await requireEmployer(req.url);
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  const { searchParams } = new URL(req.url);
  const weekOffset = Number(searchParams.get("weekOffset") ?? 0);
  const rawPeriod = searchParams.get("period");
  const period = (rawPeriod === "daily" ? "daily" : rawPeriod === "monthly" ? "monthly" : "weekly") as "daily" | "weekly" | "monthly";

  const [employees, attendance, poolAddress] = await Promise.all([
    listEmployees(g.employer),
    listAttendance(g.employer),
    resolvePoolAddress(g.employer),
  ]);

  let poolBalanceWei = 0n;
  if (poolAddress) {
    try {
      const client = createPublicClient({ chain: zgGalileo, transport: http() });
      poolBalanceWei = (await client.readContract({
        address: poolAddress,
        abi: PAYROLL_POOL_ABI,
        functionName: "balance",
      })) as bigint;
    } catch (err) {
      console.warn("pool balance read failed:", (err as Error).message);
    }
  }

  const report = buildReport({
    employees,
    attendance,
    poolBalanceWei,
    weekOffset: weekOffset === -1 ? -1 : 0,
    period,
  });
  return NextResponse.json(report);
}
