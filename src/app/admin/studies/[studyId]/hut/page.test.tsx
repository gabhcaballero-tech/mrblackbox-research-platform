import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HutAdminPage from "./page";

const requireCapabilityMock = vi.fn();
const getAdminDashboardMock = vi.fn();

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers())
}));

vi.mock("@/shared/auth/session", () => ({
  requireCapability: (...args: unknown[]) => requireCapabilityMock(...args)
}));

vi.mock("@/shared/utils/request-origin", () => ({
  resolveRequestOrigin: vi.fn(() => "https://example.com")
}));

vi.mock("@/modules/hut", () => ({
  createHutRepository: vi.fn(() => ({
    getAdminDashboard: getAdminDashboardMock
  }))
}));

vi.mock("@/modules/hut/actions", () => {
  const action = vi.fn(async () => undefined);
  return {
    assignHutParticipantRotationAction: action,
    completeHutCallEvaluationAction: action,
    createHutParticipantAction: action,
    createHutRegistrationSlotAction: action,
    deleteHutParticipantAction: action,
    markHutMissedDayAction: action,
    reactivateHutParticipantAction: action,
    reviewHutVisualVerificationAction: action,
    resetHutCallEvaluationAction: action,
    resetHutReferenceSelfieAction: action,
    resetHutVideoSubmissionAction: action,
    setHutTestModeAction: action,
    setHutVisualOverrideAction: action,
    startHutBlockAction: action
  };
});

vi.mock("@/shared/ui/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>
}));

vi.mock("@/shared/ui/PageHeader", () => ({
  PageHeader: ({ title, description }: { title: string; description: string }) => (
    <header>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  )
}));

vi.mock("@/shared/ui/StatusBadge", () => ({
  StatusBadge: ({ children }: { children: ReactNode }) => <span>{children}</span>
}));

vi.mock("@/shared/ui/EmptyState", () => ({
  EmptyState: ({ title, description }: { title: string; description: string }) => (
    <div>
      <p>{title}</p>
      <p>{description}</p>
    </div>
  )
}));

vi.mock("@/app/admin/_components/SubmitButton", () => ({
  SubmitButton: ({
    children,
    disabled
  }: {
    children: ReactNode;
    disabled?: boolean;
    pendingLabel: string;
  }) => (
    <button disabled={disabled} type="submit">
      {children}
    </button>
  )
}));

vi.mock("./_components/HutParticipantImportPanel", () => ({
  HutParticipantImportPanel: () => <div>Importar participantes</div>
}));

vi.mock("./_components/HutRegistrationSlotImportPanel", () => ({
  HutRegistrationSlotImportPanel: () => <div>Importar folios</div>
}));

vi.mock("./_components/HutReferenceSelfieUpload", () => ({
  HutReferenceSelfieUpload: ({
    disabled,
    disabledReason,
    participantId
  }: {
    disabled: boolean;
    disabledReason?: string | null;
    participantId: string;
  }) => (
    <div
      data-disabled={disabled ? "true" : "false"}
      data-participant-id={participantId}
      data-testid={`hut-reference-selfie-upload-${participantId}`}
    >
      {disabledReason ? <p>{disabledReason}</p> : null}
      <button disabled={disabled} type="button">
        Tomar selfie de registro
      </button>
    </div>
  )
}));

describe("HutAdminPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireCapabilityMock.mockResolvedValue({ id: "user-1", role: "ADMIN" });
  });

  it("muestra resumen compacto, identidad colapsada y selfie habilitada cuando falta la selfie base", async () => {
    getAdminDashboardMock.mockResolvedValue(
      createDashboard({
        participants: [
          createParticipant({
            block1: {
              blockNumber: 1,
              disqualificationReason: null,
              missedDaysCount: 0,
              status: "IN_PROGRESS",
              submittedVideosCount: 0,
              videos: []
            },
            referenceSelfie: {
              capturedAt: new Date(0),
              signedUrl: null,
              status: "MISSING"
            },
            status: "BLOCK_1_IN_PROGRESS",
            testMode: false
          })
        ]
      })
    );

    render(await HutAdminPage({ params: Promise.resolve({ studyId: "study-hut" }), searchParams: Promise.resolve({}) }));

    expect(screen.getByText("Modo prueba: Inactivo")).toBeInTheDocument();
    expect(screen.getAllByText("Selfie de registro: Faltante").length).toBeGreaterThan(0);
    expect(screen.getByText("Identidad diaria: Pendiente")).toBeInTheDocument();
    expect(screen.getByText("Ver revisión de identidad")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Activar modo prueba" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tomar selfie de registro" })).toBeEnabled();
    expect(screen.getByTestId("hut-reference-selfie-upload-participant-1")).toHaveAttribute("data-disabled", "false");
    expect(screen.getByTestId("hut-identity-review-details-participant-1")).not.toHaveAttribute("open");
    expect(screen.getByTestId("hut-danger-zone-participant-1")).not.toHaveAttribute("open");
  });

  it("mantiene visible el estado de modo prueba activo y permite desactivarlo", async () => {
    getAdminDashboardMock.mockResolvedValue(
      createDashboard({
        participants: [
          createParticipant({
            referenceSelfie: {
              capturedAt: new Date("2026-07-01T12:00:00.000Z"),
              signedUrl: null,
              status: "COMPLETE"
            },
            testMode: true
          })
        ]
      })
    );

    render(await HutAdminPage({ params: Promise.resolve({ studyId: "study-hut" }), searchParams: Promise.resolve({}) }));

    expect(screen.getByText("Modo prueba: Activo")).toBeInTheDocument();
    expect(screen.getByText("Este participante puede avanzar sin esperar 5:00 a.m. ni días reales.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Desactivar modo prueba" })).toBeInTheDocument();
  });

  it("mantiene videos enviados y pendientes en formato compacto sin exponer storage keys", async () => {
    getAdminDashboardMock.mockResolvedValue(
      createDashboard({
        participants: [
          createParticipant({
            block1: {
              blockNumber: 1,
              disqualificationReason: null,
              missedDaysCount: 0,
              status: "IN_PROGRESS",
              submittedVideosCount: 1,
              videos: [
                {
                  sequenceNumber: 1,
                  signedUrl: "https://storage.example/video-1.mp4",
                  status: "SUBMITTED",
                  submittedAt: new Date("2026-07-01T22:04:00.000Z")
                },
                {
                  sequenceNumber: 2,
                  signedUrl: null,
                  status: "PENDING",
                  submittedAt: null
                },
                {
                  sequenceNumber: 3,
                  signedUrl: null,
                  status: "PENDING",
                  submittedAt: null
                }
              ]
            },
            identityReview: {
              items: [
                {
                  attemptSignedUrl: "https://storage.example/daily-selfie.jpg",
                  blockNumber: 1,
                  reviewLabel: "Revisión requerida",
                  reviewedAt: null,
                  reviewedByUserId: null,
                  reviewNotes: null,
                  sequenceNumber: 1,
                  similarityPercentage: 64,
                  status: "UNCERTAIN",
                  verificationDate: new Date("2026-07-01T22:03:00.000Z"),
                  verificationId: "verification-1"
                }
              ],
              lastReviewedAt: null,
              lastStatus: "Revisión requerida",
              referenceSignedUrl: "https://storage.example/reference-selfie.jpg",
              summaryLabel: "REVISION_REQUERIDA"
            },
            referenceSelfie: {
              capturedAt: new Date("2026-07-01T12:00:00.000Z"),
              signedUrl: "https://storage.example/reference-selfie.jpg",
              status: "COMPLETE"
            }
          })
        ]
      })
    );

    render(await HutAdminPage({ params: Promise.resolve({ studyId: "study-hut" }), searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("link", { name: "Ver video" })).toHaveAttribute("href", "https://storage.example/video-1.mp4");
    expect(screen.getByText("Restablecer video")).toBeInTheDocument();
    expect(screen.getAllByText("Pendiente").length).toBeGreaterThan(0);
    expect(screen.queryByText(/privateStorageKey/i)).not.toBeInTheDocument();
  });
});

type TestParticipant = {
  availability: {
    nextAvailableAt: Date | null;
    reason: string;
  };
  block1: {
    blockNumber: number;
    disqualificationReason: string | null;
    missedDaysCount: number;
    status: "CALL_PENDING" | "COMPLETED" | "DISQUALIFIED" | "IN_PROGRESS" | "NOT_STARTED";
    submittedVideosCount: number;
    videos: Array<{ sequenceNumber: number; signedUrl: string | null; status: string; submittedAt?: Date | null }>;
  } | null;
  block2: {
    blockNumber: number;
    disqualificationReason: string | null;
    missedDaysCount: number;
    status: "CALL_PENDING" | "COMPLETED" | "DISQUALIFIED" | "IN_PROGRESS" | "NOT_STARTED";
    submittedVideosCount: number;
    videos: Array<{ sequenceNumber: number; signedUrl: string | null; status: string; submittedAt?: Date | null }>;
  } | null;
  call1: {
    blockNumber: number;
    completedAt: Date | null;
    status: "COMPLETED" | "NO_ANSWER" | "PENDING" | "RESCHEDULE_NEEDED" | "SCHEDULED";
  } | null;
  call2: {
    blockNumber: number;
    completedAt: Date | null;
    status: "COMPLETED" | "NO_ANSWER" | "PENDING" | "RESCHEDULE_NEEDED" | "SCHEDULED";
  } | null;
  currentBlockNumber: number;
  currentVideoSequence: number;
  email: string | null;
  firstFragranceLeftArm: string | null;
  folio: string | null;
  id: string;
  identityReview: {
    items: Array<{
      attemptSignedUrl: string | null;
      blockNumber: number;
      reviewLabel: string;
      reviewedAt: Date | null;
      reviewedByUserId: string | null;
      reviewNotes: string | null;
      sequenceNumber: number;
      similarityPercentage: number | null;
      status: "MATCHED" | "NOT_MATCHED" | "NOT_REQUIRED_BY_OVERRIDE" | "PENDING" | "PENDING_REVIEW" | "UNCERTAIN";
      verificationDate: Date | null;
      verificationId: string | null;
    }>;
    lastReviewedAt: Date | null;
    lastStatus: string | null;
    referenceSignedUrl: string | null;
    summaryLabel: "FALLIDA" | "OK" | "PENDIENTE" | "REVISION_REQUERIDA" | "SIN_SELFIE_BASE";
  };
  link: string;
  name: string;
  phone: string | null;
  recruiter: string | null;
  referenceSelfie: {
    capturedAt: Date;
    signedUrl: string | null;
    status: "COMPLETE" | "MISSING";
  };
  registrationSlot: {
    folio: string;
    id: string;
    status: "AVAILABLE" | "CANCELLED" | "REGISTERED";
  } | null;
  reminderPending: boolean;
  secondFragranceRightArm: string | null;
  status:
    | "BLOCK_1_CALL_PENDING"
    | "BLOCK_1_IN_PROGRESS"
    | "BLOCK_2_CALL_PENDING"
    | "BLOCK_2_IN_PROGRESS"
    | "COMPLETED"
    | "DISQUALIFIED"
    | "NOT_STARTED";
  testMode: boolean;
  token: string;
  usedToleranceInCurrentBlock: boolean;
  visualOverrideEnabled: boolean;
};

type TestDashboard = {
  participants: TestParticipant[];
  registrationSlots: [];
  study: {
    code: string;
    id: string;
    name: string;
    status: "ACTIVE";
    timeZoneIana: string;
  };
};

function createDashboard(overrides?: Partial<TestDashboard>): TestDashboard {
  return {
    participants: [createParticipant()],
    registrationSlots: [],
    study: {
      code: "HUT-TEST",
      id: "study-hut",
      name: "Estudio HUT",
      status: "ACTIVE" as const,
      timeZoneIana: "America/Mexico_City"
    },
    ...overrides
  };
}

function baseParticipant() {
  return {
    availability: {
      nextAvailableAt: null,
      reason: "BLOCK_NOT_ACTIVE"
    },
    block1: {
      blockNumber: 1,
      disqualificationReason: null,
      missedDaysCount: 0,
      status: "NOT_STARTED" as const,
      submittedVideosCount: 0,
      videos: []
    },
    block2: {
      blockNumber: 2,
      disqualificationReason: null,
      missedDaysCount: 0,
      status: "NOT_STARTED" as const,
      submittedVideosCount: 0,
      videos: []
    },
    call1: {
      blockNumber: 1,
      completedAt: null,
      status: "PENDING" as const
    },
    call2: {
      blockNumber: 2,
      completedAt: null,
      status: "PENDING" as const
    },
    currentBlockNumber: 1,
    currentVideoSequence: 1,
    email: null,
    firstFragranceLeftArm: "FRAGANCIA A",
    folio: "HUT-001",
    id: "participant-1",
    identityReview: {
      items: [
        {
          attemptSignedUrl: null,
          blockNumber: 1,
          reviewLabel: "Pendiente",
          reviewedAt: null,
          reviewedByUserId: null,
          reviewNotes: null,
          sequenceNumber: 1,
          similarityPercentage: null,
          status: "PENDING" as const,
          verificationDate: null,
          verificationId: null
        }
      ],
      lastReviewedAt: null,
      lastStatus: null,
      referenceSignedUrl: null,
      summaryLabel: "PENDIENTE" as const
    },
    link: "https://example.com/hut/p/token-1",
    name: "Participante HUT",
    phone: null,
    recruiter: null,
    referenceSelfie: {
      capturedAt: new Date(0),
      signedUrl: null,
      status: "MISSING" as const
    },
    registrationSlot: null,
    reminderPending: false,
    secondFragranceRightArm: "FRAGANCIA B",
    status: "NOT_STARTED" as const,
    testMode: false,
    token: "token-1",
    usedToleranceInCurrentBlock: false,
    visualOverrideEnabled: false
  };
}

function createParticipant(overrides?: Partial<TestParticipant>): TestParticipant {
  return {
    ...baseParticipant(),
    ...overrides
  };
}
