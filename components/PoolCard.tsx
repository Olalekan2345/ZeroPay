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

  const { chainId }                                      = useAccount();
  const { switchChainAsync, isPending: switching }       = useSwitchChain();
  const { sendTransactionAsync, isPending: sending }     = useSendTransaction();
  const { writeContractAsync, isPending: writing }       = useWriteContract();
  const { isLoading: confirming, isSuccess: confirmed }  =
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

  const balance      = pool ? BigInt(pool.balanceWei ?? "0") : 0n;
  const balanceEth   = Number(balance) / 1e18;
  const busy         = sending || writing || confirming || switching;
  const onWrongChain = !!chainId && chainId !== zgGalileo.id;

  return (
    <div className="card p-6 space-y-6">
      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-widest font-medium mb-2" style={{ color: "var(--c-dim)" }}>
            Payroll Pool Balance
          </div>
          <div className="text-4xl font-bold tracking-tight" style={{ color: "var(--c-fg)" }}>
            {pool?.configured ? fmt0G(pool.balanceWei) : "—"}
          </div>
          {pool?.configured && price && (
            <div className="text-sm mt-1" style={{ color: "var(--c-dim)" }}>
              ≈ {tokenToUSD(balanceEth, price)}
            </div>
          )}
          {pool?.address && (
            <div className="font-mono text-xs mt-2 break-all" style={{ color: "var(--c-dim)" }}>
              {pool.address}
            </div>
          )}
        </div>

        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{
            background: "linear-gradient(135deg, #9200e1 0%, #dd23bb 100%)",
            boxShadow: "0 0 20px rgba(146,0,225,0.3)",
          }}
        >
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
      </div>

      {/* Wrong network banner */}
      {onWrongChain && (
        <div
          className="rounded-xl border border-amber-500/25 px-4 py-3 flex items-center justify-between gap-3"
          style={{ background: "rgba(245,158,11,0.08)" }}
        >
          <p className="text-xs font-medium text-amber-400">
            Switch to <strong>0G Galileo (chain {zgGalileo.id})</strong> to transact.
          </p>
          <button onClick={ensureNetwork} disabled={switching} className="btn-ghost text-xs flex-shrink-0">
            {switching ? "Switching…" : "Switch network"}
          </button>
        </div>
      )}

      {/* No contract yet */}
      {!pool?.configured && (
        <div
          className="rounded-xl border border-dashed p-5 space-y-4"
          style={{ borderColor: "var(--c-border-s)", background: "var(--c-bg-card)" }}
        >
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--c-fg)" }}>No payroll contract yet</p>
            <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--c-muted)" }}>
              Deploy a dedicated SecuredVault for your business. Your wallet becomes the owner;
              a fresh isolated operator key handles payroll execution.
            </p>
          </div>
          <button onClick={deployContract} disabled={deploying} className="btn-primary">
            {deploying ? "Deploying — please wait…" : "Deploy payroll contract"}
          </button>
        </div>
      )}

      {/* Bad contract address */}
      {pool?.configured && pool.hasCode === false && (
        <div
          className="rounded-xl border border-red-500/25 px-4 py-4 space-y-3"
          style={{ background: "rgba(239,68,68,0.06)" }}
        >
          <p className="text-xs font-semibold text-red-400">No contract found at saved address.</p>
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
            <button onClick={deposit} disabled={busy || onWrongChain} className="btn-primary flex-1">
              {switching  ? "Switching…"        :
               sending    ? "Confirm in wallet…" :
               confirming ? "Confirming…"       : "Deposit"}
            </button>
            <button
              onClick={withdraw}
              disabled={busy || onWrongChain || balance === 0n}
              className="btn-ghost flex-1"
            >
              {writing    ? "Confirm in wallet…" :
               confirming ? "Confirming…"       : "Withdraw"}
            </button>
          </div>

          <p className="text-xs" style={{ color: "var(--c-dim)" }}>
            Both operations require wallet confirmation before anything is sent.
          </p>
        </div>
      )}

      {/* Feedback */}
      {msg && (
        <p className={`text-xs font-medium break-all ${msg.ok ? "" : "text-red-400"}`}
          style={msg.ok ? { color: "var(--c-primary)" } : undefined}>
          {msg.text}
        </p>
      )}
      {pendingTx && !confirmed && (
        <p className="font-mono text-xs break-all" style={{ color: "var(--c-dim)" }}>Tx: {pendingTx}</p>
      )}
    </div>
  );
}
