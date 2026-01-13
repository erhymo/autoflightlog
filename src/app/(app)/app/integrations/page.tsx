"use client";

import { useEffect, useState } from "react";
import { listIntegrationRequests, addIntegrationRequest, getConnectorByRequestId, runMockSync } from "@/lib/repo/mockRepos";

interface IntegrationRequest {
  id: string;
  companyName: string;
  contactEmail: string;
  crewId: string;
  createdAt: string;
  status: "draft" | "sent";
}

function generateEmailDraft(request: IntegrationRequest): string {
  return `Subject: API Integration Request for AutoFlightLog Flight Logbook Data

Dear ${request.companyName} IT Team,

I am writing to request API access to my personal flight logbook data stored in your crew management system for use with AutoFlightLog, my professional flight logbook application.

Details:
- Pilot Crew ID / Employee ID: ${request.crewId}
- Contact Email: ${request.contactEmail}

Requirements:
- We only need READ-ONLY access to my personal flight data
- Data will be fetched automatically twice per day (polling)
- You can provide access via API token or API key
- All data transmission will be secure and encrypted

To set up this integration, please visit:
http://localhost:3000/employer/setup/${request.id}

This link contains instructions for configuring the API endpoint and generating secure credentials.

If you have any questions or need additional information, please don't hesitate to contact me.

Best regards,
[Your Name]`;
}

interface RequestWithConnector extends IntegrationRequest {
  connector?: any;
}

export default function IntegrationsPage() {
  const [requests, setRequests] = useState<RequestWithConnector[]>([]);
  const [companyName, setCompanyName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [crewId, setCrewId] = useState("");
  const [selectedRequest, setSelectedRequest] = useState<RequestWithConnector | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<{ connectorId: string; inserted: number; updated: number } | null>(null);

  async function loadRequests() {
    const data = await listIntegrationRequests();

    // Enrich requests with connector data
    const enriched = await Promise.all(
      data.map(async (req: any) => {
        const connector = await getConnectorByRequestId(req.id);
        return { ...req, connector };
      })
    );

    setRequests(enriched as RequestWithConnector[]);
    setLoading(false);
  }

  useEffect(() => {
    loadRequests();
  }, []);

  async function handleGenerateRequest() {
    const request: IntegrationRequest = {
      id: "req_" + Math.random().toString(36).slice(2),
      companyName,
      contactEmail,
      crewId,
      createdAt: new Date().toISOString(),
      status: "draft",
    };

    await addIntegrationRequest(request);
    await loadRequests();

    // Select the new request to show details
    setSelectedRequest({ ...request, connector: null });

    // Clear form
    setCompanyName("");
    setContactEmail("");
    setCrewId("");
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    alert("Copied to clipboard!");
  }

  function getRequestStatus(req: RequestWithConnector): "pending" | "configured" | "active" {
    if (!req.connector) return "pending";
    if (req.connector.status === "active") return "active";
    return "configured";
  }

  function getStatusColor(status: string) {
    switch (status) {
      case "active":
        return { bg: "#DCFCE7", text: "var(--status-active)", border: "#86EFAC" };
      case "configured":
        return { bg: "#DBEAFE", text: "var(--status-info)", border: "#93C5FD" };
      default:
        return { bg: "#FEF3C7", text: "var(--status-pending)", border: "#FCD34D" };
    }
  }

  function getStatusText(status: string) {
    switch (status) {
      case "active":
        return "✓ Active";
      case "configured":
        return "⚙ Configured";
      default:
        return "⏳ Pending Setup";
    }
  }

  async function handleRunSync(connectorId: string) {
    try {
      setSyncing(connectorId);
      setSyncResult(null);

      const result = await runMockSync(connectorId);
      setSyncResult({ connectorId, ...result });

      // Reload requests to get updated lastSyncAt
      await loadRequests();

      // Auto-hide toast after 5 seconds
      setTimeout(() => {
        setSyncResult(null);
      }, 5000);
    } catch (error) {
      alert(`Sync failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setSyncing(null);
    }
  }

  if (loading) {
    return (
      <div className="p-6 md:p-8">
        <h1 className="text-2xl font-semibold mb-4" style={{ color: "var(--aviation-blue)" }}>
          Integrations
        </h1>
        <p style={{ color: "var(--text-secondary)" }}>Loading...</p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold" style={{ color: "var(--aviation-blue)" }}>
          Integrations
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
          Connect with your employer to automatically sync flight data
        </p>
      </div>

      {/* Sync Toast */}
      {syncResult && (
        <div
          className="fixed top-4 right-4 md:right-8 rounded-xl border p-4 shadow-lg animate-slide-in z-50"
          style={{
            backgroundColor: "#DCFCE7",
            borderColor: "#86EFAC"
          }}
        >
          <p className="font-medium" style={{ color: "var(--status-active)" }}>
            ✓ Sync completed: {syncResult.inserted} inserted, {syncResult.updated} updated
          </p>
        </div>
      )}

      {/* Existing Integrations */}
      {requests.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold" style={{ color: "var(--aviation-blue)" }}>
            Your Integrations
          </h2>
          <div className="grid gap-3">
            {requests.map((req) => {
              const status = getRequestStatus(req);
              const statusColors = getStatusColor(status);
              const isActive = status === "active";
              const isSyncing = syncing === req.connector?.id;

              return (
                <div
                  key={req.id}
                  className="rounded-xl border p-4 transition-all"
                  style={{
                    backgroundColor: "var(--bg-card)",
                    borderColor: selectedRequest?.id === req.id ? "var(--aviation-blue)" : "var(--border-default)",
                    boxShadow: selectedRequest?.id === req.id ? "0 0 0 2px rgba(15, 42, 68, 0.1)" : "none"
                  }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div
                      className="flex-1 cursor-pointer"
                      onClick={() => setSelectedRequest(req)}
                    >
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="font-semibold" style={{ color: "var(--text-primary)" }}>
                          {req.companyName}
                        </h3>
                        <span
                          className="px-2.5 py-1 rounded-full text-xs font-medium border"
                          style={{
                            backgroundColor: statusColors.bg,
                            color: statusColors.text,
                            borderColor: statusColors.border
                          }}
                        >
                          {getStatusText(status)}
                        </span>
                      </div>
                      <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
                        Crew ID: {req.crewId}
                      </p>
						{req.connector?.lastSyncAttemptAt && (
							<p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
								Last attempt: {new Date(req.connector.lastSyncAttemptAt).toLocaleString()}
								{req.connector?.lastSyncStatus ? ` (${req.connector.lastSyncStatus})` : ""}
							</p>
						)}
						{req.connector?.lastSyncStatus === "error" && req.connector?.lastSyncError && (
							<p className="text-xs mt-1" style={{ color: "var(--status-error)" }}>
								Sync error: {req.connector.lastSyncError}
							</p>
						)}
						{isActive && req.connector?.nextSyncAt && (
							<p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
								Next sync: {new Date(req.connector.nextSyncAt).toLocaleString()}
							</p>
						)}
                    </div>

                    {/* Sync Button for Active Integrations */}
                    {isActive && req.connector && (
                      <div className="flex items-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRunSync(req.connector.id);
                          }}
                          disabled={isSyncing}
                          className="rounded-lg px-4 py-2 disabled:opacity-50 font-medium text-sm whitespace-nowrap text-white transition-all"
                          style={{ backgroundColor: "var(--aviation-blue)" }}
                          onMouseEnter={(e) => !isSyncing && (e.currentTarget.style.opacity = "0.9")}
                          onMouseLeave={(e) => !isSyncing && (e.currentTarget.style.opacity = "1")}
                        >
                          {isSyncing ? "Syncing..." : "Run Sync Now"}
                        </button>
                      </div>
                    )}

                    {!isActive && (
                      <div className="text-sm" style={{ color: "var(--text-muted)" }}>
                        {new Date(req.createdAt).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Request Form */}
      <div
        className="rounded-xl border p-6"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-default)"
        }}
      >
        <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--aviation-blue)" }}>
          {requests.length === 0 ? "Create Your First Integration" : "Add New Integration"}
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>
              Company Name
            </label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full rounded-lg border p-3 transition-colors"
              style={{
                borderColor: "var(--border-default)",
                color: "var(--text-primary)"
              }}
              onFocus={(e) => e.target.style.borderColor = "var(--aviation-blue)"}
              onBlur={(e) => e.target.style.borderColor = "var(--border-default)"}
              placeholder="e.g., Acme Airlines"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>
              IT Contact Email
            </label>
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className="w-full rounded-lg border p-3 transition-colors"
              style={{
                borderColor: "var(--border-default)",
                color: "var(--text-primary)"
              }}
              onFocus={(e) => e.target.style.borderColor = "var(--aviation-blue)"}
              onBlur={(e) => e.target.style.borderColor = "var(--border-default)"}
              placeholder="e.g., it-support@acmeairlines.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>
              Your Crew ID / Employee ID
            </label>
            <input
              type="text"
              value={crewId}
              onChange={(e) => setCrewId(e.target.value)}
              className="w-full rounded-lg border p-3 transition-colors"
              style={{
                borderColor: "var(--border-default)",
                color: "var(--text-primary)"
              }}
              onFocus={(e) => e.target.style.borderColor = "var(--aviation-blue)"}
              onBlur={(e) => e.target.style.borderColor = "var(--border-default)"}
              placeholder="e.g., PILOT12345"
            />
          </div>

          <button
            onClick={handleGenerateRequest}
            disabled={!companyName || !contactEmail || !crewId}
            className="rounded-lg px-6 py-3 font-medium text-white disabled:opacity-50 transition-all"
            style={{ backgroundColor: "var(--aviation-blue)" }}
            onMouseEnter={(e) => (!companyName || !contactEmail || !crewId) ? null : e.currentTarget.style.opacity = "0.9"}
            onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
          >
            Create Integration Request
          </button>
        </div>
      </div>

      {/* Selected Request Details */}
      {selectedRequest && (
        <div
          className="rounded-xl border p-6"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-default)"
          }}
        >
          <h2 className="text-lg font-semibold mb-6" style={{ color: "var(--aviation-blue)" }}>
            Setup Instructions for {selectedRequest.companyName}
          </h2>

          {/* Status Steps */}
          <div className="mb-6">
            <div className="flex items-center gap-2 md:gap-4">
              {/* Step 1 */}
              <div className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded-full text-white flex items-center justify-center text-sm font-bold"
                  style={{ backgroundColor: "var(--status-active)" }}
                >
                  ✓
                </div>
                <span className="text-xs md:text-sm font-medium hidden sm:inline" style={{ color: "var(--text-primary)" }}>
                  Request Created
                </span>
              </div>

              <div className="flex-1 h-0.5" style={{ backgroundColor: "var(--border-default)" }}></div>

              {/* Step 2 */}
              <div className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                  style={{
                    backgroundColor: selectedRequest.connector ? "var(--status-active)" : "var(--border-default)",
                    color: selectedRequest.connector ? "#FFFFFF" : "var(--text-muted)"
                  }}
                >
                  {selectedRequest.connector ? "✓" : "2"}
                </div>
                <span className="text-xs md:text-sm font-medium hidden sm:inline" style={{ color: "var(--text-primary)" }}>
                  Employer Setup
                </span>
              </div>

              <div className="flex-1 h-0.5" style={{ backgroundColor: "var(--border-default)" }}></div>

              {/* Step 3 */}
              <div className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                  style={{
                    backgroundColor: selectedRequest.connector?.status === "active" ? "var(--status-active)" : "var(--border-default)",
                    color: selectedRequest.connector?.status === "active" ? "#FFFFFF" : "var(--text-muted)"
                  }}
                >
                  {selectedRequest.connector?.status === "active" ? "✓" : "3"}
                </div>
                <span className="text-xs md:text-sm font-medium hidden sm:inline" style={{ color: "var(--text-primary)" }}>
                  Active
                </span>
              </div>
            </div>
          </div>

          {/* Instructions based on status */}
          {!selectedRequest.connector ? (
            <div className="space-y-4">
              <div
                className="p-4 border rounded-xl"
                style={{
                  backgroundColor: "#DBEAFE",
                  borderColor: "#93C5FD"
                }}
              >
                <p className="text-sm font-medium mb-2" style={{ color: "#1E40AF" }}>
                  📧 Next Step: Send setup link to your employer
                </p>
                <p className="text-sm" style={{ color: "#1E3A8A" }}>
                  Copy the link below and send it to your IT department at{" "}
                  <strong>{selectedRequest.contactEmail}</strong>
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>
                  Employer Setup Link
                </label>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={`http://localhost:3000/employer/setup/${selectedRequest.id}`}
                    className="flex-1 rounded-lg border p-3 text-sm font-mono"
                    style={{
                      borderColor: "var(--border-default)",
                      backgroundColor: "var(--bg-primary)",
                      color: "var(--text-primary)"
                    }}
                  />
                  <button
                    onClick={() =>
                      copyToClipboard(`http://localhost:3000/employer/setup/${selectedRequest.id}`)
                    }
                    className="rounded-lg px-4 py-2 font-medium text-sm text-white transition-all"
                    style={{ backgroundColor: "var(--aviation-blue)" }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = "0.9"}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
                  >
                    Copy Link
                  </button>
                </div>
              </div>

              <details className="mt-4">
                <summary
                  className="cursor-pointer text-sm font-medium transition-colors"
                  style={{ color: "var(--text-primary)" }}
                >
                  Or copy full email template
                </summary>
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
                      Email draft
                    </span>
                    <button
                      onClick={() => copyToClipboard(generateEmailDraft(selectedRequest))}
                      className="rounded-lg px-3 py-1 font-medium text-xs transition-all"
                      style={{
                        backgroundColor: "var(--bg-hover)",
                        color: "var(--text-primary)"
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--border-default)"}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "var(--bg-hover)"}
                    >
                      Copy Email
                    </button>
                  </div>
                  <textarea
                    readOnly
                    value={generateEmailDraft(selectedRequest)}
                    className="w-full h-64 rounded-lg border p-3 text-xs font-mono"
                    style={{
                      borderColor: "var(--border-default)",
                      backgroundColor: "var(--bg-primary)",
                      color: "var(--text-primary)"
                    }}
                  />
                </div>
              </details>
            </div>
          ) : selectedRequest.connector.status === "active" ? (
            <div
              className="p-4 border rounded-xl"
              style={{
                backgroundColor: "#DCFCE7",
                borderColor: "#86EFAC"
              }}
            >
              <p className="font-medium mb-2" style={{ color: "var(--status-active)" }}>
                ✓ Integration is active!
              </p>
              <p className="text-sm" style={{ color: "#166534" }}>
                Your flight data will sync automatically twice daily.
              </p>
					{selectedRequest.connector.lastSyncAttemptAt && (
                <p className="text-sm mt-2" style={{ color: "#15803D" }}>
							Last attempt: {new Date(selectedRequest.connector.lastSyncAttemptAt).toLocaleString()}
							{selectedRequest.connector.lastSyncStatus ? ` (${selectedRequest.connector.lastSyncStatus})` : ""}
                </p>
              )}
					{selectedRequest.connector.lastSyncStatus === "error" && selectedRequest.connector.lastSyncError && (
						<p className="text-sm mt-2" style={{ color: "#991B1B" }}>
							Sync error: {selectedRequest.connector.lastSyncError}
						</p>
					)}
					{selectedRequest.connector.nextSyncAt && (
						<p className="text-sm mt-2" style={{ color: "#15803D" }}>
							Next sync: {new Date(selectedRequest.connector.nextSyncAt).toLocaleString()}
						</p>
					)}
            </div>
          ) : (
            <div
              className="p-4 border rounded-xl"
              style={{
                backgroundColor: "#FEF3C7",
                borderColor: "#FCD34D"
              }}
            >
              <p className="font-medium mb-2" style={{ color: "var(--status-pending)" }}>
                ⚙ Waiting for activation
              </p>
              <p className="text-sm" style={{ color: "#92400E" }}>
                Your employer has configured the connection but hasn't activated it yet.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

