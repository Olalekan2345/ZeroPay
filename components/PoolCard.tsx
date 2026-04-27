"use client";

import { useEffect, useState } from "react";
import {
  useAccount,
  useSendTransaction,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
} from "wagmi";
import { parseEther } from "viem";
import { zgGalileo } from "@/lib/chain";
import { PAYROLL_POOL_ABI } from "@/lib/abi/PayrollPool";
import { fmt0G, tokenToUSD } from "@/lib/format";
import { use0GPrice } from "@/lib/usePrice";

type PoolInfo = {
  configured: boolean;
  hasCode?: boolean;
  address: `0x${string}` | null;
  balanceWei: string;
  error?: string;
};

export default function PoolCard({ employer }: { employer: string }) {
  const [pool, setPool]           = useState<PoolInfo | null>(null);
  const [amount, setAmount]       = useState("0.1");
  const [deploying, setDeploying] = useState(false);
  const [msg, setMsg]             = useState<{ text: string; ok: boolean } | null>(null);
  const [pendingTx, setPendingTx] = useState<`0x${string}` | undefined>();
  const price                     = use0GPrice();

  const { chainId }                                    = useAccount();
  const { switchChainAsync, isPending: switching }     = useSwitchChain();
  const { sendTransactionAsync, isPending: sending }   = useSendTransaction();
  const { writeContractAsync, isPending: writing }     = useWriteContract();
  const { isLoading: confirming, isSuccess: confirmed } =
    useWaitForTransactionReceipt({ hash: pendingTx });

  async function refresh() {
    const r = await fetch(`/api/pool?employer=${employer}`, { cache: "no-store" });
    setPool(await r.json());
  }

  useEffect(() => { refresh(); }, [employer]);

  useEffect(() => {
    if (confirmed) {
      refresh();
      setMsg({ text: "Confirmed — pool balance updated.", ok: true });
    }
  }, [confirmed]);

  async function ensureNetwork(): Promise<boolean> {
    if (chainId === zgGalileo.id) return true;
    try {
      await switchChainAsync({ chainId: zgGalileo.id });
      return true;
    } catch {
      try {
        await (window as any).ethereum?.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId:           `0x${zgGalileo.id.toString(16)}`,
            chainName:         zgGalileo.name,
            nativeCurrency:    { name: "0G", symbol: "0G", decimals: 18 },
            rpcUrls:           [zgGalileo.rpcUrls.default.http[0]],
            blockExplorerUrls: [zgGalileo.blockExplorers.default.url],
          }],
        });
        await switchChainAsync({ chainId: zgGalileo.id });
        return true;
      } catch (e) {
        setMsg({ text: `Cannot switch to 0G Galileo: ${(e as Error).message}`, ok: false });
        return false;
      }
    }
  }

  async function deposit() {
    if (!pool?.address) return;
    setMsg(null);
    const n = parseFloat(amount);
    if (!n || n <= 0) { setMsg({ text: "Enter an amount greater than 0.", ok: false }); return; }
    const ok = await ensureNetwork();
    if (!ok) return;
    try {
      // Plain ETH transfer → triggers receive() on the contract
      const hash = await sendTransactionAsync({
        to:      pool.address,
        value:   parseEther(amount),
        chainId: zgGalileo.id,
        gas:     60_000n,
      });
      setPendingTx(hash);
      setMsg({ text: "Deposit sent — waiting for confirmation…", ok: true });
    } catch (e) {
      const m = (e as Error).message ?? "";
      if (/rejected|cancel|denied/i.test(m)) setMsg({ text: "Cancelled.", ok: false });
      else setMsg({ text: m, ok: false });
    }
  }

  async function withdraw() {
    if (!pool?.address) return;
    setMsg(null);
    const n = parseFloat(amount);
    if (!n || n <= 0) { setMsg({ text: "Enter an amount greater than 0.", ok: false }); return; }
    const ok = await ensureNetwork();
    if (!ok) return;
    try {
      const hash = await writeContractAsync({
        address:      pool.address,
        abi:          PAYROLL_POOL_ABI,
        functionName: "withdraw",
        args:         [parseEther(amount)],
        chainId:      zgGalileo.id,
        gas:          100_000n,
      });
      setPendingTx(hash);
      setMsg({ text: "Withdrawal sent — waiting for confirmation…", ok: true });
    } catch (e) {
      const m = (e as Error).message ?? "";
      if (/rejected|cancel|denied/i.test(m)) setMsg({ text: "Cancelled.", ok: false });
      else setMsg({ text: m, ok: false });
    }
  }

  async function deployContract() {
    setMsg(null);
    setDeploying(true);
    try {
      const res  = await fetch(`/api/deploy-pool?employer=${employer}`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Deploy failed");
      setMsg({ text: `Contract deployed at ${json.address}`, ok: true });
      await refresh();
    } catch (e) {
      setMsg({ text: (e as Error).message, ok: false });
    } finally {
      setDeploying(false);
    }
  }

  const balance     = pool ? BigInt(pool.balanceWei ?? "0") : 0n;
  const balanceEth  = Number(balance) / 1e18;
  const busy        = sending || writing || confirming || switching;
  const onWrongChain = !!chainId && chainId !== zgGalileo.id;

  return (
    <div className="card p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide font-semibold text-ink-500 dark:text-gray-400">
            Payroll Pool
          </div>
          <div className="text-4xl font-bold tracking-tight mt-1 dark:text-white">
            {pool?.configured ? fmt0G(pool.balanceWei) : "—"}
          </div>
          {pool?.configured && price && (
            <div className="text-sm text-ink-400 dark:text-gray-500 mt-0.5">
              ≈{tokenToUSD(balanceEth, price)}
            </div>
          )}
          {pool?.address && (
            <div className="text-xs text-ink-400 dark:text-gray-500 font-mono mt-1 break-all">
              {pool.address}
            </div>
          )}
        </div>
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-500 to-emerald-600
            flex items-center justify-center flex-shrink-0">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
      </div>

      {/* Wrong network */}
      {onWrongChain && (
        <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
            Switch to <strong>0G Galileo (chain {zgGalileo.id})</strong> to transact.
          </p>
          <button onClick={ensureNetwork} disabled={switching}
            className="btn text-xs bg-amber-600 text-white hover:bg-amber-700 flex-shrink-0">
            {switching ? "Switching…" : "Switch network"}
          </button>
        </div>
      )}

      {/* No contract yet */}
      {!pool?.configured && (
        <div className="rounded-xl border border-dashed border-slate-200 dark:border-gray-700 p-5 space-y-3">
          <div>
            <p className="text-sm font-medium dark:text-white">No payroll contract yet</p>
            <p className="text-xs text-ink-500 dark:text-gray-400 mt-0.5">
              Deploy a dedicated SecuredVault contract for your business. Your wallet becomes
              the owner; the platform handles payroll execution.
            </p>
          </div>
          <button onClick={deployContract} disabled={deploying} className="btn-primary">
            {deploying ? "Deploying — please wait…" : "Deploy payroll contract"}
          </button>
        </div>
      )}

      {/* Bad address */}
      {pool?.configured && pool.hasCode === false && (
        <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 space-y-3">
          <p className="text-xs font-semibold text-red-700 dark:text-red-400">No contract found at this address.</p>
          <button onClick={deployContract} disabled={deploying} className="btn-primary text-xs">
            {deploying ? "Deploying…" : "Deploy new contract"}
          </button>
        </div>
      )}

      {/* Deposit / Withdraw */}
      {pool?.configured && pool.hasCode !== false && (
        <div className="space-y-3">
          <div>
            <label className="label">Amount (0G tokens)</label>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="input"
              inputMode="decimal"
              placeholder="0.1"
              disabled={busy}
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={deposit}
              disabled={busy || onWrongChain}
              className="btn-primary flex-1"
            >
              {switching   ? "Switching…"        :
               sending     ? "Confirm in Rabby…" :
               confirming  ? "Confirming…"       : "Deposit"}
            </button>
            <button
              onClick={withdraw}
              disabled={busy || onWrongChain || balance === 0n}
              className="btn-ghost flex-1"
            >
              {writing    ? "Confirm in Rabby…" :
               confirming ? "Confirming…"       : "Withdraw"}
            </button>
          </div>

          <p className="text-xs text-ink-400 dark:text-gray-500">
            Both operations open a Rabby confirmation popup before anything is sent.
          </p>
        </div>
      )}

      {/* Feedback */}
      {msg && (
        <p className={`text-xs font-medium break-all ${msg.ok ? "text-brand-600 dark:text-brand-400" : "text-red-500"}`}>
          {msg.text}
        </p>
      )}
      {pendingTx && !confirmed && (
        <p className="font-mono text-xs text-ink-300 dark:text-gray-600 break-all">Tx: {pendingTx}</p>
      )}
    </div>
  );
}
