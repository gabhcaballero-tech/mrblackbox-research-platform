import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QuestionMoveControls } from "./QuestionMoveControls";

const refreshMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: refreshMock
  })
}));

vi.mock("@/modules/screener/actions", () => ({
  moveScreenerQuestionWithFeedbackAction: vi.fn()
}));

function createDeferredResult<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}

describe("QuestionMoveControls", () => {
  beforeEach(() => {
    refreshMock.mockReset();
  });

  it("shows a visible error when a blocked move is rejected", async () => {
    const moveAction = vi.fn(async () => ({
      message: "No se puede mover esta pregunta antes de la pregunta de la que depende.",
      ok: false
    }));

    render(
      <QuestionMoveControls
        moveAction={moveAction}
        questionId="F9A_VECES_AL_DIA"
        readOnly={false}
        studyId="study-1"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Subir" }));

    expect(
      await screen.findByText("No se puede mover esta pregunta antes de la pregunta de la que depende.")
    ).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("refreshes the UI after a successful move", async () => {
    const moveAction = vi.fn(async () => ({
      message: "Pregunta reordenada correctamente.",
      ok: true
    }));

    render(
      <QuestionMoveControls
        moveAction={moveAction}
        questionId="F9A_VECES_AL_DIA"
        readOnly={false}
        studyId="study-1"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Subir" }));

    expect(await screen.findByText("Pregunta reordenada correctamente.")).toBeInTheDocument();
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
  });

  it("disables the move button while a move is pending", async () => {
    const deferred = createDeferredResult<{ message: string; ok: boolean }>();
    const moveAction = vi.fn(() => deferred.promise);

    render(
      <QuestionMoveControls
        moveAction={moveAction}
        questionId="F9A_VECES_AL_DIA"
        readOnly={false}
        studyId="study-1"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Subir" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Guardando..." })).toBeDisabled();
    });

    deferred.resolve({
      message: "Pregunta reordenada correctamente.",
      ok: true
    });

    expect(await screen.findByText("Pregunta reordenada correctamente.")).toBeInTheDocument();
  });
});
