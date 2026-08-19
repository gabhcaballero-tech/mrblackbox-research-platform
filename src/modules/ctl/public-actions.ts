"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCtlPublicSessionSecret, getPublicCtlInterviewerActor } from "@/shared/auth/ctl-public";
import { createCtlRepository } from "./repository";
import type { CtlSessionView } from "./repository";
import { createNavigoAppRepository } from "@/modules/navigo-app/repository";
import type {
  NavigoEvaluationLinkWhatsAppActionResult,
  NavigoParticipantLinksWhatsAppActionResult
} from "@/modules/navigo-app/actions";
import type { NavigoParticipantLinkSendType } from "@/modules/navigo-app/repository";
import {
  V1_OPERATIONAL_COMMUNICATIONS_DISABLED_MESSAGE,
  areV1OperationalCommunicationsDisabled
} from "@/modules/oneui-whatsapp";
import {
  V1_PARTICIPANT_MIGRATION_MESSAGE,
  createV1ParticipantMigrationBlockedResult,
  isV1ParticipantOperationBlocked
} from "@/modules/v1-migration";
import {
  createCtlPublicSessionToken,
  ctlPublicSessionCookieName,
  ctlPublicSessionMaxAgeSeconds
} from "./public-session";
import {
  ctlFormDataToAnswerInput,
  buildCtlTriangularAnswerValue,
  isCtlTerminatingAnswer,
  normalizeCtlCode,
  parseCtlAnswers,
  parseCtlQuestionAnswer,
  type CtlAnswerInput,
  type CtlOperationalPhase
} from "./service";

export async function loginPublicCtlInterviewerAction(studyCode: string, formData: FormData) {
  if (isV1ParticipantOperationBlocked()) {
    redirect("/migracion-v1");
  }

  const secret = getCtlPublicSessionSecret();
  const includeQa = formData.get("qa") === "1";

  if (!secret) {
    redirect(buildCtlPublicUrl(studyCode, { ctlError: "El acceso CTL no esta configurado.", qa: includeQa ? "1" : "" }));
  }

  const result = await createCtlRepository().validateInterviewerCode({
    code: String(formData.get("interviewerCode") ?? ""),
    studyCode
  });

  if (!result.ok) {
    redirect(buildCtlPublicUrl(studyCode, { ctlError: result.message, qa: includeQa ? "1" : "" }));
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

  redirect(buildCtlPublicUrl(studyCode, { ctlMessage: "Codigo validado correctamente.", qa: includeQa ? "1" : "" }));
}

export async function logoutPublicCtlInterviewerAction(studyCode: string) {
  const cookieStore = await cookies();
  cookieStore.delete(ctlPublicSessionCookieName(studyCode));
  redirect(buildCtlPublicUrl(studyCode));
}

export async function claimPublicCtlFolioAction(studyCode: string, formData: FormData) {
  if (isV1ParticipantOperationBlocked()) {
    redirect("/migracion-v1");
  }

  const actor = await getPublicCtlInterviewerActor({ studyCode });
  const includeQa = formData.get("qa") === "1";

  if (!actor) {
    redirect(buildCtlPublicUrl(studyCode, { ctlError: "Ingresa tu codigo de encuestador para continuar.", qa: includeQa ? "1" : "" }));
  }

  const folio = normalizeCtlCode(formData.get("folio"));
  const result = await createCtlRepository().claimFolioForInterviewerCode({
    ctlInterviewerCodeId: actor.id,
    folio,
    includeQa
  });

  if (!result.ok) {
    redirect(buildCtlPublicUrl(studyCode, { ctlError: result.message, folio, qa: includeQa ? "1" : "" }));
  }

  revalidatePath(`/ctl/${studyCode}`);
  redirect(`/ctl/${encodeURIComponent(studyCode)}/sessions/${encodeURIComponent(result.sessionId)}${includeQa ? "?qa=1" : ""}`);
}

export async function savePublicCtlAnswersAction(studyCode: string, sessionId: string, formData: FormData) {
  if (isV1ParticipantOperationBlocked()) {
    redirect("/migracion-v1");
  }

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

export async function validatePublicCtlPhaseCodeAction(
  studyCode: string,
  sessionId: string,
  phase: CtlOperationalPhase,
  formData: FormData
) {
  if (isV1ParticipantOperationBlocked()) {
    return createV1ParticipantMigrationBlockedResult();
  }

  const actor = await getPublicCtlInterviewerActor({ studyCode });

  if (!actor) {
    return {
      message: "Ingresa tu codigo de encuestador para continuar.",
      ok: false
    };
  }

  const result = await createCtlRepository().validatePhaseCode({
    actor,
    code: String(formData.get("phaseCode") ?? ""),
    phase,
    sessionId
  });

  if (!result.ok) {
    return {
      message: result.message,
      ok: false
    };
  }

  revalidatePath(`/ctl/${studyCode}`);
  revalidatePath(`/ctl/${studyCode}/sessions/${sessionId}`);

  return {
    ok: true
  };
}

export async function savePublicCtlQuestionAnswerAction(
  studyCode: string,
  sessionId: string,
  questionCode: string,
  formData: FormData
) {
  if (isV1ParticipantOperationBlocked()) {
    return createV1ParticipantMigrationBlockedResult();
  }

  const actor = await getPublicCtlInterviewerActor({ studyCode });

  if (!actor) {
    return {
      message: "Ingresa tu codigo de encuestador para continuar.",
      ok: false
    };
  }

  const parsed = parseCtlQuestionAnswer(questionCode, ctlFormDataToAnswerInput(formData));

  if (!parsed.ok) {
    return {
      message: parsed.message,
      missingQuestionCodes: parsed.missingQuestionCodes,
      ok: false
    };
  }

  const repository = createCtlRepository();
  const session = await repository.getSession({ actor, sessionId });
  if (!session) {
    return {
      message: "No encontramos la sesion CTL.",
      ok: false
    };
  }

  const answer = parsed.answer ? enrichCtlTriangularAnswer(parsed.answer, session) : null;
  if (answer && !answer.ok) {
    return {
      message: answer.message,
      ok: false
    };
  }

  const result = await repository.saveAnswers({
    actor,
    answers: answer?.ok ? [answer.answer] : [],
    complete: false,
    sessionId
  });

  if (!result.ok) {
    return {
      message: result.message,
      ok: false
    };
  }

  if (parsed.answer && isCtlTerminatingAnswer(parsed.answer.questionCode, parsed.answer.answerValue)) {
    const cancelled = await repository.cancelSessionAsNotQualified({
      actor,
      sessionId
    });

    if (!cancelled.ok) {
      return {
        message: cancelled.message,
        ok: false
      };
    }

    revalidatePath(`/ctl/${studyCode}`);
    revalidatePath(`/ctl/${studyCode}/sessions/${sessionId}`);

    return {
      ok: true,
      redirectTo: buildCtlPublicUrl(studyCode, { ctlMessage: "Entrevista cerrada como no calificada." })
    };
  }

  revalidatePath(`/ctl/${studyCode}`);
  revalidatePath(`/ctl/${studyCode}/sessions/${sessionId}`);

  return {
    ok: true
  };
}

export async function markPublicCtlComparativeStartedAction(studyCode: string, sessionId: string) {
  if (isV1ParticipantOperationBlocked()) {
    return createV1ParticipantMigrationBlockedResult();
  }

  const actor = await getPublicCtlInterviewerActor({ studyCode });

  if (!actor) {
    return {
      message: "Ingresa tu codigo de encuestador para continuar.",
      ok: false
    };
  }

  const session = await createCtlRepository().getSession({ actor, sessionId });
  if (!session) {
    return {
      message: "No encontramos la sesion CTL.",
      ok: false
    };
  }

  if (!session.responsibleUserId) {
    return {
      message: "No encontramos el responsable interno para registrar T0.",
      ok: false
    };
  }

  const result = await createNavigoAppRepository().recordApplicationStartedFromCtl({
    actorUserId: session.responsibleUserId,
    studyParticipantId: session.participant.id
  });

  if (!result.ok) {
    return {
      message: result.message,
      ok: false
    };
  }

  revalidatePath(`/ctl/${studyCode}/sessions/${sessionId}`);
  if (session.participant.participantLinkToken) {
    revalidatePath(`/p/${encodeURIComponent(session.participant.participantLinkToken)}/activities`);
  }

  return {
    ok: true
  };
}

export async function sendPublicCtlNavigoEvaluationLinkWhatsAppAction(
  studyCode: string,
  sessionId: string,
  requestOrigin: string
): Promise<NavigoEvaluationLinkWhatsAppActionResult> {
  if (isV1ParticipantOperationBlocked()) {
    return { message: V1_PARTICIPANT_MIGRATION_MESSAGE, ok: false };
  }

  const actor = await getPublicCtlInterviewerActor({ studyCode });

  if (!actor) {
    return {
      message: "Ingresa tu codigo de encuestador para continuar.",
      ok: false
    };
  }

  const session = await createCtlRepository().getSession({ actor, sessionId });

  if (!session || session.status !== "COMPLETED") {
    return {
      message: "La sesion CTL debe estar completada antes de enviar el enlace Navigo.",
      ok: false
    };
  }

  if (!session.responsibleUserId) {
    return {
      message: "No encontramos el responsable interno para enviar WhatsApp.",
      ok: false
    };
  }

  if (areV1OperationalCommunicationsDisabled()) {
    return { message: V1_OPERATIONAL_COMMUNICATIONS_DISABLED_MESSAGE, ok: false };
  }

  const result = await createNavigoAppRepository().sendEvaluationLinkWhatsApp({
    actorUserId: session.responsibleUserId,
    requestOrigin,
    studyId: actor.studyId,
    studyParticipantId: session.participant.id
  });

  if (!result.ok) {
    return { message: result.message, ok: false };
  }

  try {
    revalidatePath(`/ctl/${studyCode}/sessions/${sessionId}`);
    revalidatePath(`/admin/studies/${actor.studyId}/navigo-app`);
  } catch {
    // El envio y la auditoria ya quedaron resueltos; no ocultamos el resultado por una revalidacion secundaria.
  }

  return {
    data: {
      evaluationUrl: result.data.evaluationUrl,
      folio: result.data.folio,
      generatedAtIso: result.data.generatedAt.toISOString(),
      message: result.data.whatsappStatus === "ENVIADO"
        ? "Enlace de evaluacion enviado por WhatsApp."
        : "Enlace generado. WhatsApp fallo; copia el enlace para compartirlo manualmente.",
      phone: result.data.phone,
      whatsappError: result.data.whatsappError,
      whatsappMessageId: result.data.whatsappMessageId,
      whatsappStatus: result.data.whatsappStatus
    },
    ok: true
  };
}

export async function sendPublicCtlParticipantLinksWhatsAppAction(
  studyCode: string,
  sessionId: string,
  requestOrigin: string,
  linkType: NavigoParticipantLinkSendType
): Promise<NavigoParticipantLinksWhatsAppActionResult> {
  if (isV1ParticipantOperationBlocked()) {
    return { message: V1_PARTICIPANT_MIGRATION_MESSAGE, ok: false };
  }

  const actor = await getPublicCtlInterviewerActor({ studyCode });

  if (!actor) {
    return {
      message: "Ingresa tu codigo de encuestador para continuar.",
      ok: false
    };
  }

  const session = await createCtlRepository().getSession({ actor, sessionId });

  if (!session || session.status !== "COMPLETED") {
    return {
      message: "La sesion CTL debe estar completada antes de enviar enlaces.",
      ok: false
    };
  }

  if (!session.responsibleUserId) {
    return {
      message: "No encontramos el responsable interno para enviar WhatsApp.",
      ok: false
    };
  }

  if (areV1OperationalCommunicationsDisabled()) {
    return { message: V1_OPERATIONAL_COMMUNICATIONS_DISABLED_MESSAGE, ok: false };
  }

  const result = await createNavigoAppRepository().sendParticipantLinksWhatsApp({
    actorUserId: session.responsibleUserId,
    linkType,
    requestOrigin,
    studyId: actor.studyId,
    studyParticipantId: session.participant.id
  });

  if (!result.ok) {
    return { message: result.message, ok: false };
  }

  try {
    revalidatePath(`/ctl/${studyCode}/sessions/${sessionId}`);
    revalidatePath(`/admin/studies/${actor.studyId}/navigo-app`);
  } catch {
    // El envio y la auditoria ya quedaron resueltos; no ocultamos el resultado por una revalidacion secundaria.
  }

  return {
    data: {
      folio: result.data.folio,
      generatedAtIso: result.data.generatedAt.toISOString(),
      hutUrl: result.data.hutUrl,
      message: result.data.whatsappStatus === "ENVIADO"
        ? publicLinkSentSuccessMessage(result.data.sentLinkType)
        : "Enlace preparado. WhatsApp fallo; copia el enlace disponible para compartirlo manualmente.",
      navigoUrl: result.data.navigoUrl,
      phone: result.data.phone,
      requestedLinkType: result.data.requestedLinkType,
      sentLinkType: result.data.sentLinkType,
      warnings: result.data.warnings,
      whatsappError: result.data.whatsappError,
      whatsappMessageId: result.data.whatsappMessageId,
      whatsappStatus: result.data.whatsappStatus
    },
    ok: true
  };
}

function publicLinkSentSuccessMessage(linkType: NavigoParticipantLinkSendType): string {
  if (linkType === "BOTH") {
    return "Enlaces Navigo y HUT enviados por WhatsApp.";
  }

  return linkType === "HUT" ? "Enlace HUT enviado por WhatsApp." : "Enlace Navigo enviado por WhatsApp.";
}

export async function finishPublicCtlSessionAction(studyCode: string, sessionId: string, formData: FormData) {
  if (isV1ParticipantOperationBlocked()) {
    return createV1ParticipantMigrationBlockedResult();
  }

  const actor = await getPublicCtlInterviewerActor({ studyCode });

  if (!actor) {
    return {
      message: "Ingresa tu codigo de encuestador para continuar.",
      ok: false
    };
  }

  const repository = createCtlRepository();
  const session = await repository.getSession({ actor, sessionId });

  if (!session) {
    return {
      message: "No encontramos la sesion CTL.",
      ok: false
    };
  }

  const mergedInput = mergeCtlAnswerInputs(
    ctlAnswersRecordToInput(session.answers),
    ctlFormDataToAnswerInput(formData)
  );
  const parsed = parseCtlAnswers(mergedInput);

  if (!parsed.ok) {
    return {
      message: parsed.message,
      missingQuestionCodes: parsed.missingQuestionCodes,
      ok: false
    };
  }

  const enrichedAnswers = enrichCtlTriangularAnswers(parsed.answers, session);
  if (!enrichedAnswers.ok) {
    return {
      message: enrichedAnswers.message,
      ok: false
    };
  }

  const result = await repository.saveAnswers({
    actor,
    answers: enrichedAnswers.answers,
    complete: true,
    sessionId
  });

  if (!result.ok) {
    return {
      message: result.message,
      ok: false
    };
  }

  revalidatePath(`/ctl/${studyCode}`);
  revalidatePath(`/ctl/${studyCode}/sessions/${sessionId}`);

  return {
    ok: true,
    redirectTo:
      `/ctl/${encodeURIComponent(studyCode)}/sessions/${encodeURIComponent(sessionId)}` +
      `?ctlMessage=${encodeURIComponent("Evaluación sensorial concluida. Continúe en Navigo con las evaluaciones posteriores.")}`
  };
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

function ctlAnswersRecordToInput(answers: Record<string, unknown>): CtlAnswerInput {
  const input: CtlAnswerInput = {};

  for (const [questionCode, answerValue] of Object.entries(answers)) {
    if (isTriangularQuestionCode(questionCode) && isRecord(answerValue) && "selectedPosition" in answerValue) {
      input[questionCode] = String(answerValue.selectedPosition ?? "");
      continue;
    }

    if (isRecord(answerValue)) {
      input[questionCode] = Object.fromEntries(
        Object.entries(answerValue).map(([rowCode, rowValue]) => [rowCode, String(rowValue ?? "")])
      );
      continue;
    }

    input[questionCode] = String(answerValue ?? "");
  }

  return input;
}

function mergeCtlAnswerInputs(existing: CtlAnswerInput, current: CtlAnswerInput): CtlAnswerInput {
  const merged: CtlAnswerInput = { ...existing };

  for (const [questionCode, answerValue] of Object.entries(current)) {
    if (isRecord(answerValue) && isRecord(merged[questionCode])) {
      merged[questionCode] = {
        ...(merged[questionCode] as Record<string, FormDataEntryValue | null | undefined>),
        ...answerValue
      };
      continue;
    }

    merged[questionCode] = answerValue;
  }

  return merged;
}

function isRecord(value: unknown): value is Record<string, FormDataEntryValue | null | undefined> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function enrichCtlTriangularAnswers(
  answers: Array<{ answerValue: unknown; questionCode: string }>,
  session: CtlSessionView
): { answers: Array<{ answerValue: unknown; questionCode: string }>; ok: true } | { message: string; ok: false } {
  const enriched: Array<{ answerValue: unknown; questionCode: string }> = [];

  for (const answer of answers) {
    const result = enrichCtlTriangularAnswer(answer, session);
    if (!result.ok) {
      return result;
    }
    enriched.push(result.answer);
  }

  return { answers: enriched, ok: true };
}

function enrichCtlTriangularAnswer(
  answer: { answerValue: unknown; questionCode: string },
  session: CtlSessionView
): { answer: { answerValue: unknown; questionCode: string }; ok: true } | { message: string; ok: false } {
  if (!isTriangularQuestionCode(answer.questionCode)) {
    return { answer, ok: true };
  }

  const triangularRotation = session.participant.triangularRotation;
  if (!triangularRotation) {
    return {
      message: "No existe rotacion triangular asignada para este participante.",
      ok: false
    };
  }

  const selectedPosition = normalizeCtlCode(
    isRecord(answer.answerValue) && "selectedPosition" in answer.answerValue
      ? answer.answerValue.selectedPosition
      : answer.answerValue
  );
  const built = buildCtlTriangularAnswerValue({
    answerValue: selectedPosition,
    questionCode: answer.questionCode,
    triangularRotation
  });

  if (!built.ok) {
    return built;
  }

  return {
    answer: {
      answerValue: built.answerValue,
      questionCode: answer.questionCode
    },
    ok: true
  };
}

function isTriangularQuestionCode(questionCode: string): boolean {
  return questionCode === "P1" || questionCode === "P3";
}
