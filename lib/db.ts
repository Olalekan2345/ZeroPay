import { Redis } from "@upstash/redis";
import type { Employee, AttendanceEntry, PayrollReport } from "./types";

export type PaymentSchedule = {
  frequency: "daily" | "weekly" | "monthly";
  hour: number;
  minute: number;
  dayOfWeek?: number;
  dayOfMonth?: number;
};

export type TenantSettings = {
  employer: string;
  businessName?: string;
  poolAddress?: `0x${string}`;
  paymentSchedule?: PaymentSchedule;
  createdAt: number;
};

export type EmployeeHit = {
  employer: string;
  settings: TenantSettings;
  employee: Employee;
  attendance: AttendanceEntry[];
  reports: PayrollReport[];
};

// ---------------------------------------------------------------------------
// Redis client — lazily initialised so missing env vars only blow up at
// runtime (not at import time during build).
// ---------------------------------------------------------------------------

let _redis: Redis | null = null;

function getRedis(): Redis {
  if (_redis) return _redis;
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error(
      "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set. " +
      "Create a free database at https://console.upstash.com and add the env vars.",
    );
  }
  _redis = new Redis({ url, token });
  return _redis;
}

// ---------------------------------------------------------------------------
// Key helpers
// ---------------------------------------------------------------------------

function normEmp(addr: string): string {
  if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) throw new Error("bad employer address");
  return addr.toLowerCase();
}

const K = {
  settings:   (emp: string) => `zp:t:${normEmp(emp)}:settings`,
  employees:  (emp: string) => `zp:t:${normEmp(emp)}:employees`,
  attendance: (emp: string) => `zp:t:${normEmp(emp)}:attendance`,
  reports:    (emp: string) => `zp:t:${normEmp(emp)}:reports`,
  opKey:      (emp: string) => `zp:t:${normEmp(emp)}:opkey`,
  tenants:    () => `zp:tenants`,
};

async function getJson<T>(key: string, fallback: T): Promise<T> {
  const val = await getRedis().get<T>(key);
  return val ?? fallback;
}

async function setJson(key: string, value: unknown) {
  await getRedis().set(key, JSON.stringify(value));
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function getSettings(employer: string): Promise<TenantSettings> {
  const existing = await getJson<TenantSettings | null>(K.settings(employer), null);
  if (existing) return existing;
  const fresh: TenantSettings = { employer: normEmp(employer), createdAt: Date.now() };
  await setJson(K.settings(employer), fresh);
  await getRedis().sadd(K.tenants(), normEmp(employer));
  return fresh;
}

export async function saveSettings(employer: string, patch: Partial<TenantSettings>) {
  const current = await getSettings(employer);
  const next = { ...current, ...patch, employer: normEmp(employer) };
  await setJson(K.settings(employer), next);
  await getRedis().sadd(K.tenants(), normEmp(employer));
  return next;
}

// ---------------------------------------------------------------------------
// Employees
// ---------------------------------------------------------------------------

export async function listEmployees(employer: string): Promise<Employee[]> {
  return getJson<Employee[]>(K.employees(employer), []);
}

export async function saveEmployees(employer: string, rows: Employee[]) {
  await setJson(K.employees(employer), rows);
  await getRedis().sadd(K.tenants(), normEmp(employer));
}

export async function upsertEmployee(employer: string, e: Employee) {
  const rows = await listEmployees(employer);
  const idx = rows.findIndex((r) => r.id === e.id);
  if (idx >= 0) rows[idx] = e; else rows.push(e);
  await saveEmployees(employer, rows);
}

export async function deleteEmployee(employer: string, id: string) {
  const rows = (await listEmployees(employer)).filter((r) => r.id !== id);
  await saveEmployees(employer, rows);
}

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

export async function listAttendance(employer: string): Promise<AttendanceEntry[]> {
  return getJson<AttendanceEntry[]>(K.attendance(employer), []);
}

export async function saveAttendance(employer: string, rows: AttendanceEntry[]) {
  await setJson(K.attendance(employer), rows);
}

export async function addAttendance(employer: string, entry: AttendanceEntry) {
  const rows = await listAttendance(employer);
  rows.push(entry);
  await saveAttendance(employer, rows);
}

export async function updateAttendance(employer: string, entry: AttendanceEntry) {
  const rows = await listAttendance(employer);
  const idx = rows.findIndex((r) => r.id === entry.id);
  if (idx >= 0) rows[idx] = entry; else rows.push(entry);
  await saveAttendance(employer, rows);
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export async function listReports(employer: string): Promise<PayrollReport[]> {
  return getJson<PayrollReport[]>(K.reports(employer), []);
}

export async function addReport(employer: string, r: PayrollReport) {
  const rows = await listReports(employer);
  rows.unshift(r);
  await setJson(K.reports(employer), rows.slice(0, 200));
}

// ---------------------------------------------------------------------------
// Cross-tenant lookups
// ---------------------------------------------------------------------------

export async function findEmployeeByWallet(wallet: string): Promise<EmployeeHit[]> {
  const w = wallet.toLowerCase();
  const tenants = await getRedis().smembers<string[]>(K.tenants());
  const hits: EmployeeHit[] = [];
  for (const employer of tenants) {
    const employees = await listEmployees(employer).catch(() => []);
    const match = employees.find((e) => e.wallet.toLowerCase() === w);
    if (!match) continue;
    const [attendance, reports, settings] = await Promise.all([
      listAttendance(employer),
      listReports(employer),
      getSettings(employer),
    ]);
    hits.push({
      employer,
      settings,
      employee: match,
      attendance: attendance.filter((a) => a.employeeId === match.id),
      reports,
    });
  }
  return hits;
}

export async function tenantExists(employer: string): Promise<boolean> {
  return getRedis().sismember(K.tenants(), normEmp(employer)).then((v) => v === 1);
}

// ---------------------------------------------------------------------------
// Operator key (legacy — kept for API compat, not actively used)
// ---------------------------------------------------------------------------

export async function getOperatorKey(employer: string): Promise<string | null> {
  return getJson<string | null>(K.opKey(employer), null);
}

export async function saveOperatorKey(employer: string, key: string) {
  await setJson(K.opKey(employer), key);
}
