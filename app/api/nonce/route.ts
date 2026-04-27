import { NextResponse } from "next/server";
import { ethers } from "ethers";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address");
  if (!address || !/^0x[a-fA-F0-9]{40}$/i.test(address))
    return NextResponse.json({ error: "invalid address" }, { status: 400 });

  const rpc = process.env.NEXT_PUBLIC_ZG_RPC_URL ?? "https://evmrpc-testnet.0g.ai";
  const provider = new ethers.JsonRpcProvider(rpc);

  const [nonce, feeData] = await Promise.all([
    provider.getTransactionCount(address),
    provider.getFeeData(),
  ]);

  return NextResponse.json({
    nonce,
    gasPrice: (feeData.gasPrice ?? 5_000_000_000n).toString(),
  });
}
