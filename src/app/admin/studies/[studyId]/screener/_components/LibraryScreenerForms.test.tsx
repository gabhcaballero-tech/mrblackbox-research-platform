import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScreenerQuestion } from "@/modules/screener";
import {
  SaveBlockToLibraryForm,
  SaveQuestionToLibraryForm
} from "./LibraryScreenerForms";

const questionLibraryActions = vi.hoisted(() => ({
  insertLibraryRevisionIntoScreenerAction: vi.fn(),
  saveScreenerBlockToLibraryFeedbackAction: vi.fn(),
  saveScreenerQuestionToLibraryFeedbackAction: vi.fn()
}));

vi.mock("@/modules/question-library/actions", () => questionLibraryActions);

const question: ScreenerQuestion = {
  dataDestination: "SCREENING",
  id: "GENERO",
  options: [],
  order: 1,
  required: true,
  text: "Genero",
  type: "SINGLE_CHOICE",
  validation: {}
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
}

describe("LibraryScreenerForms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("muestra confirmacion y enlace al guardar una pregunta en biblioteca", async () => {
    questionLibraryActions.saveScreenerQuestionToLibraryFeedbackAction.mockResolvedValue({
      itemId: "item-1",
      message: "Pregunta guardada correctamente en la biblioteca.",
      ok: true
    });

    render(<SaveQuestionToLibraryForm question={question} readOnly={false} studyId="study-1" />);
    fireEvent.click(screen.getAllByText("Guardar pregunta en biblioteca")[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Guardar pregunta en biblioteca" }));

    expect(
      await screen.findByText("Pregunta guardada correctamente en la biblioteca.")
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Seguir editando screener" })).toHaveAttribute(
      "href",
      "#create-question-panel"
    );
    expect(screen.getByRole("link", { name: "Abrir elemento en biblioteca" })).toHaveAttribute(
      "href",
      "/admin/library/item-1?saved=library"
    );
  });

  it("deshabilita el boton mientras guarda una pregunta", async () => {
    const save = deferred<{
      itemId: string;
      message: string;
      ok: boolean;
    }>();
    questionLibraryActions.saveScreenerQuestionToLibraryFeedbackAction.mockReturnValue(save.promise);

    render(<SaveQuestionToLibraryForm question={question} readOnly={false} studyId="study-1" />);
    fireEvent.click(screen.getAllByText("Guardar pregunta en biblioteca")[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Guardar pregunta en biblioteca" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Guardando..." })).toBeDisabled());

    save.resolve({
      itemId: "item-1",
      message: "Pregunta guardada correctamente en la biblioteca.",
      ok: true
    });

    expect(
      await screen.findByText("Pregunta guardada correctamente en la biblioteca.")
    ).toBeInTheDocument();
  });

  it("muestra confirmacion al guardar un bloque en biblioteca", async () => {
    questionLibraryActions.saveScreenerBlockToLibraryFeedbackAction.mockResolvedValue({
      itemId: "block-1",
      message: "Bloque guardado correctamente en la biblioteca.",
      ok: true
    });

    render(<SaveBlockToLibraryForm questions={[question]} readOnly={false} studyId="study-1" />);
    fireEvent.click(screen.getAllByText("Guardar preguntas seleccionadas como bloque")[0]!);
    fireEvent.click(screen.getByRole("checkbox", { name: /Genero/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Guardar preguntas seleccionadas como bloque" })
    );

    expect(
      await screen.findByText("Bloque guardado correctamente en la biblioteca.")
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Abrir elemento en biblioteca" })).toHaveAttribute(
      "href",
      "/admin/library/block-1?saved=library"
    );
  });
});
