import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { PwaClient } from "@/components/pwa/PwaClient";
import { ToastProvider } from "@/components/ui/ToastProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AutoFlightLog - Professional Flight Logbook",
  description: "Professional flight logbook application for pilots. Track your flight hours, manage logbook entries, and sync with your employer's crew management system.",
  applicationName: "AutoFlightLog",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0F2A44" },
    { media: "(prefers-color-scheme: dark)", color: "#0B1220" },
  ],
};

const THEME_INIT_SCRIPT = `
(function () {
  try {
    var theme = localStorage.getItem("theme");
    if (theme === "light" || theme === "dark") {
      document.documentElement.setAttribute("data-theme", theme);
      var meta = document.createElement("meta");
      meta.setAttribute("name", "theme-color");
      meta.setAttribute("data-dynamic", "true");
      meta.setAttribute("content", theme === "dark" ? "#0B1220" : "#0F2A44");
      document.head.appendChild(meta);
    }
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* Runs before first paint so a stored theme choice never flashes
            the wrong palette on load. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ToastProvider>{children}</ToastProvider>
        <PwaClient />
      </body>
    </html>
  );
}
