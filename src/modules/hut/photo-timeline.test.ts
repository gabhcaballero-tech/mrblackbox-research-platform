import { describe, expect, it } from "vitest";
import {
  buildHutPhotoTimeline,
  formatHutPhotoTimelineSlotTitle,
  resolveHutPhotoTimelinePhaseLabel,
  resolveHutPhotoTimelineUseDayLabel,
  resolveHutOperationalStatusLabel
} from "./photo-timeline";

describe("HutPhotoTimeline", () => {
  it("maps historical COLOCACION evidence to Dia 0 delivery", () => {
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

    expect(timeline).toHaveLength(7);
    expect(timeline[0]).toMatchObject({
      dayLabel: "Dia 0",
      id: "DAY_0_DELIVERY",
      productCode: "247",
      status: "COMPLETED",
      title: "Entrega del producto"
    });
    expect(timeline[0]?.evidence?.phase).toBe("COLOCACION");
  });

  it("marks current capturable slots without inventing unsupported photos", () => {
    const timeline = buildHutPhotoTimeline({
      availablePhase: "REGRESO_1",
      rotation: {
        eva1: "247",
        eva2: "583"
      }
    });

    expect(timeline.find((slot) => slot.id === "DAY_1_APPLICATION_EVALUATION_1")).toMatchObject({
      isCapturableWithCurrentModel: true,
      status: "CURRENT",
      title: "Aplicacion / Evaluacion 1"
    });
    expect(timeline.find((slot) => slot.id === "DAY_2_FOLLOW_UP")).toMatchObject({
      isCapturableWithCurrentModel: false,
      status: "PROGRAMMED"
    });
    expect(timeline.find((slot) => slot.id === "DAY_7_FINAL_RETURN")).toMatchObject({
      evidence: null,
      isCapturableWithCurrentModel: false,
      title: "Regreso final"
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
      "Dia 0 Entrega",
      "Dia 1 Aplicacion",
      "Dia 2 Seguimiento",
      "Dia 3 Seguimiento",
      "Dia 4 Seguimiento",
      "Dia 5 Evaluacion 2",
      "Dia 7 Regreso final"
    ]);
    expect(resolveHutPhotoTimelinePhaseLabel("COLOCACION")).toBe("Dia 0 Entrega");
    expect(resolveHutPhotoTimelinePhaseLabel("REGRESO_1")).toBe("Dia 1 Aplicacion");
    expect(resolveHutPhotoTimelinePhaseLabel("REGRESO_2")).toBe("Dia 5 Evaluacion 2");
    expect(resolveHutPhotoTimelineUseDayLabel(3)).toBe("Dia 3 Seguimiento");
  });
});
