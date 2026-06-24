"use client";

import { useActionState } from "react";
import { initialParticipantPortalActionState } from "@/modules/participant-portal/action-state";
import { registerParticipantPortalAction } from "@/modules/participant-portal/registration-actions";
import type { ParticipantPortalActionState } from "@/modules/participant-portal/action-state";

type ParticipantRegistrationFormProps = {
  privacyNoticeText: string;
  studyCode: string;
};

export function ParticipantRegistrationForm({
  privacyNoticeText,
  studyCode
}: ParticipantRegistrationFormProps) {
  const action = registerParticipantPortalAction.bind(null, studyCode);
  const [state, formAction] = useActionState(action, initialParticipantPortalActionState);

  return (
    <form action={formAction} className="space-y-5">
      <FormMessage state={state} />

      <TextField
        autoComplete="name"
        error={fieldError(state, "name")}
        label="Nombre completo"
        name="name"
        required
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          autoComplete="tel"
          error={fieldError(state, "phone")}
          inputMode="tel"
          label="Celular"
          name="phone"
          placeholder="Ej. 5512345678 o +525512345678"
          required
        />
        <TextField
          autoComplete="tel"
          error={fieldError(state, "confirmPhone")}
          inputMode="tel"
          label="Confirmar celular"
          name="confirmPhone"
          placeholder="Repite tu celular"
          required
        />
      </div>

      <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
        <p className="text-sm font-semibold text-zinc-950">Aviso de privacidad</p>
        <div className="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-md border border-zinc-200 bg-white p-3 text-sm leading-6 text-zinc-700">
          {privacyNoticeText}
        </div>
      </div>

      <ConsentCheckbox
        error={fieldError(state, "consentPrivacy")}
        name="consentPrivacy"
      >
        He leído el aviso de privacidad y acepto el tratamiento de mis datos personales para participar en este estudio.
      </ConsentCheckbox>

      <ConsentCheckbox
        error={fieldError(state, "consentSensitive")}
        name="consentSensitive"
      >
        Otorgo mi consentimiento expreso para el tratamiento de la información de salud que proporcione y para la captura,
        almacenamiento y revisión de una selfie y de una a cinco fotografías de mis perfumes, para las finalidades descritas
        en el aviso de privacidad.
      </ConsentCheckbox>

      <button
        className="w-full rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
        type="submit"
      >
        Completar registro
      </button>
    </form>
  );
}

function TextField({
  autoComplete,
  error,
  inputMode,
  label,
  name,
  placeholder,
  required = false
}: {
  autoComplete?: string;
  error?: string;
  inputMode?: "email" | "numeric" | "tel" | "text";
  label: string;
  name: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-zinc-800">{label}</span>
      <input
        autoComplete={autoComplete}
        className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
        inputMode={inputMode}
        name={name}
        placeholder={placeholder}
        required={required}
      />
      {error ? <span className="mt-1 block text-xs font-medium text-red-700">{error}</span> : null}
    </label>
  );
}

function ConsentCheckbox({
  children,
  error,
  name
}: {
  children: string;
  error?: string;
  name: string;
}) {
  return (
    <label className="block rounded-md border border-zinc-200 bg-white p-4">
      <span className="flex items-start gap-3">
        <input
          className="mt-1 h-4 w-4 rounded border-zinc-300 text-teal-700 focus:ring-teal-600"
          name={name}
          type="checkbox"
        />
        <span className="text-sm leading-6 text-zinc-700">{children}</span>
      </span>
      {error ? <span className="mt-2 block text-xs font-medium text-red-700">{error}</span> : null}
    </label>
  );
}

function FormMessage({ state }: { state: ParticipantPortalActionState }) {
  if (state.status === "idle" || !state.message) {
    return null;
  }

  return (
    <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
      {state.message}
    </p>
  );
}

function fieldError(state: ParticipantPortalActionState, field: string): string | undefined {
  const errors = state.fieldErrors as Partial<Record<string, string[]>> | undefined;
  return errors?.[field]?.[0];
}
