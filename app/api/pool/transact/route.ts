import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    { error: "Use /api/agent-wallet/withdraw instead." },
    { status: 410 },
  );
}
