import { findEmployeeByWallet, getSettings } from "./db";
import { PAYROLL_POOL_ADDRESS } from "./chain";

export function parseEmployer(url: string): string | null {
  const { searchParams } = new URL(url);
  const e = searchParams.get("employer");
  return e && /^0x[a-fA-F0-9]{40}$/.test(e) ? e.toLowerCase() : null;
}

/**
 * Employer access guard. Rejects:
 *   - missing or malformed employer param
 *   - a wallet that is already registered as someone else's employee
 *     (employees cannot run their own payroll tenant)
 */
export async function requireEmployer(
  url: string,
): Promise<{ ok: true; employer: string } | { ok: false; status: number; error: string }> {
  const employer = parseEmployer(url);
  if (!employer) return { ok: false, status: 400, error: "employer required" };
  const hits = await findEmployeeByWallet(employer);
  if (hits.length > 0)
    return {
      ok: false,
      status: 403,
      error: "this wallet is registered as an employee and cannot run payroll",
    };
  return { ok: true, employer };
}

export async function resolvePoolAddress(
  employer: string,
): Promise<`0x${string}` | null> {
  const s = await getSettings(employer);
  return s.poolAddress ?? PAYROLL_POOL_ADDRESS ?? null;
}
