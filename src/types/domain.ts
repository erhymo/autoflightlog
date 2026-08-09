export interface User {
  uid: string;
  email: string;
  setupComplete?: boolean;
}

export interface Template {
  id: string;
  name: string;
  fields: TemplateField[];
  formOrder?: string[]; // Array of field IDs in the order they should appear in forms
  createdAt: Date;
  updatedAt: Date;
}

export interface TemplateField {
  id: string;
  name: string;
  type: FieldType;
  required?: boolean;
  order: number;
}

export type FieldType =
  | "text"
  | "number"
  | "date"
  | "time"
  | "select"
  | "multiselect"
  | "checkbox";

export interface ViewColumn {
  fieldId: string;
  width: number; // Width in pixels
  order: number;
}

export interface View {
  id: string;
  name: string;
  templateId: string;
  visibleFields: string[]; // Deprecated, use columns instead
  columns?: ViewColumn[];
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  createdAt: Date;
  updatedAt: Date;
}

// Alias for mock compatibility
export type ViewDefinition = View;

export interface LogbookEntry {
  id: string;
  templateId: string;
  values: Record<string, any>;
  source: {
    system: string;
    connectorId?: string;
    externalKey?: string;
  };
  manualOverrides?: Record<string, boolean>;
  createdAt: string;
  updatedAt: string;
}

export type CertificateType = "medical" | "license" | "rating" | "english_proficiency" | "other";

/**
 * Tracks a certificate/qualification with an expiry date (medical, license,
 * type rating, English proficiency, etc.) alongside the flight-time based
 * EASA currency in src/lib/currency/currency.ts.
 */
export interface Certificate {
  id: string;
  type: CertificateType;
  label: string; // e.g. "Class 1 Medical", "AW169 Type Rating"
  expiryDate: string; // ISO date string
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
