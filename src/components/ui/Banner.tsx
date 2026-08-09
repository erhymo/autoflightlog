import { severityCardStyle, Severity } from "@/lib/ui/statusColors";

interface BannerProps {
  severity: Severity;
  title?: string;
  children: React.ReactNode;
  /** "compact" for inline field-level warnings; "default" for page-level banners. */
  size?: "default" | "compact";
  className?: string;
}

const SIZE_CLASSES = {
  default: "rounded-xl p-4 text-sm",
  compact: "rounded-lg px-3 py-2 text-xs",
};

/**
 * Shared error/success/warning/info banner, replacing the many near-
 * identical "rounded-xl border border-red-200 bg-red-50 p-4" blocks that
 * were copy-pasted across pages with raw Tailwind colors (which don't
 * adapt to dark mode). See src/lib/ui/statusColors.ts for the palette.
 * `className` is appended for layout only (e.g. margins) - use `size` to
 * change padding/text size so it can't conflict with the base classes.
 */
export function Banner({ severity, title, children, size = "default", className = "" }: BannerProps) {
  return (
    <div className={`border ${SIZE_CLASSES[size]} ${className}`} style={severityCardStyle(severity)}>
      {title && <p className="font-medium mb-1">{title}</p>}
      <div>{children}</div>
    </div>
  );
}
