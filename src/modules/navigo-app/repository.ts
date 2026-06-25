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
  buildNavigoRotationChecklist,
  buildNavigoStartT0PendingMessage,
  createNavigoRotationPlanCode,
  normalizeNavigoRotationCode,
  prepareNavigoParticipantActivities,
  validateNavigoMeasurementAnswers,
  type NavigoActivityRecord,
  type NavigoAnswerInput,
  type NavigoRotationChecklist,
  type NavigoRotationImportRowInput,
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
  rotation: {
    checklist: NavigoRotationChecklist;
    leftCode: string | null;
    ready: boolean;
    rightCode: string | null;
    startPendingMessage: string | null;
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

export type NavigoConfigureRotationInput = {
  actorUserId: string;
  leftFragranceCode: string;
  rightFragranceCode: string;
  studyParticipantId: string;
  triangularCode1?: string | null;
  triangularCode2?: string | null;
};

export type NavigoRotationImportPreviewRow = NavigoRotationImportRowInput & {
  errors: string[];
  existingRotation: boolean;
  rowNumber: number;
  t0Started: boolean;
  updatable: boolean;
};

export type NavigoRotationImportPreview = {
  rows: NavigoRotationImportPreviewRow[];
  summary: {
    duplicateFolios: number;
    foundFolios: number;
    rowsWithError: number;
    t0Started: number;
    totalRows: number;
    updatable: number;
    validRows: number;
    missingFolios: number;
  };
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
  configureParticipantRotation: (input: NavigoConfigureRotationInput) => Promise<NavigoActionResult<{
    rotationCode: string;
    leftFragranceCode: string;
    rightFragranceCode: string;
  }>>;
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
  previewRotationImport: (input: {
    rows: NavigoRotationImportRowInput[];
    studyId: string;
  }) => Promise<NavigoActionResult<NavigoRotationImportPreview>>;
  applyRotationImport: (input: {
    actorUserId: string;
    rows: NavigoRotationImportRowInput[];
    studyId: string;
  }) => Promise<NavigoActionResult<NavigoRotationImportPreview>>;
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
  createMany?: (args: unknown) => Promise<unknown>;
  deleteMany?: (args: unknown) => Promise<unknown>;
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
  participantArmAssignment: Delegate;
  participantConfirmation: Delegate;
  participantRotationAssignment: Delegate;
  researchResponse: Delegate;
  rotationPlan: Delegate;
  rotationPlanArm: Delegate;
  studyArm: Delegate;
  study: Delegate;
  studyParticipant: Delegate;
  studyProduct: Delegate;
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
      rotationCode: true,
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
          },
          studyProduct: {
            select: {
              displayLabel: true,
              id: true,
              internalCode: true
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
    rotationCode: string;
    arms: Array<{
      applicationOrder: number;
      participantVisibleLabel: string;
      studyArm: { code: string; label: string; sortOrder: number };
      studyProduct: { displayLabel: string; id: string; internalCode: string };
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
type ConfirmationWithParticipant = {
  folio: string;
  studyParticipant: ParticipantRecord;
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
    async configureParticipantRotation(input) {
      const leftFragranceCode = normalizeNavigoRotationCode(input.leftFragranceCode);
      const rightFragranceCode = normalizeNavigoRotationCode(input.rightFragranceCode);

      if (!leftFragranceCode || !rightFragranceCode) {
        return {
          message: "Captura los codigos de primera y segunda fragancia.",
          ok: false
        };
      }

      if (leftFragranceCode === rightFragranceCode) {
        return {
          message: "Los codigos de brazo izquierdo y derecho deben ser distintos.",
          ok: false
        };
      }

      const prisma = await getPrisma();

      return prisma.$transaction(async (tx) => {
        const participant = (await tx.studyParticipant.findUnique?.({
          select: participantWithActivitiesSelect,
          where: { id: input.studyParticipantId }
        })) as ParticipantRecord | null;

        if (!participant) {
          return { message: "No encontramos el participante.", ok: false };
        }

        if (participant.study.code !== NAVIGO_STUDY_CODE) {
          return { message: "Solo el estudio Navigo permite configurar rotacion de App Navigo.", ok: false };
        }

        if (!participant.participantConfirmation || participantStatus(participant) !== "APPROVED") {
          return { message: "Solo participantes confirmados con folio pueden recibir rotacion.", ok: false };
        }

        if (hasT0Started(participant)) {
          return { message: "No se puede modificar rotacion porque T0 ya fue iniciado.", ok: false };
        }

        const studyId = participant.study.id;
        const rotationCode = createNavigoRotationPlanCode({
          folio: participant.participantConfirmation.folio,
          leftFragranceCode,
          rightFragranceCode
        });
        const leftArm = (await tx.studyArm.upsert?.({
          create: {
            code: "LEFT",
            label: "Brazo izquierdo",
            sortOrder: 1,
            studyId
          },
          update: {
            label: "Brazo izquierdo",
            sortOrder: 1
          },
          where: {
            studyId_code: {
              code: "LEFT",
              studyId
            }
          }
        })) as { id: string };
        const rightArm = (await tx.studyArm.upsert?.({
          create: {
            code: "RIGHT",
            label: "Brazo derecho",
            sortOrder: 2,
            studyId
          },
          update: {
            label: "Brazo derecho",
            sortOrder: 2
          },
          where: {
            studyId_code: {
              code: "RIGHT",
              studyId
            }
          }
        })) as { id: string };
        const leftProduct = (await tx.studyProduct.upsert?.({
          create: {
            displayLabel: "Primera fragancia",
            internalCode: leftFragranceCode,
            isSensitive: true,
            realName: leftFragranceCode,
            studyId
          },
          update: {
            displayLabel: "Primera fragancia",
            isSensitive: true
          },
          where: {
            studyId_internalCode: {
              internalCode: leftFragranceCode,
              studyId
            }
          }
        })) as { id: string };
        const rightProduct = (await tx.studyProduct.upsert?.({
          create: {
            displayLabel: "Segunda fragancia",
            internalCode: rightFragranceCode,
            isSensitive: true,
            realName: rightFragranceCode,
            studyId
          },
          update: {
            displayLabel: "Segunda fragancia",
            isSensitive: true
          },
          where: {
            studyId_internalCode: {
              internalCode: rightFragranceCode,
              studyId
            }
          }
        })) as { id: string };
        const rotationPlan = (await tx.rotationPlan.upsert?.({
          create: {
            assignmentModeAllowed: "MANUAL",
            name: rotationCode,
            rotationCode,
            status: "ACTIVE",
            studyId
          },
          select: {
            id: true
          },
          update: {
            assignmentModeAllowed: "MANUAL",
            name: rotationCode,
            status: "ACTIVE"
          },
          where: {
            studyId_rotationCode: {
              rotationCode,
              studyId
            }
          }
        })) as { id: string };

        await tx.rotationPlanArm.deleteMany?.({
          where: { rotationPlanId: rotationPlan.id }
        });
        await tx.rotationPlanArm.createMany?.({
          data: [
            {
              applicationOrder: 1,
              participantVisibleLabel: "Primera fragancia",
              rotationPlanId: rotationPlan.id,
              studyArmId: leftArm.id,
              studyProductId: leftProduct.id
            },
            {
              applicationOrder: 2,
              participantVisibleLabel: "Segunda fragancia",
              rotationPlanId: rotationPlan.id,
              studyArmId: rightArm.id,
              studyProductId: rightProduct.id
            }
          ]
        });

        const rotationAssignment = (await tx.participantRotationAssignment.upsert?.({
          create: {
            assignedByUserId: input.actorUserId,
            assignmentMode: "MANUAL_COVER_CODE",
            rotationCode,
            rotationPlanId: rotationPlan.id,
            studyParticipantId: participant.id
          },
          select: { id: true },
          update: {
            changedAt: new Date(),
            rotationCode,
            rotationPlanId: rotationPlan.id
          },
          where: {
            studyParticipantId: participant.id
          }
        })) as { id: string };

        await tx.participantArmAssignment.upsert?.({
          create: {
            applicationOrder: 1,
            participantRotationAssignmentId: rotationAssignment.id,
            participantVisibleLabel: "Primera fragancia",
            studyArmId: leftArm.id,
            studyParticipantId: participant.id,
            studyProductId: leftProduct.id
          },
          update: {
            applicationOrder: 1,
            participantRotationAssignmentId: rotationAssignment.id,
            participantVisibleLabel: "Primera fragancia",
            studyProductId: leftProduct.id
          },
          where: {
            studyParticipantId_studyArmId: {
              studyArmId: leftArm.id,
              studyParticipantId: participant.id
            }
          }
        });
        await tx.participantArmAssignment.upsert?.({
          create: {
            applicationOrder: 2,
            participantRotationAssignmentId: rotationAssignment.id,
            participantVisibleLabel: "Segunda fragancia",
            studyArmId: rightArm.id,
            studyParticipantId: participant.id,
            studyProductId: rightProduct.id
          },
          update: {
            applicationOrder: 2,
            participantRotationAssignmentId: rotationAssignment.id,
            participantVisibleLabel: "Segunda fragancia",
            studyProductId: rightProduct.id
          },
          where: {
            studyParticipantId_studyArmId: {
              studyArmId: rightArm.id,
              studyParticipantId: participant.id
            }
          }
        });

        return {
          data: {
            leftFragranceCode,
            rotationCode,
            rightFragranceCode
          },
          ok: true
        };
      });
    },

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

    async previewRotationImport(input) {
      const prisma = await getPrisma();
      const study = (await prisma.study.findUnique?.({
        select: studySelect,
        where: { id: input.studyId }
      })) as StudyRecord | null;

      if (!study || study.code !== NAVIGO_STUDY_CODE) {
        return { message: "Solo el estudio Navigo permite importar rotacion.", ok: false };
      }

      const preview = await buildRotationImportPreview({
        prisma,
        rows: input.rows,
        studyId: input.studyId
      });

      return { data: preview, ok: true };
    },

    async applyRotationImport(input) {
      const prisma = await getPrisma();

      return prisma.$transaction(async (tx) => {
        const study = (await tx.study.findUnique?.({
          select: studySelect,
          where: { id: input.studyId }
        })) as StudyRecord | null;

        if (!study || study.code !== NAVIGO_STUDY_CODE) {
          return { message: "Solo el estudio Navigo permite importar rotacion.", ok: false };
        }

        const preview = await buildRotationImportPreview({
          prisma: tx,
          rows: input.rows,
          studyId: input.studyId
        });

        if (preview.summary.rowsWithError > 0) {
          return {
            message: "Corrige los errores de la previsualizacion antes de aplicar la importacion.",
            ok: false
          };
        }

        const confirmations = await findConfirmationsByFolio({
          prisma: tx,
          rows: input.rows,
          studyId: input.studyId
        });

        for (const row of preview.rows) {
          const confirmation = confirmations.get(row.folio);

          if (!confirmation) {
            continue;
          }

          await upsertParticipantRotationForCodes({
            actorUserId: input.actorUserId,
            leftFragranceCode: row.primeraFragancia,
            participant: confirmation.studyParticipant,
            prisma: tx,
            rightFragranceCode: row.segundaFragancia
          });
        }

        const appliedPreview = await buildRotationImportPreview({
          prisma: tx,
          rows: input.rows,
          studyId: input.studyId
        });

        return {
          data: appliedPreview,
          ok: true
        };
      });
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
  const rotation = buildParticipantRotationSummary(participant);
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
    rotation,
    rotationReady: rotation.ready,
    status: participantStatus(participant)
  };
}

async function buildRotationImportPreview({
  prisma,
  rows,
  studyId
}: {
  prisma: NavigoPrismaClient | NavigoTransactionClient;
  rows: NavigoRotationImportRowInput[];
  studyId: string;
}): Promise<NavigoRotationImportPreview> {
  const confirmations = await findConfirmationsByFolio({ prisma, rows, studyId });
  const seenFolios = new Set<string>();
  const duplicateFolios = new Set<string>();

  for (const row of rows) {
    if (!row.folio) {
      continue;
    }
    if (seenFolios.has(row.folio)) {
      duplicateFolios.add(row.folio);
    }
    seenFolios.add(row.folio);
  }

  const previewRows = rows.map((row, index): NavigoRotationImportPreviewRow => {
    const errors: string[] = [];
    const confirmation = row.folio ? confirmations.get(row.folio) : null;

    if (!row.folio) {
      errors.push("folio vacio");
    } else if (duplicateFolios.has(row.folio)) {
      errors.push("folio duplicado dentro del archivo");
    } else if (!confirmation) {
      errors.push("folio no encontrado");
    }

    if (!row.primeraFragancia) {
      errors.push("primera fragancia vacia");
    }
    if (!row.segundaFragancia) {
      errors.push("segunda fragancia vacia");
    }

    const participant = confirmation?.studyParticipant ?? null;
    const t0Started = participant ? hasT0Started(participant) : false;
    const existingRotation = Boolean(participant?.rotationAssignment?.arms.length);

    if (participant && participantStatus(participant) !== "APPROVED") {
      errors.push("participante no confirmado");
    }

    if (t0Started) {
      errors.push("No se puede modificar rotacion porque T0 ya fue iniciado.");
    }

    return {
      ...row,
      errors,
      existingRotation,
      rowNumber: index + 2,
      t0Started,
      updatable: errors.length === 0
    };
  });

  return {
    rows: previewRows,
    summary: {
      duplicateFolios: duplicateFolios.size,
      foundFolios: previewRows.filter((row) => row.folio && confirmations.has(row.folio)).length,
      missingFolios: previewRows.filter((row) => row.errors.includes("folio no encontrado")).length,
      rowsWithError: previewRows.filter((row) => row.errors.length > 0).length,
      t0Started: previewRows.filter((row) => row.t0Started).length,
      totalRows: previewRows.length,
      updatable: previewRows.filter((row) => row.updatable).length,
      validRows: previewRows.filter((row) => row.errors.length === 0).length
    }
  };
}

async function findConfirmationsByFolio({
  prisma,
  rows,
  studyId
}: {
  prisma: NavigoPrismaClient | NavigoTransactionClient;
  rows: NavigoRotationImportRowInput[];
  studyId: string;
}): Promise<Map<string, ConfirmationWithParticipant>> {
  const folios = [...new Set(rows.map((row) => row.folio).filter(Boolean))];

  if (folios.length === 0) {
    return new Map();
  }

  const confirmations = (await prisma.participantConfirmation.findMany?.({
    select: {
      folio: true,
      studyParticipant: {
        select: participantWithActivitiesSelect
      }
    },
    where: {
      folio: {
        in: folios
      },
      studyId
    }
  })) as ConfirmationWithParticipant[];

  return new Map(confirmations.map((confirmation) => [confirmation.folio, confirmation]));
}

async function upsertParticipantRotationForCodes({
  actorUserId,
  leftFragranceCode,
  participant,
  prisma,
  rightFragranceCode
}: {
  actorUserId: string;
  leftFragranceCode: string;
  participant: ParticipantRecord;
  prisma: NavigoTransactionClient;
  rightFragranceCode: string;
}) {
  if (!participant.participantConfirmation) {
    throw new Error("Participant confirmation is required for Navigo rotation.");
  }

  const studyId = participant.study.id;
  const rotationCode = createNavigoRotationPlanCode({
    folio: participant.participantConfirmation.folio,
    leftFragranceCode,
    rightFragranceCode
  });
  const leftArm = (await prisma.studyArm.upsert?.({
    create: {
      code: "LEFT",
      label: "Brazo izquierdo",
      sortOrder: 1,
      studyId
    },
    update: {
      label: "Brazo izquierdo",
      sortOrder: 1
    },
    where: {
      studyId_code: {
        code: "LEFT",
        studyId
      }
    }
  })) as { id: string };
  const rightArm = (await prisma.studyArm.upsert?.({
    create: {
      code: "RIGHT",
      label: "Brazo derecho",
      sortOrder: 2,
      studyId
    },
    update: {
      label: "Brazo derecho",
      sortOrder: 2
    },
    where: {
      studyId_code: {
        code: "RIGHT",
        studyId
      }
    }
  })) as { id: string };
  const leftProduct = (await prisma.studyProduct.upsert?.({
    create: {
      displayLabel: "Primera fragancia",
      internalCode: leftFragranceCode,
      isSensitive: true,
      realName: leftFragranceCode,
      studyId
    },
    update: {
      displayLabel: "Primera fragancia",
      isSensitive: true
    },
    where: {
      studyId_internalCode: {
        internalCode: leftFragranceCode,
        studyId
      }
    }
  })) as { id: string };
  const rightProduct = (await prisma.studyProduct.upsert?.({
    create: {
      displayLabel: "Segunda fragancia",
      internalCode: rightFragranceCode,
      isSensitive: true,
      realName: rightFragranceCode,
      studyId
    },
    update: {
      displayLabel: "Segunda fragancia",
      isSensitive: true
    },
    where: {
      studyId_internalCode: {
        internalCode: rightFragranceCode,
        studyId
      }
    }
  })) as { id: string };
  const rotationPlan = (await prisma.rotationPlan.upsert?.({
    create: {
      assignmentModeAllowed: "MANUAL",
      name: rotationCode,
      rotationCode,
      status: "ACTIVE",
      studyId
    },
    select: {
      id: true
    },
    update: {
      assignmentModeAllowed: "MANUAL",
      name: rotationCode,
      status: "ACTIVE"
    },
    where: {
      studyId_rotationCode: {
        rotationCode,
        studyId
      }
    }
  })) as { id: string };

  await prisma.rotationPlanArm.deleteMany?.({
    where: { rotationPlanId: rotationPlan.id }
  });
  await prisma.rotationPlanArm.createMany?.({
    data: [
      {
        applicationOrder: 1,
        participantVisibleLabel: "Primera fragancia",
        rotationPlanId: rotationPlan.id,
        studyArmId: leftArm.id,
        studyProductId: leftProduct.id
      },
      {
        applicationOrder: 2,
        participantVisibleLabel: "Segunda fragancia",
        rotationPlanId: rotationPlan.id,
        studyArmId: rightArm.id,
        studyProductId: rightProduct.id
      }
    ]
  });

  const rotationAssignment = (await prisma.participantRotationAssignment.upsert?.({
    create: {
      assignedByUserId: actorUserId,
      assignmentMode: "MANUAL_COVER_CODE",
      rotationCode,
      rotationPlanId: rotationPlan.id,
      studyParticipantId: participant.id
    },
    select: { id: true },
    update: {
      changedAt: new Date(),
      rotationCode,
      rotationPlanId: rotationPlan.id
    },
    where: {
      studyParticipantId: participant.id
    }
  })) as { id: string };

  await prisma.participantArmAssignment.upsert?.({
    create: {
      applicationOrder: 1,
      participantRotationAssignmentId: rotationAssignment.id,
      participantVisibleLabel: "Primera fragancia",
      studyArmId: leftArm.id,
      studyParticipantId: participant.id,
      studyProductId: leftProduct.id
    },
    update: {
      applicationOrder: 1,
      participantRotationAssignmentId: rotationAssignment.id,
      participantVisibleLabel: "Primera fragancia",
      studyProductId: leftProduct.id
    },
    where: {
      studyParticipantId_studyArmId: {
        studyArmId: leftArm.id,
        studyParticipantId: participant.id
      }
    }
  });
  await prisma.participantArmAssignment.upsert?.({
    create: {
      applicationOrder: 2,
      participantRotationAssignmentId: rotationAssignment.id,
      participantVisibleLabel: "Segunda fragancia",
      studyArmId: rightArm.id,
      studyParticipantId: participant.id,
      studyProductId: rightProduct.id
    },
    update: {
      applicationOrder: 2,
      participantRotationAssignmentId: rotationAssignment.id,
      participantVisibleLabel: "Segunda fragancia",
      studyProductId: rightProduct.id
    },
    where: {
      studyParticipantId_studyArmId: {
        studyArmId: rightArm.id,
        studyParticipantId: participant.id
      }
    }
  });

  return {
    rotationCode
  };
}

function buildParticipantRotationSummary(participant: ParticipantRecord): NavigoParticipantListItem["rotation"] {
  const leftArm = getAssignedArm(participant, "LEFT", 1);
  const rightArm = getAssignedArm(participant, "RIGHT", 2);
  const approvalComplete = participantStatus(participant) === "APPROVED";
  const folioComplete = Boolean(participant.participantConfirmation);
  const readiness = {
    approvalComplete,
    folioComplete,
    leftArmComplete: Boolean(leftArm),
    rightArmComplete: Boolean(rightArm)
  };

  return {
    checklist: buildNavigoRotationChecklist(readiness),
    leftCode: leftArm?.studyProduct.internalCode ?? null,
    ready: Boolean(approvalComplete && folioComplete && leftArm && rightArm),
    rightCode: rightArm?.studyProduct.internalCode ?? null,
    startPendingMessage: buildNavigoStartT0PendingMessage(readiness)
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
    return { message: "Pendiente para iniciar T0: aprobacion del participante.", ok: false };
  }

  const rotation = buildParticipantRotationSummary(participant);

  if (!rotation.ready) {
    return { message: rotation.startPendingMessage ?? "Pendiente para iniciar T0: configuracion de rotacion.", ok: false };
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

function hasT0Started(participant: ParticipantRecord): boolean {
  if (participant.applicationStartedAt) {
    return true;
  }

  return (participant.activities ?? []).some(
    (activity) =>
      activity.actualStartedAt ||
      activity.actualCompletedAt ||
      activity.status === "COMPLETED" ||
      activity.status === "STARTED" ||
      activity.status === "INCOMPLETE"
  );
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
  const leftArm = getAssignedArm(participant, "LEFT", 1);
  const rightArm = getAssignedArm(participant, "RIGHT", 2);

  return {
    left: leftArm?.participantVisibleLabel || "Primera fragancia",
    right: rightArm?.participantVisibleLabel || "Segunda fragancia"
  };
}

function getAssignedArm(participant: ParticipantRecord, code: "LEFT" | "RIGHT", order: number) {
  const arms = participant.rotationAssignment?.arms ?? [];

  return (
    arms.find((arm) => arm.studyArm.code.toUpperCase() === code) ??
    arms.find((arm) => arm.applicationOrder === order) ??
    null
  );
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
