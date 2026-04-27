import { NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { zgGalileo } from "@/lib/chain";
import { PAYROLL_POOL_ABI } from "@/lib/abi/PayrollPool";
import { parseEmployer, resolvePoolAddress } from "@/lib/tenant";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const employer = parseEmployer(req.url);
  if (!employer)
    return NextResponse.json({ error: "employer required" }, { status: 400 });

  const address = await resolvePoolAddress(employer);
  if (!address) {
    return NextResponse.json({
      configured: false,
      balanceWei: "0",
      address: null,
      chainId: zgGalileo.id,
    });
  }

  const c = createPublicClient({ chain: zgGalileo, transport: http() });

  // Check bytecode first — if no code, the address is wrong or contract not deployed
  let code: string | undefined;
  try {
    code = await c.getCode({ address });
  } catch {
    code = undefined;
  }

  const hasCode = !!code && code !== "0x";

  if (!hasCode) {
    return NextResponse.json({
      configured: true,
      address,
      hasCode: false,
      balanceWei: "0",
      error: "No contract found at this address. Deploy a Secured Vault first, or check the address.",
      chainId: zgGalileo.id,
    });
  }

  try {
    const [balanceWei, poolOwner] = await Promise.all([
      c.readContract({
        address,
        abi: PAYROLL_POOL_ABI,
        functionName: "balance",
      }) as Promise<bigint>,
      c.readContract({
        address,
        abi: PAYROLL_POOL_ABI,
        functionName: "owner",
      }) as Promise<`0x${string}`>,
    ]);
    return NextResponse.json({
      configured: true,
      hasCode: true,
      address,
      employer: poolOwner,
      tenantOwns: poolOwner.toLowerCase() === employer.toLowerCase(),
      balanceWei: balanceWei.toString(),
      chainId: zgGalileo.id,
    });
  } catch (err) {
    return NextResponse.json({
      configured: true,
      hasCode: true,
      address,
      balanceWei: "0",
      error: (err as Error).message,
      chainId: zgGalileo.id,
    });
  }
}
