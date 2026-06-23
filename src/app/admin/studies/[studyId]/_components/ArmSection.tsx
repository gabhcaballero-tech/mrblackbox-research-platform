"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/app/admin/_components/SubmitButton";
import {
  createArmAction,
  deleteArmAction,
  updateArmAction
} from "@/modules/comparative-rotation/actions";
import { initialComparativeActionState } from "@/modules/comparative-rotation/admin-action-state";
import type { ComparativeArm } from "@/modules/comparative-rotation/admin-repository";
import {
  CANONICAL_COMPARATIVE_ARMS,
  type CanonicalArmCode
} from "@/modules/comparative-rotation/admin-validation";
import { armCodeWithInternalLabel, UI_LABELS } from "@/shared/ui/labels";
import { DangerSubmitButton } from "./DangerSubmitButton";
import { FormMessage } from "./FormMessage";

type ArmSectionProps = {
  arms: ComparativeArm[];
  readOnly: boolean;
  studyId: string;
};

function ArmLabelField({
  defaultValue,
  state
}: {
  defaultValue: string;
  state: typeof initialComparativeActionState;
}) {
  return (
    <label className="block min-w-0">
      <span className="text-sm font-medium text-zinc-800">{UI_LABELS.comparative.operationalLabel}</span>
      <input
        className="mt-2 w-full min-w-0 rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
        defaultValue={defaultValue}
        maxLength={80}
        name="label"
        required
      />
      {state.fieldErrors?.label?.length ? (
        <p className="mt-1 text-xs font-medium text-red-700">{state.fieldErrors.label[0]}</p>
      ) : null}
    </label>
  );
}

function ArmSlot({
  arm,
  canonicalCode,
  defaultLabel,
  readOnly,
  sortOrder,
  studyId
}: {
  arm?: ComparativeArm;
  canonicalCode: CanonicalArmCode;
  defaultLabel: string;
  readOnly: boolean;
  sortOrder: number;
  studyId: string;
}) {
  const create = createArmAction.bind(null, studyId, canonicalCode);
  const update = arm ? updateArmAction.bind(null, studyId, arm.id) : null;
  const remove = arm ? deleteArmAction.bind(null, studyId, arm.id) : null;
  const [createState, createActionState] = useActionState(create, initialComparativeActionState);
  const [updateState, updateActionState] = useActionState(
    update ?? create,
    initialComparativeActionState
  );
  const [deleteState, deleteActionState] = useActionState(
    remove ?? create,
    initialComparativeActionState
  );

  return (
    <article className="rounded-md border border-zinc-200 bg-white p-4">
      <div className="grid gap-3 text-sm sm:grid-cols-3">
        <div className="min-w-0">
          <p className="font-medium text-zinc-500">{UI_LABELS.comparative.canonicalCode}</p>
          <p className="mt-1 break-words text-zinc-950">{armCodeWithInternalLabel(canonicalCode)}</p>
        </div>
        <div>
          <p className="font-medium text-zinc-500">{UI_LABELS.comparative.stableOrder}</p>
          <p className="mt-1 text-zinc-950">{sortOrder}</p>
        </div>
        <div className="min-w-0">
          <p className="font-medium text-zinc-500">{UI_LABELS.common.status}</p>
          <p className="mt-1 text-zinc-950">
            {arm ? UI_LABELS.common.configured : UI_LABELS.common.pending}
          </p>
        </div>
      </div>

      {arm ? (
        <p className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
          {arm.label}
        </p>
      ) : null}

      {!readOnly && arm ? (
        <div className="mt-4 space-y-3">
          <form action={updateActionState} className="space-y-4 rounded-md border border-zinc-200 bg-zinc-50 p-4">
            <ArmLabelField defaultValue={arm.label} state={updateState} />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <FormMessage state={updateState} />
              <SubmitButton pendingLabel={UI_LABELS.common.saving}>{UI_LABELS.actions.saveArm}</SubmitButton>
            </div>
          </form>
          <form action={deleteActionState} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <FormMessage state={deleteState} />
            <DangerSubmitButton pendingLabel={UI_LABELS.common.deleting}>{UI_LABELS.actions.deleteArm}</DangerSubmitButton>
          </form>
        </div>
      ) : null}

      {!readOnly && !arm ? (
        <form action={createActionState} className="mt-4 space-y-4 rounded-md border border-zinc-200 bg-zinc-50 p-4">
          <ArmLabelField defaultValue={defaultLabel} state={createState} />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <FormMessage state={createState} />
            <SubmitButton pendingLabel={UI_LABELS.common.creating}>{UI_LABELS.actions.createArm}</SubmitButton>
          </div>
        </form>
      ) : null}
    </article>
  );
}

export function ArmSection({ arms, readOnly, studyId }: ArmSectionProps) {
  return (
    <section className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">
          {UI_LABELS.comparative.applicationArms}
        </p>
        <h2 className="mt-2 text-xl font-semibold text-zinc-950">{UI_LABELS.comparative.canonicalArms}</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          V1 usa dos brazos canónicos. {UI_LABELS.comparative.physicalArmHelp}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {CANONICAL_COMPARATIVE_ARMS.map((canonicalArm) => (
          <ArmSlot
            arm={arms.find((arm) => arm.code === canonicalArm.code)}
            canonicalCode={canonicalArm.code}
            defaultLabel={canonicalArm.defaultLabel}
            key={canonicalArm.code}
            readOnly={readOnly}
            sortOrder={canonicalArm.sortOrder}
            studyId={studyId}
          />
        ))}
      </div>
    </section>
  );
}
