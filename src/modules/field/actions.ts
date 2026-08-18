"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createParticipantPortalScreenerRepository } from "@/modules/participant-portal/screener-repository";
import { generateParticipantReferenceCode } from "@/modules/participant-portal/review";
import { applyStoredNavigoRotationForParticipantBestEffort } from "@/modules/navigo-app/rotation-folio-application";
import { getStudyBehavior } from "@/modules/study-templates/study-behavior";
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
import {
  isV1FieldScreeningBlocked,
  V1_FIELD_SCREENING_BLOCK_MESSAGE
} from "./v1-screening-block";

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
  if (isV1FieldScreeningBlocked()) {
    const participantInput = getFieldParticipantInputFromFormData(formData);
    return {
      error: V1_FIELD_SCREENING_BLOCK_MESSAGE,
      values: participantInput
    };
  }

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
  if (isV1FieldScreeningBlocked()) {
    redirect(fieldAttemptPath(attemptId, questionId, V1_FIELD_SCREENING_BLOCK_MESSAGE));
  }

  const actor = await getFieldActorForRequest();
  let result: Awaited<ReturnType<typeof saveFieldScreeningAnswer>>;

  try {
    result = await saveFieldScreeningAnswer({
      actor,
      attemptId,
      formInput: getFieldAnswerInputFromFormData(formData),
      questionId,
      repository: createFieldRepository()
    });
  } catch (error) {
    logFieldActionError({
      code: error instanceof Error ? error.name : "UNKNOWN_ERROR",
      step: "save",
      studyId: "unknown"
    });
    redirect(fieldAttemptPath(attemptId, questionId, "No se pudo guardar la respuesta. Intenta nuevamente."));
  }

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

      await applyStoredNavigoRotationForParticipantBestEffort({
        actorUserId: confirmation.actorUserId,
        context: "field-screening",
        studyParticipantId: confirmation.studyParticipantId
      });

      const confirmationAttempt = await loadFieldConfirmationAttemptBestEffort({
        attemptId,
        repository: confirmationRepository
      });

      if (
        confirmationAttempt &&
        getStudyBehavior(confirmationAttempt.questionnaireVersion.study.code).requiresFinalSelfie
      ) {
        redirect(`/field/screening/${attemptId}/selfie`);
      }
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
  step: "save" | "start";
  studyId: string;
}) {
  console.error(`public field screening failed: step=${step} code=${code} studyId=${studyId}`);
}

async function loadFieldConfirmationAttemptBestEffort({
  attemptId,
  repository
}: {
  attemptId: string;
  repository: ReturnType<typeof createParticipantPortalScreenerRepository>;
}): Promise<Awaited<ReturnType<ReturnType<typeof createParticipantPortalScreenerRepository>["getAttempt"]>>> {
  try {
    return await repository.getAttempt(attemptId);
  } catch (error) {
    console.error("public field confirmation lookup failed", {
      attemptId,
      code: error instanceof Error ? error.name : "UNKNOWN_ERROR",
      step: "load_confirmation_attempt"
    });
    return null;
  }
}
