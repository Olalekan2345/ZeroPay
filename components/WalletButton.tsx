"use client";

import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { zgGalileo } from "@/lib/chain";

function short(a?: string) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
}

export default function WalletButton() {
  const { address, isConnected, chainId } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  if (!isConnected) {
    const injected = connectors[0];
    return (
      <button
        onClick={() => injected && connect({ connector: injected })}
        disabled={isPending}
        className="btn-primary ml-2"
      >
        {isPending ? "Connecting…" : "Connect wallet"}
      </button>
    );
  }

  const wrongNet = chainId !== zgGalileo.id;
  return (
    <div className="flex items-center gap-2 ml-2">
      {wrongNet && (
        <button className="btn-ghost text-xs" onClick={() => switchChain({ chainId: zgGalileo.id })}>
          Switch to 0G
        </button>
      )}
      <span className="pill bg-slate-100 dark:bg-gray-800 text-ink-900 dark:text-gray-200 font-mono" title={address}>
        {short(address)}
      </span>
      <button onClick={() => disconnect()} className="btn-ghost text-xs">
        Disconnect
      </button>
    </div>
  );
}
