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
        {/* Prevent flash of wrong theme */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var t = localStorage.getItem('theme');
                var d = t ? t === 'dark'
                  : window.matchMedia('(prefers-color-scheme: dark)').matches;
                if (d) document.documentElement.classList.add('dark');
              } catch(e){}
            `,
          }}
        />
      </head>
      <body className="dark:bg-gray-950 dark:text-gray-100">
        <Providers>
          <header className="sticky top-0 z-30 backdrop-blur border-b
            bg-white/90 border-slate-100
            dark:bg-gray-900/90 dark:border-gray-800">
            <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
              <Link href="/" className="flex items-center gap-2 font-semibold dark:text-white">
                <span className="inline-block w-6 h-6 rounded-lg bg-gradient-to-br from-brand-500 to-emerald-700 flex-shrink-0" />
                ZeroPay
                <span className="pill bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300 ml-1">
                  0G Galileo
                </span>
              </Link>
              <nav className="flex items-center gap-1 text-sm">
                <Link href="/employer"
                  className="px-3 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-800 dark:text-gray-200">
                  Employer
                </Link>
                <Link href="/employee"
                  className="px-3 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-800 dark:text-gray-200">
                  Employee
                </Link>
                <ThemeToggle />
                <WalletButton />
              </nav>
            </div>
          </header>

          <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>

          <footer className="max-w-6xl mx-auto px-6 py-10 text-xs text-ink-500 dark:text-gray-500">
            ZeroPay — records on 0G Storage · payments from an employer-funded pool on 0G Galileo testnet.
          </footer>
        </Providers>
      </body>
    </html>
  );
}
