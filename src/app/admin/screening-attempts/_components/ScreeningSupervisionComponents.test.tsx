import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  ScreeningAttemptDetail,
  ScreeningAttemptListData,
  ScreeningAttemptListItem
} from "@/modules/screening-supervision";
import {
  EvidenceReviewPanel,
  ScreeningAttemptDetailView,
  ScreeningAttemptFilters,
  ScreeningAttemptTable
} from "./ScreeningSupervisionComponents";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn()
  })
}));

const study = {
  code: "FMASCULINA-NAVIGO-2026",
  id: "study-1",
  name: "Fragancia Masculina - Navigo Homme",
  timeZoneIana: "America/Mexico_City"
};

const longReason =
  "La frecuencia declarada no cumple con el criterio operativo definido para este filtro y requiere una explicación completa.";

const listItem: ScreeningAttemptListItem = {
  closedAt: new Date("2026-06-23T16:00:00Z"),
  confirmation: null,
  evidenceReviewStatus: null,
  fieldUser: {
    email: "ana@example.com",
    id: "field-1",
    name: "Ana Campo"
  },
  id: "attempt-1",
  nseClassCode: "RANGO-3",
  nseClassLabel: "C típico",
  nseScore: 144,
  participant: {
    externalReference: null,
    id: "profile-1",
    name: "Gabriela Uno"
  },
  resultLabel: "Elegible",
  screenerVersionNumber: 1,
  startedAt: new Date("2026-06-23T15:00:00Z"),
  status: "PASSED",
  statusLabel: "Elegible",
  study,
  terminationCode: "GENERO_NO_ELEGIBLE_LARGO",
  terminationReason: longReason
};

const listData: ScreeningAttemptListData = {
  attempts: [listItem],
  fieldUsers: [listItem.fieldUser!],
  filters: {
    code: undefined,
    dateFrom: undefined,
    dateTo: undefined,
    fieldUserId: undefined,
    participantQuery: "Gabriela",
    status: undefined
  },
  study
};

const detail: ScreeningAttemptDetail = {
  answers: [
    {
      answerText: "Hombre",
      currentlyHidden: false,
      missing: false,
      order: 1,
      questionId: "F1_GENERO",
      questionText: "Género",
      questionType: "SINGLE_CHOICE"
    },
    {
      answerText: "Navigo, Otra. Especificación: Marca local",
      currentlyHidden: false,
      missing: false,
      order: 2,
      questionId: "F6_MARCAS",
      questionText: "Marcas que utiliza",
      questionType: "MULTIPLE_CHOICE"
    }
  ],
  closedAt: new Date("2026-06-23T16:00:00Z"),
  confirmation: null,
  definitionHash: "hash-version-1",
  evidenceReviewStatus: null,
  evaluation: {
    flags: [],
    missingQuestionIds: [],
    reasons: []
  },
  fieldUser: listItem.fieldUser,
  id: "attempt-1",
  nseClassCode: "RANGO-3",
  nseClassLabel: "C típico",
  nseScore: 144,
  participant: {
    email: "participante@example.com",
    externalReference: "REF-1",
    id: "profile-1",
    name: "Participante Uno",
    phone: "5550000000"
  },
  resultLabel: "Elegible",
  screenerVersionNumber: 1,
  startedAt: new Date("2026-06-23T15:00:00Z"),
  status: "PASSED",
  statusLabel: "Elegible",
  study,
  studyId: study.id,
  terminationCode: null,
  terminationReason: null
};

describe("ScreeningSupervisionComponents", () => {
  it("renders empty state without attempts", () => {
    render(<ScreeningAttemptTable attempts={[]} studyId={study.id} />);

    expect(screen.getByText("No hay intentos de screener para este estudio con los filtros actuales.")).toBeInTheDocument();
  });

  it("renders the new participant/reference filter and clear link", () => {
    render(<ScreeningAttemptFilters data={listData} />);

    expect(screen.getByLabelText("Participante o referencia")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Gabriela")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Ej. Gabriela, teléfono o referencia")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Limpiar filtros" })).toHaveAttribute(
      "href",
      "/admin/studies/study-1/screening-attempts"
    );
  });

  it("keeps Ver detalle visible in the participant column without a separate action column", () => {
    render(<ScreeningAttemptTable attempts={listData.attempts} studyId={study.id} />);

    expect(screen.getByRole("link", { name: "Ver detalle" })).toBeInTheDocument();
    expect(screen.queryByText("Acción")).not.toBeInTheDocument();
  });

  it("renders compact cells for reference, NSE and version", () => {
    render(<ScreeningAttemptTable attempts={listData.attempts} studyId={study.id} />);

    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("144 · C típico")).toBeInTheDocument();
    expect(screen.getByText("v1")).toBeInTheDocument();
  });

  it("truncates long reason visually and keeps the full title", () => {
    render(<ScreeningAttemptTable attempts={listData.attempts} studyId={study.id} />);

    const reasonCell = screen.getByTitle(longReason);
    expect(reasonCell).toBeInTheDocument();
    expect(reasonCell.className).toContain("line-clamp-2");
  });

  it("renders detail summary, readable answers and visible NSE code", () => {
    render(<ScreeningAttemptDetailView detail={detail} />);

    expect(screen.getByText("Participante Uno")).toBeInTheDocument();
    expect(screen.getByText("Navigo, Otra. Especificación: Marca local")).toBeInTheDocument();
    expect(screen.getByText("C típico")).toBeInTheDocument();
    expect(screen.getByText("RANGO-3")).toBeInTheDocument();
    expect(screen.queryByText(/answerJson|StudyProduct\.realName/)).not.toBeInTheDocument();
  });

  it("keeps statuses in Spanish", () => {
    render(
      <ScreeningAttemptTable
        attempts={[{ ...listItem, status: "PENDING_REVIEW", statusLabel: "Pendiente de revisión" }]}
        studyId={study.id}
      />
    );

    expect(screen.getByText("Pendiente de revisión")).toBeInTheDocument();
  });

  it("shows confirmed supervision attempts with folio and review state", () => {
    render(
      <ScreeningAttemptDetailView
        detail={{
          ...detail,
          confirmation: {
            folio: "NAV-001",
            manualMessageStatus: "NOT_SENT",
            referenceCodes: [
              { code: "4821", slot: 1 },
              { code: "7710", slot: 2 },
              { code: "9034", slot: 3 }
            ]
          },
          evidenceReviewStatus: "APPROVED",
          resultLabel: "Elegible confirmado",
          status: "PENDING_REVIEW",
          statusLabel: "Elegible confirmado"
        }}
      />
    );

    expect(screen.getAllByText("Elegible confirmado").length).toBeGreaterThan(0);
    expect(screen.getByText("NAV-001")).toBeInTheDocument();
    expect(screen.queryByText("Pendiente de revisión")).not.toBeInTheDocument();
  });

  it("renders participant edit, confirmation codes and dangerous delete action for ADMIN", () => {
    render(
      <EvidenceReviewPanel
        canDeleteTestRecord
        detail={{
          attemptId: "attempt-1",
          attemptStatus: "PASSED",
          cleanupSummary: {
            attemptCount: 1,
            attempts: [
              {
                folio: "NAV-001",
                id: "attempt-1",
                referenceCodes: [
                  { code: "4821", slot: 1 },
                  { code: "7710", slot: 2 },
                  { code: "9034", slot: 3 }
                ],
                source: "PARTICIPANT_PORTAL",
                status: "PASSED"
              }
            ],
            evidenceCount: 0
          },
          confirmation: {
            folio: "NAV-001",
            manualMessageStatus: "NOT_SENT",
            referenceCodes: [
              { code: "4821", slot: 1 },
              { code: "7710", slot: 2 },
              { code: "9034", slot: 3 }
            ],
            whatsappMessage: "Mensaje WhatsApp",
            whatsappUrl: null
          },
          evidence: [],
          f6DeclaredBrands: "Navigo",
          participant: {
            email: "persona@example.com",
            externalReference: "REF-1",
            id: "profile-1",
            name: "GABRIELA",
            phone: "+525512345678"
          },
          review: {
            internalNote: null,
            rejectionReason: null,
            status: "APPROVED"
          },
          study: {
            code: study.code,
            id: study.id,
            name: study.name
          }
        }}
      />
    );

    expect(screen.getByText("Datos del participante")).toBeInTheDocument();
    expect(screen.getByText("Confirmacion final")).toBeInTheDocument();
    expect(screen.getByText("4821")).toBeInTheDocument();
    expect(screen.getAllByText("Eliminar registro de prueba y liberar folio").length).toBeGreaterThan(0);
    expect(screen.getByText("Escribe ELIMINAR PRUEBA para confirmar")).toBeInTheDocument();
    expect(screen.getByText("1: 4821, 2: 7710, 3: 9034")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Esta accion tambien puede eliminar intentos de prueba creados desde Campo. Si el perfil pertenece a un usuario interno, se conservara por seguridad."
      )
    ).toBeInTheDocument();
  });

  it("shows grouped cleanup action when the participant has multiple attempts in the study", () => {
    render(
      <EvidenceReviewPanel
        canDeleteTestRecord
        detail={{
          attemptId: "attempt-1",
          attemptStatus: "PASSED",
          cleanupSummary: {
            attemptCount: 2,
            attempts: [
              {
                folio: "NAV-001",
                id: "attempt-1",
                referenceCodes: [{ code: "4821", slot: 1 }],
                source: "PARTICIPANT_PORTAL",
                status: "PASSED"
              },
              {
                folio: null,
                id: "attempt-2",
                referenceCodes: [],
                source: "FIELD",
                status: "STARTED"
              }
            ],
            evidenceCount: 3
          },
          confirmation: {
            folio: "NAV-001",
            manualMessageStatus: "NOT_SENT",
            referenceCodes: [{ code: "4821", slot: 1 }],
            whatsappMessage: "Mensaje WhatsApp",
            whatsappUrl: null
          },
          evidence: [],
          f6DeclaredBrands: "Navigo",
          participant: {
            email: "persona@example.com",
            externalReference: "REF-1",
            id: "profile-1",
            name: "GABRIELA",
            phone: "+525512345678"
          },
          review: {
            internalNote: null,
            rejectionReason: null,
            status: "APPROVED"
          },
          study: {
            code: study.code,
            id: study.id,
            name: study.name
          }
        }}
      />
    );

    expect(screen.getAllByText("Eliminar todos los intentos de prueba de este participante").length).toBeGreaterThan(0);
    expect(screen.getByText("Intentos a eliminar")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getAllByText("Evidencias").length).toBeGreaterThan(0);
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Escribe ELIMINAR PRUEBAS DEL PARTICIPANTE para confirmar")).toBeInTheDocument();
    expect(screen.getByText(/Esta accion elimina todos los intentos de prueba/)).toBeInTheDocument();
  });
});
