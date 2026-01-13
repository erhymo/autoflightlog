import { Template, TemplateField } from "@/types/domain";
import { EASA_FIELD_CATALOG } from "@/types/fieldCatalog";

export function buildDefaultEasaTemplate(nowIso?: string): Template {
  const timestamp = nowIso || new Date().toISOString();

  const fields: TemplateField[] = EASA_FIELD_CATALOG.map((field, index) => ({
    id: field.id,
    name: field.name,
    type: field.type as any,
    required: ["date", "departure", "arrival", "totalTime"].includes(field.id),
    order: index,
  }));

  const formOrder = EASA_FIELD_CATALOG.map((f) => f.key || f.id);

  return {
    id: "tmpl_easa_default",
    name: "EASA Logbook",
    fields,
    formOrder,
    createdAt: new Date(timestamp),
    updatedAt: new Date(timestamp),
  };
}
