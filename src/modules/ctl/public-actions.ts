"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCtlPublicSessionSecret, getPublicCtlInterviewerActor } from "@/shared/auth/ctl-public";
import { createCtlRepository } from "./repository";
import {
  createCtlPublicSessionToken,
  ctlPublicSessionCookieName,
  ctlPublicSessionMaxAgeSeconds
} from "./public-session";
import { ctlFormDataToAnswerInput, normalizeCtlCode, parseCtlAnswers } from "./service";

export async function loginPublicCtlInterviewerAction(studyCode: string, formData: FormData) {
  const secret = getCtlPublicSessionSecret();

  if (!secret) {
    redirect(buildCtlPublicUrl(studyCode, { ctlError: "El acceso CTL no esta configurado." }));
  }

  const result = await createCtlRepository().validateInterviewerCode({
    code: String(formData.get("interviewerCode") ?? ""),
    studyCode
  });

  if (!result.ok) {
    redirect(buildCtlPublicUrl(studyCode, { ctlError: result.message }));
  }

  const cookieStore = await cookies();
  const token = createCtlPublicSessionToken({
    ctlInterviewerCodeId: result.interviewerCode.id,
    secret,
    studyCode
  });

  cookieStore.set(ctlPublicSessionCookieName(studyCode), token, {
    httpOnly: true,
    maxAge: ctlPublicSessionMaxAgeSeconds(),
    path: `/ctl/${studyCode}`,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });

  redirect(buildCtlPublicUrl(studyCode, { ctlMessage: "Codigo validado correctamente." }));
}

export async function logoutPublicCtlInterviewerAction(studyCode: string) {
  const cookieStore = await cookies();
  cookieStore.delete(ctlPublicSessionCookieName(studyCode));
  redirect(buildCtlPublicUrl(studyCode));
}

export async function claimPublicCtlFolioAction(studyCode: string, formData: FormData) {
  const actor = await getPublicCtlInterviewerActor({ studyCode });

  if (!actor) {
    redirect(buildCtlPublicUrl(studyCode, { ctlError: "Ingresa tu codigo de encuestador para continuar." }));
  }

  const folio = normalizeCtlCode(formData.get("folio"));
  const result = await createCtlRepository().claimFolioForInterviewerCode({
    ctlInterviewerCodeId: actor.id,
    folio
  });

  if (!result.ok) {
    redirect(buildCtlPublicUrl(studyCode, { ctlError: result.message, folio }));
  }

  revalidatePath(`/ctl/${studyCode}`);
  redirect(`/ctl/${encodeURIComponent(studyCode)}/sessions/${encodeURIComponent(result.sessionId)}`);
}

export async function savePublicCtlAnswersAction(studyCode: string, sessionId: string, formData: FormData) {
  const actor = await getPublicCtlInterviewerActor({ studyCode });

  if (!actor) {
    redirect(buildCtlPublicUrl(studyCode, { ctlError: "Ingresa tu codigo de encuestador para continuar." }));
  }

  const parsed = parseCtlAnswers(ctlFormDataToAnswerInput(formData));
  const complete = formData.get("complete") === "1";

  if (!parsed.ok) {
    redirect(
      `/ctl/${encodeURIComponent(studyCode)}/sessions/${encodeURIComponent(sessionId)}?ctlError=${encodeURIComponent(parsed.message)}`
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
      `/ctl/${encodeURIComponent(studyCode)}/sessions/${encodeURIComponent(sessionId)}?ctlError=${encodeURIComponent(result.message)}`
    );
  }

  revalidatePath(`/ctl/${studyCode}`);
  revalidatePath(`/ctl/${studyCode}/sessions/${sessionId}`);

  if (complete) {
    redirect(buildCtlPublicUrl(studyCode, { ctlMessage: "CTL completado correctamente." }));
  }

  redirect(
    `/ctl/${encodeURIComponent(studyCode)}/sessions/${encodeURIComponent(sessionId)}?ctlMessage=${encodeURIComponent("Avance CTL guardado.")}`
  );
}

function buildCtlPublicUrl(studyCode: string, params: Record<string, string> = {}): string {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      searchParams.set(key, value);
    }
  }

  const query = searchParams.toString();

  return `/ctl/${encodeURIComponent(studyCode)}${query ? `?${query}` : ""}`;
}
