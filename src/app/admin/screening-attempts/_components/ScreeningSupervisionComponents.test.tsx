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
  recruiterName: null,
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

  it("shows an Excel export action that preserves current filters", () => {
    render(<ScreeningAttemptFilters data={{ ...listData, filters: { ...listData.filters, code: "PASSED" } }} />);

    expect(screen.getByRole("link", { name: "Exportar Excel (TSV)" })).toHaveAttribute(
      "href",
      "/admin/studies/study-1/screening-attempts/export?participantQuery=Gabriela&code=PASSED"
    );
    expect(
      screen.getByText("La exportacion descarga un archivo tabulado compatible con Excel y respeta los filtros actuales.")
    ).toBeInTheDocument();
  });

  it("disables the export action when there are no attempts to export", () => {
    render(<ScreeningAttemptFilters data={{ ...listData, attempts: [] }} />);

    expect(screen.queryByRole("link", { name: "Exportar Excel (TSV)" })).not.toBeInTheDocument();
    expect(screen.getByText("Exportar Excel (TSV)")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("No hay intentos con los filtros actuales para exportar.")).toBeInTheDocument();
  });

  it("renders the export control without client event handlers", () => {
    render(<ScreeningAttemptFilters data={listData} />);

    const exportLink = screen.getByRole("link", { name: "Exportar Excel (TSV)" });

    expect(exportLink.getAttribute("href")).toBe("/admin/studies/study-1/screening-attempts/export?participantQuery=Gabriela");
    expect(exportLink.getAttribute("onClick")).toBeNull();
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

  it("shows recruiter below participant when present", () => {
    render(
      <ScreeningAttemptTable
        attempts={[{ ...listItem, recruiterName: "MAR\u00cdA \u00d1AND\u00da" }]}
        studyId={study.id}
      />
    );

    expect(screen.getByText(/Reclutador:/)).toBeInTheDocument();
    expect(screen.getByText(/MAR\u00cdA \u00d1AND\u00da/)).toBeInTheDocument();
    expect(screen.getByTitle("Reclutador: MAR\u00cdA \u00d1AND\u00da")).toBeInTheDocument();
  });

  it("renders start and close times using the study time zone", () => {
    render(<ScreeningAttemptTable attempts={listData.attempts} studyId={study.id} />);

    expect(screen.getByText("23 jun 2026, 9:00 a.m.")).toBeInTheDocument();
    expect(screen.getByText("23 jun 2026, 10:00 a.m.")).toBeInTheDocument();
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
    expect(screen.getByText("23 jun 2026, 9:00 a.m.")).toBeInTheDocument();
    expect(screen.getByText("23 jun 2026, 10:00 a.m.")).toBeInTheDocument();
    expect(screen.queryByText(/answerJson|StudyProduct\.realName/)).not.toBeInTheDocument();
  });

  it("falls back to America/Mexico_City when the study time zone is invalid", () => {
    render(
      <ScreeningAttemptDetailView
        detail={{
          ...detail,
          study: {
            ...study,
            timeZoneIana: "Invalid/Zone"
          }
        }}
      />
    );

    expect(screen.getByText("23 jun 2026, 9:00 a.m.")).toBeInTheDocument();
    expect(screen.getByText("23 jun 2026, 10:00 a.m.")).toBeInTheDocument();
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

  it("renders full evidence previews, signed links and inconsistency alert", () => {
    render(
      <EvidenceReviewPanel
        detail={{
          attemptId: "attempt-1",
          attemptStatus: "PASSED",
          cleanupSummary: {
            attemptCount: 1,
            attempts: [],
            evidenceCount: 2
          },
          confirmation: null,
          evidence: [
            {
              filename: "selfie.jpg",
              id: "evidence-1",
              mimeType: "image/jpeg",
              reviewStatus: "PENDING",
              signedUrl: "https://signed.example/selfie",
              sizeBytes: 100,
              type: "SELFIE_IDENTIFICATION"
            },
            {
              filename: "perfume.jpg",
              id: "evidence-2",
              mimeType: "image/jpeg",
              reviewStatus: "PENDING",
              signedUrl: "https://signed.example/perfume",
              sizeBytes: 100,
              type: "PERFUME_PHOTO"
            }
          ],
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
            rejectionReason: "Revisión cerrada antes de tiempo",
            status: "REJECTED"
          },
          reviewState: {
            canReopen: true,
            evidenceStatuses: [
              {
                filename: "selfie.jpg",
                id: "evidence-1",
                status: "PENDING",
                type: "SELFIE_IDENTIFICATION"
              },
              {
                filename: "perfume.jpg",
                id: "evidence-2",
                status: "PENDING",
                type: "PERFUME_PHOTO"
              }
            ],
            hasInconsistency: true,
            hasPendingEvidence: true,
            inconsistencyMessage:
              "Hay una inconsistencia: existen evidencias pendientes pero la revisión global no está pendiente.",
            pendingEvidenceCount: 2,
            reviewStatus: "REJECTED"
          },
          study: {
            code: study.code,
            id: study.id,
            name: study.name
          }
        }}
      />
    );

    const preview = screen.getByAltText("Selfie de identificación");
    expect(preview.className).toContain("object-contain");
    expect(screen.getAllByRole("link", { name: "Ver imagen completa" })[0]).toHaveAttribute(
      "href",
      "https://signed.example/selfie"
    );
    expect(screen.getByText("Estado de la revisión")).toBeInTheDocument();
    expect(screen.getByText("Inconsistencia de revisión")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reabrir revisión" })).toBeInTheDocument();
    expect(screen.queryByText("private/selfie.jpg")).not.toBeInTheDocument();
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
          reviewState: {
            canReopen: false,
            evidenceStatuses: [],
            hasInconsistency: false,
            hasPendingEvidence: false,
            inconsistencyMessage: null,
            pendingEvidenceCount: 0,
            reviewStatus: "APPROVED"
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
    expect(screen.getByRole("button", { name: "Regenerar codigos de 4 caracteres" })).toBeInTheDocument();
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
          reviewState: {
            canReopen: false,
            evidenceStatuses: [],
            hasInconsistency: false,
            hasPendingEvidence: false,
            inconsistencyMessage: null,
            pendingEvidenceCount: 0,
            reviewStatus: "APPROVED"
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

  it("shows focused cleanup errors in the dangerous cleanup zone", () => {
    render(
      <EvidenceReviewPanel
        canDeleteTestRecord
        error="No se puede eliminar porque existen relaciones no soportadas: participant_activities."
        focus="zona-peligro"
        detail={{
          attemptId: "attempt-1",
          attemptStatus: "PASSED",
          cleanupSummary: {
            attemptCount: 1,
            attempts: [
              {
                folio: null,
                id: "attempt-1",
                referenceCodes: [],
                source: "FIELD",
                status: "PASSED"
              }
            ],
            evidenceCount: 0
          },
          confirmation: null,
          evidence: [],
          f6DeclaredBrands: "Navigo",
          participant: {
            email: "persona@example.com",
            externalReference: "REF-1",
            id: "profile-1",
            name: "GABRIELA",
            phone: "+525512345678"
          },
          review: null,
          reviewState: {
            canReopen: false,
            evidenceStatuses: [],
            hasInconsistency: false,
            hasPendingEvidence: false,
            inconsistencyMessage: null,
            pendingEvidenceCount: 0,
            reviewStatus: "NONE"
          },
          study: {
            code: study.code,
            id: study.id,
            name: study.name
          }
        }}
      />
    );

    const dangerZone = document.getElementById("zona-peligro");

    expect(dangerZone).not.toBeNull();
    expect(dangerZone?.textContent).toContain(
      "No se puede eliminar porque existen relaciones no soportadas: participant_activities."
    );
  });
});
