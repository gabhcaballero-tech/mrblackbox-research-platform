import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ScreenerDefinition, ScreenerQuestion } from "@/modules/screener";
import type { FieldAttemptScreen } from "@/modules/field/service";
import type { FieldStudySummary } from "@/modules/field/repository";
import {
  FieldStudyCard,
  ParticipantStartForm,
  ScreeningQuestionForm,
  ScreeningResultCard,
  fieldAttemptStatusLabel,
  fieldResultTitle
} from "./FieldComponents";

vi.mock("@/modules/field/actions", () => ({
  saveFieldScreeningAnswerAction: vi.fn(),
  startFieldScreeningAttemptAction: vi.fn()
}));

const study: FieldStudySummary = {
  activeScreenerVersion: {
    definitionHash: "hash",
    definitionJson: {},
    id: "version-1",
    publishedAt: new Date("2026-06-23T10:00:00Z"),
    status: "ACTIVE",
    versionNumber: 1
  },
  code: "FMASCULINA-NAVIGO-2026",
  id: "study-1",
  name: "Fragancia Masculina — Navigo Homme",
  status: "ACTIVE",
  timeZoneIana: "America/Mexico_City"
};

const baseDefinition: ScreenerDefinition = {
  purpose: "SCREENER",
  questions: [],
  rules: [],
  schemaVersion: "screening.v1",
  title: "Filtro"
};

function buildDefinitionWithNse(hasLabel = true): ScreenerDefinition {
  return {
    ...baseDefinition,
    nse: {
      code: "NSE",
      inputs: [],
      label: "Nivel socioeconómico",
      ranges: hasLabel
        ? [{ code: "RANGO-3", eligible: true, label: "C típico", max: 167, min: 141 }]
        : [],
      type: "score_table"
    }
  };
}

function screenFixture(
  question: ScreenerQuestion = singleChoiceQuestion(),
  status = "INCOMPLETE",
  hasLabel = true
): FieldAttemptScreen {
  return {
    answers: {},
    attempt: {
      completedAt: status === "INCOMPLETE" ? null : new Date("2026-06-23T10:10:00Z"),
      evaluationJson: null,
      fieldUserId: "user-1",
      id: "attempt-1",
      nseClass: status === "PASSED" ? "RANGO-3" : null,
      nseScore: status === "PASSED" ? 144 : null,
      questionnaireVersion: {
        ...study.activeScreenerVersion,
        study: {
          code: study.code,
          id: study.id,
          name: study.name,
          status: study.status,
          timeZoneIana: study.timeZoneIana
        }
      },
      questionnaireVersionId: "version-1",
      status: status as FieldAttemptScreen["attempt"]["status"],
      studyParticipant: {
        id: "sp-1",
        participantProfile: {
          email: null,
          externalReference: null,
          id: "profile-1",
          name: "Participante prueba",
          phone: null
        },
        participantProfileId: "profile-1",
        screeningStatus: status as FieldAttemptScreen["attempt"]["status"],
        studyId: "study-1"
      },
      studyParticipantId: "sp-1",
      terminationCode: status === "TERMINATED" ? "GENERO_NO_ELEGIBLE" : null,
      terminationReason: status === "TERMINATED" ? "No califica para el estudio." : null
    },
    currentQuestion: status === "INCOMPLETE" ? question : null,
    definition: buildDefinitionWithNse(hasLabel),
    progress: {
      answeredVisibleQuestions: 1,
      currentIndex: 1,
      totalVisibleQuestions: 3
    },
    result: {
      evaluationJson: {
        flags: [],
        missingQuestionIds: [],
        nse: status === "PASSED"
          ? {
              classCode: "RANGO-3",
              classLabel: hasLabel ? "C típico" : undefined,
              code: "NSE",
              eligible: true,
              label: "Nivel socioeconómico",
              missingQuestionIds: [],
              score: 144
            }
          : null,
        reasons: [],
        result: status === "PASSED" ? "ELIGIBLE" : status === "TERMINATED" ? "NOT_ELIGIBLE" : "INCOMPLETE",
        safeExplanation: status === "PASSED" ? "El filtro es elegible." : "El filtro está incompleto.",
        schemaVersion: "screening-evaluation.v1",
        status: status as FieldAttemptScreen["result"]["status"]
      },
      flags: [],
      missingQuestionIds: [],
      nse: status === "PASSED"
        ? {
            classCode: "RANGO-3",
            classLabel: hasLabel ? "C típico" : undefined,
            code: "NSE",
            eligible: true,
            label: "Nivel socioeconómico",
            missingQuestionIds: [],
            score: 144
          }
        : null,
      result: status === "PASSED" ? "ELIGIBLE" : status === "TERMINATED" ? "NOT_ELIGIBLE" : "INCOMPLETE",
      status: status as FieldAttemptScreen["result"]["status"]
    },
    visibleQuestions: [question]
  };
}

function singleChoiceQuestion() {
  return {
    dataDestination: "SCREENING" as const,
    id: "F1_GENERO",
    options: [
      {
        actions: [],
        isOther: false,
        label: "Hombre",
        order: 1,
        otherTextRequired: false,
        value: "HOMBRE"
      },
      {
        actions: [],
        isOther: false,
        label: "Mujer",
        order: 2,
        otherTextRequired: false,
        value: "MUJER"
      }
    ],
    order: 1,
    required: true,
    text: "Género",
    type: "SINGLE_CHOICE" as const,
    validation: {}
  };
}

describe("FieldComponents", () => {
  it("renders active field study cards", () => {
    render(<FieldStudyCard study={study} />);

    expect(screen.getByText("Fragancia Masculina — Navigo Homme")).toBeInTheDocument();
    expect(screen.getByText("FMASCULINA-NAVIGO-2026")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Aplicar filtro" })).toBeInTheDocument();
  });

  it("renders minimal participant start form", () => {
    render(<ParticipantStartForm studyId="study-1" />);

    expect(screen.getByLabelText("Nombre o identificador operativo")).toBeInTheDocument();
    expect(screen.getByLabelText("Teléfono")).toBeInTheDocument();
    expect(screen.getByLabelText("Correo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Iniciar filtro" })).toBeInTheDocument();
  });

  it("renders single choice questions with visible options", () => {
    render(<ScreeningQuestionForm screen={screenFixture(singleChoiceQuestion())} />);

    expect(screen.getByText("Pregunta 1 de 3")).toBeInTheDocument();
    expect(screen.getByLabelText("Hombre")).toBeInTheDocument();
    expect(screen.getByLabelText("Mujer")).toBeInTheDocument();
  });

  it("renders integer, text and Other controls", () => {
    render(
      <div>
        <ScreeningQuestionForm
          screen={screenFixture({
            dataDestination: "SCREENING",
            id: "F2_EDAD",
            order: 1,
            required: true,
            text: "Edad",
            type: "INTEGER",
            validation: { max: 120, min: 0 }
          })}
        />
        <ScreeningQuestionForm
          screen={screenFixture({
            dataDestination: "SCREENING",
            id: "TXT",
            order: 1,
            required: true,
            text: "Texto",
            type: "SHORT_TEXT",
            validation: {}
          })}
        />
        <ScreeningQuestionForm
          screen={screenFixture({
            dataDestination: "SCREENING",
            id: "OTRO",
            options: [
              {
                actions: [],
                isOther: true,
                label: "Otra",
                order: 1,
                otherTextRequired: true,
                value: "OTRA"
              }
            ],
            order: 1,
            required: true,
            text: "Otro",
            type: "SINGLE_CHOICE",
            validation: {}
          })}
        />
      </div>
    );

    expect(screen.getByLabelText("Respuesta numérica")).toBeInTheDocument();
    expect(screen.getByLabelText("Respuesta")).toBeInTheDocument();
    expect(screen.getByLabelText("Especifica")).toBeInTheDocument();
  });

  it("shows NSE label instead of internal code and translates visible statuses", () => {
    const { rerender } = render(<ScreeningResultCard screen={screenFixture(singleChoiceQuestion(), "PASSED")} />);

    expect(screen.getByText("Elegible / pasó filtro")).toBeInTheDocument();
    expect(screen.getByText("144")).toBeInTheDocument();
    expect(screen.getByText("C típico")).toBeInTheDocument();
    expect(screen.getByText("Código NSE: RANGO-3")).toBeInTheDocument();
    expect(screen.getByText("Clasificación NSE")).toBeInTheDocument();
    expect(screen.getByText("Código")).toBeInTheDocument();
    expect(screen.getByText("Intento elegible")).toBeInTheDocument();
    expect(screen.queryByText("Intento PASSED")).not.toBeInTheDocument();

    rerender(<ScreeningResultCard screen={screenFixture(singleChoiceQuestion(), "TERMINATED")} />);

    expect(screen.getByText("No elegible")).toBeInTheDocument();
    expect(screen.getByText("Intento terminado")).toBeInTheDocument();
    expect(screen.queryByText("Intento TERMINATED")).not.toBeInTheDocument();
    expect(screen.getByText("GENERO_NO_ELEGIBLE")).toBeInTheDocument();
  });

  it("shows pending review in Spanish", () => {
    render(<ScreeningResultCard screen={screenFixture(singleChoiceQuestion(), "PENDING_REVIEW")} />);

    expect(screen.getByText("Intento pendiente de revisión")).toBeInTheDocument();
    expect(screen.getByText("Pendiente de revisión")).toBeInTheDocument();
  });

  it("falls back to internal NSE code when label is missing", () => {
    render(<ScreeningResultCard screen={screenFixture(singleChoiceQuestion(), "PASSED", false)} />);

    expect(screen.getAllByText("RANGO-3").length).toBeGreaterThan(0);
  });

  it("maps attempt statuses to Spanish labels without changing internal values", () => {
    expect(fieldAttemptStatusLabel("PASSED")).toBe("Intento elegible");
    expect(fieldAttemptStatusLabel("TERMINATED")).toBe("Intento terminado");
    expect(fieldAttemptStatusLabel("PENDING_REVIEW")).toBe("Intento pendiente de revisión");
    expect(fieldAttemptStatusLabel("INCOMPLETE")).toBe("Intento incompleto");
    expect(fieldAttemptStatusLabel("STARTED")).toBe("Intento iniciado");
  });

  it("uses No elegible as the terminated result title", () => {
    expect(fieldResultTitle("TERMINATED")).toBe("No elegible");
    expect(fieldResultTitle("PASSED")).toBe("Elegible / pasó filtro");
  });
});
