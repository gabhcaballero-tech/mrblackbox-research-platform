import { describe, expect, it } from "vitest";
import { formatDateMexicoCity, formatDateTimeMexicoCity, MEXICO_CITY_TIME_ZONE } from "./date-format";

describe("Mexico City date formatting", () => {
  it("formats UTC timestamps in Mexico City time", () => {
    expect(formatDateTimeMexicoCity(new Date("2026-08-09T16:34:00.000Z"))).toBe("09/08/2026, 10:34 hrs CDMX");
  });

  it("formats dates without depending on local environment timezone", () => {
    expect(formatDateMexicoCity(new Date("2026-08-09T04:30:00.000Z"))).toBe("08/08/2026");
  });

  it("exposes the required study timezone", () => {
    expect(MEXICO_CITY_TIME_ZONE).toBe("America/Mexico_City");
  });
});
