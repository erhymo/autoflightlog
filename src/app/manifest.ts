import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AutoFlightLog",
    short_name: "AutoFlightLog",
    description: "Professional flight logbook for pilots.",
    start_url: "/app/dashboard",
    display: "standalone",
    background_color: "#F8FAFC",
    theme_color: "#0F2A44",
    icons: [
      {
	      src: "/assets/logo/autoflightlog-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
