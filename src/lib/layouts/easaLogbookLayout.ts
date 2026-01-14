export interface EasaSubColumn {
  fieldId: string;
  subLabel?: string;
}

export interface EasaColumnGroup {
  id: string; // logical id of the group (not necessarily a field id)
  label: string; // main header label (e.g. "Pilot function time")
  columns: EasaSubColumn[]; // ordered left-to-right
}

// EASA-inspired layout for the logbook table.
// This describes only the visual structure; which fields are actually shown
// is decided at runtime based on the user's selected fields/view.
export const EASA_LOGBOOK_LAYOUT: EasaColumnGroup[] = [
  {
    id: "date",
    label: "Date",
    columns: [{ fieldId: "date" }],
  },
  {
    id: "departure",
    label: "Departure",
    columns: [{ fieldId: "departure", subLabel: "Place" }],
  },
  {
    id: "arrival",
    label: "Arrival",
    columns: [{ fieldId: "arrival", subLabel: "Place" }],
  },
  {
    id: "aircraft",
    label: "Aircraft",
    columns: [
      { fieldId: "aircraft", subLabel: "Type" },
      { fieldId: "registration", subLabel: "Registration" },
    ],
  },
  {
    id: "totalTimeOfFlight",
    label: "Total time of flight",
    columns: [{ fieldId: "totalTime" }],
  },
  {
    id: "picName",
    label: "Name of PIC",
    columns: [{ fieldId: "pic" }],
  },
  {
    id: "landings",
    label: "Landings",
    columns: [
      { fieldId: "landingsDay", subLabel: "Day" },
      { fieldId: "landingsNight", subLabel: "Night" },
    ],
  },
  {
    id: "operationalCondition",
    label: "Operational condition time",
    columns: [
      { fieldId: "nightTime", subLabel: "Night" },
      { fieldId: "ifrTime", subLabel: "IFR" },
    ],
  },
  {
    id: "pilotFunction",
    label: "Pilot function time",
    columns: [
      { fieldId: "picTime", subLabel: "PIC" },
      { fieldId: "copilotTime", subLabel: "Co-pilot" },
      { fieldId: "dualTime", subLabel: "Dual" },
      { fieldId: "instructorTime", subLabel: "Instr" },
    ],
  },
  {
    id: "remarks",
    label: "Remarks",
    columns: [{ fieldId: "remarks" }],
  },
];

// Flattened list of field IDs in the visual left-to-right order.
// Used for default template/view ordering and for Settings UI ordering.
export const EASA_FIELD_ORDER: string[] = (() => {
  const result: string[] = [];
  for (const group of EASA_LOGBOOK_LAYOUT) {
    for (const col of group.columns) {
      if (!result.includes(col.fieldId)) {
        result.push(col.fieldId);
      }
    }
  }
  return result;
})();

