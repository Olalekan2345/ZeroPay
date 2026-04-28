import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { requireEmployer } from "@/lib/tenant";
import { getOperatorKey } from "@/lib/db";

export const runtime = "nodejs";

const GAS_LIMIT = 21_000n;
const GAS_PRICE = 2_000_000_000n; // 2 Gwei

export async function POST(req: Request) {
  const g = await requireEmployer(req.url);
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });

  const body = await req.json().catch(() => ({}));
  const { amount } = body as { amount?: string };
  if (!amount) return NextResponse.json({ error: "amount required" }, { status: 400 });

  const rawKey = await getOperatorKey(g.employer);
  if (!rawKey)
    return NextResponse.json({ error: "No agent wallet configured yet." }, { status: 400 });

  const rpc = process.env.NEXT_PUBLIC_ZG_RPC_URL ?? "https://evmrpc-testnet.0g.ai";
  const provider = new ethers.JsonRpcProvider(rpc);
  const agentWallet = new ethers.Wallet(
    rawKey.startsWith("0x") ? rawKey : "0x" + rawKey,
    provider,
  );

  try {
    const weiAmount = ethers.parseEther(amount);
    const balance = await provider.getBalance(agentWallet.address);
    const gasCost = GAS_LIMIT * GAS_PRICE;

    if (weiAmount + gasCost > balance)
      return NextResponse.json(
        { error: `Insufficient balance. Have ${ethers.formatEther(balance)} 0G, need ${ethers.formatEther(weiAmount + gasCost)} 0G (includes gas).` },
        { status: 400 },
      );

    const tx = await agentWallet.sendTransaction({
      to: ethers.getAddress(g.employer),
      value: weiAmount,
      gasLimit: GAS_LIMIT,
      maxPriorityFeePerGas: GAS_PRICE,
    });
    await tx.wait();
    return NextResponse.json({ txHash: tx.hash });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
