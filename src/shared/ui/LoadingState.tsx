import { UI_LABELS } from "./labels";

type LoadingStateProps = {
  message?: string;
};

export function LoadingState({ message = UI_LABELS.common.loading }: LoadingStateProps) {
  return (
    <section
      aria-busy="true"
      className="flex min-h-64 items-center justify-center rounded-lg border border-zinc-200 bg-white p-8"
    >
      <div className="flex items-center gap-3 text-sm font-medium text-zinc-700">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-teal-600" />
        <span>{message}</span>
      </div>
    </section>
  );
}
