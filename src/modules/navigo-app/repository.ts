import { createHash, randomUUID } from "node:crypto";
import { createPrismaClient, type PrismaClientLike } from "@/shared/db/client";
import {
  PARTICIPANT_EVIDENCE_BUCKET,
  assertEvidenceStorageKeyBelongsToAttempt,
  createSupabaseEvidenceStorageClient,
  validateEvidenceUploadMetadata,
  type EvidenceStorageClient,
  type EvidenceUploadMetadata
} from "@/modules/participant-portal/evidence-storage";
import { buildResearchResponseKey } from "@/modules/responses";
import { NAVIGO_STUDY_CODE } from "@/modules/study-templates/study-behavior";
import {
  NAVIGO_ACTIVITY_CODES,
  createNavigoMeasurementDefinition,
  resolveNavigoTimeZone,
  type NavigoActivityCode
} from "./definition";
import {
  buildNavigoActivityTimeline,
  prepareNavigoParticipantActivities,
  validateNavigoMeasurementAnswers,
  type NavigoActivityRecord,
  type NavigoAnswerInput,
  type NavigoScheduleRecord
} from "./service";

export type NavigoInternalActor = {
  id: string;
  role: "ADMIN" | "ANALYST" | "INTERVIEWER" | "SUPERVISOR";
  status: "ACTIVE" | "INACTIVE";
};

export type NavigoStudySummary = {
  code: string;
  id: string;
  name: string;
  status: "ACTIVE" | "ARCHIVED" | "DRAFT" | "PAUSED";
  timeZoneIana: string;
};

export type NavigoParticipantListItem = {
  activities: NavigoActivityListItem[];
  alert: string;
  applicationStartedAt: Date | null;
  confirmation: {
    folio: string;
    referenceCodes: Array<{ code: string; slot: number }>;
  } | null;
  hasRecoverableToken: boolean;
  id: string;
  participant: {
    email: string | null;
    name: string;
    phone: string | null;
  };
  rotationReady: boolean;
  status: "APPROVED" | "CONFIRMED" | "PENDING" | "REJECTED" | "TERMINATED";
};

export type NavigoActivityListItem = NavigoActivityRecord & {
  code: NavigoActivityCode;
  evidenceCount: number;
  responseCount: number;
};

export type NavigoAdminDashboard = {
  participants: NavigoParticipantListItem[];
  study: NavigoStudySummary;
  timeZoneIana: string;
};

export type NavigoStartT0Result =
  | {
      linkToken: string;
      message: string;
      ok: true;
    }
  | {
      message: string;
      ok: false;
    };

export type NavigoParticipantActivitiesView =
  | {
      message: string;
      ok: false;
    }
  | {
      data: {
        blindLabels: {
          left: string;
          right: string;
        };
        folio: string;
        nextActivity: ReturnType<typeof buildNavigoActivityTimeline>[number] | null;
        participantName: string;
        study: NavigoStudySummary;
        timeline: ReturnType<typeof buildNavigoActivityTimeline>;
        timeZoneIana: string;
      };
      ok: true;
    };

export type NavigoActivityCaptureView =
  | {
      message: string;
      ok: false;
    }
  | {
      data: {
        activity: ReturnType<typeof buildNavigoActivityTimeline>[number];
        blindLabels: {
          left: string;
          right: string;
        };
        existingResponses: Record<string, unknown>;
        folio: string;
        questions: ReturnType<typeof createNavigoMeasurementDefinition>["questions"];
        selfieCount: number;
        study: NavigoStudySummary;
        timeZoneIana: string;
      };
      ok: true;
    };

export type NavigoSignedActivityUpload = {
  metadata: EvidenceUploadMetadata;
  privateStorageKey: string;
  storageBucket: string;
  token: string;
};

export type NavigoActionResult<T = unknown> =
  | {
      data: T;
      ok: true;
    }
  | {
      message: string;
      ok: false;
    };

export type NavigoAppRepository = {
  confirmActivitySelfieUpload: (input: {
    activityId: string;
    metadata: EvidenceUploadMetadata & {
      privateStorageKey: string;
      storageBucket: string;
    };
    token: string;
  }) => Promise<NavigoActionResult<{ selfieCount: number }>>;
  getActivityCaptureView: (input: {
    activityId: string;
    now?: Date;
    token: string;
  }) => Promise<NavigoActivityCaptureView>;
  getAdminDashboard: (studyId: string, now?: Date) => Promise<NavigoAdminDashboard | null>;
  getParticipantActivitiesView: (input: { now?: Date; token: string }) => Promise<NavigoParticipantActivitiesView>;
  requestActivitySelfieUpload: (input: {
    activityId: string;
    metadata: EvidenceUploadMetadata;
    storage?: EvidenceStorageClient;
    token: string;
  }) => Promise<NavigoActionResult<NavigoSignedActivityUpload>>;
  startT0: (input: {
    actorUserId: string;
    applicationStartedAt: Date;
    now?: Date;
    studyParticipantId: string;
  }) => Promise<NavigoStartT0Result>;
  submitActivityResponses: (input: {
    activityId: string;
    answers: NavigoAnswerInput;
    now?: Date;
    token: string;
  }) => Promise<NavigoActionResult<{ completedAt: Date }>>;
};

type Delegate = {
  create?: (args: unknown) => Promise<unknown>;
  findFirst?: (args: unknown) => Promise<unknown>;
  findMany?: (args: unknown) => Promise<unknown[]>;
  findUnique?: (args: unknown) => Promise<unknown>;
  update?: (args: unknown) => Promise<unknown>;
  updateMany?: (args: unknown) => Promise<unknown>;
  upsert?: (args: unknown) => Promise<unknown>;
};

type NavigoPrismaClient = PrismaClientLike & {
  $transaction: <T>(callback: (tx: NavigoTransactionClient) => Promise<T>) => Promise<T>;
  activitySchedule: Delegate;
  participantAccessToken: Delegate;
  participantActivity: Delegate;
  participantActivityEvidence: Delegate;
  researchResponse: Delegate;
  study: Delegate;
  studyParticipant: Delegate;
};

type NavigoTransactionClient = Omit<NavigoPrismaClient, "$connect" | "$disconnect" | "$transaction"> & {
  applicationTimeEvent: Delegate;
};

const studySelect = {
  code: true,
  id: true,
  name: true,
  status: true,
  timeZoneIana: true
} as const;

const activitySelect = {
  activitySchedule: {
    select: {
      code: true,
      id: true,
      offsetMinutes: true,
      questionnaireVersionId: true,
      sortOrder: true,
      status: true,
      type: true,
      windowEndsMinutes: true,
      windowStartsMinutes: true
    }
  },
  activityScheduleId: true,
  actualCompletedAt: true,
  actualStartedAt: true,
  availableFrom: true,
  availableUntil: true,
  id: true,
  occurrenceKey: true,
  participantActivityEvidence: {
    select: {
      id: true,
      type: true
    }
  },
  responses: {
    select: {
      answerJson: true,
      questionId: true
    }
  },
  scheduledAt: true,
  status: true
} as const;

const participantSelect = {
  applicationStartedAt: true,
  id: true,
  participantConfirmation: {
    select: {
      folio: true,
      referenceCodes: {
        orderBy: { slot: "asc" },
        select: {
          code: true,
          slot: true
        }
      }
    }
  },
  participantProfile: {
    select: {
      email: true,
      id: true,
      name: true,
      phone: true
    }
  },
  participantScreeningReviews: {
    orderBy: { createdAt: "desc" },
    select: {
      status: true
    },
    take: 1
  },
  rotationAssignment: {
    select: {
      arms: {
        orderBy: { applicationOrder: "asc" },
        select: {
          applicationOrder: true,
          participantVisibleLabel: true,
          studyArm: {
            select: {
              code: true,
              label: true,
              sortOrder: true
            }
          }
        }
      }
    }
  },
  screeningStatus: true,
  study: {
    select: studySelect
  }
} as const;

const participantWithActivitiesSelect = {
  ...participantSelect,
  accessTokens: {
    orderBy: { createdAt: "desc" },
    select: {
      expiresAt: true,
      id: true,
      status: true,
      tokenHash: true
    },
    take: 1,
    where: { status: "ACTIVE" }
  },
  activities: {
    orderBy: {
      scheduledAt: "asc"
    },
    select: activitySelect,
    where: {
      activitySchedule: {
        code: {
          in: NAVIGO_ACTIVITY_CODES
        }
      }
    }
  }
} as const;

type StudyRecord = NavigoStudySummary;
type ParticipantRecord = {
  accessTokens?: Array<{ expiresAt: Date; id: string; status: string; tokenHash: string }>;
  activities?: ActivityRecord[];
  applicationStartedAt: Date | null;
  id: string;
  participantConfirmation: { folio: string; referenceCodes: Array<{ code: string; slot: number }> } | null;
  participantProfile: { email: string | null; id: string; name: string; phone: string | null };
  participantScreeningReviews: Array<{ status: "APPROVED" | "PENDING" | "REJECTED" }>;
  rotationAssignment: {
    arms: Array<{
      applicationOrder: number;
      participantVisibleLabel: string;
      studyArm: { code: string; label: string; sortOrder: number };
    }>;
  } | null;
  screeningStatus: "INCOMPLETE" | "NOT_STARTED" | "PASSED" | "PENDING_REVIEW" | "STARTED" | "TERMINATED";
  study: StudyRecord;
};
type ActivityRecord = NavigoActivityRecord & {
  activitySchedule: NavigoScheduleRecord & { questionnaireVersionId: string | null };
  id: string;
  participantActivityEvidence: Array<{ id: string; type: "PERFUME_PHOTO" | "SELFIE_IDENTIFICATION" }>;
  responses: Array<{ answerJson: unknown; questionId: string }>;
};

export function createNavigoAppRepository(prismaClient?: NavigoPrismaClient): NavigoAppRepository {
  async function getPrisma() {
    return prismaClient ?? ((await createPrismaClient()) as NavigoPrismaClient);
  }

  async function getParticipantByToken(token: string, prisma: NavigoPrismaClient | NavigoTransactionClient, now = new Date()) {
    const record = (await prisma.participantAccessToken.findFirst?.({
      select: {
        expiresAt: true,
        id: true,
        lastUsedAt: true,
        status: true,
        studyParticipant: {
          select: participantWithActivitiesSelect
        },
        studyParticipantId: true,
        tokenHash: true
      },
      where: {
        status: "ACTIVE",
        tokenHash: hashToken(token)
      }
    })) as
      | {
          expiresAt: Date;
          id: string;
          status: "ACTIVE" | "EXPIRED" | "REVOKED";
          studyParticipant: ParticipantRecord;
        }
      | null;

    if (!record || record.expiresAt.getTime() < now.getTime()) {
      return null;
    }

    await prisma.participantAccessToken.update?.({
      data: { lastUsedAt: now },
      where: { id: record.id }
    });

    return record.studyParticipant;
  }

  return {
    async getAdminDashboard(studyId, now = new Date()) {
      const prisma = await getPrisma();
      const study = (await prisma.study.findUnique?.({
        select: studySelect,
        where: { id: studyId }
      })) as StudyRecord | null;

      if (!study) {
        return null;
      }

      const participants = (await prisma.studyParticipant.findMany?.({
        orderBy: {
          participantConfirmation: {
            folioSequence: "asc"
          }
        },
        select: participantWithActivitiesSelect,
        where: {
          participantConfirmation: {
            isNot: null
          },
          studyId
        }
      })) as ParticipantRecord[];

      return {
        participants: participants.map((participant) => toDashboardParticipant(participant, now)),
        study,
        timeZoneIana: resolveNavigoTimeZone(study.timeZoneIana)
      };
    },

    async startT0(input) {
      const prisma = await getPrisma();
      const now = input.now ?? new Date();

      return prisma.$transaction(async (tx) => {
        const participant = (await tx.studyParticipant.findUnique?.({
          select: participantWithActivitiesSelect,
          where: { id: input.studyParticipantId }
        })) as ParticipantRecord | null;

        if (!participant) {
          return { message: "No encontramos el participante.", ok: false };
        }

        const guard = validateParticipantForT0(participant);

        if (!guard.ok) {
          return guard;
        }

        const study = participant.study;
        const timeZoneIana = resolveNavigoTimeZone(study.timeZoneIana);
        const schedules = (await tx.activitySchedule.findMany?.({
          orderBy: { sortOrder: "asc" },
          select: {
            code: true,
            id: true,
            offsetMinutes: true,
            sortOrder: true,
            status: true,
            type: true,
            windowEndsMinutes: true,
            windowStartsMinutes: true
          },
          where: {
            code: {
              in: NAVIGO_ACTIVITY_CODES
            },
            status: "ACTIVE",
            studyId: study.id
          }
        })) as NavigoScheduleRecord[];

        const existingActivities = (participant.activities ?? []).map(toNavigoActivityRecord);
        const applicationStartedAt = input.applicationStartedAt;
        const prepared = prepareNavigoParticipantActivities({
          existingActivities,
          now,
          participant: {
            applicationStartedAt,
            id: participant.id,
            reviewStatus: participantStatus(participant),
            studyCode: study.code,
            timeZoneIana
          },
          schedules
        });

        if (!prepared.ok) {
          return {
            message: prepared.message,
            ok: false
          };
        }

        const previousApplicationStartedAt = participant.applicationStartedAt;

        await tx.studyParticipant.update?.({
          data: {
            applicationStartedAt,
            applicationStartedAtRegisteredAt: now,
            applicationStartedAtRegisteredByUserId: input.actorUserId,
            operationalStatus: "IN_PROGRESS"
          },
          where: { id: participant.id }
        });

        await tx.applicationTimeEvent.create?.({
          data: {
            activityStateAtEvent: activityStateAtEvent(existingActivities),
            createdByUserId: input.actorUserId,
            eventType: previousApplicationStartedAt ? "CORRECTED" : "REGISTERED",
            newApplicationStartedAt: applicationStartedAt,
            previousApplicationStartedAt,
            reason: previousApplicationStartedAt
              ? "Correccion operativa de T0 desde App Navigo."
              : "Registro de T0 desde App Navigo.",
            studyParticipantId: participant.id,
            timeZoneIana
          }
        });

        for (const activity of prepared.created) {
          const isT0 = activity.code === "T0_SALON";
          await tx.participantActivity.create?.({
            data: {
              activityScheduleId: activity.activityScheduleId,
              actualCompletedAt: isT0 ? applicationStartedAt : null,
              actualStartedAt: isT0 ? applicationStartedAt : null,
              availableFrom: activity.availableFrom,
              availableUntil: activity.availableUntil,
              lastSavedAt: isT0 ? now : null,
              occurrenceKey: activity.occurrenceKey,
              scheduledAt: activity.scheduledAt,
              status: isT0 ? "COMPLETED" : activity.status,
              studyParticipantId: activity.studyParticipantId
            }
          });
        }

        for (const activity of prepared.updated) {
          await tx.participantActivity.update?.({
            data: {
              availableFrom: activity.availableFrom,
              availableUntil: activity.availableUntil,
              scheduledAt: activity.scheduledAt,
              status: activity.status
            },
            where: {
              studyParticipantId_activityScheduleId_occurrenceKey: {
                activityScheduleId: activity.activityScheduleId,
                occurrenceKey: "DEFAULT",
                studyParticipantId: participant.id
              }
            }
          });
        }

        const linkToken = await ensureParticipantAccessToken({
          actorUserId: input.actorUserId,
          now,
          participant,
          prisma: tx
        });

        return {
          linkToken,
          message: "T0 iniciado correctamente.",
          ok: true
        };
      });
    },

    async getParticipantActivitiesView(input) {
      const prisma = await getPrisma();
      const now = input.now ?? new Date();
      const participant = await getParticipantByToken(input.token, prisma, now);

      if (!participant) {
        return {
          message: "Este enlace no es valido o ha expirado.",
          ok: false
        };
      }

      const safe = validateParticipantForToken(participant);
      if (!safe.ok) {
        return safe;
      }

      const timeline = buildNavigoActivityTimeline({
        activities: (participant.activities ?? []).map(toNavigoActivityRecord),
        now
      });

      return {
        data: {
          blindLabels: resolveBlindLabels(participant),
          folio: participant.participantConfirmation?.folio ?? "Sin folio",
          nextActivity: getFirstIncompleteMeasurement(timeline),
          participantName: participant.participantProfile.name,
          study: participant.study,
          timeline,
          timeZoneIana: resolveNavigoTimeZone(participant.study.timeZoneIana)
        },
        ok: true
      };
    },

    async getActivityCaptureView(input) {
      const prisma = await getPrisma();
      const now = input.now ?? new Date();
      const participant = await getParticipantByToken(input.token, prisma, now);

      if (!participant) {
        return {
          message: "Este enlace no es valido o ha expirado.",
          ok: false
        };
      }

      const safe = validateParticipantForToken(participant);
      if (!safe.ok) {
        return safe;
      }

      const activity = (participant.activities ?? []).find((item) => item.id === input.activityId);
      if (!activity) {
        return {
          message: "No encontramos esta evaluacion para tu enlace.",
          ok: false
        };
      }

      const timeline = buildNavigoActivityTimeline({
        activities: (participant.activities ?? []).map(toNavigoActivityRecord),
        now
      });
      const timelineActivity = timeline.find((item) => item.id === activity.id);

      if (!timelineActivity || !timelineActivity.availability.canCapture) {
        return {
          message: availabilityMessage(timelineActivity?.availability.reason ?? "PREVIOUS_REQUIRED"),
          ok: false
        };
      }

      return {
        data: {
          activity: timelineActivity,
          blindLabels: resolveBlindLabels(participant),
          existingResponses: Object.fromEntries(activity.responses.map((response) => [response.questionId, response.answerJson])),
          folio: participant.participantConfirmation?.folio ?? "Sin folio",
          questions: createNavigoMeasurementDefinition().questions,
          selfieCount: activity.participantActivityEvidence.filter((evidence) => evidence.type === "SELFIE_IDENTIFICATION").length,
          study: participant.study,
          timeZoneIana: resolveNavigoTimeZone(participant.study.timeZoneIana)
        },
        ok: true
      };
    },

    async requestActivitySelfieUpload(input) {
      const prisma = await getPrisma();
      const participant = await getParticipantByToken(input.token, prisma);

      if (!participant) {
        return { message: "Este enlace no es valido o ha expirado.", ok: false };
      }

      const safe = validateParticipantForToken(participant);
      if (!safe.ok) {
        return safe;
      }

      const activity = (participant.activities ?? []).find((item) => item.id === input.activityId);
      if (!activity) {
        return { message: "No encontramos esta evaluacion para tu enlace.", ok: false };
      }

      if (activity.participantActivityEvidence.some((evidence) => evidence.type === "SELFIE_IDENTIFICATION")) {
        return { message: "Ya existe una selfie registrada para esta evaluacion.", ok: false };
      }

      const metadata = validateEvidenceUploadMetadata({
        maxImageBytes: 8388608,
        metadata: input.metadata
      });
      const privateStorageKey = buildActivityEvidenceStorageKey({
        activityId: activity.id,
        evidenceType: metadata.evidenceType,
        extension: metadata.extension,
        participantProfileId: participant.participantProfile.id,
        studyId: participant.study.id
      });
      const storage = input.storage ?? createSupabaseEvidenceStorageClient();
      const signed = await storage.createSignedUploadUrl({
        bucket: PARTICIPANT_EVIDENCE_BUCKET,
        contentType: metadata.mimeType,
        privateStorageKey
      });

      if (!signed.token) {
        return { message: "No fue posible preparar la carga. Intenta de nuevo.", ok: false };
      }

      return {
        data: {
          metadata,
          privateStorageKey,
          storageBucket: PARTICIPANT_EVIDENCE_BUCKET,
          token: signed.token
        },
        ok: true
      };
    },

    async confirmActivitySelfieUpload(input) {
      const prisma = await getPrisma();
      const participant = await getParticipantByToken(input.token, prisma);

      if (!participant) {
        return { message: "Este enlace no es valido o ha expirado.", ok: false };
      }

      const activity = (participant.activities ?? []).find((item) => item.id === input.activityId);
      if (!activity) {
        return { message: "No encontramos esta evaluacion para tu enlace.", ok: false };
      }

      if (input.metadata.evidenceType !== "SELFIE_IDENTIFICATION") {
        return { message: "Esta evaluacion solo permite selfie de identificacion.", ok: false };
      }

      if (activity.participantActivityEvidence.some((evidence) => evidence.type === "SELFIE_IDENTIFICATION")) {
        return { message: "Ya existe una selfie registrada para esta evaluacion.", ok: false };
      }

      assertActivityEvidenceKeyBelongsToActivity({
        activityId: activity.id,
        participantProfileId: participant.participantProfile.id,
        privateStorageKey: input.metadata.privateStorageKey,
        studyId: participant.study.id
      });

      await prisma.participantActivityEvidence.create?.({
        data: {
          extension: extensionFromFilename(input.metadata.originalFilename),
          mimeType: input.metadata.mimeType,
          originalFilename: input.metadata.originalFilename,
          participantActivityId: activity.id,
          privateStorageKey: input.metadata.privateStorageKey,
          sizeBytes: input.metadata.sizeBytes,
          storageBucket: input.metadata.storageBucket,
          studyParticipantId: participant.id,
          type: "SELFIE_IDENTIFICATION"
        }
      });

      return {
        data: { selfieCount: 1 },
        ok: true
      };
    },

    async submitActivityResponses(input) {
      const prisma = await getPrisma();
      const now = input.now ?? new Date();

      return prisma.$transaction(async (tx) => {
        const participant = await getParticipantByToken(input.token, tx, now);
        if (!participant) {
          return { message: "Este enlace no es valido o ha expirado.", ok: false };
        }

        const activity = (participant.activities ?? []).find((item) => item.id === input.activityId);
        if (!activity) {
          return { message: "No encontramos esta evaluacion para tu enlace.", ok: false };
        }

        const timeline = buildNavigoActivityTimeline({
          activities: (participant.activities ?? []).map(toNavigoActivityRecord),
          now
        });
        const timelineActivity = timeline.find((item) => item.id === activity.id);

        if (!timelineActivity?.availability.canCapture) {
          return {
            message: availabilityMessage(timelineActivity?.availability.reason ?? "PREVIOUS_REQUIRED"),
            ok: false
          };
        }

        if (!activity.participantActivityEvidence.some((evidence) => evidence.type === "SELFIE_IDENTIFICATION")) {
          return { message: "Toma una selfie antes de guardar la evaluacion.", ok: false };
        }

        const validation = validateNavigoMeasurementAnswers({ input: input.answers });
        if (!validation.ok) {
          return { message: validation.message, ok: false };
        }

        const questionnaireVersionId = activity.activitySchedule.questionnaireVersionId;
        if (!questionnaireVersionId) {
          return { message: "Esta evaluacion no tiene cuestionario configurado.", ok: false };
        }

        for (const answer of validation.answers) {
          const responseKey = buildResearchResponseKey({
            context: { type: "none" },
            questionId: answer.questionId
          });
          await tx.researchResponse.upsert?.({
            create: {
              answerJson: answer.answerJson,
              participantActivityId: activity.id,
              questionId: answer.questionId,
              questionnaireVersionId,
              responseKey,
              validationStatus: "VALID"
            },
            update: {
              answerJson: answer.answerJson,
              validationStatus: "VALID"
            },
            where: {
              participantActivityId_responseKey: {
                participantActivityId: activity.id,
                responseKey
              }
            }
          });
        }

        await tx.participantActivity.update?.({
          data: {
            actualCompletedAt: now,
            actualStartedAt: activity.actualStartedAt ?? now,
            lastSavedAt: now,
            status: "COMPLETED"
          },
          where: { id: activity.id }
        });

        return {
          data: { completedAt: now },
          ok: true
        };
      });
    }
  };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function toDashboardParticipant(participant: ParticipantRecord, now: Date): NavigoParticipantListItem {
  const activities = (participant.activities ?? []).map(toActivityListItem);
  const timeline = buildNavigoActivityTimeline({ activities, now });
  const alert =
    timeline.find((activity) => activity.availability.reason === "AFTER_WINDOW")
      ? "Requiere contacto"
      : timeline.find((activity) => activity.availability.canCapture)
        ? "Evaluacion disponible"
        : participant.applicationStartedAt
          ? "Seguimiento en curso"
          : "T0 pendiente";

  return {
    activities,
    alert,
    applicationStartedAt: participant.applicationStartedAt,
    confirmation: participant.participantConfirmation,
    hasRecoverableToken: (participant.accessTokens ?? []).some((token) => token.tokenHash === hashToken(token.id)),
    id: participant.id,
    participant: {
      email: participant.participantProfile.email,
      name: participant.participantProfile.name,
      phone: participant.participantProfile.phone
    },
    rotationReady: Boolean(participant.rotationAssignment && participant.rotationAssignment.arms.length === 2),
    status: participantStatus(participant)
  };
}

function toActivityListItem(activity: ActivityRecord): NavigoActivityListItem {
  const record = toNavigoActivityRecord(activity);
  return {
    ...record,
    code: activity.activitySchedule.code,
    evidenceCount: activity.participantActivityEvidence.length,
    responseCount: activity.responses.length
  };
}

function toNavigoActivityRecord(activity: ActivityRecord): NavigoActivityRecord & { code: NavigoActivityCode } {
  return {
    activityScheduleId: activity.activityScheduleId,
    actualCompletedAt: activity.actualCompletedAt,
    actualStartedAt: activity.actualStartedAt,
    availableFrom: activity.availableFrom,
    availableUntil: activity.availableUntil,
    code: activity.activitySchedule.code,
    id: activity.id,
    occurrenceKey: activity.occurrenceKey,
    scheduledAt: activity.scheduledAt,
    status: activity.status
  };
}

function validateParticipantForT0(participant: ParticipantRecord | null): NavigoStartT0Result {
  if (!participant) {
    return { message: "No encontramos el participante.", ok: false };
  }

  if (participant.study.code !== NAVIGO_STUDY_CODE) {
    return { message: "Solo el estudio Navigo permite iniciar App Navigo.", ok: false };
  }

  if (!participant.participantConfirmation) {
    return { message: "Solo participantes confirmados con folio pueden iniciar T0.", ok: false };
  }

  if (participantStatus(participant) !== "APPROVED" && participantStatus(participant) !== "CONFIRMED") {
    return { message: "El participante no esta confirmado para iniciar App Navigo.", ok: false };
  }

  if (!participant.rotationAssignment || participant.rotationAssignment.arms.length !== 2) {
    return { message: "Falta asignacion de brazos para iniciar T0.", ok: false };
  }

  return { linkToken: "", message: "ok", ok: true };
}

function validateParticipantForToken(
  participant: ParticipantRecord
): NavigoParticipantActivitiesView | { ok: true } {
  if (participant.study.code !== NAVIGO_STUDY_CODE) {
    return {
      message: "No encontramos una participacion activa para este enlace.",
      ok: false
    };
  }

  if (!participant.participantConfirmation) {
    return {
      message: "No encontramos una participacion activa para este enlace.",
      ok: false
    };
  }

  if (!participant.applicationStartedAt) {
    return {
      message: "Tu evaluacion aun no ha sido iniciada en salon.",
      ok: false
    };
  }

  return { ok: true };
}

function participantStatus(participant: ParticipantRecord): NavigoParticipantListItem["status"] {
  const reviewStatus = participant.participantScreeningReviews[0]?.status;

  if (reviewStatus === "REJECTED" || participant.screeningStatus === "TERMINATED") {
    return participant.screeningStatus === "TERMINATED" ? "TERMINATED" : "REJECTED";
  }

  if (participant.participantConfirmation || reviewStatus === "APPROVED") {
    return "APPROVED";
  }

  return "PENDING";
}

function activityStateAtEvent(activities: NavigoActivityRecord[]): "COMPLETED_EXISTS" | "NONE_STARTED" | "SOME_STARTED" {
  if (activities.some((activity) => activity.actualCompletedAt || activity.status === "COMPLETED")) {
    return "COMPLETED_EXISTS";
  }

  if (activities.some((activity) => activity.actualStartedAt || activity.status === "STARTED" || activity.status === "INCOMPLETE")) {
    return "SOME_STARTED";
  }

  return "NONE_STARTED";
}

async function ensureParticipantAccessToken({
  actorUserId,
  now,
  participant,
  prisma
}: {
  actorUserId: string;
  now: Date;
  participant: ParticipantRecord;
  prisma: NavigoTransactionClient;
}): Promise<string> {
  const activeToken = participant.accessTokens?.[0];

  if (activeToken && activeToken.tokenHash === hashToken(activeToken.id) && activeToken.expiresAt.getTime() > now.getTime()) {
    return activeToken.id;
  }

  if (activeToken) {
    await prisma.participantAccessToken.updateMany?.({
      data: {
        revokedAt: now,
        revokedByUserId: actorUserId,
        revocationReason: "REGENERATED",
        status: "REVOKED"
      },
      where: {
        status: "ACTIVE",
        studyParticipantId: participant.id
      }
    });
  }

  const token = randomUUID();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  await prisma.participantAccessToken.create?.({
    data: {
      createdByUserId: actorUserId,
      expiresAt,
      id: token,
      status: "ACTIVE",
      studyParticipantId: participant.id,
      tokenHash: hashToken(token)
    }
  });

  return token;
}

function getFirstIncompleteMeasurement(timeline: ReturnType<typeof buildNavigoActivityTimeline>) {
  return timeline.find((activity) => activity.code !== "T0_SALON" && activity.status !== "COMPLETED") ?? null;
}

function resolveBlindLabels(participant: ParticipantRecord) {
  const arms = participant.rotationAssignment?.arms ?? [];
  const leftArm = arms.find((arm) => arm.studyArm.code.toUpperCase() === "LEFT") ?? arms[0];
  const rightArm = arms.find((arm) => arm.studyArm.code.toUpperCase() === "RIGHT") ?? arms[1];

  return {
    left: leftArm?.participantVisibleLabel || "Primera fragancia",
    right: rightArm?.participantVisibleLabel || "Segunda fragancia"
  };
}

function availabilityMessage(reason: string): string {
  if (reason === "BEFORE_WINDOW") {
    return "Aun no es momento de realizar esta evaluacion.";
  }

  if (reason === "AFTER_WINDOW") {
    return "Esta evaluacion esta fuera de la ventana permitida. Contacta a tu reclutador.";
  }

  if (reason === "ALREADY_COMPLETED") {
    return "Esta evaluacion ya fue registrada.";
  }

  return "Debes completar la evaluacion anterior antes de continuar.";
}

function buildActivityEvidenceStorageKey({
  activityId,
  evidenceType,
  extension,
  participantProfileId,
  studyId
}: {
  activityId: string;
  evidenceType: "PERFUME_PHOTO" | "SELFIE_IDENTIFICATION";
  extension: string;
  participantProfileId: string;
  studyId: string;
}) {
  const safeExtension = extension.toLowerCase() === "jpeg" ? "jpg" : extension.toLowerCase();

  return [
    "studies",
    studyId,
    "participants",
    participantProfileId,
    "activities",
    activityId,
    evidenceType.toLowerCase(),
    `${randomUUID()}.${safeExtension}`
  ].join("/");
}

function assertActivityEvidenceKeyBelongsToActivity({
  activityId,
  participantProfileId,
  privateStorageKey,
  studyId
}: {
  activityId: string;
  participantProfileId: string;
  privateStorageKey: string;
  studyId: string;
}) {
  assertEvidenceStorageKeyBelongsToAttempt({
    attemptId: activityId,
    participantProfileId,
    privateStorageKey: privateStorageKey.replace(`/activities/${activityId}/`, `/screening-attempts/${activityId}/`),
    studyId
  });
}

function extensionFromFilename(filename: string): string {
  const extension = filename.trim().toLowerCase().split(".").pop() ?? "jpg";
  return extension === "jpeg" ? "jpg" : extension;
}
