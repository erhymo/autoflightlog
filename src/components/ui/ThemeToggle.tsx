"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "theme";
const ORDER: ThemePreference[] = ["system", "light", "dark"];
const ICONS = { system: Monitor, light: Sun, dark: Moon };
const LABELS: Record<ThemePreference, string> = {
  system: "Following system theme",
  light: "Light theme",
  dark: "Dark theme",
};

const THEME_COLOR = { light: "#0F2A44", dark: "#0B1220" };

function applyTheme(pref: ThemePreference) {
  if (pref === "system") {
    document.documentElement.removeAttribute("data-theme");
    // Let the browser fall back to the media-query-based <meta> tags.
    document.querySelectorAll('meta[name="theme-color"][data-dynamic]').forEach((el) => el.remove());
    return;
  }

  document.documentElement.setAttribute("data-theme", pref);

  // The static <meta name="theme-color"> tags only react to system
  // prefers-color-scheme, not this manual override, so keep one dynamic
  // tag in sync for an explicit choice (e.g. dark mode while the OS is
  // still in light mode).
  let meta = document.querySelector('meta[name="theme-color"][data-dynamic]') as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    meta.setAttribute("data-dynamic", "true");
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", THEME_COLOR[pref]);
}

const VARIANT_STYLE = {
  // For placement on a themed "card" background (light in light mode, dark in dark mode).
  card: { borderColor: "var(--border-default)", color: "var(--text-secondary)", backgroundColor: "var(--bg-card)" },
  // For placement on the always-dark navy sidebar/header, independent of the app theme.
  sidebar: { borderColor: "rgba(255, 255, 255, 0.2)", color: "rgba(255, 255, 255, 0.75)", backgroundColor: "transparent" },
};

export function ThemeToggle({ variant = "card" }: { variant?: "card" | "sidebar" }) {
  const [pref, setPref] = useState<ThemePreference>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemePreference | null;
    setPref(stored || "system");
    setMounted(true);
  }, []);

  function cycle() {
    const next = ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length];
    setPref(next);
    applyTheme(next);
    localStorage.setItem(STORAGE_KEY, next);
  }

  // Avoid rendering an icon that might not match the pre-hydration DOM state.
  if (!mounted) return <div className="h-9 w-9" />;

  const Icon = ICONS[pref];

  return (
    <button
      type="button"
      onClick={cycle}
      title={LABELS[pref]}
      aria-label={`Theme: ${LABELS[pref]}. Click to change.`}
      className="flex h-9 w-9 items-center justify-center rounded-lg border transition-colors hover:opacity-80"
      style={VARIANT_STYLE[variant]}
    >
      <Icon size={16} strokeWidth={2} />
    </button>
  );
}
