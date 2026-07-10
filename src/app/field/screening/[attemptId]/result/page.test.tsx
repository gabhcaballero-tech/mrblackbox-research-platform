import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ScreeningResultPage from "./page";
import {
  getFieldScreeningAttemptScreen,
  getFieldScreeningReviewReadiness,
  PUBLIC_FIELD_ACTOR,
  type FieldAttemptScreen,
  type FieldScreeningReviewReadiness
} from "@/modules/field/service";
import type { FieldParticipantEvidenceRecord } from "@/modules/field/repository";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("not-found");
  })
}));

vi.mock("@/modules/field/auth", () => ({
  getFieldActorForRequest: vi.fn(async () => PUBLIC_FIELD_ACTOR)
}));

vi.mock("@/modules/field/repository", () => ({
  createFieldRepository: vi.fn(() => ({}))
}));

vi.mock("@/modules/field/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/field/service")>();

  return {
    ...actual,
    getFieldScreeningAttemptScreen: vi.fn(async () => ({
      data: fieldScreen(),
      ok: true
    })),
    getFieldScreeningReviewReadiness: vi.fn(async () => readinessFixture({ nextStep: "PERFUME_PHOTOS" }))
  };
});

describe("Field screening result page", () => {
  it("shows the perfume photos CTA first when final evidence is incomplete", async () => {
    render(
      await ScreeningResultPage({
        params: Promise.resolve({ attemptId: "attempt-1" })
      })
    );

    expect(screen.getByText("Agrega fotos de marcas de perfumes")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Agregar fotos de marcas de perfumes" })).toHaveAttribute(
      "href",
      "/field/screening/attempt-1/evidences"
    );
    expect(screen.queryByText("Campo no disponible")).not.toBeInTheDocument();
  });

  it("shows a clear selfie CTA after F6 perfume photos are complete", async () => {
    vi.mocked(getFieldScreeningReviewReadiness).mockResolvedValueOnce(
      readinessFixture({
        hasRequiredPerfumePhotos: true,
        nextStep: "SELFIE",
        perfumePhotoCount: 1,
        perfumePhotoRelatedQuestionIds: ["F6_MARCAS_UTILIZA"]
      })
    );

    render(
      await ScreeningResultPage({
        params: Promise.resolve({ attemptId: "attempt-1" })
      })
    );

    expect(screen.getByText("Completa la selfie para enviar a revisión")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Completar selfie" })).toHaveAttribute(
      "href",
      "/field/screening/attempt-1/selfie"
    );
    expect(screen.queryByText("Campo no disponible")).not.toBeInTheDocument();
  });

  it("shows profile review after selfie and perfume photos are complete instead of the generic field error", async () => {
    vi.mocked(getFieldScreeningReviewReadiness).mockResolvedValueOnce(
      readinessFixture({
        hasPendingReview: true,
        hasRequiredPerfumePhotos: true,
        nextStep: "PENDING_REVIEW",
        perfumePhotoCount: 1,
        perfumePhotoRelatedQuestionIds: ["F6_MARCAS_UTILIZA"],
        reviewStatus: "PENDING",
        selfieCount: 1,
        status: "PENDING_REVIEW"
      })
    );

    render(
      await ScreeningResultPage({
        params: Promise.resolve({ attemptId: "attempt-1" })
      })
    );

    expect(screen.getByText("Registro recibido")).toBeInTheDocument();
    expect(screen.getByText("Tu perfil está en revisión.")).toBeInTheDocument();
    expect(screen.getByText("Te enviaremos la confirmación después de la revisión.")).toBeInTheDocument();
    expect(screen.queryByText("Campo no disponible")).not.toBeInTheDocument();
  });

  it("shows profile review for legacy PASSED attempts that already have pending review", async () => {
    vi.mocked(getFieldScreeningReviewReadiness).mockResolvedValueOnce(
      readinessFixture({
        hasPendingReview: true,
        hasRequiredPerfumePhotos: true,
        nextStep: "PENDING_REVIEW",
        perfumePhotoCount: 1,
        perfumePhotoRelatedQuestionIds: ["F6_MARCAS_UTILIZA"],
        reviewStatus: "PENDING",
        selfieCount: 1,
        status: "PASSED"
      })
    );

    render(
      await ScreeningResultPage({
        params: Promise.resolve({ attemptId: "attempt-1" })
      })
    );

    expect(screen.getByText("Registro recibido")).toBeInTheDocument();
    expect(screen.queryByText("Campo no disponible")).not.toBeInTheDocument();
  });

  it("shows a clear result message instead of the generic field error when the screen cannot be loaded", async () => {
    vi.mocked(getFieldScreeningReviewReadiness).mockResolvedValueOnce(
      readinessFixture({
        nextStep: "RESULT"
      })
    );
    vi.mocked(getFieldScreeningAttemptScreen).mockResolvedValueOnce({
      code: "STUDY_NOT_AVAILABLE",
      message: "El cuestionario no está disponible.",
      ok: false
    });

    render(
      await ScreeningResultPage({
        params: Promise.resolve({ attemptId: "attempt-1" })
      })
    );

    expect(screen.getByText("Resultado no disponible")).toBeInTheDocument();
    expect(screen.getByText("El cuestionario no está disponible.")).toBeInTheDocument();
    expect(screen.queryByText("Campo no disponible")).not.toBeInTheDocument();
  });
});

function readinessFixture(
  overrides: Partial<FieldScreeningReviewReadiness> = {}
): FieldScreeningReviewReadiness {
  return {
    attemptExists: true,
    fieldUserId: null,
    hasConfirmation: true,
    hasPendingReview: false,
    hasRequiredPerfumePhotos: false,
    hasStudyParticipant: true,
    isPublicFieldAttempt: true,
    nextStep: "PERFUME_PHOTOS",
    perfumePhotoCount: 0,
    perfumePhotoRelatedQuestionIds: [],
    reviewStatus: null,
    selfieCount: 0,
    source: "FIELD",
    status: "PASSED",
    studyParticipantId: "sp-1",
    ...overrides
  };
}

function fieldScreen(
  overrides: {
    participantEvidence?: FieldParticipantEvidenceRecord[];
    participantScreeningReview?: { rejectionReason: string | null; status: "APPROVED" | "PENDING" | "REJECTED" } | null;
    status?: FieldAttemptScreen["attempt"]["status"];
  } = {}
): FieldAttemptScreen {
  const evaluationStatus = overrides.status === "PENDING_REVIEW" ? "PENDING_REVIEW" : "PASSED";

  return {
    answers: {},
    attempt: {
      completedAt: new Date("2026-06-23T10:10:00Z"),
      evaluationJson: {
        safeExplanation: "Elegible preliminar."
      },
      fieldUserId: null,
      id: "attempt-1",
      nseClass: null,
      nseScore: null,
      participantEvidence: overrides.participantEvidence ?? [],
      participantScreeningReview: overrides.participantScreeningReview ?? null,
      questionnaireVersion: {
        definitionHash: "hash",
        definitionJson: {},
        id: "version-1",
        publishedAt: new Date("2026-06-23T10:00:00Z"),
        status: "ACTIVE",
        study: {
          code: "FMASCULINA-NAVIGO-2026",
          id: "study-1",
          name: "Fragancia Masculina",
          participantPortalConfig: {
            maxImageBytes: 8388608,
            maxPerfumePhotos: 5,
            minPerfumePhotos: 1
          },
          status: "ACTIVE",
          timeZoneIana: "America/Mexico_City"
        },
        versionNumber: 1
      },
      questionnaireVersionId: "version-1",
      source: "FIELD",
      startedAt: new Date("2026-06-23T10:00:00Z"),
      status: overrides.status ?? "PASSED",
      studyParticipant: {
        id: "sp-1",
        participantProfile: {
          email: null,
          externalReference: null,
          id: "profile-1",
          name: "Persona publica",
          phone: "5551112222"
        },
        participantProfileId: "profile-1",
        screeningStatus: overrides.status ?? "PASSED",
        studyId: "study-1"
      },
      studyParticipantId: "sp-1",
      terminationCode: null,
      terminationReason: null
    },
    currentQuestion: null,
    definition: {
      purpose: "SCREENER",
      questions: [],
      rules: [],
      schemaVersion: "screening.v1",
      title: "Filtro"
    },
    progress: {
      answeredVisibleQuestions: 1,
      currentIndex: 1,
      totalVisibleQuestions: 1
    },
    result: {
      evaluationJson: {
        flags: [],
        missingQuestionIds: [],
        nse: null,
        reasons: [],
        result: "ELIGIBLE",
        safeExplanation: "Elegible preliminar.",
        schemaVersion: "screening-evaluation.v1",
        status: evaluationStatus
      },
      flags: [],
      missingQuestionIds: [],
      nse: null,
      result: "ELIGIBLE",
      status: evaluationStatus
    },
    visibleQuestions: []
  };
}
