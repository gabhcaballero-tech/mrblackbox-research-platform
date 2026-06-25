import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScreenerDefinition } from "@/modules/screener";
import type { ScreenerDraftActionState } from "@/modules/screener/action-state";
import { PublishVersionForm, ScreenerMetadataForm } from "./ScreenerActionForms";

const definition: ScreenerDefinition = {
  description: "Descripcion inicial",
  purpose: "SCREENER",
  questions: [
    {
      dataDestination: "SCREENING",
      id: "F1_CIUDAD",
      options: [
        {
          actions: [{ type: "CONTINUE" }],
          isOther: false,
          label: "CDMX",
          order: 1,
          otherTextRequired: false,
          value: "CDMX"
        }
      ],
      order: 1,
      required: true,
      text: "Ciudad",
      type: "SINGLE_CHOICE",
      validation: {}
    }
  ],
  rules: [],
  schemaVersion: "screening.v1",
  title: "Filtro detergentes"
};

function createDeferredResult<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}

describe("ScreenerActionForms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("guardar borrador ejecuta la accion y muestra exito", async () => {
    const saveAction = vi.fn(async () => ({
      message: "Borrador guardado correctamente.",
      status: "success"
    } satisfies ScreenerDraftActionState));

    render(
      <ScreenerMetadataForm
        action={saveAction}
        definition={definition}
        readOnly={false}
        studyId="study-1"
      />
    );

    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Filtro actualizado" } });
    fireEvent.change(screen.getByLabelText("Descripción opcional"), {
      target: { value: "Descripción actualizada" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));

    await waitFor(() => expect(saveAction).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Borrador guardado correctamente.")).toBeInTheDocument();
  });

  it("guardar borrador deshabilita el boton mientras guarda", async () => {
    const deferred = createDeferredResult<ScreenerDraftActionState>();
    const saveAction = vi.fn(() => deferred.promise);

    render(
      <ScreenerMetadataForm
        action={saveAction}
        definition={definition}
        readOnly={false}
        studyId="study-1"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Guardando..." })).toBeDisabled());

    deferred.resolve({
      message: "Borrador guardado correctamente.",
      status: "success"
    });

    expect(await screen.findByText("Borrador guardado correctamente.")).toBeInTheDocument();
  });

  it("guardar borrador muestra error visible si la accion falla", async () => {
    const saveAction = vi.fn(async () => ({
      message: "No fue posible guardar el borrador. Intenta de nuevo.",
      status: "error"
    } satisfies ScreenerDraftActionState));

    render(
      <ScreenerMetadataForm
        action={saveAction}
        definition={definition}
        readOnly={false}
        studyId="study-1"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));

    expect(
      await screen.findByText("No fue posible guardar el borrador. Intenta de nuevo.")
    ).toBeInTheDocument();
  });

  it("publicar version ejecuta la accion y muestra exito", async () => {
    const publishAction = vi.fn(async () => ({
      message: "Versión publicada correctamente.",
      status: "success"
    } satisfies ScreenerDraftActionState));

    render(
      <PublishVersionForm
        action={publishAction}
        canPublish
        definition={definition}
        isPreparingNewVersion={false}
        readOnly={false}
        studyId="study-1"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Publicar versión" }));

    await waitFor(() => expect(publishAction).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Versión publicada correctamente.")).toBeInTheDocument();
  });

  it("no permite publicar sin preguntas y muestra el mensaje esperado", () => {
    render(
      <PublishVersionForm
        canPublish={false}
        definition={{ ...definition, questions: [] }}
        isPreparingNewVersion={false}
        readOnly={false}
        studyId="study-1"
      />
    );

    expect(screen.getByText("No puedes publicar una versión sin preguntas.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publicar versión" })).toBeDisabled();
  });

  it("deshabilita publicar mientras la accion sigue pendiente", async () => {
    const deferred = createDeferredResult<ScreenerDraftActionState>();
    const publishAction = vi.fn(() => deferred.promise);

    render(
      <PublishVersionForm
        action={publishAction}
        canPublish
        definition={definition}
        isPreparingNewVersion
        readOnly={false}
        studyId="study-1"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Publicar nueva versión" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Publicando..." })).toBeDisabled());

    deferred.resolve({
      message: "Versión publicada correctamente.",
      status: "success"
    });

    expect(await screen.findByText("Versión publicada correctamente.")).toBeInTheDocument();
  });
});
