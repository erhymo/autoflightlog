"use client";

import { useMemo, useState } from "react";
import type { Connector, ConnectorAuthType, GenericJsonConfig } from "@/types/integrations";
import { defaultGenericJsonConfig, MAX_SYNC_INTERVAL_MINUTES, MIN_SYNC_INTERVAL_MINUTES } from "@/lib/sync/connectorModel";
import { validateGenericJsonConfig } from "@/lib/sync/adapters/genericJson";
import { FIELD_CATALOG } from "@/types/fieldCatalog";
import { Banner } from "@/components/ui/Banner";

export interface ConnectorFormValues {
  companyName: string;
  crewId: string;
  apiBaseUrl: string;
  authType: ConnectorAuthType;
  authHeaderName: string;
  secret: string;
  syncSince: string;
  syncIntervalMinutes: number;
  autoSyncEnabled: boolean;
  config: GenericJsonConfig;
}

const AUTH_LABELS: Record<ConnectorAuthType, string> = {
  api_key: "API key in a header",
  bearer_token: "Bearer token (Authorization header)",
  basic: "Basic auth (username:password)",
  none: "No authentication",
};

const INTERVAL_OPTIONS = [
  { label: "Every hour", value: 60 },
  { label: "Every 6 hours", value: 6 * 60 },
  { label: "Every 12 hours", value: 12 * 60 },
  { label: "Daily", value: 24 * 60 },
  { label: "Weekly", value: 7 * 24 * 60 },
];

export function connectorToFormValues(connector?: Connector | null): ConnectorFormValues {
  return {
    companyName: connector?.companyName ?? "",
    crewId: connector?.crewId ?? "",
    apiBaseUrl: connector?.apiBaseUrl ?? "",
    authType: connector?.authType ?? "api_key",
    authHeaderName: connector?.authHeaderName ?? "",
    secret: "",
    syncSince: connector?.syncSince ?? "",
    syncIntervalMinutes: connector?.syncIntervalMinutes ?? 12 * 60,
    autoSyncEnabled: connector?.autoSyncEnabled ?? true,
    config: connector?.config ?? defaultGenericJsonConfig(),
  };
}

const inputClass =
  "w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-card)] p-3 text-sm transition-colors focus:outline-none focus:border-[var(--aviation-blue)]";
const labelClass = "block text-sm font-medium mb-1.5";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelClass} style={{ color: "var(--text-primary)" }}>
        {label}
      </label>
      {children}
      {hint && (
        <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}

/**
 * Form for a pilot-managed connector. The "advanced" section exposes the
 * generic JSON adapter config as editable JSON, since we can't know every
 * crew system's response shape up front - once Airlift (or any employer)
 * answers with their API documentation, the mapping is filled in here
 * without a code change.
 */
export function ConnectorForm({
  initial,
  existing,
  submitLabel,
  submitting,
  onSubmit,
  onCancel,
}: {
  initial: ConnectorFormValues;
  /** Set when editing: affects whether a secret is required. */
  existing?: Connector | null;
  submitLabel: string;
  submitting: boolean;
  onSubmit: (values: ConnectorFormValues) => void | Promise<void>;
  onCancel?: () => void;
}) {
  const [values, setValues] = useState<ConnectorFormValues>(initial);
  const [configText, setConfigText] = useState(() => JSON.stringify(initial.config, null, 2));
  const [showAdvanced, setShowAdvanced] = useState(false);

  const configProblems = useMemo(() => {
    try {
      const parsed = JSON.parse(configText) as GenericJsonConfig;
      const problems = validateGenericJsonConfig(parsed);
      const knownIds = new Set(FIELD_CATALOG.map((f) => f.key || f.id));
      for (const fieldId of Object.keys(parsed.fields ?? {})) {
        if (!knownIds.has(fieldId)) problems.push(`fields.${fieldId} is not an EASA field id`);
      }
      return problems;
    } catch {
      return ["Adapter configuration is not valid JSON"];
    }
  }, [configText]);

  const needsSecret = values.authType !== "none" && !(existing?.hasSecret && !values.secret);
  const secretMissing = values.authType !== "none" && !values.secret && !existing?.hasSecret;
  const urlOk = /^https:\/\/[^\s/]+/i.test(values.apiBaseUrl.trim());
  const canSubmit = !submitting && values.companyName.trim() && urlOk && !secretMissing && configProblems.length === 0;

  function set<K extends keyof ConnectorFormValues>(key: K, value: ConnectorFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const config = JSON.parse(configText) as GenericJsonConfig;
    await onSubmit({ ...values, config });
  }

  const fieldIdHelp = FIELD_CATALOG.map((f) => f.key || f.id).join(", ");

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Company / system name">
          <input className={inputClass} style={{ color: "var(--text-primary)" }} value={values.companyName} onChange={(e) => set("companyName", e.target.value)} placeholder="e.g. Airlift" />
        </Field>
        <Field label="Your crew ID (optional)" hint="Sent as a query parameter if the mapping below uses crewIdParam.">
          <input className={inputClass} style={{ color: "var(--text-primary)" }} value={values.crewId} onChange={(e) => set("crewId", e.target.value)} placeholder="e.g. OMY" />
        </Field>
      </div>

      <Field label="API base URL" hint="Must use https. The flights path from the mapping is appended to this.">
        <input className={`${inputClass} font-mono`} style={{ color: "var(--text-primary)" }} value={values.apiBaseUrl} onChange={(e) => set("apiBaseUrl", e.target.value)} placeholder="https://api.example.com/v1" inputMode="url" />
        {values.apiBaseUrl && !urlOk && (
          <p className="text-xs mt-1" style={{ color: "var(--status-error)" }}>
            Must start with https://
          </p>
        )}
      </Field>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Authentication">
          <select className={inputClass} style={{ color: "var(--text-primary)" }} value={values.authType} onChange={(e) => set("authType", e.target.value as ConnectorAuthType)}>
            {(Object.keys(AUTH_LABELS) as ConnectorAuthType[]).map((t) => (
              <option key={t} value={t}>
                {AUTH_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
        {values.authType === "api_key" && (
          <Field label="Header name" hint='Defaults to "X-API-Key".'>
            <input className={`${inputClass} font-mono`} style={{ color: "var(--text-primary)" }} value={values.authHeaderName} onChange={(e) => set("authHeaderName", e.target.value)} placeholder="X-API-Key" />
          </Field>
        )}
      </div>

      {values.authType !== "none" && (
        <Field
          label={values.authType === "basic" ? "Username:password" : "API key / token"}
          hint={
            existing?.hasSecret
              ? "A secret is already stored (encrypted). Leave empty to keep it, or paste a new one to replace it."
              : "Stored encrypted on the server and never shown again."
          }
        >
          <input
            type="password"
            autoComplete="off"
            className={`${inputClass} font-mono`}
            style={{ color: "var(--text-primary)" }}
            value={values.secret}
            onChange={(e) => set("secret", e.target.value)}
            placeholder={existing?.hasSecret ? "•••••••• (unchanged)" : needsSecret ? "Paste the key/token you were given" : ""}
          />
        </Field>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Only import flights from" hint="Leave empty to import everything the API returns.">
          <input type="date" className={inputClass} style={{ color: "var(--text-primary)" }} value={values.syncSince} onChange={(e) => set("syncSince", e.target.value)} />
        </Field>
        <Field label="Automatic sync" hint="Also runs when you press Sync now.">
          <select
            className={inputClass}
            style={{ color: "var(--text-primary)" }}
            value={values.autoSyncEnabled ? String(values.syncIntervalMinutes) : "off"}
            onChange={(e) => {
              if (e.target.value === "off") set("autoSyncEnabled", false);
              else {
                set("autoSyncEnabled", true);
                set("syncIntervalMinutes", Math.min(MAX_SYNC_INTERVAL_MINUTES, Math.max(MIN_SYNC_INTERVAL_MINUTES, Number(e.target.value))));
              }
            }}
          >
            {INTERVAL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
            <option value="off">Off (manual only)</option>
          </select>
        </Field>
      </div>

      <div className="rounded-lg border" style={{ borderColor: "var(--border-default)" }}>
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium"
          style={{ color: "var(--text-primary)" }}
        >
          <span>Field mapping (advanced)</span>
          <span style={{ color: configProblems.length ? "var(--status-error)" : "var(--text-muted)" }}>
            {configProblems.length ? `${configProblems.length} problem${configProblems.length === 1 ? "" : "s"}` : showAdvanced ? "Hide" : "Show"}
          </span>
        </button>
        {showAdvanced && (
          <div className="px-4 pb-4 space-y-3">
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
              Describes where in the API response each logbook field lives. <code>flightsPath</code> is appended to the base URL,{" "}
              <code>recordsPath</code> points at the list of flights in the response (empty = the response itself),{" "}
              <code>externalKeyPath</code> is a stable id per flight, and <code>fields</code> maps EASA field ids to paths like{" "}
              <code>dep.icao</code> or <code>legs[0].blockMinutes</code>. <code>durationFormat</code> is one of auto, minutes, hours_decimal, hhmm.
            </p>
            <textarea
              className={`${inputClass} font-mono text-xs min-h-[320px]`}
              style={{ color: "var(--text-primary)" }}
              value={configText}
              onChange={(e) => setConfigText(e.target.value)}
              spellCheck={false}
            />
            {configProblems.length > 0 && (
              <Banner severity="warning" size="compact">
                <ul className="list-disc ml-4 space-y-0.5">
                  {configProblems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </Banner>
            )}
            <details>
              <summary className="text-xs cursor-pointer" style={{ color: "var(--text-secondary)" }}>
                Valid EASA field ids
              </summary>
              <p className="text-xs mt-1 font-mono break-words" style={{ color: "var(--text-muted)" }}>
                {fieldIdHelp}
              </p>
            </details>
            <button
              type="button"
              className="text-xs underline"
              style={{ color: "var(--aviation-blue)" }}
              onClick={() => setConfigText(JSON.stringify(defaultGenericJsonConfig(), null, 2))}
            >
              Reset to template
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-lg px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50 transition-opacity hover:opacity-90"
          style={{ backgroundColor: "var(--aviation-blue)" }}
        >
          {submitting ? "Saving..." : submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded-lg px-5 py-2.5 text-sm font-medium border transition-colors hover:bg-[var(--bg-hover)]"
            style={{ borderColor: "var(--border-default)", color: "var(--text-primary)" }}
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
