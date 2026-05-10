import type { InvoiceStatus } from "../lib/types";

export default function StatusBadge({ status }: { status: InvoiceStatus }) {
  if (status === "paid") {
    return <span className="badge-paid"><Dot className="bg-good" />Paid</span>;
  }
  if (status === "expired") {
    return <span className="badge-expired"><Dot className="bg-ink-faint" />Expired</span>;
  }
  return <span className="badge-pending"><Dot className="bg-warn animate-pulse" />Pending</span>;
}

function Dot({ className }: { className: string }) {
  return <span className={`h-1.5 w-1.5 rounded-full ${className}`} />;
}
