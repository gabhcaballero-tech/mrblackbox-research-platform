"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCapability } from "@/shared/auth/session";
import { participantTokenSchema } from "@/shared/validation/participant";
import { ensureNavigoAppFoundation } from "./loader";
import {
  createNavigoAppRepository,
  type NavigoActionResult,
  type NavigoSignedActivityUpload
} from "./repository";
import { parseNavigoRotationImportText, type NavigoRotationImportRowInput } from "./service";
import type { NavigoRotationImportActionState } from "./rotation-import-state";
import type { EvidenceUploadMetadata } from "@/modules/participant-portal/evidence-storage";

export async function startNavigoT0Action(studyId: string, studyParticipantId: string, formData: FormData) {
  const actor = await requireCapability("application-time:record");
  const foundation = await ensureNavigoAppFoundation({ actorUserId: actor.id });

  if (!foundation.ok) {
    redirectWithNavigoMessage(studyId, { error: foundation.message });
  }

  const applicationStartedAt = parseApplicationStartedAt(formData.get("applicationStartedAt"));
  const result = await createNavigoAppRepository().startT0({
    actorUserId: actor.id,
    applicationStartedAt,
    studyParticipantId
  });

  if (!result.ok) {
    redirectWithNavigoMessage(studyId, { error: result.message });
  }

  revalidatePath(`/admin/studies/${studyId}/navigo-app`);
  redirectWithNavigoMessage(studyId, {
    message: result.message,
    participant: studyParticipantId,
    token: result.linkToken
  });
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

  const parsed = parseNavigoRotationImportText({
    filename: file.name,
    text: await file.text()
  });

  if (!parsed.ok) {
    return {
      message: parsed.message,
      preview: null,
      rows: [],
      status: "error"
    };
  }

  const result = await createNavigoAppRepository().previewRotationImport({
    rows: parsed.rows,
    studyId
  });

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
  const actor = await requireCapability("rotation:register");
  const rows = parseRowsJson(String(formData.get("rowsJson") ?? "[]"));

  if (rows.length === 0) {
    return {
      message: "Primero previsualiza un archivo valido.",
      preview: null,
      rows: [],
      status: "error"
    };
  }

  const result = await createNavigoAppRepository().applyRotationImport({
    actorUserId: actor.id,
    rows,
    studyId
  });

  if (!result.ok) {
    return {
      message: result.message,
      preview: null,
      rows,
      status: "error"
    };
  }

  revalidatePath(`/admin/studies/${studyId}/navigo-app`);

  return {
    message: "Rotacion importada correctamente.",
    preview: result.data,
    rows,
    status: "success"
  };
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

  const result = await createNavigoAppRepository().submitActivityResponses({
    activityId,
    answers,
    token
  });

  if (!result.ok) {
    redirect(`/p/${encodeURIComponent(token)}/activities/${activityId}?error=${encodeURIComponent(result.message)}`);
  }

  revalidatePath(`/p/${encodeURIComponent(token)}/activities`);
  redirect(`/p/${encodeURIComponent(token)}/activities?message=${encodeURIComponent("Evaluacion registrada correctamente.")}`);
}

function parseApplicationStartedAt(value: FormDataEntryValue | null): Date {
  const raw = String(value ?? "").trim();

  if (!raw) {
    return new Date();
  }

  const parsed = new Date(raw);

  if (Number.isNaN(parsed.getTime())) {
    return new Date();
  }

  return parsed;
}

function parseToken(tokenInput: string): string {
  const parsed = participantTokenSchema.safeParse(tokenInput);

  if (!parsed.success) {
    throw new Error("El enlace no es valido.");
  }

  return parsed.data;
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
