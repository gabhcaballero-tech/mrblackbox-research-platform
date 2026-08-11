import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCtlDefinition, type CtlDefinition } from "@/modules/ctl/definition";
import {
  CtlMobileCapture,
  flattenCtlQuestions,
  getInitialCtlQuestionIndex,
  getPendingCtlQuestionCodes
} from "./CtlMobileCapture";
import {
  finishPublicCtlSessionAction,
  markPublicCtlComparativeStartedAction,
  savePublicCtlQuestionAnswerAction
} from "@/modules/ctl/public-actions";

vi.mock("@/modules/ctl/public-actions", () => ({
  finishPublicCtlSessionAction: vi.fn(),
  markPublicCtlComparativeStartedAction: vi.fn(),
  savePublicCtlQuestionAnswerAction: vi.fn()
}));

const saveQuestionMock = vi.mocked(savePublicCtlQuestionAnswerAction);
const finishMock = vi.mocked(finishPublicCtlSessionAction);
const markComparativeStartedMock = vi.mocked(markPublicCtlComparativeStartedAction);
const scrollIntoViewMock = vi.fn();

describe("CtlMobileCapture", () => {
  beforeEach(() => {
    saveQuestionMock.mockReset();
    finishMock.mockReset();
    markComparativeStartedMock.mockReset();
    scrollIntoViewMock.mockReset();
    Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoViewMock
    });
    saveQuestionMock.mockResolvedValue({ ok: true });
    finishMock.mockResolvedValue({ ok: true, redirectTo: "" });
    markComparativeStartedMock.mockResolvedValue({ ok: true });
  });

  it("starts on the first required pending question after reload", () => {
    expect(getInitialCtlQuestionIndex(mobileDefinition, { Q1_SELECT: "A" })).toBe(1);
  });

  it("blocks next when the required answer is empty", () => {
    renderMobileCapture();

    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));

    expect(screen.getByRole("dialog", { name: "Falta responder esta pregunta" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Entendido" })).toBeInTheDocument();
    expect(saveQuestionMock).not.toHaveBeenCalled();
  });

  it("saves the current question before advancing", async () => {
    renderMobileCapture();

    fireEvent.click(screen.getByRole("button", { name: "Opcion A" }));
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));

    await waitFor(() => expect(saveQuestionMock).toHaveBeenCalledTimes(1));
    expect(saveQuestionMock.mock.calls[0]?.[0]).toBe("FMASCULINA-NAVIGO-2026");
    expect(saveQuestionMock.mock.calls[0]?.[1]).toBe("session-1");
    expect(saveQuestionMock.mock.calls[0]?.[2]).toBe("Q1_SELECT");
    expect((saveQuestionMock.mock.calls[0]?.[3] as FormData).get("Q1_SELECT")).toBe("A");
    expect(await screen.findByText("Pregunta 2 de 3")).toBeInTheDocument();
  });

  it("scrolls to the top of the capture when advancing to the next question", async () => {
    renderMobileCapture();

    fireEvent.click(screen.getByRole("button", { name: "Opcion A" }));
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));

    await screen.findByText("Pregunta 2 de 3");
    await waitFor(() =>
      expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: "smooth", block: "start" })
    );
    expect(saveQuestionMock).toHaveBeenCalledTimes(1);
  });

  it("scrolls to the top of the capture when going back to the previous question", () => {
    renderMobileCapture({ answers: { Q1_SELECT: "A" } });

    fireEvent.click(screen.getByRole("button", { name: "Anterior" }));

    expect(screen.getByText("Pregunta 1 de 3")).toBeInTheDocument();
    expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  });

  it("scrolls to the top of the capture when moving into a new section", async () => {
    renderMobileCapture({ definition: triangularInstructionDefinition });

    fireEvent.click(screen.getByRole("button", { name: "A" }));
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));

    await screen.findByText("Pregunta 2 de 4");
    scrollIntoViewMock.mockReset();

    fireEvent.click(screen.getByRole("button", { name: "Buena" }));
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));

    await screen.findByText("Pregunta 3 de 4");
    expect(screen.getByText("TRIANGULAR 2")).toBeInTheDocument();
    expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  });

  it("renders SCALE as vertical options with number and full text", async () => {
    renderMobileCapture({ answers: { Q1_SELECT: "A" } });

    expect(screen.getByRole("button", { name: "1 - Muy mala" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "5 - Excelente" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "5 - Excelente" }));
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));

    await waitFor(() => expect(saveQuestionMock).toHaveBeenCalledTimes(1));
    expect(saveQuestionMock.mock.calls[0]?.[2]).toBe("Q2_SCALE");
    expect((saveQuestionMock.mock.calls[0]?.[3] as FormData).get("Q2_SCALE")).toBe("5");
  });

  it.each([
    ["33", "30 a 45 años", "2"],
    ["28", "29 años o menos", "1"],
    ["60", "56 años o más", "4"]
  ])("preselects the F2 operational range for age %s", async (age, expectedLabel, expectedRangeCode) => {
    renderMobileCapture({ definition: ageDefinition });

    fireEvent.change(screen.getByLabelText("Edad exacta"), { target: { value: age } });

    expect(screen.getByRole("button", { name: new RegExp(expectedLabel) })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Revisar respuestas" }));

    await waitFor(() => expect(saveQuestionMock).toHaveBeenCalledTimes(1));
    const formData = saveQuestionMock.mock.calls[0]?.[3] as FormData;
    expect(formData.get("F2.exactAge")).toBe(age);
    expect(formData.get("F2.rangeCode")).toBe(expectedRangeCode);
  });

  it("warns when the confirmed F2 range does not match the exact age", () => {
    renderMobileCapture({ definition: ageDefinition });

    fireEvent.change(screen.getByLabelText("Edad exacta"), { target: { value: "33" } });
    fireEvent.click(screen.getByRole("button", { name: "29 años o menos" }));

    expect(screen.getByText("El rango seleccionado no coincide con la edad capturada. Corrige el rango antes de continuar.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Revisar respuestas" }));

    expect(screen.getByRole("dialog", { name: "Falta responder esta pregunta" })).toBeInTheDocument();
    expect(screen.getAllByText("El rango operativo no coincide con la edad capturada.")).toHaveLength(2);
    expect(saveQuestionMock).not.toHaveBeenCalled();
  });

  it("shows a matrix scale reminder every five randomized attributes", () => {
    renderMobileCapture({
      answers: { Q1_SELECT: "A", Q2_SCALE: 5 },
      definition: matrixReminderDefinition
    });

    expect(screen.getByText("ENCUESTADOR: POR FAVOR HAGA EL RECORDATORIO DE ESCALA AL PANELISTA")).toBeInTheDocument();
    expect(screen.getByText("1 - En desacuerdo · 2 - De acuerdo")).toBeInTheDocument();
    expect(screen.getAllByText("ENCUESTADOR: POR FAVOR HAGA EL RECORDATORIO DE ESCALA AL PANELISTA")).toHaveLength(1);
  });

  it("renders MATRIX by row and saves grouped values", async () => {
    renderMobileCapture({ answers: { Q1_SELECT: "A", Q2_SCALE: 5 } });

    fireEvent.click(screen.getByRole("button", { name: "Limpia: 2 - De acuerdo" }));
    fireEvent.click(screen.getByRole("button", { name: "Masculina: 1 - En desacuerdo" }));
    fireEvent.click(screen.getByRole("button", { name: "Revisar respuestas" }));

    await waitFor(() => expect(saveQuestionMock).toHaveBeenCalledTimes(1));
    const formData = saveQuestionMock.mock.calls[0]?.[3] as FormData;
    expect(saveQuestionMock.mock.calls[0]?.[2]).toBe("Q3_MATRIX");
    expect(formData.get("Q3_MATRIX.LIMPIA")).toBe("2");
    expect(formData.get("Q3_MATRIX.MASCULINA")).toBe("1");
  });

  it("renders yes/no matrix answers without internal codes and saves values 1/2", async () => {
    renderMobileCapture({ definition: binaryMatrixDefinition });

    expect(screen.getByRole("button", { name: "Floral: Sí" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Floral: No" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Floral: 1 - Sí" })).not.toBeInTheDocument();
    expect(screen.queryByText("ENCUESTADOR: POR FAVOR HAGA EL RECORDATORIO DE ESCALA AL PANELISTA")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Floral: Sí" }));
    fireEvent.click(screen.getByRole("button", { name: "Amaderada: No" }));
    fireEvent.click(screen.getByRole("button", { name: "Cítrica: Sí" }));
    fireEvent.click(screen.getByRole("button", { name: "Dulce: No" }));
    fireEvent.click(screen.getByRole("button", { name: "Marina: Sí" }));
    fireEvent.click(screen.getByRole("button", { name: "Herbal: No" }));
    fireEvent.click(screen.getByRole("button", { name: "Revisar respuestas" }));

    await waitFor(() => expect(saveQuestionMock).toHaveBeenCalledTimes(1));
    const formData = saveQuestionMock.mock.calls[0]?.[3] as FormData;
    expect(formData.get("P9_BINARY.FLORAL")).toBe("1");
    expect(formData.get("P9_BINARY.AMADERADA")).toBe("2");
  });

  it("renders yes/no scale answers without internal codes while preserving values", async () => {
    renderMobileCapture({ definition: binaryScaleDefinition });

    expect(screen.getByRole("button", { name: "Sí" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "No" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "1 - Sí" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sí" }));
    fireEvent.click(screen.getByRole("button", { name: "Revisar respuestas" }));

    await waitFor(() => expect(saveQuestionMock).toHaveBeenCalledTimes(1));
    expect((saveQuestionMock.mock.calls[0]?.[3] as FormData).get("Q_BINARY_SCALE")).toBe("1");
  });

  it("finishes CTL when all required answers are complete", async () => {
    renderMobileCapture({
      answers: {
        Q1_SELECT: "A",
        Q2_SCALE: 5,
        Q3_MATRIX: {
          LIMPIA: "2",
          MASCULINA: "1"
        }
      }
    });

    fireEvent.click(screen.getByRole("button", { name: "Revisar respuestas" }));
    await waitFor(() => expect(saveQuestionMock).toHaveBeenCalledTimes(1));
    fireEvent.click(await screen.findByRole("button", { name: "Finalizar CTL" }));

    await waitFor(() => expect(finishMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("¡Muchas gracias por su participación! Su entrevista CLT ha finalizado.")).toBeInTheDocument();
  });

  it("does not show the final CLT message before completion", () => {
    renderMobileCapture();

    expect(screen.queryByText(/Su entrevista CLT ha finalizado/)).not.toBeInTheDocument();
  });

  it("reports pending required questions before finalization", () => {
    expect(getPendingCtlQuestionCodes(mobileDefinition, { Q1_SELECT: "A" })).toEqual([
      "Q2_SCALE",
      "Q3_MATRIX"
    ]);
  });

  it("renders instructions and dynamic participant references", () => {
    renderMobileCapture();

    expect(screen.getByText("Lee esta instruccion de seccion.")).toBeInTheDocument();
    expect(screen.getByText(/Participante ANA PEREZ/)).toBeInTheDocument();
    expect(screen.getByText("Primera fragancia:")).toBeInTheDocument();
    expect(screen.getByText("247")).toBeInTheDocument();
  });

  it("shows the P14 evaluation order using confirmed products before rotation fallback", () => {
    renderMobileCapture({
      answers: {
        EVA1_CONFIRMED_PRODUCT: "583",
        EVA2_CONFIRMED_PRODUCT: "247"
      },
      definition: contextualAnswerDefinition
    });

    expect(screen.getByText("Orden de evaluación")).toBeInTheDocument();
    expect(screen.getByText((_content, element) => element?.textContent === "Primero: 583")).toBeInTheDocument();
    expect(screen.getByText((_content, element) => element?.textContent === "Segundo: 247")).toBeInTheDocument();
  });

  it("shows previous coded answers as their visible option labels", () => {
    renderMobileCapture({
      answers: { P14: "2" },
      definition: contextualAnswerDefinition
    });

    expect(screen.getByText("Razones de La segunda fragancia")).toBeInTheDocument();
    expect(screen.getAllByText((_content, element) =>
      element?.tagName === "P" && element.textContent === "Respuesta P14: La segunda fragancia"
    )).toHaveLength(1);
    expect(screen.queryAllByText((_content, element) =>
      element?.tagName === "P" && element.textContent === "Respuesta P14: 2"
    )).toHaveLength(0);
  });

  it("falls back to the stored value when a previous coded answer has no label", () => {
    renderMobileCapture({
      answers: { P14: "99" },
      definition: contextualAnswerDefinition
    });

    expect(screen.getByText("Razones de 99")).toBeInTheDocument();
    expect(screen.getAllByText((_content, element) =>
      element?.tagName === "P" && element.textContent === "Respuesta P14: 99"
    )).toHaveLength(1);
  });

  it("shows automatic CTL times as information and skips them as editable questions", () => {
    renderMobileCapture({
      completedAtLabel: "01:26 a.m.",
      definition: automaticTimesDefinition,
      startedAtLabel: "12:26 a.m.",
      todayLabel: "08/08/2026"
    });

    expect(screen.getByText("Datos automaticos CTL")).toBeInTheDocument();
    expect(screen.getByText("08/08/2026")).toBeInTheDocument();
    expect(screen.getByText("12:26 a.m.")).toBeInTheDocument();
    expect(screen.getByText("01:26 a.m.")).toBeInTheDocument();
    expect(screen.getByText("Pregunta 1 de 1")).toBeInTheDocument();
    expect(screen.getByText("Pregunta manual")).toBeInTheDocument();
    expect(screen.queryByText("DG_HORA_TERMINO")).not.toBeInTheDocument();
    expect(screen.queryByText(/Hora termino CTL/)).not.toBeInTheDocument();
  });

  it("shows calculated NSE as a result block and skips NSE result fields as editable questions", () => {
    renderMobileCapture({
      answers: {
        D1_ESCOLARIDAD_JEFE_HOGAR: "8",
        D2_BANOS_COMPLETOS: "1",
        D3_AUTOS: "1",
        D4_INTERNET: "1",
        D5_PERSONAS_TRABAJARON: "1",
        D6_CUARTOS_DORMIR: "2"
      },
      definition: nseDefinition
    });

    expect(screen.getByText("NSE calculado")).toBeInTheDocument();
    expect(screen.getByText("Total de puntos NSE")).toBeInTheDocument();
    expect(screen.getByText("168")).toBeInTheDocument();
    expect(screen.getByText("Nivel NSE (letra)")).toBeInTheDocument();
    expect(screen.getByText("C+")).toBeInTheDocument();
    expect(screen.getByText("Clasificacion NSE (numero)")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.queryByText("TOTAL de puntos NSE")).not.toBeInTheDocument();
    expect(screen.queryByText("Registrar NSE de acuerdo al puntaje")).not.toBeInTheDocument();
  });

  it("warns when NSE cannot be calculated because demographic answers are incomplete", () => {
    renderMobileCapture({ definition: nseDefinition });

    expect(screen.getByText("NSE calculado")).toBeInTheDocument();
    expect(screen.getByText("Faltan datos demograficos para calcular NSE.")).toBeInTheDocument();
    expect(screen.getAllByText(/D1_ESCOLARIDAD_JEFE_HOGAR/).length).toBeGreaterThan(0);
  });

  it("renders P1 with triangular 1 keys from the participant rotation", () => {
    renderMobileCapture({ definition: triangularDefinition });

    expect(screen.getByRole("button", { name: "247" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "583" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "912" })).toBeInTheDocument();
    expect(screen.queryByText("SECRET-1")).not.toBeInTheDocument();
  });

  it("renders P3 with triangular 2 keys from the participant rotation", () => {
    renderMobileCapture({
      answers: {
        P1: {
          correct: 1,
          selectedKey: "583",
          selectedPosition: "PR2"
        }
      },
      definition: triangularDefinition
    });

    expect(screen.getByText("Pregunta 2 de 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "835" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "724" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "555" })).toBeInTheDocument();
    expect(screen.queryByText("SECRET-2")).not.toBeInTheDocument();
  });

  it("saves triangular answers as selected position from dynamic key buttons", async () => {
    renderMobileCapture({ definition: triangularDefinition });

    fireEvent.click(screen.getByRole("button", { name: "583" }));
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));

    await waitFor(() => expect(saveQuestionMock).toHaveBeenCalledTimes(1));
    expect(saveQuestionMock.mock.calls[0]?.[2]).toBe("P1");
    expect((saveQuestionMock.mock.calls[0]?.[3] as FormData).get("P1")).toBe("PR2");
  });

  it("saves triangular strip delivery confirmation from the assigned rotation", async () => {
    renderMobileCapture({ definition: triangularConfirmationDefinition });

    expect(screen.getByText("247")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar 247" }));
    fireEvent.click(screen.getByRole("button", { name: "Revisar respuestas" }));

    await waitFor(() => expect(saveQuestionMock).toHaveBeenCalledTimes(1));
    expect(saveQuestionMock.mock.calls[0]?.[2]).toBe("TRI1_CONFIRMED_POS1");
    expect((saveQuestionMock.mock.calls[0]?.[3] as FormData).get("TRI1_CONFIRMED_POS1")).toBe("247");
  });

  it("saves product application confirmation from the assigned rotation", async () => {
    renderMobileCapture({ definition: productConfirmationDefinition });

    expect(screen.getByText("247")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar 247" }));
    fireEvent.click(screen.getByRole("button", { name: "Revisar respuestas" }));

    await waitFor(() => expect(saveQuestionMock).toHaveBeenCalledTimes(1));
    expect(saveQuestionMock.mock.calls[0]?.[2]).toBe("EVA1_CONFIRMED_PRODUCT");
    expect((saveQuestionMock.mock.calls[0]?.[3] as FormData).get("EVA1_CONFIRMED_PRODUCT")).toBe("247");
  });

  it("shows triangular section instructions only on the first question of each section", async () => {
    renderMobileCapture({ definition: triangularInstructionDefinition });

    expect(screen.getAllByText("ENTREVISTADOR: IR A LA MESA DE CONTROL POR LAS TRES PRIMERAS TIRAS.")).toHaveLength(1);
    expect(screen.getByText("MOSTRAR Y LEER TARJETA.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "A" }));
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));

    await screen.findByText("Pregunta 2 de 4");
    expect(screen.queryByText("ENTREVISTADOR: IR A LA MESA DE CONTROL POR LAS TRES PRIMERAS TIRAS.")).not.toBeInTheDocument();
    expect(screen.getByText("LEER PREGUNTA DE SEGUIMIENTO.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Buena" }));
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));

    await screen.findByText("Pregunta 3 de 4");
    expect(screen.getAllByText("ENTREVISTADOR: IR A LA MESA DE CONTROL POR LAS TRES SEGUNDAS TIRAS.")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "A" }));
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));

    await screen.findByText("Pregunta 4 de 4");
    expect(screen.queryByText("ENTREVISTADOR: IR A LA MESA DE CONTROL POR LAS TRES SEGUNDAS TIRAS.")).not.toBeInTheDocument();
  });

  it("does not require CTL phase codes before showing fragrance evaluation questions", () => {
    renderMobileCapture({
      definition: phaseDefinition,
      phaseProgress: [
        {
          arm: "IZQUIERDO",
          phase: "COLOCACION",
          productCode: "247",
          referenceCodeSlot: 1,
          status: "IN_PROGRESS",
          validatedAt: null
        },
        {
          arm: "DERECHO",
          phase: "EVALUACION_1",
          productCode: "583",
          referenceCodeSlot: 2,
          status: "PENDING",
          validatedAt: null
        },
        {
          arm: null,
          phase: "EVALUACION_2",
          productCode: "583",
          referenceCodeSlot: 3,
          status: "PENDING",
          validatedAt: null
        }
      ]
    });

    expect(screen.queryByText("Fase operativa")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Codigo de fase")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Validar codigo" })).not.toBeInTheDocument();
    expect(screen.getByText("Gusto primera fragancia")).toBeInTheDocument();
  });

  it("shows fragrance section logistics only at the start of each fragrance section", async () => {
    renderMobileCapture({ definition: fragranceInstructionDefinition });

    expect(screen.getAllByText(PRIMERA_FRAGANCIA_INSTRUCTION)).toHaveLength(1);
    expect(screen.getAllByText(VERIFY_FRAGRANCE_INSTRUCTION)).toHaveLength(1);
    expect(screen.getByText("MOSTRAR Y LEER TARJETA.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "1 - Valor 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));

    await screen.findByText("Pregunta 2 de 4");
    expect(screen.queryByText(PRIMERA_FRAGANCIA_INSTRUCTION)).not.toBeInTheDocument();
    expect(screen.queryByText(VERIFY_FRAGRANCE_INSTRUCTION)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "1 - Valor 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));

    await screen.findByText("Pregunta 3 de 4");
    expect(screen.getAllByText(SEGUNDA_FRAGANCIA_INSTRUCTION)).toHaveLength(1);
    expect(screen.getAllByText(VERIFY_FRAGRANCE_INSTRUCTION)).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "1 - Valor 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));

    await screen.findByText("Pregunta 4 de 4");
    expect(screen.queryByText(SEGUNDA_FRAGANCIA_INSTRUCTION)).not.toBeInTheDocument();
    expect(screen.queryByText(VERIFY_FRAGRANCE_INSTRUCTION)).not.toBeInTheDocument();
  });

  it("shows comparative section instructions once even when duplicated in question instructions", async () => {
    renderMobileCapture({ definition: repeatedComparativeInstructionDefinition });

    expect(screen.getAllByText(COMPARATIVE_SMELL_INSTRUCTION)).toHaveLength(1);
    expect(screen.getByText("P14 comparativa")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Primera" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Siguiente" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));

    await screen.findByText("Pregunta 2 de 2");
    expect(screen.getByText("P15 comparativa")).toBeInTheDocument();
    expect(screen.queryByText(COMPARATIVE_SMELL_INSTRUCTION)).not.toBeInTheDocument();
  });

  it("marks Navigo T0 when the capture enters the 15-minute comparative section", async () => {
    renderMobileCapture({
      definition: comparativeTransitionDefinition
    });

    expect(markComparativeStartedMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Siguiente" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));

    await screen.findByText("P14 comparativa");
    await waitFor(() =>
      expect(markComparativeStartedMock).toHaveBeenCalledWith("FMASCULINA-NAVIGO-2026", "session-1")
    );
  });

  it("keeps operational section instructions scoped to the first question for the full CLT definition", () => {
    const flattened = flattenCtlQuestions(getCtlDefinition(), {});
    const sectionsWithInstructions = new Set(
      flattened
        .filter((flatQuestion) => flatQuestion.sectionInstructions?.length)
        .map((flatQuestion) => flatQuestion.sectionTitle)
    );

    expect(sectionsWithInstructions).toEqual(new Set([
      "DATOS GENERALES",
      "SECCIÓN II - TRIANGULAR - 1",
      "SECCIÓN II - TRIANGULAR - 2",
      "SECCIÓN III - EVALUACIÓN DE PRIMERA FRAGANCIA",
      "SECCIÓN IV - EVALUACIÓN DE SEGUNDA FRAGANCIA",
      "SECCIÓN V - COMPARATIVA - 15 MINUTOS",
      "DEMOGRAFICOS"
    ]));

    for (const sectionTitle of sectionsWithInstructions) {
      expect(flattened.filter((flatQuestion) => flatQuestion.sectionTitle === sectionTitle && flatQuestion.sectionInstructions?.length)).toHaveLength(1);
    }
  });
});

function renderMobileCapture({
  answers = {},
  completedAtLabel,
  definition = mobileDefinition,
  phaseProgress = [],
  startedAtLabel,
  todayLabel
}: {
  answers?: Record<string, unknown>;
  completedAtLabel?: string | null;
  definition?: CtlDefinition;
  phaseProgress?: React.ComponentProps<typeof CtlMobileCapture>["phaseProgress"];
  startedAtLabel?: string | null;
  todayLabel?: string;
} = {}) {
  render(
    <CtlMobileCapture
      answers={answers}
      completedAtLabel={completedAtLabel}
      definition={definition}
      participant={{
        firstSampleKey: "247",
        folio: "NAV-001",
        name: "ANA PEREZ",
        secondSampleKey: "583",
        triangularRotation: {
          triangular1: {
            pr1: "247",
            pr2: "583",
            pr3: "912"
          },
          triangular2: {
            pr1: "835",
            pr2: "724",
            pr3: "555"
          }
        }
      }}
      readOnly={false}
      sessionId="session-1"
      studyCode="FMASCULINA-NAVIGO-2026"
      phaseProgress={phaseProgress}
      startedAtLabel={startedAtLabel}
      todayLabel={todayLabel}
    />
  );
}

const mobileDefinition: CtlDefinition = {
  sections: [
    {
      id: "INTRO",
      instructions: [
        {
          text: "Lee esta instruccion de seccion.",
          title: "INSTRUCCION",
          type: "SECTION"
        }
      ],
      questions: [
        {
          code: "Q1_SELECT",
          displayTemplate: "Participante {{PARTICIPANT_NAME}}: selecciona una opcion",
          label: "Selecciona una opcion",
          options: [
            { label: "Opcion A", value: "A" },
            { label: "Opcion B", value: "B" }
          ],
          references: [{ label: "Primera fragancia", source: "FIRST_SAMPLE" }],
          required: true,
          type: "SELECT"
        },
        {
          code: "Q2_SCALE",
          labels: {
            1: "Muy mala",
            2: "Mala",
            3: "Regular",
            4: "Buena",
            5: "Excelente"
          },
          label: "Califica la fragancia",
          max: 5,
          min: 1,
          required: true,
          type: "SCALE"
        },
        {
          code: "Q3_MATRIX",
          columns: [
            { label: "En desacuerdo", value: 1 },
            { label: "De acuerdo", value: 2 }
          ],
          label: "Atributos",
          randomizeRows: true,
          required: true,
          rows: [
            { code: "LIMPIA", label: "Limpia" },
            { code: "MASCULINA", label: "Masculina" }
          ],
          type: "MATRIX"
        }
      ],
      title: "Seccion inicial"
    }
  ],
  version: 2
};

const automaticTimesDefinition: CtlDefinition = {
  sections: [
    {
      id: "DATOS_GENERALES",
      questions: [
        {
          captureMode: "AUTO",
          code: "DG_HORA_INICIO",
          displayTemplate: "Hora inicio CTL: {{CTL_STARTED_AT}}",
          label: "Hora inicio",
          required: false,
          type: "SHORT_TEXT"
        },
        {
          captureMode: "AUTO",
          code: "DG_HORA_TERMINO",
          displayTemplate: "Hora termino CTL: {{CTL_COMPLETED_AT}}",
          label: "Hora termino",
          required: false,
          type: "SHORT_TEXT"
        },
        {
          code: "DG_DIRECCION",
          label: "Pregunta manual",
          required: true,
          type: "SHORT_TEXT"
        }
      ],
      title: "Datos generales"
    }
  ],
  version: 2
};

const nseOptions = {
  D1_ESCOLARIDAD_JEFE_HOGAR: [
    { label: "Licenciatura completa (59 puntos)", value: "8" }
  ],
  D2_BANOS_COMPLETOS: [
    { label: "1 bano completo (24 puntos)", value: "1" }
  ],
  D3_AUTOS: [
    { label: "1 auto (22 puntos)", value: "1" }
  ],
  D4_INTERNET: [
    { label: "Si tiene (32 puntos)", value: "1" }
  ],
  D5_PERSONAS_TRABAJARON: [
    { label: "1 persona (15 puntos)", value: "1" }
  ],
  D6_CUARTOS_DORMIR: [
    { label: "2 cuartos (16 puntos)", value: "2" }
  ]
} as const;

const nseDefinition: CtlDefinition = {
  sections: [
    {
      id: "DEMOGRAFICOS",
      questions: [
        ...Object.entries(nseOptions).map(([code, options]) => ({
          code,
          label: code,
          options: [...options],
          required: true,
          type: "SELECT" as const
        })),
        {
          captureMode: "AUTO",
          code: "D_TOTAL_PUNTOS_NSE",
          label: "TOTAL de puntos NSE",
          required: false,
          type: "SHORT_TEXT"
        },
        {
          captureMode: "AUTO",
          code: "D_NSE_CLASIFICACION",
          label: "Registrar NSE de acuerdo al puntaje",
          options: [
            { label: "A/B", value: "A_B" },
            { label: "C+", value: "C_PLUS" },
            { label: "C tipico", value: "C_TIPICO" },
            { label: "C-", value: "C_MINUS" },
            { label: "D+", value: "D_PLUS" },
            { label: "D", value: "D" },
            { label: "E", value: "E" }
          ],
          required: false,
          type: "SELECT"
        }
      ],
      title: "DEMOGRAFICOS"
    }
  ],
  version: 2
};

const ageDefinition: CtlDefinition = {
  sections: [
    {
      id: "FILTROS",
      questions: [
        {
          code: "F2",
          label: "F2. Edad exacta",
          required: true,
          type: "SHORT_TEXT"
        }
      ],
      title: "Filtros"
    }
  ],
  version: 2
};

const matrixReminderDefinition: CtlDefinition = {
  sections: [
    {
      id: "INTRO",
      questions: [
        {
          code: "Q1_SELECT",
          label: "Selecciona una opcion",
          options: [
            { label: "Opcion A", value: "A" },
            { label: "Opcion B", value: "B" }
          ],
          required: true,
          type: "SELECT"
        },
        {
          code: "Q2_SCALE",
          label: "Califica la fragancia",
          max: 5,
          min: 1,
          required: true,
          type: "SCALE"
        },
        {
          code: "Q3_MATRIX",
          columns: [
            { label: "En desacuerdo", value: 1 },
            { label: "De acuerdo", value: 2 }
          ],
          label: "Atributos",
          randomizeRows: true,
          required: true,
          rows: [
            { code: "LIMPIA", label: "Limpia" },
            { code: "MASCULINA", label: "Masculina" },
            { code: "FRESCA", label: "Fresca" },
            { code: "SEDUCTORA", label: "Seductora" },
            { code: "ATEMPORAL", label: "Atemporal" },
            { code: "ATRACTIVA", label: "Atractiva" }
          ],
          type: "MATRIX"
        }
      ],
      title: "Seccion inicial"
    }
  ],
  version: 2
};

const binaryMatrixDefinition: CtlDefinition = {
  sections: [
    {
      id: "BINARIA",
      questions: [
        {
          code: "P9_BINARY",
          columns: [
            { label: "Sí", value: 1 },
            { label: "No", value: 2 }
          ],
          label: "Atributos binarios",
          randomizeRows: false,
          required: true,
          rows: [
            { code: "FLORAL", label: "Floral" },
            { code: "AMADERADA", label: "Amaderada" },
            { code: "CITRICA", label: "Cítrica" },
            { code: "DULCE", label: "Dulce" },
            { code: "MARINA", label: "Marina" },
            { code: "HERBAL", label: "Herbal" }
          ],
          type: "MATRIX"
        }
      ],
      title: "Binaria"
    }
  ],
  version: 2
};

const binaryScaleDefinition: CtlDefinition = {
  sections: [
    {
      id: "BINARIA",
      questions: [
        {
          code: "Q_BINARY_SCALE",
          label: "Pregunta binaria",
          labels: {
            1: "Sí",
            2: "No"
          },
          max: 2,
          min: 1,
          required: true,
          type: "SCALE"
        }
      ],
      title: "Binaria"
    }
  ],
  version: 2
};

const contextualAnswerDefinition: CtlDefinition = {
  sections: [
    {
      id: "COMPARATIVA",
      questions: [
        {
          code: "P14",
          label: "Preferencia",
          options: [
            { label: "La primera fragancia", value: "1" },
            { label: "La segunda fragancia", value: "2" },
            { label: "Ambas", value: "3" },
            { label: "Ninguna", value: "4" }
          ],
          required: true,
          type: "SELECT"
        },
        {
          code: "P14A",
          displayTemplate: "Razones de {{P14}}",
          label: "Razones",
          references: [{ label: "Respuesta P14", source: "P14" }],
          required: true,
          type: "LONG_TEXT"
        }
      ],
      title: "Comparativa"
    }
  ],
  version: 2
};

const COMPARATIVE_SMELL_INSTRUCTION = "POR FAVOR HUELA AMBOS ANTEBRAZOS Y RESPONDA LAS SIGUIENTES PREGUNTAS.";

const repeatedComparativeInstructionDefinition: CtlDefinition = {
  sections: [
    {
      id: "COMPARATIVA_15_MIN",
      instructions: [
        {
          text: COMPARATIVE_SMELL_INSTRUCTION,
          title: "INSTRUCCION",
          type: "SECTION"
        }
      ],
      questions: [
        {
          code: "P14",
          instructions: [
            {
              text: COMPARATIVE_SMELL_INSTRUCTION,
              title: "INSTRUCCION",
              type: "BEFORE_QUESTION"
            }
          ],
          label: "P14 comparativa",
          options: [
            { label: "Primera", value: "1" },
            { label: "Segunda", value: "2" }
          ],
          required: true,
          type: "SELECT"
        },
        {
          code: "P15",
          instructions: [
            {
              text: COMPARATIVE_SMELL_INSTRUCTION,
              title: "INSTRUCCION",
              type: "BEFORE_QUESTION"
            }
          ],
          label: "P15 comparativa",
          options: [
            { label: "Primera", value: "1" },
            { label: "Segunda", value: "2" }
          ],
          required: true,
          type: "SELECT"
        }
      ],
      title: "SECCIÓN V - COMPARATIVA - 15 MINUTOS"
    }
  ],
  version: 2
};

const comparativeTransitionDefinition: CtlDefinition = {
  sections: [
    {
      id: "INTRO",
      questions: [
        {
          code: "Q1_SELECT",
          label: "Pregunta previa",
          options: [{ label: "Continuar", value: "A" }],
          required: true,
          type: "SELECT"
        }
      ],
      title: "Intro"
    },
    {
      id: "COMPARATIVA_15_MIN",
      questions: [
        {
          code: "P14",
          label: "P14 comparativa",
          options: [{ label: "Primera", value: "1" }],
          required: true,
          type: "SELECT"
        }
      ],
      title: "SECCION V - COMPARATIVA - 15 MINUTOS"
    }
  ],
  version: 2
};

const triangularDefinition: CtlDefinition = {
  sections: [
    {
      id: "TRIANGULAR",
      questions: [
        {
          code: "P1",
          label: "Triangular 1",
          options: [
            { label: "{{TRIANGULAR_1_PR1}}", value: "PR1" },
            { label: "{{TRIANGULAR_1_PR2}}", value: "PR2" },
            { label: "{{TRIANGULAR_1_PR3}}", value: "PR3" }
          ],
          required: true,
          type: "SELECT"
        },
        {
          code: "P3",
          label: "Triangular 2",
          options: [
            { label: "{{TRIANGULAR_2_PR1}}", value: "PR1" },
            { label: "{{TRIANGULAR_2_PR2}}", value: "PR2" },
            { label: "{{TRIANGULAR_2_PR3}}", value: "PR3" }
          ],
          required: true,
          type: "SELECT"
        }
      ],
      title: "Triangular"
    }
  ],
  version: 2
};

const triangularConfirmationDefinition: CtlDefinition = {
  sections: [
    {
      id: "TRIANGULAR_1",
      questions: [
        {
          code: "TRI1_CONFIRMED_POS1",
          label: "Confirmacion tira {{TRIANGULAR_1_PR1}}",
          required: true,
          type: "SHORT_TEXT"
        }
      ],
      title: "Triangular 1"
    }
  ],
  version: 2
};

const productConfirmationDefinition: CtlDefinition = {
  sections: [
    {
      id: "FRAGRANCIA_1",
      questions: [
        {
          code: "EVA1_CONFIRMED_PRODUCT",
          label: "Confirmacion producto {{FIRST_SAMPLE}}",
          required: true,
          type: "SHORT_TEXT"
        }
      ],
      title: "Evaluacion primera fragancia"
    }
  ],
  version: 2
};

const triangularInstructionDefinition: CtlDefinition = {
  sections: [
    {
      id: "TRIANGULAR_1",
      instructions: [
        {
          text: "ENTREVISTADOR: IR A LA MESA DE CONTROL POR LAS TRES PRIMERAS TIRAS.",
          title: "INSTRUCCION OPERATIVA",
          type: "SECTION"
        }
      ],
      questions: [
        {
          code: "T1_P1",
          instructions: [{ text: "MOSTRAR Y LEER TARJETA.", type: "BEFORE_QUESTION" }],
          label: "Triangular 1 identificacion",
          options: [
            { label: "A", value: "A" },
            { label: "B", value: "B" }
          ],
          required: true,
          type: "SELECT"
        },
        {
          code: "T1_P2",
          instructions: [{ text: "LEER PREGUNTA DE SEGUIMIENTO.", type: "BEFORE_QUESTION" }],
          label: "Triangular 1 evaluacion",
          options: [
            { label: "Buena", value: "BUENA" },
            { label: "Mala", value: "MALA" }
          ],
          required: true,
          type: "SELECT"
        }
      ],
      title: "TRIANGULAR 1"
    },
    {
      id: "TRIANGULAR_2",
      instructions: [
        {
          text: "ENTREVISTADOR: IR A LA MESA DE CONTROL POR LAS TRES SEGUNDAS TIRAS.",
          title: "INSTRUCCION OPERATIVA",
          type: "SECTION"
        }
      ],
      questions: [
        {
          code: "T2_P1",
          label: "Triangular 2 identificacion",
          options: [
            { label: "A", value: "A" },
            { label: "B", value: "B" }
          ],
          required: true,
          type: "SELECT"
        },
        {
          code: "T2_P2",
          label: "Triangular 2 evaluacion",
          options: [
            { label: "Buena", value: "BUENA" },
            { label: "Mala", value: "MALA" }
          ],
          required: true,
          type: "SELECT"
        }
      ],
      title: "TRIANGULAR 2"
    }
  ],
  version: 2
};

const phaseDefinition: CtlDefinition = {
  sections: [
    {
      id: "FRAGRANCIA_1",
      questions: [
        {
          code: "P5A_GUSTO_M1",
          label: "Gusto primera fragancia",
          max: 7,
          min: 1,
          required: true,
          type: "SCALE"
        }
      ],
      title: "Evaluacion primera fragancia"
    }
  ],
  version: 2
};

const PRIMERA_FRAGANCIA_INSTRUCTION =
  "ENTREVISTADOR: LLEVAR AL ENTREVISTADO A LA MESA DE CONTROL PARA QUE LE APLIQUEN LA PRIMERA FRAGANCIA EN EL BRAZO IZQUIERDO.";
const SEGUNDA_FRAGANCIA_INSTRUCTION =
  "ENTREVISTADOR: LLEVAR AL ENTREVISTADO A LA MESA DE CONTROL PARA QUE LE APLIQUEN LA SEGUNDA FRAGANCIA EN EL BRAZO DERECHO.";
const VERIFY_FRAGRANCE_INSTRUCTION =
  "ENTREVISTADOR: VERIFICAR QUE LA CLAVE A EVALUAR COINCIDE CON LA CARATULA DE ROTACION. DESPUES APLIQUE LA CLAVE A EVALUAR AL ENTREVISTADO.";

const fragranceInstructionDefinition: CtlDefinition = {
  sections: [
    {
      id: "FRAGRANCIA_1",
      description: PRIMERA_FRAGANCIA_INSTRUCTION,
      instructions: [
        {
          text: VERIFY_FRAGRANCE_INSTRUCTION,
          title: "INSTRUCCION OPERATIVA",
          type: "SECTION"
        }
      ],
      questions: [
        {
          code: "P5A_GUSTO_M1",
          instructions: [{ text: "MOSTRAR Y LEER TARJETA.", type: "BEFORE_QUESTION" }],
          label: "Gusto primera fragancia",
          max: 7,
          min: 1,
          required: true,
          type: "SCALE"
        },
        {
          code: "P6A_INTENSIDAD_M1",
          label: "Intensidad primera fragancia",
          max: 7,
          min: 1,
          required: true,
          type: "SCALE"
        }
      ],
      title: "Evaluacion primera fragancia"
    },
    {
      id: "FRAGRANCIA_2",
      description: SEGUNDA_FRAGANCIA_INSTRUCTION,
      instructions: [
        {
          text: VERIFY_FRAGRANCE_INSTRUCTION,
          title: "INSTRUCCION OPERATIVA",
          type: "SECTION"
        }
      ],
      questions: [
        {
          code: "P5B_GUSTO_M2",
          label: "Gusto segunda fragancia",
          max: 7,
          min: 1,
          required: true,
          type: "SCALE"
        },
        {
          code: "P6B_INTENSIDAD_M2",
          label: "Intensidad segunda fragancia",
          max: 7,
          min: 1,
          required: true,
          type: "SCALE"
        }
      ],
      title: "Evaluacion segunda fragancia"
    }
  ],
  version: 2
};
