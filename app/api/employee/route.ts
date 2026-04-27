import { NextResponse } from "next/server";
import { findEmployeeByWallet } from "@/lib/db";
import { buildReport, previousWeekBounds, weekBounds } from "@/lib/agent";
import { createPublicClient, http } from "viem";
import { zgGalileo } from "@/lib/chain";
import { PAYROLL_POOL_ABI } from "@/lib/abi/PayrollPool";

export const runtime = "nodejs";

/** Employee-facing restricted view. Locates the wallet across all tenants. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const wallet = (searchParams.get("wallet") ?? "").toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(wallet))
    return NextResponse.json({ error: "invalid wallet" }, { status: 400 });

  const hits = await findEmployeeByWallet(wallet);
  if (hits.length === 0)
    return NextResponse.json({ error: "not registered" }, { status: 404 });

  // If a wallet is registered under multiple employers, pick the first; in
  // practice that is rare and the UI can be extended later to switch tenants.
  const h = hits[0];

  let poolBalanceWei = 0n;
  if (h.settings.poolAddress) {
    try {
      const c = createPublicClient({ chain: zgGalileo, transport: http() });
      poolBalanceWei = (await c.readContract({
        address: h.settings.poolAddress,
        abi: PAYROLL_POOL_ABI,
        functionName: "balance",
      })) as bigint;
    } catch {}
  }

  const thisWeek = buildReport({
    employees: [h.employee],
    attendance: h.attendance,
    poolBalanceWei,
    weekOffset: 0,
  });
  const lastWeek = buildReport({
    employees: [h.employee],
    attendance: h.attendance,
    poolBalanceWei,
    weekOffset: -1,
  });

  const history = h.reports
    .map((r) => {
      const line = r.lines.find((l) => l.employeeId === h.employee.id);
      if (!line || line.amount === 0) return null;
      return {
        weekStart: r.weekStart,
        weekEnd: r.weekEnd,
        amount: line.amount,
        amountWei: line.amountWei,
        hoursWorked: line.hoursWorked,
        txHash: r.txHash,
        storageRef: r.storageRef,
      };
    })
    .filter(Boolean);

  return NextResponse.json({
    employer: h.employer,
    businessName: h.settings.businessName ?? null,
    employee: h.employee,
    attendance: h.attendance.sort((a, b) => b.clockIn - a.clockIn),
    thisWeek: thisWeek.lines[0],
    lastWeek: lastWeek.lines[0],
    weekBounds: weekBounds(),
    previousWeek: previousWeekBounds(),
    history,
  });
}
