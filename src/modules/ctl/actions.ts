"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCapability } from "@/shared/auth/session";
import { createCtlRepository } from "./repository";
import { ctlFormDataToAnswerInput, parseCtlAnswers } from "./service";

export type CreateCtlInterviewerCodeActionState = {
  code?: string;
  label?: string;
  message: string;
  status: "error" | "idle" | "success";
};

export async function createCtlInterviewerCodeAction(
  studyId: string,
  _previousState: CreateCtlInterviewerCodeActionState,
  formData: FormData
): Promise<CreateCtlInterviewerCodeActionState> {
  const actor = await requireCapability("field:access");
  const result = await createCtlRepository().createInterviewerCode({
    actor,
    label: String(formData.get("label") ?? ""),
    studyId
  });

  if (!result.ok) {
    return {
      message: result.message,
      status: "error"
    };
  }

  revalidatePath(`/admin/studies/${studyId}/ctl`);

  return {
    code: result.code,
    label: result.interviewerCode.label,
    message: "Codigo de encuestador creado. Copialo ahora; no se podra ver despues.",
    status: "success"
  };
}

export async function resetCtlInterviewerCodeAction(
  studyId: string,
  _previousState: CreateCtlInterviewerCodeActionState,
  formData: FormData
): Promise<CreateCtlInterviewerCodeActionState> {
  const actor = await requireCapability("field:access");
  const result = await createCtlRepository().resetInterviewerCode({
    actor,
    ctlInterviewerCodeId: String(formData.get("ctlInterviewerCodeId") ?? ""),
    studyId
  });

  if (!result.ok) {
    return {
      message: result.message,
      status: "error"
    };
  }

  revalidatePath(`/admin/studies/${studyId}/ctl`);

  return {
    code: result.code,
    label: result.interviewerCode.label,
    message: "Codigo regenerado. Copialo ahora; no se podra ver despues.",
    status: "success"
  };
}

export async function deleteCtlInterviewerCodeAction(studyId: string, ctlInterviewerCodeId: string) {
  const actor = await requireCapability("field:access");
  const result = await createCtlRepository().deleteInterviewerCode({
    actor,
    ctlInterviewerCodeId,
    studyId
  });

  if (!result.ok) {
    redirect(`/admin/studies/${studyId}/ctl?ctlError=${encodeURIComponent(result.message)}`);
  }

  revalidatePath(`/admin/studies/${studyId}/ctl`);
  redirect(`/admin/studies/${studyId}/ctl?ctlMessage=${encodeURIComponent(
    result.mode === "deleted"
      ? "Encuestador eliminado correctamente."
      : "Encuestador desactivado porque ya tiene sesiones asociadas."
  )}`);
}

export async function updateCtlInterviewerCodeStatusAction(
  studyId: string,
  ctlInterviewerCodeId: string,
  status: "ACTIVE" | "DISABLED"
) {
  const actor = await requireCapability("field:access");
  const result = await createCtlRepository().updateInterviewerCodeStatus({
    actor,
    ctlInterviewerCodeId,
    status,
    studyId
  });

  if (!result.ok) {
    redirect(`/admin/studies/${studyId}/ctl?ctlError=${encodeURIComponent(result.message)}`);
  }

  revalidatePath(`/admin/studies/${studyId}/ctl`);
  redirect(`/admin/studies/${studyId}/ctl?ctlMessage=${encodeURIComponent(
    status === "ACTIVE" ? "Codigo reactivado correctamente." : "Codigo desactivado correctamente."
  )}`);
}

export async function startCtlSessionAction(studyId: string, formData: FormData) {
  const actor = await requireCapability("field:access");
  const result = await createCtlRepository().startSession({
    actor,
    folio: String(formData.get("folio") ?? ""),
    studyId
  });

  if (!result.ok) {
    redirect(`/admin/studies/${studyId}/ctl?ctlError=${encodeURIComponent(result.message)}`);
  }

  revalidatePath(`/admin/studies/${studyId}/ctl`);
  redirect(`/admin/studies/${studyId}/ctl/${result.sessionId}`);
}

export async function saveCtlAnswersAction(studyId: string, sessionId: string, formData: FormData) {
  const actor = await requireCapability("field:access");
  const parsed = parseCtlAnswers(ctlFormDataToAnswerInput(formData));
  const complete = formData.get("complete") === "1";

  if (!parsed.ok) {
    redirect(
      `/admin/studies/${studyId}/ctl/${sessionId}?ctlError=${encodeURIComponent(parsed.message)}`
    );
  }

  const result = await createCtlRepository().saveAnswers({
    actor,
    answers: parsed.answers,
    complete,
    sessionId
  });

  if (!result.ok) {
    redirect(
      `/admin/studies/${studyId}/ctl/${sessionId}?ctlError=${encodeURIComponent(result.message)}`
    );
  }

  revalidatePath(`/admin/studies/${studyId}/ctl`);
  revalidatePath(`/admin/studies/${studyId}/ctl/${sessionId}`);
  revalidatePath(`/admin/studies/${studyId}/navigo-app`);

  if (complete) {
    redirect(`/admin/studies/${studyId}/ctl?ctlMessage=${encodeURIComponent("CTL completado correctamente.")}`);
  }

  redirect(
    `/admin/studies/${studyId}/ctl/${sessionId}?ctlMessage=${encodeURIComponent("Avance CTL guardado.")}`
  );
}

export async function resetCtlSessionAction(studyId: string, sessionId: string, formData: FormData) {
  const actor = await requireCapability("field:access");
  const confirmation = String(formData.get("confirmation") ?? "").trim();

  if (confirmation !== "REINICIAR CTL") {
    redirect(
      `/admin/studies/${studyId}/ctl/${sessionId}?ctlError=${encodeURIComponent("Escribe REINICIAR CTL para confirmar.")}`
    );
  }

  const result = await createCtlRepository().resetSession({
    actor,
    sessionId
  });

  if (!result.ok) {
    redirect(`/admin/studies/${studyId}/ctl/${sessionId}?ctlError=${encodeURIComponent(result.message)}`);
  }

  revalidatePath(`/admin/studies/${studyId}/ctl`);
  revalidatePath(`/admin/studies/${studyId}/ctl/${sessionId}`);
  redirect(`/admin/studies/${studyId}/ctl/${sessionId}?ctlMessage=${encodeURIComponent("CTL reiniciado correctamente.")}`);
}
