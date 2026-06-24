import { describe, expect, it, vi } from "vitest";
import type { ParticipantPortalAdminRepository, ParticipantPortalAdminStudyRecord } from "./admin-repository";
import {
  buildDefaultParticipantPortalConfig,
  getParticipantPortalConfigForAdmin,
  hashPrivacyNotice,
  saveParticipantPortalConfigForAdmin
} from "./admin-service";

const admin = {
  id: "admin-1",
  role: "ADMIN" as const,
  status: "ACTIVE" as const
};

const interviewer = {
  id: "interviewer-1",
  role: "INTERVIEWER" as const,
  status: "ACTIVE" as const
};

function activeStudy(overrides: Partial<ParticipantPortalAdminStudyRecord> = {}): ParticipantPortalAdminStudyRecord {
  return {
    activeScreenerVersionId: "version-1",
    code: "FMASCULINA-NAVIGO-2026",
    id: "study-1",
    name: "Fragancia Masculina",
    portalConfig: null,
    status: "ACTIVE",
    ...overrides
  };
}

function validForm(overrides: Record<string, unknown> = {}) {
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
    privacyNoticeText: "Aviso de privacidad para el estudio.",
    privacyNoticeVersion: "v1",
    ...overrides
  };
}

function repository(study: ParticipantPortalAdminStudyRecord | null = activeStudy()): ParticipantPortalAdminRepository {
  return {
    getStudyPortalConfig: vi.fn(async () => study),
    saveStudyPortalConfig: vi.fn(async (input) => input)
  };
}

describe("participant portal admin service", () => {
  it("ADMIN sees portal configuration data with defaults", async () => {
    const result = await getParticipantPortalConfigForAdmin({
      actor: admin,
      repository: repository(),
      studyId: "study-1"
    });

    expect(result.ok ? result.data.effectiveConfig : null).toMatchObject({
      enabled: false,
      folioPrefix: "NAV",
      maxPerfumePhotos: 5
    });
  });

  it("non ADMIN cannot configure the portal", async () => {
    const result = await saveParticipantPortalConfigForAdmin({
      actor: interviewer,
      formInput: validForm(),
      repository: repository(),
      studyId: "study-1"
    });

    expect(result).toMatchObject({
      code: "UNAUTHORIZED",
      ok: false
    });
  });

  it("saves portal configuration disabled", async () => {
    const repo = repository(activeStudy({ status: "DRAFT", activeScreenerVersionId: null }));
    const result = await saveParticipantPortalConfigForAdmin({
      actor: admin,
      formInput: validForm({ enabled: false }),
      repository: repo,
      studyId: "study-1"
    });

    expect(result.ok).toBe(true);
    expect(repo.saveStudyPortalConfig).toHaveBeenCalledWith(expect.objectContaining({
      enabled: false,
      studyId: "study-1"
    }));
  });

  it("does not allow enabling without ACTIVE study", async () => {
    const result = await saveParticipantPortalConfigForAdmin({
      actor: admin,
      formInput: validForm({ enabled: true }),
      repository: repository(activeStudy({ status: "DRAFT" })),
      studyId: "study-1"
    });

    expect(result).toMatchObject({
      message: "No se puede habilitar el portal si el estudio no está activo.",
      ok: false
    });
  });

  it("does not allow enabling without active published screener", async () => {
    const result = await saveParticipantPortalConfigForAdmin({
      actor: admin,
      formInput: validForm({ enabled: true }),
      repository: repository(activeStudy({ activeScreenerVersionId: null })),
      studyId: "study-1"
    });

    expect(result).toMatchObject({
      message: "No se puede habilitar el portal sin un screener publicado activo.",
      ok: false
    });
  });

  it("does not allow enabling without privacy notice", async () => {
    const result = await saveParticipantPortalConfigForAdmin({
      actor: admin,
      formInput: validForm({ enabled: true, privacyNoticeText: "" }),
      repository: repository(),
      studyId: "study-1"
    });

    expect(result).toMatchObject({
      message: "No se puede habilitar el portal sin aviso de privacidad.",
      ok: false
    });
  });

  it("does not allow enabling when max perfume photos is not five", async () => {
    const result = await saveParticipantPortalConfigForAdmin({
      actor: admin,
      formInput: validForm({ enabled: true, maxPerfumePhotos: 3 }),
      repository: repository(),
      studyId: "study-1"
    });

    expect(result).toMatchObject({
      message: "No se puede habilitar el portal si el máximo de fotos de perfumes no es 5.",
      ok: false
    });
  });

  it("generates privacy notice hash on the server", async () => {
    const repo = repository();
    const result = await saveParticipantPortalConfigForAdmin({
      actor: admin,
      formInput: validForm({ privacyNoticeText: "Aviso final." }),
      repository: repo,
      studyId: "study-1"
    });

    expect(result.ok ? result.data.privacyNoticeHash : null).toBe(hashPrivacyNotice("Aviso final."));
    expect(repo.saveStudyPortalConfig).toHaveBeenCalledWith(expect.objectContaining({
      privacyNoticeHash: hashPrivacyNotice("Aviso final.")
    }));
  });

  it("uses default operational values for new configurations", () => {
    expect(buildDefaultParticipantPortalConfig()).toMatchObject({
      evidenceRetentionDays: 30,
      folioMaxSequence: 999,
      folioPrefix: "NAV",
      maxImageBytes: 8388608,
      maxOtpAttempts: 5,
      maxPerfumePhotos: 5,
      minPerfumePhotos: 1,
      nextFolioSequence: 1,
      otpCooldownSeconds: 60
    });
  });
});
