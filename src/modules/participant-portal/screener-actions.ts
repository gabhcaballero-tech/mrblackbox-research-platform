"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getParticipantPortalAuth } from "@/shared/auth/participant-portal";
import { createParticipantPortalRepository } from "./repository";
import { createParticipantPortalScreenerRepository } from "./screener-repository";
import { saveParticipantPortalScreenerAnswer } from "./screener-service";
import { participantPortalStudyCodeSchema } from "./validation";

function portalFilterPath(studyCode: string, questionId?: string | null, message?: string) {
  const params = new URLSearchParams();

  if (questionId) {
    params.set("question", questionId);
  }

  if (message) {
    params.set("error", message);
  }

  const query = params.toString();
  return `/participar/${encodeURIComponent(studyCode)}/filtro${query ? `?${query}` : ""}`;
}

export async function saveParticipantPortalScreenerAnswerAction(
  studyCodeInput: string,
  attemptId: string,
  questionId: string,
  formData: FormData
): Promise<void> {
  const studyCode = normalizeStudyCodeOrRedirect(studyCodeInput);
  const portalRepository = createParticipantPortalRepository();
  const auth = await getParticipantPortalAuth({ repository: portalRepository, studyCode });

  if (auth.status === "no_session") {
    redirect(`/participar/${encodeURIComponent(studyCode)}`);
  }

  if (auth.status === "internal_user_blocked") {
    redirect(`/participar/${encodeURIComponent(studyCode)}/verificar?error=internal`);
  }

  const result = await saveParticipantPortalScreenerAnswer({
    attemptId,
    formInput: getParticipantPortalAnswerInputFromFormData(formData),
    identity: auth.identity,
    questionId,
    repository: createParticipantPortalScreenerRepository(),
    studyCode
  });

  if (!result.ok) {
    redirect(portalFilterPath(studyCode, questionId, result.message));
  }

  revalidatePath(`/participar/${studyCode}/filtro`);
  revalidatePath(`/participar/${studyCode}/resultado`);

  if (result.data.closed) {
    redirect(`/participar/${encodeURIComponent(studyCode)}/resultado`);
  }

  redirect(portalFilterPath(studyCode, result.data.nextQuestionId));
}

function normalizeStudyCodeOrRedirect(value: unknown): string {
  const parsed = participantPortalStudyCodeSchema.safeParse(String(value ?? ""));

  if (!parsed.success) {
    redirect("/");
  }

  return parsed.data;
}

function getParticipantPortalAnswerInputFromFormData(formData: FormData) {
  const values = formData.getAll("value").map(String).filter(Boolean);

  return {
    otherText: String(formData.get("otherText") ?? ""),
    value: values.length > 1 ? values : values[0]
  };
}
