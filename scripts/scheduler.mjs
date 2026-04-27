#!/usr/bin/env node
/**
 * ZeroPay Automatic Payroll Scheduler
 *
 * Run alongside the Next.js server:
 *   npm run dev:full   (runs both together)
 *   npm run scheduler  (standalone)
 *
 * How it works:
 *   - Derives the employer address from EMPLOYER_PRIVATE_KEY in .env
 *   - Checks every minute whether the current time matches that tenant's
 *     configured payment schedule
 *   - When it matches, calls /api/payroll/run — which signs and executes
 *     payBatch on-chain, deducting salaries ONLY from the PayrollPool balance
 *   - Never touches the employer wallet balance beyond gas fees
 */
import cron from "node-cron";
import { ethers } from "ethers";
import "dotenv/config";

const BASE_URL   = process.env.ZEROPAY_BASE_URL ?? "http://localhost:3000";
const PK         = process.env.EMPLOYER_PRIVATE_KEY;

if (!PK) {
  console.error("[scheduler] EMPLOYER_PRIVATE_KEY not set — exiting.");
  process.exit(1);
}

/* Derive employer address from the private key */
const wallet   = new ethers.Wallet(PK.startsWith("0x") ? PK : "0x" + PK);
const employer  = wallet.address.toLowerCase();
console.log(`[scheduler] Watching tenant: ${employer}`);

/** Fetch the tenant's saved payment schedule from the API */
async function getSchedule() {
  try {
    const r = await fetch(`${BASE_URL}/api/settings?employer=${employer}`);
    if (!r.ok) return null;
    const s = await r.json();
    return s.paymentSchedule ?? null;
  } catch {
    return null;
  }
}

/** Track the last run so we don't double-fire in the same hour */
const lastRun = { daily: "", weekly: "", monthly: "" };

/** Format YYYY-MM-DD-HH so one run per hour per type */
function runKey(frequency) {
  const now = new Date();
  const stamp =
    `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}`;
  return `${frequency}-${stamp}`;
}

async function runPayroll(frequency) {
  const key = runKey(frequency);
  if (lastRun[frequency] === key) return; // already ran this hour
  lastRun[frequency] = key;

  /* For daily: pay for today's hours (offset=0)
     For weekly: pay for the current week's hours (offset=0)
     The agent aggregates hours within the period up to now. */
  const period = frequency;
  console.log(`[scheduler] ${new Date().toISOString()} — running ${frequency} payroll`);

  try {
    const res = await fetch(
      `${BASE_URL}/api/payroll/run?employer=${employer}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ weekOffset: 0, period }),
      },
    );
    const body = await res.json();

    if (!res.ok) {
      console.error(`[scheduler] Run failed (${res.status}):`, body.error ?? body);
      return;
    }
    if (body.txHash) {
      console.log(`[scheduler] ✓ Paid ${body.totalPaid} 0G — tx: ${body.txHash}`);
    } else if (body.warnings?.length) {
      console.warn(`[scheduler] Completed with warnings:`, body.warnings);
    } else {
      console.log(`[scheduler] Run complete — no payable hours or pool issue.`);
    }
  } catch (err) {
    console.error("[scheduler] Request error:", err.message);
  }
}

/* ── Tick every minute ── */
cron.schedule("* * * * *", async () => {
  const schedule = await getSchedule();
  if (!schedule) return;

  const now  = new Date();
  const hour = now.getHours();
  const min  = now.getMinutes();
  const dow  = now.getDay(); // 0=Sun … 6=Sat

  const schedMin = schedule.minute ?? 0;
  if (hour !== schedule.hour || min !== schedMin) return;

  if (schedule.frequency === "daily") {
    await runPayroll("daily");
  }

  if (schedule.frequency === "weekly" && dow === (schedule.dayOfWeek ?? 6)) {
    await runPayroll("weekly");
  }

  if (schedule.frequency === "monthly" && now.getDate() === (schedule.dayOfMonth ?? 1)) {
    await runPayroll("monthly");
  }
});

console.log("[scheduler] Running — checking every minute. Press Ctrl+C to stop.");
