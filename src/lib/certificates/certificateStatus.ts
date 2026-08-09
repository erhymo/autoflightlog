export type CertificateUrgency = "expired" | "critical" | "warning" | "ok";

export interface CertificateStatus {
  daysUntilExpiry: number;
  urgency: CertificateUrgency;
}

const CRITICAL_WINDOW_DAYS = 14;
const WARNING_WINDOW_DAYS = 30;

/**
 * Classifies a certificate's expiry into an urgency tier so the dashboard
 * and the certificates page can share the same "how worried should the
 * pilot be" logic. Wider windows than flight-time currency (currency.ts
 * uses a 7-day warning window) since certificate renewals typically need
 * more lead time to arrange (medical exams, checkrides, etc.).
 */
export function getCertificateStatus(expiryDate: string, now = new Date()): CertificateStatus {
  const expiry = new Date(expiryDate);
  const daysUntilExpiry = Math.ceil((expiry.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

  let urgency: CertificateUrgency;
  if (daysUntilExpiry < 0) urgency = "expired";
  else if (daysUntilExpiry <= CRITICAL_WINDOW_DAYS) urgency = "critical";
  else if (daysUntilExpiry <= WARNING_WINDOW_DAYS) urgency = "warning";
  else urgency = "ok";

  return { daysUntilExpiry, urgency };
}
