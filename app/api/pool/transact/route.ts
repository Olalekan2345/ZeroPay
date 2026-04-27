import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { getSettings, getOperatorKey } from "@/lib/db";
import { requireEmployer } from "@/lib/tenant";

export const runtime = "nodejs";

const POOL_ABI = [
  "function deposit() external payable",
  "function withdraw(uint256 amount) external",
];

export async function POST(req: Request) {
  const g = await requireEmployer(req.url);
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });

  const body = await req.json().catch(() => ({}));
  const action      = body.action as "deposit" | "withdraw";
  const amountEther = String(body.amount ?? "");

  if (action !== "deposit" && action !== "withdraw")
    return NextResponse.json({ error: "action must be deposit or withdraw" }, { status: 400 });

  const parsed = parseFloat(amountEther);
  if (!amountEther || !Number.isFinite(parsed) || parsed <= 0)
    return NextResponse.json({ error: "invalid amount" }, { status: 400 });

  const settings = await getSettings(g.employer);
  if (!settings.poolAddress)
    return NextResponse.json({ error: "No pool contract deployed for this employer." }, { status: 400 });

  // Use per-tenant operator key; fall back to platform key for legacy tenants
  const operatorKey = await getOperatorKey(g.employer)
    ?? process.env.EMPLOYER_PRIVATE_KEY;

  if (!operatorKey)
    return NextResponse.json(
      { error: "No signing key available — please redeploy your payroll contract." },
      { status: 500 },
    );

  try {
    const rpc      = process.env.NEXT_PUBLIC_ZG_RPC_URL ?? "https://evmrpc-testnet.0g.ai";
    const provider = new ethers.JsonRpcProvider(rpc);
    const signer   = new ethers.Wallet(
      operatorKey.startsWith("0x") ? operatorKey : "0x" + operatorKey,
      provider,
    );
    const contract  = new ethers.Contract(settings.poolAddress, POOL_ABI, signer);
    const amountWei = ethers.parseEther(amountEther);

    let tx: ethers.TransactionResponse;
    if (action === "deposit") {
      tx = await contract.deposit({ value: amountWei, gasLimit: 100_000 });
    } else {
      tx = await contract.withdraw(amountWei, { gasLimit: 100_000 });
    }

    return NextResponse.json({ txHash: tx.hash });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
