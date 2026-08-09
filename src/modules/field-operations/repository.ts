import { createCltOperationsRepository } from "@/modules/clt-operations";
import type { CltOperationsActivitySummary, CltOperationsDetail, CltOperationsHutSummary } from "@/modules/clt-operations/types";
import { hashCtlInterviewerCode, normalizeCtlCode } from "@/modules/ctl/service";
import { createPrismaClient, type PrismaClientLike } from "@/shared/db/client";
import type {
  FieldOperationsDashboard,
  FieldOperationsInterviewerCode,
  FieldOperationsStudy
} from "./types";

type Delegate = {
  findFirst?: (args: unknown) => Promise<unknown>;
  findMany?: (args: unknown) => Promise<unknown[]>;
};

type FieldOperationsPrismaClient = PrismaClientLike & {
  ctlInterviewerCode: Delegate;
  hutParticipant: Delegate;
  studyParticipant: Delegate;
  study: Delegate;
};

export type FieldOperationsRepository = {
  getDashboard: (input: {
    actorName: string;
    actorRole: "ADMIN" | "ANALYST" | "INTERVIEWER" | "SUPERVISOR";
    detailSessionId?: string | null;
    interviewerCode?: string | null;
    interviewerCodeId?: string | null;
    interviewerUserId: string;
    mode?: "ADMIN" | "INTERVIEWER_CODE";
    studyId?: string | null;
  }) => Promise<FieldOperationsDashboard>;
};

export function createFieldOperationsRepository(
  prismaClient?: FieldOperationsPrismaClient
): FieldOperationsRepository {
  async function getPrisma() {
    return prismaClient ?? ((await createPrismaClient()) as FieldOperationsPrismaClient);
  }

  return {
    async getDashboard(input) {
      const prisma = await getPrisma();
      const isAdminMode = input.actorRole === "ADMIN" && input.mode === "ADMIN";
      const codeAccess = !isAdminMode
        ? await resolveInterviewerCodeAccess(prisma, input.interviewerCode)
        : null;
      if (!isAdminMode && !codeAccess?.ok) {
        return {
          actorName: input.actorName,
          detail: null,
          interviewerCodes: [],
          participants: [],
          selectedStudyId: null,
          studies: [],
          viewer: {
            error: codeAccess?.message ?? null,
            mode: "CODE_REQUIRED"
          }
        };
      }

      const studies = isAdminMode
        ? await listAdminStudies(prisma)
        : codeAccess?.ok
          ? [codeAccess.interviewerCode.study]
          : [];
      const selectedStudyId = input.studyId && studies.some((study) => study.id === input.studyId)
        ? input.studyId
        : studies[0]?.id ?? null;
      const interviewerCodes = selectedStudyId ? await listStudyInterviewerCodes(prisma, selectedStudyId) : [];
      const selectedAdminInterviewerCodeId = isAdminMode && input.interviewerCodeId
        && interviewerCodes.some((code) => code.id === input.interviewerCodeId)
        ? input.interviewerCodeId
        : null;
      const dashboard = selectedStudyId
        ? await createCltOperationsRepository(prisma as never).getDashboard({
            ctlInterviewerCodeId: isAdminMode ? selectedAdminInterviewerCodeId : codeAccess?.ok ? codeAccess.interviewerCode.id : null,
            detailSessionId: input.detailSessionId,
            interviewerUserId: null,
            studyId: selectedStudyId
          })
        : null;
      const participants = selectedStudyId
        ? await buildOperationalParticipants({
            baseParticipants: dashboard?.participants ?? [],
            interviewerCodeId: isAdminMode ? selectedAdminInterviewerCodeId : codeAccess?.ok ? codeAccess.interviewerCode.id : null,
            prisma,
            studyId: selectedStudyId
          })
        : [];
      const detail = input.detailSessionId
        ? participants.find((participant) => participant.id === input.detailSessionId) ?? dashboard?.detail ?? null
        : dashboard?.detail ?? null;

      return {
        actorName: input.actorName,
        detail,
        interviewerCodes,
        participants,
        selectedStudyId,
        studies,
        viewer: isAdminMode
          ? {
              filterInterviewerCodeId: selectedAdminInterviewerCodeId,
              mode: "ADMIN"
            }
          : {
              code: codeAccess?.ok ? codeAccess.code : "",
              id: codeAccess?.ok ? codeAccess.interviewerCode.id : "",
              label: codeAccess?.ok ? codeAccess.interviewerCode.label : "",
              mode: "INTERVIEWER_CODE"
            }
      };
    }
  };
}

type FieldOperationsInterviewerCodeRecord = {
  expiresAt: Date | null;
  id: string;
  label: string;
  status: string;
  study: FieldOperationsStudy;
  studyId: string;
};

async function resolveInterviewerCodeAccess(
  prisma: FieldOperationsPrismaClient,
  codeValue: string | null | undefined
): Promise<
  | {
      code: string;
      interviewerCode: FieldOperationsInterviewerCodeRecord;
      ok: true;
    }
  | {
      message: string | null;
      ok: false;
    }
> {
  const code = normalizeCtlCode(codeValue);
  if (!code) {
    return { message: null, ok: false };
  }

  const interviewerCode = await prisma.ctlInterviewerCode.findFirst?.({
    select: {
      expiresAt: true,
      id: true,
      label: true,
      status: true,
      study: {
        select: {
          code: true,
          id: true,
          name: true,
          timeZoneIana: true
        }
      },
      studyId: true
    },
    where: {
      codeHash: hashCtlInterviewerCode(code)
    }
  }) as FieldOperationsInterviewerCodeRecord | null;

  if (!interviewerCode || !isUsableInterviewerCode(interviewerCode, new Date())) {
    return { message: "El código de encuestador no es válido.", ok: false };
  }

  return {
    code,
    interviewerCode,
    ok: true
  };
}

async function listAdminStudies(prisma: FieldOperationsPrismaClient): Promise<FieldOperationsStudy[]> {
  const studies = await prisma.study.findMany?.({
    orderBy: { name: "asc" },
    select: {
      code: true,
      id: true,
      name: true,
      timeZoneIana: true
    },
    where: {
      OR: [
        {
          ctlSessions: {
            some: {
              studyParticipant: {
                qaParticipantRun: { is: null }
              }
            }
          }
        },
        {
          hutParticipants: {
            some: {
              qaParticipantRun: { is: null }
            }
          }
        },
        {
          participants: {
            some: {
              qaParticipantRun: { is: null },
              OR: [
                { accessTokens: { some: {} } },
                { activities: { some: {} } },
                { applicationStartedAt: { not: null } }
              ]
            }
          }
        }
      ]
    }
  }) as FieldOperationsStudy[] | undefined;

  return studies ?? [];
}

const fieldActivitySelect = {
  activitySchedule: {
    select: {
      code: true,
      name: true,
      sortOrder: true
    }
  },
  actualCompletedAt: true,
  availableFrom: true,
  id: true,
  participantActivityEvidence: {
    select: {
      id: true
    }
  },
  reminders: {
    orderBy: { scheduledFor: "asc" },
    select: {
      id: true,
      scheduledFor: true,
      sentAt: true,
      status: true
    }
  },
  scheduledAt: true,
  status: true
} as const;

const fieldArmAssignmentSelect = {
  applicationOrder: true,
  participantVisibleLabel: true,
  studyArm: {
    select: {
      code: true,
      label: true
    }
  },
  studyProduct: {
    select: {
      displayLabel: true,
      internalCode: true
    }
  }
} as const;

const fieldStudyParticipantSelect = {
  accessTokens: {
    orderBy: { createdAt: "desc" },
    select: {
      expiresAt: true,
      id: true,
      status: true
    }
  },
  activities: {
    orderBy: [{ scheduledAt: "asc" }],
    select: fieldActivitySelect
  },
  applicationStartedAt: true,
  armAssignments: {
    orderBy: { applicationOrder: "asc" },
    select: fieldArmAssignmentSelect
  },
  id: true,
  participantConfirmation: {
    select: {
      folio: true
    }
  },
  participantProfile: {
    select: {
      name: true
    }
  },
  rotationAssignment: {
    select: {
      rotationCode: true,
      rotationPlan: {
        select: {
          name: true
        }
      }
    }
  }
} as const;

const fieldHutParticipantSelect = {
  applicationPhotoEntries: {
    select: { id: true }
  },
  createdAt: true,
  folio: true,
  id: true,
  name: true,
  origin: true,
  protocolVersion: true,
  questionnaireAttempt: {
    select: {
      status: true,
      visits: {
        orderBy: { createdAt: "asc" },
        select: {
          section: true,
          status: true
        }
      }
    }
  },
  status: true,
  studyParticipant: {
    select: {
      id: true,
      participantConfirmation: {
        select: {
          folio: true
        }
      },
      participantProfile: {
        select: {
          name: true
        }
      }
    }
  },
  testMode: true,
  token: true,
  updatedAt: true
} as const;

async function buildOperationalParticipants({
  baseParticipants,
  interviewerCodeId,
  prisma,
  studyId
}: {
  baseParticipants: CltOperationsDetail[];
  interviewerCodeId: string | null;
  prisma: FieldOperationsPrismaClient;
  studyId: string;
}): Promise<CltOperationsDetail[]> {
  const byKey = new Map<string, CltOperationsDetail>();

  for (const participant of baseParticipants) {
    byKey.set(studyParticipantKey(participant.participantId), participant);
  }

  const studyParticipants = await listNavigoOperationalParticipants(prisma, { interviewerCodeId, studyId });
  for (const participant of studyParticipants) {
    const key = studyParticipantKey(participant.id);
    if (!byKey.has(key)) {
      byKey.set(key, toSyntheticNavigoParticipant(participant));
    }
  }

  const hutParticipants = await listHutOperationalParticipants(prisma, { interviewerCodeId, studyId });
  for (const hut of hutParticipants) {
    const key = hut.studyParticipant?.id ? studyParticipantKey(hut.studyParticipant.id) : hutParticipantKey(hut.id);
    const existing = byKey.get(key);
    if (existing) {
      existing.hut = toHutSummary(hut);
      if (existing.folio === "Sin folio" && hut.studyParticipant?.participantConfirmation?.folio) {
        existing.folio = hut.studyParticipant.participantConfirmation.folio;
      }
      continue;
    }
    byKey.set(key, toSyntheticHutParticipant(hut));
  }

  return [...byKey.values()].sort(compareOperationalParticipants);
}

async function listNavigoOperationalParticipants(
  prisma: FieldOperationsPrismaClient,
  input: { interviewerCodeId: string | null; studyId: string }
): Promise<FieldStudyParticipantRecord[]> {
  const participants = await prisma.studyParticipant.findMany?.({
    orderBy: { updatedAt: "desc" },
    select: fieldStudyParticipantSelect,
    where: {
      ...(input.interviewerCodeId ? { ctlSessions: { some: { ctlInterviewerCodeId: input.interviewerCodeId } } } : {}),
      qaParticipantRun: { is: null },
      studyId: input.studyId,
      OR: [
        { accessTokens: { some: {} } },
        { activities: { some: {} } },
        { applicationStartedAt: { not: null } }
      ]
    }
  }) as FieldStudyParticipantRecord[] | undefined;

  return participants ?? [];
}

async function listHutOperationalParticipants(
  prisma: FieldOperationsPrismaClient,
  input: { interviewerCodeId: string | null; studyId: string }
): Promise<FieldHutParticipantRecord[]> {
  const participants = await prisma.hutParticipant.findMany?.({
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    select: fieldHutParticipantSelect,
    where: {
      ...(input.interviewerCodeId ? { studyParticipant: { ctlSessions: { some: { ctlInterviewerCodeId: input.interviewerCodeId } } } } : {}),
      qaParticipantRun: { is: null },
      studyId: input.studyId
    }
  }) as FieldHutParticipantRecord[] | undefined;

  return participants ?? [];
}

type FieldActivityRecord = {
  activitySchedule: {
    code: string;
    name: string;
    sortOrder: number;
  };
  actualCompletedAt: Date | null;
  availableFrom: Date;
  id: string;
  participantActivityEvidence: Array<{ id: string }>;
  reminders: Array<{
    id: string;
    scheduledFor: Date | null;
    sentAt: Date | null;
    status: string;
  }>;
  scheduledAt: Date;
  status: string;
};

type FieldArmAssignmentRecord = {
  applicationOrder: number;
  participantVisibleLabel: string;
  studyArm: {
    code: string;
    label: string;
  };
  studyProduct: {
    displayLabel: string;
    internalCode: string;
  };
};

type FieldStudyParticipantRecord = {
  accessTokens: Array<{
    expiresAt: Date;
    id: string;
    status: string;
  }>;
  activities: FieldActivityRecord[];
  applicationStartedAt: Date | null;
  armAssignments: FieldArmAssignmentRecord[];
  id: string;
  participantConfirmation: {
    folio: string;
  } | null;
  participantProfile: {
    name: string;
  };
  rotationAssignment: {
    rotationCode: string;
    rotationPlan: {
      name: string;
    };
  } | null;
};

type FieldHutParticipantRecord = {
  applicationPhotoEntries: Array<{ id: string }>;
  createdAt: Date;
  folio: string | null;
  id: string;
  name: string;
  origin: string;
  protocolVersion: string;
  questionnaireAttempt: {
    status: string;
    visits: Array<{
      section: string;
      status: string;
    }>;
  } | null;
  status: string;
  studyParticipant: {
    id: string;
    participantConfirmation: {
      folio: string;
    } | null;
    participantProfile: {
      name: string;
    };
  } | null;
  testMode: boolean;
  token: string;
  updatedAt: Date;
};

function toSyntheticNavigoParticipant(participant: FieldStudyParticipantRecord): CltOperationsDetail {
  return {
    answerGroups: [],
    answeredCount: 0,
    cltCompletedAt: null,
    cltProgressLabel: "No disponible",
    cltStartedAt: null,
    cltStatus: "NO_DISPONIBLE",
    folio: participant.participantConfirmation?.folio ?? "Sin folio",
    hut: emptyHutSummary(),
    id: `nav:${participant.id}`,
    interviewer: null,
    navigoActivities: participant.activities.map(toActivitySummary),
    navigoLinkToken: participant.accessTokens.find((token) => token.status === "ACTIVE")?.id ?? null,
    participantId: participant.id,
    participantName: participant.participantProfile.name,
    phaseProgress: [],
    questionCount: 0,
    reminders: participant.activities.flatMap((activity) =>
      activity.reminders.map((reminder) => ({
        activityCode: activity.activitySchedule.code,
        id: reminder.id,
        sentAt: reminder.sentAt,
        status: reminder.status
      }))
    ),
    rotation: toRotationSummary(participant),
    t0: participant.applicationStartedAt,
    whatsapp: emptyWhatsAppSummary()
  };
}

function toSyntheticHutParticipant(participant: FieldHutParticipantRecord): CltOperationsDetail {
  const studyParticipant = participant.studyParticipant;

  return {
    answerGroups: [],
    answeredCount: 0,
    cltCompletedAt: null,
    cltProgressLabel: "No disponible",
    cltStartedAt: null,
    cltStatus: "NO_DISPONIBLE",
    folio: studyParticipant?.participantConfirmation?.folio ?? participant.folio ?? "Sin folio",
    hut: toHutSummary(participant),
    id: `hut:${participant.id}`,
    interviewer: null,
    navigoActivities: [],
    navigoLinkToken: null,
    participantId: studyParticipant?.id ?? `hut:${participant.id}`,
    participantName: studyParticipant?.participantProfile.name ?? participant.name,
    phaseProgress: [],
    questionCount: 0,
    reminders: [],
    rotation: {
      arms: [],
      firstSampleKey: null,
      rotationCode: null,
      secondSampleKey: null
    },
    t0: null,
    whatsapp: emptyWhatsAppSummary()
  };
}

function toActivitySummary(activity: FieldActivityRecord): CltOperationsActivitySummary {
  return {
    availableFrom: activity.availableFrom,
    code: activity.activitySchedule.code,
    completedAt: activity.actualCompletedAt,
    evidenceCount: activity.participantActivityEvidence.length,
    id: activity.id,
    name: activity.activitySchedule.name,
    scheduledAt: activity.scheduledAt,
    status: activity.status
  };
}

function toRotationSummary(participant: FieldStudyParticipantRecord): CltOperationsDetail["rotation"] {
  const arms = participant.armAssignments.map((assignment) => ({
    armCode: assignment.studyArm.code,
    armLabel: assignment.studyArm.label,
    order: assignment.applicationOrder,
    productCode: assignment.studyProduct.internalCode,
    productLabel: assignment.studyProduct.displayLabel,
    visibleLabel: assignment.participantVisibleLabel
  }));

  return {
    arms,
    firstSampleKey: arms.find((arm) => arm.order === 1)?.productCode ?? null,
    rotationCode: participant.rotationAssignment?.rotationCode ?? null,
    secondSampleKey: arms.find((arm) => arm.order === 2)?.productCode ?? null
  };
}

function toHutSummary(participant: FieldHutParticipantRecord): CltOperationsHutSummary {
  const activeVisit = participant.questionnaireAttempt?.visits.find((visit) => visit.status !== "COMPLETED") ?? null;

  return {
    applicationPhotoCount: participant.applicationPhotoEntries.length,
    currentSection: activeVisit?.section ?? null,
    folio: participant.folio,
    id: participant.id,
    origin: participant.origin,
    protocolVersion: participant.protocolVersion,
    questionnaireStatus: participant.questionnaireAttempt?.status ?? null,
    status: participant.status,
    testMode: participant.testMode,
    token: participant.token
  };
}

function emptyHutSummary(): CltOperationsHutSummary {
  return {
    applicationPhotoCount: 0,
    currentSection: null,
    folio: null,
    id: null,
    origin: null,
    protocolVersion: null,
    questionnaireStatus: null,
    status: null,
    testMode: false,
    token: null
  };
}

function emptyWhatsAppSummary(): CltOperationsDetail["whatsapp"] {
  return {
    lastMessageAt: null,
    lastStatus: null,
    messageCount: 0,
    templateNames: []
  };
}

function studyParticipantKey(participantId: string): string {
  return `study:${participantId}`;
}

function hutParticipantKey(participantId: string): string {
  return `hut:${participantId}`;
}

function compareOperationalParticipants(left: CltOperationsDetail, right: CltOperationsDetail): number {
  const leftTime = latestOperationalTime(left)?.getTime() ?? 0;
  const rightTime = latestOperationalTime(right)?.getTime() ?? 0;
  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }
  return left.folio.localeCompare(right.folio);
}

function latestOperationalTime(participant: CltOperationsDetail): Date | null {
  return [
    participant.cltCompletedAt,
    participant.cltStartedAt,
    participant.t0,
    ...participant.navigoActivities.map((activity) => activity.completedAt ?? activity.availableFrom ?? activity.scheduledAt)
  ]
    .filter((value): value is Date => value instanceof Date)
    .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
}

async function listStudyInterviewerCodes(
  prisma: FieldOperationsPrismaClient,
  studyId: string
): Promise<FieldOperationsInterviewerCode[]> {
  const codes = await prisma.ctlInterviewerCode.findMany?.({
    orderBy: { label: "asc" },
    select: {
      id: true,
      label: true,
      status: true
    },
    where: { studyId }
  }) as FieldOperationsInterviewerCode[] | undefined;

  return codes ?? [];
}

function isUsableInterviewerCode(
  interviewerCode: Pick<FieldOperationsInterviewerCodeRecord, "expiresAt" | "status">,
  now: Date
): boolean {
  if (interviewerCode.status !== "ACTIVE") {
    return false;
  }

  return !interviewerCode.expiresAt || interviewerCode.expiresAt.getTime() > now.getTime();
}
