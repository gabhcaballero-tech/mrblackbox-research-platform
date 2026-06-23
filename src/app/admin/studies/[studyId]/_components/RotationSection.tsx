"use client";

import { useActionState, useEffect, useRef } from "react";
import { SubmitButton } from "@/app/admin/_components/SubmitButton";
import {
  createRotationPlanAction,
  retireRotationPlanAction,
  updateRotationPlanAction
} from "@/modules/comparative-rotation/actions";
import { initialComparativeActionState } from "@/modules/comparative-rotation/admin-action-state";
import type {
  ComparativeArm,
  ComparativeProduct,
  ComparativeRotationPlan
} from "@/modules/comparative-rotation/admin-repository";
import type { ComparativeChecklist } from "@/modules/comparative-rotation/admin-service";
import { DangerSubmitButton } from "./DangerSubmitButton";
import { FormMessage } from "./FormMessage";

type RotationSectionProps = {
  arms: ComparativeArm[];
  checklist: ComparativeChecklist;
  products: ComparativeProduct[];
  readOnly: boolean;
  rotationPlans: ComparativeRotationPlan[];
  studyId: string;
};

function productOptions(products: ComparativeProduct[]) {
  return products.map((product) => (
    <option key={product.id} value={product.id}>
      {product.internalCode} - {product.displayLabel}
    </option>
  ));
}

function defaultProductForArm(plan: ComparativeRotationPlan | undefined, armCode: "left" | "right") {
  return plan?.arms.find((arm) => arm.studyArm.code === armCode)?.studyProductId;
}

function defaultOrderForArm(plan: ComparativeRotationPlan | undefined, armCode: "left" | "right") {
  return plan?.arms.find((arm) => arm.studyArm.code === armCode)?.applicationOrder ?? (armCode === "left" ? 1 : 2);
}

function RotationFields({
  arms,
  plan,
  products,
  state
}: {
  arms: ComparativeArm[];
  plan?: ComparativeRotationPlan;
  products: ComparativeProduct[];
  state: typeof initialComparativeActionState;
}) {
  const leftArm = arms.find((arm) => arm.code === "left");
  const rightArm = arms.find((arm) => arm.code === "right");

  return (
    <div className="space-y-4">
      <label className="block min-w-0">
        <span className="text-sm font-medium text-zinc-800">Codigo de rotacion</span>
        <input
          className="mt-2 w-full min-w-0 rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm uppercase text-zinc-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
          defaultValue={plan?.rotationCode}
          maxLength={32}
          name="rotationCode"
          required
        />
        {state.fieldErrors?.rotationCode?.length ? (
          <p className="mt-1 text-xs font-medium text-red-700">{state.fieldErrors.rotationCode[0]}</p>
        ) : null}
      </label>

      <div className="grid gap-4 lg:grid-cols-2">
        <fieldset className="rounded-md border border-zinc-200 bg-white p-4">
          <legend className="px-1 text-sm font-semibold text-zinc-800">
            {leftArm?.label ?? "Brazo izquierdo"}
          </legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_6rem]">
            <label className="block min-w-0">
              <span className="text-sm font-medium text-zinc-700">Producto</span>
              <select
                className="mt-2 w-full min-w-0 rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                defaultValue={defaultProductForArm(plan, "left")}
                name="leftProductId"
                required
              >
                <option value="">Selecciona</option>
                {productOptions(products)}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-zinc-700">Orden</span>
              <select
                className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                defaultValue={defaultOrderForArm(plan, "left")}
                name="leftApplicationOrder"
                required
              >
                <option value="1">1</option>
                <option value="2">2</option>
              </select>
            </label>
          </div>
        </fieldset>

        <fieldset className="rounded-md border border-zinc-200 bg-white p-4">
          <legend className="px-1 text-sm font-semibold text-zinc-800">
            {rightArm?.label ?? "Brazo derecho"}
          </legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_6rem]">
            <label className="block min-w-0">
              <span className="text-sm font-medium text-zinc-700">Producto</span>
              <select
                className="mt-2 w-full min-w-0 rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                defaultValue={defaultProductForArm(plan, "right")}
                name="rightProductId"
                required
              >
                <option value="">Selecciona</option>
                {productOptions(products)}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-zinc-700">Orden</span>
              <select
                className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                defaultValue={defaultOrderForArm(plan, "right")}
                name="rightApplicationOrder"
                required
              >
                <option value="1">1</option>
                <option value="2">2</option>
              </select>
            </label>
          </div>
        </fieldset>
      </div>
    </div>
  );
}

function CreateRotationForm({
  arms,
  checklist,
  products,
  readOnly,
  studyId
}: Omit<RotationSectionProps, "rotationPlans">) {
  const formRef = useRef<HTMLFormElement>(null);
  const action = createRotationPlanAction.bind(null, studyId);
  const [state, formAction] = useActionState(action, initialComparativeActionState);

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
    }
  }, [state.status]);

  if (readOnly) {
    return null;
  }

  if (!checklist.canCreateRotation) {
    return (
      <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        {checklist.rotationBlockReason}
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-4 rounded-md border border-zinc-200 bg-zinc-50 p-4" ref={formRef}>
      <RotationFields arms={arms} products={products} state={state} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FormMessage state={state} />
        <SubmitButton pendingLabel="Creando...">Crear rotacion</SubmitButton>
      </div>
    </form>
  );
}

function RotationPlanRow({
  arms,
  plan,
  products,
  readOnly,
  studyId
}: {
  arms: ComparativeArm[];
  plan: ComparativeRotationPlan;
  products: ComparativeProduct[];
  readOnly: boolean;
  studyId: string;
}) {
  const updateAction = updateRotationPlanAction.bind(null, studyId, plan.id);
  const retireAction = retireRotationPlanAction.bind(null, studyId, plan.id);
  const [updateState, updateFormAction] = useActionState(updateAction, initialComparativeActionState);
  const [retireState, retireFormAction] = useActionState(retireAction, initialComparativeActionState);

  return (
    <article className="rounded-md border border-zinc-200 bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="break-all font-mono text-lg font-semibold text-zinc-950">
            {plan.rotationCode}
          </h3>
          <p className="mt-1 text-sm text-zinc-600">Estado: {plan.status}</p>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-zinc-500">
            <tr>
              <th className="px-2 py-2 font-medium">Brazo</th>
              <th className="px-2 py-2 font-medium">Orden</th>
              <th className="px-2 py-2 font-medium">Codigo seguro</th>
              <th className="px-2 py-2 font-medium">Etiqueta segura</th>
              <th className="px-2 py-2 font-medium">Nombre real ADMIN</th>
            </tr>
          </thead>
          <tbody>
            {plan.arms.map((arm) => (
              <tr className="border-t border-zinc-100" key={arm.id}>
                <td className="px-2 py-2">{arm.studyArm.label}</td>
                <td className="px-2 py-2">{arm.applicationOrder}</td>
                <td className="break-all px-2 py-2 font-mono">{arm.studyProduct.internalCode}</td>
                <td className="break-words px-2 py-2">{arm.studyProduct.displayLabel}</td>
                <td className="break-words px-2 py-2">{arm.studyProduct.realName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!readOnly ? (
        <div className="mt-4 space-y-3">
          <form action={updateFormAction} className="space-y-4 rounded-md border border-zinc-200 bg-zinc-50 p-4">
            <RotationFields arms={arms} plan={plan} products={products} state={updateState} />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <FormMessage state={updateState} />
              <SubmitButton pendingLabel="Guardando...">Guardar rotacion</SubmitButton>
            </div>
          </form>
          {plan.status === "ACTIVE" ? (
            <form action={retireFormAction} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <FormMessage state={retireState} />
              <DangerSubmitButton pendingLabel="Retirando...">Retirar rotacion</DangerSubmitButton>
            </form>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export function RotationSection({
  arms,
  checklist,
  products,
  readOnly,
  rotationPlans,
  studyId
}: RotationSectionProps) {
  return (
    <section className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">
          Rotaciones manuales
        </p>
        <h2 className="mt-2 text-xl font-semibold text-zinc-950">Planes por codigo manual</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          Cada plan usa dos brazos, dos productos distintos y ordenes 1 y 2. Las etiquetas de
          participante se generan en servidor.
        </p>
      </div>

      <CreateRotationForm
        arms={arms}
        checklist={checklist}
        products={products}
        readOnly={readOnly}
        studyId={studyId}
      />

      <div className="space-y-3">
        {rotationPlans.length === 0 ? (
          <p className="rounded-md border border-dashed border-zinc-300 bg-zinc-50 px-3 py-6 text-center text-sm text-zinc-600">
            Aun no hay rotaciones manuales.
          </p>
        ) : (
          rotationPlans.map((plan) => (
            <RotationPlanRow
              arms={arms}
              key={plan.id}
              plan={plan}
              products={products}
              readOnly={readOnly}
              studyId={studyId}
            />
          ))
        )}
      </div>
    </section>
  );
}
