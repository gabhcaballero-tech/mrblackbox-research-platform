import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ScreenerDefinition } from "@/modules/screener";
import type { ParticipantPortalAttemptScreen } from "@/modules/participant-portal/screener-service";
import {
  PARTICIPANT_PORTAL_PUBLIC_PENDING_REVIEW_MESSAGE,
  PARTICIPANT_PORTAL_PUBLIC_TERMINATED_MESSAGE
} from "@/modules/participant-portal/screener-service";
import { ParticipantPortalResultCard, ParticipantScreenerForm } from "./ParticipantScreenerForm";

vi.mock("@/modules/participant-portal/screener-actions", () => ({
  saveParticipantPortalScreenerAnswerAction: vi.fn()
}));

function definition(): ScreenerDefinition {
  return {
    nse: {
      code: "NSE",
      inputs: [],
      label: "Nivel socioeconómico",
      ranges: [{ code: "C", eligible: true, label: "C típico", max: 167, min: 141 }],
      type: "score_table"
    },
    purpose: "SCREENER",
    questions: [
      {
        dataDestination: "SCREENING",
        id: "F9_FRECUENCIA_SEMANAL",
        options: [
          {
            actions: [],
            isOther: false,
            label: "Más de una vez al día",
            order: 1,
            otherTextRequired: false,
            value: "MAS_DE_UNA_VEZ_DIA"
          }
        ],
        order: 1,
        required: true,
        text: "¿Con qué frecuencia usas fragancia?",
        type: "SINGLE_CHOICE",
        validation: {}
      },
      {
        dataDestination: "SCREENING",
        id: "F9A_VECES_AL_DIA",
        order: 2,
        required: true,
        text: "¿Cuántas veces al día?",
        type: "INTEGER",
        validation: { max: 20, min: 2 },
        visibilityCondition: {
          questionId: "F9_FRECUENCIA_SEMANAL",
          type: "ANSWER_EQUALS",
          value: "MAS_DE_UNA_VEZ_DIA"
        }
      }
    ],
    rules: [],
    schemaVersion: "screening.v1",
    title: "Filtro público"
  };
}

function screenData(): ParticipantPortalAttemptScreen {
  const currentDefinition = definition();

  return {
    answers: {},
    attempt: {
      completedAt: null,
      evaluationJson: null,
      fieldUserId: null,
      id: "attempt-1",
      nseClass: null,
      nseScore: null,
      participantConfirmation: null,
      participantScreeningReview: null,
      questionnaireVersion: {
        definitionHash: "hash",
        definitionJson: currentDefinition,
        id: "version-1",
        publishedAt: new Date("2026-06-23T10:00:00Z"),
        status: "ACTIVE",
        study: {
          code: "FMASCULINA-NAVIGO-2026",
          id: "study-1",
          name: "Fragancia Masculina",
          status: "ACTIVE"
        },
        versionNumber: 1
      },
      questionnaireVersionId: "version-1",
      source: "PARTICIPANT_PORTAL",
      startedAt: new Date("2026-06-23T10:00:00Z"),
      status: "STARTED",
      studyParticipant: {
        id: "study-participant-1",
        participantProfile: {
          email: "persona@example.com",
          id: "profile-1",
          name: "Participante",
          participantAuthUserId: "auth-1",
          phone: "+525512345678"
        },
        participantProfileId: "profile-1",
        screeningStatus: "STARTED",
        studyId: "study-1"
      },
      studyParticipantId: "study-participant-1",
      terminationCode: null,
      terminationReason: null
    },
    currentQuestion: currentDefinition.questions[0] ?? null,
    definition: currentDefinition,
    photoNotice: null,
    progress: {
      answeredVisibleQuestions: 0,
      currentIndex: 1,
      totalVisibleQuestions: 1
    },
    result: {
      evaluationJson: {
        flags: [],
        missingQuestionIds: [],
        nse: null,
        reasons: [],
        result: "INCOMPLETE",
        safeExplanation: "Incompleto",
        schemaVersion: "screening-evaluation.v1",
        status: "INCOMPLETE"
      },
      flags: [],
      missingQuestionIds: [],
      nse: null,
      result: "INCOMPLETE",
      status: "INCOMPLETE"
    },
    study: {
      code: "FMASCULINA-NAVIGO-2026",
      id: "study-1",
      name: "Fragancia Masculina"
    },
    visibleQuestions: [currentDefinition.questions[0]!]
  };
}

describe("ParticipantScreenerForm", () => {
  it("renders one visible question at a time", () => {
    render(<ParticipantScreenerForm screen={screenData()} />);

    expect(screen.getByText("¿Con qué frecuencia usas fragancia?")).toBeInTheDocument();
    expect(screen.queryByText("¿Cuántas veces al día?")).not.toBeInTheDocument();
    expect(screen.queryByText("F9_FRECUENCIA_SEMANAL")).not.toBeInTheDocument();
  });

  it("does not show NSE or internal termination details in public result", () => {
    render(
      <ParticipantPortalResultCard
        result={{
          attemptId: "attempt-1",
          kind: "TERMINATED",
          message: PARTICIPANT_PORTAL_PUBLIC_TERMINATED_MESSAGE,
          showEvidencePlaceholder: false,
          study: {
            code: "FMASCULINA-NAVIGO-2026",
            id: "study-1",
            name: "Fragancia Masculina"
          }
        }}
      />
    );

    expect(screen.getByText(PARTICIPANT_PORTAL_PUBLIC_TERMINATED_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText(/NSE/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/FRECUENCIA_INSUFICIENTE/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Producto Secreto/i)).not.toBeInTheDocument();
  });

  it("shows evidence placeholder only for pending review", () => {
    render(
      <ParticipantPortalResultCard
        result={{
          attemptId: "attempt-1",
          kind: "PENDING_REVIEW",
          message: PARTICIPANT_PORTAL_PUBLIC_PENDING_REVIEW_MESSAGE,
          showEvidencePlaceholder: true,
          study: {
            code: "FMASCULINA-NAVIGO-2026",
            id: "study-1",
            name: "Fragancia Masculina"
          }
        }}
      />
    );

    expect(screen.getByText(PARTICIPANT_PORTAL_PUBLIC_PENDING_REVIEW_MESSAGE)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuar con evidencias" })).toBeDisabled();
  });
});
