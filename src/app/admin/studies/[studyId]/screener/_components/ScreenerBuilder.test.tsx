import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ScreenerDefinition } from "@/modules/screener";
import { ScreenerBuilder } from "./ScreenerBuilder";

vi.mock("@/modules/screener/actions", () => ({
  addConsentDefaultOptionsAction: vi.fn(),
  addScreenerOptionAction: vi.fn(),
  addScreenerQuestionAction: vi.fn(),
  addScreenerRuleAction: vi.fn(),
  clearScreenerNseAction: vi.fn(),
  createScreenerDraftAction: vi.fn(),
  deleteScreenerOptionAction: vi.fn(),
  deleteScreenerQuestionAction: vi.fn(),
  deleteScreenerRuleAction: vi.fn(),
  moveScreenerOptionAction: vi.fn(),
  moveScreenerQuestionAction: vi.fn(),
  publishScreenerAction: vi.fn(),
  retireScreenerVersionAction: vi.fn(),
  saveScreenerMetadataAction: vi.fn(),
  saveScreenerNseAction: vi.fn(),
  updateScreenerOptionAction: vi.fn(),
  updateScreenerQuestionAction: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn()
  })
}));

const testDefinition: ScreenerDefinition = {
  purpose: "SCREENER",
  questions: [
    {
      dataDestination: "SCREENING",
      id: "brand",
      options: [
        {
          actions: [
            {
              code: "STOP",
              reason: "No califica",
              type: "TERMINATE"
            }
          ],
          isOther: false,
          label: "Opción A",
          order: 1,
          otherTextRequired: false,
          value: "option-a"
        }
      ],
      order: 1,
      required: true,
      text: "Marca usada",
      type: "SINGLE_CHOICE",
      validation: {}
    }
  ],
  rules: [
    {
      condition: {
        questionId: "brand",
        type: "ANSWER_EQUALS",
        value: "option-a"
      },
      id: "rule-1",
      order: 1,
      outcome: {
        code: "REVIEW",
        reason: "Revisar respuesta",
        type: "PENDING_REVIEW"
      }
    }
  ],
  schemaVersion: "screening.v1",
  title: "Filtro de prueba"
};

function renderBuilder(definition: ScreenerDefinition) {
  render(
    <ScreenerBuilder
      definition={definition}
      draft={{
        createdAt: new Date("2026-01-01T12:00:00Z"),
        createdByUserId: "user-1",
        definitionJson: definition,
        id: "draft-1",
        name: "Borrador",
        purpose: "SCREENER",
        status: "DRAFT",
        studyId: "study-1",
        updatedAt: new Date("2026-01-02T12:00:00Z"),
        updatedByUserId: null
      }}
      libraryItems={[]}
      readOnly={false}
      study={{
        code: "TEST-1",
        id: "study-1",
        name: "Estudio de prueba",
        status: "DRAFT",
        timeZoneIana: "America/Mexico_City"
      }}
      versions={[
        {
          definitionHash: "abc123",
          definitionJson: definition,
          id: "version-1",
          publishedAt: new Date("2026-01-03T12:00:00Z"),
          publishedByUserId: "user-1",
          questionnaireDraftId: "draft-1",
          retiredAt: null,
          retiredByUserId: null,
          status: "ACTIVE",
          studyId: "study-1",
          versionNumber: 1
        }
      ]}
    />
  );
}

describe("ScreenerBuilder", () => {
  it("muestra los selects principales en español y oculta valores internos crudos", () => {
    render(
      <ScreenerBuilder
        definition={testDefinition}
        draft={{
          createdAt: new Date("2026-01-01T12:00:00Z"),
          createdByUserId: "user-1",
          definitionJson: testDefinition,
          id: "draft-1",
          name: "Borrador",
          purpose: "SCREENER",
          status: "DRAFT",
          studyId: "study-1",
          updatedAt: new Date("2026-01-02T12:00:00Z"),
          updatedByUserId: null
        }}
        libraryItems={[]}
        readOnly={false}
        study={{
          code: "TEST-1",
          id: "study-1",
          name: "Estudio de prueba",
          status: "DRAFT",
          timeZoneIana: "America/Mexico_City"
        }}
        versions={[
          {
            definitionHash: "abc123",
            definitionJson: testDefinition,
            id: "version-1",
            publishedAt: new Date("2026-01-03T12:00:00Z"),
            publishedByUserId: "user-1",
            questionnaireDraftId: "draft-1",
            retiredAt: null,
            retiredByUserId: null,
            status: "ACTIVE",
            studyId: "study-1",
            versionNumber: 1
          }
        ]}
      />
    );

    expect(screen.getAllByRole("option", { name: "Selección única" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("option", { name: "Filtro" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("option", { name: "La respuesta es igual a" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("option", { name: "Terminar filtro" }).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Borrador").length).toBeGreaterThan(0);
    expect(screen.getByText(/Activa · Publicada el/)).toBeInTheDocument();

    expect(screen.queryByRole("option", { name: "SINGLE_CHOICE" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "SCREENING" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "ANSWER_EQUALS" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "TERMINATE" })).not.toBeInTheDocument();
    expect(screen.queryByText("DRAFT")).not.toBeInTheDocument();
    expect(screen.queryByText("PENDING_REVIEW")).not.toBeInTheDocument();
  });

  it("muestra el botón para reparar opciones faltantes de consentimiento", () => {
    renderBuilder({
      purpose: "SCREENER",
      questions: [
        {
          dataDestination: "SCREENING",
          id: "q-consent",
          options: [],
          order: 1,
          required: true,
          text: "Consentimiento",
          type: "CONSENT_YES_NO",
          validation: {}
        }
      ],
      rules: [],
      schemaVersion: "screening.v1",
      title: "Filtro de prueba"
    });

    expect(
      screen.getByRole("button", { name: "Agregar opciones predeterminadas de consentimiento" })
    ).toBeInTheDocument();
  });

  it("muestra opciones de consentimiento guardadas en el editor habitual", () => {
    renderBuilder({
      purpose: "SCREENER",
      questions: [
        {
          dataDestination: "SCREENING",
          id: "q-consent",
          options: [
            {
              actions: [{ type: "CONTINUE" }],
              isOther: false,
              label: "Sí, acepto participar",
              order: 1,
              otherTextRequired: false,
              value: "SI"
            },
            {
              actions: [
                {
                  code: "SIN_CONSENTIMIENTO",
                  reason: "La persona no aceptó participar voluntariamente en el estudio.",
                  type: "TERMINATE"
                }
              ],
              isOther: false,
              label: "No, no acepto participar",
              order: 2,
              otherTextRequired: false,
              value: "NO"
            }
          ],
          order: 1,
          required: true,
          text: "Consentimiento",
          type: "CONSENT_YES_NO",
          validation: {}
        }
      ],
      rules: [],
      schemaVersion: "screening.v1",
      title: "Filtro de prueba"
    });

    expect(screen.getByDisplayValue("Sí, acepto participar")).toBeInTheDocument();
    expect(screen.getByDisplayValue("No, no acepto participar")).toBeInTheDocument();
    expect(screen.getByDisplayValue("SIN_CONSENTIMIENTO")).toBeInTheDocument();
    expect(screen.getByDisplayValue("La persona no aceptó participar voluntariamente en el estudio.")).toBeInTheDocument();
    expect(screen.getAllByLabelText(/Acci/).map((select) => (select as HTMLSelectElement).value)).toContain("TERMINATE");
  });
});
