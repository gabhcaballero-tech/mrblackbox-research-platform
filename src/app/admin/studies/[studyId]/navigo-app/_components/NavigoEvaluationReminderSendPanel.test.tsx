import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendNavigoEvaluationReminderNowAction } from "@/modules/navigo-app/actions";
import { NavigoEvaluationReminderSendPanel } from "./NavigoEvaluationReminderSendPanel";

vi.mock("@/modules/navigo-app/actions", () => ({
  sendNavigoEvaluationReminderNowAction: vi.fn()
}));

const mockedSendAction = vi.mocked(sendNavigoEvaluationReminderNowAction);

describe("NavigoEvaluationReminderSendPanel", () => {
  beforeEach(() => {
    mockedSendAction.mockReset();
  });

  it("envia recordatorio manual y muestra auditoria del envio", async () => {
    mockedSendAction.mockResolvedValue({
      data: {
        activityCode: "T3_HORAS",
        evaluationUrl: "https://example.test/p/token/activities",
        folio: "NAV-003",
        generatedAtIso: "2026-08-08T09:00:00.000Z",
        message: "Recordatorio enviado por WhatsApp.",
        phone: "+525512345678",
        whatsappError: null,
        whatsappMessageId: "wamid-reminder",
        whatsappStatus: "ENVIADO"
      },
      ok: true
    });

    render(
      <NavigoEvaluationReminderSendPanel
        activityCode="T3_HORAS"
        activityId="activity-t3"
        canSend
        requestOrigin="https://example.test"
        studyId="study-1"
        timeZoneIana="America/Mexico_City"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Enviar recordatorio ahora" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Recordatorio enviado" })).toBeInTheDocument());
    expect(screen.getByText("Recordatorio enviado por WhatsApp.")).toBeInTheDocument();
    expect(screen.getByText("wamid-reminder")).toBeInTheDocument();
    expect(mockedSendAction).toHaveBeenCalledWith("study-1", "activity-t3", "https://example.test");
  });

  it("muestra mensaje cuando la secuencia no permite enviar", async () => {
    mockedSendAction.mockResolvedValue({
      message: "Completa la evaluacion anterior antes de enviar este recordatorio.",
      ok: false
    });

    render(
      <NavigoEvaluationReminderSendPanel
        activityCode="T4_5_HORAS"
        activityId="activity-t45"
        canSend
        requestOrigin="https://example.test"
        studyId="study-1"
        timeZoneIana="America/Mexico_City"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Enviar recordatorio ahora" }));

    await waitFor(() => {
      expect(screen.getByText("Completa la evaluacion anterior antes de enviar este recordatorio.")).toBeInTheDocument();
    });
  });

  it("deshabilita el boton cuando la actividad no existe", () => {
    render(
      <NavigoEvaluationReminderSendPanel
        activityCode="T3_HORAS"
        activityId={null}
        canSend={false}
        disabledReason="La actividad todavia no esta creada."
        requestOrigin="https://example.test"
        studyId="study-1"
        timeZoneIana="America/Mexico_City"
      />
    );

    expect(screen.getByRole("button", { name: "Enviar recordatorio ahora" })).toBeDisabled();
    expect(screen.getByText("La actividad todavia no esta creada.")).toBeInTheDocument();
  });
});
