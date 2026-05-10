import type { ReactNode } from "react";
import Navbar from "./Navbar";
import SecudityMark from "./SecudityMark";
import TestnetBanner from "./TestnetBanner";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <TestnetBanner />
      <Navbar />
      <main className="flex-1 w-full max-w-6xl mx-auto px-5 py-8">
        {children}
      </main>
      <footer className="border-t border-line/60 mt-10">
        <div className="max-w-6xl mx-auto px-5 py-6 flex flex-col sm:flex-row items-center sm:justify-between gap-3 text-xs text-ink-faint">
          <a
            href="https://github.com/secuditylabs"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 group hover:text-ink transition-colors"
          >
            <SecudityMark />
            <span>
              Built by <span className="text-ink group-hover:text-brand-soft transition-colors">Secudity</span> — solidity, security
            </span>
          </a>
          <span className="italic">Built with security in mind.</span>
          <span className="font-mono">sepolia · chainId 11155111</span>
        </div>
      </footer>
    </div>
  );
}
