"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  startFieldScreeningAttemptAction,
  type FieldStartActionState
} from "@/modules/field/actions";
import type { FieldDuplicateAttemptSummary, FieldDuplicateParticipantMatch } from "@/modules/field/service";

type ParticipantStartFormProps = {
  error?: string;
  initialState?: FieldStartActionState;
  studyId: string;
};

const dateFormatter = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short"
});

export function ParticipantStartForm({ error, initialState, studyId }: ParticipantStartFormProps) {
  const [state, formAction, pending] = useActionState(
    startFieldScreeningAttemptAction.bind(null, studyId),
    initialState ?? {}
  );
  const values = state.values ?? {};
  const visibleError = state.error ?? error;

  return (
    <form action={formAction} className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-950">Datos mínimos del participante</h2>
      <p className="mt-1 text-sm leading-6 text-zinc-600">
        Captura teléfono, correo o referencia antes de iniciar. Así Campo puede detectar si el panelista ya estaba
        registrado y evitar duplicados.
      </p>

      {visibleError ? (
        <p className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
          {visibleError}
        </p>
      ) : null}

      {state.duplicate ? <DuplicatePanel duplicate={state.duplicate} /> : null}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className={labelClass}>
          Nombre o identificador operativo
          <input className={inputClass} defaultValue={values.name ?? ""} name="name" required />
        </label>
        <label className={labelClass}>
          Teléfono
          <input className={inputClass} defaultValue={values.phone ?? ""} name="phone" />
        </label>
        <label className={labelClass}>
          Correo
          <input className={inputClass} defaultValue={values.email ?? ""} name="email" type="email" />
        </label>
        <label className={labelClass}>
          Referencia externa
          <input className={inputClass} defaultValue={values.externalReference ?? ""} name="externalReference" />
        </label>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button className={primaryButtonClass} disabled={pending} type="submit">
          {pending ? "Revisando panelista..." : "Iniciar filtro"}
        </button>
        {state.duplicate ? (
          <Link className={secondaryButtonClass} href={`/field/studies/${studyId}/screening/new`}>
            Cancelar
          </Link>
        ) : null}
      </div>
    </form>
  );
}

function DuplicatePanel({ duplicate }: { duplicate: NonNullable<FieldStartActionState["duplicate"]> }) {
  return (
    <section className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4" aria-live="polite">
      <h3 className="text-base font-semibold text-amber-950">{duplicate.message}</h3>
      <p className="mt-1 text-sm text-amber-900">
        Revisa la información antes de crear otro intento para el mismo estudio.
      </p>
      <div className="mt-4 space-y-4">
        {duplicate.matches.map((match) => (
          <DuplicateMatchCard key={match.participantProfileId} match={match} />
        ))}
      </div>
    </section>
  );
}

function DuplicateMatchCard({ match }: { match: FieldDuplicateParticipantMatch }) {
  return (
    <article className="rounded-md border border-amber-200 bg-white p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-semibold text-zinc-950">{match.profileName}</p>
          <p className="mt-1 text-sm text-zinc-600">
            {match.studyParticipantExists
              ? "Ya tiene participación registrada en este estudio."
              : "No tiene participación registrada en este estudio."}
          </p>
          {match.matchedIdentifiers.length > 0 ? (
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
              {match.matchedIdentifiers.map((identifier) => (
                <div key={`${identifier.label}-${identifier.value}`}>
                  <dt className="font-medium text-zinc-500">{identifier.label}</dt>
                  <dd className="mt-0.5 break-words text-zinc-900">{identifier.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      </div>

      {match.hasClosedAttemptInStudy ? (
        <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Este panelista ya tuvo un intento previo en este estudio. Confirma si realmente deseas crear otro intento.
        </p>
      ) : null}

      {match.hasOpenAttemptInStudy ? (
        <p className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          Ya existe un intento abierto para este panelista.
        </p>
      ) : null}

      {match.studyAttempts.length > 0 ? (
        <div className="mt-4">
          <h4 className="text-sm font-semibold text-zinc-800">Últimos intentos en este estudio</h4>
          <div className="mt-2 space-y-2">
            {match.studyAttempts.map((attempt) => (
              <AttemptSummary key={attempt.id} attempt={attempt} />
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-3">
        {match.continueAttemptHref ? (
          <Link className={primaryButtonClass} href={match.continueAttemptHref}>
            Continuar intento existente
          </Link>
        ) : null}
        {match.canCreateNewAttempt ? (
          <button
            className={primaryButtonClass}
            name="participantDecision"
            type="submit"
            value={`use-existing:${match.participantProfileId}`}
          >
            Usar este panelista y crear nuevo intento
          </button>
        ) : null}
        {match.canForceNewAttempt ? (
          <button
            className={secondaryButtonClass}
            name="participantDecision"
            type="submit"
            value={`force-new-open:${match.participantProfileId}`}
          >
            Crear nuevo intento de todos modos
          </button>
        ) : null}
      </div>
    </article>
  );
}

function AttemptSummary({ attempt }: { attempt: FieldDuplicateAttemptSummary }) {
  const nse = attempt.nseScore !== null ? `${attempt.nseScore}${attempt.nseClass ? ` · ${attempt.nseClass}` : ""}` : "No calculado";

  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-medium text-zinc-900">
            {fieldAttemptStatusLabel(attempt.status)} · {dateFormatter.format(attempt.startedAt)}
          </p>
          <p className="mt-1">NSE: {nse}</p>
          {attempt.code || attempt.reason ? (
            <p className="mt-1">
              {attempt.code ? `Código: ${attempt.code}` : "Sin código"}
              {attempt.reason ? ` · ${attempt.reason}` : ""}
            </p>
          ) : null}
        </div>
        {attempt.detailHref ? (
          <Link className="text-sm font-semibold text-teal-700 hover:text-teal-800" href={attempt.detailHref}>
            Ver detalle de supervisión
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function fieldAttemptStatusLabel(status: string): string {
  switch (status) {
    case "PASSED":
      return "Elegible";
    case "TERMINATED":
      return "Terminado";
    case "PENDING_REVIEW":
      return "Pendiente de revisión";
    case "INCOMPLETE":
      return "Incompleto";
    case "STARTED":
      return "Iniciado";
    default:
      return status;
  }
}

const labelClass = "flex flex-col gap-1 text-sm font-medium text-zinc-700";
const inputClass =
  "min-h-10 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100";
const primaryButtonClass =
  "inline-flex w-fit rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-400";
const secondaryButtonClass =
  "inline-flex w-fit rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50";
