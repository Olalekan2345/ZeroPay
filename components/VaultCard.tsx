"use client";

import { useEffect, useState } from "react";
import {
  useAccount,
  useDeployContract,
  useSendTransaction,
  useWaitForTransactionReceipt,
  useSwitchChain,
  useBalance,
} from "wagmi";
import { formatEther, parseEther } from "viem";
import { PAYROLL_POOL_ABI } from "@/lib/abi/PayrollPool";
import { zgGalileo } from "@/lib/chain";
import { fmt0G, short } from "@/lib/format";

type Vault = {
  configured: boolean;
  hasCode?: boolean;
  address: `0x${string}` | null;
  employer?: string;
  tenantOwns?: boolean;
  balanceWei: string;
  error?: string;
};

type View = "main" | "deploy";

export default function VaultCard({ employer }: { employer: string }) {
  const [vault, setVault]           = useState<Vault | null>(null);
  const [amount, setAmount]         = useState("0.1");
  const [addrInput, setAddrInput]   = useState("");
  const [view, setView]             = useState<View>("main");
  const [msg, setMsg]               = useState<{ text: string; ok: boolean } | null>(null);
  const [deployMsg, setDeployMsg]   = useState<{ text: string; ok: boolean } | null>(null);
  const [savingAddr, setSavingAddr] = useState(false);

  const { address, chainId }                          = useAccount();
  const { switchChainAsync, isPending: switching }    = useSwitchChain();
  const { sendTransactionAsync, isPending: sending }  = useSendTransaction();
  const { deployContractAsync, isPending: deploying } = useDeployContract();
  const [txHash, setTxHash]         = useState<`0x${string}` | undefined>();
  const [deployTxHash, setDeployTxHash] = useState<`0x${string}` | undefined>();

  const { isLoading: confirming, isSuccess } =
    useWaitForTransactionReceipt({ hash: txHash });
  const { isLoading: deployConfirming, isSuccess: deploySuccess, data: deployReceipt } =
    useWaitForTransactionReceipt({ hash: deployTxHash });

  const { data: walletBalance } = useBalance({ address, chainId: zgGalileo.id });
  const onWrongNetwork = !!address && chainId !== zgGalileo.id;

  async function refresh() {
    const r = await fetch(`/api/pool?employer=${employer}`, { cache: "no-store" });
    const v = await r.json();
    setVault(v);
    if (v.address) setAddrInput(v.address);
  }

  useEffect(() => { refresh(); }, [employer]);

  useEffect(() => {
    if (isSuccess) {
      refresh();
      setMsg({ text: "Confirmed ✓ Vault balance updated.", ok: true });
    }
  }, [isSuccess]);

  useEffect(() => {
    if (deploySuccess && deployReceipt?.contractAddress) {
      const addr = deployReceipt.contractAddress;
      setDeployMsg({ text: `Vault deployed at ${addr} — saving…`, ok: true });
      saveAddress(addr).then(() => {
        setDeployMsg({ text: `Secured Vault deployed & saved: ${short(addr)}`, ok: true });
        setView("main");
        refresh();
      });
    }
  }, [deploySuccess, deployReceipt]);

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

  async function saveAddress(addr: `0x${string}`) {
    setSavingAddr(true);
    try {
      const res = await fetch(`/api/settings?employer=${employer}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ poolAddress: addr }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "failed");
    } finally {
      setSavingAddr(false);
    }
  }

  async function saveManualAddress() {
    setSavingAddr(true); setMsg(null);
    try {
      if (!/^0x[a-fA-F0-9]{40}$/.test(addrInput.trim()))
        throw new Error("Invalid contract address.");
      await saveAddress(addrInput.trim() as `0x${string}`);
      await refresh();
      setMsg({ text: "Vault address saved.", ok: true });
    } catch (e) {
      setMsg({ text: (e as Error).message, ok: false });
    } finally { setSavingAddr(false); }
  }

  async function fund() {
    if (!vault?.address) return;
    setMsg(null);
    try {
      const val = parseEther(amount || "0");
      if (val === 0n) throw new Error("Enter an amount greater than 0.");
      if (walletBalance && val > walletBalance.value)
        throw new Error(
          `Insufficient balance. Wallet has ${parseFloat(formatEther(walletBalance.value)).toFixed(4)} 0G, need ${amount} 0G.`,
        );
      const ok = await ensureNetwork();
      if (!ok) return;
      const hash = await sendTransactionAsync({
        to:      vault.address,
        value:   val,
        chainId: zgGalileo.id,
        gas:     60_000n,
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

  async function serverWithdraw(amountEther: string) {
    const res = await fetch(`/api/pool/transact?employer=${employer}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "withdraw", amount: amountEther }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Withdrawal failed");
    return json.txHash as `0x${string}`;
  }

  async function withdraw() {
    if (!vault?.address) return;
    setMsg(null);
    try {
      const n = parseFloat(amount || "0");
      if (!n || n <= 0) throw new Error("Enter an amount greater than 0.");
      setMsg({ text: "Withdrawing via server wallet…", ok: true });
      const hash = await serverWithdraw(amount);
      setTxHash(hash);
      setMsg({ text: "Withdrawal sent — waiting for confirmation…", ok: true });
    } catch (e) {
      setMsg({ text: (e as Error).message, ok: false });
    }
  }

  async function drainVault() {
    if (!vault?.address || !vault.balanceWei || vault.balanceWei === "0") return;
    setMsg(null);
    try {
      const etherAmt = formatEther(BigInt(vault.balanceWei));
      setMsg({ text: "Emptying old vault via server wallet…", ok: true });
      const hash = await serverWithdraw(etherAmt);
      setTxHash(hash);
      setMsg({ text: "Vault emptied — waiting for confirmation…", ok: true });
    } catch (e) {
      setMsg({ text: (e as Error).message, ok: false });
    }
  }

  async function deployVault() {
    setDeployMsg(null);
    try {
      const ok = await ensureNetwork();
      if (!ok) return;
      const r = await fetch(`/api/deploy-pool/bytecode?employer=${employer}`);
      if (!r.ok) throw new Error((await r.json()).error ?? "Bytecode not available. Run: npm run compile");
      const { bytecode, operatorAddress } = await r.json();
      const operator = (operatorAddress ?? address) as `0x${string}`;
      setDeployMsg({ text: "Deploying vault — confirm in your wallet…", ok: true });
      const hash = await deployContractAsync({
        abi:     PAYROLL_POOL_ABI,
        bytecode,
        args:    [address as `0x${string}`, operator],
        chainId: zgGalileo.id,
        gas:     1_500_000n,
      });
      setDeployTxHash(hash);
      setDeployMsg({ text: "Deployment sent — waiting for confirmation…", ok: true });
    } catch (e) {
      const m = (e as Error).message ?? "";
      if (/user rejected|user cancel|user denied/i.test(m))
        setDeployMsg({ text: "Cancelled.", ok: false });
      else
        setDeployMsg({ text: m, ok: false });
    }
  }

  const busy     = sending || confirming || switching;
  const isOwner  = address && vault?.employer &&
    address.toLowerCase() === vault.employer.toLowerCase();
  const hasBalance = vault && BigInt(vault.balanceWei ?? "0") > 0n;

  /* ─── Deploy view ─── */
  if (view === "deploy") {
    return (
      <div className="card p-6 dark:bg-gray-900 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">🔐</span>
              <span className="text-base font-semibold dark:text-white">Deploy new Secured Vault</span>
            </div>
            <div className="text-xs text-ink-500 dark:text-gray-400 mt-1">
              A new vault contract is deployed to 0G Galileo. Your wallet becomes the
              sole owner. The address is saved automatically.
            </div>
          </div>
          <button onClick={() => setView("main")} className="btn-ghost text-xs">← Back</button>
        </div>

        {onWrongNetwork && (
          <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-3 flex items-center justify-between gap-3">
            <p className="text-xs text-amber-800 dark:text-amber-300 font-medium">Switch to 0G Galileo first.</p>
            <button onClick={ensureNetwork} disabled={switching} className="btn text-xs bg-amber-600 text-white hover:bg-amber-700">
              {switching ? "Switching…" : "Switch / Add 0G"}
            </button>
          </div>
        )}

        {vault?.configured && hasBalance && isOwner && (
          <div className="rounded-xl bg-slate-50 dark:bg-gray-800 border border-slate-100 dark:border-gray-700 p-4 space-y-2">
            <div className="text-xs font-semibold dark:text-white">
              Current vault has {fmt0G(vault.balanceWei)} — withdraw before replacing
            </div>
            <button onClick={drainVault} disabled={busy} className="btn-ghost text-xs">
              {busy ? "Withdrawing…" : `Withdraw all ${fmt0G(vault.balanceWei)}`}
            </button>
            {msg && <p className={`text-xs ${msg.ok ? "text-brand-600" : "text-red-500"}`}>{msg.text}</p>}
          </div>
        )}

        <div className="rounded-xl bg-slate-50 dark:bg-gray-800 border border-slate-100 dark:border-gray-700 p-4 space-y-3">
          <div className="text-xs text-ink-500 dark:text-gray-400">
            Deploys <span className="font-mono font-semibold">PayrollPool.sol</span> as your
            Secured Vault on 0G Galileo. Gas cost ~0.001–0.01 0G.
          </div>
          <button
            onClick={deployVault}
            disabled={deploying || deployConfirming || onWrongNetwork}
            className="btn-primary"
          >
            {deploying ? "Confirm in wallet…" : deployConfirming ? "Confirming…" : "Deploy Secured Vault"}
          </button>
          {deployTxHash && (
            <p className="font-mono text-xs text-ink-400 dark:text-gray-500 break-all">Tx: {deployTxHash}</p>
          )}
          {deployMsg && (
            <p className={`text-xs font-medium ${deployMsg.ok ? "text-brand-700 dark:text-brand-400" : "text-red-500"}`}>
              {deployMsg.text}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <div className="text-xs font-medium dark:text-gray-300">Or link an existing vault address</div>
          <div className="flex gap-2">
            <input
              value={addrInput}
              onChange={(e) => setAddrInput(e.target.value)}
              className="input font-mono text-xs flex-1"
              placeholder="0x…"
            />
            <button onClick={saveManualAddress} disabled={savingAddr} className="btn-primary text-xs">
              {savingAddr ? "Saving…" : "Use this address"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ─── Main view ─── */
  return (
    <div className="card p-6 bg-gradient-to-br from-indigo-50 via-white to-white
        dark:from-indigo-950/30 dark:via-gray-900 dark:to-gray-900">

      {onWrongNetwork && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl
            bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-3">
          <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
            Wrong network — switch to <strong>0G Galileo</strong> (chain {zgGalileo.id}) to transact.
          </p>
          <button onClick={ensureNetwork} disabled={switching}
            className="btn text-xs bg-amber-600 text-white hover:bg-amber-700 flex-shrink-0">
            {switching ? "Switching…" : "Switch / Add 0G"}
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-lg">🔐</span>
            <div className="text-xs uppercase tracking-wide font-semibold text-indigo-600 dark:text-indigo-400">
              Secured Vault Balance
            </div>
          </div>
          <div className="mt-1 text-4xl font-bold tracking-tight dark:text-white">
            {vault?.configured ? fmt0G(vault.balanceWei) : "—"}
          </div>
          {vault?.configured && vault.address && (
            <div className="mt-1 text-xs text-ink-500 dark:text-gray-400 space-y-0.5">
              <div>
                Vault: <span className="font-mono">{short(vault.address)}</span>
                {vault.employer && <> · Owner: <span className="font-mono">{short(vault.employer)}</span></>}
                {vault.tenantOwns === false && (
                  <span className="ml-2 pill bg-amber-100 text-amber-700">not your wallet</span>
                )}
              </div>
              {walletBalance && (
                <div>
                  Wallet balance: <span className="font-medium">
                    {parseFloat(formatEther(walletBalance.value)).toFixed(4)} 0G
                  </span>
                </div>
              )}
            </div>
          )}
          {!vault?.configured && (
            <p className="mt-1 text-xs text-ink-500 dark:text-gray-400">
              Deploy a new vault or paste an existing vault contract address to get started.
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <span className="pill bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">
            SECURED
          </span>
          <button
            onClick={() => { setView("deploy"); setDeployMsg(null); setMsg(null); }}
            className="btn-ghost text-xs whitespace-nowrap"
          >
            {vault?.configured ? "New vault ↗" : "Deploy vault ↗"}
          </button>
        </div>
      </div>

      {/* First-time: no vault configured */}
      {!vault?.configured && (
        <div className="mt-5 grid sm:grid-cols-[1fr_auto] gap-3 items-end">
          <div>
            <label className="label">Existing vault contract address</label>
            <input
              value={addrInput}
              onChange={(e) => setAddrInput(e.target.value)}
              className="input font-mono text-xs"
              placeholder="0x…"
            />
          </div>
          <button onClick={saveManualAddress} disabled={savingAddr} className="btn-primary">
            {savingAddr ? "Saving…" : "Link vault"}
          </button>
        </div>
      )}

      {/* No-code warning */}
      {vault?.configured && vault.hasCode === false && (
        <div className="mt-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 space-y-2">
          <p className="text-xs font-semibold text-red-700 dark:text-red-400">
            No contract found at {short(vault.address!)}
          </p>
          <p className="text-xs text-red-600 dark:text-red-500">
            This address has no code on 0G Galileo. Click <strong>New vault ↗</strong> to
            deploy a fresh Secured Vault, or paste the correct address.
          </p>
        </div>
      )}

      {/* Fund / withdraw */}
      {vault?.configured && vault.hasCode !== false && (
        <div className="mt-5 space-y-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[140px]">
              <label className="label">Amount (0G tokens)</label>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="input"
                inputMode="decimal"
                placeholder="0.1"
              />
            </div>
            <button onClick={fund} disabled={busy || onWrongNetwork} className="btn-primary">
              {switching  ? "Switching…" :
               sending    ? "Confirm in Rabby…" :
               confirming ? "Confirming…" : "Fund vault"}
            </button>
            <button
              onClick={withdraw}
              disabled={busy || !isOwner}
              className="btn-ghost"
              title={isOwner ? "Withdraw tokens from vault" : "Only the vault owner can withdraw"}
            >
              Withdraw
            </button>
          </div>
          <p className="text-xs text-ink-400 dark:text-gray-500">
            Salaries are paid exclusively from vault funds — your personal wallet is never touched.
            Any employer can fund the vault; only the owner can withdraw.
          </p>
        </div>
      )}

      {msg && (
        <p className={`mt-3 text-xs font-medium ${msg.ok ? "text-indigo-700 dark:text-indigo-400" : "text-red-500"}`}>
          {msg.text}
        </p>
      )}
      {txHash && (
        <p className="mt-1 font-mono text-xs text-ink-400 dark:text-gray-500 break-all">
          Tx: {txHash}
        </p>
      )}
    </div>
  );
}
