"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type DetergentsTemplateButtonProps = {
  compact?: boolean;
  studyId: string;
};

type LoadState = {
  message: string;
  status: "idle" | "loading" | "success" | "error";
};

type TemplateResponse = {
  data?: {
    studyId?: string;
  };
  message?: string;
  ok?: boolean;
};

const successMessage =
  "Plantilla cargada como borrador editable. Revisa el cuestionario antes de publicarlo.";
const unsafePartialMessage =
  "El estudio ya tiene datos registrados. Para editarlo crea una nueva versión del filtro.";

export function DetergentsTemplateButton({
  compact = false,
  studyId
}: DetergentsTemplateButtonProps) {
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ message: "", status: "idle" });

  async function loadTemplate() {
    if (state.status === "loading") {
      return;
    }

    setState({ message: "", status: "loading" });

    try {
      const response = await fetch("/admin/studies/templates/detergents", {
        method: "POST"
      });
      const body = (await response.json().catch(() => null)) as TemplateResponse | null;

      if (!response.ok || !body?.ok) {
        const message = body?.message?.includes("datos registrados")
          ? unsafePartialMessage
          : body?.message ?? "No fue posible cargar la plantilla de detergentes.";
        setState({ message, status: "error" });
        return;
      }

      setState({ message: successMessage, status: "success" });
      router.push(`/admin/studies/${body.data?.studyId ?? studyId}/screener`);
      router.refresh();
    } catch {
      setState({
        message: "No fue posible cargar la plantilla de detergentes. Intenta de nuevo.",
        status: "error"
      });
    }
  }

  const buttonClass = compact
    ? "inline-flex w-fit rounded-md bg-teal-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-600"
    : "inline-flex w-fit rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-600";

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <button className={buttonClass} disabled={state.status === "loading"} onClick={loadTemplate} type="button">
        {state.status === "loading" ? "Cargando plantilla..." : "Cargar plantilla de detergentes"}
      </button>
      {state.message ? (
        <p
          className={
            state.status === "success"
              ? "rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
              : "rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          }
          role={state.status === "success" ? "status" : "alert"}
        >
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
