"use client";

import { useState } from "react";

export interface ConfirmStep {
  /** Instructions shown to the user for this step. */
  prompt: string;
  /** Text the user must type exactly to advance past this step. */
  requiredText: string;
}

interface TypedConfirmModalProps {
  title: string;
  steps: ConfirmStep[];
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * A destructive-action confirmation modal that requires the user to type
 * one or more exact strings before proceeding (e.g. a UID, then "DELETE").
 * Replaces chained `window.prompt`/`window.alert` calls with the same
 * safety guarantee in a proper UI.
 */
export function TypedConfirmModal({ title, steps, confirmLabel = "Confirm", onCancel, onConfirm }: TypedConfirmModalProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [value, setValue] = useState("");
  const [mismatch, setMismatch] = useState(false);

  const step = steps[stepIndex];
  const isLastStep = stepIndex === steps.length - 1;

  function handleAdvance() {
    if (value !== step.requiredText) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    setValue("");
    if (isLastStep) {
      onConfirm();
    } else {
      setStepIndex((i) => i + 1);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4">
      <div
        className="w-full max-w-md rounded-2xl border p-6 shadow-xl"
        style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-default)" }}
      >
        <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>{title}</h2>
        <p className="mt-2 whitespace-pre-line text-sm" style={{ color: "var(--text-secondary)" }}>{step.prompt}</p>
        <input
          autoFocus
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setMismatch(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdvance();
          }}
          className="mt-3 w-full rounded-xl border border-[var(--border-default)] p-3 focus:outline-none focus:border-[var(--text-primary)]"
          style={{ color: "var(--text-primary)" }}
        />
        {mismatch && <p className="mt-2 text-sm" style={{ color: "var(--status-error)" }}>That didn&apos;t match. Try again, or cancel.</p>}
        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-xl px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--bg-hover)]"
            style={{ color: "var(--text-secondary)" }}
          >
            Cancel
          </button>
          <button
            onClick={handleAdvance}
            className="rounded-xl px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: "var(--status-error)" }}
          >
            {isLastStep ? confirmLabel : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
