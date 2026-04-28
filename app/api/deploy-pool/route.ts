import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Vault contracts removed — payments now go directly from the agent wallet.
export async function POST() {
  return NextResponse.json(
    { error: "Vault deployment is no longer required. Fund the agent wallet directly instead." },
    { status: 410 },
  );
}
