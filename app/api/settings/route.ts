import { NextResponse } from "next/server";
import { getSettings, saveSettings } from "@/lib/db";
import type { PaymentSchedule } from "@/lib/db";

export const runtime = "nodejs";

function employerFrom(req: Request): string | null {
  const { searchParams } = new URL(req.url);
  const e = searchParams.get("employer");
  return e && /^0x[a-fA-F0-9]{40}$/.test(e) ? e.toLowerCase() : null;
}

export async function GET(req: Request) {
  const emp = employerFrom(req);
  if (!emp) return NextResponse.json({ error: "employer required" }, { status: 400 });
  const settings = await getSettings(emp);
  return NextResponse.json(settings);
}

export async function POST(req: Request) {
  const emp = employerFrom(req);
  if (!emp) return NextResponse.json({ error: "employer required" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const patch: Parameters<typeof saveSettings>[1] = {};

  if (typeof body.businessName === "string")
    patch.businessName = body.businessName.trim().slice(0, 80);

  if (typeof body.poolAddress === "string") {
    const pa = body.poolAddress.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(pa))
      return NextResponse.json({ error: "invalid poolAddress" }, { status: 400 });
    patch.poolAddress = pa as `0x${string}`;
  }

  if (body.paymentSchedule !== undefined) {
    const s = body.paymentSchedule as Partial<PaymentSchedule>;
    const freq = s?.frequency;
    if (!freq || !["daily","weekly","monthly"].includes(freq))
      return NextResponse.json({ error: "invalid schedule frequency" }, { status: 400 });

    const hour = Number(s.hour ?? 17);
    const minute = Number(s.minute ?? 0);
    if (!Number.isInteger(hour)   || hour   < 0 || hour   > 23)
      return NextResponse.json({ error: "hour must be 0-23" },   { status: 400 });
    if (!Number.isInteger(minute) || minute < 0 || minute > 59)
      return NextResponse.json({ error: "minute must be 0-59" }, { status: 400 });

    const schedule: PaymentSchedule = { frequency: freq, hour, minute };
    if (freq === "weekly")  schedule.dayOfWeek  = Number(s.dayOfWeek  ?? 6);
    if (freq === "monthly") schedule.dayOfMonth = Number(s.dayOfMonth ?? 1);
    patch.paymentSchedule = schedule;
  }

  return NextResponse.json(await saveSettings(emp, patch));
}

// DELETE — cancel (remove) the payment schedule
export async function DELETE(req: Request) {
  const emp = employerFrom(req);
  if (!emp) return NextResponse.json({ error: "employer required" }, { status: 400 });
  const current = await getSettings(emp);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { paymentSchedule: _, ...rest } = current;
  const settings = await saveSettings(emp, { ...rest, paymentSchedule: undefined });
  return NextResponse.json(settings);
}
