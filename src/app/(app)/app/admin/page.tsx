"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuthUser } from "@/lib/firebase/useAuthUser";
import { emailInAllowlist, parseAllowlist } from "@/lib/admin/allowlist";

type AdminUser = {
  uid: string;
  email: string | null;
  disabled: boolean;
  hidden: boolean;
  displayName: string | null;
  photoURL: string | null;
  providerIds: string[];
  creationTime: string | null;
  lastSignInTime: string | null;
};

export default function AdminPage() {
  const { user, loading: authLoading } = useAuthUser();
  const adminAllowlist = parseAllowlist(process.env.NEXT_PUBLIC_ADMIN_EMAIL_ALLOWLIST);
  const isAdmin = emailInAllowlist(user?.email, adminAllowlist);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => (u.email || u.uid).toLowerCase().includes(q));
  }, [users, query]);

  async function authedFetch(path: string, init?: RequestInit) {
    if (!user) throw new Error("Not signed in");
    const token = await user.getIdToken();
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (!headers.has("Content-Type") && init?.body) headers.set("Content-Type", "application/json");
    return fetch(path, { ...init, headers });
  }

  async function loadUsers(token?: string | null) {
    setLoading(true);
    setError(null);
    try {
      const url = new URL("/api/admin/users", window.location.origin);
      url.searchParams.set("max", "200");
      if (token) url.searchParams.set("pageToken", token);
      const res = await authedFetch(url.toString());
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setUsers((prev) => (token ? [...prev, ...(json.users as AdminUser[])] : (json.users as AdminUser[])));
      setNextPageToken(json.nextPageToken);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function setDisabled(uid: string, disabled: boolean) {
    setError(null);
    try {
      const res = await authedFetch(`/api/admin/users/${uid}`, {
        method: "PATCH",
        body: JSON.stringify({ disabled }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setUsers((prev) => prev.map((u) => (u.uid === uid ? { ...u, disabled } : u)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function setHidden(uid: string, hidden: boolean) {
    setError(null);
    try {
      const res = await authedFetch(`/api/admin/users/${uid}`, {
        method: "PATCH",
        body: JSON.stringify({ hidden }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setUsers((prev) => prev.map((u) => (u.uid === uid ? { ...u, hidden } : u)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function hardDelete(uid: string) {
    const typed = window.prompt(`Type the UID to permanently delete this user:\n\n${uid}`);
    if (!typed) return;
    if (typed !== uid) {
      window.alert("UID did not match. Aborted.");
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
      setUsers((prev) => prev.filter((u) => u.uid !== uid));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    if (!authLoading && user && isAdmin) loadUsers(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user?.uid, isAdmin]);

  if (!authLoading && user && !isAdmin) {
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
          <h1 className="text-2xl font-semibold" style={{ color: "var(--aviation-blue)" }}>
            Admin
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            User management
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search email or UID"
            className="px-3 py-2 rounded-lg border text-sm"
            style={{
              borderColor: "var(--border-default)",
              backgroundColor: "var(--bg-card)",
              color: "var(--text-primary)",
              minWidth: 240,
            }}
          />
          <button
            onClick={() => loadUsers(null)}
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

      <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border-default)" }}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead style={{ backgroundColor: "var(--bg-secondary)" }}>
              <tr>
                <th className="text-left px-4 py-3" style={{ color: "var(--text-secondary)" }}>
                  Email
                </th>
                <th className="text-left px-4 py-3" style={{ color: "var(--text-secondary)" }}>
                  UID
                </th>
                <th className="text-left px-4 py-3" style={{ color: "var(--text-secondary)" }}>
                  Status
                </th>
                <th className="text-left px-4 py-3" style={{ color: "var(--text-secondary)" }}>
                  Visibility
                </th>
                <th className="text-left px-4 py-3" style={{ color: "var(--text-secondary)" }}>
                  Created
                </th>
                <th className="text-left px-4 py-3" style={{ color: "var(--text-secondary)" }}>
                  Last sign-in
                </th>
                <th className="text-right px-4 py-3" style={{ color: "var(--text-secondary)" }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.uid} className="border-t" style={{ borderColor: "var(--border-default)" }}>
                  <td className="px-4 py-3" style={{ color: "var(--text-primary)" }}>
                    {u.email || <span style={{ color: "var(--text-muted)" }}>—</span>}
                  </td>
                  <td className="px-4 py-3 font-mono" style={{ color: "var(--text-secondary)" }}>
                    {u.uid}
                  </td>
                  <td className="px-4 py-3" style={{ color: u.disabled ? "#ef4444" : "#16a34a" }}>
                    {u.disabled ? "disabled" : "active"}
                  </td>
                  <td className="px-4 py-3" style={{ color: u.hidden ? "#b45309" : "#16a34a" }}>
                    {u.hidden ? "hidden" : "visible"}
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>
                    {u.creationTime || "—"}
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>
                    {u.lastSignInTime || "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-2">
                      <button
                        onClick={() => setHidden(u.uid, !u.hidden)}
                        className="px-3 py-1.5 rounded-md border text-xs font-medium"
                        style={{
                          borderColor: "var(--border-default)",
                          backgroundColor: "var(--bg-card)",
                          color: "var(--text-primary)",
                        }}
                      >
                        {u.hidden ? "Unhide" : "Hide"}
                      </button>
                      <button
                        onClick={() => setDisabled(u.uid, !u.disabled)}
                        className="px-3 py-1.5 rounded-md border text-xs font-medium"
                        style={{
                          borderColor: "var(--border-default)",
                          backgroundColor: "var(--bg-card)",
                          color: "var(--text-primary)",
                        }}
                      >
                        {u.disabled ? "Enable" : "Disable"}
                      </button>
                      <button
                        onClick={() => hardDelete(u.uid)}
                        className="px-3 py-1.5 rounded-md text-xs font-medium"
                        style={{ backgroundColor: "#ef4444", color: "white" }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center" style={{ color: "var(--text-muted)" }}>
                    {loading ? "Loading…" : "No users"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {nextPageToken && (
        <div>
          <button
            onClick={() => loadUsers(nextPageToken)}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-sm font-medium border"
            style={{ borderColor: "var(--border-default)", color: "var(--text-primary)" }}
          >
            Load more
          </button>
        </div>
      )}
    </div>
  );
}
