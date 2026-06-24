"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/app/admin/_components/SubmitButton";
import { saveParticipantPortalConfigAction } from "@/modules/participant-portal/admin-actions";
import {
  DEFAULT_PARTICIPANT_PORTAL_PRIVACY_NOTICE,
  type ParticipantPortalAdminData
} from "@/modules/participant-portal/admin-service";
import { initialParticipantPortalActionState } from "@/modules/participant-portal/action-state";
import type { ParticipantPortalActionState } from "@/modules/participant-portal/action-state";

type ParticipantPortalSectionProps = {
  data: ParticipantPortalAdminData;
  studyId: string;
};

export function ParticipantPortalSection({ data, studyId }: ParticipantPortalSectionProps) {
  const action = saveParticipantPortalConfigAction.bind(null, studyId);
  const [state, formAction] = useActionState(action, initialParticipantPortalActionState);
  const [enabled, setEnabled] = useState(data.effectiveConfig.enabled);
  const config = data.effectiveConfig;

  return (
    <section className="space-y-5 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">
          Portal de participantes
        </p>
        <h2 className="mt-2 text-xl font-semibold text-zinc-950">
          Configuración pública del estudio
        </h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          Controla si las personas pueden iniciar su registro público después de verificar su correo.
        </p>
      </div>

      <form action={formAction} className="space-y-5">
        <label className="flex items-start gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-4">
          <input
            className="mt-1 h-4 w-4 rounded border-zinc-300 text-teal-700 focus:ring-teal-600"
            defaultChecked={config.enabled}
            name="enabled"
            onChange={(event) => setEnabled(event.currentTarget.checked)}
            type="checkbox"
          />
          <span>
            <span className="block text-sm font-semibold text-zinc-950">Habilitar portal público</span>
            <span className="mt-1 block text-sm leading-6 text-zinc-600">
              El portal debe permanecer deshabilitado hasta que el estudio esté activo y tenga un screener publicado.
            </span>
          </span>
        </label>

        {enabled ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Al habilitar el portal, las personas con enlace podrán iniciar el registro público.
          </p>
        ) : null}

        <FormMessage state={state} />

        <div className="grid gap-4 md:grid-cols-2">
          <TextField
            defaultValue={config.privacyNoticeVersion}
            error={fieldError(state, "privacyNoticeVersion")}
            label="Versión del aviso"
            name="privacyNoticeVersion"
            required
          />
          <TextField
            defaultValue={config.folioPrefix}
            error={fieldError(state, "folioPrefix")}
            label="Prefijo de folio"
            name="folioPrefix"
            required
          />
        </div>

        <label className="block">
          <span className="text-sm font-medium text-zinc-800">Aviso de privacidad y consentimiento</span>
          <textarea
            className="mt-2 min-h-64 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm leading-6 text-zinc-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            defaultValue={config.privacyNoticeText}
            name="privacyNoticeText"
            placeholder={DEFAULT_PARTICIPANT_PORTAL_PRIVACY_NOTICE}
          />
          <span className="mt-1 block text-xs leading-5 text-zinc-500">
            Este texto se guardará como snapshot exacto cuando la persona acepte participar.
          </span>
          {fieldError(state, "privacyNoticeText") ? (
            <span className="mt-1 block text-xs font-medium text-red-700">
              {fieldError(state, "privacyNoticeText")}
            </span>
          ) : null}
        </label>

        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
          <p className="text-sm font-medium text-zinc-700">Hash actual del aviso</p>
          <p className="mt-1 break-all font-mono text-xs text-zinc-600">
            {data.portalConfig ? config.privacyNoticeHash : "Se generará al guardar."}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <NumberField
            defaultValue={config.evidenceRetentionDays}
            error={fieldError(state, "evidenceRetentionDays")}
            label="Retención de evidencias (días)"
            name="evidenceRetentionDays"
          />
          <NumberField
            defaultValue={config.otpCooldownSeconds}
            error={fieldError(state, "otpCooldownSeconds")}
            label="Espera entre códigos (segundos)"
            name="otpCooldownSeconds"
          />
          <NumberField
            defaultValue={config.maxOtpAttempts}
            error={fieldError(state, "maxOtpAttempts")}
            label="Máximo de intentos OTP"
            name="maxOtpAttempts"
          />
          <NumberField
            defaultValue={config.nextFolioSequence}
            error={fieldError(state, "nextFolioSequence")}
            label="Siguiente secuencia de folio"
            name="nextFolioSequence"
          />
          <NumberField
            defaultValue={config.folioMaxSequence}
            error={fieldError(state, "folioMaxSequence")}
            label="Máxima secuencia de folio"
            name="folioMaxSequence"
          />
          <NumberField
            defaultValue={config.minPerfumePhotos}
            error={fieldError(state, "minPerfumePhotos")}
            label="Mínimo de fotos de perfumes"
            name="minPerfumePhotos"
          />
          <NumberField
            defaultValue={config.maxPerfumePhotos}
            error={fieldError(state, "maxPerfumePhotos")}
            label="Máximo de fotos de perfumes"
            name="maxPerfumePhotos"
          />
          <NumberField
            defaultValue={config.maxImageBytes}
            error={fieldError(state, "maxImageBytes")}
            label="Tamaño máximo de imagen (bytes)"
            name="maxImageBytes"
          />
        </div>

        <div className="flex justify-end">
          <SubmitButton pendingLabel="Guardando portal...">Guardar portal</SubmitButton>
        </div>
      </form>
    </section>
  );
}

function TextField({
  defaultValue,
  error,
  label,
  name,
  required = false
}: {
  defaultValue: string;
  error?: string;
  label: string;
  name: string;
  required?: boolean;
}) {
  return (
    <label className="block min-w-0">
      <span className="text-sm font-medium text-zinc-800">{label}</span>
      <input
        className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
        defaultValue={defaultValue}
        name={name}
        required={required}
      />
      {error ? <span className="mt-1 block text-xs font-medium text-red-700">{error}</span> : null}
    </label>
  );
}

function NumberField({
  defaultValue,
  error,
  label,
  name
}: {
  defaultValue: number;
  error?: string;
  label: string;
  name: string;
}) {
  return (
    <label className="block min-w-0">
      <span className="text-sm font-medium text-zinc-800">{label}</span>
      <input
        className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
        defaultValue={defaultValue}
        min={0}
        name={name}
        type="number"
      />
      {error ? <span className="mt-1 block text-xs font-medium text-red-700">{error}</span> : null}
    </label>
  );
}

function FormMessage({ state }: { state: ParticipantPortalActionState }) {
  if (state.status === "idle" || !state.message) {
    return null;
  }

  const tone =
    state.status === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : "border-red-200 bg-red-50 text-red-800";

  return <p className={`rounded-md border px-3 py-2 text-sm ${tone}`}>{state.message}</p>;
}

function fieldError(state: ParticipantPortalActionState, field: string): string | undefined {
  const errors = state.fieldErrors as Partial<Record<string, string[]>> | undefined;
  return errors?.[field]?.[0];
}
