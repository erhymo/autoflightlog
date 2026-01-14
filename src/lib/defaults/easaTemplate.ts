import { Template, TemplateField } from "@/types/domain";
import { EASA_FIELD_CATALOG } from "@/types/fieldCatalog";
import { EASA_FIELD_ORDER } from "@/lib/layouts/easaLogbookLayout";

export function buildDefaultEasaTemplate(nowIso?: string): Template {
  const timestamp = nowIso || new Date().toISOString();

	  // Use the EASA_FIELD_ORDER so that forms follow the same order as
	  // the EASA-style logbook table.
	  const fields: TemplateField[] = EASA_FIELD_ORDER.map((fieldId, index) => {
	    const field = EASA_FIELD_CATALOG.find((f) => f.id === fieldId || f.key === fieldId);
	    if (!field) {
	      throw new Error(`Unknown EASA field id in EASA_FIELD_ORDER: ${fieldId}`);
	    }
	    return {
	      id: field.id,
	      name: field.name,
	      type: field.type as any,
	      required: ["date", "departure", "arrival", "totalTime"].includes(field.id),
	      order: index,
	    };
	  });

	  const formOrder = [...EASA_FIELD_ORDER];

  return {
    id: "tmpl_easa_default",
    name: "EASA Logbook",
    fields,
    formOrder,
    createdAt: new Date(timestamp),
    updatedAt: new Date(timestamp),
  };
}
