"use client";

import { useEffect, useState } from "react";
import { listEntries, listConnectors, listCertificates } from "@/lib/repo/firestoreRepos";
import { Certificate, LogbookEntry } from "@/types/domain";
import { calculateCurrencySummary, WindowedRequirement } from "@/lib/currency/currency";
import { getCertificateStatus, CertificateUrgency } from "@/lib/certificates/certificateStatus";
import { SEVERITY_STYLES, Severity } from "@/lib/ui/statusColors";
import { Banner } from "@/components/ui/Banner";
import { Skeleton, SkeletonCardGrid } from "@/components/ui/Skeleton";

const EXPIRY_WARNING_DAYS = 7;

function daysUntil(date: Date | null, now: Date): number | null {
  if (!date) return null;
  return Math.ceil((date.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

type Urgency = "critical" | "warning" | "ok";

function requirementUrgency(req: WindowedRequirement, now: Date): Urgency {
  if (!req.isMet) return "critical";
  const days = daysUntil(req.expiresAt, now);
  if (days !== null && days <= EXPIRY_WARNING_DAYS) return "warning";
  return "ok";
}

const URGENCY_TO_SEVERITY: Record<Urgency, Severity> = {
  critical: "critical",
  warning: "warning",
  ok: "success",
};

const CERT_URGENCY_TO_SEVERITY: Record<CertificateUrgency, Severity> = {
  expired: "critical",
  critical: "critical",
  warning: "warning",
  ok: "success",
};

const CERT_URGENCY_LABELS: Record<CertificateUrgency, string> = {
  expired: "Expired",
  critical: "Expires soon",
  warning: "Renew soon",
  ok: "Valid",
};

function requirementStatusText(req: WindowedRequirement, now: Date, formatDate: (d: Date | null) => string): string {
  if (!req.isMet) return `Need ${req.missingCount} more`;
  const days = daysUntil(req.expiresAt, now);
  if (days !== null && days <= EXPIRY_WARNING_DAYS) {
    return days <= 0 ? "Expires today" : `Expires in ${days} day${days === 1 ? "" : "s"}`;
  }
  return `Valid until ${formatDate(req.expiresAt)}`;
}

type ConnectorSummary = {
	status: "inactive" | "active" | "error";
	lastSyncAt?: string;
	companyName?: string;
};

function formatMinutesToHHMM(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
}

export default function DashboardPage() {
  const [entries, setEntries] = useState<LogbookEntry[]>([]);
	const [connectors, setConnectors] = useState<ConnectorSummary[]>([]);
	const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				setLoadError(null);
				const [entriesData, connectorsData, certificatesData] = await Promise.all([
					listEntries(),
					listConnectors(),
					listCertificates(),
				]);
				if (cancelled) return;
				setEntries(entriesData);
				setConnectors(connectorsData);
				setCertificates(certificatesData);
			} catch (err) {
				console.error("Dashboard load failed", err);
				if (cancelled) return;
				const code = typeof (err as any)?.code === "string" ? (err as any).code : null;
				const message = err instanceof Error ? err.message : String(err);
				setLoadError(code ? `${code}: ${message}` : message);
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
  }, []);

  if (loading) {
    return (
      <div className="p-6 md:p-8 space-y-6">
        <h1 className="text-2xl font-semibold" style={{ color: "var(--aviation-blue)" }}>Dashboard</h1>
        <SkeletonCardGrid count={8} />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

	if (loadError) {
		return (
			<div className="p-6 space-y-4">
				<h1 className="text-xl font-semibold mb-4" style={{ color: "var(--aviation-blue)" }}>Dashboard</h1>
				<Banner severity="critical" title="Could not load dashboard data.">
					<p>{loadError}</p>
					<p className="mt-2 text-xs">
						Tip: this is often caused by Firestore &quot;Missing or insufficient permissions&quot; (security rules), or not being signed in.
					</p>
				</Banner>
			</div>
		);
	}

  // Calculate totals
	const totalFlightMinutes = entries.reduce((sum, e) => sum + (Number(e.values.totalTime) || 0), 0);
	const totalPicMinutes = entries.reduce((sum, e) => sum + (Number(e.values.picTime) || 0), 0);
	const totalCopilotMinutes = entries.reduce((sum, e) => sum + (Number(e.values.copilotTime) || 0), 0);
	const totalDualMinutes = entries.reduce((sum, e) => sum + (Number(e.values.dualTime) || 0), 0);
	const totalNightMinutes = entries.reduce((sum, e) => sum + (Number(e.values.nightTime) || 0), 0);
	const totalIfrMinutes = entries.reduce((sum, e) => sum + (Number(e.values.ifrTime) || 0), 0);
  const totalLandings = entries.reduce(
    (sum, e) => sum + (Number(e.values.landingsDay) || 0) + (Number(e.values.landingsNight) || 0),
    0
  );

  // Calculate time period statistics
  const now = new Date();
  const getMinutesInPeriod = (days: number) => {
    const cutoffDate = new Date(now);
    cutoffDate.setDate(cutoffDate.getDate() - days);
    return entries
      .filter((e) => new Date(e.values.date) >= cutoffDate)
			.reduce((sum, e) => sum + (Number(e.values.totalTime) || 0), 0);
  };

  const last1DayMinutes = getMinutesInPeriod(1);
  const last3DaysMinutes = getMinutesInPeriod(3);
  const last7DaysMinutes = getMinutesInPeriod(7);
  const last30DaysMinutes = getMinutesInPeriod(30);
  const last365DaysMinutes = getMinutesInPeriod(365);

  // Calculate integration stats
  const activeConnectors = connectors.filter((c) => c.status === "active");
  const activeIntegrations = activeConnectors.length;
	const lastSyncTimes = connectors
		.filter((c): c is ConnectorSummary & { lastSyncAt: string } => typeof c.lastSyncAt === "string")
		.map((c) => new Date(c.lastSyncAt).getTime());
  const lastSyncAt = lastSyncTimes.length > 0 ? new Date(Math.max(...lastSyncTimes)) : null;

  const stats = [
    { label: "Total Entries", value: entries.length.toString(), isTime: false },
    { label: "Total Flight Time", value: formatMinutesToHHMM(totalFlightMinutes), isTime: true },
    { label: "Total PIC", value: formatMinutesToHHMM(totalPicMinutes), isTime: true },
    { label: "Total Co-Pilot", value: formatMinutesToHHMM(totalCopilotMinutes), isTime: true },
		{ label: "Total Dual", value: formatMinutesToHHMM(totalDualMinutes), isTime: true },
		{ label: "Total Night", value: formatMinutesToHHMM(totalNightMinutes), isTime: true },
		{ label: "Total IFR", value: formatMinutesToHHMM(totalIfrMinutes), isTime: true },
    { label: "Total Landings", value: totalLandings.toString(), isTime: false },
  ];

  const periodStats = [
    { label: "Last 24 Hours", value: formatMinutesToHHMM(last1DayMinutes), period: "1d" },
    { label: "Last 3 Days", value: formatMinutesToHHMM(last3DaysMinutes), period: "3d" },
    { label: "Last 7 Days", value: formatMinutesToHHMM(last7DaysMinutes), period: "7d" },
    { label: "Last 30 Days", value: formatMinutesToHHMM(last30DaysMinutes), period: "30d" },
    { label: "Last Year", value: formatMinutesToHHMM(last365DaysMinutes), period: "365d" },
  ];

	const currency = calculateCurrencySummary(entries, now);
	const formatDate = (d: Date | null) => (d ? d.toLocaleDateString() : "-");
	const badgeStyle = (ok: boolean) => {
		const s = SEVERITY_STYLES[ok ? "success" : "critical"];
		return { backgroundColor: s.bg, borderColor: s.border, color: s.text };
	};

	const passengerUrgency = requirementUrgency(currency.passengerLandings90, now);
	const nightUrgency = requirementUrgency(currency.nightPassengerLandings90, now);
	const overallUrgency: Urgency =
		passengerUrgency === "critical" || nightUrgency === "critical"
			? "critical"
			: passengerUrgency === "warning" || nightUrgency === "warning"
			? "warning"
			: "ok";

	const certificatesWithStatus = certificates
		.map((cert) => ({ cert, status: getCertificateStatus(cert.expiryDate, now) }))
		.sort((a, b) => a.status.daysUntilExpiry - b.status.daysUntilExpiry);
	const attentionCertificates = certificatesWithStatus.filter(
		(c) => c.status.urgency === "expired" || c.status.urgency === "critical"
	);

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold" style={{ color: "var(--aviation-blue)" }}>
          Dashboard
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
          Overview of your flight logbook statistics
        </p>
      </div>

      {/* Total Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border p-4 md:p-6 transition-shadow hover:shadow-md"
            style={{
              backgroundColor: "var(--bg-card)",
              borderColor: "var(--border-default)"
            }}
          >
            <div className="text-2xl md:text-3xl font-bold" style={{ color: "var(--aviation-blue)" }}>
              {stat.value}
            </div>
            <div className="text-xs md:text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* Divider */}
      <div className="border-t" style={{ borderColor: "var(--border-default)" }}></div>

      {/* Time Period Stats */}
      <div>
        <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--aviation-blue)" }}>
          Flight Hours by Period
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
          {periodStats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border p-4 md:p-5 transition-shadow hover:shadow-md"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-default)"
              }}
            >
              <div className="text-xl md:text-2xl font-bold" style={{ color: "var(--aviation-blue)" }}>
                {stat.value}
              </div>
              <div className="text-xs md:text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Active Integrations Section - Compact */}
      <div
        className="rounded-lg border p-4 transition-shadow hover:shadow-sm"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-default)"
        }}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold" style={{ color: "var(--aviation-blue)" }}>
            Integrations
          </h3>
          {activeIntegrations === 0 ? (
            <a
              href="/app/integrations"
              className="text-xs font-medium underline hover:no-underline transition-all"
              style={{ color: "var(--aviation-blue)" }}
            >
              Connect
            </a>
          ) : (
            <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              {activeIntegrations} active
            </span>
          )}
        </div>

        {activeIntegrations === 0 ? (
          <p className="text-xs mt-2" style={{ color: "var(--text-secondary)" }}>
            No active integrations
          </p>
        ) : (
          <div className="mt-2">
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
              {activeConnectors.map((c) => c.companyName).join(", ")}
            </p>
            {lastSyncAt && (
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                Last sync: {lastSyncAt.toLocaleString()}
              </p>
            )}
          </div>
        )}
      </div>

				{/* Currency & Recency */}
				<div
					className="rounded-lg border p-5"
					style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-default)" }}
				>
					<div className="flex items-center justify-between">
						<h3 className="text-sm font-semibold" style={{ color: "var(--aviation-blue)" }}>
							Currency (EASA-style)
						</h3>
						<span
							className="text-xs font-semibold rounded-full border px-2 py-1"
							style={badgeStyle(overallUrgency === "ok")}
						>
							{overallUrgency === "ok" ? "Current" : overallUrgency === "warning" ? "Expiring soon" : "Attention"}
						</span>
					</div>

					<div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
						<div
							className="rounded-xl border p-4"
							style={{ borderColor: SEVERITY_STYLES[URGENCY_TO_SEVERITY[passengerUrgency]].border, backgroundColor: SEVERITY_STYLES[URGENCY_TO_SEVERITY[passengerUrgency]].bg }}
						>
							<div className="text-xs" style={{ color: "var(--text-secondary)" }}>
								Passenger landings (last 90 days)
							</div>
							<div className="mt-1 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
								{currency.passengerLandings90.actualCount}/{currency.passengerLandings90.requiredCount}
							</div>
							<div className="mt-1 text-xs font-medium" style={{ color: SEVERITY_STYLES[URGENCY_TO_SEVERITY[passengerUrgency]].text }}>
								{requirementStatusText(currency.passengerLandings90, now, formatDate)}
							</div>
						</div>

						<div
							className="rounded-xl border p-4"
							style={{ borderColor: SEVERITY_STYLES[URGENCY_TO_SEVERITY[nightUrgency]].border, backgroundColor: SEVERITY_STYLES[URGENCY_TO_SEVERITY[nightUrgency]].bg }}
						>
							<div className="text-xs" style={{ color: "var(--text-secondary)" }}>
								Night passenger landings (last 90 days)
							</div>
							<div className="mt-1 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
								{currency.nightPassengerLandings90.actualCount}/{currency.nightPassengerLandings90.requiredCount}
							</div>
							<div className="mt-1 text-xs font-medium" style={{ color: SEVERITY_STYLES[URGENCY_TO_SEVERITY[nightUrgency]].text }}>
								{requirementStatusText(currency.nightPassengerLandings90, now, formatDate)}
							</div>
						</div>
					</div>

					<div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
						<div className="rounded-xl border p-3" style={{ borderColor: "var(--border-light)" }}>
							<div className="text-xs" style={{ color: "var(--text-secondary)" }}>
								IFR (90d)
							</div>
							<div className="text-sm font-semibold" style={{ color: "var(--aviation-blue)" }}>
								{formatMinutesToHHMM(currency.ifrMinutes90)}
							</div>
						</div>
						<div className="rounded-xl border p-3" style={{ borderColor: "var(--border-light)" }}>
							<div className="text-xs" style={{ color: "var(--text-secondary)" }}>
								Night (90d)
							</div>
							<div className="text-sm font-semibold" style={{ color: "var(--aviation-blue)" }}>
								{formatMinutesToHHMM(currency.nightMinutes90)}
							</div>
						</div>
					</div>
					<div className="mt-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
						These figures are guidance only and do not filter by aircraft type/class.
					</div>
				</div>

				{/* Certificates & Ratings */}
				<div
					className="rounded-lg border p-5"
					style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-default)" }}
				>
					<div className="flex items-center justify-between">
						<h3 className="text-sm font-semibold" style={{ color: "var(--aviation-blue)" }}>
							Certificates &amp; Ratings
						</h3>
						<a
							href="/app/me/certificates"
							className="text-xs font-medium underline hover:no-underline transition-all"
							style={{ color: "var(--aviation-blue)" }}
						>
							{certificates.length === 0 ? "Add" : "Manage"}
						</a>
					</div>

					{certificates.length === 0 ? (
						<p className="text-xs mt-2" style={{ color: "var(--text-secondary)" }}>
							No certificates tracked yet. Add your medical, license, or type rating to get expiry reminders here.
						</p>
					) : (
						<div className="mt-3 grid gap-2">
							{certificatesWithStatus.slice(0, 4).map(({ cert, status }) => {
								const style = SEVERITY_STYLES[CERT_URGENCY_TO_SEVERITY[status.urgency]];
								return (
									<div
										key={cert.id}
										className="rounded-lg border px-3 py-2 flex items-center justify-between gap-3"
										style={{ borderColor: style.border, backgroundColor: style.bg }}
									>
										<span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
											{cert.label}
										</span>
										<span className="text-xs font-semibold" style={{ color: style.text }}>
											{CERT_URGENCY_LABELS[status.urgency]}
											{status.urgency !== "ok" && status.daysUntilExpiry >= 0 && ` (${status.daysUntilExpiry}d)`}
										</span>
									</div>
								);
							})}
							{attentionCertificates.length > 0 && (
								<p className="text-xs mt-1" style={{ color: "var(--severity-critical-text)" }}>
									{attentionCertificates.length} certificate{attentionCertificates.length === 1 ? "" : "s"} need
									{attentionCertificates.length === 1 ? "s" : ""} attention.
								</p>
							)}
						</div>
					)}
				</div>
    </div>
  );
}

