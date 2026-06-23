import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StudyEmptyState } from "./StudyEmptyState";

describe("StudyEmptyState", () => {
  it("shows a clear empty state and create button", () => {
    render(<StudyEmptyState />);

    expect(screen.getByRole("heading", { name: "No hay estudios" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Crear estudio" })).toHaveAttribute(
      "href",
      "#create-study"
    );
  });
});
