"use client";

import { useEffect, useMemo, useState } from "react";
import { listCertificates, upsertCertificate, deleteCertificate } from "@/lib/repo/firestoreRepos";
import { getCertificateStatus, CertificateUrgency } from "@/lib/certificates/certificateStatus";
import { Certificate, CertificateType } from "@/types/domain";
import { useToast } from "@/components/ui/ToastProvider";

const TYPE_LABELS: Record<CertificateType, string> = {
  medical: "Medical certificate",
  license: "License",
  rating: "Type rating / qualification",
  english_proficiency: "English proficiency",
  other: "Other",
};

const URGENCY_STYLES: Record<CertificateUrgency, { border: string; bg: string; text: string; label: string }> = {
  expired: { border: "#DC2626", bg: "#FEF2F2", text: "#991B1B", label: "Expired" },
  critical: { border: "#DC2626", bg: "#FEF2F2", text: "#991B1B", label: "Expires soon" },
  warning: { border: "#F59E0B", bg: "#FFFBEB", text: "#92400E", label: "Renew soon" },
  ok: { border: "#16A34A", bg: "#F0FDF4", text: "#166534", label: "Valid" },
};

function nowIso() {
  return new Date().toISOString();
}

function emptyForm(): { type: CertificateType; label: string; expiryDate: string; notes: string } {
  return { type: "medical", label: "", expiryDate: "", notes: "" };
}

export default function CertificatesPage() {
  const { showToast } = useToast();
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  async function refresh() {
    try {
      setLoadError(null);
      const data = await listCertificates();
      setCertificates(data);
    } catch (err) {
      console.error("Certificates load failed", err);
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const sorted = useMemo(() => {
    return [...certificates].sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
  }, [certificates]);

  function startAdd() {
    setEditingId("new");
    setForm(emptyForm());
  }

  function startEdit(cert: Certificate) {
    setEditingId(cert.id);
    setForm({ type: cert.type, label: cert.label, expiryDate: cert.expiryDate, notes: cert.notes || "" });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm());
  }

  async function handleSave() {
    if (!form.label.trim() || !form.expiryDate) {
      showToast("Label and expiry date are required.", "error");
      return;
    }
    const iso = nowIso();
    const existing = editingId !== "new" ? certificates.find((c) => c.id === editingId) : undefined;
    const certificate: Certificate = {
      id: existing?.id || "cert_" + Math.random().toString(36).slice(2),
      type: form.type,
      label: form.label.trim(),
      expiryDate: form.expiryDate,
      notes: form.notes.trim() || undefined,
      createdAt: existing?.createdAt || iso,
      updatedAt: iso,
    };
    try {
      await upsertCertificate(certificate);
      cancelEdit();
      await refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), "error");
    }
  }

  async function handleDelete(id: string) {
    setDeleteConfirm(null);
    try {
      await deleteCertificate(id);
      await refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), "error");
    }
  }

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: "var(--aviation-blue)" }}>
            Certificates &amp; Ratings
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            Track medical, license, and rating expiry dates alongside your flight-time currency.
          </p>
        </div>
        {editingId === null && (
          <button
            onClick={startAdd}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: "var(--aviation-blue)" }}
          >
            Add Certificate
          </button>
        )}
      </div>

      {loading && <p style={{ color: "var(--text-secondary)" }}>Loading...</p>}

      {loadError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-900">Could not load certificates.</p>
          <p className="text-sm text-red-700 mt-1">{loadError}</p>
        </div>
      )}

      {editingId !== null && (
        <div className="rounded-xl border p-5" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-default)" }}>
          <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--aviation-blue)" }}>
            {editingId === "new" ? "Add Certificate" : "Edit Certificate"}
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-primary)" }}>
                Type
              </label>
              <select
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as CertificateType }))}
                className="w-full rounded-lg border p-3"
                style={{ borderColor: "var(--border-default)", color: "var(--text-primary)" }}
              >
                {Object.entries(TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-primary)" }}>
                Label
              </label>
              <input
                type="text"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="e.g. Class 1 Medical"
                className="w-full rounded-lg border p-3"
                style={{ borderColor: "var(--border-default)", color: "var(--text-primary)" }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-primary)" }}>
                Expiry date
              </label>
              <input
                type="date"
                value={form.expiryDate}
                onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))}
                className="w-full rounded-lg border p-3"
                style={{ borderColor: "var(--border-default)", color: "var(--text-primary)" }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-primary)" }}>
                Notes (optional)
              </label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="e.g. AME contact, renewal steps"
                className="w-full rounded-lg border p-3"
                style={{ borderColor: "var(--border-default)", color: "var(--text-primary)" }}
              />
            </div>
          </div>
          <div className="flex gap-3 mt-5">
            <button
              onClick={handleSave}
              className="rounded-lg px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: "var(--aviation-blue)" }}
            >
              Save
            </button>
            <button
              onClick={cancelEdit}
              className="rounded-lg px-5 py-2.5 text-sm font-medium border"
              style={{ borderColor: "var(--border-default)", color: "var(--text-primary)" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!loading && sorted.length === 0 && editingId === null && (
        <div className="rounded-xl border p-8 text-center" style={{ borderColor: "var(--border-default)" }}>
          <p style={{ color: "var(--text-secondary)" }}>
            No certificates tracked yet. Add your medical, license, or type rating to get expiry reminders here and on the dashboard.
          </p>
        </div>
      )}

      <div className="grid gap-3">
        {sorted.map((cert) => {
          const status = getCertificateStatus(cert.expiryDate);
          const style = URGENCY_STYLES[status.urgency];
          return (
            <div
              key={cert.id}
              className="rounded-xl border p-4 flex items-center justify-between gap-4"
              style={{ borderColor: style.border, backgroundColor: style.bg }}
            >
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                    {cert.label}
                  </span>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {TYPE_LABELS[cert.type]}
                  </span>
                </div>
                <div className="text-sm font-medium mt-1" style={{ color: style.text }}>
                  {style.label} — expires {new Date(cert.expiryDate).toLocaleDateString()}
                  {status.urgency !== "ok" && status.daysUntilExpiry >= 0 && ` (${status.daysUntilExpiry} days)`}
                </div>
                {cert.notes && (
                  <div className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                    {cert.notes}
                  </div>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => startEdit(cert)}
                  className="px-3 py-1.5 rounded-md border text-xs font-medium"
                  style={{ borderColor: "var(--border-default)", backgroundColor: "var(--bg-card)", color: "var(--text-primary)" }}
                >
                  Edit
                </button>
                <button
                  onClick={() => setDeleteConfirm(cert.id)}
                  className="px-3 py-1.5 rounded-md text-xs font-medium text-white"
                  style={{ backgroundColor: "var(--status-error)" }}
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {deleteConfirm && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => setDeleteConfirm(null)}
        >
          <div
            className="rounded-xl border p-6 max-w-md w-full mx-4 shadow-xl"
            style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-default)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold mb-3" style={{ color: "var(--aviation-blue)" }}>
              Delete Certificate
            </h2>
            <p className="mb-6" style={{ color: "var(--text-secondary)" }}>
              Are you sure you want to delete this certificate?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 rounded-lg border font-medium"
                style={{ borderColor: "var(--border-default)", color: "var(--text-primary)", backgroundColor: "var(--bg-card)" }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="px-4 py-2 rounded-lg font-medium text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: "var(--status-error)" }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
