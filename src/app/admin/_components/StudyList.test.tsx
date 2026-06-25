import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { StudyListItem } from "@/modules/studies/repository";
import { formatStudyListDate, StudyList } from "./StudyList";

const mexicoCityTimestamp = new Date("2026-06-25T00:15:00Z");

const activeStudy: StudyListItem = {
  code: "DETERGENTES-ROPA-2026",
  createdAt: mexicoCityTimestamp,
  id: "study-1",
  name: "Detergentes y cuidado de la ropa — CDMX/GDL",
  status: "ACTIVE",
  timeZoneIana: "America/Mexico_City",
  updatedAt: mexicoCityTimestamp
};

describe("StudyList", () => {
  it("renders created and updated dates using the study time zone", () => {
    render(<StudyList studies={[activeStudy]} />);

    expect(screen.getAllByText(/24 jun 2026/i).length).toBeGreaterThanOrEqual(2);
  });

  it("falls back to America/Mexico_City when the study time zone is invalid", () => {
    expect(formatStudyListDate(mexicoCityTimestamp, "Zona/Invalida")).toContain("24 jun 2026");
  });
});
