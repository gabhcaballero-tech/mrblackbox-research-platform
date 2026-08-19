import { V1_PARTICIPANT_MIGRATION_MESSAGE, V1_PARTICIPANT_MIGRATION_TITLE } from "@/modules/v1-migration";

export default function V1MigrationPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-12 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-6rem)] max-w-2xl items-center justify-center">
        <section className="w-full rounded-2xl border border-white/10 bg-white/10 p-8 text-center shadow-2xl shadow-black/30 backdrop-blur">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-200">Migración V2</p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
            {V1_PARTICIPANT_MIGRATION_TITLE}
          </h1>
          <p className="mt-5 whitespace-pre-line text-base leading-7 text-slate-100">
            {V1_PARTICIPANT_MIGRATION_MESSAGE}
          </p>
        </section>
      </div>
    </main>
  );
}
