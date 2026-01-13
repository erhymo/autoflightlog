"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthUser } from "@/lib/firebase/useAuthUser";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading, error } = useAuthUser();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [router, user, loading]);

  if (error) {
    return <div className="p-6">Auth error: {error.message}</div>;
  }

  if (loading) return <div className="p-6">Loading…</div>;
  if (!user) return <div className="p-6">Loading…</div>;
  return <>{children}</>;
}

