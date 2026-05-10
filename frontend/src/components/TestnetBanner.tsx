// Persistent banner across every route. Intentionally non-dismissable: the
// whole point is to keep first-time visitors from confusing the demo with a
// production system. The day we go to mainnet, we delete the component.
export default function TestnetBanner() {
  return (
    <div className="bg-warn/10 border-b border-warn/30 text-warn">
      <div className="max-w-6xl mx-auto px-5 py-1.5 text-[11px] sm:text-xs flex items-center gap-2 justify-center text-center flex-wrap">
        <span className="font-medium uppercase tracking-widest">Testnet</span>
        <span className="text-ink-dim">
          Sepolia · mock tokens · do not send real assets. Mainnet deploys after external audit.
        </span>
      </div>
    </div>
  );
}
