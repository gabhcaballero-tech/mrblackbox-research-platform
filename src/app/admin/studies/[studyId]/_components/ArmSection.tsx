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
      <span className="text-sm font-medium text-zinc-800">Etiqueta operativa</span>
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
          <p className="font-medium text-zinc-500">Codigo canonico</p>
          <p className="mt-1 break-all font-mono font-semibold text-zinc-950">{canonicalCode}</p>
        </div>
        <div>
          <p className="font-medium text-zinc-500">Orden estable</p>
          <p className="mt-1 text-zinc-950">{sortOrder}</p>
        </div>
        <div className="min-w-0">
          <p className="font-medium text-zinc-500">Estado</p>
          <p className="mt-1 text-zinc-950">{arm ? "Configurado" : "Pendiente"}</p>
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
              <SubmitButton pendingLabel="Guardando...">Guardar brazo</SubmitButton>
            </div>
          </form>
          <form action={deleteActionState} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <FormMessage state={deleteState} />
            <DangerSubmitButton pendingLabel="Eliminando...">Eliminar brazo</DangerSubmitButton>
          </form>
        </div>
      ) : null}

      {!readOnly && !arm ? (
        <form action={createActionState} className="mt-4 space-y-4 rounded-md border border-zinc-200 bg-zinc-50 p-4">
          <ArmLabelField defaultValue={defaultLabel} state={createState} />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <FormMessage state={createState} />
            <SubmitButton pendingLabel="Creando...">Crear brazo</SubmitButton>
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
          Brazos de aplicacion
        </p>
        <h2 className="mt-2 text-xl font-semibold text-zinc-950">Dos brazos canonicos</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          V1 usa la representacion interna existente: <span className="font-mono">left</span> y{" "}
          <span className="font-mono">right</span>. El brazo fisico no define el orden de aplicacion.
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
