import { fireEvent, render, screen } from "@testing-library/react";
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

vi.mock("../_components/PortalEvidenceCapture", () => ({
  PortalEvidenceCapture: ({ buttonLabel, title }: { buttonLabel: string; title: string }) => (
    <div>
      <p>{title}</p>
      <button type="button">{buttonLabel}</button>
    </div>
  )
}));

function definition(): ScreenerDefinition {
  return {
    nse: {
      code: "NSE",
      inputs: [],
      label: "Nivel socioeconomico",
      ranges: [{ code: "C", eligible: true, label: "C tipico", max: 167, min: 141 }],
      type: "score_table"
    },
    purpose: "SCREENER",
    questions: [
      {
        dataDestination: "SCREENING",
        id: "F6_MARCAS_UTILIZA",
        order: 1,
        required: true,
        text: "Que marcas utilizas?",
        type: "LONG_TEXT",
        validation: {}
      },
      {
        dataDestination: "SCREENING",
        id: "F9_FRECUENCIA_SEMANAL",
        options: [
          {
            actions: [],
            isOther: false,
            label: "Mas de una vez al dia",
            order: 1,
            otherTextRequired: false,
            value: "MAS_DE_UNA_VEZ_DIA"
          }
        ],
        order: 2,
        required: true,
        text: "Con que frecuencia usas fragancia?",
        type: "SINGLE_CHOICE",
        validation: {}
      }
    ],
    rules: [],
    schemaVersion: "screening.v1",
    title: "Filtro publico"
  };
}

function screenData(overrides: Partial<ParticipantPortalAttemptScreen> = {}): ParticipantPortalAttemptScreen {
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
      participantEvidence: [],
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
    evidence: {
      maxPerfumePhotos: 5,
      minPerfumePhotos: 1,
      perfumePhotos: 0,
      selfieComplete: true
    },
    photoNotice: null,
    progress: {
      answeredVisibleQuestions: 0,
      currentIndex: 1,
      totalVisibleQuestions: 2
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
    visibleQuestions: currentDefinition.questions,
    ...overrides
  };
}

describe("ParticipantScreenerForm", () => {
  it("renders one visible question at a time", () => {
    render(<ParticipantScreenerForm screen={screenData()} />);

    expect(screen.getByText("Que marcas utilizas?")).toBeInTheDocument();
    expect(screen.queryByText("Con que frecuencia usas fragancia?")).not.toBeInTheDocument();
    expect(screen.queryByText("F9_FRECUENCIA_SEMANAL")).not.toBeInTheDocument();
  });

  it("requires perfume photos during F6 before continuing", () => {
    render(<ParticipantScreenerForm screen={screenData()} />);

    expect(screen.getByText("Fotos de perfumes")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tomar foto del perfume" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar y continuar" })).toBeDisabled();
  });

  it("normalizes participant free text while typing without removing word spaces", () => {
    render(<ParticipantScreenerForm screen={screenData()} />);

    const input = screen.getByLabelText("Respuesta");
    fireEvent.change(input, { target: { value: "  hace   2 meses  \ud83d\ude0a " } });

    expect(input).toHaveValue("HACE 2 MESES ");
    fireEvent.blur(input);
    expect(input).toHaveValue("HACE 2 MESES");
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

  it("shows continue with selfie for preliminary eligible result", () => {
    render(
      <ParticipantPortalResultCard
        result={{
          attemptId: "attempt-1",
          kind: "PENDING_EVIDENCE",
          message: "Tu filtro fue registrado de forma preliminar. Falta tu selfie para enviar tu participación a revisión.",
          showEvidencePlaceholder: true,
          study: {
            code: "FMASCULINA-NAVIGO-2026",
            id: "study-1",
            name: "Fragancia Masculina"
          }
        }}
      />
    );

    expect(screen.getByText(/Falta tu selfie/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continuar con selfie" })).toHaveAttribute(
      "href",
      "/participar/FMASCULINA-NAVIGO-2026/selfie"
    );
  });

  it("keeps the review message only after evidence is complete", () => {
    render(
      <ParticipantPortalResultCard
        result={{
          attemptId: "attempt-1",
          kind: "PENDING_REVIEW",
          message: PARTICIPANT_PORTAL_PUBLIC_PENDING_REVIEW_MESSAGE,
          showEvidencePlaceholder: false,
          study: {
            code: "FMASCULINA-NAVIGO-2026",
            id: "study-1",
            name: "Fragancia Masculina"
          }
        }}
      />
    );

    expect(screen.getByText(PARTICIPANT_PORTAL_PUBLIC_PENDING_REVIEW_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Continuar con selfie" })).not.toBeInTheDocument();
  });
});
