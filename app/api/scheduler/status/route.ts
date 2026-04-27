import { NextResponse } from "next/server";
import { getSettings } from "@/lib/db";
import { parseEmployer } from "@/lib/tenant";

export const runtime = "nodejs";

const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

function nextRunDate(schedule: {
  frequency: "daily" | "weekly" | "monthly";
  hour: number;
  dayOfWeek?: number;
  dayOfMonth?: number;
}): { iso: string; label: string } {
  const now    = new Date();
  const target = new Date(now);

  if (schedule.frequency === "daily") {
    target.setMinutes(0, 0, 0);
    target.setHours(schedule.hour);
    if (target <= now) target.setDate(target.getDate() + 1);
  } else if (schedule.frequency === "monthly") {
    const dom = schedule.dayOfMonth ?? 1;
    target.setDate(dom);
    target.setHours(schedule.hour, 0, 0, 0);
    if (target <= now) target.setMonth(target.getMonth() + 1);
  } else {
    const targetDow = schedule.dayOfWeek ?? 6;
    const currentDow = now.getDay();
    let daysUntil = (targetDow - currentDow + 7) % 7;
    if (daysUntil === 0 && now.getHours() >= schedule.hour) daysUntil = 7;
    target.setDate(now.getDate() + daysUntil);
    target.setHours(schedule.hour, 0, 0, 0);
  }

  const diff    = target.getTime() - now.getTime();
  const hours   = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);

  const day = schedule.frequency === "weekly"
    ? `${DAY_NAMES[schedule.dayOfWeek ?? 6]}s`
    : schedule.frequency === "monthly"
      ? `monthly (day ${schedule.dayOfMonth ?? 1})`
      : "daily";
  const at  = `${String(schedule.hour).padStart(2, "0")}:00`;

  const label =
    hours > 48
      ? `in ${Math.ceil(hours / 24)} days`
      : hours > 0
        ? `in ${hours}h ${minutes}m`
        : `in ${minutes}m`;

  return {
    iso: target.toISOString(),
    label: `Next run ${label} (${day} at ${at})`,
  };
}

export async function GET(req: Request) {
  const employer = parseEmployer(req.url);
  if (!employer)
    return NextResponse.json({ error: "employer required" }, { status: 400 });

  const settings = await getSettings(employer);
  if (!settings.paymentSchedule)
    return NextResponse.json({ configured: false });

  const next = nextRunDate(settings.paymentSchedule);
  return NextResponse.json({
    configured: true,
    schedule: settings.paymentSchedule,
    next,
  });
}
