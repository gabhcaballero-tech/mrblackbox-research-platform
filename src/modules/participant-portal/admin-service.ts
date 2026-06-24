import { createHash } from "node:crypto";
import { hasCapability, type InternalUserRole, type InternalUserStatus } from "@/shared/auth/permissions";
import {
  participantPortalAdminConfigSchema,
  type ParticipantPortalAdminConfigInput
} from "./validation";
import type {
  ParticipantPortalAdminRepository,
  ParticipantPortalAdminStudyRecord
} from "./admin-repository";
import type { ParticipantPortalConfigRecord } from "./repository";

export const DEFAULT_PARTICIPANT_PORTAL_PRIVACY_NOTICE = `Responsable: IKA Services, S.A. de C.V., comercialmente identificada como MR Black Box, con domicilio en CDMX, México.

Para este estudio podremos recabar tu nombre, correo electrónico, número de celular, respuestas al cuestionario, información sociodemográfica, hábitos de uso de fragancias, una selfie de identificación y entre una y cinco fotografías de los perfumes que utilizas.

Algunas respuestas pueden revelar información relacionada con tu estado de salud, como resfriado, sinusitis, rinitis, asma o sensibilidad a fragancias. Estos datos serán tratados como datos personales sensibles.

Utilizaremos tus datos para autenticar tu acceso, evitar registros duplicados, determinar si cumples los criterios del estudio, revisar la evidencia de los perfumes que utilizas, verificar posteriormente que continúa participando la misma persona, administrar tu participación, asignarte un folio y códigos de referencia y comunicarnos contigo para el seguimiento del estudio.

Las fotografías serán consultadas únicamente por personal autorizado. No utilizaremos reconocimiento facial automatizado ni crearemos perfiles biométricos.

Si preliminarmente no cumples los criterios, no se solicitarán fotografías. Las fotografías recabadas se conservarán durante un máximo de 30 días posteriores al cierre del estudio y después serán eliminadas, salvo que exista una obligación legal de conservación.

Para ejercer tus derechos de acceso, rectificación, cancelación u oposición, limitar el uso de tus datos o revocar tu consentimiento, escribe a contacto@mrblack-box.com.mx.

Consulta el aviso de privacidad integral en:
https://mrblack-box.com.mx/aviso-de-privacidad.html`;

export type ParticipantPortalAdminActor = {
  id: string;
  role: InternalUserRole;
  status: InternalUserStatus;
};

export type ParticipantPortalAdminFieldErrors = Partial<
  Record<keyof ParticipantPortalAdminConfigInput, string[]>
>;

export type ParticipantPortalAdminErrorCode =
  | "UNAUTHORIZED"
  | "VALIDATION_ERROR"
  | "STUDY_NOT_FOUND"
  | "UNKNOWN_ERROR";

export type ParticipantPortalAdminResult<T> =
  | {
      data: T;
      ok: true;
    }
  | {
      code: ParticipantPortalAdminErrorCode;
      fieldErrors?: ParticipantPortalAdminFieldErrors;
      message: string;
      ok: false;
    };

export type ParticipantPortalAdminData = ParticipantPortalAdminStudyRecord & {
  effectiveConfig: ParticipantPortalConfigRecord;
};

type ServiceInput = {
  actor: ParticipantPortalAdminActor | null;
  repository: ParticipantPortalAdminRepository;
  studyId: string;
};

type SaveInput = ServiceInput & {
  formInput: unknown;
};

export function buildDefaultParticipantPortalConfig(): ParticipantPortalConfigRecord {
  return {
    enabled: false,
    evidenceRetentionDays: 30,
    folioMaxSequence: 999,
    folioPrefix: "NAV",
    maxImageBytes: 8388608,
    maxOtpAttempts: 5,
    maxPerfumePhotos: 5,
    minPerfumePhotos: 1,
    nextFolioSequence: 1,
    otpCooldownSeconds: 60,
    privacyNoticeHash: hashPrivacyNotice(""),
    privacyNoticeText: "",
    privacyNoticeVersion: "v1"
  };
}

export function hashPrivacyNotice(text: string): string {
  return createHash("sha256").update(text.trim(), "utf8").digest("hex");
}

export async function getParticipantPortalConfigForAdmin({
  actor,
  repository,
  studyId
}: ServiceInput): Promise<ParticipantPortalAdminResult<ParticipantPortalAdminData>> {
  const denied = ensureAdmin<ParticipantPortalAdminData>(actor);

  if (denied) {
    return denied;
  }

  const study = await repository.getStudyPortalConfig(studyId);

  if (!study) {
    return {
      code: "STUDY_NOT_FOUND",
      message: "El estudio no existe.",
      ok: false
    };
  }

  return {
    data: {
      ...study,
      effectiveConfig: study.portalConfig ?? buildDefaultParticipantPortalConfig()
    },
    ok: true
  };
}

export async function saveParticipantPortalConfigForAdmin({
  actor,
  formInput,
  repository,
  studyId
}: SaveInput): Promise<ParticipantPortalAdminResult<ParticipantPortalConfigRecord>> {
  const denied = ensureAdmin<ParticipantPortalConfigRecord>(actor);

  if (denied) {
    return denied;
  }

  const study = await repository.getStudyPortalConfig(studyId);

  if (!study) {
    return {
      code: "STUDY_NOT_FOUND",
      message: "El estudio no existe.",
      ok: false
    };
  }

  const parsed = participantPortalAdminConfigSchema.safeParse(formInput);

  if (!parsed.success) {
    return {
      code: "VALIDATION_ERROR",
      fieldErrors: parsed.error.flatten().fieldErrors,
      message: "Revisa la configuración del portal.",
      ok: false
    };
  }

  const enableErrors = getEnablementErrors(parsed.data, study);

  if (enableErrors) {
    return {
      code: "VALIDATION_ERROR",
      fieldErrors: enableErrors.fieldErrors,
      message: enableErrors.message,
      ok: false
    };
  }

  try {
    const saved = await repository.saveStudyPortalConfig({
      ...parsed.data,
      privacyNoticeHash: hashPrivacyNotice(parsed.data.privacyNoticeText),
      studyId
    });

    return {
      data: saved,
      ok: true
    };
  } catch {
    return {
      code: "UNKNOWN_ERROR",
      message: "No se pudo guardar la configuración del portal.",
      ok: false
    };
  }
}

function isAdmin(actor: ParticipantPortalAdminActor | null): actor is ParticipantPortalAdminActor {
  return Boolean(actor && actor.status === "ACTIVE" && hasCapability(actor.role, "admin:access"));
}

function ensureAdmin<T>(actor: ParticipantPortalAdminActor | null): ParticipantPortalAdminResult<T> | null {
  if (isAdmin(actor)) {
    return null;
  }

  return {
    code: "UNAUTHORIZED",
    message: "Solo Administrador puede configurar el portal de participantes.",
    ok: false
  };
}

function getEnablementErrors(
  input: ParticipantPortalAdminConfigInput,
  study: ParticipantPortalAdminStudyRecord
): { fieldErrors?: ParticipantPortalAdminFieldErrors; message: string } | null {
  if (!input.enabled) {
    return null;
  }

  if (study.status !== "ACTIVE") {
    return {
      message: "No se puede habilitar el portal si el estudio no está activo."
    };
  }

  if (!study.activeScreenerVersionId) {
    return {
      message: "No se puede habilitar el portal sin un screener publicado activo."
    };
  }

  if (!input.privacyNoticeText.trim()) {
    return {
      fieldErrors: {
        privacyNoticeText: ["Captura el aviso de privacidad antes de habilitar el portal."]
      },
      message: "No se puede habilitar el portal sin aviso de privacidad."
    };
  }

  if (!input.folioPrefix.trim()) {
    return {
      fieldErrors: {
        folioPrefix: ["Captura el prefijo de folio."]
      },
      message: "No se puede habilitar el portal sin prefijo de folio."
    };
  }

  if (input.maxPerfumePhotos !== 5) {
    return {
      fieldErrors: {
        maxPerfumePhotos: ["Para este estudio el máximo debe ser 5."]
      },
      message: "No se puede habilitar el portal si el máximo de fotos de perfumes no es 5."
    };
  }

  return null;
}
