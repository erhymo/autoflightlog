"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useToast } from "@/components/ui/ToastProvider";
import { Banner } from "@/components/ui/Banner";
import { Skeleton } from "@/components/ui/Skeleton";
import { severityCardStyle } from "@/lib/ui/statusColors";
import type { Connector, ConnectorAuthType, FlightRecord, GenericJsonConfig } from "@/types/integrations";
import { defaultGenericJsonConfig } from "@/lib/sync/connectorModel";
import { validateGenericJsonConfig } from "@/lib/sync/adapters/genericJson";
import { Check } from "lucide-react";

interface RequestInfo {
  companyName: string;
  contactEmail: string;
  crewId: string;
  setupTokenExpiresAt: string | null;
}

type TestResponse = { ok: boolean; sampleCount?: number; sample?: FlightRecord; error?: string; connector: Connector };

const AUTH_OPTIONS: Array<{ value: ConnectorAuthType; label: string }> = [
  { value: "api_key", label: "API key in a header" },
  { value: "bearer_token", label: "Bearer token (Authorization header)" },
  { value: "basic", label: "Basic auth (username:password)" },
  { value: "none", label: "No authentication (IP allow-list etc.)" },
];

const inputClass = "w-full rounded-xl border border-[var(--border-default)] p-3 text-sm focus:outline-none focus:border-[var(--aviation-blue)]";

async function readJson(res: Response) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

/**
 * Public, token-protected page an employer's IT contact uses to enter API
 * details for one pilot. The token in the link is the only credential, and
 * the API key they paste goes straight into encrypted server-side storage -
 * it is never sent back to this page.
 */
export default function EmployerSetupPage() {
  const params = useParams();
  const requestId = params.requestId as string;
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const { showToast } = useToast();

  const [request, setRequest] = useState<RequestInfo | null>(null);
  const [connector, setConnector] = useState<Connector | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [activating, setActivating] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string; sample?: FlightRecord } | null>(null);

  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [authType, setAuthType] = useState<ConnectorAuthType>("api_key");
  const [authHeaderName, setAuthHeaderName] = useState("");
  const [secret, setSecret] = useState("");
  const [showMapping, setShowMapping] = useState(false);
  const [configText, setConfigText] = useState(() => JSON.stringify(defaultGenericJsonConfig(), null, 2));

  useEffect(() => {
    if (!token) {
      setLoadError("This link is missing its setup token. Ask the pilot to resend the setup link.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setLoadError(null);
        const res = await fetch(`/api/employer/setup/${requestId}?token=${encodeURIComponent(token)}`);
        const json = await readJson(res);
        if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
        if (cancelled) return;
        setRequest(json.request);
        if (json.connector) {
          const c = json.connector as Connector;
          setConnector(c);
          setApiBaseUrl(c.apiBaseUrl);
          setAuthType(c.authType);
          setAuthHeaderName(c.authHeaderName ?? "");
          setConfigText(JSON.stringify(c.config, null, 2));
        }
      } catch (err) {
        console.error("Employer setup load failed", err);
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [requestId, token]);

  let parsedConfig: GenericJsonConfig | null = null;
  let configProblems: string[] = [];
  try {
    parsedConfig = JSON.parse(configText) as GenericJsonConfig;
    configProblems = validateGenericJsonConfig(parsedConfig);
  } catch {
    configProblems = ["Field mapping is not valid JSON"];
  }

  const urlOk = /^https:\/\/[^\s/]+/i.test(apiBaseUrl.trim());
  const secretOk = authType === "none" || secret.trim().length > 0 || !!connector?.hasSecret;
  const canTest = !testing && !activating && urlOk && secretOk && configProblems.length === 0;
  const canActivate = !!connector && !!connector.lastTestAt && !connector.lastTestError && connector.status !== "active" && !testing && !activating;

  async function handleTestConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/employer/setup/${requestId}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, apiBaseUrl: apiBaseUrl.trim(), authType, authHeaderName: authHeaderName.trim() || undefined, secret: secret.trim(), config: parsedConfig }),
      });
      const json = (await readJson(res)) as TestResponse | { error?: string } | null;
      if (!res.ok && res.status !== 422) throw new Error((json as { error?: string } | null)?.error || `HTTP ${res.status}`);
      const result = json as TestResponse;
      setConnector(result.connector);
      setSecret("");
      if (result.ok) {
        setTestResult({ ok: true, text: `Connection OK - the API returned ${result.sampleCount ?? 0} record${result.sampleCount === 1 ? "" : "s"}.`, sample: result.sample });
      } else {
        setTestResult({ ok: false, text: result.error ?? "Connection test failed" });
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setTesting(false);
    }
  }

  async function handleActivate() {
    setActivating(true);
    try {
      const res = await fetch(`/api/employer/setup/${requestId}/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const json = await readJson(res);
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setConnector(json.connector);
      showToast("Integration activated. The pilot's logbook will start syncing.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setActivating(false);
    }
  }

  const card = { backgroundColor: "var(--bg-card)", borderColor: "var(--border-default)" } as const;

  if (loading) {
    return (
      <div className="min-h-screen p-6" style={{ backgroundColor: "var(--bg-primary)" }}>
        <div className="max-w-2xl mx-auto space-y-6 pt-6">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: "var(--bg-primary)" }}>
        <div className="w-full max-w-2xl">
          <Banner severity="critical" title="Could not load setup">
            {loadError}
          </Banner>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6" style={{ backgroundColor: "var(--bg-primary)" }}>
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="rounded-2xl border p-6" style={card}>
          <h1 className="text-xl font-semibold" style={{ color: "var(--aviation-blue)" }}>
            Employer integration setup
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            A pilot has asked to import their own flight records into their personal logbook. Enter the API details below; the key you paste is stored encrypted and is never shown again.
          </p>
          {request?.setupTokenExpiresAt && (
            <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
              This link is valid until {new Date(request.setupTokenExpiresAt).toLocaleDateString()}.
            </p>
          )}
        </div>

        <div className="rounded-2xl border p-6" style={card}>
          <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
            Request details
          </h2>
          <div className="space-y-2 text-sm">
            {[
              ["Company", request?.companyName],
              ["Crew ID", request?.crewId],
              ["Pilot contact", request?.contactEmail],
            ].map(([label, value]) => (
              <div className="flex" key={label}>
                <span className="w-32" style={{ color: "var(--text-secondary)" }}>
                  {label}:
                </span>
                <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border p-6" style={card}>
          <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
            API configuration
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-primary)" }}>
                API base URL
              </label>
              <input type="url" value={apiBaseUrl} onChange={(e) => setApiBaseUrl(e.target.value)} className={`${inputClass} font-mono`} style={{ color: "var(--text-primary)" }} placeholder="https://api.yourcompany.com/crew" />
              {apiBaseUrl && !urlOk && (
                <p className="text-xs mt-1" style={{ color: "var(--status-error)" }}>
                  Must start with https://
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>
                Authentication
              </label>
              <div className="space-y-2">
                {AUTH_OPTIONS.map((o) => (
                  <label key={o.value} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="authType" value={o.value} checked={authType === o.value} onChange={() => setAuthType(o.value)} className="w-4 h-4" />
                    <span className="text-sm" style={{ color: "var(--text-primary)" }}>
                      {o.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {authType === "api_key" && (
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-primary)" }}>
                  Header name
                </label>
                <input value={authHeaderName} onChange={(e) => setAuthHeaderName(e.target.value)} className={`${inputClass} font-mono`} style={{ color: "var(--text-primary)" }} placeholder="X-API-Key" />
              </div>
            )}

            {authType !== "none" && (
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-primary)" }}>
                  {authType === "basic" ? "Username:password" : "API key / token"}
                </label>
                <input type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} className={`${inputClass} font-mono`} style={{ color: "var(--text-primary)" }} placeholder={connector?.hasSecret ? "•••••••• (already stored - paste to replace)" : "Paste the key or token"} />
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                  Please issue a read-only credential scoped to this pilot&apos;s own flights.
                </p>
              </div>
            )}

            <div className="rounded-xl border" style={{ borderColor: "var(--border-default)" }}>
              <button type="button" onClick={() => setShowMapping((v) => !v)} className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                <span>Response format / field mapping (optional)</span>
                <span style={{ color: configProblems.length ? "var(--status-error)" : "var(--text-muted)" }}>{configProblems.length ? `${configProblems.length} problem${configProblems.length === 1 ? "" : "s"}` : showMapping ? "Hide" : "Show"}</span>
              </button>
              {showMapping && (
                <div className="px-4 pb-4 space-y-2">
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    If your API already returns flights as JSON, describe where each value lives. <code>flightsPath</code> is appended to the base URL, <code>recordsPath</code> points at the list of flights, <code>externalKeyPath</code> is a stable id per flight, and <code>fields</code> maps logbook fields to paths such as <code>dep.icao</code>. You can leave this for the pilot to adjust later.
                  </p>
                  <textarea value={configText} onChange={(e) => setConfigText(e.target.value)} spellCheck={false} className={`${inputClass} font-mono text-xs min-h-[280px]`} style={{ color: "var(--text-primary)" }} />
                  {configProblems.length > 0 && (
                    <Banner severity="warning" size="compact">
                      {configProblems.join("; ")}
                    </Banner>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-3 flex-wrap">
              <button onClick={handleTestConnection} disabled={!canTest} className="rounded-xl px-6 py-3 font-medium disabled:opacity-50 transition-colors hover:bg-[var(--border-default)]" style={{ backgroundColor: "var(--bg-hover)", color: "var(--text-primary)" }}>
                {testing ? "Testing..." : "Save & test connection"}
              </button>
              <button onClick={handleActivate} disabled={!canActivate} className="rounded-xl text-white px-6 py-3 disabled:opacity-50 font-medium transition-opacity hover:opacity-90" style={{ backgroundColor: "var(--aviation-blue)" }}>
                {activating ? "Activating..." : connector?.status === "active" ? "Activated" : "Activate"}
              </button>
            </div>
            {connector && !canActivate && connector.status !== "active" && (
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Activate becomes available after a successful connection test.
              </p>
            )}
          </div>
        </div>

        {testResult && (
          <Banner severity={testResult.ok ? "success" : "critical"} title={testResult.ok ? "Connection test passed" : "Connection test failed"}>
            <p>{testResult.text}</p>
            {testResult.sample && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs">First record after field mapping</summary>
                <pre className="mt-1 text-[11px] overflow-auto max-h-60">{JSON.stringify(testResult.sample, null, 2)}</pre>
              </details>
            )}
          </Banner>
        )}

        {connector && (
          <div className="rounded-2xl border p-6" style={severityCardStyle(connector.status === "active" ? "success" : connector.lastTestError ? "critical" : "neutral")}>
            <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
              Connection status
            </h2>
            <div className="space-y-2 text-sm">
              <div className="flex">
                <span className="w-32" style={{ color: "var(--text-secondary)" }}>
                  Status:
                </span>
                <span className="font-medium">{connector.status === "active" ? "ACTIVE" : connector.lastTestError ? "TEST FAILED" : "CONFIGURED - NOT ACTIVE"}</span>
              </div>
              <div className="flex">
                <span className="w-32" style={{ color: "var(--text-secondary)" }}>
                  Credential:
                </span>
                <span>{connector.hasSecret ? "stored (encrypted)" : connector.authType === "none" ? "not required" : "missing"}</span>
              </div>
              {connector.lastTestAt && (
                <div className="flex">
                  <span className="w-32" style={{ color: "var(--text-secondary)" }}>
                    Last tested:
                  </span>
                  <span>{new Date(connector.lastTestAt).toLocaleString()}</span>
                </div>
              )}
              {connector.lastTestError && (
                <div className="flex">
                  <span className="w-32" style={{ color: "var(--text-secondary)" }}>
                    Error:
                  </span>
                  <span className="font-medium">{connector.lastTestError}</span>
                </div>
              )}
            </div>

            {connector.status === "active" && (
              <div className="mt-4 p-4 rounded-xl border" style={card}>
                <p className="font-medium flex items-center gap-1.5" style={{ color: "var(--severity-success-text)" }}>
                  <Check size={14} strokeWidth={3} />
                  Integration is active. You can close this page.
                </p>
                <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
                  The pilot&apos;s logbook now fetches their flights on a schedule.
                  {connector.lastSyncAt && <> Last sync: {new Date(connector.lastSyncAt).toLocaleString()}.</>}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
