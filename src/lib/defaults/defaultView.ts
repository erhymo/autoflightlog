import { View } from "@/types/domain";

export function buildDefaultView(nowIso: string, templateId: string): View {
  const timestamp = nowIso || new Date().toISOString();

  const visibleFields = [
    "date",
    "departure",
    "arrival",
    "aircraft",
    "registration",
    "totalTime",
    "picTime",
    "landingsDay",
    "landingsNight",
  ];

  const columns = visibleFields.map((fieldId, index) => ({
    fieldId,
    width: 150,
    order: index + 1,
  }));

  return {
    id: "view_default",
    name: "Default View",
    templateId,
    visibleFields,
    columns,
    sortBy: "date",
    sortOrder: "desc",
    createdAt: new Date(timestamp),
    updatedAt: new Date(timestamp),
  };
}
