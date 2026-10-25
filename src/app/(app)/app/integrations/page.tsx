"use client";

import { useCallback, useEffect, useState } from "react";
import {
  addIntegrationRequest,
  deleteIntegrationRequest,
  listConnectors,
  listIntegrationRequests,
  updateIntegrationRequest,
} from "@/lib/repo/firestoreRepos";
import { apiFetch, ApiError } from "@/lib/api/client";
import { useToast } from "@/components/ui/ToastProvider";
import { Banner } from "@/components/ui/Banner";
import { Skeleton, SkeletonRows } from "@/components/ui/Skeleton";
import { TypedConfirmModal } from "@/components/ui/TypedConfirmModal";
import { SEVERITY_STYLES, Severity } from "@/lib/ui/statusColors";
import { ConnectorForm, connectorToFormValues, type ConnectorFormValues } from "@/components/integrations/ConnectorForm";
import type { Connector, FlightRecord, IntegrationRequest, SyncSummary } from "@/types/integrations";
import { SETUP_TOKEN_TTL_DAYS } from "@/types/integrations";
import { Check, Clock, Mail, Pause, Play, Plug, RefreshCw, Settings as SettingsIcon, Trash2, TriangleAlert, Wrench } from "lucide-react";

type ConnectorStatusLabel = "Active" | "Paused" | "Waiting for activation" | "Error";

function statusOf(c: Connector): { label: ConnectorStatusLabel; severity: Severity; icon: React.ReactNode } {
  switch (c.status) {
    case "active":
      return { label: "Active", severity: "success", icon: <Check size={12} strokeWidth={3} /> };
    case "paused":
      return { label: "Paused", severity: "neutral", icon: <Pause size={12} strokeWidth={2.5} /> };
    case "error":
      return { label: "Error", severity: "critical", icon: <TriangleAlert size={12} strokeWidth={2.5} /> };
    default:
      return { label: "Waiting for activation", severity: "warning", icon: <Clock size={12} strokeWidth={2.5} /> };
  }
}

function formatWhen(iso?: string): string {
  if (!iso) return "never";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function summaryText(s?: SyncSummary): string {
  if (!s) return "";
  const parts = [
    `${s.fetched} fetched`,
    s.created ? `${s.created} new` : null,
    s.linked ? `${s.linked} linked to manual entries` : null,
    s.updated ? `${s.updated} updated` : null,
    s.unchanged ? `${s.unchanged} unchanged` : null,
    s.ignored ? `${s.ignored} kept deleted` : null,
    s.invalid ? `${s.invalid} invalid` : null,
  ].filter(Boolean);
  return parts.join(", ");
}

function setupLinkFor(request: IntegrationRequest): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "[APP_URL]";
  return `${origin}/employer/setup/${request.id}?token=${request.setupToken}`;
}

function generateEmailDraft(request: IntegrationRequest): string {
  return `Subject: API access to my flight records for my personal logbook (AutoFlightLog)

Dear ${request.companyName} IT team,

I keep my personal EASA flight logbook in AutoFlightLog and would like to import my own flight records from your crew/flight operations system automatically, instead of typing each flight in by hand.

What I am asking for:
- Read-only access to MY flights only (crew ID: ${request.crewId})
- A personal API key or token, or an export endpoint I can poll
- JSON over HTTPS, ideally with a "from date" filter so I only fetch new flights
- Per flight: date, departure/arrival place and time, aircraft type and registration, block/flight time, PIC name, landings (day/night), night and IFR time if available, and a stable flight id

Two ways to set it up:
1. Give the details to me (${request.contactEmail}) and I will configure it myself, or
2. Use this link to enter the API endpoint and token directly, without needing my account:
   ${setupLinkFor(request)}
   (The link is unique to this request, expires in ${SETUP_TOKEN_TTL_DAYS} days, and the token is stored encrypted. Please don't forward it.)

If you already have API documentation for the system you use, a link to it would be very helpful.

Best regards,
[Your Name]`;
}

type ConnectorAction = "sync" | "fullSync" | "test" | "toggle" | "delete";

export default function IntegrationsPage() {
  const { showToast } = useToast();
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [requests, setRequests] = useState<IntegrationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showNewConnector, setShowNewConnector] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<Record<string, ConnectorAction | undefined>>({});
  const [lastResult, setLastResult] = useState<Record<string, { ok: boolean; text: string; warnings?: string[]; sample?: FlightRecord }>>({});
  const [pendingDelete, setPendingDelete] = useState<Connector | null>(null);

  const [companyName, setCompanyName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [crewId, setCrewId] = useState("");
  const [creatingRequest, setCreatingRequest] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      const [c, r] = await Promise.all([listConnectors(), listIntegrationRequests()]);
      setConnectors(c.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)));
      setRequests(r.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)));
    } catch (err) {
      console.error("Integrations load failed", err);
      const code = typeof (err as { code?: unknown })?.code === "string" ? (err as { code: string }).code : null;
      const message = err instanceof Error ? err.message : String(err);
      setLoadError(code ? `${code}: ${message}` : message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function errorMessage(err: unknown): string {
    if (err instanceof ApiError && err.problems?.length) return err.problems.join(" · ");
    return err instanceof Error ? err.message : String(err);
  }

  async function createConnector(values: ConnectorFormValues) {
    setSaving(true);
    try {
      const { connector } = await apiFetch<{ connector: Connector }>("/api/connectors", {
        method: "POST",
        body: JSON.stringify(values),
      });
      showToast(`Connector "${connector.companyName}" created. Test it to check the mapping.`, "success");
      setShowNewConnector(false);
      await load();
    } catch (err) {
      showToast(errorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  }

  async function updateConnector(id: string, values: ConnectorFormValues) {
    setSaving(true);
    try {
      await apiFetch(`/api/connectors/${id}`, { method: "PUT", body: JSON.stringify(values) });
      showToast("Connector updated.", "success");
      setEditingId(null);
      await load();
    } catch (err) {
      showToast(errorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  }

  async function runAction(c: Connector, action: ConnectorAction) {
    setBusy((b) => ({ ...b, [c.id]: action }));
    try {
      if (action === "sync" || action === "fullSync") {
        const res = await apiFetch<{ ok: boolean; summary?: SyncSummary; warnings: string[]; error?: string }>(`/api/connectors/${c.id}/sync`, {
          method: "POST",
          body: JSON.stringify({ full: action === "fullSync" }),
        }).catch((err) => {
          if (err instanceof ApiError && err.status === 422) return err.body as { ok: boolean; summary?: SyncSummary; warnings: string[]; error?: string };
          throw err;
        });
        if (res.ok) {
          setLastResult((r) => ({ ...r, [c.id]: { ok: true, text: `Sync OK: ${summaryText(res.summary)}`, warnings: res.warnings } }));
          showToast(`Synced ${c.companyName}: ${res.summary?.created ?? 0} new, ${res.summary?.updated ?? 0} updated.`, "success");
        } else {
          setLastResult((r) => ({ ...r, [c.id]: { ok: false, text: `Sync failed: ${res.error}` } }));
          showToast(`Sync failed: ${res.error}`, "error");
        }
      } else if (action === "test") {
        type TestResponse = { ok: boolean; sampleCount?: number; sample?: FlightRecord; error?: string };
        const res = await apiFetch<TestResponse>(`/api/connectors/${c.id}/test`, { method: "POST" }).catch((err) => {
          if (err instanceof ApiError && err.status === 422) return err.body as TestResponse;
          throw err;
        });
        if (res.ok) {
          setLastResult((r) => ({
            ...r,
            [c.id]: { ok: true, text: `Connection OK - the API returned ${res.sampleCount ?? 0} record${res.sampleCount === 1 ? "" : "s"} on the probe request.`, sample: res.sample },
          }));
          showToast("Connection test passed.", "success");
        } else {
          setLastResult((r) => ({ ...r, [c.id]: { ok: false, text: `Connection test failed: ${res.error}` } }));
          showToast(`Connection test failed: ${res.error}`, "error");
        }
      } else if (action === "toggle") {
        await apiFetch(`/api/connectors/${c.id}`, { method: "PATCH", body: JSON.stringify({ autoSyncEnabled: !c.autoSyncEnabled }) });
        showToast(c.autoSyncEnabled ? "Automatic sync paused." : "Automatic sync resumed.", "success");
      } else if (action === "delete") {
        await apiFetch(`/api/connectors/${c.id}`, { method: "DELETE" });
        showToast("Connector removed. Synced entries stay in your logbook.", "success");
      }
      await load();
    } catch (err) {
      showToast(errorMessage(err), "error");
    } finally {
      setBusy((b) => ({ ...b, [c.id]: undefined }));
    }
  }

  async function handleCreateRequest() {
    setCreatingRequest(true);
    try {
      const now = new Date();
      const request: IntegrationRequest = {
        id: "req_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16),
        companyName: companyName.trim(),
        contactEmail: contactEmail.trim(),
        crewId: crewId.trim(),
        createdAt: now.toISOString(),
        status: "draft",
        setupToken: crypto.randomUUID() + crypto.randomUUID().replace(/-/g, ""),
        setupTokenExpiresAt: new Date(now.getTime() + SETUP_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
      };
      await addIntegrationRequest(request);
      setSelectedRequestId(request.id);
      setCompanyName("");
      setContactEmail("");
      setCrewId("");
      await load();
    } catch (err) {
      showToast(`Could not create request: ${errorMessage(err)}`, "error");
    } finally {
      setCreatingRequest(false);
    }
  }

  async function markRequestSent(req: IntegrationRequest) {
    try {
      await updateIntegrationRequest(req.id, { status: "sent" });
      await load();
    } catch (err) {
      showToast(errorMessage(err), "error");
    }
  }

  async function removeRequest(req: IntegrationRequest) {
    try {
      await deleteIntegrationRequest(req.id);
      if (selectedRequestId === req.id) setSelectedRequestId(null);
      await load();
    } catch (err) {
      showToast(errorMessage(err), "error");
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard
      .writeText(text)
      .then(() => showToast("Copied to clipboard!", "success"))
      .catch(() => showToast("Could not copy - select the text and copy it manually.", "error"));
  }

  if (loading) {
    return (
      <div className="p-6 md:p-8 space-y-6">
        <h1 className="text-2xl font-semibold mb-4" style={{ color: "var(--aviation-blue)" }}>
          Integrations
        </h1>
        <Skeleton className="h-24 w-full rounded-xl" />
        <SkeletonRows count={3} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="p-6 md:p-8 space-y-4">
        <h1 className="text-2xl font-semibold mb-4" style={{ color: "var(--aviation-blue)" }}>
          Integrations
        </h1>
        <Banner severity="critical" title="Could not load integrations.">
          {loadError}
        </Banner>
      </div>
    );
  }

  const selectedRequest = requests.find((r) => r.id === selectedRequestId) ?? null;
  const connectorForRequest = (req: IntegrationRequest) => connectors.find((c) => c.requestId === req.id) ?? null;
  const openRequests = requests.filter((r) => !connectorForRequest(r));

  const card = { backgroundColor: "var(--bg-card)", borderColor: "var(--border-default)" } as const;

  return (
    <div className="p-6 md:p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold" style={{ color: "var(--aviation-blue)" }}>
          Integrations
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
          Pull your flights straight from your employer&apos;s crew system into this logbook. Flights you have edited by hand are never overwritten.
        </p>
      </div>

      {/* Connectors */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-lg font-semibold" style={{ color: "var(--aviation-blue)" }}>
            Connected systems
          </h2>
          {!showNewConnector && (
            <button
              onClick={() => {
                setShowNewConnector(true);
                setEditingId(null);
              }}
              className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 flex items-center gap-2"
              style={{ backgroundColor: "var(--aviation-blue)" }}
            >
              <Plug size={14} strokeWidth={2.5} />
              I have an API key
            </button>
          )}
        </div>

        {showNewConnector && (
          <div className="rounded-xl border p-5" style={card}>
            <h3 className="font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
              New connector
            </h3>
            <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
              Use this when your employer has given you an API endpoint and a personal key or token.
            </p>
            <ConnectorForm initial={connectorToFormValues(null)} submitLabel="Create connector" submitting={saving} onSubmit={createConnector} onCancel={() => setShowNewConnector(false)} />
          </div>
        )}

        {connectors.length === 0 && !showNewConnector && (
          <div className="rounded-xl border p-5 text-sm" style={{ ...card, color: "var(--text-secondary)" }}>
            No systems connected yet. If you already have API details, press <strong>I have an API key</strong>. Otherwise, create a request below and send it to your employer.
          </div>
        )}

        {connectors.map((c) => {
          const st = statusOf(c);
          const colors = SEVERITY_STYLES[st.severity];
          const action = busy[c.id];
          const result = lastResult[c.id];
          const isEditing = editingId === c.id;

          return (
            <div key={c.id} className="rounded-xl border p-5 space-y-3" style={card}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold" style={{ color: "var(--text-primary)" }}>
                      {c.companyName}
                    </h3>
                    <span
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border"
                      style={{ backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }}
                    >
                      {st.icon}
                      {st.label}
                    </span>
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {c.configuredBy === "employer" ? "set up by employer" : "set up by you"}
                    </span>
                  </div>
                  <p className="text-xs mt-1 font-mono break-all" style={{ color: "var(--text-secondary)" }}>
                    {c.apiBaseUrl}
                    {c.config.flightsPath}
                  </p>
                  <div className="text-xs mt-2 space-y-0.5" style={{ color: "var(--text-secondary)" }}>
                    <p>
                      Last sync: {formatWhen(c.lastSyncAt)}
                      {c.lastSyncSummary && c.lastSyncStatus === "ok" ? ` - ${summaryText(c.lastSyncSummary)}` : ""}
                    </p>
                    {c.autoSyncEnabled && c.nextSyncAt && <p>Next automatic sync: {formatWhen(c.nextSyncAt)}</p>}
                    {c.syncSince && <p>Importing flights from {c.syncSince}</p>}
                    {!c.hasSecret && c.authType !== "none" && (
                      <p style={{ color: "var(--status-error)" }}>No API key stored yet - edit the connector to add one.</p>
                    )}
                  </div>
                  {c.lastSyncStatus === "error" && c.lastSyncError && (
                    <Banner severity="critical" size="compact" className="mt-2">
                      Last sync failed ({formatWhen(c.lastSyncAttemptAt)}): {c.lastSyncError}
                      {c.consecutiveFailures > 1 ? ` - ${c.consecutiveFailures} failures in a row` : ""}
                    </Banner>
                  )}
                  {c.lastTestError && (
                    <Banner severity="warning" size="compact" className="mt-2">
                      Last connection test failed ({formatWhen(c.lastTestAt)}): {c.lastTestError}
                    </Banner>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <ActionButton primary disabled={!!action || !c.hasSecret && c.authType !== "none"} onClick={() => runAction(c, "sync")} icon={<RefreshCw size={14} className={action === "sync" ? "animate-spin" : ""} />}>
                    {action === "sync" ? "Syncing..." : "Sync now"}
                  </ActionButton>
                  <ActionButton disabled={!!action} onClick={() => runAction(c, "test")} icon={<Wrench size={14} />}>
                    {action === "test" ? "Testing..." : "Test"}
                  </ActionButton>
                  <ActionButton disabled={!!action} onClick={() => runAction(c, "toggle")} icon={c.autoSyncEnabled ? <Pause size={14} /> : <Play size={14} />}>
                    {c.autoSyncEnabled ? "Pause" : "Resume"}
                  </ActionButton>
                  <ActionButton
                    disabled={!!action}
                    onClick={() => {
                      setEditingId(isEditing ? null : c.id);
                      setShowNewConnector(false);
                    }}
                    icon={<SettingsIcon size={14} />}
                  >
                    {isEditing ? "Close" : "Edit"}
                  </ActionButton>
                  <ActionButton disabled={!!action} onClick={() => setPendingDelete(c)} icon={<Trash2 size={14} />} danger>
                    Remove
                  </ActionButton>
                </div>
              </div>

              {result && (
                <Banner severity={result.ok ? "success" : "critical"} size="compact">
                  <p>{result.text}</p>
                  {result.warnings && result.warnings.length > 0 && (
                    <details className="mt-1">
                      <summary className="cursor-pointer">
                        {result.warnings.length} field warning{result.warnings.length === 1 ? "" : "s"} (values that could not be read)
                      </summary>
                      <ul className="list-disc ml-4 mt-1 space-y-0.5 max-h-40 overflow-auto">
                        {result.warnings.slice(0, 50).map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                  {result.sample && (
                    <details className="mt-1">
                      <summary className="cursor-pointer">First record after field mapping</summary>
                      <pre className="mt-1 text-[11px] overflow-auto max-h-60">{JSON.stringify(result.sample, null, 2)}</pre>
                    </details>
                  )}
                </Banner>
              )}

              {isEditing && (
                <div className="rounded-lg border p-4" style={{ borderColor: "var(--border-default)", backgroundColor: "var(--bg-primary)" }}>
                  <ConnectorForm
                    initial={connectorToFormValues(c)}
                    existing={c}
                    submitLabel="Save changes"
                    submitting={saving}
                    onSubmit={(values) => updateConnector(c.id, values)}
                    onCancel={() => setEditingId(null)}
                  />
                  <div className="mt-3 pt-3 border-t text-xs flex flex-wrap items-center gap-3" style={{ borderColor: "var(--border-default)", color: "var(--text-secondary)" }}>
                    <span>Changed the mapping or date range?</span>
                    <button type="button" className="underline" style={{ color: "var(--aviation-blue)" }} disabled={!!action} onClick={() => runAction(c, "fullSync")}>
                      {action === "fullSync" ? "Re-syncing everything..." : "Re-sync everything from the source"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* Employer requests */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold" style={{ color: "var(--aviation-blue)" }}>
          Ask your employer for access
        </h2>

        {openRequests.length > 0 && (
          <div className="grid gap-3">
            {openRequests.map((req) => {
              const sev: Severity = req.status === "sent" ? "info" : "warning";
              const colors = SEVERITY_STYLES[sev];
              const expired = req.setupTokenExpiresAt ? new Date(req.setupTokenExpiresAt).getTime() < Date.now() : false;
              return (
                <div
                  key={req.id}
                  className="rounded-xl border p-4 cursor-pointer"
                  style={{ ...card, borderColor: selectedRequestId === req.id ? "var(--aviation-blue)" : "var(--border-default)" }}
                  onClick={() => setSelectedRequestId(req.id)}
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold" style={{ color: "var(--text-primary)" }}>
                          {req.companyName}
                        </h3>
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border" style={{ backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }}>
                          {req.status === "sent" ? <Mail size={12} strokeWidth={2.5} /> : <Clock size={12} strokeWidth={2.5} />}
                          {req.status === "sent" ? "Sent - waiting for employer" : "Draft - not sent yet"}
                        </span>
                        {expired && (
                          <span className="text-xs font-medium" style={{ color: "var(--status-error)" }}>
                            Link expired
                          </span>
                        )}
                      </div>
                      <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
                        Crew ID: {req.crewId} · {req.contactEmail}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {req.status === "draft" && (
                        <ActionButton onClick={(e) => { e.stopPropagation(); void markRequestSent(req); }} icon={<Mail size={14} />}>
                          Mark as sent
                        </ActionButton>
                      )}
                      <ActionButton danger onClick={(e) => { e.stopPropagation(); void removeRequest(req); }} icon={<Trash2 size={14} />}>
                        Delete
                      </ActionButton>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="rounded-xl border p-6" style={card}>
          <h3 className="font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
            {openRequests.length === 0 ? "Create a request" : "Add another request"}
          </h3>
          <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
            Generates an email you can send to your employer&apos;s IT department, plus a one-off setup link they can use to enter the API details themselves.
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>
                Company name
              </label>
              <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="w-full rounded-lg border border-[var(--border-default)] p-3 text-sm focus:outline-none focus:border-[var(--aviation-blue)]" style={{ color: "var(--text-primary)" }} placeholder="e.g. Airlift AS" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>
                Your contact email
              </label>
              <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className="w-full rounded-lg border border-[var(--border-default)] p-3 text-sm focus:outline-none focus:border-[var(--aviation-blue)]" style={{ color: "var(--text-primary)" }} placeholder="you@example.com" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>
                Your crew ID / employee ID
              </label>
              <input value={crewId} onChange={(e) => setCrewId(e.target.value)} className="w-full rounded-lg border border-[var(--border-default)] p-3 text-sm focus:outline-none focus:border-[var(--aviation-blue)]" style={{ color: "var(--text-primary)" }} placeholder="e.g. OMY" />
            </div>
          </div>
          <button
            onClick={handleCreateRequest}
            disabled={creatingRequest || !companyName.trim() || !contactEmail.trim() || !crewId.trim()}
            className="mt-4 rounded-lg px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50 transition-opacity hover:opacity-90"
            style={{ backgroundColor: "var(--aviation-blue)" }}
          >
            {creatingRequest ? "Creating..." : "Create request"}
          </button>
        </div>

        {selectedRequest && !connectorForRequest(selectedRequest) && (
          <div className="rounded-xl border p-6 space-y-4" style={card}>
            <h3 className="font-semibold" style={{ color: "var(--text-primary)" }}>
              Send to {selectedRequest.companyName}
            </h3>
            <Banner severity="info">
              Copy the email below and send it to <strong>{selectedRequest.companyName}</strong>. It explains what you need and includes the setup link.
              {selectedRequest.setupTokenExpiresAt && <> The link works until {new Date(selectedRequest.setupTokenExpiresAt).toLocaleDateString()}.</>}
            </Banner>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>
                Employer setup link
              </label>
              <div className="flex gap-2">
                <input readOnly value={setupLinkFor(selectedRequest)} className="flex-1 rounded-lg border p-3 text-xs font-mono" style={{ borderColor: "var(--border-default)", backgroundColor: "var(--bg-primary)", color: "var(--text-primary)" }} />
                <button onClick={() => copyToClipboard(setupLinkFor(selectedRequest))} className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90" style={{ backgroundColor: "var(--aviation-blue)" }}>
                  Copy link
                </button>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  Email draft
                </label>
                <button onClick={() => copyToClipboard(generateEmailDraft(selectedRequest))} className="rounded-lg px-3 py-1 text-xs font-medium bg-[var(--bg-hover)] hover:bg-[var(--border-default)]" style={{ color: "var(--text-primary)" }}>
                  Copy email
                </button>
              </div>
              <textarea readOnly value={generateEmailDraft(selectedRequest)} className="w-full h-72 rounded-lg border p-3 text-xs font-mono" style={{ borderColor: "var(--border-default)", backgroundColor: "var(--bg-primary)", color: "var(--text-primary)" }} />
            </div>
          </div>
        )}
      </section>

      {pendingDelete && (
        <TypedConfirmModal
          title={`Remove connector "${pendingDelete.companyName}"`}
          steps={[
            {
              prompt: `This removes the connection and its stored API key. Flights already imported stay in your logbook.\n\nType "${pendingDelete.companyName}" to confirm:`,
              requiredText: pendingDelete.companyName,
            },
          ]}
          confirmLabel="Remove connector"
          onCancel={() => setPendingDelete(null)}
          onConfirm={async () => {
            const c = pendingDelete;
            setPendingDelete(null);
            await runAction(c, "delete");
          }}
        />
      )}
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  icon,
  disabled,
  primary,
  danger,
}: {
  children: React.ReactNode;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  icon?: React.ReactNode;
  disabled?: boolean;
  primary?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium border transition-colors disabled:opacity-50 hover:bg-[var(--bg-hover)]"
      style={{
        backgroundColor: primary ? "var(--aviation-blue)" : "var(--bg-card)",
        color: primary ? "#FFFFFF" : danger ? "var(--status-error)" : "var(--text-primary)",
        borderColor: primary ? "var(--aviation-blue)" : danger ? "var(--status-error)" : "var(--border-default)",
      }}
    >
      {icon}
      {children}
    </button>
  );
}
