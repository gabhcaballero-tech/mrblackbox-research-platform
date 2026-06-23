"use client";

import { useState, type ReactNode } from "react";
import { UI_LABELS } from "@/shared/ui/labels";

type ActivePanel = "create" | "library";

type AddContentTabsProps = {
  createPanel: ReactNode;
  libraryPanel: ReactNode;
};

export function AddContentTabs({ createPanel, libraryPanel }: AddContentTabsProps) {
  const [activePanel, setActivePanel] = useState<ActivePanel>("create");

  return (
    <div>
      <div
        aria-label={UI_LABELS.screener.addContentToScreener}
        className="grid gap-2 sm:inline-grid sm:grid-cols-2"
        role="tablist"
      >
        <button
          aria-controls="create-question-panel"
          aria-selected={activePanel === "create"}
          className={tabClass(activePanel === "create")}
          id="create-question-tab"
          onClick={() => setActivePanel("create")}
          role="tab"
          type="button"
        >
          {UI_LABELS.actions.createNewQuestion}
        </button>
        <button
          aria-controls="insert-library-panel"
          aria-selected={activePanel === "library"}
          className={tabClass(activePanel === "library")}
          id="insert-library-tab"
          onClick={() => setActivePanel("library")}
          role="tab"
          type="button"
        >
          {UI_LABELS.actions.insertFromLibrary}
        </button>
      </div>

      <div
        aria-labelledby="create-question-tab"
        className="mt-4"
        hidden={activePanel !== "create"}
        id="create-question-panel"
        role="tabpanel"
      >
        {createPanel}
      </div>
      <div
        aria-labelledby="insert-library-tab"
        className="mt-4"
        hidden={activePanel !== "library"}
        id="insert-library-panel"
        role="tabpanel"
      >
        {libraryPanel}
      </div>
    </div>
  );
}

function tabClass(active: boolean) {
  return [
    "rounded-md border px-4 py-2 text-sm font-semibold transition",
    active
      ? "border-teal-700 bg-teal-700 text-white"
      : "border-teal-200 bg-white text-teal-700 hover:bg-teal-50"
  ].join(" ");
}
