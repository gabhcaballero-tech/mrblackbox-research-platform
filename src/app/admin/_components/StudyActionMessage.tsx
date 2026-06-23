import type { StudyActionState } from "@/modules/studies/action-state";

type StudyActionMessageProps = {
  state: StudyActionState;
};

export function StudyActionMessage({ state }: StudyActionMessageProps) {
  if (state.status === "idle" || !state.message) {
    return null;
  }

  const tone =
    state.status === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : "border-red-200 bg-red-50 text-red-800";

  return <p className={`rounded-md border px-3 py-2 text-sm ${tone}`}>{state.message}</p>;
}
