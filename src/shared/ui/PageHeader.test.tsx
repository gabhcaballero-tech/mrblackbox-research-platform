import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageHeader } from "./PageHeader";

describe("PageHeader", () => {
  it("renders the base heading and description", () => {
    render(
      <PageHeader
        eyebrow="Base tecnica"
        title="Administracion"
        description="Placeholder de la plataforma."
      />
    );

    expect(screen.getByRole("heading", { name: "Administracion" })).toBeInTheDocument();
    expect(screen.getByText("Placeholder de la plataforma.")).toBeInTheDocument();
  });
});
