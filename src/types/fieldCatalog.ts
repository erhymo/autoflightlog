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
	  // Basic
	  { id: "date", key: "date", name: "Date", label: "Date", type: "date", category: "basic", group: "Basic" },
	  { id: "departure", key: "departure", name: "Departure (place)", label: "Departure place", type: "text", category: "basic", group: "Basic" },
	  { id: "departureTime", key: "departureTime", name: "Departure time", label: "Departure time", type: "time", category: "basic", group: "Basic" },
	  { id: "arrival", key: "arrival", name: "Arrival (place)", label: "Arrival place", type: "text", category: "basic", group: "Basic" },
	  { id: "arrivalTime", key: "arrivalTime", name: "Arrival time", label: "Arrival time", type: "time", category: "basic", group: "Basic" },

	  // Aircraft
	  { id: "aircraft", key: "aircraft", name: "Aircraft type", label: "Mark, model, variant", type: "text", category: "aircraft", group: "Aircraft" },
	  { id: "registration", key: "registration", name: "Registration", label: "Registration", type: "text", category: "aircraft", group: "Aircraft" },
	  { id: "aircraftSe", key: "aircraftSe", name: "Aircraft SE", label: "SE", type: "text", category: "aircraft", group: "Aircraft" },
	  { id: "aircraftMe", key: "aircraftMe", name: "Aircraft ME", label: "ME", type: "text", category: "aircraft", group: "Aircraft" },

	  // Pilot / crew
	  { id: "pic", key: "pic", name: "Name of PIC", label: "Name of PIC", type: "text", category: "crew", group: "Crew" },

	  // Flight times, all stored and entered in whole minutes (see src/lib/logbook/timeUnits.ts)
	  { id: "singlePilotSeTime", key: "singlePilotSeTime", name: "Single-pilot time SE (min)", label: "SE (single-pilot, min)", type: "number", category: "time", group: "Time" },
	  { id: "singlePilotMeTime", key: "singlePilotMeTime", name: "Single-pilot time ME (min)", label: "ME (single-pilot, min)", type: "number", category: "time", group: "Time" },
	  { id: "multiPilotTime", key: "multiPilotTime", name: "Multi-pilot time (min)", label: "Multi-pilot (min)", type: "number", category: "time", group: "Time" },
	  { id: "turbineTime", key: "turbineTime", name: "Turbine time (min)", label: "Turbine (min)", type: "number", category: "time", group: "Time" },
	  { id: "totalTime", key: "totalTime", name: "Total Time (min)", label: "Total Time (min)", type: "number", category: "time", group: "Time" },
	  { id: "picTime", key: "picTime", name: "PIC Time (min)", label: "PIC Time (min)", type: "number", category: "time", group: "Time" },
	  { id: "copilotTime", key: "copilotTime", name: "Co-Pilot Time (min)", label: "Co-Pilot Time (min)", type: "number", category: "time", group: "Time" },
	  { id: "dualTime", key: "dualTime", name: "Dual Time (min)", label: "Dual Time (min)", type: "number", category: "time", group: "Time" },
	  { id: "instructorTime", key: "instructorTime", name: "Instructor Time (min)", label: "Instructor Time (min)", type: "number", category: "time", group: "Time" },
	  { id: "nightTime", key: "nightTime", name: "Night Time (min)", label: "Night Time (min)", type: "number", category: "time", group: "Time" },
	  { id: "ifrTime", key: "ifrTime", name: "IFR Time (min)", label: "IFR Time (min)", type: "number", category: "time", group: "Time" },

	  // Landings
	  { id: "landingsDay", key: "landingsDay", name: "Landings Day", label: "Landings Day", type: "number", category: "landings", group: "Landings" },
	  { id: "landingsNight", key: "landingsNight", name: "Landings Night", label: "Landings Night", type: "number", category: "landings", group: "Landings" },

	  // Synthetic training devices session
	  { id: "syntheticDate", key: "syntheticDate", name: "Synthetic training date", label: "Date", type: "date", category: "training", group: "Synthetic training" },
	  { id: "syntheticType", key: "syntheticType", name: "Synthetic training type", label: "Type", type: "text", category: "training", group: "Synthetic training" },
	  { id: "syntheticTime", key: "syntheticTime", name: "Synthetic training time (min)", label: "Time (min)", type: "number", category: "training", group: "Synthetic training" },

	  // Other
	  { id: "remarks", key: "remarks", name: "Remarks", label: "Remarks", type: "text", category: "other", group: "Other" },
	];

// Export for mock compatibility
export const FIELD_CATALOG = EASA_FIELD_CATALOG;
