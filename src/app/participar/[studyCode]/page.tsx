import { getParticipantPortalAvailability, PARTICIPANT_PORTAL_UNAVAILABLE_MESSAGE } from "@/modules/participant-portal/access";
import { requestParticipantPortalOtpAction } from "@/modules/participant-portal/actions";
import { createParticipantPortalRepository } from "@/modules/participant-portal/repository";
import { participantPortalStudyCodeSchema } from "@/modules/participant-portal/validation";
import { TurnstileField } from "./_components/TurnstileField";

type ParticipantPortalPageProps = {
  params: Promise<{ studyCode: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function ParticipantPortalPage({ params, searchParams }: ParticipantPortalPageProps) {
  const { studyCode: rawStudyCode } = await params;
  const search = (await searchParams) ?? {};
  const studyCode = participantPortalStudyCodeSchema.safeParse(rawStudyCode);

  if (!studyCode.success) {
    return <UnavailablePortal />;
  }

  const availability = await getParticipantPortalAvailability({
    repository: createParticipantPortalRepository(),
    studyCode: studyCode.data
  });

  if (!availability.ok) {
    return <UnavailablePortal />;
  }

  const error = firstParam(search.error);

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-10">
      <section className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Portal de participación</p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-950">{availability.study.name}</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          Escribe tu correo electrónico para recibir un código de acceso. Este acceso es solo para participantes.
        </p>

        {error === "validation_error" ? (
          <Message tone="error">Revisa el correo y completa la verificación de seguridad.</Message>
        ) : null}

        <form action={requestParticipantPortalOtpAction} className="mt-6 space-y-4">
          <input name="studyCode" type="hidden" value={availability.study.code} />
          <label className="block">
            <span className="text-sm font-medium text-zinc-800">Correo electrónico</span>
            <input
              autoComplete="email"
              className={inputClass}
              name="email"
              required
              type="email"
            />
          </label>
          <TurnstileField />
        </form>

        <p className="mt-5 text-xs leading-5 text-zinc-500">
          Si los datos son válidos, recibirás un código de acceso por correo.
        </p>
      </section>
    </main>
  );
}

function UnavailablePortal() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-10">
      <section className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Portal de participación</p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-950">
          {PARTICIPANT_PORTAL_UNAVAILABLE_MESSAGE}
        </h1>
      </section>
    </main>
  );
}

function Message({ children, tone }: { children: string; tone: "error" | "success" }) {
  const className =
    tone === "error"
      ? "mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
      : "mt-6 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800";

  return <div className={className}>{children}</div>;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const inputClass =
  "mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100";
