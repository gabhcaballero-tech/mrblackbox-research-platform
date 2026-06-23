import type { ReactNode } from "react";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
};

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <section className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-3xl">
        {eyebrow ? (
          <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-teal-700">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-3xl font-semibold text-zinc-950 sm:text-4xl">{title}</h1>
        {description ? (
          <p className="mt-3 text-base leading-7 text-zinc-600">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </section>
  );
}
