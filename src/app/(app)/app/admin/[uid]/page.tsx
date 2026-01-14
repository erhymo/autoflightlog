"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { emailInAllowlist, parseAllowlist } from "@/lib/admin/allowlist";
import { useAuthUser } from "@/lib/firebase/useAuthUser";

type AdminUser = {
  uid: string;
  email: string | null;
  disabled: boolean;
  displayName: string | null;
  photoURL: string | null;
  providerIds: string[];
  creationTime: string | null;
  lastSignInTime: string | null;
};

type UserDetailResponse = {
  user: AdminUser;
  meta: { hidden: boolean; updatedAt: string | null } | null;
  flags: { setupComplete: boolean } | null;
  connectors: any[];
  integrationRequests: any[];
};

export default function AdminUserDetailPage() {
  const router = useRouter();
  const { uid } = useParams<{ uid: string }>();
  const { user, loading: authLoading } = useAuthUser();
  const adminAllowlist = parseAllowlist(process.env.NEXT_PUBLIC_ADMIN_EMAIL_ALLOWLIST);
  const isAdmin = emailInAllowlist(user?.email, adminAllowlist);

  const [data, setData] = useState<UserDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function authedFetch(path: string, init?: RequestInit) {
    if (!user) throw new Error("Not signed in");
    const token = await user.getIdToken();
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (!headers.has("Content-Type") && init?.body) headers.set("Content-Type", "application/json");
    return fetch(path, { ...init, headers });
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/admin/users/${uid}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setData(json as UserDetailResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function setDisabled(disabled: boolean) {
    setError(null);
    try {
      const res = await authedFetch(`/api/admin/users/${uid}`, {
        method: "PATCH",
        body: JSON.stringify({ disabled }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setData((prev) => (prev ? { ...prev, user: { ...prev.user, disabled } } : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function setHidden(hidden: boolean) {
    setError(null);
    try {
      const res = await authedFetch(`/api/admin/users/${uid}`, {
        method: "PATCH",
        body: JSON.stringify({ hidden }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setData((prev) => (prev ? { ...prev, meta: { hidden, updatedAt: prev.meta?.updatedAt ?? null } } : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function hardDelete() {
    const typedUid = window.prompt(`Type the UID to permanently delete this user:\n\n${uid}`);
    if (!typedUid) return;
    if (typedUid !== uid) {
      window.alert("UID did not match. Aborted.");
      return;
    }
    const typed = window.prompt('Second confirmation: type DELETE to confirm permanent deletion.');
    if (typed !== "DELETE") {
      window.alert("Confirmation text did not match. Aborted.");
      return;
    }

    setError(null);
    try {
      const res = await authedFetch(`/api/admin/users/${uid}/delete`, {
        method: "POST",
        body: JSON.stringify({ confirmUid: uid }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      router.push("/app/admin");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const connectorSummary = useMemo(() => {
    const connectors = data?.connectors ?? [];
    const byStatus = connectors.reduce<Record<string, number>>((acc, c) => {
      const s = String(c?.status ?? "unknown");
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});
    return { total: connectors.length, byStatus };
  }, [data?.connectors]);

  useEffect(() => {
    if (!authLoading && user && isAdmin) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user?.uid, isAdmin, uid]);

	if (authLoading) {
	  return (
	    <div className="p-6 md:p-8">
	      <h1 className="text-2xl font-semibold" style={{ color: "var(--aviation-blue)" }}>
	        Admin
			      </h1>
			      <p className="mt-3 text-sm" style={{ color: "var(--text-secondary)" }}>
			        Checking access…
			      </p>
	    </div>
	  );
	}

	if (!user) {
	  return (
	    <div className="p-6 md:p-8">
	      <h1 className="text-2xl font-semibold" style={{ color: "var(--aviation-blue)" }}>
	        Admin
	      </h1>
	      <p className="mt-3 text-sm" style={{ color: "var(--text-secondary)" }}>
	        Please sign in to access this page.
	      </p>
	      <div className="mt-4">
	        <Link href="/login" className="underline underline-offset-2" style={{ color: "var(--text-primary)" }}>
	          Go to login
	        </Link>
	      </div>
	    </div>
	  );
	}

	if (adminAllowlist.length === 0) {
	  return (
	    <div className="p-6 md:p-8">
	      <h1 className="text-2xl font-semibold" style={{ color: "var(--aviation-blue)" }}>
	        Admin
	      </h1>
	      <p className="mt-3 text-sm" style={{ color: "var(--text-secondary)" }}>
	        Admin allowlist is not configured.
	      </p>
	      <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
	        Set <span className="font-mono">ADMIN_EMAIL_ALLOWLIST</span> (server) and optionally
	        <span className="font-mono"> NEXT_PUBLIC_ADMIN_EMAIL_ALLOWLIST</span> (client) to show this page.
	      </p>
	      <div className="mt-4">
	        <Link href="/app" className="underline underline-offset-2" style={{ color: "var(--text-primary)" }}>
	          Back to app
	        </Link>
	      </div>
	    </div>
	  );
	}

	if (!isAdmin) {
    return (
      <div className="p-6 md:p-8">
        <h1 className="text-2xl font-semibold" style={{ color: "var(--aviation-blue)" }}>
          Admin
        </h1>
        <p className="mt-3 text-sm" style={{ color: "var(--text-secondary)" }}>
          You are not authorized to access this page.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
            <Link href="/app/admin" className="underline underline-offset-2">
		              ← Back to admin
            </Link>
          </div>
          <h1 className="text-2xl font-semibold mt-2" style={{ color: "var(--aviation-blue)" }}>
            User detail
          </h1>
          <p className="text-sm mt-1 font-mono" style={{ color: "var(--text-secondary)" }}>
            {uid}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading || authLoading}
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{ backgroundColor: "var(--aviation-blue)", color: "white", opacity: loading ? 0.7 : 1 }}
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border p-4 text-sm" style={{ borderColor: "#ef4444", color: "#b91c1c" }}>
          {error}
        </div>
      )}

      <div className="rounded-xl border p-5 space-y-4" style={{ borderColor: "var(--border-default)" }}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <div style={{ color: "var(--text-secondary)" }}>Email</div>
	            <div style={{ color: "var(--text-primary)" }}>{data?.user.email || "—"}</div>
          </div>
          <div>
            <div style={{ color: "var(--text-secondary)" }}>Providers</div>
	            <div style={{ color: "var(--text-primary)" }}>{data?.user.providerIds?.join(", ") || "—"}</div>
          </div>
          <div>
            <div style={{ color: "var(--text-secondary)" }}>Created</div>
	            <div style={{ color: "var(--text-primary)" }}>{data?.user.creationTime || "—"}</div>
          </div>
          <div>
            <div style={{ color: "var(--text-secondary)" }}>Last sign-in</div>
	            <div style={{ color: "var(--text-primary)" }}>{data?.user.lastSignInTime || "—"}</div>
          </div>
          <div>
            <div style={{ color: "var(--text-secondary)" }}>Auth status</div>
            <div style={{ color: data?.user.disabled ? "#ef4444" : "#16a34a" }}>{data?.user.disabled ? "disabled" : "active"}</div>
          </div>
          <div>
            <div style={{ color: "var(--text-secondary)" }}>Visibility</div>
            <div style={{ color: data?.meta?.hidden ? "#b45309" : "#16a34a" }}>{data?.meta?.hidden ? "hidden" : "visible"}</div>
          </div>
          <div>
            <div style={{ color: "var(--text-secondary)" }}>Setup complete</div>
            <div style={{ color: data?.flags?.setupComplete ? "#16a34a" : "#b45309" }}>
              {data?.flags?.setupComplete ? "yes" : "no"}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <button
            onClick={() => setHidden(!data?.meta?.hidden)}
            disabled={!data}
            className="px-3 py-2 rounded-md border text-sm font-medium"
            style={{ borderColor: "var(--border-default)", backgroundColor: "var(--bg-card)", color: "var(--text-primary)" }}
          >
            {data?.meta?.hidden ? "Unhide" : "Hide"}
          </button>
          <button
            onClick={() => setDisabled(!data?.user.disabled)}
            disabled={!data}
            className="px-3 py-2 rounded-md border text-sm font-medium"
            style={{ borderColor: "var(--border-default)", backgroundColor: "var(--bg-card)", color: "var(--text-primary)" }}
          >
            {data?.user.disabled ? "Enable" : "Disable"}
          </button>
          <button
            onClick={hardDelete}
            disabled={!data}
            className="px-3 py-2 rounded-md text-sm font-medium"
            style={{ backgroundColor: "#ef4444", color: "white" }}
          >
            Delete permanently
          </button>
        </div>
      </div>

      <div className="rounded-xl border p-5" style={{ borderColor: "var(--border-default)" }}>
        <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>
          Integration status
        </h2>
        <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
          Connectors: {connectorSummary.total} ({Object.entries(connectorSummary.byStatus)
            .map(([k, v]) => `${k}: ${v}`)
            .join(", ") || "none"})
        </p>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Integration requests: {data?.integrationRequests?.length ?? 0}
        </p>
      </div>

      <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border-default)" }}>
        <div className="p-4" style={{ backgroundColor: "var(--bg-secondary)" }}>
          <h3 className="font-semibold" style={{ color: "var(--text-primary)" }}>
            Connectors
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead style={{ backgroundColor: "var(--bg-secondary)" }}>
              <tr>
                <th className="text-left px-4 py-3" style={{ color: "var(--text-secondary)" }}>
                  ID
                </th>
                <th className="text-left px-4 py-3" style={{ color: "var(--text-secondary)" }}>
                  Status
                </th>
                <th className="text-left px-4 py-3" style={{ color: "var(--text-secondary)" }}>
                  Company
                </th>
                <th className="text-left px-4 py-3" style={{ color: "var(--text-secondary)" }}>
                  Last test
                </th>
                <th className="text-left px-4 py-3" style={{ color: "var(--text-secondary)" }}>
                  Last error
                </th>
              </tr>
            </thead>
            <tbody>
              {(data?.connectors || []).map((c) => (
                <tr key={String(c.id)} className="border-t" style={{ borderColor: "var(--border-default)" }}>
                  <td className="px-4 py-3 font-mono" style={{ color: "var(--text-secondary)" }}>
                    {String(c.id)}
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--text-primary)" }}>
	                    {String(c.status ?? "—")}
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--text-primary)" }}>
	                    {String(c.companyName ?? "—")}
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>
	                    {String(c.lastTestAt ?? "—")}
                  </td>
                  <td className="px-4 py-3" style={{ color: c.lastError ? "#ef4444" : "var(--text-muted)" }}>
	                    {String(c.lastError ?? "—")}
                  </td>
                </tr>
              ))}
              {(data?.connectors?.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center" style={{ color: "var(--text-muted)" }}>
	                    {loading ? "Loading…" : "No connectors"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
