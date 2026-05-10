import { NavLink } from "react-router-dom";
import RegistrationBanner from "./RegistrationBanner";

const ITEMS: { to: string; label: string; end?: boolean }[] = [
  { to: "/merchant", label: "Invoices", end: true },
  { to: "/merchant/freelancers",   label: "Freelancers" },
  { to: "/merchant/deposit-links", label: "Deposit links" },
  { to: "/merchant/analytics",     label: "Analytics" },
  { to: "/merchant/webhooks",      label: "Webhooks" },
  { to: "/merchant/customize",     label: "Customize" },
];

export default function MerchantNav() {
  return (
    <>
      <RegistrationBanner />
      <nav className="flex gap-1 mb-6 border-b border-line/60 -mt-2">
        {ITEMS.map((i) => (
          <NavLink
            key={i.to}
            to={i.to}
            end={i.end}
            className={({ isActive }) =>
              `px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                isActive
                  ? "border-brand text-ink"
                  : "border-transparent text-ink-dim hover:text-ink"
              }`
            }
          >
            {i.label}
          </NavLink>
        ))}
      </nav>
    </>
  );
}
