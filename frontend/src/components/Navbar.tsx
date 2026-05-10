import { Link, NavLink } from "react-router-dom";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import ThemeToggle from "./ThemeToggle";

export default function Navbar() {
  return (
    <header className="sticky top-0 z-30 border-b border-line/60 bg-bg/70 backdrop-blur">
      <div className="max-w-6xl mx-auto px-5 h-14 flex items-center gap-6">
        <Link to="/" className="flex items-center gap-1.5 font-semibold tracking-tight">
          <img
            src="/logo-secudigate.png"
            alt="Secudigate"
            className="h-12 w-12 object-contain -mr-3 translate-y-[4px]"
            draggable={false}
          />
          <span>Secudigate</span>
        </Link>
        <nav className="hidden sm:flex items-center gap-1 text-sm">
          <NavItem to="/" end>Home</NavItem>
          <NavItem to="/merchant">Merchant</NavItem>
          <NavItem to="/docs">Docs</NavItem>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <ConnectButton chainStatus="icon" accountStatus={{ smallScreen: "avatar", largeScreen: "full" }} showBalance={false} />
        </div>
      </div>
    </header>
  );
}

function NavItem({ to, end, children }: { to: string; end?: boolean; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `px-3 py-1.5 rounded-lg transition-colors ${
          isActive ? "text-ink bg-bg-soft border border-line" : "text-ink-dim hover:text-ink"
        }`
      }
    >
      {children}
    </NavLink>
  );
}
