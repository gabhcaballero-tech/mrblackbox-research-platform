import { describe, expect, it } from "vitest";
import {
  buildHutPhotoTimeline,
  formatHutPhotoTimelineSlotTitle,
  isLegacyMirroredPlacementPhoto,
  resolveHutPhotoTimelinePhotoLabel,
  resolveHutPhotoTimelinePhaseLabel,
  resolveHutPhotoTimelineUseDayLabel,
  resolveHutOperationalStatusLabel
} from "./photo-timeline";

describe("HutPhotoTimeline", () => {
  it("shows historical colocacion evidence as delivery when no separate delivery photo exists", () => {
    const capturedAt = new Date("2026-08-08T06:30:00.000Z");
    const timeline = buildHutPhotoTimeline({
      applicationEvidence: [
        {
          capturedAt,
          phase: "COLOCACION",
          privateStorageKey: "hut/legacy-placement.jpg",
          productCode: "247"
        }
      ],
      rotation: {
        eva1: "247",
        eva2: "583"
      }
    });

    expect(timeline.find((slot) => slot.id === "DELIVERY")).toMatchObject({
      evidence: expect.objectContaining({
        capturedAt,
        phase: "COLOCACION",
        source: "PHASE_EVIDENCE"
      }),
      productCode: "247",
      status: "COMPLETED"
    });
    expect(timeline.find((slot) => slot.id === "PRODUCT_1_DAY_1")).toMatchObject({
      evidence: null,
      productCode: "247",
      status: "AVAILABLE"
    });
    expect(timeline.filter((slot) => slot.evidence?.capturedAt.getTime() === capturedAt.getTime())).toHaveLength(1);
  });

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

  it("does not duplicate a historical colocacion daily mirror when remapping it to delivery", () => {
    const capturedAt = new Date("2026-08-08T06:30:00.000Z");
    const timeline = buildHutPhotoTimeline({
      applicationEvidence: [
        {
          capturedAt,
          phase: "COLOCACION",
          productCode: "247"
        }
      ],
      dailyEntries: [
        {
          capturedAt,
          capturedLocalDate: "2026-08-08",
          privateStorageKey: "hut/legacy-placement.jpg",
          productCode: "247",
          useDayNumber: 1
        }
      ],
      rotation: {
        eva1: "247",
        eva2: "583"
      }
    });

    expect(timeline.find((slot) => slot.id === "DELIVERY")?.status).toBe("COMPLETED");
    expect(timeline.find((slot) => slot.id === "PRODUCT_1_DAY_1")).toMatchObject({
      evidence: null,
      status: "AVAILABLE"
    });
    expect(timeline.filter((slot) => slot.evidence?.capturedAt.getTime() === capturedAt.getTime())).toHaveLength(1);
  });

  it("detects a mirrored legacy placement photo only when the stored file, date, product and missing delivery match", () => {
    const capturedAt = new Date("2026-08-08T06:30:00.000Z");

    expect(
      isLegacyMirroredPlacementPhoto({
        colocacionEvidence: {
          capturedAt,
          phase: "COLOCACION",
          privateStorageKey: "hut/legacy-placement.jpg",
          productCode: "247"
        },
        day1Entry: {
          capturedAt,
          privateStorageKey: "hut/legacy-placement.jpg",
          productCode: "247",
          useDayNumber: 1
        },
        deliveryEntry: null
      })
    ).toBe(true);
    expect(
      isLegacyMirroredPlacementPhoto({
        colocacionEvidence: {
          capturedAt,
          phase: "COLOCACION",
          privateStorageKey: "hut/legacy-placement.jpg",
          productCode: "247"
        },
        day1Entry: {
          capturedAt,
          privateStorageKey: "hut/real-placement.jpg",
          productCode: "247",
          useDayNumber: 1
        },
        deliveryEntry: null
      })
    ).toBe(false);
    expect(
      isLegacyMirroredPlacementPhoto({
        colocacionEvidence: {
          capturedAt,
          phase: "COLOCACION",
          privateStorageKey: "hut/legacy-placement.jpg",
          productCode: "247"
        },
        day1Entry: {
          capturedAt,
          privateStorageKey: "hut/legacy-placement.jpg",
          productCode: "247",
          useDayNumber: 1
        },
        deliveryEntry: { useDayNumber: 0 }
      })
    ).toBe(false);
  });

  it("falls back to the next missing slot when an explicit available slot is already completed", () => {
    const timeline = buildHutPhotoTimeline({
      applicationEvidence: [
        {
          capturedAt: new Date("2026-08-08T06:30:00.000Z"),
          phase: "COLOCACION",
          productCode: "247"
        }
      ],
      availableSlotId: "DELIVERY",
      rotation: {
        eva1: "247",
        eva2: "583"
      }
    });

    expect(timeline.find((slot) => slot.id === "DELIVERY")?.status).toBe("COMPLETED");
    expect(timeline.find((slot) => slot.id === "PRODUCT_1_DAY_1")?.status).toBe("AVAILABLE");
  });

  it("labels raw historical colocacion photos from the resolved timeline", () => {
    const capturedAt = new Date("2026-08-08T06:30:00.000Z");
    const historicalTimeline = buildHutPhotoTimeline({
      applicationEvidence: [
        {
          capturedAt,
          phase: "COLOCACION",
          productCode: "247"
        }
      ],
      rotation: {
        eva1: "247",
        eva2: "583"
      }
    });
    const newTimeline = buildHutPhotoTimeline({
      applicationEvidence: [
        {
          capturedAt,
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

    expect(
      resolveHutPhotoTimelinePhotoLabel(
        {
          capturedAt,
          phase: "COLOCACION",
          source: "PHASE_EVIDENCE",
          useDayNumber: null
        },
        historicalTimeline
      )
    ).toBe("Entrega del producto");
    expect(
      resolveHutPhotoTimelinePhotoLabel(
        {
          capturedAt,
          phase: "COLOCACION",
          source: "PHASE_EVIDENCE",
          useDayNumber: null
        },
        newTimeline
      )
    ).toBe("Producto 1 - Dia 1 (Colocacion)");
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

  it("programs product 1 day 2 until 4 a.m. Mexico City on the next local day", () => {
    const timeline = buildHutPhotoTimeline({
      dailyEntries: [
        {
          capturedAt: new Date("2026-08-09T15:00:00.000Z"),
          capturedLocalDate: "2026-08-09",
          productCode: null,
          useDayNumber: 0
        },
        {
          capturedAt: new Date("2026-08-09T16:00:00.000Z"),
          capturedLocalDate: "2026-08-09",
          productCode: "247",
          useDayNumber: 1
        }
      ],
      now: new Date("2026-08-09T18:00:00.000Z"),
      rotation: {
        eva1: "247",
        eva2: "583"
      }
    });

    expect(timeline.find((slot) => slot.id === "PRODUCT_1_DAY_1")?.status).toBe("COMPLETED");
    expect(timeline.find((slot) => slot.id === "PRODUCT_1_DAY_1")).toMatchObject({
      availableAt: null,
      availableDate: null
    });
    expect(timeline.find((slot) => slot.id === "PRODUCT_1_DAY_2")).toMatchObject({
      availableDate: "10/08/2026, 04:00 hrs CDMX",
      status: "PROGRAMMED"
    });
    expect(timeline.find((slot) => slot.id === "PRODUCT_1_DAY_3_MORNING")).toMatchObject({
      availableAt: null,
      availableDate: null,
      status: "BLOCKED"
    });
  });

  it("makes product 1 day 2 available after 4 a.m. Mexico City on the next local day", () => {
    const timeline = buildHutPhotoTimeline({
      dailyEntries: [
        {
          capturedAt: new Date("2026-08-09T15:00:00.000Z"),
          capturedLocalDate: "2026-08-09",
          productCode: null,
          useDayNumber: 0
        },
        {
          capturedAt: new Date("2026-08-09T16:00:00.000Z"),
          capturedLocalDate: "2026-08-09",
          productCode: "247",
          useDayNumber: 1
        }
      ],
      now: new Date("2026-08-10T10:00:00.000Z"),
      rotation: {
        eva1: "247",
        eva2: "583"
      }
    });

    expect(timeline.find((slot) => slot.id === "PRODUCT_1_DAY_2")).toMatchObject({
      availableAt: null,
      availableDate: null,
      status: "AVAILABLE"
    });
    expect(timeline.find((slot) => slot.id === "PRODUCT_1_DAY_3_MORNING")).toMatchObject({
      availableAt: null,
      availableDate: null,
      status: "BLOCKED"
    });
  });

  it("uses the Mexico City local date when scheduling captures close to midnight", () => {
    const timeline = buildHutPhotoTimeline({
      dailyEntries: [
        {
          capturedAt: new Date("2026-08-10T04:30:00.000Z"),
          capturedLocalDate: "2026-08-09",
          productCode: null,
          useDayNumber: 0
        },
        {
          capturedAt: new Date("2026-08-10T05:30:00.000Z"),
          capturedLocalDate: "2026-08-09",
          productCode: "247",
          useDayNumber: 1
        }
      ],
      now: new Date("2026-08-10T09:59:00.000Z"),
      rotation: {
        eva1: "247",
        eva2: "583"
      }
    });

    expect(timeline.find((slot) => slot.id === "PRODUCT_1_DAY_2")).toMatchObject({
      availableDate: "10/08/2026, 04:00 hrs CDMX",
      status: "PROGRAMMED"
    });
  });

  it("applies the same 4 a.m. schedule to product 2 follow-up photos", () => {
    const timeline = buildHutPhotoTimeline({
      dailyEntries: [
        {
          capturedAt: new Date("2026-08-09T15:00:00.000Z"),
          capturedLocalDate: "2026-08-09",
          productCode: null,
          useDayNumber: 0
        },
        {
          capturedAt: new Date("2026-08-09T16:00:00.000Z"),
          capturedLocalDate: "2026-08-09",
          productCode: "247",
          useDayNumber: 1
        },
        {
          capturedAt: new Date("2026-08-10T10:10:00.000Z"),
          capturedLocalDate: "2026-08-10",
          productCode: "247",
          useDayNumber: 2
        },
        {
          capturedAt: new Date("2026-08-11T10:10:00.000Z"),
          capturedLocalDate: "2026-08-11",
          productCode: "247",
          useDayNumber: 3
        },
        {
          capturedAt: new Date("2026-08-12T16:00:00.000Z"),
          capturedLocalDate: "2026-08-12",
          productCode: "583",
          useDayNumber: 4
        }
      ],
      now: new Date("2026-08-12T18:00:00.000Z"),
      product2GateOpen: true,
      rotation: {
        eva1: "247",
        eva2: "583"
      }
    });

    expect(timeline.find((slot) => slot.id === "PRODUCT_2_DAY_1")).toMatchObject({
      availableAt: null,
      availableDate: null,
      status: "COMPLETED"
    });
    expect(timeline.find((slot) => slot.id === "PRODUCT_2_DAY_2")).toMatchObject({
      availableDate: "13/08/2026, 04:00 hrs CDMX",
      status: "PROGRAMMED"
    });
    expect(timeline.find((slot) => slot.id === "PRODUCT_2_DAY_3_MORNING")).toMatchObject({
      availableAt: null,
      availableDate: null,
      status: "BLOCKED"
    });
  });

  it("blocks product 2 day 1 until Regreso 1 and the second product are released", () => {
    const baseInput = {
      dailyEntries: [
        {
          capturedAt: new Date("2026-08-09T15:00:00.000Z"),
          capturedLocalDate: "2026-08-09",
          productCode: null,
          useDayNumber: 0
        },
        {
          capturedAt: new Date("2026-08-09T16:00:00.000Z"),
          capturedLocalDate: "2026-08-09",
          productCode: "247",
          useDayNumber: 1
        },
        {
          capturedAt: new Date("2026-08-10T10:10:00.000Z"),
          capturedLocalDate: "2026-08-10",
          productCode: "247",
          useDayNumber: 2
        },
        {
          capturedAt: new Date("2026-08-11T10:10:00.000Z"),
          capturedLocalDate: "2026-08-11",
          productCode: "247",
          useDayNumber: 3
        }
      ],
      now: new Date("2026-08-12T21:00:00.000Z"),
      rotation: {
        eva1: "247",
        eva2: "583"
      }
    };
    const blockedTimeline = buildHutPhotoTimeline(baseInput);
    const releasedTimeline = buildHutPhotoTimeline({
      ...baseInput,
      product2GateOpen: true
    });

    expect(blockedTimeline.find((slot) => slot.id === "PRODUCT_2_DAY_1")).toMatchObject({
      availableAt: null,
      availableDate: null,
      status: "BLOCKED"
    });
    expect(releasedTimeline.find((slot) => slot.id === "PRODUCT_2_DAY_1")).toMatchObject({
      productCode: "583",
      status: "AVAILABLE"
    });
  });

  it("makes every pending photo slot available in test mode", () => {
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
      },
      testMode: true
    });

    expect(timeline.find((slot) => slot.id === "DELIVERY")?.status).toBe("COMPLETED");
    expect(
      timeline
        .filter((slot) => slot.participantTask && !slot.evidence)
        .map((slot) => slot.status)
    ).toEqual(["AVAILABLE", "AVAILABLE", "AVAILABLE", "BLOCKED", "BLOCKED", "BLOCKED"]);
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
