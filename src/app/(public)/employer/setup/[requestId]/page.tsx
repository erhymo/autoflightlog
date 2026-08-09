"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useToast } from "@/components/ui/ToastProvider";
import { Banner } from "@/components/ui/Banner";
import { Skeleton } from "@/components/ui/Skeleton";
import { severityCardStyle } from "@/lib/ui/statusColors";
import { Check } from "lucide-react";

interface IntegrationRequest {
  companyName: string;
  contactEmail: string;
  crewId: string;
}

interface Connector {
  id: string;
  requestId: string;
  companyName: string;
  crewId: string;
  apiBaseUrl: string;
  authType: "api_key" | "bearer_token";
  secret: string;
  status: "inactive" | "active" | "error";
  lastTestAt?: string;
  lastError?: string;
  lastSyncAt?: string;
  lastSyncAttemptAt?: string;
  lastSyncStatus?: string;
  lastSyncError?: string;
  autoSyncEnabled?: boolean;
  syncIntervalMinutes?: number;
  nextSyncAt?: string;
  consecutiveFailures?: number;
}

export default function EmployerSetupPage() {
  const params = useParams();
  const requestId = params.requestId as string;
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const { showToast } = useToast();

  const [request, setRequest] = useState<IntegrationRequest | null>(null);
  const [connector, setConnector] = useState<Connector | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [authType, setAuthType] = useState<"api_key" | "bearer_token">("api_key");
  const [secret, setSecret] = useState("");

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
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
        if (cancelled) return;

        setRequest(json.request);
        if (json.connector) {
          setConnector(json.connector);
          setApiBaseUrl(json.connector.apiBaseUrl);
          setAuthType(json.connector.authType);
          setSecret(json.connector.secret);
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

  async function handleTestConnection() {
    try {
      const res = await fetch(`/api/employer/setup/${requestId}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, apiBaseUrl, authType, secret }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setConnector(json.connector);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), "error");
    }
  }

  async function handleActivate() {
    if (!connector || connector.lastError) {
      showToast("Please test the connection successfully first", "error");
      return;
    }
    try {
      const res = await fetch(`/api/employer/setup/${requestId}/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setConnector(json.connector);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), "error");
    }
  }

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
        <div className="rounded-2xl border p-6" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-default)" }}>
          <h1 className="text-xl font-semibold" style={{ color: "var(--aviation-blue)" }}>Employer Integration Setup</h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            Configure API access for pilot logbook data synchronization
          </p>
        </div>

        {/* Request Details */}
        <div className="rounded-2xl border p-6" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-default)" }}>
          <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Request Details</h2>
          <div className="space-y-2 text-sm">
            <div className="flex">
              <span className="w-32" style={{ color: "var(--text-secondary)" }}>Company:</span>
              <span className="font-medium" style={{ color: "var(--text-primary)" }}>{request?.companyName}</span>
            </div>
            <div className="flex">
              <span className="w-32" style={{ color: "var(--text-secondary)" }}>Crew ID:</span>
              <span className="font-medium" style={{ color: "var(--text-primary)" }}>{request?.crewId}</span>
            </div>
            <div className="flex">
              <span className="w-32" style={{ color: "var(--text-secondary)" }}>Contact Email:</span>
              <span className="font-medium" style={{ color: "var(--text-primary)" }}>{request?.contactEmail}</span>
            </div>
          </div>
        </div>

        {/* Configuration Form */}
        <div className="rounded-2xl border p-6" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-default)" }}>
          <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>API Configuration</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-primary)" }}>
                API Base URL
              </label>
              <input
                type="text"
                value={apiBaseUrl}
                onChange={(e) => setApiBaseUrl(e.target.value)}
                className="w-full rounded-xl border border-[var(--border-default)] p-3 focus:outline-none focus:border-[var(--aviation-blue)]"
                style={{ color: "var(--text-primary)" }}
                placeholder="https://api.yourcompany.com/crew"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>
                Authentication Type
              </label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="authType"
                    value="api_key"
                    checked={authType === "api_key"}
                    onChange={(e) => setAuthType(e.target.value as "api_key")}
                    className="w-4 h-4"
                  />
                  <span className="text-sm" style={{ color: "var(--text-primary)" }}>API Key</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="authType"
                    value="bearer_token"
                    checked={authType === "bearer_token"}
                    onChange={(e) => setAuthType(e.target.value as "bearer_token")}
                    className="w-4 h-4"
                  />
                  <span className="text-sm" style={{ color: "var(--text-primary)" }}>Bearer Token</span>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-primary)" }}>
                Secret / Token
              </label>
              <input
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                className="w-full rounded-xl border border-[var(--border-default)] p-3 focus:outline-none focus:border-[var(--aviation-blue)]"
                style={{ color: "var(--text-primary)" }}
                placeholder="Enter API key or token"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleTestConnection}
                disabled={!apiBaseUrl || !secret}
                className="rounded-xl px-6 py-3 font-medium disabled:opacity-50 transition-colors hover:bg-[var(--border-default)]"
                style={{ backgroundColor: "var(--bg-hover)", color: "var(--text-primary)" }}
              >
                Test Connection
              </button>
              <button
                onClick={handleActivate}
                disabled={!connector || connector.status !== "inactive" || !!connector.lastError}
                className="rounded-xl text-white px-6 py-3 disabled:opacity-50 font-medium transition-opacity hover:opacity-90"
                style={{ backgroundColor: "var(--aviation-blue)" }}
              >
                Activate
              </button>
            </div>
          </div>
        </div>

        {/* Status Box */}
        {connector && (
          <div
            className="rounded-2xl border p-6"
            style={severityCardStyle(
              connector.status === "active" ? "success" : connector.status === "error" ? "critical" : "neutral"
            )}
          >
            <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Connection Status</h2>
            <div className="space-y-2 text-sm">
              <div className="flex">
                <span className="w-32" style={{ color: "var(--text-secondary)" }}>Status:</span>
                <span className="font-medium">{connector.status.toUpperCase()}</span>
              </div>
              {connector.lastTestAt && (
                <div className="flex">
                  <span className="w-32" style={{ color: "var(--text-secondary)" }}>Last Tested:</span>
                  <span>{new Date(connector.lastTestAt).toLocaleString()}</span>
                </div>
              )}
              {connector.lastError && (
                <div className="flex">
                  <span className="w-32" style={{ color: "var(--text-secondary)" }}>Error:</span>
                  <span className="font-medium">{connector.lastError}</span>
                </div>
              )}
            </div>

            {connector.status === "active" && (
              <div className="mt-4 space-y-3">
                <div className="p-4 rounded-xl border" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-default)" }}>
                  <p className="font-medium flex items-center gap-1.5" style={{ color: "var(--severity-success-text)" }}>
                    <Check size={14} strokeWidth={3} />
                    Integration is active. Automatic sync is coming soon.
                  </p>
                </div>

                <div className="p-4 rounded-xl border" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-default)" }}>
                  <h3 className="font-semibold mb-1" style={{ color: "var(--text-primary)" }}>Sync</h3>
                  <p className="text-sm" style={{ color: "var(--text-secondary)" }}>This version does not sync flight data yet.</p>

                  {connector.lastSyncAttemptAt && (
                    <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                      Last attempt: {new Date(connector.lastSyncAttemptAt).toLocaleString()}
                      {connector.lastSyncStatus && (
                        <span className="ml-2">({connector.lastSyncStatus})</span>
                      )}
                    </div>
                  )}
                  {connector.lastSyncStatus === "error" && connector.lastSyncError && (
                    <div className="text-sm mt-1" style={{ color: "var(--status-error)" }}>Sync error: {connector.lastSyncError}</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
