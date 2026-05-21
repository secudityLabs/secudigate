import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import ThemeToggle from "./ThemeToggle";

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-line/60 bg-bg/70 backdrop-blur">
      <div className="max-w-6xl mx-auto px-5 h-14 flex items-center gap-3 sm:gap-6">
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
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="sm:hidden p-2 -mr-2 rounded-lg text-ink-dim hover:text-ink"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {menuOpen ? (
                <>
                  <path d="M6 6l12 12" />
                  <path d="M6 18L18 6" />
                </>
              ) : (
                <>
                  <path d="M4 7h16" />
                  <path d="M4 12h16" />
                  <path d="M4 17h16" />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>
      {menuOpen && (
        <div className="sm:hidden border-t border-line/60 bg-bg/95 backdrop-blur">
          <nav className="max-w-6xl mx-auto px-5 py-2 flex flex-col text-sm">
            <MobileNavItem to="/" end onClick={() => setMenuOpen(false)}>Home</MobileNavItem>
            <MobileNavItem to="/merchant" onClick={() => setMenuOpen(false)}>Merchant</MobileNavItem>
            <MobileNavItem to="/docs" onClick={() => setMenuOpen(false)}>Docs</MobileNavItem>
          </nav>
        </div>
      )}
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

function MobileNavItem({
  to,
  end,
  onClick,
  children,
}: {
  to: string;
  end?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        `px-3 py-3 rounded-lg transition-colors ${
          isActive ? "text-ink bg-bg-soft" : "text-ink-dim hover:text-ink hover:bg-bg-soft"
        }`
      }
    >
      {children}
    </NavLink>
  );
}
