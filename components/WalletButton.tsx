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
        className="btn-primary ml-1 px-5 py-2 rounded-xl text-sm"
      >
        {isPending ? "Connecting…" : "Connect wallet"}
      </button>
    );
  }

  const wrongNet = chainId !== zgGalileo.id;
  return (
    <div className="flex items-center gap-2 ml-1">
      {wrongNet && (
        <button
          className="btn-ghost text-xs px-3 py-1.5"
          onClick={() => switchChain({ chainId: zgGalileo.id })}
        >
          Switch to 0G
        </button>
      )}
      <span
        className="pill font-mono text-xs"
        style={{
          color: "var(--c-primary)",
          background: "rgba(146,0,225,0.08)",
          border: "1px solid var(--c-border-s)",
        }}
        title={address}
      >
        {short(address)}
      </span>
      <button onClick={() => disconnect()} className="btn-ghost text-xs px-3 py-1.5">
        Disconnect
      </button>
    </div>
  );
}
