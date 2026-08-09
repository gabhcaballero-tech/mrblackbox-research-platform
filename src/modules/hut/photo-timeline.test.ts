import { describe, expect, it } from "vitest";
import {
  buildHutPhotoTimeline,
  formatHutPhotoTimelineSlotTitle,
  resolveHutPhotoTimelinePhaseLabel,
  resolveHutPhotoTimelineUseDayLabel,
  resolveHutOperationalStatusLabel
} from "./photo-timeline";

describe("HutPhotoTimeline", () => {
  it("keeps delivery and product 1 day 1 as different slots without duplicating colocacion", () => {
    const timeline = buildHutPhotoTimeline({
      applicationEvidence: [
        {
          capturedAt: new Date("2026-08-08T06:30:00.000Z"),
          phase: "COLOCACION",
          productCode: "247"
        }
      ],
      dailyEntries: [
        {
          capturedAt: new Date("2026-08-08T05:30:00.000Z"),
          capturedLocalDate: "2026-08-07",
          productCode: null,
          useDayNumber: 0
        }
      ],
      rotation: {
        eva1: "247",
        eva2: "583"
      }
    });

    expect(timeline).toHaveLength(9);
    expect(timeline[0]).toMatchObject({
      id: "DELIVERY",
      productCode: null,
      status: "COMPLETED",
      title: "Entrega del producto",
      useDayNumber: 0
    });
    expect(timeline[1]).toMatchObject({
      evidence: expect.objectContaining({ phase: "COLOCACION" }),
      id: "PRODUCT_1_DAY_1",
      participantTask: "Foto colocacion / aplicacion",
      productCode: "247",
      status: "COMPLETED",
      useDayNumber: 1
    });
    expect(timeline.filter((slot) => slot.id === "PRODUCT_1_DAY_1")).toHaveLength(1);
    expect(timeline.map((slot) => slot.id)).not.toContain("PLACEMENT");
  });

  it("uses a single sequential availability state across the timeline", () => {
    const timeline = buildHutPhotoTimeline({
      dailyEntries: [
        {
          capturedAt: new Date("2026-08-08T05:30:00.000Z"),
          capturedLocalDate: "2026-08-07",
          productCode: null,
          useDayNumber: 0
        }
      ],
      rotation: {
        eva1: "247",
        eva2: "583"
      }
    });

    expect(timeline.find((slot) => slot.id === "DELIVERY")?.status).toBe("COMPLETED");
    expect(timeline.find((slot) => slot.id === "PRODUCT_1_DAY_1")).toMatchObject({
      status: "AVAILABLE",
      title: "Colocacion / aplicacion del producto 1"
    });
    expect(timeline.find((slot) => slot.id === "PRODUCT_1_DAY_3_MORNING")?.status).toBe("BLOCKED");
    expect(timeline.find((slot) => slot.id === "PRODUCT_1_EVALUATION_1")).toMatchObject({
      interviewerTask: "Evaluacion 1",
      participantTask: null,
      status: "PROGRAMMED"
    });
  });

  it("hides legacy call pending labels in the operational presentation", () => {
    expect(resolveHutOperationalStatusLabel("BLOCK_1_CALL_PENDING")).toBe("En seguimiento");
    expect(resolveHutOperationalStatusLabel("BLOCK_2_CALL_PENDING")).toBe("En seguimiento");
    expect(resolveHutOperationalStatusLabel("COMPLETED")).toBe("Completado");
  });

  it("formats operational day labels without exposing technical phases", () => {
    const timeline = buildHutPhotoTimeline({
      rotation: {
        eva1: "247",
        eva2: "583"
      }
    });

    expect(timeline.map(formatHutPhotoTimelineSlotTitle)).toEqual([
      "Entrega del producto",
      "Producto 1 - Dia 1 (Colocacion)",
      "Producto 1 - Dia 2",
      "Producto 1 - Dia 3 manana",
      "Producto 1 - Dia 3 tarde - Evaluacion 1",
      "Producto 2 - Dia 1",
      "Producto 2 - Dia 2",
      "Producto 2 - Dia 3 manana",
      "Producto 2 - Dia 3 tarde - Evaluacion 2"
    ]);
    expect(resolveHutPhotoTimelinePhaseLabel("COLOCACION")).toBe("Producto 1 - Dia 1 (Colocacion)");
    expect(resolveHutPhotoTimelinePhaseLabel("REGRESO_1")).toBe("Evaluacion 1 - registro historico");
    expect(resolveHutPhotoTimelinePhaseLabel("REGRESO_2")).toBe("Evaluacion 2 - registro historico");
    expect(resolveHutPhotoTimelineUseDayLabel(0)).toBe("Entrega del producto");
    expect(resolveHutPhotoTimelineUseDayLabel(3)).toBe("Producto 1 - Dia 3 manana");
  });
});
