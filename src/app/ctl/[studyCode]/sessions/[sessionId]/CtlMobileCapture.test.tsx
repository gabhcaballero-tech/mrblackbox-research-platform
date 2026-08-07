import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CtlDefinition } from "@/modules/ctl/definition";
import {
  CtlMobileCapture,
  getInitialCtlQuestionIndex,
  getPendingCtlQuestionCodes
} from "./CtlMobileCapture";
import {
  finishPublicCtlSessionAction,
  savePublicCtlQuestionAnswerAction
} from "@/modules/ctl/public-actions";

vi.mock("@/modules/ctl/public-actions", () => ({
  finishPublicCtlSessionAction: vi.fn(),
  savePublicCtlQuestionAnswerAction: vi.fn()
}));

const saveQuestionMock = vi.mocked(savePublicCtlQuestionAnswerAction);
const finishMock = vi.mocked(finishPublicCtlSessionAction);

describe("CtlMobileCapture", () => {
  beforeEach(() => {
    saveQuestionMock.mockReset();
    finishMock.mockReset();
    saveQuestionMock.mockResolvedValue({ ok: true });
    finishMock.mockResolvedValue({ ok: true, redirectTo: "" });
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

  it("renders SCALE as large buttons and saves numeric value", async () => {
    renderMobileCapture({ answers: { Q1_SELECT: "A" } });

    fireEvent.click(screen.getByRole("button", { name: "5" }));
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));

    await waitFor(() => expect(saveQuestionMock).toHaveBeenCalledTimes(1));
    expect(saveQuestionMock.mock.calls[0]?.[2]).toBe("Q2_SCALE");
    expect((saveQuestionMock.mock.calls[0]?.[3] as FormData).get("Q2_SCALE")).toBe("5");
  });

  it("renders MATRIX by row and saves grouped values", async () => {
    renderMobileCapture({ answers: { Q1_SELECT: "A", Q2_SCALE: 5 } });

    fireEvent.click(screen.getByRole("button", { name: "Limpia: De acuerdo" }));
    fireEvent.click(screen.getByRole("button", { name: "Masculina: En desacuerdo" }));
    fireEvent.click(screen.getByRole("button", { name: "Revisar respuestas" }));

    await waitFor(() => expect(saveQuestionMock).toHaveBeenCalledTimes(1));
    const formData = saveQuestionMock.mock.calls[0]?.[3] as FormData;
    expect(saveQuestionMock.mock.calls[0]?.[2]).toBe("Q3_MATRIX");
    expect(formData.get("Q3_MATRIX.LIMPIA")).toBe("2");
    expect(formData.get("Q3_MATRIX.MASCULINA")).toBe("1");
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
});

function renderMobileCapture({
  answers = {},
  definition = mobileDefinition
}: {
  answers?: Record<string, unknown>;
  definition?: CtlDefinition;
} = {}) {
  render(
    <CtlMobileCapture
      answers={answers}
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
