export interface FieldDefinition {
  id: string;
  name: string;
  type: string;
  category?: string;
  description?: string;
  // For mock compatibility
  key?: string;
  label?: string;
  group?: string;
}

export const EASA_FIELD_CATALOG: FieldDefinition[] = [
  { id: "date", key: "date", name: "Date", label: "Date", type: "date", category: "basic", group: "Basic" },
  { id: "departure", key: "departure", name: "Departure", label: "Departure", type: "text", category: "basic", group: "Basic" },
  { id: "arrival", key: "arrival", name: "Arrival", label: "Arrival", type: "text", category: "basic", group: "Basic" },
  { id: "aircraft", key: "aircraft", name: "Aircraft", label: "Aircraft", type: "text", category: "basic", group: "Basic" },
  { id: "registration", key: "registration", name: "Registration", label: "Registration", type: "text", category: "basic", group: "Basic" },
  { id: "pic", key: "pic", name: "PIC", label: "PIC", type: "text", category: "crew", group: "Crew" },
  { id: "totalTime", key: "totalTime", name: "Total Time", label: "Total Time", type: "number", category: "time", group: "Time" },
  { id: "picTime", key: "picTime", name: "PIC Time", label: "PIC Time", type: "number", category: "time", group: "Time" },
  { id: "copilotTime", key: "copilotTime", name: "Co-Pilot Time", label: "Co-Pilot Time", type: "number", category: "time", group: "Time" },
  { id: "dualTime", key: "dualTime", name: "Dual Time", label: "Dual Time", type: "number", category: "time", group: "Time" },
  { id: "instructorTime", key: "instructorTime", name: "Instructor Time", label: "Instructor Time", type: "number", category: "time", group: "Time" },
  { id: "nightTime", key: "nightTime", name: "Night Time", label: "Night Time", type: "number", category: "time", group: "Time" },
  { id: "ifrTime", key: "ifrTime", name: "IFR Time", label: "IFR Time", type: "number", category: "time", group: "Time" },
  { id: "landingsDay", key: "landingsDay", name: "Landings Day", label: "Landings Day", type: "number", category: "landings", group: "Landings" },
  { id: "landingsNight", key: "landingsNight", name: "Landings Night", label: "Landings Night", type: "number", category: "landings", group: "Landings" },
  { id: "remarks", key: "remarks", name: "Remarks", label: "Remarks", type: "text", category: "other", group: "Other" },
];

// Export for mock compatibility
export const FIELD_CATALOG = EASA_FIELD_CATALOG;
