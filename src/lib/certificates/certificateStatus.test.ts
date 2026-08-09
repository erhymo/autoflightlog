import { describe, expect, it } from "vitest";
import { getCertificateStatus } from "./certificateStatus";

const NOW = new Date("2026-08-09T12:00:00.000Z");

describe("getCertificateStatus", () => {
  it("marks a past expiry date as expired", () => {
    const status = getCertificateStatus("2026-07-01", NOW);
    expect(status.urgency).toBe("expired");
    expect(status.daysUntilExpiry).toBeLessThan(0);
  });

  it("marks an expiry within 14 days as critical", () => {
    const status = getCertificateStatus("2026-08-15", NOW);
    expect(status.urgency).toBe("critical");
  });

  it("marks an expiry within 30 days (but beyond 14) as warning", () => {
    const status = getCertificateStatus("2026-09-01", NOW);
    expect(status.urgency).toBe("warning");
  });

  it("marks a far-future expiry as ok", () => {
    const status = getCertificateStatus("2027-08-09", NOW);
    expect(status.urgency).toBe("ok");
  });
});
