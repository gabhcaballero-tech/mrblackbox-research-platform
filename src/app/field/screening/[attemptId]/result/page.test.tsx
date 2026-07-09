import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ScreeningResultPage from "./page";
import { PUBLIC_FIELD_ACTOR } from "@/modules/field/service";

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
    }))
  };
});

describe("Field screening result page", () => {
  it("shows a clear selfie CTA instead of the generic field error when evidence is pending", async () => {
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
});

function fieldScreen() {
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
      participantEvidence: [],
      participantScreeningReview: null,
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
      status: "PASSED",
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
        screeningStatus: "PASSED",
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
        reasons: [],
        result: "ELIGIBLE",
        safeExplanation: "Elegible preliminar.",
        schemaVersion: "screening-evaluation.v1",
        status: "PASSED"
      },
      flags: [],
      missingQuestionIds: [],
      result: "ELIGIBLE",
      status: "PASSED"
    },
    visibleQuestions: []
  };
}
