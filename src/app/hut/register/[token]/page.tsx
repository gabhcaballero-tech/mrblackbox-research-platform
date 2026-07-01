import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { createHutRepository } from "@/modules/hut";
import { resolveRequestOrigin } from "@/shared/utils/request-origin";
import { HutRegistrationForm } from "./HutRegistrationForm";

export const dynamic = "force-dynamic";

type HutRegistrationPageProps = {
  params: Promise<{
    token: string;
  }>;
};

export default async function HutRegistrationPage({ params }: HutRegistrationPageProps) {
  const { token } = await params;
  const requestOrigin = resolveRequestOrigin(await headers());
  const result = await createHutRepository().getRegistrationView(token, requestOrigin);

  if (!result.ok) {
    notFound();
  }

  const view = result.data;
  const isRegistered = view.status === "REGISTERED";

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6">
          <span className="text-sm font-semibold uppercase tracking-wide text-teal-700">MR Black Box</span>
          <p className="mt-1 text-lg font-semibold text-zinc-950">Registro HUT</p>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 sm:px-6">
        <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">{view.studyName}</p>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-950">Folio {view.folio}</h1>
          <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
            <Field label="Primera fragancia / brazo izquierdo" value={view.firstFragranceLeftArm} />
            <Field label="Segunda fragancia / brazo derecho" value={view.secondFragranceRightArm} />
          </dl>
        </section>

        {isRegistered ? (
          <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-emerald-950">Este folio ya fue registrado.</h2>
            <p className="mt-2 text-sm leading-6 text-emerald-900">
              {view.participantName ? `Participante: ${view.participantName}.` : "El registro ya esta completo."}
            </p>
            {view.participantLink ? (
              <a className="mt-4 inline-flex rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800" href={view.participantLink}>
                Abrir portal del participante
              </a>
            ) : null}
          </section>
        ) : (
          <HutRegistrationForm requestOrigin={requestOrigin} token={view.registrationToken} />
        )}
      </main>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="mt-1 font-semibold text-zinc-950">{value}</dd>
    </div>
  );
}
