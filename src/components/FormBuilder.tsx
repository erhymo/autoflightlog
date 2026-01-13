"use client";

import { useState } from "react";
import { EASA_FIELD_CATALOG, FieldDefinition } from "@/types/fieldCatalog";
import { Template, TemplateField, View, ViewColumn } from "@/types/domain";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface FormBuilderProps {
  template: Template;
  view: View;
  onSave: (fields: TemplateField[], formOrder: string[], columns: ViewColumn[]) => Promise<void>;
}

export function FormBuilder({ template, view, onSave }: FormBuilderProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedFieldIds, setSelectedFieldIds] = useState<string[]>(
    template.fields.map((f) => f.id)
  );
  const [orderedFieldIds, setOrderedFieldIds] = useState<string[]>(
    template.formOrder || template.fields.map((f) => f.id)
  );
  const [columnFieldIds, setColumnFieldIds] = useState<string[]>(
    view.columns?.map((c) => c.fieldId) || view.visibleFields || []
  );
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(
    view.columns?.reduce((acc, col) => ({ ...acc, [col.fieldId]: col.width }), {}) || {}
  );
  const [saving, setSaving] = useState(false);

  // Group fields by category
  const groupedFields = EASA_FIELD_CATALOG.reduce((acc, field) => {
    const category = field.category || "other";
    if (!acc[category]) acc[category] = [];
    acc[category].push(field);
    return acc;
  }, {} as Record<string, FieldDefinition[]>);

  const handleFieldToggle = (fieldId: string) => {
    setSelectedFieldIds((prev) =>
      prev.includes(fieldId)
        ? prev.filter((id) => id !== fieldId)
        : [...prev, fieldId]
    );
  };

  const handleNextToStep2 = () => {
    // Update ordered fields to only include selected ones
    setOrderedFieldIds((prev) =>
      prev.filter((id) => selectedFieldIds.includes(id)).concat(
        selectedFieldIds.filter((id) => !prev.includes(id))
      )
    );
    setStep(2);
  };

  const handleNextToStep3 = () => {
    // Update column fields to only include ordered ones
    setColumnFieldIds((prev) =>
      prev.filter((id) => orderedFieldIds.includes(id)).concat(
        orderedFieldIds.filter((id) => !prev.includes(id))
      )
    );
    setStep(3);
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setOrderedFieldIds((items) => {
        const oldIndex = items.indexOf(active.id as string);
        const newIndex = items.indexOf(over.id as string);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleColumnToggle = (fieldId: string) => {
    setColumnFieldIds((prev) =>
      prev.includes(fieldId)
        ? prev.filter((id) => id !== fieldId)
        : [...prev, fieldId]
    );
  };

  const handleColumnWidthChange = (fieldId: string, width: number) => {
    setColumnWidths((prev) => ({ ...prev, [fieldId]: width }));
  };

  const handleColumnDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setColumnFieldIds((items) => {
        const oldIndex = items.indexOf(active.id as string);
        const newIndex = items.indexOf(over.id as string);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const fields: TemplateField[] = orderedFieldIds.map((fieldId, index) => {
        const catalogField = EASA_FIELD_CATALOG.find((f) => f.id === fieldId)!;
        const existingField = template.fields.find((f) => f.id === fieldId);
        return {
          id: fieldId,
          name: catalogField.name,
          type: catalogField.type as any,
          required: existingField?.required || false,
          order: index,
        };
      });

      const columns: ViewColumn[] = columnFieldIds.map((fieldId, index) => ({
        fieldId,
        width: columnWidths[fieldId] || 150,
        order: index,
      }));

      await onSave(fields, orderedFieldIds, columns);
    } catch (error) {
      console.error("Error saving template:", error);
      alert("Error saving template");
    } finally {
      setSaving(false);
    }
  };

  if (step === 1) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Step 1: Select Fields
          </h2>
          <p className="text-gray-600">Choose which fields to include in your form</p>
        </div>

        <div className="space-y-6">
          {Object.entries(groupedFields).map(([category, fields]) => (
            <div key={category} className="border border-gray-200 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-3 capitalize">
                {category}
              </h3>
              <div className="space-y-2">
                {fields.map((field) => (
                  <label
                    key={field.id}
                    className="flex items-center space-x-3 cursor-pointer hover:bg-gray-50 p-2 rounded"
                  >
                    <input
                      type="checkbox"
                      checked={selectedFieldIds.includes(field.id)}
                      onChange={() => handleFieldToggle(field.id)}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <span className="text-gray-700">{field.name}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={handleNextToStep2}
          disabled={selectedFieldIds.length === 0}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next: Reorder Fields
        </button>
      </div>
    );
  }

  if (step === 2) {
    return (
      <div className="space-y-6">
        <div>
          <button
            onClick={() => setStep(1)}
            className="text-blue-600 hover:text-blue-700 mb-4"
          >
            ← Back to field selection
          </button>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Step 2: Reorder Fields
          </h2>
          <p className="text-gray-600">Drag and drop to reorder the fields</p>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={orderedFieldIds}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {orderedFieldIds.map((fieldId) => (
                <SortableFieldItem key={fieldId} id={fieldId} />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        <button
          onClick={handleNextToStep3}
          disabled={orderedFieldIds.length === 0}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          Next: Configure Grid Columns
        </button>
      </div>
    );
  }

  // Step 3
  return (
    <div className="space-y-6">
      <div>
        <button
          onClick={() => setStep(2)}
          className="text-blue-600 hover:text-blue-700 mb-4"
        >
          ← Back to field ordering
        </button>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Step 3: Configure Grid Columns
        </h2>
        <p className="text-gray-600">
          Select which fields to show as columns and configure their widths
        </p>
      </div>

      <div className="space-y-4">
        <div className="border border-gray-200 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">
            Select Columns
          </h3>
          <div className="space-y-2">
            {orderedFieldIds.map((fieldId) => {
              const field = EASA_FIELD_CATALOG.find((f) => f.id === fieldId);
              return (
                <label
                  key={fieldId}
                  className="flex items-center space-x-3 cursor-pointer hover:bg-gray-50 p-2 rounded"
                >
                  <input
                    type="checkbox"
                    checked={columnFieldIds.includes(fieldId)}
                    onChange={() => handleColumnToggle(fieldId)}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span className="text-gray-700">{field?.name}</span>
                </label>
              );
            })}
          </div>
        </div>

        {columnFieldIds.length > 0 && (
          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              Reorder & Set Column Widths
            </h3>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleColumnDragEnd}
            >
              <SortableContext
                items={columnFieldIds}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {columnFieldIds.map((fieldId) => (
                    <SortableColumnItem
                      key={fieldId}
                      id={fieldId}
                      width={columnWidths[fieldId] || 150}
                      onWidthChange={(width) =>
                        handleColumnWidthChange(fieldId, width)
                      }
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        )}
      </div>

      <button
        onClick={handleSave}
        disabled={saving || columnFieldIds.length === 0}
        className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save & Go to Logbook"}
      </button>
    </div>
  );
}

function SortableFieldItem({ id }: { id: string }) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const field = EASA_FIELD_CATALOG.find((f) => f.id === id);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="p-4 bg-white border border-gray-200 rounded-lg cursor-move hover:bg-gray-50 flex items-center gap-3"
    >
      <svg
        className="w-5 h-5 text-gray-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 8h16M4 16h16"
        />
      </svg>
      <span className="text-gray-900 font-medium">{field?.name}</span>
      <span className="text-gray-500 text-sm ml-auto">{field?.type}</span>
    </div>
  );
}

function SortableColumnItem({
  id,
  width,
  onWidthChange,
}: {
  id: string;
  width: number;
  onWidthChange: (width: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const field = EASA_FIELD_CATALOG.find((f) => f.id === id);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="p-4 bg-white border border-gray-200 rounded-lg flex items-center gap-3"
    >
      <div {...attributes} {...listeners} className="cursor-move">
        <svg
          className="w-5 h-5 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 8h16M4 16h16"
          />
        </svg>
      </div>
      <span className="text-gray-900 font-medium flex-1">{field?.name}</span>
      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-600">Width:</label>
        <input
          type="number"
          value={width}
          onChange={(e) => onWidthChange(Number(e.target.value))}
          min={50}
          max={500}
          className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
        />
        <span className="text-sm text-gray-500">px</span>
      </div>
    </div>
  );
}

