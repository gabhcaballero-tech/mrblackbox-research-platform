import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LibraryFilters } from "./page";

describe("LibraryFilters", () => {
  it("muestra placeholders orientativos en filtros de biblioteca", () => {
    render(<LibraryFilters filters={{}} />);

    expect(screen.getByPlaceholderText("Ej. consentimiento o NSE")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Ej. Exclusiones")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Ej. elegibilidad, screener")).toBeInTheDocument();
  });
});
