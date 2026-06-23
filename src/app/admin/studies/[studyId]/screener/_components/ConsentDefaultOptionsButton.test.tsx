import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScreenerOptionActionState } from "@/modules/screener/actions";
import { ConsentDefaultOptionsButton } from "./ConsentDefaultOptionsButton";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh
  })
}));

vi.mock("@/modules/screener/actions", () => ({
  addConsentDefaultOptionsAction: vi.fn()
}));

describe("ConsentDefaultOptionsButton", () => {
  beforeEach(() => {
    refresh.mockClear();
  });

  it("muestra confirmación al agregar opciones predeterminadas", async () => {
    const action = vi.fn(async (): Promise<ScreenerOptionActionState> => ({
      message: "Opciones de consentimiento agregadas correctamente.",
      ok: true
    }));

    render(
      <ConsentDefaultOptionsButton
        action={action}
        questionId="q-consent"
        readOnly={false}
        studyId="study-1"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Agregar opciones predeterminadas de consentimiento" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Opciones de consentimiento agregadas correctamente."
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("muestra error sin ocultar el botón", async () => {
    const action = vi.fn(async (): Promise<ScreenerOptionActionState> => ({
      message: "No se pudieron agregar las opciones de consentimiento.",
      ok: false
    }));

    render(
      <ConsentDefaultOptionsButton
        action={action}
        questionId="q-consent"
        readOnly={false}
        studyId="study-1"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Agregar opciones predeterminadas de consentimiento" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudieron agregar las opciones de consentimiento."
    );
    expect(screen.getByRole("button", { name: "Agregar opciones predeterminadas de consentimiento" })).toBeEnabled();
  });
});
