"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useToast } from "@/components/ui/ToastProvider";

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
      <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
        <div className="w-full max-w-2xl rounded-2xl border border-red-200 p-6 bg-white">
          <h1 className="text-xl font-semibold text-red-900">Could not load setup</h1>
          <p className="text-sm text-red-600 mt-2">{loadError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 bg-gray-50">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="rounded-2xl border border-gray-200 p-6 bg-white">
          <h1 className="text-xl font-semibold text-gray-900">Employer Integration Setup</h1>
          <p className="text-sm text-gray-600 mt-1">
            Configure API access for pilot logbook data synchronization
          </p>
        </div>

        {/* Request Details */}
        <div className="rounded-2xl border border-gray-200 p-6 bg-white">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Request Details</h2>
          <div className="space-y-2 text-sm">
            <div className="flex">
              <span className="w-32 text-gray-600">Company:</span>
              <span className="text-gray-900 font-medium">{request?.companyName}</span>
            </div>
            <div className="flex">
              <span className="w-32 text-gray-600">Crew ID:</span>
              <span className="text-gray-900 font-medium">{request?.crewId}</span>
            </div>
            <div className="flex">
              <span className="w-32 text-gray-600">Contact Email:</span>
              <span className="text-gray-900 font-medium">{request?.contactEmail}</span>
            </div>
          </div>
        </div>

        {/* Configuration Form */}
        <div className="rounded-2xl border border-gray-200 p-6 bg-white">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">API Configuration</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">
                API Base URL
              </label>
              <input
                type="text"
                value={apiBaseUrl}
                onChange={(e) => setApiBaseUrl(e.target.value)}
                className="w-full rounded-xl border border-gray-300 p-3 text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:outline-none"
                placeholder="https://api.yourcompany.com/crew"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">
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
                  <span className="text-sm text-gray-900">API Key</span>
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
                  <span className="text-sm text-gray-900">Bearer Token</span>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">
                Secret / Token
              </label>
              <input
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                className="w-full rounded-xl border border-gray-300 p-3 text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:outline-none"
                placeholder="Enter API key or token"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleTestConnection}
                disabled={!apiBaseUrl || !secret}
                className="rounded-xl bg-gray-100 text-gray-900 px-6 py-3 disabled:opacity-50 hover:bg-gray-200 font-medium"
              >
                Test Connection
              </button>
              <button
                onClick={handleActivate}
                disabled={!connector || connector.status !== "inactive" || !!connector.lastError}
                className="rounded-xl bg-black text-white px-6 py-3 disabled:opacity-50 hover:bg-gray-800 font-medium"
              >
                Activate
              </button>
            </div>
          </div>
        </div>

        {/* Status Box */}
        {connector && (
          <div
            className={`rounded-2xl border p-6 ${
              connector.status === "active"
                ? "bg-green-50 border-green-200"
                : connector.status === "error"
                ? "bg-red-50 border-red-200"
                : "bg-gray-50 border-gray-200"
            }`}
          >
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Connection Status</h2>
            <div className="space-y-2 text-sm">
              <div className="flex">
                <span className="w-32 text-gray-600">Status:</span>
                <span
                  className={`font-medium ${
                    connector.status === "active"
                      ? "text-green-900"
                      : connector.status === "error"
                      ? "text-red-900"
                      : "text-gray-900"
                  }`}
                >
                  {connector.status.toUpperCase()}
                </span>
              </div>
              {connector.lastTestAt && (
                <div className="flex">
                  <span className="w-32 text-gray-600">Last Tested:</span>
                  <span className="text-gray-900">
                    {new Date(connector.lastTestAt).toLocaleString()}
                  </span>
                </div>
              )}
              {connector.lastError && (
                <div className="flex">
                  <span className="w-32 text-gray-600">Error:</span>
                  <span className="text-red-900 font-medium">{connector.lastError}</span>
                </div>
              )}
            </div>

            {connector.status === "active" && (
              <div className="mt-4 space-y-3">
                <div className="p-4 bg-white rounded-xl border border-green-200">
                  <p className="text-green-900 font-medium">
                    ✓ Integration is active. Automatic sync is coming soon.
                  </p>
                </div>

                <div className="p-4 bg-white rounded-xl border border-gray-200">
                  <h3 className="font-semibold text-gray-900 mb-1">Sync</h3>
                  <p className="text-sm text-gray-700">This version does not sync flight data yet.</p>

                  {connector.lastSyncAttemptAt && (
                    <div className="text-sm text-gray-600">
                      Last attempt: {new Date(connector.lastSyncAttemptAt).toLocaleString()}
                      {connector.lastSyncStatus && (
                        <span className="ml-2 text-gray-700">({connector.lastSyncStatus})</span>
                      )}
                    </div>
                  )}
                  {connector.lastSyncStatus === "error" && connector.lastSyncError && (
                    <div className="text-sm text-red-700 mt-1">Sync error: {connector.lastSyncError}</div>
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
