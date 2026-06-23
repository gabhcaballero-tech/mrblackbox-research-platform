import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ScreenerDefinition } from "@/modules/screener";
import type { LibraryItemProjection } from "@/modules/question-library/service";
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
  moveScreenerQuestionWithFeedbackAction: vi.fn(async () => ({
    message: "Pregunta reordenada correctamente.",
    ok: true
  })),
  publishScreenerAction: vi.fn(),
  retireScreenerVersionAction: vi.fn(),
  saveScreenerMetadataAction: vi.fn(),
  saveScreenerNseAction: vi.fn(),
  updateScreenerOptionAction: vi.fn(),
  updateScreenerQuestionAction: vi.fn(),
  updateScreenerQuestionVisibilityAction: vi.fn(async () => ({
    message: "Visibilidad condicional actualizada correctamente.",
    ok: true
  }))
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

function renderBuilder(definition: ScreenerDefinition, libraryItems: LibraryItemProjection[] = []) {
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
      libraryItems={libraryItems}
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

function definitionWithDependentQuestion(
  visibilityCondition?: ScreenerDefinition["questions"][number]["visibilityCondition"]
): ScreenerDefinition {
  return {
    ...testDefinition,
    questions: [
      ...testDefinition.questions,
      {
        dataDestination: "SCREENING",
        id: "times-per-day",
        order: 2,
        required: true,
        text: "Veces al dia",
        type: "INTEGER",
        validation: {},
        visibilityCondition
      }
    ]
  };
}

function openVisibilityPanel(index: number) {
  const summary = screen.getAllByText("Visibilidad condicional")[index]!;
  fireEvent.click(summary);
  return summary.closest("details") as HTMLElement;
}

describe("ScreenerBuilder", () => {
  it("ubica insertar desde biblioteca dentro de anadir contenido, no en la parte superior", () => {
    renderBuilder(testDefinition);

    const headings = screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);

    expect(headings[1]).toBe("Estado del borrador");
    expect(headings[2]).toBe("Resumen del cuestionario");
    expect(headings).toContain("Añadir contenido al screener");
    expect(screen.queryByRole("heading", { name: "Insertar desde biblioteca" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Insertar desde biblioteca" }));

    expect(screen.getByRole("heading", { name: "Insertar desde biblioteca" })).toBeInTheDocument();
    expect(
      screen
        .getByRole("heading", { name: "Añadir contenido al screener" })
        .compareDocumentPosition(screen.getByRole("heading", { name: "Insertar desde biblioteca" })) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("muestra crear nueva pregunta e insertar desde biblioteca como acciones del mismo bloque", () => {
    renderBuilder(testDefinition);

    const tabList = screen.getByRole("tablist", { name: "Añadir contenido al screener" });

    expect(within(tabList).getByRole("tab", { name: "Crear nueva pregunta" })).toBeInTheDocument();
    expect(within(tabList).getByRole("tab", { name: "Insertar desde biblioteca" })).toBeInTheDocument();
  });

  it("abre crear nueva pregunta con el formulario existente", () => {
    renderBuilder(testDefinition);

    const createPanel = screen.getByRole("tabpanel", { name: "Crear nueva pregunta" });

    expect(within(createPanel).getByLabelText("ID técnico")).toBeInTheDocument();
    expect(within(createPanel).getByLabelText("Texto de la pregunta")).toBeInTheDocument();
    expect(within(createPanel).getByRole("button", { name: "Agregar pregunta" })).toBeInTheDocument();
  });

  it("muestra visible siempre por defecto en cada pregunta", () => {
    renderBuilder(definitionWithDependentQuestion());

    const panel = openVisibilityPanel(1);

    expect(within(panel).getByLabelText("Visible siempre")).toBeChecked();
    expect(within(panel).getByText("Esta pregunta se mostrara siempre.")).toBeInTheDocument();
  });

  it("permite configurar visibilidad condicional guiada", async () => {
    renderBuilder(definitionWithDependentQuestion());

    const panel = openVisibilityPanel(1);

    fireEvent.click(within(panel).getByLabelText("Mostrar solo si otra pregunta cumple una condicion"));
    fireEvent.change(within(panel).getByLabelText("Pregunta origen"), { target: { value: "brand" } });
    fireEvent.change(within(panel).getByLabelText("Valor"), { target: { value: "option-a" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Guardar visibilidad" }));

    expect(
      await screen.findByText("Visibilidad condicional actualizada correctamente.")
    ).toBeInTheDocument();
  });

  it("conserva valores de visibilidad condicional al renderizar", () => {
    renderBuilder(
      definitionWithDependentQuestion({
        questionId: "brand",
        type: "ANSWER_EQUALS",
        value: "option-a"
      })
    );

    const panel = openVisibilityPanel(1);

    expect(within(panel).getByLabelText("Mostrar solo si otra pregunta cumple una condicion")).toBeChecked();
    expect(within(panel).getByLabelText("Pregunta origen")).toHaveValue("brand");
    expect(within(panel).getByLabelText("Valor")).toHaveValue("option-a");
  });

  it("abre insertar desde biblioteca con busqueda, filtros y enlace a biblioteca", () => {
    renderBuilder(testDefinition);

    fireEvent.click(screen.getByRole("tab", { name: "Insertar desde biblioteca" }));

    const libraryPanel = screen.getByRole("tabpanel", { name: "Insertar desde biblioteca" });

    expect(within(libraryPanel).getByRole("heading", { name: "Insertar desde biblioteca" })).toBeInTheDocument();
    expect(within(libraryPanel).getByLabelText("Buscar")).toBeInTheDocument();
    expect(within(libraryPanel).getByLabelText("Tipo")).toBeInTheDocument();
    expect(within(libraryPanel).getByRole("link", { name: "Ver biblioteca" })).toBeInTheDocument();
    expect(within(libraryPanel).getByPlaceholderText("Ej. consentimiento o NSE")).toBeInTheDocument();
    expect(within(libraryPanel).getByPlaceholderText("Ej. Exclusiones")).toBeInTheDocument();
    expect(within(libraryPanel).getByPlaceholderText("Ej. elegibilidad, screener")).toBeInTheDocument();
  });

  it("cambiar de accion no borra datos capturados en pregunta nueva", () => {
    renderBuilder(testDefinition);

    const createPanel = screen.getByRole("tabpanel", { name: "Crear nueva pregunta" });
    const questionTextInput = within(createPanel).getByLabelText("Texto de la pregunta");

    fireEvent.change(questionTextInput, { target: { value: "Nueva pregunta de prueba" } });
    fireEvent.click(screen.getByRole("tab", { name: "Insertar desde biblioteca" }));
    fireEvent.click(screen.getByRole("tab", { name: "Crear nueva pregunta" }));

    expect(
      within(screen.getByRole("tabpanel", { name: "Crear nueva pregunta" })).getByLabelText(
        "Texto de la pregunta"
      )
    ).toHaveValue("Nueva pregunta de prueba");
  });

  it("mantiene guardar preguntas seleccionadas como bloque cerca del listado", () => {
    renderBuilder(testDefinition);

    const questionHeading = screen.getByRole("heading", { name: "1. Marca usada" });
    const saveBlock = screen.getAllByText("Guardar preguntas seleccionadas como bloque")[0]!;
    const addContentHeading = screen.getByRole("heading", { name: "Añadir contenido al screener" });

    expect(questionHeading.compareDocumentPosition(saveBlock) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(saveBlock.compareDocumentPosition(addContentHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("mantiene los formularios para guardar pregunta y bloque en biblioteca", () => {
    renderBuilder(testDefinition);

    fireEvent.click(screen.getAllByText("Guardar pregunta en biblioteca")[0]!);
    fireEvent.click(screen.getAllByText("Guardar preguntas seleccionadas como bloque")[0]!);

    expect(screen.getAllByLabelText("Nombre del elemento").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Usa un nombre corto que permita identificarlo y reutilizarlo.").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByRole("button", { name: "Guardar pregunta en biblioteca" }).length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByRole("button", { name: "Guardar preguntas seleccionadas como bloque" }).length
    ).toBeGreaterThanOrEqual(1);
  });

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
