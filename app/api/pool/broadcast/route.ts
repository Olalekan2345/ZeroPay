import { NextResponse } from "next/server";
import { ethers } from "ethers";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { signedTx } = body;

  if (!signedTx || typeof signedTx !== "string")
    return NextResponse.json({ error: "signedTx required" }, { status: 400 });

  const rpc = process.env.NEXT_PUBLIC_ZG_RPC_URL ?? "https://evmrpc-testnet.0g.ai";
  const provider = new ethers.JsonRpcProvider(rpc);

  try {
    const tx = await provider.broadcastTransaction(signedTx);
    return NextResponse.json({ txHash: tx.hash });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
