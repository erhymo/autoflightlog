import { View } from "@/types/domain";
import { EASA_FIELD_ORDER } from "@/lib/layouts/easaLogbookLayout";

export function buildDefaultView(nowIso: string, templateId: string): View {
  const timestamp = nowIso || new Date().toISOString();

	  // Start with all known EASA fields in the EASA layout order. Users can
	  // later trim this down in Settings.
	  const visibleFields = [...EASA_FIELD_ORDER];

	  const columns = visibleFields.map((fieldId, index) => ({
	    fieldId,
	    width: 140,
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
