import type {
  AttendanceEntry,
  Employee,
  PayrollLine,
  PayrollReport,
} from "./types";
import { parseEther } from "viem";

/**
 * ZeroPay rule-based AI agent.
 *
 * Rules enforced:
 *   - Workdays Monday..Friday only (weekend clips to zero).
 *   - Work window 09:00..17:00 local time. Clock-ins before 9 count from 9.
 *     Clock-outs after 17 do not earn additional pay.
 *   - Hard cap of 8 paid hours per day per employee.
 *   - Unfinished clock-outs are ignored for pay (marked as warning).
 *
 * The agent is deterministic: same attendance in => same report out. That is
 * what makes "AI payroll" trustworthy on-chain.
 */

export const WORK_START_HOUR = 9;
export const WORK_END_HOUR = 17;
export const MAX_DAILY_HOURS = 8;
const MS_PER_HOUR = 60 * 60 * 1000;

export function weekBounds(reference: Date = new Date()) {
  const d = new Date(reference);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { weekStart: monday.getTime(), weekEnd: sunday.getTime() };
}

export function previousWeekBounds(reference: Date = new Date()) {
  const d = new Date(reference);
  d.setDate(d.getDate() - 7);
  return weekBounds(d);
}

export function dayBounds(reference: Date = new Date()) {
  const d = new Date(reference);
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const end = new Date(d);
  end.setHours(23, 59, 59, 999);
  return { weekStart: start.getTime(), weekEnd: end.getTime() };
}

export function previousDayBounds(reference: Date = new Date()) {
  const d = new Date(reference);
  d.setDate(d.getDate() - 1);
  return dayBounds(d);
}

export function monthBounds(reference: Date = new Date()) {
  const d = new Date(reference);
  const start = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
  const end   = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
  return { weekStart: start.getTime(), weekEnd: end.getTime() };
}

export function previousMonthBounds(reference: Date = new Date()) {
  const d = new Date(reference);
  d.setMonth(d.getMonth() - 1);
  return monthBounds(d);
}

/** Compute paid hours for a single attendance entry after applying rules. */
export function paidHoursForEntry(entry: AttendanceEntry): number {
  if (!entry.clockOut) return 0;
  const inD = new Date(entry.clockIn);
  const outD = new Date(entry.clockOut);

  // Weekend
  const dow = inD.getDay();
  if (dow === 0 || dow === 6) return 0;

  // Different calendar day — only count the clock-in day window for simplicity.
  const dayStart = new Date(inD);
  dayStart.setHours(WORK_START_HOUR, 0, 0, 0);
  const dayEnd = new Date(inD);
  dayEnd.setHours(WORK_END_HOUR, 0, 0, 0);

  const effectiveIn = Math.max(inD.getTime(), dayStart.getTime());
  const effectiveOut = Math.min(outD.getTime(), dayEnd.getTime());
  if (effectiveOut <= effectiveIn) return 0;

  const hours = (effectiveOut - effectiveIn) / MS_PER_HOUR;
  return Math.min(hours, MAX_DAILY_HOURS);
}

/** Sum paid hours across entries, re-capping per calendar day. */
export function paidHoursInRange(
  entries: AttendanceEntry[],
  rangeStart: number,
  rangeEnd: number,
): number {
  const perDay = new Map<string, number>();
  for (const e of entries) {
    if (e.clockIn < rangeStart || e.clockIn > rangeEnd) continue;
    const h = paidHoursForEntry(e);
    if (h <= 0) continue;
    const key = new Date(e.clockIn).toISOString().slice(0, 10);
    perDay.set(key, (perDay.get(key) ?? 0) + h);
  }
  let total = 0;
  for (const [, h] of perDay) total += Math.min(h, MAX_DAILY_HOURS);
  return total;
}

export type BuildReportInput = {
  employees: Employee[];
  attendance: AttendanceEntry[];
  poolBalanceWei: bigint;
  now?: Date;
  weekOffset?: number;   // 0 = current, -1 = previous
  period?: "daily" | "weekly" | "monthly";
};

export function buildReport(input: BuildReportInput): PayrollReport {
  const now    = input.now ?? new Date();
  const period = input.period ?? "weekly";
  const offset = input.weekOffset ?? 0;

  let bounds: { weekStart: number; weekEnd: number };
  if (period === "daily") {
    bounds = offset === -1 ? previousDayBounds(now) : dayBounds(now);
  } else if (period === "monthly") {
    bounds = offset === -1 ? previousMonthBounds(now) : monthBounds(now);
  } else {
    bounds = offset === -1 ? previousWeekBounds(now) : weekBounds(now);
  }

  const warnings: string[] = [];
  const openClockIns = input.attendance.filter((a) => !a.clockOut).length;
  if (openClockIns > 0) {
    warnings.push(
      `${openClockIns} open clock-in(s) not counted — clock them out to include in payroll.`,
    );
  }

  const lines: PayrollLine[] = input.employees.map((emp) => {
    const hours = paidHoursInRange(
      input.attendance.filter((a) => a.employeeId === emp.id),
      bounds.weekStart,
      bounds.weekEnd,
    );
    const rounded = Math.round(hours * 100) / 100;
    const amount = Math.round(rounded * emp.hourlyRate * 1e6) / 1e6;
    const amountWei =
      amount > 0 ? parseEther(amount.toFixed(6)).toString() : "0";
    return {
      employeeId: emp.id,
      employeeName: emp.name,
      wallet: emp.wallet,
      hoursWorked: rounded,
      hourlyRate: emp.hourlyRate,
      amount,
      amountWei,
    };
  });

  const totalPaidWei = lines.reduce((a, l) => a + BigInt(l.amountWei), 0n);
  const totalPaid =
    lines.reduce((a, l) => a + l.amount, 0) /* float sum for display */;
  const sufficient = totalPaidWei <= input.poolBalanceWei;
  if (!sufficient) {
    warnings.push(
      "Payroll pool is underfunded for this week. Top up before running payments.",
    );
  }

  return {
    weekStart: bounds.weekStart,
    weekEnd: bounds.weekEnd,
    generatedAt: now.getTime(),
    lines,
    totalPaid: Math.round(totalPaid * 1e6) / 1e6,
    totalPaidWei: totalPaidWei.toString(),
    poolBalanceWei: input.poolBalanceWei.toString(),
    sufficient,
    warnings,
  };
}

export function reportToCSV(r: PayrollReport): string {
  const head = [
    "employee",
    "wallet",
    "hours",
    "hourly_rate",
    "amount_0G",
    "amount_wei",
  ].join(",");
  const rows = r.lines.map((l) =>
    [
      JSON.stringify(l.employeeName),
      l.wallet,
      l.hoursWorked,
      l.hourlyRate,
      l.amount,
      l.amountWei,
    ].join(","),
  );
  const footer = `TOTAL,,,,${r.totalPaid},${r.totalPaidWei}`;
  return [head, ...rows, footer].join("\n");
}
