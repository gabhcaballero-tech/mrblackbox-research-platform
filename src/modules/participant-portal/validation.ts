import { z } from "zod";

export const participantEvidenceTypeSchema = z.enum(["SELFIE_IDENTIFICATION", "PERFUME_PHOTO"]);

export const participantPortalOtpRequestSchema = z
  .object({
    captchaToken: z.string().trim().min(1, "Confirma la verificacion antes de solicitar el codigo."),
    email: z.string().trim().email("Ingresa un correo valido.")
  })
  .strict();

export const participantPortalStudyCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/, "El codigo de estudio no es valido.");

export const participantPortalVerifyOtpSchema = z
  .object({
    token: z.string().trim().regex(/^\d{6}$/, "Ingresa el codigo de seis digitos.")
  })
  .strict();

export const participantPortalIdentitySchema = z
  .object({
    captchaToken: z.string().trim().min(1, "Confirma la verificacion antes de continuar."),
    confirmPhone: z.string().trim().min(1, "Confirma el celular."),
    name: z.string().trim().min(1, "Ingresa tu nombre."),
    phone: z.string().trim().min(1, "Ingresa tu celular.")
  })
  .strict()
  .transform((input, context) => {
    const phone = normalizeE164Phone(input.phone);
    const confirmPhone = normalizeE164Phone(input.confirmPhone);

    if (!isE164Phone(phone)) {
      context.addIssue({
        code: "custom",
        message: "Ingresa el celular en formato internacional E.164, por ejemplo +525512345678.",
        path: ["phone"]
      });
    }

    if (phone !== confirmPhone) {
      context.addIssue({
        code: "custom",
        message: "El celular y la confirmacion deben coincidir.",
        path: ["confirmPhone"]
      });
    }

    return {
      ...input,
      confirmPhone,
      phone
    };
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
    message: "El maximo de fotos de perfume no puede ser menor al minimo.",
    path: ["maxPerfumePhotos"]
  })
  .refine((input) => input.nextFolioSequence <= input.folioMaxSequence + 1, {
    message: "La siguiente secuencia de folio no puede exceder el limite configurado mas uno.",
    path: ["nextFolioSequence"]
  });

export type ParticipantEvidenceType = z.infer<typeof participantEvidenceTypeSchema>;
export type ParticipantPortalConfigInput = z.infer<typeof participantPortalConfigSchema>;
export type ParticipantPortalIdentityInput = z.infer<typeof participantPortalIdentitySchema>;
export type ParticipantPortalOtpRequestInput = z.infer<typeof participantPortalOtpRequestSchema>;
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

export function normalizePortalEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isE164Phone(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value);
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
      message: "Debe existir exactamente una selfie de identificacion por intento.",
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
      message: "Ya existe una participacion registrada para este estudio.",
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
    return "Tus respuestas y evidencias estan en revision.";
  }

  return "Gracias por tu tiempo. En este momento no es posible continuar con el proceso.";
}
