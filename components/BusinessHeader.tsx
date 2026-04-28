"use client";

import { useEffect, useState } from "react";
import { short } from "@/lib/format";
import ShareLink from "./ShareLink";

export default function BusinessHeader({ employer }: { employer: string }) {
  const [name, setName]       = useState("");
  const [saved, setSaved]     = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving]   = useState(false);

  async function load() {
    const r = await fetch(`/api/settings?employer=${employer}`, { cache: "no-store" });
    const s = await r.json();
    setName(s.businessName ?? "");
    setSaved(s.businessName ?? "");
  }
  useEffect(() => { load(); }, [employer]);

  async function save() {
    setSaving(true);
    await fetch(`/api/settings?employer=${employer}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ businessName: name }),
    });
    setSaved(name);
    setEditing(false);
    setSaving(false);
  }

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--c-fg)" }}>
          {saved || "My Business"}
        </h1>
        <p className="text-sm mt-1 flex items-center gap-1.5" style={{ color: "var(--c-muted)" }}>
          <span
            className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ background: "linear-gradient(135deg, #9200e1, #dd23bb)" }}
          />
          Employer tenant ·{" "}
          <span className="font-mono" style={{ color: "var(--c-muted)" }}>{short(employer)}</span>
        </p>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <ShareLink employer={employer} />

        {editing ? (
          <div className="flex gap-2">
            <input
              className="input w-44 text-sm"
              placeholder="Business name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
              autoFocus
            />
            <button onClick={save} disabled={saving} className="btn-primary text-xs px-3 py-1.5">
              {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={() => setEditing(false)} className="btn-ghost text-xs px-3 py-1.5">
              Cancel
            </button>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} className="btn-ghost text-xs px-3 py-1.5">
            {saved ? "Rename" : "Name business"}
          </button>
        )}
      </div>
    </div>
  );
}
