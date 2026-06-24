"use client";

import { TurnstileSubmitControl } from "@/shared/ui/TurnstileSubmitControl";

export function TurnstileField() {
  return <TurnstileSubmitControl buttonLabel="Enviar código" pendingLabel="Enviando código..." />;
}
