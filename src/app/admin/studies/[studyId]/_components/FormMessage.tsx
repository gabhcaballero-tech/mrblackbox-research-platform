import type { ComparativeActionState } from "@/modules/comparative-rotation/admin-action-state";

export function FormMessage({ state }: { state: ComparativeActionState }) {
  if (state.status === "idle" || !state.message) {
    return null;
  }

  const tone =
    state.status === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : "border-red-200 bg-red-50 text-red-800";

  return <p className={`rounded-md border px-3 py-2 text-sm ${tone}`}>{state.message}</p>;
}
