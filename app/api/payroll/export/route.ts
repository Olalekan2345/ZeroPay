import { listEmployees, listAttendance } from "@/lib/db";
import { buildReport, reportToCSV } from "@/lib/agent";
import { createPublicClient, http } from "viem";
import { zgGalileo } from "@/lib/chain";
import { PAYROLL_POOL_ABI } from "@/lib/abi/PayrollPool";
import { requireEmployer, resolvePoolAddress } from "@/lib/tenant";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const g = await requireEmployer(req.url);
  if (!g.ok) return new Response(g.error, { status: g.status });
  const { searchParams } = new URL(req.url);
  const weekOffset = Number(searchParams.get("weekOffset") ?? 0);
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
    } catch {}
  }
  const report = buildReport({
    employees,
    attendance,
    poolBalanceWei,
    weekOffset: weekOffset === -1 ? -1 : 0,
  });
  const csv = reportToCSV(report);
  const wk = new Date(report.weekStart).toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="zeropay-week-${wk}.csv"`,
    },
  });
}
