import { NextResponse } from "next/server";
import { listEmployees, listAttendance, addReport } from "@/lib/db";
import { buildReport } from "@/lib/agent";
import { putJSON } from "@/lib/storage";
import { createPublicClient, createWalletClient, http, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { zgGalileo } from "@/lib/chain";
import { PAYROLL_POOL_ABI } from "@/lib/abi/PayrollPool";
import { requireEmployer, resolvePoolAddress } from "@/lib/tenant";

export const runtime = "nodejs";

/**
 * Executes payroll for one employer tenant.
 *
 * Salary payments are deducted EXCLUSIVELY from the PayrollPool contract
 * balance — never from the employer's personal wallet.
 * The employer wallet only pays gas for the payBatch transaction.
 *
 * Called by:
 *   - Dashboard "Run agent" button (manual)
 *   - scripts/scheduler.mjs (automatic, on the configured schedule)
 */
export async function POST(req: Request) {
  const g = await requireEmployer(req.url);
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });

  const body       = await req.json().catch(() => ({}));
  const weekOffset = body.weekOffset === -1 ? -1 : 0;
  const period: "daily" | "weekly" | "monthly" =
    body.period === "daily" ? "daily" : body.period === "monthly" ? "monthly" : "weekly";

  const pk          = process.env.EMPLOYER_PRIVATE_KEY;
  const poolAddress = await resolvePoolAddress(g.employer);

  if (!poolAddress)
    return NextResponse.json(
      { error: "Pool address not configured for this employer." },
      { status: 400 },
    );
  if (!pk)
    return NextResponse.json(
      { error: "EMPLOYER_PRIVATE_KEY not set — use the dashboard to submit manually." },
      { status: 400 },
    );

  const account = privateKeyToAccount(
    (pk.startsWith("0x") ? pk : `0x${pk}`) as `0x${string}`,
  );
  if (account.address.toLowerCase() !== g.employer)
    return NextResponse.json(
      { error: "Server signing key does not match this employer wallet." },
      { status: 403 },
    );

  const pub    = createPublicClient({ chain: zgGalileo, transport: http() });
  const wallet = createWalletClient({ chain: zgGalileo, transport: http(), account });

  /* ── Read pool balance from contract (not employer wallet) ── */
  let poolBalanceWei: bigint;
  try {
    poolBalanceWei = (await pub.readContract({
      address: poolAddress,
      abi: PAYROLL_POOL_ABI,
      functionName: "balance",
    })) as bigint;
  } catch (err) {
    return NextResponse.json(
      { error: `Cannot read pool balance: ${(err as Error).message}` },
      { status: 502 },
    );
  }

  const [employees, attendance] = await Promise.all([
    listEmployees(g.employer),
    listAttendance(g.employer),
  ]);

  const report = buildReport({
    employees,
    attendance,
    poolBalanceWei,
    weekOffset,
    period,
  });

  const payable = report.lines.filter((l) => BigInt(l.amountWei) > 0n);

  /* ── No hours ── */
  if (payable.length === 0) {
    report.warnings.push("No payable hours for this period.");
    report.storageRef = await putJSON({ kind: "payroll", employer: g.employer, ...report });
    await addReport(g.employer, report);
    return NextResponse.json(report);
  }

  /* ── Pre-flight: verify pool can cover the full batch ── */
  const totalOwed = payable.reduce((s, l) => s + BigInt(l.amountWei), 0n);
  if (totalOwed > poolBalanceWei) {
    report.sufficient = false;
    report.warnings.push(
      `Pool balance (${formatEther(poolBalanceWei)} 0G) is insufficient ` +
      `to cover payroll (${formatEther(totalOwed)} 0G). ` +
      `Deposit ${formatEther(totalOwed - poolBalanceWei)} 0G to unlock payments.`,
    );
    report.storageRef = await putJSON({ kind: "payroll", employer: g.employer, ...report });
    await addReport(g.employer, report);
    return NextResponse.json({ ...report, error: "insufficient_pool" }, { status: 402 });
  }

  /* ── Persist report to 0G Storage before signing ── */
  report.storageRef = await putJSON({ kind: "payroll", employer: g.employer, ...report });

  /* ── Execute payBatch — salaries come from pool, not employer wallet ── */
  try {
    const txHash = await wallet.writeContract({
      address: poolAddress,
      abi: PAYROLL_POOL_ABI,
      functionName: "payBatch",
      args: [
        payable.map((l) => l.wallet),
        payable.map((l) => BigInt(l.amountWei)),
        payable.map((l) => BigInt(Math.round(l.hoursWorked * 100))),
        BigInt(Math.floor(report.weekStart / 1000)),
        report.storageRef,
      ],
      maxPriorityFeePerGas: 2_000_000_000n,
      gas: BigInt(100_000 + payable.length * 80_000),
    });
    report.txHash = txHash;
    await addReport(g.employer, report);
    return NextResponse.json(report);
  } catch (err) {
    const msg = (err as Error).message;
    return NextResponse.json(
      { ...report, error: `Transaction failed: ${msg}` },
      { status: 500 },
    );
  }
}
