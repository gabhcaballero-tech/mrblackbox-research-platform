import type { ReactNode } from "react";

type EmptyStateProps = {
  title: string;
  description: string;
  action?: ReactNode;
};

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <section className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center">
      <div className="mx-auto max-w-2xl">
        <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Estado inicial
        </p>
        <h2 className="mt-3 text-2xl font-semibold text-zinc-950">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-zinc-600">{description}</p>
        {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
      </div>
    </section>
  );
}
