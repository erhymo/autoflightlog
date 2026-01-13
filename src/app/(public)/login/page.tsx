"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { getFirebaseClient } from "@/lib/firebase/client";
import { useAuthUser } from "@/lib/firebase/useAuthUser";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { user, loading } = useAuthUser();

  useEffect(() => {
    if (!loading && user) router.replace("/app/dashboard");
  }, [loading, user, router]);

  async function login() {
    setSubmitting(true);
    setError(null);

    try {
      const { auth } = getFirebaseClient();

      // Try sign in first; if user doesn't exist, create it.
      try {
        await signInWithEmailAndPassword(auth, email, password);
      } catch (e: any) {
        if (e?.code === "auth/user-not-found") {
          await createUserWithEmailAndPassword(auth, email, password);
        } else {
          throw e;
        }
      }

      router.replace("/app/dashboard");
    } catch (e: any) {
      const message =
        e?.code === "auth/wrong-password"
          ? "Wrong password"
          : e?.code === "auth/invalid-email"
          ? "Invalid email"
          : e?.code === "auth/weak-password"
          ? "Password is too weak (min 6 characters)"
          : e?.message
          ? String(e.message)
          : "Login failed";
      setError(message);
      setSubmitting(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <div
        className="w-full max-w-md rounded-xl border p-10 shadow-lg"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-default)"
        }}
      >
        {/* Brand Lockup */}
        <div className="flex flex-col items-center mb-8">
          {/* Full logo lockup */}
          <Image
	            src="/assets/logo/autoflightlog.svg"
						alt="AutoFlightLog"
            width={180}
            height={108}
            priority
            className="mb-3"
          />

          {/* Tagline */}
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            Professional Flight Logbook
          </p>
        </div>

        {/* Welcome Message */}
        <div className="text-center mb-6">
          <p className="text-base font-medium" style={{ color: "var(--text-primary)" }}>
            Welcome back
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            Sign in to continue to your logbook
          </p>
        </div>

        {/* Login Form */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>
              Email
            </label>
            <input
              type="email"
              className="w-full rounded-lg border p-3 transition-colors"
              style={{
                borderColor: "var(--border-default)",
                color: "var(--text-primary)"
              }}
              onFocus={(e) => e.target.style.borderColor = "var(--aviation-blue)"}
              onBlur={(e) => e.target.style.borderColor = "var(--border-default)"}
              placeholder="pilot@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>
              Password
            </label>
            <input
              type="password"
              className="w-full rounded-lg border p-3 transition-colors"
              style={{
                borderColor: "var(--border-default)",
                color: "var(--text-primary)"
              }}
              onFocus={(e) => (e.target.style.borderColor = "var(--aviation-blue)")}
              onBlur={(e) => (e.target.style.borderColor = "var(--border-default)")}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          {error && (
            <p className="text-xs" style={{ color: "var(--status-error)" }}>
              {error}
            </p>
          )}

          <button
            className="w-full rounded-lg p-3 disabled:opacity-50 font-semibold text-white transition-all"
            style={{ backgroundColor: "var(--aviation-blue)" }}
            disabled={!email || password.length < 6 || submitting}
            onClick={login}
            onMouseEnter={(e) => email && (e.currentTarget.style.opacity = "0.9")}
            onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
          >
            {submitting ? "Signing in..." : "Continue"}
          </button>
        </div>

        <p className="text-xs text-center mt-6" style={{ color: "var(--text-muted)" }}>
          Firebase Email/Password authentication
        </p>
      </div>
    </div>
  );
}

