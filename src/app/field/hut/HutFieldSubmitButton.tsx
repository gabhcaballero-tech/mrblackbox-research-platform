"use client";

import { useFormStatus } from "react-dom";

export function HutFieldSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="min-h-12 w-full rounded-md bg-teal-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-teal-400"
      disabled={pending}
      type="submit"
    >
      {pending ? "Guardando..." : "Guardar respuesta"}
    </button>
  );
}
