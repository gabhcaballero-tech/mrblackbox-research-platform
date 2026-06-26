import type { ReactNode } from "react";

export function PublicParticipantShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 lg:px-8">
          <span className="text-sm font-semibold uppercase tracking-wide text-teal-700">MR BLACK BOX</span>
          <p className="mt-1 text-lg font-semibold text-zinc-950">Evaluaciones de fragancia</p>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
