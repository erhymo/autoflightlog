import type { CSSProperties } from "react";

export type Severity = "success" | "warning" | "critical" | "info" | "neutral";

export interface SeverityStyle {
  bg: string;
  border: string;
  text: string;
}

/**
 * Shared bg/border/text triplets for status badges, urgency cards, and
 * banners across the app - backed by CSS custom properties defined in
 * globals.css, so every consumer automatically gets dark mode and stays
 * visually consistent instead of each page hardcoding its own hex values.
 */
export const SEVERITY_STYLES: Record<Severity, SeverityStyle> = {
  success: {
    bg: "var(--severity-success-bg)",
    border: "var(--severity-success-border)",
    text: "var(--severity-success-text)",
  },
  warning: {
    bg: "var(--severity-warning-bg)",
    border: "var(--severity-warning-border)",
    text: "var(--severity-warning-text)",
  },
  critical: {
    bg: "var(--severity-critical-bg)",
    border: "var(--severity-critical-border)",
    text: "var(--severity-critical-text)",
  },
  info: {
    bg: "var(--severity-info-bg)",
    border: "var(--severity-info-border)",
    text: "var(--severity-info-text)",
  },
  neutral: {
    bg: "var(--severity-neutral-bg)",
    border: "var(--severity-neutral-border)",
    text: "var(--severity-neutral-text)",
  },
};

export function severityCardStyle(severity: Severity): CSSProperties {
  const s = SEVERITY_STYLES[severity];
  return { backgroundColor: s.bg, borderColor: s.border, color: s.text };
}
