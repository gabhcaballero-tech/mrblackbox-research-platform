import Link from "next/link";
import type { ReactNode } from "react";
import { APP_ROUTES } from "@/shared/types/routes";
import { UI_LABELS } from "./labels";

const navItems = [
  { href: APP_ROUTES.home, label: UI_LABELS.navigation.home },
  { href: APP_ROUTES.admin, label: UI_LABELS.areas.admin },
  { href: APP_ROUTES.field, label: UI_LABELS.areas.field },
  { href: APP_ROUTES.participantExample, label: UI_LABELS.areas.participant }
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <Link className="flex flex-col" href={APP_ROUTES.home}>
            <span className="text-sm font-semibold uppercase tracking-wide text-teal-700">
              MR Black Box
            </span>
            <span className="text-lg font-semibold text-zinc-950">Plataforma de investigación</span>
          </Link>

          <nav aria-label={UI_LABELS.navigation.main} className="flex flex-wrap gap-2">
            {navItems.map((item) => (
              <Link
                className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:border-teal-500 hover:text-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
                href={item.href}
                key={item.href}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
