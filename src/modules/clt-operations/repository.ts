import { createPrismaClient, type PrismaClientLike } from "@/shared/db/client";
import {
  buildCltAnswerGroups,
  resolveCltApplicableProgress
} from "./service";
import type {
  CltOperationsActivitySummary,
  CltOperationsDashboard,
  CltOperationsDetail,
  CltOperationsHutSummary,
  CltOperationsReminderSummary,
  CltOperationsRotationSummary,
  CltOperationsWhatsAppSummary
} from "./types";

type Delegate = {
  findFirst?: (args: unknown) => Promise<unknown>;
  findMany?: (args: unknown) => Promise<unknown[]>;
  findUnique?: (args: unknown) => Promise<unknown>;
};

type CltOperationsPrismaClient = PrismaClientLike & {
  ctlSession: Delegate;
  oneuiWhatsAppConversation?: Delegate;
  study: Delegate;
};

type CltOperationsRepositoryOptions = {
  includeQa?: boolean;
};

export type CltOperationsRepository = {
  getDashboard: (input: {
    ctlInterviewerCodeId?: string | null;
    detailSessionId?: string | null;
    interviewerUserId?: string | null;
    studyId: string;
  }) => Promise<CltOperationsDashboard | null>;
};

export function createCltOperationsRepository(
  prismaClient?: CltOperationsPrismaClient,
  options: CltOperationsRepositoryOptions = {}
): CltOperationsRepository {
  async function getPrisma() {
    return prismaClient ?? ((await createPrismaClient()) as CltOperationsPrismaClient);
  }

  return {
    async getDashboard(input) {
      const prisma = await getPrisma();
      const study = await prisma.study.findUnique?.({
        select: {
          code: true,
          id: true,
          name: true,
          timeZoneIana: true
        },
        where: { id: input.studyId }
      }) as StudyRecord | null;

      if (!study) {
        return null;
      }

      const sessions = await prisma.ctlSession.findMany?.({
        orderBy: [
          { createdAt: "desc" }
        ],
        select: sessionSelect,
        where: {
          ...(input.ctlInterviewerCodeId
            ? { ctlInterviewerCodeId: input.ctlInterviewerCodeId }
            : input.interviewerUserId
              ? { interviewerId: input.interviewerUserId }
              : {}),
          studyId: input.studyId,
          ...(options.includeQa ? {} : { studyParticipant: { qaParticipantRun: { is: null } } })
        }
      }) as SessionRecord[] | undefined;
      const sessionRecords = sessions ?? [];
      const participantIds = sessionRecords.map((session) => session.studyParticipant.id);
      const whatsappByParticipantId = await listWhatsAppByParticipantId(prisma, {
        participantIds,
        studyId: input.studyId
      });
      const items = sessionRecords.map((session) => toListItem(session, whatsappByParticipantId.get(session.studyParticipant.id)));
      const detailSession = input.detailSessionId
        ? sessionRecords.find((session) => session.id === input.detailSessionId) ?? null
        : null;

      return {
        detail: detailSession ? toDetail(detailSession, whatsappByParticipantId.get(detailSession.studyParticipant.id)) : null,
        participants: items,
        study
      };
    }
  };
}

const sessionSelect = {
  answers: {
    orderBy: { questionCode: "asc" },
    select: {
      answerValue: true,
      questionCode: true
    }
  },
  claimedAt: true,
  completedAt: true,
  ctlInterviewerCode: {
    select: {
      label: true
    }
  },
  id: true,
  interviewer: {
    select: {
      id: true,
      name: true
    }
  },
  phaseProgress: {
    orderBy: { phase: "asc" },
    select: {
      completedAt: true,
      phase: true,
      status: true,
      validatedAt: true
    }
  },
  startedAt: true,
  status: true,
  studyParticipant: {
    select: {
      accessTokens: {
        orderBy: { createdAt: "desc" },
        select: {
          expiresAt: true,
          id: true,
          status: true,
        }
      },
      activities: {
        orderBy: [
          { scheduledAt: "asc" }
        ],
        select: {
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
        }
      },
      applicationStartedAt: true,
      armAssignments: {
        orderBy: { applicationOrder: "asc" },
        select: {
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
        }
      },
      hutParticipant: {
        select: {
          applicationPhotoEntries: {
            select: { id: true }
          },
          folio: true,
          id: true,
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
          testMode: true,
          token: true
        }
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
    }
  }
} as const;

type StudyRecord = {
  code: string;
  id: string;
  name: string;
  timeZoneIana: string;
};

type SessionRecord = {
  answers: Array<{ answerValue: unknown; questionCode: string }>;
  claimedAt: Date | null;
  completedAt: Date | null;
  ctlInterviewerCode: { label: string } | null;
  id: string;
  interviewer: { id: string; name: string } | null;
  phaseProgress: Array<{
    completedAt: Date | null;
    phase: string;
    status: string;
    validatedAt: Date | null;
  }>;
  startedAt: Date | null;
  status: string;
  studyParticipant: {
    accessTokens: Array<{
      expiresAt: Date;
      id: string;
      status: string;
    }>;
    activities: Array<{
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
    }>;
    applicationStartedAt: Date | null;
    armAssignments: Array<{
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
    }>;
      hutParticipant: {
        applicationPhotoEntries: Array<{ id: string }>;
        folio: string | null;
        id: string;
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
        testMode: boolean;
        token: string;
      } | null;
    id: string;
    participantConfirmation: { folio: string } | null;
    participantProfile: { name: string };
    rotationAssignment: {
      rotationCode: string;
      rotationPlan: {
        name: string;
      };
    } | null;
  };
};

type WhatsAppConversationRecord = {
  lastMessageAt: Date | null;
  messages: Array<{
    rawPayload: unknown;
    status: string | null;
    timestamp: Date | null;
  }>;
};

function toListItem(session: SessionRecord, whatsapp?: CltOperationsWhatsAppSummary): CltOperationsDetail {
  const progress = resolveCltApplicableProgress(session.answers);
  const rotation = toRotation(session);
  const hut = toHut(session);
  const navigoActivities = toNavigoActivities(session);
  const activeToken = session.studyParticipant.accessTokens.find((token) => token.status === "ACTIVE") ?? null;

  return {
    answerGroups: buildCltAnswerGroups(session.answers),
    answeredCount: progress.answeredCount,
    cltCompletedAt: session.completedAt,
    cltProgressLabel: progress.label,
    cltStartedAt: session.startedAt,
    cltStatus: session.status,
    folio: session.studyParticipant.participantConfirmation?.folio ?? "Sin folio",
    hut,
    id: session.id,
    interviewer: session.interviewer?.name ?? session.ctlInterviewerCode?.label ?? null,
    navigoActivities,
    navigoLinkToken: activeToken?.id ?? null,
    participantId: session.studyParticipant.id,
    participantName: session.studyParticipant.participantProfile.name,
    phaseProgress: session.phaseProgress,
    questionCount: progress.questionCount,
    reminders: toReminders(session),
    rotation,
    t0: session.studyParticipant.applicationStartedAt,
    whatsapp: whatsapp ?? emptyWhatsAppSummary()
  };
}

function toDetail(session: SessionRecord, whatsapp?: CltOperationsWhatsAppSummary): CltOperationsDetail {
  return toListItem(session, whatsapp);
}

function toRotation(session: SessionRecord): CltOperationsRotationSummary {
  const arms = session.studyParticipant.armAssignments.map((assignment) => ({
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
    rotationCode: session.studyParticipant.rotationAssignment?.rotationCode ?? null,
    secondSampleKey: arms.find((arm) => arm.order === 2)?.productCode ?? null
  };
}

function toHut(session: SessionRecord): CltOperationsHutSummary {
  const hut = session.studyParticipant.hutParticipant;

  if (!hut) {
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

  const activeVisit = hut.questionnaireAttempt?.visits.find((visit) => visit.status !== "COMPLETED") ?? null;

  return {
    applicationPhotoCount: hut.applicationPhotoEntries.length,
    currentSection: activeVisit?.section ?? null,
    folio: hut.folio,
    id: hut.id,
    origin: hut.origin,
    protocolVersion: hut.protocolVersion,
    questionnaireStatus: hut.questionnaireAttempt?.status ?? null,
    status: hut.status,
    testMode: hut.testMode,
    token: hut.token
  };
}

function toNavigoActivities(session: SessionRecord): CltOperationsActivitySummary[] {
  return session.studyParticipant.activities.map((activity) => ({
    availableFrom: activity.availableFrom,
    code: activity.activitySchedule.code,
    completedAt: activity.actualCompletedAt,
    evidenceCount: activity.participantActivityEvidence.length,
    id: activity.id,
    name: activity.activitySchedule.name,
    scheduledAt: activity.scheduledAt,
    status: activity.status
  }));
}

function toReminders(session: SessionRecord): CltOperationsReminderSummary[] {
  return session.studyParticipant.activities.flatMap((activity) =>
    activity.reminders.map((reminder) => ({
      activityCode: activity.activitySchedule.code,
      id: reminder.id,
      sentAt: reminder.sentAt,
      status: reminder.status
    }))
  );
}

async function listWhatsAppByParticipantId(
  prisma: CltOperationsPrismaClient,
  input: {
    participantIds: string[];
    studyId: string;
  }
): Promise<Map<string, CltOperationsWhatsAppSummary>> {
  if (!prisma.oneuiWhatsAppConversation || input.participantIds.length === 0) {
    return new Map();
  }

  const conversations = await prisma.oneuiWhatsAppConversation.findMany?.({
    select: {
      lastMessageAt: true,
      linkedParticipantId: true,
      messages: {
        orderBy: { timestamp: "desc" },
        select: {
          rawPayload: true,
          status: true,
          timestamp: true
        }
      }
    },
    where: {
      linkedParticipantId: { in: input.participantIds },
      linkedStudyId: input.studyId,
      sourceModule: "NAVIGO"
    }
  }) as Array<WhatsAppConversationRecord & { linkedParticipantId: string | null }> | undefined;
  const grouped = new Map<string, WhatsAppConversationRecord[]>();

  for (const conversation of conversations ?? []) {
    if (!conversation.linkedParticipantId) {
      continue;
    }

    grouped.set(conversation.linkedParticipantId, [
      ...(grouped.get(conversation.linkedParticipantId) ?? []),
      conversation
    ]);
  }

  return new Map(
    [...grouped.entries()].map(([participantId, records]) => [participantId, summarizeWhatsApp(records)])
  );
}

function summarizeWhatsApp(records: WhatsAppConversationRecord[]): CltOperationsWhatsAppSummary {
  const messages = records.flatMap((record) => record.messages);
  const sortedMessages = [...messages].sort((left, right) => {
    const leftTime = left.timestamp?.getTime() ?? 0;
    const rightTime = right.timestamp?.getTime() ?? 0;
    return rightTime - leftTime;
  });
  const templateNames = new Set<string>();

  for (const message of messages) {
    const templateName = extractTemplateName(message.rawPayload);
    if (templateName) {
      templateNames.add(templateName);
    }
  }

  return {
    lastMessageAt: records
      .map((record) => record.lastMessageAt)
      .filter((value): value is Date => Boolean(value))
      .sort((left, right) => right.getTime() - left.getTime())[0] ?? null,
    lastStatus: sortedMessages[0]?.status ?? null,
    messageCount: messages.length,
    templateNames: [...templateNames].sort()
  };
}

function extractTemplateName(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const raw = payload as { template?: { name?: unknown }; request?: { template?: { name?: unknown } } };
  const value = raw.template?.name ?? raw.request?.template?.name;

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function emptyWhatsAppSummary(): CltOperationsWhatsAppSummary {
  return {
    lastMessageAt: null,
    lastStatus: null,
    messageCount: 0,
    templateNames: []
  };
}
