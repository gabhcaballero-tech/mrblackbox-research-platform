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

    expect(screen.getByText("Responde la pregunta obligatoria antes de continuar.")).toBeInTheDocument();
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
});

function renderMobileCapture({ answers = {} }: { answers?: Record<string, unknown> } = {}) {
  render(
    <CtlMobileCapture
      answers={answers}
      definition={mobileDefinition}
      participant={{
        folio: "NAV-001",
        name: "ANA PEREZ"
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
