import { describe, expect, it } from "vitest";
import {
  buildHutPhotoTimeline,
  formatHutPhotoTimelineSlotTitle,
  resolveHutPhotoTimelinePhaseLabel,
  resolveHutPhotoTimelineUseDayLabel,
  resolveHutOperationalStatusLabel
} from "./photo-timeline";

describe("HutPhotoTimeline", () => {
  it("maps historical COLOCACION evidence to delivery without merging it with placement", () => {
    const timeline = buildHutPhotoTimeline({
      applicationEvidence: [
        {
          capturedAt: new Date("2026-08-08T06:30:00.000Z"),
          phase: "COLOCACION",
          productCode: "247"
        }
      ],
      rotation: {
        eva1: "247",
        eva2: "583"
      }
    });

    expect(timeline).toHaveLength(10);
    expect(timeline[0]).toMatchObject({
      dayLabel: "Entrega",
      id: "DELIVERY",
      productCode: "247",
      status: "COMPLETED",
      title: "Entrega del producto"
    });
    expect(timeline[0]?.evidence?.phase).toBe("COLOCACION");
    expect(timeline[1]).toMatchObject({
      dayLabel: "Colocacion",
      evidence: null,
      id: "PLACEMENT",
      participantTask: "Foto colocacion",
      status: "PROGRAMMED"
    });
  });

  it("marks current capturable slots without inventing unsupported photos", () => {
    const timeline = buildHutPhotoTimeline({
      availablePhase: "REGRESO_1",
      rotation: {
        eva1: "247",
        eva2: "583"
      }
    });

    expect(timeline.find((slot) => slot.id === "PRODUCT_1_DAY_3_MORNING")).toMatchObject({
      isCapturableWithCurrentModel: true,
      status: "CURRENT",
      title: "Foto diaria"
    });
    expect(timeline.find((slot) => slot.id === "PRODUCT_1_EVALUATION_1")).toMatchObject({
      interviewerTask: "Evaluacion 1",
      participantTask: null,
      status: "PROGRAMMED"
    });
    expect(timeline.find((slot) => slot.id === "PRODUCT_2_EVALUATION_2")).toMatchObject({
      evidence: null,
      isCapturableWithCurrentModel: false,
      title: "Evaluacion 2"
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
      "Colocacion",
      "Producto 1 - Dia 1",
      "Producto 1 - Dia 2",
      "Producto 1 - Dia 3 manana",
      "Producto 1 - Dia 3 tarde - Evaluacion 1",
      "Producto 2 - Dia 1",
      "Producto 2 - Dia 2",
      "Producto 2 - Dia 3 manana",
      "Producto 2 - Dia 3 tarde - Evaluacion 2"
    ]);
    expect(resolveHutPhotoTimelinePhaseLabel("COLOCACION")).toBe("Entrega");
    expect(resolveHutPhotoTimelinePhaseLabel("REGRESO_1")).toBe("Producto 1 - Dia 3 manana");
    expect(resolveHutPhotoTimelinePhaseLabel("REGRESO_2")).toBe("Producto 2 - Dia 3 manana");
    expect(resolveHutPhotoTimelineUseDayLabel(3)).toBe("Producto 1 - Dia 3 manana");
  });
});
