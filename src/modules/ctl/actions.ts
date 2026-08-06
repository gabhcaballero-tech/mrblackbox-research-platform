"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCapability } from "@/shared/auth/session";
import { createCtlRepository } from "./repository";
import { ctlFormDataToAnswerInput, parseCtlAnswers } from "./service";

export type CreateCtlInterviewerCodeActionState = {
  code?: string;
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
    message: "Codigo de encuestador creado. Copialo ahora; no se podra ver despues.",
    status: "success"
  };
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
    code1: String(formData.get("code1") ?? ""),
    code2: String(formData.get("code2") ?? ""),
    code3: String(formData.get("code3") ?? ""),
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
