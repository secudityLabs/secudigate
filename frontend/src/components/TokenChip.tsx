import { symbolColor, type StablecoinSymbol } from "../lib/tokens";

export default function TokenChip({ symbol }: { symbol: StablecoinSymbol }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span
        className="h-5 w-5 rounded-full inline-flex items-center justify-center text-[10px] font-bold text-white"
        style={{ background: symbolColor(symbol) }}
      >
        {symbol[0]}
      </span>
      <span className="font-medium">{symbol}</span>
    </span>
  );
}
