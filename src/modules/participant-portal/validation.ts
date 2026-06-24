import { z } from "zod";
import { normalizeParticipantTextInput } from "./text-normalization";

export const participantEvidenceTypeSchema = z.enum(["SELFIE_IDENTIFICATION", "PERFUME_PHOTO"]);

const checkboxSchema = z.preprocess((value) => value === "on" || value === true, z.boolean());

export const participantPortalOtpRequestSchema = z
  .object({
    captchaToken: z.string().trim().min(1, "Confirma la verificación antes de solicitar el código."),
    email: z.string().trim().email("Ingresa un correo válido.")
  })
  .strict();

export const participantPortalStudyCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/, "El código de estudio no es válido.");

export const participantPortalVerifyOtpSchema = z
  .object({
    token: z
      .string()
      .trim()
      .transform((value) => value.replace(/\s+/g, ""))
      .refine((value) => /^\d+$/.test(value), "Ingresa el código numérico que recibiste por correo.")
      .refine((value) => value.length >= 6 && value.length <= 8, "Ingresa el código numérico que recibiste por correo.")
  })
  .strict();

export const participantPortalIdentitySchema = z
  .object({
    captchaToken: z.string().trim().min(1, "Confirma la verificación antes de continuar."),
    confirmPhone: z.string().trim().min(1, "Confirma el celular."),
    name: z.string().trim().min(1, "Ingresa tu nombre."),
    phone: z.string().trim().min(1, "Ingresa tu celular.")
  })
  .strict()
  .transform((input, context) => {
    const phone = normalizeMexicoPhone(input.phone);
    const confirmPhone = normalizeMexicoPhone(input.confirmPhone);
    const name = normalizeParticipantTextInput(input.name);

    if (!isMexicoPhone(phone)) {
      context.addIssue({
        code: "custom",
        message: "Captura un celular válido a 10 dígitos o con clave +52.",
        path: ["phone"]
      });
    }

    if (phone !== confirmPhone) {
      context.addIssue({
        code: "custom",
        message: "El celular y la confirmación no coinciden.",
        path: ["confirmPhone"]
      });
    }

    if (!name) {
      context.addIssue({
        code: "custom",
        message: "Ingresa tu nombre.",
        path: ["name"]
      });
    }

    return {
      ...input,
      confirmPhone,
      name,
      phone
    };
  });

export const participantPortalRegistrationSchema = z
  .object({
    consentPrivacy: checkboxSchema.refine((value) => value, "Debes aceptar el aviso de privacidad."),
    consentSensitive: checkboxSchema.refine((value) => value, "Debes otorgar el consentimiento expreso para continuar."),
    confirmPhone: z.string().trim().min(1, "Confirma el celular."),
    name: z.string().trim().min(1, "Ingresa tu nombre completo."),
    phone: z.string().trim().min(1, "Ingresa tu celular.")
  })
  .strict()
  .transform((input, context) => {
    const phone = normalizeMexicoPhone(input.phone);
    const confirmPhone = normalizeMexicoPhone(input.confirmPhone);
    const name = normalizeParticipantTextInput(input.name);

    if (!isMexicoPhone(phone)) {
      context.addIssue({
        code: "custom",
        message: "Captura un celular válido a 10 dígitos o con clave +52.",
        path: ["phone"]
      });
    }

    if (!isMexicoPhone(confirmPhone)) {
      context.addIssue({
        code: "custom",
        message: "Captura un celular válido a 10 dígitos o con clave +52.",
        path: ["confirmPhone"]
      });
    }

    if (phone !== confirmPhone) {
      context.addIssue({
        code: "custom",
        message: "El celular y la confirmación no coinciden.",
        path: ["confirmPhone"]
      });
    }

    if (!name) {
      context.addIssue({
        code: "custom",
        message: "Ingresa tu nombre completo.",
        path: ["name"]
      });
    }

    return {
      ...input,
      confirmPhone,
      name,
      phone
    };
  });

export const participantPortalAdminConfigSchema = z
  .object({
    enabled: checkboxSchema.default(false),
    evidenceRetentionDays: z.coerce.number().int().positive(),
    folioMaxSequence: z.coerce.number().int().min(1),
    folioPrefix: z.string().trim(),
    maxImageBytes: z.coerce.number().int().positive(),
    maxOtpAttempts: z.coerce.number().int().positive(),
    maxPerfumePhotos: z.coerce.number().int().min(1),
    minPerfumePhotos: z.coerce.number().int().min(1),
    nextFolioSequence: z.coerce.number().int().min(1),
    otpCooldownSeconds: z.coerce.number().int().min(0),
    privacyNoticeText: z.string().trim(),
    privacyNoticeVersion: z.string().trim().min(1, "Captura la versión del aviso.")
  })
  .strict()
  .refine((input) => input.maxPerfumePhotos >= input.minPerfumePhotos, {
    message: "El máximo de fotos de perfume no puede ser menor al mínimo.",
    path: ["maxPerfumePhotos"]
  })
  .refine((input) => input.nextFolioSequence <= input.folioMaxSequence + 1, {
    message: "La siguiente secuencia de folio no puede exceder el límite configurado más uno.",
    path: ["nextFolioSequence"]
  });

export const participantConsentInputSchema = z
  .object({
    noticeHash: z.string().trim().min(1),
    noticeText: z.string().trim().min(1),
    noticeVersion: z.string().trim().min(1),
    participantAuthUserId: z.string().uuid(),
    studyParticipantId: z.string().trim().min(1)
  })
  .strict();

export const participantPortalConfigSchema = z
  .object({
    enabled: z.boolean(),
    evidenceRetentionDays: z.number().int().positive(),
    folioPrefix: z.string().trim().min(1),
    folioMaxSequence: z.number().int().min(1),
    maxImageBytes: z.number().int().positive(),
    maxOtpAttempts: z.number().int().positive(),
    maxPerfumePhotos: z.number().int().min(1),
    minPerfumePhotos: z.number().int().min(1),
    nextFolioSequence: z.number().int().min(1),
    otpCooldownSeconds: z.number().int().min(0),
    privacyNoticeHash: z.string().trim().min(1),
    privacyNoticeText: z.string().trim().min(1),
    privacyNoticeVersion: z.string().trim().min(1)
  })
  .strict()
  .refine((input) => input.maxPerfumePhotos >= input.minPerfumePhotos, {
      message: "El máximo de fotos de perfume no puede ser menor al mínimo.",
    path: ["maxPerfumePhotos"]
  })
  .refine((input) => input.nextFolioSequence <= input.folioMaxSequence + 1, {
    message: "La siguiente secuencia de folio no puede exceder el límite configurado más uno.",
    path: ["nextFolioSequence"]
  });

export type ParticipantEvidenceType = z.infer<typeof participantEvidenceTypeSchema>;
export type ParticipantPortalConfigInput = z.infer<typeof participantPortalConfigSchema>;
export type ParticipantPortalAdminConfigInput = z.infer<typeof participantPortalAdminConfigSchema>;
export type ParticipantPortalIdentityInput = z.infer<typeof participantPortalIdentitySchema>;
export type ParticipantPortalOtpRequestInput = z.infer<typeof participantPortalOtpRequestSchema>;
export type ParticipantPortalRegistrationInput = z.infer<typeof participantPortalRegistrationSchema>;
export type ParticipantPortalVerifyOtpInput = z.infer<typeof participantPortalVerifyOtpSchema>;

export type ParticipantEvidenceDraft = {
  relatedQuestionId?: string | null;
  type: ParticipantEvidenceType;
};

export type EvidenceValidationResult =
  | {
      ok: true;
    }
  | {
      message: string;
      ok: false;
    };

export type ParticipantConsentSnapshot = {
  createdAt: Date;
  consentedAt: Date;
  noticeHash: string;
  noticeTextSnapshot: string;
  noticeVersion: string;
  participantAuthUserId: string;
  studyParticipantId: string;
};

export type ExistingParticipantConsent = {
  noticeVersion: string;
  studyParticipantId: string;
};

export function normalizeE164Phone(value: string): string {
  return value.replace(/[\s().-]/g, "");
}

export function normalizeMexicoPhone(value: string): string {
  const compact = value.replace(/[\s().-]/g, "");

  if (/^\d{10}$/.test(compact)) {
    return `+52${compact}`;
  }

  return compact;
}

export function normalizePortalEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isE164Phone(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value);
}

export function isMexicoPhone(value: string): boolean {
  return /^\+52\d{10}$/.test(value);
}

export function buildParticipantConsentSnapshot({
  now = new Date(),
  ...input
}: z.input<typeof participantConsentInputSchema> & { now?: Date }): ParticipantConsentSnapshot {
  const parsed = participantConsentInputSchema.parse(input);

  return {
    createdAt: now,
    consentedAt: now,
    noticeHash: parsed.noticeHash,
    noticeTextSnapshot: parsed.noticeText,
    noticeVersion: parsed.noticeVersion,
    participantAuthUserId: parsed.participantAuthUserId,
    studyParticipantId: parsed.studyParticipantId
  };
}

export function canCreateParticipantConsent({
  existingConsents,
  noticeVersion,
  studyParticipantId
}: {
  existingConsents: ExistingParticipantConsent[];
  noticeVersion: string;
  studyParticipantId: string;
}):
  | {
      ok: true;
    }
  | {
      message: string;
      ok: false;
      reusable: ExistingParticipantConsent;
    } {
  const reusable = existingConsents.find(
    (consent) => consent.studyParticipantId === studyParticipantId && consent.noticeVersion === noticeVersion
  );

  if (reusable) {
    return {
      message: "El consentimiento para esta version del aviso ya fue registrado.",
      ok: false,
      reusable
    };
  }

  return { ok: true };
}

export function validateParticipantEvidenceSet({
  evidence,
  maxPerfumePhotos,
  minPerfumePhotos
}: {
  evidence: ParticipantEvidenceDraft[];
  maxPerfumePhotos: number;
  minPerfumePhotos: number;
}): EvidenceValidationResult {
  const selfieCount = evidence.filter((item) => item.type === "SELFIE_IDENTIFICATION").length;

  if (selfieCount !== 1) {
    return {
      message: "Debe existir exactamente una selfie de identificación por intento.",
      ok: false
    };
  }

  const perfumePhotoCount = evidence.filter((item) => item.type === "PERFUME_PHOTO").length;

  if (perfumePhotoCount < minPerfumePhotos || perfumePhotoCount > maxPerfumePhotos) {
    return {
      message: `Captura entre ${minPerfumePhotos} y ${maxPerfumePhotos} fotos de perfumes.`,
      ok: false
    };
  }

  return { ok: true };
}

export function assertParticipantAuthUserIdsUnique(ids: Array<string | null | undefined>): boolean {
  const presentIds = ids.filter((id): id is string => Boolean(id));
  return new Set(presentIds).size === presentIds.length;
}

export function canStartPublicParticipation({
  existingStudyParticipantId
}: {
  existingStudyParticipantId?: string | null;
}):
  | {
      ok: true;
    }
  | {
      message: string;
      ok: false;
    } {
  if (existingStudyParticipantId) {
    return {
      message: "Ya existe una participación registrada para este estudio.",
      ok: false
    };
  }

  return { ok: true };
}

export function publicPortalResultMessage({
  status
}: {
  status: "PENDING_REVIEW" | "TERMINATED";
}): string {
  if (status === "PENDING_REVIEW") {
    return "Tus respuestas y evidencias están en revisión.";
  }

  return "Gracias por tu tiempo. En este momento no es posible continuar con el proceso.";
}
