import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { getOperatorKey } from "@/lib/db";
import { parseEmployer } from "@/lib/tenant";
import { PAYROLL_POOL_BYTECODE } from "@/lib/abi/PayrollPoolBytecode";

export const runtime = "nodejs";

export async function GET(req: Request) {
  // Derive operator address from stored key so the frontend can pass it as a constructor arg
  const employer = parseEmployer(req.url);
  let operatorAddress: string | null = null;
  if (employer) {
    const key = await getOperatorKey(employer);
    if (key) {
      try { operatorAddress = new ethers.Wallet(key).address; } catch { /* ignore */ }
    }
  }

  return NextResponse.json({ bytecode: PAYROLL_POOL_BYTECODE, operatorAddress });
}
