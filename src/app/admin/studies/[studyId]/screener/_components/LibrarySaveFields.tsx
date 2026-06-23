"use client";

import { useId, useState } from "react";
import { UI_LABELS } from "@/shared/ui/labels";

type LibraryScope = "GENERIC" | "STUDY_SPECIFIC";

type LibrarySaveFieldsProps = {
  defaultCategory?: string | null;
  defaultDescription?: string | null;
  defaultName: string;
  defaultScope?: LibraryScope;
  defaultTags?: string[];
  readOnly: boolean;
};

export function LibrarySaveFields({
  defaultCategory,
  defaultDescription,
  defaultName,
  defaultScope = "STUDY_SPECIFIC",
  defaultTags = [],
  readOnly
}: LibrarySaveFieldsProps) {
  const fieldId = useId();
  const [scope, setScope] = useState<LibraryScope>(defaultScope);
  const [confirmGeneric, setConfirmGeneric] = useState(false);
  const scopeHelp =
    scope === "GENERIC" ? UI_LABELS.library.genericScopeHelp : UI_LABELS.library.specificScopeHelp;

  return (
    <>
      <div className={labelClass}>
        <label htmlFor={`${fieldId}-name`}>{UI_LABELS.library.itemName}</label>
        <input
          aria-describedby={`${fieldId}-name-help`}
          className={inputClass}
          defaultValue={defaultName}
          disabled={readOnly}
          id={`${fieldId}-name`}
          name="name"
          placeholder={UI_LABELS.library.itemNamePlaceholder}
          required
        />
        <span className={helpClass} id={`${fieldId}-name-help`}>
          {UI_LABELS.library.itemNameHelp}
        </span>
      </div>
      <div className={labelClass}>
        <label htmlFor={`${fieldId}-category`}>{UI_LABELS.library.category}</label>
        <input
          aria-describedby={`${fieldId}-category-help`}
          className={inputClass}
          defaultValue={defaultCategory ?? ""}
          disabled={readOnly}
          id={`${fieldId}-category`}
          name="category"
          placeholder={UI_LABELS.library.categoryPlaceholder}
        />
        <span className={helpClass} id={`${fieldId}-category-help`}>
          {UI_LABELS.library.categoryHelp}
        </span>
      </div>
      <div className={`${labelClass} md:col-span-2`}>
        <label htmlFor={`${fieldId}-description`}>{UI_LABELS.library.description}</label>
        <input
          aria-describedby={`${fieldId}-description-help`}
          className={inputClass}
          defaultValue={defaultDescription ?? ""}
          disabled={readOnly}
          id={`${fieldId}-description`}
          name="description"
          placeholder={UI_LABELS.library.descriptionPlaceholder}
        />
        <span className={helpClass} id={`${fieldId}-description-help`}>
          {UI_LABELS.library.descriptionHelp}
        </span>
      </div>
      <div className={labelClass}>
        <label htmlFor={`${fieldId}-tags`}>{UI_LABELS.library.tags}</label>
        <input
          aria-describedby={`${fieldId}-tags-help`}
          className={inputClass}
          defaultValue={defaultTags.join(", ")}
          disabled={readOnly}
          id={`${fieldId}-tags`}
          name="tags"
          placeholder={UI_LABELS.library.tagsPlaceholder}
        />
        <span className={helpClass} id={`${fieldId}-tags-help`}>
          {UI_LABELS.library.tagsHelp}
        </span>
      </div>
      <div className={labelClass}>
        <label htmlFor={`${fieldId}-scope`}>{UI_LABELS.library.scope}</label>
        <select
          aria-describedby={`${fieldId}-scope-help`}
          className={inputClass}
          disabled={readOnly}
          id={`${fieldId}-scope`}
          name="scope"
          onChange={(event) => {
            const nextScope = event.target.value as LibraryScope;
            setScope(nextScope);

            if (nextScope === "STUDY_SPECIFIC") {
              setConfirmGeneric(false);
            }
          }}
          value={scope}
        >
          <option value="STUDY_SPECIFIC">{UI_LABELS.library.specific}</option>
          <option value="GENERIC">{UI_LABELS.library.generic}</option>
        </select>
        <span className={helpClass} id={`${fieldId}-scope-help`}>
          {scopeHelp}
        </span>
      </div>
      {scope === "GENERIC" ? (
        <label className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 md:col-span-2">
          <input
            checked={confirmGeneric}
            disabled={readOnly}
            name="confirmGeneric"
            onChange={(event) => setConfirmGeneric(event.target.checked)}
            type="checkbox"
          />
          <span>{UI_LABELS.library.confirmGeneric}</span>
        </label>
      ) : null}
    </>
  );
}

const labelClass = "flex flex-col gap-1 text-sm font-medium text-zinc-700";
const helpClass = "text-xs font-normal leading-5 text-zinc-500";
const inputClass =
  "min-h-10 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100 disabled:bg-zinc-100 disabled:text-zinc-500";
