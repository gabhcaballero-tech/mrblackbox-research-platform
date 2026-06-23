"use client";

import { useActionState, useEffect, useRef } from "react";
import { SubmitButton } from "@/app/admin/_components/SubmitButton";
import {
  createProductAction,
  deleteProductAction,
  updateProductAction
} from "@/modules/comparative-rotation/actions";
import { initialComparativeActionState } from "@/modules/comparative-rotation/admin-action-state";
import type { ComparativeProduct } from "@/modules/comparative-rotation/admin-repository";
import { UI_LABELS } from "@/shared/ui/labels";
import { DangerSubmitButton } from "./DangerSubmitButton";
import { FormMessage } from "./FormMessage";

type ProductSectionProps = {
  products: ComparativeProduct[];
  readOnly: boolean;
  studyId: string;
};

function ProductFields({
  defaults,
  state
}: {
  defaults?: Partial<ComparativeProduct>;
  state: typeof initialComparativeActionState;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_minmax(0,1fr)]">
      <label className="block min-w-0">
        <span className="text-sm font-medium text-zinc-800">{UI_LABELS.comparative.internalCode}</span>
        <input
          className="mt-2 w-full min-w-0 rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm uppercase text-zinc-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
          defaultValue={defaults?.internalCode}
          maxLength={32}
          name="internalCode"
          required
        />
        {state.fieldErrors?.internalCode?.length ? (
          <p className="mt-1 text-xs font-medium text-red-700">{state.fieldErrors.internalCode[0]}</p>
        ) : null}
      </label>
      <label className="block min-w-0">
        <span className="text-sm font-medium text-zinc-800">{UI_LABELS.comparative.safeLabel}</span>
        <input
          className="mt-2 w-full min-w-0 rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
          defaultValue={defaults?.displayLabel}
          maxLength={80}
          name="displayLabel"
          required
        />
        {state.fieldErrors?.displayLabel?.length ? (
          <p className="mt-1 text-xs font-medium text-red-700">{state.fieldErrors.displayLabel[0]}</p>
        ) : null}
      </label>
      <label className="block min-w-0">
        <span className="text-sm font-medium text-zinc-800">{UI_LABELS.comparative.realNameAdmin}</span>
        <input
          className="mt-2 w-full min-w-0 rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
          defaultValue={defaults?.realName}
          maxLength={160}
          name="realName"
          required
        />
        {state.fieldErrors?.realName?.length ? (
          <p className="mt-1 text-xs font-medium text-red-700">{state.fieldErrors.realName[0]}</p>
        ) : null}
      </label>
    </div>
  );
}

function CreateProductForm({ readOnly, studyId }: { readOnly: boolean; studyId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const action = createProductAction.bind(null, studyId);
  const [state, formAction] = useActionState(action, initialComparativeActionState);

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
    }
  }, [state.status]);

  if (readOnly) {
    return null;
  }

  return (
    <form action={formAction} className="space-y-4 rounded-md border border-zinc-200 bg-zinc-50 p-4" ref={formRef}>
      <ProductFields state={state} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FormMessage state={state} />
        <SubmitButton pendingLabel={UI_LABELS.common.creating}>{UI_LABELS.actions.createProduct}</SubmitButton>
      </div>
    </form>
  );
}

function ProductRow({
  product,
  readOnly,
  studyId
}: {
  product: ComparativeProduct;
  readOnly: boolean;
  studyId: string;
}) {
  const updateAction = updateProductAction.bind(null, studyId, product.id);
  const deleteAction = deleteProductAction.bind(null, studyId, product.id);
  const [updateState, updateFormAction] = useActionState(updateAction, initialComparativeActionState);
  const [deleteState, deleteFormAction] = useActionState(deleteAction, initialComparativeActionState);

  return (
    <article className="rounded-md border border-zinc-200 bg-white p-4">
      <div className="grid gap-3 text-sm md:grid-cols-4">
        <div className="min-w-0">
          <p className="font-medium text-zinc-500">{UI_LABELS.comparative.internalCode}</p>
          <p className="mt-1 break-all font-mono font-semibold text-zinc-950">{product.internalCode}</p>
        </div>
        <div className="min-w-0">
          <p className="font-medium text-zinc-500">{UI_LABELS.comparative.safeLabel}</p>
          <p className="mt-1 break-words text-zinc-950">{product.displayLabel}</p>
        </div>
        <div className="min-w-0">
          <p className="font-medium text-zinc-500">{UI_LABELS.comparative.realNameAdmin}</p>
          <p className="mt-1 break-words text-zinc-950">{product.realName}</p>
        </div>
        <div>
          <p className="font-medium text-zinc-500">{UI_LABELS.comparative.sensitive}</p>
          <p className="mt-1 text-zinc-950">
            {product.isSensitive ? UI_LABELS.common.yes : UI_LABELS.common.no}
          </p>
        </div>
      </div>

      {!readOnly ? (
        <div className="mt-4 space-y-3">
          <form action={updateFormAction} className="space-y-4 rounded-md border border-zinc-200 bg-zinc-50 p-4">
            <ProductFields defaults={product} state={updateState} />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <FormMessage state={updateState} />
              <SubmitButton pendingLabel={UI_LABELS.common.saving}>{UI_LABELS.actions.saveProduct}</SubmitButton>
            </div>
          </form>
          <form action={deleteFormAction} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <FormMessage state={deleteState} />
            <DangerSubmitButton pendingLabel={UI_LABELS.common.deleting}>{UI_LABELS.actions.deleteProduct}</DangerSubmitButton>
          </form>
        </div>
      ) : null}
    </article>
  );
}

export function ProductSection({ products, readOnly, studyId }: ProductSectionProps) {
  return (
    <section className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">
          {UI_LABELS.comparative.products}
        </p>
        <h2 className="mt-2 text-xl font-semibold text-zinc-950">
          {UI_LABELS.comparative.studyProducts}
        </h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          {UI_LABELS.comparative.realNameAdminHelp}
        </p>
      </div>

      <CreateProductForm readOnly={readOnly} studyId={studyId} />

      <div className="space-y-3">
        {products.length === 0 ? (
          <p className="rounded-md border border-dashed border-zinc-300 bg-zinc-50 px-3 py-6 text-center text-sm text-zinc-600">
            {UI_LABELS.comparative.noProducts}
          </p>
        ) : (
          products.map((product) => (
            <ProductRow key={product.id} product={product} readOnly={readOnly} studyId={studyId} />
          ))
        )}
      </div>
    </section>
  );
}
