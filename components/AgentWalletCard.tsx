"use client";

import { useEffect, useState } from "react";
import { useAccount, useSendTransaction, useWaitForTransactionReceipt, useSwitchChain, useBalance } from "wagmi";
import { parseEther, formatEther } from "viem";
import { zgGalileo } from "@/lib/chain";
import { fmt0G } from "@/lib/format";

type AgentWallet = { address: string; balanceWei: string };

export default function AgentWalletCard({ employer }: { employer: string }) {
  const [agent, setAgent]         = useState<AgentWallet | null>(null);
  const [amount, setAmount]       = useState("0.1");
  const [copied, setCopied]       = useState(false);
  const [msg, setMsg]             = useState<{ text: string; ok: boolean } | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const [txHash, setTxHash]       = useState<`0x${string}` | undefined>();

  const { address, chainId }                         = useAccount();
  const { switchChainAsync, isPending: switching }   = useSwitchChain();
  const { sendTransactionAsync, isPending: sending } = useSendTransaction();
  const { isLoading: confirming, isSuccess }         = useWaitForTransactionReceipt({ hash: txHash });
  const { data: walletBal }                          = useBalance({ address, chainId: zgGalileo.id });

  const onWrongNetwork = !!address && chainId !== zgGalileo.id;
  const busy = sending || confirming || switching || withdrawing;

  async function refresh() {
    const r = await fetch(`/api/agent-wallet?employer=${employer}`, { cache: "no-store" });
    setAgent(await r.json());
  }

  useEffect(() => { refresh(); }, [employer]);

  useEffect(() => {
    if (isSuccess) {
      refresh();
      setMsg({ text: "Confirmed ✓ Agent wallet balance updated.", ok: true });
    }
  }, [isSuccess]);

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

  async function copyAddress() {
    if (!agent?.address) return;
    await navigator.clipboard.writeText(agent.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function fund() {
    if (!agent?.address) return;
    setMsg(null);
    try {
      const val = parseEther(amount || "0");
      if (val === 0n) throw new Error("Enter an amount greater than 0.");
      if (walletBal && val > walletBal.value)
        throw new Error(
          `Insufficient balance. Wallet has ${parseFloat(formatEther(walletBal.value)).toFixed(4)} 0G.`,
        );
      const ok = await ensureNetwork();
      if (!ok) return;
      const hash = await sendTransactionAsync({
        to:      agent.address as `0x${string}`,
        value:   val,
        chainId: zgGalileo.id,
        gas:     21_000n,
      });
      setTxHash(hash);
      setMsg({ text: "Funding sent — waiting for confirmation…", ok: true });
    } catch (e) {
      const m = (e as Error).message ?? "";
      if (/user rejected|user cancel|user denied/i.test(m))
        setMsg({ text: "Cancelled.", ok: false });
      else
        setMsg({ text: m, ok: false });
    }
  }

  async function withdraw() {
    if (!agent?.address) return;
    setMsg(null);
    setWithdrawing(true);
    try {
      const n = parseFloat(amount || "0");
      if (!n || n <= 0) throw new Error("Enter an amount greater than 0.");
      setMsg({ text: "Withdrawing from agent wallet…", ok: true });
      const res = await fetch(`/api/agent-wallet/withdraw?employer=${employer}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Withdrawal failed");
      await refresh();
      setMsg({ text: `Withdrawn ✓  Tx: ${json.txHash}`, ok: true });
    } catch (e) {
      setMsg({ text: (e as Error).message, ok: false });
    } finally {
      setWithdrawing(false);
    }
  }

  const balance = agent ? BigInt(agent.balanceWei ?? "0") : 0n;

  return (
    <div className="card p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-widest font-semibold mb-1"
            style={{ color: "var(--c-dim)" }}>
            Agent Wallet Balance
          </div>
          <div className="text-4xl font-bold tracking-tight" style={{ color: "var(--c-fg)" }}>
            {agent ? fmt0G(agent.balanceWei) : "—"}
          </div>
          {walletBal && (
            <div className="text-xs mt-1" style={{ color: "var(--c-dim)" }}>
              Your wallet: {parseFloat(formatEther(walletBal.value)).toFixed(4)} 0G
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
              d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
      </div>

      {/* Agent wallet address */}
      {agent?.address && (
        <div className="rounded-xl px-4 py-3 space-y-1"
          style={{ background: "var(--c-bg-hover)", border: "1px solid var(--c-border)" }}>
          <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--c-dim)" }}>
            Agent wallet address
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs break-all flex-1" style={{ color: "var(--c-fg)" }}>
              {agent.address}
            </span>
            <button
              onClick={copyAddress}
              className="flex-shrink-0 text-xs px-2 py-1 rounded-lg transition-colors"
              style={{
                background: copied ? "var(--c-primary-glow)" : "var(--c-bg-card)",
                color: copied ? "var(--c-primary)" : "var(--c-muted)",
                border: "1px solid var(--c-border-s)",
              }}
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <p className="text-xs" style={{ color: "var(--c-dim)" }}>
            Send 0G tokens to this address to fund payroll. The AI agent uses this wallet to pay employees automatically.
          </p>
        </div>
      )}

      {/* Wrong network warning */}
      {onWrongNetwork && (
        <div className="rounded-xl border border-amber-500/25 px-4 py-3 flex items-center justify-between gap-3"
          style={{ background: "rgba(245,158,11,0.08)" }}>
          <p className="text-xs font-medium text-amber-400">
            Switch to <strong>0G Galileo (chain {zgGalileo.id})</strong> to fund from your wallet.
          </p>
          <button onClick={ensureNetwork} disabled={switching} className="btn-ghost text-xs flex-shrink-0">
            {switching ? "Switching…" : "Switch network"}
          </button>
        </div>
      )}

      {/* Fund / Withdraw */}
      {agent && (
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
              onClick={fund}
              disabled={busy || onWrongNetwork || !address}
              className="btn-primary flex-1"
              title={!address ? "Connect wallet to fund" : undefined}
            >
              {switching  ? "Switching…"        :
               sending    ? "Confirm in wallet…" :
               confirming ? "Confirming…"       : "Fund agent"}
            </button>
            <button
              onClick={withdraw}
              disabled={busy || balance === 0n}
              className="btn-ghost flex-1"
              title="Withdraw from agent wallet back to your employer address"
            >
              {withdrawing ? "Withdrawing…" : "Withdraw"}
            </button>
          </div>
          <p className="text-xs" style={{ color: "var(--c-dim)" }}>
            Salaries are paid directly from the agent wallet to each employee. Withdraw any time to recover unused funds.
          </p>
        </div>
      )}

      {msg && (
        <p className={`text-xs font-medium break-all ${msg.ok ? "" : "text-red-400"}`}
          style={msg.ok ? { color: "var(--c-primary)" } : undefined}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
