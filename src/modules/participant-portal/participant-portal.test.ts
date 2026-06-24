import { describe, expect, it } from "vitest";
import { participantProfileSchema, studyParticipantSchema } from "@/modules/participants";
import {
  approveParticipantReview,
  buildManualWhatsAppMessage,
  canStartPublicParticipation,
  canCreateParticipantConsent,
  createPendingParticipantReview,
  buildFolio,
  participantPortalIdentitySchema,
  participantPortalOtpRequestSchema,
  publicPortalResultMessage,
  rejectParticipantReview,
  validateParticipantEvidenceSet,
  assertParticipantAuthUserIdsUnique,
  buildParticipantConsentSnapshot,
  type ParticipantConfirmationDraft
} from ".";

const now = new Date("2026-06-23T12:00:00.000Z");
const participantAuthUserId = "11111111-1111-4111-8111-111111111111";

describe("participant portal foundation", () => {
  it("allows a public participant without an InternalUser", () => {
    const profile = participantProfileSchema.parse({
      createdAt: now.toISOString(),
      id: "profile-1",
      participantAuthUserId,
      personalData: {
        email: "persona@example.com",
        name: "Persona publica",
        phone: "+525512345678"
      },
      status: "active",
      updatedAt: now.toISOString()
    });

    const participation = studyParticipantSchema.parse({
      createdAt: now.toISOString(),
      id: "study-participant-1",
      operationalStatus: "screening_started",
      participantProfileId: profile.id,
      screeningStatus: "started",
      studyId: "study-1",
      updatedAt: now.toISOString()
    });

    expect(profile.participantAuthUserId).toBe(participantAuthUserId);
    expect(participation.createdByUserId).toBeUndefined();
  });

  it("checks participantAuthUserId uniqueness before persistence", () => {
    expect(assertParticipantAuthUserIdsUnique([participantAuthUserId, null, undefined])).toBe(true);
    expect(assertParticipantAuthUserIdsUnique([participantAuthUserId, participantAuthUserId])).toBe(false);
  });

  it("blocks duplicate public participation in the same study", () => {
    expect(canStartPublicParticipation({ existingStudyParticipantId: "study-participant-1" })).toMatchObject({
      ok: false
    });
    expect(canStartPublicParticipation({ existingStudyParticipantId: null })).toEqual({ ok: true });
  });

  it("preserves the exact consent notice snapshot", () => {
    const consent = buildParticipantConsentSnapshot({
      noticeHash: "hash-v1",
      noticeText: "Aviso de privacidad exacto aceptado.",
      noticeVersion: "v1",
      now,
      participantAuthUserId,
      studyParticipantId: "study-participant-1"
    });

    expect(consent).toMatchObject({
      consentedAt: now,
      noticeHash: "hash-v1",
      noticeTextSnapshot: "Aviso de privacidad exacto aceptado.",
      noticeVersion: "v1"
    });
  });

  it("reuses or rejects the same participant consent version in a controlled way", () => {
    const result = canCreateParticipantConsent({
      existingConsents: [{ noticeVersion: "v1", studyParticipantId: "study-participant-1" }],
      noticeVersion: "v1",
      studyParticipantId: "study-participant-1"
    });

    expect(result).toMatchObject({
      message: "El consentimiento para esta version del aviso ya fue registrado.",
      ok: false
    });
  });

  it("allows a new consent when the notice version changes", () => {
    expect(
      canCreateParticipantConsent({
        existingConsents: [{ noticeVersion: "v1", studyParticipantId: "study-participant-1" }],
        noticeVersion: "v2",
        studyParticipantId: "study-participant-1"
      })
    ).toEqual({ ok: true });
  });

  it("requires exactly one selfie per attempt", () => {
    expect(
      validateParticipantEvidenceSet({
        evidence: [{ type: "PERFUME_PHOTO" }],
        maxPerfumePhotos: 5,
        minPerfumePhotos: 1
      })
    ).toMatchObject({ ok: false });

    expect(
      validateParticipantEvidenceSet({
        evidence: [
          { type: "SELFIE_IDENTIFICATION" },
          { type: "SELFIE_IDENTIFICATION" },
          { type: "PERFUME_PHOTO" }
        ],
        maxPerfumePhotos: 5,
        minPerfumePhotos: 1
      })
    ).toMatchObject({ ok: false });
  });

  it("validates minimum and maximum perfume photos", () => {
    expect(
      validateParticipantEvidenceSet({
        evidence: [{ type: "SELFIE_IDENTIFICATION" }],
        maxPerfumePhotos: 5,
        minPerfumePhotos: 1
      })
    ).toMatchObject({ ok: false });

    expect(
      validateParticipantEvidenceSet({
        evidence: [
          { type: "SELFIE_IDENTIFICATION" },
          { relatedQuestionId: "F6_MARCAS_UTILIZA", type: "PERFUME_PHOTO" },
          { relatedQuestionId: "F6_MARCAS_UTILIZA", type: "PERFUME_PHOTO" },
          { relatedQuestionId: "F6_MARCAS_UTILIZA", type: "PERFUME_PHOTO" },
          { relatedQuestionId: "F6_MARCAS_UTILIZA", type: "PERFUME_PHOTO" },
          { relatedQuestionId: "F6_MARCAS_UTILIZA", type: "PERFUME_PHOTO" }
        ],
        maxPerfumePhotos: 5,
        minPerfumePhotos: 1
      })
    ).toEqual({ ok: true });

    expect(
      validateParticipantEvidenceSet({
        evidence: [
          { type: "SELFIE_IDENTIFICATION" },
          { relatedQuestionId: "F6_MARCAS_UTILIZA", type: "PERFUME_PHOTO" },
          { relatedQuestionId: "F6_MARCAS_UTILIZA", type: "PERFUME_PHOTO" },
          { relatedQuestionId: "F6_MARCAS_UTILIZA", type: "PERFUME_PHOTO" },
          { relatedQuestionId: "F6_MARCAS_UTILIZA", type: "PERFUME_PHOTO" },
          { relatedQuestionId: "F6_MARCAS_UTILIZA", type: "PERFUME_PHOTO" },
          { relatedQuestionId: "F6_MARCAS_UTILIZA", type: "PERFUME_PHOTO" }
        ],
        maxPerfumePhotos: 5,
        minPerfumePhotos: 1
      })
    ).toMatchObject({ ok: false });

    expect(
      validateParticipantEvidenceSet({
        evidence: [
          { type: "SELFIE_IDENTIFICATION" },
          { relatedQuestionId: "F6_MARCAS_UTILIZA", type: "PERFUME_PHOTO" }
        ],
        maxPerfumePhotos: 5,
        minPerfumePhotos: 1
      })
    ).toEqual({ ok: true });
  });

  it("creates a PENDING review after preliminary pass", () => {
    expect(
      createPendingParticipantReview({
        now,
        screeningAttemptId: "attempt-1",
        studyParticipantId: "study-participant-1"
      })
    ).toMatchObject({
      status: "PENDING",
      updatedAt: now
    });
  });

  it("does not create confirmation on rejection", () => {
    expect(rejectParticipantReview({ rejectionReason: "Evidencia no valida." })).toEqual({
      canCreateConfirmation: false,
      rejectionReason: "Evidencia no valida.",
      status: "REJECTED"
    });
  });

  it("approval generates a folio and exactly three globally unique codes", () => {
    const codes = ["COD-1", "COD-1", "COD-2", "COD-3", "COD-4"];
    const result = approveParticipantReview({
      approvedByUserId: "admin-1",
      codeGenerator: () => codes.shift() ?? "COD-X",
      existingReferenceCodes: ["COD-1"],
      folioMaxSequence: 999,
      folioPrefix: "NAV",
      nextFolioSequence: 7,
      now,
      screeningAttemptId: "attempt-1",
      studyId: "study-1",
      studyParticipantId: "study-participant-1"
    });

    expect(result.ok ? result.created : null).toBe(true);
    expect(result.ok ? result.confirmation.folio : null).toBe("NAV-007");
    expect(result.ok ? result.confirmation.referenceCodes : []).toHaveLength(3);
    expect(new Set(result.ok ? result.confirmation.referenceCodes.map((item) => item.code) : []).size).toBe(3);
    expect(result.ok ? result.confirmation.referenceCodes.map((item) => item.slot) : []).toEqual([1, 2, 3]);
  });

  it("formats folio sequence from NAV-001 to NAV-999", () => {
    expect(buildFolio("NAV", 1)).toBe("NAV-001");
    expect(buildFolio("NAV", 9)).toBe("NAV-009");
    expect(buildFolio("NAV", 999)).toBe("NAV-999");
  });

  it("blocks approval when folio sequence is exhausted", () => {
    const result = approveParticipantReview({
      approvedByUserId: "admin-1",
      codeGenerator: () => "COD-1",
      folioMaxSequence: 999,
      folioPrefix: "NAV",
      nextFolioSequence: 1000,
      screeningAttemptId: "attempt-1",
      studyId: "study-1",
      studyParticipantId: "study-participant-1"
    });

    expect(result).toEqual({
      message: "Se agotó la secuencia de folios configurada para este estudio.",
      ok: false
    });
  });

  it("approval is idempotent and does not advance the folio sequence twice", () => {
    const existingConfirmation: ParticipantConfirmationDraft = {
      approvedAt: now,
      approvedByUserId: "admin-1",
      folio: "NAV-007",
      folioSequence: 7,
      manualMessageStatus: "NOT_SENT",
      referenceCodes: [
        { code: "COD-2", slot: 1 },
        { code: "COD-3", slot: 2 },
        { code: "COD-4", slot: 3 }
      ],
      screeningAttemptId: "attempt-1",
      studyId: "study-1",
      studyParticipantId: "study-participant-1"
    };

    const result = approveParticipantReview({
      approvedByUserId: "admin-1",
      codeGenerator: () => "COD-NEW",
      existingConfirmation,
      folioMaxSequence: 999,
      folioPrefix: "NAV",
      nextFolioSequence: 8,
      screeningAttemptId: "attempt-1",
      studyId: "study-1",
      studyParticipantId: "study-participant-1"
    });

    expect(result.ok ? result.created : null).toBe(false);
    expect(result.ok ? result.confirmation : null).toBe(existingConfirmation);
    expect(result.ok ? result.nextFolioSequence : null).toBe(8);
  });

  it("returns the next folio sequence for atomic persistence", () => {
    const result = approveParticipantReview({
      approvedByUserId: "admin-1",
      codeGenerator: () => `COD-${Math.random()}`,
      folioMaxSequence: 999,
      folioPrefix: "NAV",
      nextFolioSequence: 11,
      screeningAttemptId: "attempt-1",
      studyId: "study-1",
      studyParticipantId: "study-participant-1"
    });

    expect(result.ok ? result.confirmation.folioSequence : null).toBe(11);
    expect(result.ok ? result.nextFolioSequence : null).toBe(12);
  });

  it("does not reuse folios once a confirmation exists", () => {
    const existingConfirmation: ParticipantConfirmationDraft = {
      approvedAt: now,
      approvedByUserId: "admin-1",
      folio: "NAV-999",
      folioSequence: 999,
      manualMessageStatus: "NOT_SENT",
      referenceCodes: [
        { code: "COD-1", slot: 1 },
        { code: "COD-2", slot: 2 },
        { code: "COD-3", slot: 3 }
      ],
      screeningAttemptId: "attempt-1",
      studyId: "study-1",
      studyParticipantId: "study-participant-1"
    };

    const result = approveParticipantReview({
      approvedByUserId: "admin-1",
      codeGenerator: () => "COD-4",
      existingConfirmation,
      folioMaxSequence: 999,
      folioPrefix: "NAV",
      nextFolioSequence: 1000,
      screeningAttemptId: "attempt-1",
      studyId: "study-1",
      studyParticipantId: "study-participant-1"
    });

    expect(result.ok ? result.confirmation.folio : null).toBe("NAV-999");
    expect(result.ok ? result.nextFolioSequence : null).toBe(1000);
  });

  it("keeps public termination message generic", () => {
    const message = publicPortalResultMessage({ status: "TERMINATED" });

    expect(message).not.toContain("NO_USUARIO_NAVIGO");
    expect(message).not.toContain("Frecuencia insuficiente");
  });

  it("formats the manual WhatsApp message", () => {
    const message = buildManualWhatsAppMessage({
      codes: [
        { code: "COD-3", slot: 3 },
        { code: "COD-1", slot: 1 },
        { code: "COD-2", slot: 2 }
      ],
      folio: "NAV-001",
      participantName: "Gabriela",
      studyName: "Fragancia Masculina"
    });

    expect(message).toContain("Folio: NAV-001.");
    expect(message).toContain("Codigos de referencia: COD-1, COD-2, COD-3.");
  });

  it("prepares OTP, CAPTCHA and E.164 contracts without calling external services", () => {
    expect(
      participantPortalOtpRequestSchema.parse({
        captchaToken: "captcha-token",
        email: "persona@example.com"
      })
    ).toMatchObject({ email: "persona@example.com" });

    expect(
      participantPortalIdentitySchema.parse({
        captchaToken: "captcha-token",
        confirmPhone: "+52 55 1234 5678",
        name: "Persona",
        phone: "+52 55 1234 5678"
      })
    ).toMatchObject({ phone: "+525512345678" });

    expect(() =>
      participantPortalIdentitySchema.parse({
        captchaToken: "captcha-token",
        confirmPhone: "+525500000000",
        name: "Persona",
        phone: "5512345678"
      })
    ).toThrow();
  });
});
