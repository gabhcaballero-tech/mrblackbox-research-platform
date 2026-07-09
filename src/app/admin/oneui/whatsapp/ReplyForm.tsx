"use client";

import { useActionState, useState } from "react";
import {
  initialOneuiWhatsAppReplyActionState,
  sendOneuiWhatsAppReplyAction
} from "./actions";

type ReplyFormProps = {
  conversationId: string | null;
  disabled?: boolean;
  disabledMessage?: string | null;
};

export function ReplyForm({ conversationId, disabled = false, disabledMessage = null }: ReplyFormProps) {
  const [state, formAction, pending] = useActionState(
    sendOneuiWhatsAppReplyAction,
    initialOneuiWhatsAppReplyActionState
  );
  const [bodyText, setBodyText] = useState("");
  const empty = bodyText.trim().length === 0;
  const submitDisabled = disabled || pending || !conversationId || empty;

  return (
    <form action={formAction} className="border-t border-zinc-200 px-4 py-4">
      <input name="conversationId" type="hidden" value={conversationId ?? ""} />
      {disabledMessage ? (
        <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {disabledMessage}
        </p>
      ) : null}
      {state.error ? (
        <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
      <div className="flex flex-col gap-3">
        <textarea
          className="min-h-28 resize-y rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 disabled:bg-zinc-100 disabled:text-zinc-500"
          disabled={disabled || pending || !conversationId}
          name="bodyText"
          onChange={(event) => setBodyText(event.target.value)}
          placeholder="Escribe una respuesta…"
          value={bodyText}
        />
        <div className="flex justify-end">
          <button
            className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-600"
            disabled={submitDisabled}
            type="submit"
          >
            {pending ? "Enviando..." : "Enviar respuesta"}
          </button>
        </div>
      </div>
    </form>
  );
}
