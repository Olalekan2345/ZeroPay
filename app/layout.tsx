import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";
import Link from "next/link";
import WalletButton from "@/components/WalletButton";
import ThemeToggle from "@/components/ThemeToggle";

export const metadata: Metadata = {
  title: "ZeroPay — AI payroll on 0G",
  description:
    "AI-powered payroll agent on the 0G Galileo testnet. Track hours, store records on 0G Storage, pay your team automatically.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Google Fonts — Plus Jakarta Sans (closest to Regola Pro) + Geist Mono */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400&family=Geist+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        {/* Theme flash prevention */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}`,
          }}
        />
      </head>
      <body style={{ background: "var(--c-bg)", color: "var(--c-fg)" }}>
        <Providers>
          {/* Mascot watermark */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/mascot.jpg"
            alt=""
            aria-hidden="true"
            className="mascot-watermark"
          />

          {/* Header */}
          <header className="sticky top-0 z-30 border-b">
            <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between relative z-10">
              {/* Logo */}
              <Link href="/" className="flex items-center gap-2.5 group">
                <span
                  className="inline-flex w-7 h-7 rounded-lg items-center justify-center
                    text-white text-sm font-bold flex-shrink-0 shadow-glow"
                  style={{ background: "linear-gradient(135deg, #9200e1 0%, #dd23bb 100%)" }}
                >
                  Z
                </span>
                <span className="font-bold text-[var(--c-fg)]">ZeroPay</span>
                <span className="pill-purple hidden sm:inline-flex ml-0.5">
                  0G Galileo
                </span>
              </Link>

              {/* Nav */}
              <nav className="flex items-center gap-0.5 text-sm font-medium">
                <Link
                  href="/employer"
                  className="nav-link px-3 py-1.5 rounded-lg transition-all duration-150 hover:bg-[var(--c-bg-hover)]"
                >
                  Employer
                </Link>
                <Link
                  href="/employee"
                  className="nav-link px-3 py-1.5 rounded-lg transition-all duration-150 hover:bg-[var(--c-bg-hover)]"
                >
                  Employee
                </Link>
                <ThemeToggle />
                <div className="ml-1">
                  <WalletButton />
                </div>
              </nav>
            </div>
          </header>

          <main className="max-w-6xl mx-auto px-6 py-8 relative z-10">{children}</main>

          <footer
            className="max-w-6xl mx-auto px-6 py-10 text-xs border-t relative z-10"
            style={{ color: "var(--c-dim)", borderColor: "var(--c-border)" }}
          >
            ZeroPay — attendance &amp; payroll records on 0G Storage ·
            salary payments from employer-funded SecuredVault contracts on 0G Galileo testnet.
          </footer>
        </Providers>
      </body>
    </html>
  );
}
