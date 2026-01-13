"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { listIntegrationRequests, upsertConnector, getConnectorByRequestId, runMockSync } from "@/lib/repo/mockRepos";

interface IntegrationRequest {
  id: string;
  companyName: string;
  contactEmail: string;
  crewId: string;
  createdAt: string;
  status: "draft" | "sent";
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

  const [request, setRequest] = useState<IntegrationRequest | null>(null);
  const [connector, setConnector] = useState<Connector | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [authType, setAuthType] = useState<"api_key" | "bearer_token">("api_key");
  const [secret, setSecret] = useState("");
  const [syncResult, setSyncResult] = useState<{ inserted: number; updated: number } | null>(null);
  const [syncing, setSyncing] = useState(false);

  async function loadData() {
    const requests = await listIntegrationRequests();
    const found = requests.find((r: any) => r.id === requestId);

    if (!found) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    setRequest(found as IntegrationRequest);

    const existingConnector = await getConnectorByRequestId(requestId);
    if (existingConnector) {
      setConnector(existingConnector);
      setApiBaseUrl(existingConnector.apiBaseUrl);
      setAuthType(existingConnector.authType);
      setSecret(existingConnector.secret);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, [requestId]);

  async function handleTestConnection() {
    if (!request) return;

    let status: "inactive" | "error" = "inactive";
    let lastError: string | null = null;

    if (!apiBaseUrl.startsWith("https://")) {
      status = "error";
      lastError = "Base URL must start with https://";
    } else if (secret.length < 8) {
      status = "error";
      lastError = "Token too short";
    }

    const newConnector: Connector = {
      id: connector?.id || "conn_" + Math.random().toString(36).slice(2),
      requestId,
      companyName: request.companyName,
      crewId: request.crewId,
      apiBaseUrl,
      authType,
      secret,
      status,
      lastTestAt: new Date().toISOString(),
      lastError: lastError || undefined,
    };

    await upsertConnector(newConnector);
    setConnector(newConnector);
  }

  async function handleActivate() {
    if (!connector || connector.lastError) {
      alert("Please test the connection successfully first");
      return;
    }

    const updatedConnector: Connector = {
      ...connector,
      status: "active",
			autoSyncEnabled: true,
			syncIntervalMinutes: connector.syncIntervalMinutes ?? 12 * 60,
			nextSyncAt: new Date().toISOString(),
    };

    await upsertConnector(updatedConnector);
    setConnector(updatedConnector);
  }

  async function handleRunSync() {
    if (!connector) return;

    try {
      setSyncing(true);
      const result = await runMockSync(connector.id);
      setSyncResult(result);

      // Reload connector to get updated lastSyncAt
      const updatedConnector = await getConnectorByRequestId(requestId);
      if (updatedConnector) {
        setConnector(updatedConnector);
      }
    } catch (error) {
      alert(`Sync failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setSyncing(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
        <div className="w-full max-w-2xl rounded-2xl border border-red-200 p-6 bg-white">
          <h1 className="text-xl font-semibold text-red-900">Request Not Found</h1>
          <p className="text-sm text-red-600 mt-2">
            The integration request ID "{requestId}" does not exist.
          </p>
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
                    ✓ Integration is active. The pilot app will sync twice daily.
                  </p>
								  {connector.nextSyncAt && (
									  <p className="text-sm text-green-700 mt-1">
										Next sync: {new Date(connector.nextSyncAt).toLocaleString()}
									  </p>
								  )}
                </div>

                <div className="p-4 bg-white rounded-xl border border-gray-200">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-900">Manual Sync</h3>
                    <button
                      onClick={handleRunSync}
                      disabled={syncing}
                      className="rounded-xl bg-black text-white px-4 py-2 disabled:opacity-50 hover:bg-gray-800 font-medium text-sm"
                    >
                      {syncing ? "Syncing..." : "Run Sync Now"}
                    </button>
                  </div>

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

                  {syncResult && (
                    <div className="mt-3 p-3 bg-green-50 rounded-lg border border-green-200">
                      <p className="text-sm text-green-900 font-medium">
                        Sync completed: {syncResult.inserted} inserted, {syncResult.updated} updated
                      </p>
                    </div>
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

