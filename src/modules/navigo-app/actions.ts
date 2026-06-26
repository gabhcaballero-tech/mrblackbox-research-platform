"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCapability } from "@/shared/auth/session";
import { participantTokenSchema } from "@/shared/validation/participant";
import { ensureNavigoAppFoundation } from "./loader";
import {
  appendNavigoTestModeParams,
  isValidNavigoTestMode,
  type NavigoTestModeParams
} from "./test-mode";
import {
  createNavigoAppRepository,
  type NavigoActionResult,
  type NavigoSignedActivityUpload
} from "./repository";
import {
  parseNavigoDateTimeLocal,
  parseNavigoRotationImportText,
  type NavigoAnswerInput,
  type NavigoRotationImportRowInput
} from "./service";
import type { NavigoRotationImportActionState } from "./rotation-import-state";
import type { EvidenceUploadMetadata } from "@/modules/participant-portal/evidence-storage";

export async function startNavigoT0Action(studyId: string, studyParticipantId: string, formData: FormData) {
  const actor = await requireCapability("application-time:record");
  const foundation = await ensureNavigoAppFoundation({ actorUserId: actor.id });

  if (!foundation.ok) {
    redirectWithNavigoMessage(studyId, { error: foundation.message });
  }

  const timeZoneIana = String(formData.get("timeZoneIana") ?? "America/Mexico_City");
  const applicationStartedAt = parseApplicationStartedAt(formData.get("applicationStartedAt"), timeZoneIana);
  if (!applicationStartedAt) {
    redirectWithNavigoMessage(studyId, { error: "Selecciona la hora base T0." });
  }
  const t0Answers = parseNavigoAnswersFromFormData(formData);
  const result = await createNavigoAppRepository().startT0({
    actorUserId: actor.id,
    applicationStartedAt,
    studyParticipantId,
    t0Answers
  });

  if (!result.ok) {
    redirectWithNavigoMessage(studyId, { error: result.message });
  }

  revalidatePath(`/admin/studies/${studyId}/navigo-app`);
  redirectWithNavigoMessage(studyId, {
    message: result.message
  });
}

export async function generateNavigoParticipantLinkAction(
  studyId: string,
  studyParticipantId: string,
  forceRegenerate: boolean
) {
  const actor = await requireCapability("application-time:record");
  const result = await createNavigoAppRepository().generateParticipantLink({
    actorUserId: actor.id,
    forceRegenerate,
    studyParticipantId
  });

  if (!result.ok) {
    redirectWithNavigoMessage(studyId, { error: result.message });
  }

  revalidatePath(`/admin/studies/${studyId}/navigo-app`);
  redirectWithNavigoMessage(studyId, { message: result.message });
}

export async function resetNavigoParticipantAppAction(studyId: string, studyParticipantId: string, formData: FormData) {
  const actor = await requireCapability("activity:reopen");
  const confirmation = String(formData.get("confirmation") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  if (confirmation !== "REINICIAR APP") {
    redirectWithNavigoMessage(studyId, { error: "Escribe REINICIAR APP para confirmar." });
  }

  if (!reason) {
    redirectWithNavigoMessage(studyId, { error: "Captura el motivo de la correccion." });
  }

  const result = await createNavigoAppRepository().resetParticipantApp({
    actorUserId: actor.id,
    reason,
    studyParticipantId
  });

  if (!result.ok) {
    redirectWithNavigoMessage(studyId, { error: result.message });
  }

  revalidatePath(`/admin/studies/${studyId}/navigo-app`);
  redirectWithNavigoMessage(studyId, { message: result.message });
}

export async function deleteNavigoParticipantStagesAction(
  studyId: string,
  studyParticipantId: string,
  formData: FormData
) {
  const actor = await requireCapability("activity:reopen");
  const confirmation = String(formData.get("confirmation") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const fromCode = String(formData.get("fromCode") ?? "");

  if (confirmation !== "ELIMINAR ETAPAS") {
    redirectWithNavigoMessage(studyId, { error: "Escribe ELIMINAR ETAPAS para confirmar." });
  }

  if (!reason) {
    redirectWithNavigoMessage(studyId, { error: "Captura el motivo de la correccion." });
  }

  if (!["T0_SALON", "T2_HORAS", "T4_HORAS", "T8_HORAS"].includes(fromCode)) {
    redirectWithNavigoMessage(studyId, { error: "Selecciona una etapa valida." });
  }

  const result = await createNavigoAppRepository().deleteParticipantStagesFrom({
    actorUserId: actor.id,
    fromCode: fromCode as "T0_SALON" | "T2_HORAS" | "T4_HORAS" | "T8_HORAS",
    reason,
    studyParticipantId
  });

  if (!result.ok) {
    redirectWithNavigoMessage(studyId, { error: result.message });
  }

  revalidatePath(`/admin/studies/${studyId}/navigo-app`);
  redirectWithNavigoMessage(studyId, { message: result.message });
}

export async function configureNavigoRotationAction(studyId: string, studyParticipantId: string, formData: FormData) {
  const actor = await requireCapability("rotation:register");
  const result = await createNavigoAppRepository().configureParticipantRotation({
    actorUserId: actor.id,
    leftFragranceCode: String(formData.get("leftFragranceCode") ?? ""),
    rightFragranceCode: String(formData.get("rightFragranceCode") ?? ""),
    studyParticipantId,
    triangularCode1: String(formData.get("triangularCode1") ?? ""),
    triangularCode2: String(formData.get("triangularCode2") ?? "")
  });

  if (!result.ok) {
    redirectWithNavigoMessage(studyId, { error: result.message, participant: studyParticipantId });
  }

  revalidatePath(`/admin/studies/${studyId}/navigo-app`);
  redirectWithNavigoMessage(studyId, {
    message: "Rotacion configurada correctamente.",
    participant: studyParticipantId
  });
}

export async function previewNavigoRotationImportAction(
  studyId: string,
  _previousState: NavigoRotationImportActionState,
  formData: FormData
): Promise<NavigoRotationImportActionState> {
  await requireCapability("rotation:register");
  const file = formData.get("rotationFile");

  if (!(file instanceof File) || file.size === 0) {
    return {
      message: "Selecciona un archivo CSV o TSV compatible con Excel.",
      preview: null,
      rows: [],
      status: "error"
    };
  }

  try {
    return await previewNavigoRotationImportTextAction(studyId, file.name, await file.text());
  } catch (error) {
    logNavigoRotationImportError({
      error,
      step: "preview-file",
      studyId
    });

    return {
      message: "No fue posible previsualizar el archivo. Revisa que sea CSV o TSV y vuelve a intentarlo.",
      preview: null,
      rows: [],
      status: "error"
    };
  }
}

export async function previewNavigoRotationImportTextAction(
  studyId: string,
  filename: string,
  text: string
): Promise<NavigoRotationImportActionState> {
  await requireCapability("rotation:register");

  let parsed: ReturnType<typeof parseNavigoRotationImportText>;

  try {
    parsed = parseNavigoRotationImportText({
      filename,
      text
    });
  } catch (error) {
    logNavigoRotationImportError({
      error,
      step: "parse",
      studyId
    });

    return {
      message: "No fue posible previsualizar el archivo. Revisa que sea CSV o TSV y vuelve a intentarlo.",
      preview: null,
      rows: [],
      status: "error"
    };
  }

  if (!parsed.ok) {
    return {
      message: parsed.message,
      preview: null,
      rows: [],
      status: "error"
    };
  }

  let result: Awaited<ReturnType<ReturnType<typeof createNavigoAppRepository>["previewRotationImport"]>>;

  try {
    result = await createNavigoAppRepository().previewRotationImport({
      rows: parsed.rows,
      studyId
    });
  } catch (error) {
    logNavigoRotationImportError({
      error,
      step: "preview",
      studyId
    });

    return {
      message: "No fue posible previsualizar el archivo. Revisa que sea CSV o TSV y vuelve a intentarlo.",
      preview: null,
      rows: parsed.rows,
      status: "error"
    };
  }

  if (!result.ok) {
    return {
      message: result.message,
      preview: null,
      rows: parsed.rows,
      status: "error"
    };
  }

  return {
    message: "Previsualizacion lista. Revisa los errores antes de aplicar.",
    preview: result.data,
    rows: parsed.rows,
    status: result.data.summary.rowsWithError > 0 ? "error" : "success"
  };
}

export async function applyNavigoRotationImportAction(
  studyId: string,
  _previousState: NavigoRotationImportActionState,
  formData: FormData
): Promise<NavigoRotationImportActionState> {
  return applyNavigoRotationImportRowsAction(studyId, parseRowsJson(String(formData.get("rowsJson") ?? "[]")));
}

export async function applyNavigoRotationImportRowsAction(
  studyId: string,
  rows: NavigoRotationImportRowInput[]
): Promise<NavigoRotationImportActionState> {
  const actor = await requireCapability("rotation:register");

  if (rows.length === 0) {
    return {
      message: "Primero previsualiza un archivo valido.",
      preview: null,
      rows: [],
      status: "error"
    };
  }

  let result: Awaited<ReturnType<ReturnType<typeof createNavigoAppRepository>["applyRotationImport"]>>;

  try {
    result = await createNavigoAppRepository().applyRotationImport({
      actorUserId: actor.id,
      rows,
      studyId
    });
  } catch (error) {
    logNavigoRotationImportError({
      error,
      step: "apply",
      studyId
    });

    return {
      message: "No fue posible guardar la rotacion. Revisa logs.",
      preview: null,
      rows,
      status: "error"
    };
  }

  if (!result.ok) {
    return {
      message: result.message,
      preview: result.data ?? null,
      rows,
      status: "error"
    };
  }

  revalidatePath(`/admin/studies/${studyId}/navigo-app`);

  return {
    message: `Rotacion importada correctamente. Filas aplicadas: ${result.data.summary.validRows}. Filas omitidas: 0. Filas con error: ${result.data.summary.rowsWithError}. Participantes actualizados: ${result.data.summary.updatable}.`,
    preview: result.data,
    rows,
    status: "success"
  };
}

function logNavigoRotationImportError({
  error,
  step,
  studyId
}: {
  error: unknown;
  step: "apply" | "parse" | "preview" | "preview-file";
  studyId: string;
}) {
  const message = error instanceof Error ? error.message : "unknown";
  console.error(`navigo rotation import failed: step=${step} studyId=${studyId} message=${message}`);
}

export async function requestNavigoActivitySelfieUploadAction(
  tokenInput: string,
  activityId: string,
  metadata: EvidenceUploadMetadata
): Promise<NavigoActionResult<NavigoSignedActivityUpload>> {
  const token = parseToken(tokenInput);
  const result = await createNavigoAppRepository().requestActivitySelfieUpload({
    activityId,
    metadata,
    token
  });

  return result;
}

export async function confirmNavigoActivitySelfieUploadAction(
  tokenInput: string,
  activityId: string,
  metadata: EvidenceUploadMetadata & {
    privateStorageKey: string;
    storageBucket: string;
  }
): Promise<NavigoActionResult<{ selfieCount: number }>> {
  const token = parseToken(tokenInput);
  const result = await createNavigoAppRepository().confirmActivitySelfieUpload({
    activityId,
    metadata,
    token
  });

  revalidatePath(`/p/${encodeURIComponent(token)}/activities/${activityId}`);

  return result;
}

export async function submitNavigoActivityResponsesAction(
  tokenInput: string,
  activityId: string,
  formData: FormData
): Promise<void> {
  const token = parseToken(tokenInput);
  const answers: Record<string, FormDataEntryValue | null> = {};

  for (const [key, value] of formData.entries()) {
    answers[key] = value;
  }

  const testModeParams = readNavigoTestModeParams(formData);
  const testMode = isValidNavigoTestMode({
    mode: testModeParams?.navigoTestMode,
    secret: process.env.PARTICIPANT_PORTAL_HASH_SECRET,
    signature: testModeParams?.navigoTestSignature,
    token
  });

  const result = await createNavigoAppRepository().submitActivityResponses({
    activityId,
    answers,
    testMode,
    token
  });

  if (!result.ok) {
    redirect(
      appendNavigoTestModeParams(
        `/p/${encodeURIComponent(token)}/activities/${activityId}?error=${encodeURIComponent(result.message)}`,
        testMode ? testModeParams : null
      )
    );
  }

  revalidatePath(`/p/${encodeURIComponent(token)}/activities`);
  redirect(
    appendNavigoTestModeParams(
      `/p/${encodeURIComponent(token)}/activities?message=${encodeURIComponent("Evaluacion registrada correctamente.")}`,
      testMode ? testModeParams : null
    )
  );
}

export async function confirmNavigoT0IdentityAction(
  tokenInput: string,
  activityId: string,
  identityConfirmed: "NO" | "YES"
): Promise<NavigoActionResult<{ identityStatus: "CONFIRMED" | "REJECTED" }>> {
  const token = parseToken(tokenInput);

  return createNavigoAppRepository().confirmT0Identity({
    activityId,
    identityConfirmed,
    token
  });
}

function parseApplicationStartedAt(value: FormDataEntryValue | null, timeZoneIana: string): Date | null {
  const raw = String(value ?? "").trim();

  if (!raw) {
    return null;
  }

  const parsed = parseNavigoDateTimeLocal(raw, timeZoneIana) ?? new Date(raw);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function parseNavigoAnswersFromFormData(formData: FormData): NavigoAnswerInput {
  const answers: NavigoAnswerInput = {};

  for (const [key, value] of formData.entries()) {
    if (key.startsWith("AP")) {
      answers[key] = value;
    }
  }

  return answers;
}

function parseToken(tokenInput: string): string {
  const parsed = participantTokenSchema.safeParse(tokenInput);

  if (!parsed.success) {
    throw new Error("El enlace no es valido.");
  }

  return parsed.data;
}

function readNavigoTestModeParams(formData: FormData): NavigoTestModeParams | null {
  const navigoTestMode = String(formData.get("navigoTestMode") ?? "");
  const navigoTestSignature = String(formData.get("navigoTestSignature") ?? "");

  if (!navigoTestMode || !navigoTestSignature) {
    return null;
  }

  return {
    navigoTestMode,
    navigoTestSignature
  };
}

function parseRowsJson(value: string): NavigoRotationImportRowInput[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((row) => {
        if (typeof row !== "object" || row === null) {
          return null;
        }

        const input = row as Record<string, unknown>;
        return {
          folio: String(input.folio ?? ""),
          primeraFragancia: String(input.primeraFragancia ?? ""),
          segundaFragancia: String(input.segundaFragancia ?? "")
        };
      })
      .filter((row): row is NavigoRotationImportRowInput => row !== null);
  } catch {
    return [];
  }
}

function redirectWithNavigoMessage(
  studyId: string,
  input: {
    error?: string;
    message?: string;
    participant?: string;
    token?: string;
  }
): never {
  const params = new URLSearchParams();

  if (input.error) {
    params.set("navigoError", input.error);
  }
  if (input.message) {
    params.set("navigoMessage", input.message);
  }
  if (input.participant) {
    params.set("participant", input.participant);
  }
  if (input.token) {
    params.set("token", input.token);
  }

  redirect(`/admin/studies/${studyId}/navigo-app?${params.toString()}`);
}
