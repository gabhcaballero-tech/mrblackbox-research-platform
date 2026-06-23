import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LibrarySaveFields } from "./LibrarySaveFields";

describe("LibrarySaveFields", () => {
  it("muestra placeholders y ayudas para metadatos de biblioteca", () => {
    render(<LibrarySaveFields defaultName="Consentimiento informado completo" readOnly={false} />);

    expect(screen.getByLabelText("Nombre del elemento")).toHaveValue(
      "Consentimiento informado completo"
    );
    expect(screen.getByPlaceholderText("Ej. Consentimiento estándar")).toHaveAccessibleDescription(
      "Usa un nombre corto que permita identificarlo y reutilizarlo."
    );
    expect(
      screen.getByPlaceholderText("Ej. Consentimiento, Datos sociodemográficos o Exclusiones")
    ).toHaveAccessibleDescription("Agrupa elementos que suelen usarse juntos.");
    expect(
      screen.getByPlaceholderText(
        "Ej. Pregunta obligatoria para confirmar la aceptación voluntaria antes del filtro."
      )
    ).toHaveAccessibleDescription("Describe para qué sirve este elemento dentro de un estudio.");
    expect(
      screen.getByPlaceholderText("Ej. screener, consentimiento, elegibilidad")
    ).toHaveAccessibleDescription("Separa las etiquetas con comas para facilitar la búsqueda.");
  });

  it("mantiene oculta la confirmacion generica para elementos especificos del estudio", () => {
    render(<LibrarySaveFields defaultName="" readOnly={false} />);

    expect(screen.getByLabelText("Alcance")).toHaveValue("STUDY_SPECIFIC");
    expect(
      screen.getByText(
        "Solo estará disponible dentro de este estudio. Úsalo para marcas, productos, criterios o redacción particular."
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        "Confirma que este contenido no incluye marcas, clientes, productos reales, cuotas ni criterios exclusivos de un estudio."
      )
    ).not.toBeInTheDocument();
  });

  it("muestra confirmacion amarilla solo con alcance generico", () => {
    render(<LibrarySaveFields defaultName="" readOnly={false} />);

    fireEvent.change(screen.getByLabelText("Alcance"), { target: { value: "GENERIC" } });

    expect(
      screen.getByText(
        "Podrá reutilizarse en cualquier estudio. Debe estar libre de marcas, clientes, productos reales, cuotas y criterios exclusivos."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(
        "Confirma que este contenido no incluye marcas, clientes, productos reales, cuotas ni criterios exclusivos de un estudio."
      )
    ).toBeInTheDocument();
  });

  it("limpia la confirmacion al cambiar de generico a especifico", () => {
    render(<LibrarySaveFields defaultName="" readOnly={false} />);

    fireEvent.change(screen.getByLabelText("Alcance"), { target: { value: "GENERIC" } });
    fireEvent.click(
      screen.getByLabelText(
        "Confirma que este contenido no incluye marcas, clientes, productos reales, cuotas ni criterios exclusivos de un estudio."
      )
    );
    expect(
      screen.getByLabelText(
        "Confirma que este contenido no incluye marcas, clientes, productos reales, cuotas ni criterios exclusivos de un estudio."
      )
    ).toBeChecked();

    fireEvent.change(screen.getByLabelText("Alcance"), { target: { value: "STUDY_SPECIFIC" } });
    expect(
      screen.queryByLabelText(
        "Confirma que este contenido no incluye marcas, clientes, productos reales, cuotas ni criterios exclusivos de un estudio."
      )
    ).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Alcance"), { target: { value: "GENERIC" } });
    expect(
      screen.getByLabelText(
        "Confirma que este contenido no incluye marcas, clientes, productos reales, cuotas ni criterios exclusivos de un estudio."
      )
    ).not.toBeChecked();
  });
});
