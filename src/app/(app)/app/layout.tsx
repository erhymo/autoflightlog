"use client";

import Link from "next/link";
import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AuthGate } from "@/components/auth/AuthGate";
import Image from "next/image";
import { useAuthUser } from "@/lib/firebase/useAuthUser";
import { emailInAllowlist, parseAllowlist } from "@/lib/admin/allowlist";

export default function AppLayout({ children }: { children: ReactNode }) {

  const { user } = useAuthUser();
  const adminAllowlist = parseAllowlist(process.env.NEXT_PUBLIC_ADMIN_EMAIL_ALLOWLIST);
  const showAdmin = emailInAllowlist(user?.email, adminAllowlist);

  return (
    <AuthGate>
      <div className="flex h-screen" style={{ backgroundColor: "var(--bg-primary)" }}>
        {/* Desktop Sidebar */}
        <aside
          className="hidden md:flex md:flex-col w-64 border-r"
          style={{
            background: "linear-gradient(180deg, #0F2A44 0%, #1A3A5A 100%)",
            borderColor: "rgba(0, 0, 0, 0.2)"
          }}
        >
          {/* Brand Lockup */}
          <div className="p-5 border-b flex items-center gap-3" style={{ borderColor: "rgba(255, 255, 255, 0.1)" }}>
            <Image
	              src="/assets/logo/autoflightlog-icon-light.svg"
	              alt="AutoFlightLog"
              width={32}
              height={32}
              className="flex-shrink-0"
            />
	            <h1 className="text-2xl font-semibold text-white tracking-tight">AutoFlightLog</h1>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-6 space-y-1">
            <NavLink href="/app/dashboard">Dashboard</NavLink>
            <NavLink href="/app/logbook">Logbook</NavLink>
            <NavLink href="/app/integrations">Integrations</NavLink>
            <NavLink href="/app/me">Settings</NavLink>
	            {showAdmin && <NavLink href="/app/admin">Admin</NavLink>}
          </nav>

          {/* Footer */}
          <div className="p-4 border-t" style={{ borderColor: "rgba(255, 255, 255, 0.1)" }}>
            <p className="text-xs" style={{ color: "rgba(255, 255, 255, 0.4)" }}>
	              © 2026 AutoFlightLog
            </p>
          </div>
        </aside>

        {/* Mobile Header */}
        <div
          className="md:hidden fixed top-0 left-0 right-0 z-10 border-b"
          style={{
            background: "linear-gradient(180deg, #0F2A44 0%, #1A3A5A 100%)",
            borderColor: "rgba(0, 0, 0, 0.2)"
          }}
        >
          {/* Brand Lockup */}
          <div className="px-4 py-3 flex items-center gap-2.5">
            <Image
	              src="/assets/logo/autoflightlog-icon-light.svg"
	              alt="AutoFlightLog"
              width={28}
              height={28}
            />
	            <h1 className="text-xl font-semibold text-white tracking-tight">AutoFlightLog</h1>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex overflow-x-auto px-2 pb-2 gap-1">
            <MobileNavLink href="/app/dashboard">Dashboard</MobileNavLink>
            <MobileNavLink href="/app/logbook">Logbook</MobileNavLink>
            <MobileNavLink href="/app/integrations">Integrations</MobileNavLink>
            <MobileNavLink href="/app/me">Settings</MobileNavLink>
	            {showAdmin && <MobileNavLink href="/app/admin">Admin</MobileNavLink>}
          </nav>
        </div>

        {/* Main content */}
        <main className="flex-1 overflow-auto md:pt-0 pt-24">
          {children}
        </main>
      </div>
    </AuthGate>
  );
}

function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname?.startsWith(href + "/");

  return (
    <Link
      href={href}
      className="relative block px-4 py-2.5 text-sm font-medium rounded-md transition-all"
      style={{
        backgroundColor: isActive ? "rgba(255, 255, 255, 0.1)" : "transparent",
        color: isActive ? "#FFFFFF" : "rgba(255, 255, 255, 0.65)",
        borderLeft: isActive ? "3px solid #38BDF8" : "3px solid transparent",
        paddingLeft: isActive ? "13px" : "16px",
      }}
    >
      {children}
    </Link>
  );
}

function MobileNavLink({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname?.startsWith(href + "/");

  return (
    <Link
      href={href}
      className="px-4 py-2 text-xs font-medium rounded-md whitespace-nowrap transition-all"
      style={{
        backgroundColor: isActive ? "rgba(255, 255, 255, 0.15)" : "transparent",
        color: isActive ? "#FFFFFF" : "rgba(255, 255, 255, 0.65)",
        borderBottom: isActive ? "2px solid #38BDF8" : "2px solid transparent",
      }}
    >
      {children}
    </Link>
  );
}

