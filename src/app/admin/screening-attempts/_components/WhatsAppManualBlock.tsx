"use client";

import { useState } from "react";
import {
  markParticipantManualMessageSentAction,
  sendParticipantConfirmationWhatsAppAction
} from "@/modules/participant-portal/evidence-review-actions";
import type { WhatsAppAutomationStatus } from "@/modules/oneui-whatsapp/templates";

export function WhatsAppManualBlock({
  attemptId,
  automationStatus,
  manualMessageStatus,
  message,
  whatsappUrl
}: {
  attemptId: string;
  automationStatus: WhatsAppAutomationStatus;
  manualMessageStatus: "MARKED_SENT" | "NOT_SENT";
  message: string;
  whatsappUrl: string | null;
}) {
  const [copied, setCopied] = useState(false);

  async function copyMessage() {
    await navigator.clipboard.writeText(message);
    setCopied(true);
  }

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
      <h3 className="text-base font-semibold text-emerald-950">Mensaje para WhatsApp</h3>
      <div className="mt-3 rounded-md border border-emerald-200 bg-white p-3 text-sm text-emerald-950">
        <p className="font-semibold">Envío automático: {automationStatusLabel(automationStatus.status)}</p>
        {automationStatus.metaMessageId ? (
          <p className="mt-1 text-xs text-emerald-900">Meta ID: {automationStatus.metaMessageId}</p>
        ) : null}
        {automationStatus.error ? (
          <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">
            Error automático: {automationStatus.error}
          </p>
        ) : null}
      </div>
      <textarea
        className="mt-3 min-h-40 w-full rounded-md border border-emerald-200 bg-white p-3 font-mono text-sm text-emerald-950"
        readOnly
        value={message}
      />
      <div className="mt-3 flex flex-wrap gap-3">
        <button className={primaryButtonClass} onClick={copyMessage} type="button">
          Copiar mensaje
        </button>
        {whatsappUrl ? (
          <a className={secondaryButtonClass} href={whatsappUrl} rel="noreferrer" target="_blank">
            Abrir en WhatsApp
          </a>
        ) : null}
        <form action={markParticipantManualMessageSentAction.bind(null, attemptId)}>
          <button className={secondaryButtonClass} type="submit">
            Marcar mensaje como enviado
          </button>
        </form>
        <form action={sendParticipantConfirmationWhatsAppAction.bind(null, attemptId)}>
          <button className={secondaryButtonClass} type="submit">
            {automationStatus.status === "NO_ENVIADO" ? "Enviar automático" : "Reenviar automático"}
          </button>
        </form>
      </div>
      {copied ? <p className="mt-2 text-sm text-emerald-900">Mensaje copiado.</p> : null}
      <p className="mt-2 text-xs text-emerald-900">
        Estado manual: {manualMessageStatus === "MARKED_SENT" ? "Marcado como enviado" : "No enviado"}
      </p>
    </div>
  );
}

function automationStatusLabel(status: WhatsAppAutomationStatus["status"]): string {
  if (status === "ENVIADO") {
    return "Enviado";
  }
  if (status === "ERROR") {
    return "Error";
  }
  return "No enviado";
}

const primaryButtonClass =
  "inline-flex w-fit rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800";
const secondaryButtonClass =
  "inline-flex w-fit rounded-md border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100";
