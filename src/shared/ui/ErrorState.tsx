import type { ReactNode } from "react";

type ErrorStateProps = {
  title: string;
  message: string;
  action?: ReactNode;
};

export function ErrorState({ title, message, action }: ErrorStateProps) {
  return (
    <section className="rounded-lg border border-red-200 bg-red-50 p-8">
      <div className="max-w-2xl">
        <p className="text-sm font-semibold uppercase tracking-wide text-red-700">Error</p>
        <h2 className="mt-3 text-2xl font-semibold text-red-950">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-red-800">{message}</p>
        {action ? <div className="mt-6">{action}</div> : null}
      </div>
    </section>
  );
}
