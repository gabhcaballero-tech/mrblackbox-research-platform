import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageHeader } from "./PageHeader";

describe("PageHeader", () => {
  it("renders the base heading and description", () => {
    render(
      <PageHeader
        eyebrow="Base técnica"
        title="Administración"
        description="Pantalla base de la plataforma."
      />
    );

    expect(screen.getByRole("heading", { name: "Administración" })).toBeInTheDocument();
    expect(screen.getByText("Pantalla base de la plataforma.")).toBeInTheDocument();
  });
});
