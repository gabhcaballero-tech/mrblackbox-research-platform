"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createOneuiWhatsAppRepository, sendNavigoConfirmationWhatsApp } from "@/modules/oneui-whatsapp";
import { createParticipantPortalScreenerRepository } from "@/modules/participant-portal/screener-repository";
import { generateParticipantReferenceCode } from "@/modules/participant-portal/review";
import { getFieldActorForRequest } from "./auth";
import { createFieldRepository } from "./repository";
import {
  saveFieldScreeningAnswer,
  startFieldScreeningAttempt,
  type FieldDuplicateDetectionResult
} from "./service";
import {
  getFieldAnswerInputFromFormData,
  getFieldParticipantInputFromFormData
} from "./validation";

export type FieldStartActionState = {
  duplicate?: FieldDuplicateDetectionResult;
  error?: string;
  values?: {
    email?: string;
    externalReference?: string;
    name?: string;
    phone?: string;
  };
};

function fieldAttemptPath(attemptId: string, questionId?: string | null, message?: string) {
  const params = new URLSearchParams();

  if (questionId) {
    params.set("question", questionId);
  }

  if (message) {
    params.set("error", message);
  }

  const query = params.toString();
  return `/field/screening/${attemptId}${query ? `?${query}` : ""}`;
}

export async function startFieldScreeningAttemptAction(
  studyId: string,
  _previousState: FieldStartActionState,
  formData: FormData
): Promise<FieldStartActionState> {
  const actor = await getFieldActorForRequest();
  const participantInput = getFieldParticipantInputFromFormData(formData);
  const decision = String(formData.get("participantDecision") ?? "");
  const [decisionType, participantProfileId] = decision.split(":");
  let result: Awaited<ReturnType<typeof startFieldScreeningAttempt>>;

  try {
    result = await startFieldScreeningAttempt({
      actor,
      confirmation: participantProfileId
        ? {
            allowOpenAttemptOverride: decisionType === "force-new-open",
            participantProfileId
          }
        : undefined,
      formInput: participantInput,
      repository: createFieldRepository(),
      studyId
    });
  } catch (error) {
    logFieldActionError({
      code: error instanceof Error ? error.name : "UNKNOWN_ERROR",
      step: "start",
      studyId
    });

    return {
      error: "No fue posible iniciar el filtro. Intenta nuevamente.",
      values: participantInput
    };
  }

  if (!result.ok) {
    return {
      error: result.message,
      values: participantInput
    };
  }

  if (result.data.kind === "duplicate_found") {
    return {
      duplicate: result.data,
      values: result.data.input
    };
  }

  revalidatePath("/field");
  revalidatePath(`/field/studies/${studyId}`);
  redirect(`/field/screening/${result.data.attemptId}`);
}

export async function saveFieldScreeningAnswerAction(
  attemptId: string,
  questionId: string,
  formData: FormData
): Promise<void> {
  const actor = await getFieldActorForRequest();
  const result = await saveFieldScreeningAnswer({
    actor,
    attemptId,
    formInput: getFieldAnswerInputFromFormData(formData),
    questionId,
    repository: createFieldRepository()
  });

  if (!result.ok) {
    redirect(fieldAttemptPath(attemptId, questionId, result.message));
  }

  revalidatePath(`/field/screening/${attemptId}`);

  if (result.data.closed) {
    if (result.data.status === "PASSED") {
      const confirmationRepository = createParticipantPortalScreenerRepository();
      const confirmation = await confirmationRepository.ensureFilterOnlyConfirmation({
        attemptId,
        codeGenerator: generateParticipantReferenceCode
      });

      if (!confirmation.ok) {
        redirect(fieldAttemptPath(attemptId, questionId, confirmation.message));
      }

      await sendFieldConfirmationWhatsAppBestEffort({
        attemptId,
        confirmation: confirmation.confirmation,
        repository: confirmationRepository
      });
    }

    redirect(`/field/screening/${attemptId}/result`);
  }

  redirect(fieldAttemptPath(attemptId, result.data.nextQuestionId));
}

function logFieldActionError({
  code,
  step,
  studyId
}: {
  code: string;
  step: "start";
  studyId: string;
}) {
  console.error(`public field screening failed: step=${step} code=${code} studyId=${studyId}`);
}

async function sendFieldConfirmationWhatsAppBestEffort({
  attemptId,
  confirmation,
  repository
}: {
  attemptId: string;
  confirmation: {
    folio: string;
    referenceCodes: Array<{ code: string; slot: number }>;
  };
  repository: ReturnType<typeof createParticipantPortalScreenerRepository>;
}) {
  try {
    const attempt = await repository.getAttempt(attemptId);

    if (!attempt) {
      return;
    }

    const whatsappRepository = createOneuiWhatsAppRepository();
    const existingMessage = await whatsappRepository.findLatestOutboundTemplateMessage({
      linkedParticipantId: attempt.studyParticipantId,
      linkedStudyId: attempt.questionnaireVersion.study.id,
      sourceModule: "NAVIGO"
    });
    const result = await sendNavigoConfirmationWhatsApp({
      codes: confirmation.referenceCodes,
      existingMessage,
      folio: confirmation.folio,
      participantId: attempt.studyParticipantId,
      participantName: attempt.studyParticipant.participantProfile.name,
      phone: attempt.studyParticipant.participantProfile.phone,
      repository: whatsappRepository,
      studyId: attempt.questionnaireVersion.study.id
    });

    if (!result.ok) {
      console.error("public field navigo whatsapp skipped or failed", {
        attemptId,
        code: result.code,
        step: "send_confirmation_template"
      });
    }
  } catch (error) {
    console.error("public field navigo whatsapp failed", {
      attemptId,
      code: error instanceof Error ? error.name : "UNKNOWN_ERROR",
      step: "send_confirmation_template"
    });
  }
}
