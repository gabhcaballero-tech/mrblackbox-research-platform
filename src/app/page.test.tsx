import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomePage from "./page";

describe("HomePage", () => {
  it("renders the three platform areas", () => {
    render(<HomePage />);

    expect(
      screen.getByRole("heading", { name: "MR Black Box Research Platform" })
    ).toBeInTheDocument();
    expect(screen.getAllByText("Administracion").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Campo / encuestadores").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Participante").length).toBeGreaterThan(0);
  });
});
