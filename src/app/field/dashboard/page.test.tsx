import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import FieldDashboardPage from "./page";

const { operationsPageMock } = vi.hoisted(() => ({
  operationsPageMock: vi.fn(() => <main>Dashboard operativo de campo</main>)
}));

vi.mock("../operations/page", () => ({
  default: operationsPageMock,
  dynamic: "force-dynamic"
}));

describe("FieldDashboardPage", () => {
  it("expone el seguimiento operativo en la ruta /field/dashboard", () => {
    render(<FieldDashboardPage searchParams={Promise.resolve({ studyId: "study-1" })} />);

    expect(operationsPageMock).toHaveBeenCalledWith(
      {
        searchParams: expect.any(Promise)
      },
      undefined
    );
    expect(screen.getByText("Dashboard operativo de campo")).toBeInTheDocument();
  });
});
