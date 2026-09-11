"use client";

import Link from "next/link";
import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AuthGate } from "@/components/auth/AuthGate";
import { useAuthUser } from "@/lib/firebase/useAuthUser";
import { emailInAllowlist, parseAllowlist } from "@/lib/admin/allowlist";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { LayoutDashboard, BookOpen, Plug, Settings, ShieldCheck, type LucideIcon } from "lucide-react";

export default function AppLayout({ children }: { children: ReactNode }) {

	  const { user } = useAuthUser();
	  const adminAllowlist = parseAllowlist(process.env.NEXT_PUBLIC_ADMIN_EMAIL_ALLOWLIST);
	  const showAdmin = emailInAllowlist(user?.email, adminAllowlist);
	  const pathname = usePathname();
	  const isLogbook = pathname === "/app/logbook" || pathname?.startsWith("/app/logbook/");

	  return (
	    <AuthGate>
	      <div
	        className={`flex h-screen ${isLogbook ? "logbook-mode" : ""}`}
	        style={{ backgroundColor: "var(--bg-primary)" }}
	      >
	        {/* Desktop Sidebar */}
	        <aside
	          className="hidden md:flex md:flex-col w-64 border-r"
	          style={{
	            background: "linear-gradient(180deg, #0F2A44 0%, #1A3A5A 100%)",
	            borderColor: "rgba(0, 0, 0, 0.2)",
	          }}
	        >
	          {/* Brand Lockup */}
	          <div
	            className="p-5 border-b flex items-center gap-3"
	            style={{ borderColor: "rgba(255, 255, 255, 0.1)" }}
	          >
	            <img
	              src="/assets/logo/autoflightlog-icon.svg"
	              alt=""
	              className="flex-shrink-0 h-9 w-9 rounded-lg shadow-sm"
	            />
	            <h1 className="text-2xl font-semibold text-white tracking-tight">AutoFlightLog</h1>
	          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-6 space-y-1">
            <NavLink href="/app/dashboard" icon={LayoutDashboard}>Dashboard</NavLink>
            <NavLink href="/app/logbook" icon={BookOpen}>Logbook</NavLink>
            <NavLink href="/app/integrations" icon={Plug}>Integrations</NavLink>
            <NavLink href="/app/me" icon={Settings}>Settings</NavLink>
	            {showAdmin && <NavLink href="/app/admin" icon={ShieldCheck}>Admin</NavLink>}
          </nav>

          {/* Footer */}
          <div
            className="p-4 border-t flex items-center justify-between gap-2"
            style={{ borderColor: "rgba(255, 255, 255, 0.1)" }}
          >
            <p className="text-xs" style={{ color: "rgba(255, 255, 255, 0.4)" }}>
	              © 2026 AutoFlightLog
            </p>
            <ThemeToggle variant="sidebar" />
          </div>
        </aside>

	        {/* Mobile Header */}
	        <div
	          className="md:hidden fixed top-0 left-0 right-0 z-10 border-b mobile-app-header"
	          style={{
	            background: "linear-gradient(180deg, #0F2A44 0%, #1A3A5A 100%)",
	            borderColor: "rgba(0, 0, 0, 0.2)",
	          }}
	        >
	          {/* Brand Lockup */}
	          <div className="px-4 py-3 flex items-center justify-between gap-2.5">
	            <div className="flex items-center gap-2.5">
	              <img
	                src="/assets/logo/autoflightlog-icon.svg"
	                alt=""
	                className="h-8 w-8 rounded-lg shadow-sm"
	              />
	              <h1 className="text-xl font-semibold text-white tracking-tight">AutoFlightLog</h1>
	            </div>
	            <ThemeToggle variant="sidebar" />
	          </div>

          {/* Navigation Tabs */}
          <nav className="flex overflow-x-auto px-2 pb-2 gap-1">
            <MobileNavLink href="/app/dashboard" icon={LayoutDashboard}>Dashboard</MobileNavLink>
            <MobileNavLink href="/app/logbook" icon={BookOpen}>Logbook</MobileNavLink>
            <MobileNavLink href="/app/integrations" icon={Plug}>Integrations</MobileNavLink>
            <MobileNavLink href="/app/me" icon={Settings}>Settings</MobileNavLink>
	            {showAdmin && <MobileNavLink href="/app/admin" icon={ShieldCheck}>Admin</MobileNavLink>}
          </nav>
        </div>

	        {/* Main content */}
	        <main className="flex-1 overflow-auto md:pt-0 pt-24 app-main">
          {children}
        </main>
      </div>
    </AuthGate>
  );
}

function NavLink({ href, icon: Icon, children }: { href: string; icon: LucideIcon; children: ReactNode }) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname?.startsWith(href + "/");

  return (
    <Link
      href={href}
      className="relative flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium rounded-md transition-all"
      style={{
        backgroundColor: isActive ? "rgba(255, 255, 255, 0.1)" : "transparent",
        color: isActive ? "#FFFFFF" : "rgba(255, 255, 255, 0.65)",
        borderLeft: isActive ? "3px solid #38BDF8" : "3px solid transparent",
        paddingLeft: isActive ? "13px" : "16px",
      }}
    >
      <Icon size={16} strokeWidth={2} className="shrink-0" />
      {children}
    </Link>
  );
}

function MobileNavLink({ href, icon: Icon, children }: { href: string; icon: LucideIcon; children: ReactNode }) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname?.startsWith(href + "/");

  return (
    <Link
      href={href}
      className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-md whitespace-nowrap transition-all"
      style={{
        backgroundColor: isActive ? "rgba(255, 255, 255, 0.15)" : "transparent",
        color: isActive ? "#FFFFFF" : "rgba(255, 255, 255, 0.65)",
        borderBottom: isActive ? "2px solid #38BDF8" : "2px solid transparent",
      }}
    >
      <Icon size={14} strokeWidth={2} className="shrink-0" />
      {children}
    </Link>
  );
}

