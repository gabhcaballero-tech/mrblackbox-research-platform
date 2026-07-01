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

  it("shows visible test mode controls on the participant card and keeps missing registration selfie enabled after block 1 started", async () => {
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
    expect(screen.getByRole("button", { name: "Activar modo prueba" })).toBeInTheDocument();
    expect(screen.getByText("Selfie de registro:")).toBeInTheDocument();
    expect(screen.getByText("Faltante")).toBeInTheDocument();
    expect(screen.getByTestId("hut-reference-selfie-upload-participant-1")).toHaveAttribute("data-disabled", "false");
    expect(screen.getByRole("button", { name: "Tomar selfie de registro" })).toBeEnabled();
  });

  it("shows active test mode state and allows turning it off from the main participant card", async () => {
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
    expect(screen.getByText("Este participante puede avanzar sin esperar 5:00 a.m. ni dias reales.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Desactivar modo prueba" })).toBeInTheDocument();
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
