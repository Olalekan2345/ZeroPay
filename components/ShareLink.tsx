"use client";

import { useState } from "react";

export default function ShareLink() {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const link = `${window.location.origin}/employee`;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={copy}
      title="Copy employee portal link to share with your team"
      className={`btn text-xs font-medium transition-all ${
        copied
          ? "bg-brand-50 text-brand-700 border border-brand-200 dark:bg-brand-900/30 dark:text-brand-300"
          : "bg-slate-100 hover:bg-slate-200 text-ink-600 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-300"
      }`}
    >
      {copied ? (
        <span className="flex items-center gap-1.5">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          Copied!
        </span>
      ) : (
        <span className="flex items-center gap-1.5">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
            <polyline points="16 6 12 2 8 6"/>
            <line x1="12" y1="2" x2="12" y2="15"/>
          </svg>
          Share employee link
        </span>
      )}
    </button>
  );
}
