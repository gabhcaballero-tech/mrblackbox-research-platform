import { createPrismaClient, type PrismaClientLike } from "@/shared/db/client";
import {
  applyHutMissedDay,
  applyHutVideoSubmission,
  buildHutTsv,
  createHutParticipantToken,
  createHutRegistrationToken,
  getHutCurrentAvailability,
  HUT_MAX_BLOCK_CALENDAR_DAYS,
  HUT_MAX_MISSED_DAYS_PER_BLOCK,
  HUT_REQUIRED_VIDEOS_PER_BLOCK,
  nextHutBlockDayNumber,
  nextHutVideoSequence,
  normalizeHutEmail,
  normalizeHutPhone,
  normalizeHutText,
  normalizeOptionalHutText,
  parseHutParticipantImportText,
  parseHutRegistrationSlotImportText,
  participantStatusForStartedBlock,
  type HutBlockStatus,
  type HutCallEvaluationStatus,
  type HutParticipantStatus
} from "./service";
import {
  assertHutSelfieStorageKey,
  assertHutRegistrationSelfieStorageKey,
  assertHutVideoStorageKey,
  createHutSignedDailySelfieUpload,
  createHutSignedRegistrationSelfieUpload,
  createHutSignedReferenceSelfieUpload,
  createHutSignedVideoUpload,
  HUT_VIDEO_BUCKET,
  type HutSelfieUploadMetadata,
  type HutSignedSelfieUpload,
  type HutSignedVideoUpload,
  type HutStorageClient,
  type HutVideoUploadMetadata
} from "./storage";
import {
  createSupabaseEvidenceStorageClient,
} from "@/modules/participant-portal/evidence-storage";
import {
  normalizeNavigoFaceVerificationForStorage,
  type NavigoFaceVerificationClientResult
} from "@/modules/navigo-app/face-verification-contract";

export type HutActionResult<T = void> =
  | { ok: true; data: T; message?: string }
  | { ok: false; message: string };

export type HutStudySummary = {
  code: string;
  id: string;
  name: string;
  status: "ACTIVE" | "ARCHIVED" | "DRAFT" | "PAUSED";
  timeZoneIana: string;
};

export type HutAdminParticipant = {
  availability: {
    blockNumber?: number;
    expectedVideoSequence?: number;
    nextAvailableAt: Date | null;
    reason: string;
  };
  block1: HutBlockSummary | null;
  block2: HutBlockSummary | null;
  call1: HutCallSummary | null;
  call2: HutCallSummary | null;
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
  reminderPending: boolean;
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
  secondFragranceRightArm: string | null;
  status: HutParticipantStatus;
  token: string;
  usedToleranceInCurrentBlock: boolean;
  visualOverrideEnabled: boolean;
};

export type HutRegistrationSlotAdmin = {
  email: string | null;
  firstFragranceLeftArm: string;
  folio: string;
  id: string;
  link: string;
  participantId: string | null;
  participantLink: string | null;
  participantName: string | null;
  phone: string | null;
  referenceSelfieStatus: "COMPLETE" | "MISSING";
  secondFragranceRightArm: string;
  status: "AVAILABLE" | "CANCELLED" | "REGISTERED";
};

export type HutBlockSummary = {
  blockNumber: number;
  disqualificationReason: string | null;
  missedDaysCount: number;
  status: HutBlockStatus;
  submittedVideosCount: number;
};

export type HutCallSummary = {
  blockNumber: number;
  completedAt: Date | null;
  status: HutCallEvaluationStatus;
};

export type HutAdminDashboard = {
  participants: HutAdminParticipant[];
  registrationSlots: HutRegistrationSlotAdmin[];
  study: HutStudySummary;
};

export type HutRegistrationView = {
  firstFragranceLeftArm: string;
  folio: string;
  participantLink: string | null;
  participantName: string | null;
  registrationToken: string;
  secondFragranceRightArm: string;
  status: "AVAILABLE" | "CANCELLED" | "REGISTERED";
  studyName: string;
};

export type HutPortalView = {
  availableUpload: {
    blockNumber: number;
    sequenceNumber: number;
  } | null;
  availability: {
    blockNumber?: number;
    expectedVideoSequence?: number;
    nextAvailableAt: Date | null;
    reason: string;
  };
  block1: HutBlockSummary | null;
  block2: HutBlockSummary | null;
  message: string;
  name: string;
  participantId: string;
  status: HutParticipantStatus;
  studyName: string;
  token: string;
};

export type HutRepository = {
  completeCallEvaluation: (input: {
    blockNumber: 1 | 2;
    evaluatorName?: string | null;
    notes?: string | null;
    participantId: string;
    studyId: string;
  }) => Promise<HutActionResult<{ participantId: string }>>;
  createParticipant: (input: {
    email?: string | null;
    firstFragranceLeftArm?: string | null;
    folio?: string | null;
    name: string;
    phone?: string | null;
    recruiter?: string | null;
    requestOrigin: string;
    secondFragranceRightArm?: string | null;
    slotId?: string | null;
    startDate?: Date | null;
    studyId: string;
  }) => Promise<HutActionResult<{ link: string; participantId: string }>>;
  createRegistrationSlot: (input: {
    firstFragranceLeftArm: string;
    folio: string;
    requestOrigin: string;
    secondFragranceRightArm: string;
    studyId: string;
  }) => Promise<HutActionResult<{ link: string; slotId: string }>>;
  exportProgress: (input: {
    now?: Date;
    requestOrigin: string;
    studyId: string;
  }) => Promise<HutActionResult<{ body: string; filename: string }>>;
  getAdminDashboard: (input: {
    requestOrigin: string;
    studyId: string;
  }) => Promise<HutAdminDashboard | null>;
  getPortalView: (token: string) => Promise<HutActionResult<HutPortalView>>;
  getRegistrationView: (token: string, requestOrigin: string) => Promise<HutActionResult<HutRegistrationView>>;
  importParticipants: (input: {
    requestOrigin: string;
    startDate?: Date | null;
    studyId: string;
    text: string;
  }) => Promise<HutActionResult<{ created: number; skipped: number }>>;
  importRegistrationSlots: (input: {
    requestOrigin: string;
    studyId: string;
    text: string;
  }) => Promise<HutActionResult<{ created: number; skipped: number }>>;
  markMissedDay: (input: {
    participantId: string;
    reminderSent?: boolean;
    studyId: string;
  }) => Promise<HutActionResult<{ participantId: string }>>;
  assignParticipantRotation: (input: {
    firstFragranceLeftArm?: string | null;
    folio?: string | null;
    participantId: string;
    secondFragranceRightArm?: string | null;
    slotId?: string | null;
    studyId: string;
  }) => Promise<HutActionResult<{ participantId: string }>>;
  deleteParticipant: (input: {
    confirmation: string;
    participantId: string;
    studyId: string;
  }) => Promise<HutActionResult<{ participantId: string }>>;
  reactivateParticipant: (input: {
    participantId: string;
    reason: string;
    studyId: string;
  }) => Promise<HutActionResult<{ participantId: string }>>;
  requestVideoUpload: (input: {
    metadata: HutVideoUploadMetadata;
    storage?: HutStorageClient;
    token: string;
  }) => Promise<HutActionResult<HutSignedVideoUpload>>;
  requestReferenceSelfieUpload: (input: {
    actorUserId: string;
    metadata: HutSelfieUploadMetadata;
    participantId: string;
    storage?: HutStorageClient;
    studyId: string;
  }) => Promise<HutActionResult<HutSignedSelfieUpload>>;
  confirmReferenceSelfieUpload: (input: {
    actorUserId: string;
    metadata: HutSelfieUploadMetadata & {
      privateStorageKey: string;
      storageBucket: string;
    };
    participantId: string;
    studyId: string;
  }) => Promise<HutActionResult<{ participantId: string }>>;
  requestRegistrationSelfieUpload: (input: {
    metadata: HutSelfieUploadMetadata;
    storage?: HutStorageClient;
    token: string;
  }) => Promise<HutActionResult<HutSignedSelfieUpload>>;
  completeRegistration: (input: {
    email?: string | null;
    metadata: HutSelfieUploadMetadata & {
      privateStorageKey: string;
      storageBucket: string;
    };
    name: string;
    phone: string;
    recruiter?: string | null;
    requestOrigin: string;
    token: string;
  }) => Promise<HutActionResult<{ participantLink: string; participantId: string }>>;
  requestDailySelfieUpload: (input: {
    metadata: HutSelfieUploadMetadata;
    storage?: HutStorageClient;
    token: string;
  }) => Promise<HutActionResult<HutSignedSelfieUpload & { referenceSelfieSignedUrl: string }>>;
  confirmDailySelfieUpload: (input: {
    faceVerification?: NavigoFaceVerificationClientResult | null;
    metadata: HutSelfieUploadMetadata & {
      privateStorageKey: string;
      storageBucket: string;
    };
    token: string;
  }) => Promise<HutActionResult<{ status: "MATCHED" | "NOT_MATCHED" | "UNCERTAIN" | "PENDING_REVIEW" }>>;
  setVisualOverride: (input: {
    actorUserId: string;
    enabled: boolean;
    participantId: string;
    reason: string;
    studyId: string;
  }) => Promise<HutActionResult<{ participantId: string }>>;
  confirmVideoUpload: (input: {
    metadata: HutVideoUploadMetadata & {
      privateStorageKey: string;
      storageBucket: string;
    };
    token: string;
  }) => Promise<HutActionResult<{ blockNumber: number; sequenceNumber: number }>>;
  startBlock: (input: {
    blockNumber: 1 | 2;
    participantId: string;
    startDate: Date;
    studyId: string;
  }) => Promise<HutActionResult<{ participantId: string }>>;
};

type PrismaModel = {
  count?: (args: unknown) => Promise<number>;
  create?: (args: unknown) => Promise<unknown>;
  delete?: (args: unknown) => Promise<unknown>;
  deleteMany?: (args: unknown) => Promise<unknown>;
  findFirst?: (args: unknown) => Promise<unknown>;
  findMany?: (args: unknown) => Promise<unknown>;
  findUnique?: (args: unknown) => Promise<unknown>;
  update?: (args: unknown) => Promise<unknown>;
  updateMany?: (args: unknown) => Promise<unknown>;
};

type HutPrismaClient = PrismaClientLike & {
  $transaction: <T>(callback: (tx: HutPrismaClient) => Promise<T>) => Promise<T>;
  hutBlock: PrismaModel;
  hutCallEvaluation: PrismaModel;
  hutDailyCheck: PrismaModel;
  hutParticipant: PrismaModel;
  hutReferenceSelfie: PrismaModel;
  hutRegistrationSlot: PrismaModel;
  hutVideoSubmission: PrismaModel;
  hutVisualVerification: PrismaModel;
  study: PrismaModel;
};

type HutParticipantRecord = {
  blocks: HutBlockRecord[];
  callEvaluations: HutCallRecord[];
  currentBlockNumber: number;
  currentVideoSequence: number;
  dailyChecks?: HutDailyCheckRecord[];
  email: string | null;
  firstFragranceLeftArm: string | null;
  folio: string | null;
  id: string;
  name: string;
  phone: string | null;
  recruiter: string | null;
  startDate: Date | null;
  status: HutParticipantStatus;
  study: HutStudySummary;
  studyId: string;
  token: string;
  referenceSelfie: HutReferenceSelfieRecord | null;
  registrationSlot?: HutRegistrationSlotRecord | null;
  secondFragranceRightArm: string | null;
  videoSubmissions?: HutVideoRecord[];
  visualOverrideEnabled: boolean;
  visualOverrideReason: string | null;
  visualVerifications?: HutVisualVerificationRecord[];
};

type HutRegistrationSlotRecord = {
  firstFragranceLeftArm: string;
  folio: string;
  id: string;
  participant: (Pick<HutParticipantRecord, "email" | "id" | "name" | "phone" | "referenceSelfie" | "token">) | null;
  participantId: string | null;
  registrationToken: string;
  secondFragranceRightArm: string;
  status: "AVAILABLE" | "CANCELLED" | "REGISTERED";
  study: HutStudySummary;
  studyId: string;
};

type HutReferenceSelfieRecord = {
  capturedAt: Date;
  privateStorageKey: string;
  storageBucket: string;
};

type HutBlockRecord = {
  blockNumber: 1 | 2;
  disqualificationReason: string | null;
  id: string;
  maxMissedDaysAllowed: number;
  missedDaysCount: number;
  requiredVideos: number;
  startDate: Date | null;
  status: HutBlockStatus;
  submittedVideosCount: number;
};

type HutCallRecord = {
  blockNumber: 1 | 2;
  completedAt: Date | null;
  status: HutCallEvaluationStatus;
};

type HutDailyCheckRecord = {
  blockId: string;
  blockDayNumber: number;
  status: string;
};

type HutVideoRecord = {
  blockNumber: number;
  id?: string;
  sequenceNumber: number;
};

type HutVisualVerificationRecord = {
  attemptSelfieKey: string;
  blockNumber: number;
  id: string;
  sequenceNumber: number;
  status: "MATCHED" | "NOT_MATCHED" | "NOT_REQUIRED_BY_OVERRIDE" | "PENDING" | "PENDING_REVIEW" | "UNCERTAIN";
};

const studySelect = {
  code: true,
  id: true,
  name: true,
  status: true,
  timeZoneIana: true
} as const;

const participantSelect = {
  blocks: {
    orderBy: { blockNumber: "asc" },
    select: {
      blockNumber: true,
      disqualificationReason: true,
      id: true,
      maxMissedDaysAllowed: true,
      missedDaysCount: true,
      requiredVideos: true,
      startDate: true,
      status: true,
      submittedVideosCount: true
    }
  },
  callEvaluations: {
    orderBy: { blockNumber: "asc" },
    select: {
      blockNumber: true,
      completedAt: true,
      status: true
    }
  },
  currentBlockNumber: true,
  currentVideoSequence: true,
  dailyChecks: {
    orderBy: { blockDayNumber: "asc" },
    select: {
      blockId: true,
      blockDayNumber: true,
      status: true
    }
  },
  email: true,
  firstFragranceLeftArm: true,
  folio: true,
  id: true,
  name: true,
  phone: true,
  recruiter: true,
  referenceSelfie: {
    select: {
      capturedAt: true,
      privateStorageKey: true,
      storageBucket: true
    }
  },
  registrationSlot: {
    select: {
      folio: true,
      id: true,
      registrationToken: true,
      status: true
    }
  },
  secondFragranceRightArm: true,
  startDate: true,
  status: true,
  study: { select: studySelect },
  studyId: true,
  token: true,
  visualOverrideEnabled: true,
  visualOverrideReason: true,
  visualVerifications: {
    orderBy: { createdAt: "desc" },
    select: {
      attemptSelfieKey: true,
      blockNumber: true,
      id: true,
      sequenceNumber: true,
      status: true
    }
  },
  videoSubmissions: {
    orderBy: [{ blockNumber: "asc" }, { sequenceNumber: "asc" }],
    select: {
      blockNumber: true,
      id: true,
      sequenceNumber: true
    }
  }
} as const;

const registrationSlotSelect = {
  firstFragranceLeftArm: true,
  folio: true,
  id: true,
  participant: {
    select: {
      email: true,
      id: true,
      name: true,
      phone: true,
      referenceSelfie: {
        select: {
          capturedAt: true,
          privateStorageKey: true,
          storageBucket: true
        }
      },
      token: true
    }
  },
  participantId: true,
  registrationToken: true,
  secondFragranceRightArm: true,
  status: true,
  study: { select: studySelect },
  studyId: true
} as const;

export function createHutRepository(prismaClient?: HutPrismaClient): HutRepository {
  async function getPrisma() {
    return prismaClient ?? ((await createPrismaClient()) as HutPrismaClient);
  }

  async function findParticipant(prisma: HutPrismaClient, participantId: string) {
    return (await prisma.hutParticipant.findUnique?.({
      select: participantSelect,
      where: { id: participantId }
    })) as HutParticipantRecord | null;
  }

  async function findParticipantByToken(prisma: HutPrismaClient, token: string) {
    return (await prisma.hutParticipant.findUnique?.({
      select: participantSelect,
      where: { token }
    })) as HutParticipantRecord | null;
  }

  return {
    async createParticipant(input) {
      const name = normalizeHutText(input.name);

      if (!name) {
        return { message: "Captura el nombre del participante HUT.", ok: false };
      }

      const phone = normalizeHutPhone(input.phone);
      const email = normalizeHutEmail(input.email);
      const recruiter = normalizeOptionalHutText(input.recruiter);
      const manualRotation = normalizeManualRotation({
        firstFragranceLeftArm: input.firstFragranceLeftArm,
        folio: input.folio,
        secondFragranceRightArm: input.secondFragranceRightArm
      });
      if (!manualRotation.ok) {
        return { message: manualRotation.message, ok: false };
      }
      const prisma = await getPrisma();

      return prisma.$transaction(async (tx) => {
        const study = (await tx.study.findUnique?.({
          select: studySelect,
          where: { id: input.studyId }
        })) as HutStudySummary | null;

        if (!study) {
          return { message: "No encontramos el estudio.", ok: false };
        }

        const slot = input.slotId
          ? ((await tx.hutRegistrationSlot.findUnique?.({
              select: registrationSlotSelect,
              where: { id: input.slotId }
            })) as HutRegistrationSlotRecord | null)
          : null;

        if (input.slotId && (!slot || slot.studyId !== input.studyId)) {
          return { message: "No encontramos el folio HUT seleccionado.", ok: false };
        }
        if (slot && (slot.status !== "AVAILABLE" || slot.participantId)) {
          return { message: "Este folio ya fue registrado.", ok: false };
        }

        const rotation = slot
          ? {
              firstFragranceLeftArm: slot.firstFragranceLeftArm,
              folio: slot.folio,
              secondFragranceRightArm: slot.secondFragranceRightArm
            }
          : manualRotation.data;

        if (rotation?.folio) {
          const duplicate = await findParticipantByFolio(tx, {
            folio: rotation.folio,
            studyId: input.studyId
          });
          if (duplicate) {
            return { message: "Ya existe un participante HUT con ese folio.", ok: false };
          }
        }

        const existing = await findExistingParticipant(tx, {
          email,
          phone,
          studyId: input.studyId
        });

        if (existing) {
          return {
            data: {
              link: participantLink(input.requestOrigin, existing.token),
              participantId: existing.id
            },
            message: "El participante HUT ya existia; se reutilizo su enlace.",
            ok: true
          };
        }

        const token = createHutParticipantToken();
        const startsNow = Boolean(input.startDate);
        const participant = (await tx.hutParticipant.create?.({
          data: {
            currentBlockNumber: 1,
            currentVideoSequence: 1,
            email,
            firstFragranceLeftArm: rotation?.firstFragranceLeftArm ?? null,
            folio: rotation?.folio ?? null,
            name,
            phone,
            recruiter,
            secondFragranceRightArm: rotation?.secondFragranceRightArm ?? null,
            startDate: input.startDate ?? null,
            status: startsNow ? "BLOCK_1_IN_PROGRESS" : "NOT_STARTED",
            studyId: input.studyId,
            token
          }
        })) as { id: string };

        await createHutParticipantFoundation(tx, {
          participantId: participant.id,
          startDate: input.startDate ?? null,
          startsNow
        });

        if (slot) {
          await tx.hutRegistrationSlot.update?.({
            data: {
              participantId: participant.id,
              registeredAt: new Date(),
              status: "REGISTERED"
            },
            where: { id: slot.id }
          });
        }

        return {
          data: {
            link: participantLink(input.requestOrigin, token),
            participantId: participant.id
          },
          message: "Participante HUT creado correctamente.",
          ok: true
        };
      });
    },

    async createRegistrationSlot(input) {
      const folio = normalizeHutText(input.folio);
      const firstFragranceLeftArm = normalizeHutText(input.firstFragranceLeftArm);
      const secondFragranceRightArm = normalizeHutText(input.secondFragranceRightArm);

      if (!folio) {
        return { message: "Captura el folio HUT.", ok: false };
      }
      if (!firstFragranceLeftArm || !secondFragranceRightArm) {
        return { message: "Captura ambas fragancias o brazos de la rotacion.", ok: false };
      }

      const prisma = await getPrisma();
      const study = (await prisma.study.findUnique?.({
        select: studySelect,
        where: { id: input.studyId }
      })) as HutStudySummary | null;

      if (!study) {
        return { message: "No encontramos el estudio.", ok: false };
      }

      const participantWithFolio = await findParticipantByFolio(prisma, {
        folio,
        studyId: input.studyId
      });
      if (participantWithFolio) {
        return { message: "Ya existe un participante HUT con ese folio.", ok: false };
      }

      const existing = (await prisma.hutRegistrationSlot.findFirst?.({
        select: registrationSlotSelect,
        where: {
          folio,
          studyId: input.studyId
        }
      })) as HutRegistrationSlotRecord | null;

      if (existing) {
        return {
          data: {
            link: registrationLink(input.requestOrigin, existing.registrationToken),
            slotId: existing.id
          },
          message: "El folio HUT ya existia; se reutilizo su link de registro.",
          ok: true
        };
      }

      const token = createHutRegistrationToken();
      const slot = (await prisma.hutRegistrationSlot.create?.({
        data: {
          firstFragranceLeftArm,
          folio,
          registrationToken: token,
          secondFragranceRightArm,
          studyId: input.studyId
        }
      })) as { id: string };

      return {
        data: {
          link: registrationLink(input.requestOrigin, token),
          slotId: slot.id
        },
        message: "Folio HUT creado correctamente.",
        ok: true
      };
    },

    async importParticipants(input) {
      const rows = parseHutParticipantImportText(input.text);
      const repository = createHutRepository(await getPrisma());
      let created = 0;
      let skipped = 0;

      for (const row of rows) {
        const result = await repository.createParticipant({
          ...row,
          requestOrigin: input.requestOrigin,
          startDate: input.startDate,
          studyId: input.studyId
        });

        if (result.ok && result.message?.includes("creado")) {
          created += 1;
        } else {
          skipped += 1;
        }
      }

      return {
        data: { created, skipped },
        message: `Importacion HUT completada. Creados: ${created}. Omitidos/reutilizados: ${skipped}.`,
        ok: true
      };
    },

    async importRegistrationSlots(input) {
      const rows = parseHutRegistrationSlotImportText(input.text);
      const repository = createHutRepository(await getPrisma());
      let created = 0;
      let skipped = 0;

      for (const row of rows) {
        const result = await repository.createRegistrationSlot({
          ...row,
          requestOrigin: input.requestOrigin,
          studyId: input.studyId
        });

        if (result.ok && result.message?.includes("creado")) {
          created += 1;
        } else {
          skipped += 1;
        }
      }

      return {
        data: { created, skipped },
        message: `Importacion de folios HUT completada. Creados: ${created}. Omitidos/reutilizados: ${skipped}.`,
        ok: true
      };
    },

    async getAdminDashboard(input) {
      const prisma = await getPrisma();
      const study = (await prisma.study.findUnique?.({
        select: studySelect,
        where: { id: input.studyId }
      })) as HutStudySummary | null;

      if (!study) {
        return null;
      }

      const participants = (await prisma.hutParticipant.findMany?.({
        orderBy: [{ createdAt: "asc" }],
        select: participantSelect,
        where: { studyId: input.studyId }
      })) as HutParticipantRecord[];
      const registrationSlots = (await prisma.hutRegistrationSlot.findMany?.({
        orderBy: [{ folio: "asc" }],
        select: registrationSlotSelect,
        where: { studyId: input.studyId }
      })) as HutRegistrationSlotRecord[];

      return {
        participants: participants.map((participant) => toAdminParticipant(participant, input.requestOrigin)),
        registrationSlots: registrationSlots.map((slot) => toAdminRegistrationSlot(slot, input.requestOrigin)),
        study
      };
    },

    async getPortalView(token) {
      const prisma = await getPrisma();
      const participant = await findParticipantByToken(prisma, token);

      if (!participant) {
        return { message: "Este enlace HUT no es valido.", ok: false };
      }

      return {
        data: toPortalView(participant),
        ok: true
      };
    },

    async getRegistrationView(token, requestOrigin) {
      const prisma = await getPrisma();
      const slot = (await prisma.hutRegistrationSlot.findUnique?.({
        select: registrationSlotSelect,
        where: { registrationToken: token }
      })) as HutRegistrationSlotRecord | null;

      if (!slot) {
        return { message: "Este link de registro HUT no es valido.", ok: false };
      }

      return {
        data: {
          firstFragranceLeftArm: slot.firstFragranceLeftArm,
          folio: slot.folio,
          participantLink: slot.participant ? participantLink(requestOrigin, slot.participant.token) : null,
          participantName: slot.participant?.name ?? null,
          registrationToken: slot.registrationToken,
          secondFragranceRightArm: slot.secondFragranceRightArm,
          status: slot.status,
          studyName: slot.study.name
        },
        ok: true
      };
    },

    async startBlock(input) {
      const prisma = await getPrisma();

      return prisma.$transaction(async (tx) => {
        const participant = await findParticipant(tx, input.participantId);

        if (!participant || participant.studyId !== input.studyId) {
          return { message: "No encontramos el participante HUT.", ok: false };
        }

        if (participant.status === "DISQUALIFIED" || participant.status === "COMPLETED") {
          return { message: "Este participante ya no puede iniciar otro bloque.", ok: false };
        }

        if (input.blockNumber === 2 && !callForBlock(participant, 1, "COMPLETED")) {
          return { message: "Completa la evaluacion telefonica 1 antes de iniciar el bloque 2.", ok: false };
        }

        const block = blockByNumber(participant, input.blockNumber);
        if (!block) {
          return { message: "No encontramos el bloque HUT.", ok: false };
        }

        await tx.hutBlock.update?.({
          data: {
            startDate: input.startDate,
            status: "IN_PROGRESS"
          },
          where: { id: block.id }
        });
        await tx.hutParticipant.update?.({
          data: {
            currentBlockNumber: input.blockNumber,
            currentVideoSequence: Math.min(block.submittedVideosCount + 1, block.requiredVideos),
            startDate: input.blockNumber === 1 ? input.startDate : participant.startDate,
            status: participantStatusForStartedBlock(input.blockNumber)
          },
          where: { id: participant.id }
        });

        return {
          data: { participantId: participant.id },
          message: `Bloque ${input.blockNumber} iniciado correctamente.`,
          ok: true
        };
      });
    },

    async markMissedDay(input) {
      const prisma = await getPrisma();
      const now = new Date();

      return prisma.$transaction(async (tx) => {
        const participant = await findParticipant(tx, input.participantId);

        if (!participant || participant.studyId !== input.studyId) {
          return { message: "No encontramos el participante HUT.", ok: false };
        }

        const block = activeBlock(participant);
        if (!block) {
          return { message: "El participante no tiene un bloque activo.", ok: false };
        }

        const blockDayNumber = nextBlockDayNumber(participant, block);
        if (blockDayNumber > HUT_MAX_BLOCK_CALENDAR_DAYS) {
          await disqualifyParticipant(tx, {
            block,
            participant,
            reason: "Excedio la duracion maxima de 4 dias calendario del bloque."
          });
          return {
            data: { participantId: participant.id },
            message: "Participante marcado como no apto por exceder la tolerancia del bloque.",
            ok: true
          };
        }

        const decision = applyHutMissedDay(block);
        await tx.hutDailyCheck.create?.({
          data: {
            blockDayNumber,
            blockId: block.id,
            blockNumber: block.blockNumber,
            date: now,
            expectedVideoSequence: nextHutVideoSequence(block) ?? block.requiredVideos,
            participantId: participant.id,
            reminderSentAt: input.reminderSent ? now : null,
            status: input.reminderSent && !decision.disqualified ? "REMINDER_SENT" : decision.reminderStatus
          }
        });

        if (decision.disqualified) {
          await disqualifyParticipant(tx, {
            block,
            participant,
            reason: decision.disqualificationReason
          });
          return {
            data: { participantId: participant.id },
            message: "Participante marcado como no apto por exceder la tolerancia total del bloque.",
            ok: true
          };
        }

        await tx.hutBlock.update?.({
          data: {
            missedDaysCount: decision.missedDaysCount
          },
          where: { id: block.id }
        });
        await tx.hutParticipant.update?.({
          data: {
            status: decision.participantStatus
          },
          where: { id: participant.id }
        });

        return {
          data: { participantId: participant.id },
          message: "Dia omitido registrado. La tolerancia del bloque quedo consumida.",
          ok: true
        };
      });
    },

    async assignParticipantRotation(input) {
      const manualRotation = normalizeManualRotation({
        firstFragranceLeftArm: input.firstFragranceLeftArm,
        folio: input.folio,
        secondFragranceRightArm: input.secondFragranceRightArm
      });
      if (!input.slotId && !manualRotation.ok) {
        return { message: manualRotation.message, ok: false };
      }

      const prisma = await getPrisma();

      return prisma.$transaction(async (tx) => {
        const participant = await findParticipant(tx, input.participantId);

        if (!participant || participant.studyId !== input.studyId) {
          return { message: "No encontramos el participante HUT.", ok: false };
        }

        const slot = input.slotId
          ? ((await tx.hutRegistrationSlot.findUnique?.({
              select: registrationSlotSelect,
              where: { id: input.slotId }
            })) as HutRegistrationSlotRecord | null)
          : null;

        if (input.slotId && (!slot || slot.studyId !== input.studyId)) {
          return { message: "No encontramos el folio HUT seleccionado.", ok: false };
        }
        if (slot && (slot.status !== "AVAILABLE" || slot.participantId)) {
          return { message: "Este folio ya fue registrado.", ok: false };
        }

        const rotation = slot
          ? {
              firstFragranceLeftArm: slot.firstFragranceLeftArm,
              folio: slot.folio,
              secondFragranceRightArm: slot.secondFragranceRightArm
            }
          : manualRotation.ok
            ? manualRotation.data
            : null;

        if (!rotation) {
          return { message: "Captura folio y rotacion HUT.", ok: false };
        }

        const duplicate = await findParticipantByFolio(tx, {
          excludeParticipantId: participant.id,
          folio: rotation.folio,
          studyId: input.studyId
        });
        if (duplicate) {
          return { message: "Ya existe un participante HUT con ese folio.", ok: false };
        }

        await releaseParticipantRegistrationSlot(tx, participant.id);
        await tx.hutParticipant.update?.({
          data: {
            firstFragranceLeftArm: rotation.firstFragranceLeftArm,
            folio: rotation.folio,
            secondFragranceRightArm: rotation.secondFragranceRightArm
          },
          where: { id: participant.id }
        });

        if (slot) {
          await tx.hutRegistrationSlot.update?.({
            data: {
              participantId: participant.id,
              registeredAt: new Date(),
              status: "REGISTERED"
            },
            where: { id: slot.id }
          });
        }

        return {
          data: { participantId: participant.id },
          message: "Folio y rotacion asignados correctamente.",
          ok: true
        };
      });
    },

    async deleteParticipant(input) {
      if (input.confirmation.trim() !== "ELIMINAR PARTICIPANTE HUT") {
        return { message: "Escribe ELIMINAR PARTICIPANTE HUT para confirmar.", ok: false };
      }

      const prisma = await getPrisma();

      return prisma.$transaction(async (tx) => {
        const participant = await findParticipant(tx, input.participantId);

        if (!participant || participant.studyId !== input.studyId) {
          return { message: "No encontramos el participante HUT.", ok: false };
        }

        await releaseParticipantRegistrationSlot(tx, participant.id);
        await tx.hutVisualVerification.deleteMany?.({ where: { participantId: participant.id } });
        await tx.hutVideoSubmission.deleteMany?.({ where: { participantId: participant.id } });
        await tx.hutDailyCheck.deleteMany?.({ where: { participantId: participant.id } });
        await tx.hutCallEvaluation.deleteMany?.({ where: { participantId: participant.id } });
        await tx.hutReferenceSelfie.deleteMany?.({ where: { participantId: participant.id } });
        await tx.hutBlock.deleteMany?.({ where: { participantId: participant.id } });
        await tx.hutParticipant.delete?.({ where: { id: participant.id } });

        return {
          data: { participantId: participant.id },
          message: "Participante HUT eliminado correctamente. El folio asociado quedo disponible.",
          ok: true
        };
      });
    },

    async completeCallEvaluation(input) {
      const prisma = await getPrisma();
      const now = new Date();

      return prisma.$transaction(async (tx) => {
        const participant = await findParticipant(tx, input.participantId);

        if (!participant || participant.studyId !== input.studyId) {
          return { message: "No encontramos el participante HUT.", ok: false };
        }

        const block = blockByNumber(participant, input.blockNumber);
        if (!block || block.status !== "CALL_PENDING") {
          return { message: "El bloque todavia no esta listo para evaluacion telefonica.", ok: false };
        }

        await tx.hutCallEvaluation.update?.({
          data: {
            completedAt: now,
            evaluatorName: normalizeOptionalHutText(input.evaluatorName),
            notes: input.notes?.trim() || null,
            status: "COMPLETED"
          },
          where: {
            participantId_blockNumber: {
              blockNumber: input.blockNumber,
              participantId: participant.id
            }
          }
        });
        await tx.hutBlock.update?.({
          data: {
            completedAt: now,
            status: "COMPLETED"
          },
          where: { id: block.id }
        });

        if (input.blockNumber === 2) {
          await tx.hutParticipant.update?.({
            data: {
              status: "COMPLETED"
            },
            where: { id: participant.id }
          });
        } else {
          await tx.hutParticipant.update?.({
            data: {
              currentBlockNumber: 2,
              currentVideoSequence: 1,
              status: "NOT_STARTED"
            },
            where: { id: participant.id }
          });
        }

        return {
          data: { participantId: participant.id },
          message:
            input.blockNumber === 2
              ? "Evaluacion final completada. Participacion HUT finalizada."
              : "Evaluacion 1 completada. Ya puedes iniciar el bloque 2.",
          ok: true
        };
      });
    },

    async reactivateParticipant(input) {
      if (!input.reason.trim()) {
        return { message: "Captura el motivo de reactivacion.", ok: false };
      }

      const prisma = await getPrisma();

      return prisma.$transaction(async (tx) => {
        const participant = await findParticipant(tx, input.participantId);

        if (!participant || participant.studyId !== input.studyId) {
          return { message: "No encontramos el participante HUT.", ok: false };
        }

        const block = blockByNumber(participant, participant.currentBlockNumber as 1 | 2) ?? blockByNumber(participant, 1);
        if (!block) {
          return { message: "No encontramos el bloque a reactivar.", ok: false };
        }

        await tx.hutBlock.update?.({
          data: {
            disqualificationReason: null,
            status: "IN_PROGRESS"
          },
          where: { id: block.id }
        });
        await tx.hutParticipant.update?.({
          data: {
            status: participantStatusForStartedBlock(block.blockNumber),
            currentVideoSequence: nextHutVideoSequence(block) ?? block.requiredVideos
          },
          where: { id: participant.id }
        });

        return {
          data: { participantId: participant.id },
          message: "Participante HUT reactivado manualmente por supervisor/admin.",
          ok: true
        };
      });
    },

    async requestVideoUpload(input) {
      const prisma = await getPrisma();
      const participant = await findParticipantByToken(prisma, input.token);

      if (!participant) {
        return { message: "Este enlace HUT no es valido.", ok: false };
      }

      const block = activeBlock(participant);
      if (!block) {
        return { message: "No hay videos disponibles para subir en este momento.", ok: false };
      }

      const availability = currentAvailability(participant, block, new Date());
      if (availability.reason !== "AVAILABLE_FOR_VIDEO") {
        return { message: videoUnavailableMessage(availability.reason, availability.nextAvailableAt), ok: false };
      }

      const sequenceNumber = nextHutVideoSequence(block);
      if (!sequenceNumber) {
        return { message: "Este bloque ya tiene todos sus videos.", ok: false };
      }

      try {
        const signed = await createHutSignedVideoUpload({
          blockNumber: block.blockNumber,
          metadata: input.metadata,
          participantId: participant.id,
          sequenceNumber,
          storage: input.storage,
          studyId: participant.studyId
        });
        return { data: signed, ok: true };
      } catch (error) {
        return { message: error instanceof Error ? error.message : "No fue posible preparar la carga del video.", ok: false };
      }
    },

    async requestReferenceSelfieUpload(input) {
      const prisma = await getPrisma();
      const participant = await findParticipant(prisma, input.participantId);

      if (!participant || participant.studyId !== input.studyId) {
        return { message: "No encontramos el participante HUT.", ok: false };
      }

      if (participant.blocks.some((block) => block.status !== "NOT_STARTED")) {
        return { message: "La selfie de registro solo puede reemplazarse antes de iniciar el bloque.", ok: false };
      }

      try {
        const signed = await createHutSignedReferenceSelfieUpload({
          metadata: input.metadata,
          participantId: participant.id,
          storage: input.storage,
          studyId: participant.studyId
        });
        return { data: signed, ok: true };
      } catch (error) {
        return { message: error instanceof Error ? error.message : "No fue posible preparar la selfie de registro.", ok: false };
      }
    },

    async confirmReferenceSelfieUpload(input) {
      const prisma = await getPrisma();
      const now = new Date();

      return prisma.$transaction(async (tx) => {
        const participant = await findParticipant(tx, input.participantId);

        if (!participant || participant.studyId !== input.studyId) {
          return { message: "No encontramos el participante HUT.", ok: false };
        }

        if (input.metadata.storageBucket !== HUT_VIDEO_BUCKET) {
          return { message: "No fue posible validar la selfie de registro.", ok: false };
        }

        try {
          assertHutSelfieStorageKey({
            participantId: participant.id,
            privateStorageKey: input.metadata.privateStorageKey,
            studyId: participant.studyId
          });
        } catch (error) {
          return { message: error instanceof Error ? error.message : "No fue posible validar la selfie de registro.", ok: false };
        }

        const existing = (await tx.hutReferenceSelfie.findFirst?.({
          select: { id: true },
          where: { participantId: participant.id }
        })) as { id: string } | null;
        const data = {
          capturedAt: now,
          capturedByRole: "INTERNAL_USER",
          capturedByUserId: input.actorUserId,
          extension: extensionFromFilename(input.metadata.originalFilename),
          mimeType: input.metadata.mimeType,
          originalFilename: input.metadata.originalFilename,
          privateStorageKey: input.metadata.privateStorageKey,
          sizeBytes: input.metadata.sizeBytes,
          storageBucket: input.metadata.storageBucket
        };

        if (existing) {
          await tx.hutReferenceSelfie.update?.({
            data,
            where: { id: existing.id }
          });
        } else {
          await tx.hutReferenceSelfie.create?.({
            data: {
              ...data,
              participantId: participant.id
            }
          });
        }

        return {
          data: { participantId: participant.id },
          message: "Selfie de registro guardada correctamente.",
          ok: true
        };
      });
    },

    async requestRegistrationSelfieUpload(input) {
      const prisma = await getPrisma();
      const slot = (await prisma.hutRegistrationSlot.findUnique?.({
        select: registrationSlotSelect,
        where: { registrationToken: input.token }
      })) as HutRegistrationSlotRecord | null;

      if (!slot) {
        return { message: "Este link de registro HUT no es valido.", ok: false };
      }
      if (slot.status !== "AVAILABLE" || slot.participantId) {
        return { message: "Este folio ya fue registrado.", ok: false };
      }

      try {
        const signed = await createHutSignedRegistrationSelfieUpload({
          metadata: input.metadata,
          slotId: slot.id,
          storage: input.storage,
          studyId: slot.studyId
        });
        return { data: signed, ok: true };
      } catch (error) {
        return { message: error instanceof Error ? error.message : "No fue posible preparar la selfie de registro.", ok: false };
      }
    },

    async completeRegistration(input) {
      const name = normalizeHutText(input.name);
      const phone = normalizeHutPhone(input.phone);
      const email = normalizeHutEmail(input.email);
      const recruiter = normalizeOptionalHutText(input.recruiter);

      if (!name) {
        return { message: "Captura el nombre del participante.", ok: false };
      }
      if (!phone) {
        return { message: "Captura el celular del participante.", ok: false };
      }
      if (input.metadata.storageBucket !== HUT_VIDEO_BUCKET) {
        return { message: "No fue posible validar la selfie de registro.", ok: false };
      }

      const prisma = await getPrisma();
      const now = new Date();

      return prisma.$transaction(async (tx) => {
        const slot = (await tx.hutRegistrationSlot.findUnique?.({
          select: registrationSlotSelect,
          where: { registrationToken: input.token }
        })) as HutRegistrationSlotRecord | null;

        if (!slot) {
          return { message: "Este link de registro HUT no es valido.", ok: false };
        }
        if (slot.status !== "AVAILABLE" || slot.participantId) {
          return { message: "Este folio ya fue registrado.", ok: false };
        }

        const duplicate = await findParticipantByFolio(tx, {
          folio: slot.folio,
          studyId: slot.studyId
        });
        if (duplicate) {
          return { message: "Ya existe un participante HUT con ese folio.", ok: false };
        }

        try {
          assertHutRegistrationSelfieStorageKey({
            privateStorageKey: input.metadata.privateStorageKey,
            slotId: slot.id,
            studyId: slot.studyId
          });
        } catch (error) {
          return { message: error instanceof Error ? error.message : "No fue posible validar la selfie de registro.", ok: false };
        }

        const token = createHutParticipantToken();
        const participant = (await tx.hutParticipant.create?.({
          data: {
            currentBlockNumber: 1,
            currentVideoSequence: 1,
            email,
            firstFragranceLeftArm: slot.firstFragranceLeftArm,
            folio: slot.folio,
            name,
            phone,
            recruiter,
            secondFragranceRightArm: slot.secondFragranceRightArm,
            startDate: now,
            status: "BLOCK_1_IN_PROGRESS",
            studyId: slot.studyId,
            token
          }
        })) as { id: string };

        await createHutParticipantFoundation(tx, {
          participantId: participant.id,
          startDate: now,
          startsNow: true
        });

        await tx.hutReferenceSelfie.create?.({
          data: {
            capturedAt: now,
            capturedByRole: "FIELD_REGISTRATION",
            extension: extensionFromFilename(input.metadata.originalFilename),
            mimeType: input.metadata.mimeType,
            originalFilename: input.metadata.originalFilename,
            participantId: participant.id,
            privateStorageKey: input.metadata.privateStorageKey,
            sizeBytes: input.metadata.sizeBytes,
            storageBucket: input.metadata.storageBucket
          }
        });

        await tx.hutRegistrationSlot.update?.({
          data: {
            participantId: participant.id,
            registeredAt: now,
            status: "REGISTERED"
          },
          where: { id: slot.id }
        });

        return {
          data: {
            participantId: participant.id,
            participantLink: participantLink(input.requestOrigin, token)
          },
          message: "Registro HUT completado correctamente.",
          ok: true
        };
      });
    },

    async requestDailySelfieUpload(input) {
      const prisma = await getPrisma();
      const participant = await findParticipantByToken(prisma, input.token);

      if (!participant) {
        return { message: "Este enlace HUT no es valido.", ok: false };
      }

      const block = activeBlock(participant);
      if (!block) {
        return { message: "No hay actividad HUT disponible.", ok: false };
      }

      const availability = currentAvailability(participant, block, new Date());
      if (availability.reason !== "AVAILABLE_FOR_SELFIE") {
        return { message: videoUnavailableMessage(availability.reason, availability.nextAvailableAt), ok: false };
      }

      if (!participant.referenceSelfie) {
        return { message: "Tu registro aun no esta completo. Contacta al encuestador.", ok: false };
      }

      try {
        const storage = input.storage ?? createSupabaseEvidenceStorageClient();
        const [signed, referenceSelfieSignedUrl] = await Promise.all([
          createHutSignedDailySelfieUpload({
            blockNumber: block.blockNumber,
            metadata: input.metadata,
            participantId: participant.id,
            sequenceNumber: availability.expectedVideoSequence,
            storage,
            studyId: participant.studyId
          }),
          storage.createSignedReadUrl({
            bucket: participant.referenceSelfie.storageBucket,
            expiresInSeconds: 60 * 10,
            privateStorageKey: participant.referenceSelfie.privateStorageKey
          })
        ]);
        return { data: { ...signed, referenceSelfieSignedUrl }, ok: true };
      } catch (error) {
        return { message: error instanceof Error ? error.message : "No fue posible preparar la selfie diaria.", ok: false };
      }
    },

    async confirmDailySelfieUpload(input) {
      const prisma = await getPrisma();
      const now = new Date();

      return prisma.$transaction(async (tx) => {
        const participant = await findParticipantByToken(tx, input.token);

        if (!participant) {
          return { message: "Este enlace HUT no es valido.", ok: false };
        }

        const block = activeBlock(participant);
        if (!block) {
          return { message: "No hay actividad HUT disponible.", ok: false };
        }

        const availability = currentAvailability(participant, block, now);
        if (availability.reason !== "AVAILABLE_FOR_SELFIE") {
          return { message: videoUnavailableMessage(availability.reason, availability.nextAvailableAt), ok: false };
        }

        if (!participant.referenceSelfie) {
          return { message: "Tu registro aun no esta completo. Contacta al encuestador.", ok: false };
        }

        if (input.metadata.storageBucket !== HUT_VIDEO_BUCKET) {
          return { message: "No fue posible validar la selfie diaria.", ok: false };
        }

        try {
          assertHutSelfieStorageKey({
            participantId: participant.id,
            privateStorageKey: input.metadata.privateStorageKey,
            studyId: participant.studyId
          });
        } catch (error) {
          return { message: error instanceof Error ? error.message : "No fue posible validar la selfie diaria.", ok: false };
        }

        const normalized = normalizeNavigoFaceVerificationForStorage(input.faceVerification);
        const status = hutVisualStatusFromReview(normalized.reviewStatus);
        await tx.hutVisualVerification.create?.({
          data: {
            attemptExtension: extensionFromFilename(input.metadata.originalFilename),
            attemptMimeType: input.metadata.mimeType,
            attemptOriginalFilename: input.metadata.originalFilename,
            attemptSelfieKey: input.metadata.privateStorageKey,
            attemptSizeBytes: input.metadata.sizeBytes,
            attemptStorageBucket: input.metadata.storageBucket,
            blockId: block.id,
            blockNumber: block.blockNumber,
            participantId: participant.id,
            referenceSelfieKey: participant.referenceSelfie.privateStorageKey,
            sequenceNumber: availability.expectedVideoSequence,
            similarityScore: input.faceVerification?.score ?? null,
            status,
            verificationDate: now
          }
        });

        return {
          data: { status },
          message:
            status === "MATCHED"
              ? "Identidad confirmada. Ya puedes subir tu video."
              : "No pudimos confirmar tu identidad. Contacta al supervisor antes de continuar.",
          ok: true
        };
      });
    },

    async setVisualOverride(input) {
      if (input.enabled && !input.reason.trim()) {
        return { message: "Captura el motivo del override visual.", ok: false };
      }

      const prisma = await getPrisma();
      const participant = await findParticipant(prisma, input.participantId);

      if (!participant || participant.studyId !== input.studyId) {
        return { message: "No encontramos el participante HUT.", ok: false };
      }

      await prisma.hutParticipant.update?.({
        data: {
          visualOverrideAt: input.enabled ? new Date() : null,
          visualOverrideByUserId: input.enabled ? input.actorUserId : null,
          visualOverrideEnabled: input.enabled,
          visualOverrideReason: input.enabled ? input.reason.trim() : null
        },
        where: { id: participant.id }
      });

      return {
        data: { participantId: participant.id },
        message: input.enabled ? "Override visual habilitado para este participante." : "Override visual deshabilitado.",
        ok: true
      };
    },

    async confirmVideoUpload(input) {
      const prisma = await getPrisma();
      const now = new Date();

      return prisma.$transaction(async (tx) => {
        const participant = await findParticipantByToken(tx, input.token);

        if (!participant) {
          return { message: "Este enlace HUT no es valido.", ok: false };
        }

        const block = activeBlock(participant);
        if (!block) {
          return { message: "No hay videos disponibles para confirmar.", ok: false };
        }

        const availability = currentAvailability(participant, block, now);
        if (availability.reason !== "AVAILABLE_FOR_VIDEO") {
          return { message: videoUnavailableMessage(availability.reason, availability.nextAvailableAt), ok: false };
        }

        if (input.metadata.storageBucket !== HUT_VIDEO_BUCKET) {
          return { message: "No fue posible validar el video cargado.", ok: false };
        }

        try {
          assertHutVideoStorageKey({
            participantId: participant.id,
            privateStorageKey: input.metadata.privateStorageKey,
            studyId: participant.studyId
          });
        } catch (error) {
          return { message: error instanceof Error ? error.message : "No fue posible validar el video cargado.", ok: false };
        }

        const sequenceNumber = nextHutVideoSequence(block);
        if (!sequenceNumber) {
          return { message: "Este bloque ya tiene todos sus videos.", ok: false };
        }

        const blockDayNumber = nextBlockDayNumber(participant, block);
        if (blockDayNumber > HUT_MAX_BLOCK_CALENDAR_DAYS) {
          await disqualifyParticipant(tx, {
            block,
            participant,
            reason: "Excedio la duracion maxima de 4 dias calendario del bloque."
          });
          return { message: "No es posible continuar porque se excedio la tolerancia del bloque.", ok: false };
        }

        const decision = applyHutVideoSubmission(block);
        const video = (await tx.hutVideoSubmission.create?.({
          data: {
            blockId: block.id,
            blockNumber: block.blockNumber,
            extension: extensionFromFilename(input.metadata.originalFilename),
            mimeType: input.metadata.mimeType,
            originalFilename: input.metadata.originalFilename,
            participantId: participant.id,
            privateStorageKey: input.metadata.privateStorageKey,
            sequenceNumber,
            sizeBytes: input.metadata.sizeBytes,
            storageBucket: input.metadata.storageBucket,
            submittedAt: now,
            status: "SUBMITTED"
          }
        })) as { id: string } | undefined;
        const verification = latestVerificationForSequence(participant, block.blockNumber, sequenceNumber);
        if (verification && video?.id) {
          await tx.hutVisualVerification.update?.({
            data: { videoSubmissionId: video.id },
            where: { id: verification.id }
          });
        }
        await tx.hutDailyCheck.create?.({
          data: {
            blockDayNumber,
            blockId: block.id,
            blockNumber: block.blockNumber,
            date: now,
            expectedVideoSequence: sequenceNumber,
            participantId: participant.id,
            status: "COMPLETED"
          }
        });
        await tx.hutBlock.update?.({
          data: {
            completedAt: decision.blockStatus === "CALL_PENDING" ? now : null,
            status: decision.blockStatus,
            submittedVideosCount: decision.submittedVideosCount
          },
          where: { id: block.id }
        });
        await tx.hutParticipant.update?.({
          data: {
            currentBlockNumber: block.blockNumber,
            currentVideoSequence: decision.nextVideoSequence,
            status: decision.participantStatus
          },
          where: { id: participant.id }
        });

        return {
          data: {
            blockNumber: block.blockNumber,
            sequenceNumber
          },
          message:
            decision.blockStatus === "CALL_PENDING"
              ? "Video recibido. Tu etapa de videos esta completa."
              : "Video recibido correctamente.",
          ok: true
        };
      });
    },

    async exportProgress(input) {
      const dashboard = await createHutRepository(await getPrisma()).getAdminDashboard({
        requestOrigin: input.requestOrigin,
        studyId: input.studyId
      });

      if (!dashboard) {
        return { message: "No encontramos el estudio.", ok: false };
      }

      const rows = [
        [
          "ID",
          "Folio",
          "Nombre",
          "Celular",
          "Correo",
          "Reclutador",
          "Primera fragancia / brazo izquierdo",
          "Segunda fragancia / brazo derecho",
          "Link participante",
          "Estado general",
          "Bloque actual",
          "Video esperado",
          "Videos enviados bloque 1",
          "Dias omitidos bloque 1",
          "Evaluacion 1",
          "Videos enviados bloque 2",
          "Dias omitidos bloque 2",
          "Evaluacion 2",
          "No apto / motivo"
        ],
        ...dashboard.participants.map((participant) => [
          participant.id,
          participant.folio,
          participant.name,
          participant.phone,
          participant.email,
          participant.recruiter,
          participant.firstFragranceLeftArm,
          participant.secondFragranceRightArm,
          participant.link,
          participant.status,
          participant.currentBlockNumber,
          participant.currentVideoSequence,
          participant.block1?.submittedVideosCount ?? 0,
          participant.block1?.missedDaysCount ?? 0,
          participant.call1?.status ?? "PENDING",
          participant.block2?.submittedVideosCount ?? 0,
          participant.block2?.missedDaysCount ?? 0,
          participant.call2?.status ?? "PENDING",
          participant.block1?.disqualificationReason ?? participant.block2?.disqualificationReason ?? ""
        ]),
        [],
        [
          "Folio",
          "Link de registro",
          "Link participante",
          "Estado",
          "Nombre participante",
          "Celular",
          "Primera fragancia / brazo izquierdo",
          "Segunda fragancia / brazo derecho",
          "Selfie de registro"
        ],
        ...dashboard.registrationSlots.map((slot) => [
          slot.folio,
          slot.link,
          slot.participantLink,
          slot.status,
          slot.participantName,
          slot.phone,
          slot.firstFragranceLeftArm,
          slot.secondFragranceRightArm,
          slot.referenceSelfieStatus
        ])
      ];

      const now = input.now ?? new Date();
      return {
        data: {
          body: buildHutTsv(rows),
          filename: `${dashboard.study.code}_hut_avance_${dateForFilename(now)}.tsv`
        },
        ok: true
      };
    }
  };
}

async function findExistingParticipant(
  prisma: HutPrismaClient,
  input: { email: string | null; phone: string | null; studyId: string }
) {
  const or = [
    input.phone ? { phone: input.phone } : null,
    input.email ? { email: input.email } : null
  ].filter(Boolean);

  if (or.length === 0) {
    return null;
  }

  return (await prisma.hutParticipant.findFirst?.({
    select: {
      id: true,
      token: true
    },
    where: {
      OR: or,
      studyId: input.studyId
    }
  })) as { id: string; token: string } | null;
}

async function findParticipantByFolio(
  prisma: HutPrismaClient,
  input: { excludeParticipantId?: string; folio: string; studyId: string }
) {
  const participant = (await prisma.hutParticipant.findFirst?.({
    select: {
      id: true,
      token: true
    },
    where: {
      folio: input.folio,
      studyId: input.studyId
    }
  })) as { id: string; token: string } | null;

  if (participant && participant.id !== input.excludeParticipantId) {
    return participant;
  }

  return null;
}

function normalizeManualRotation(input: {
  firstFragranceLeftArm?: string | null;
  folio?: string | null;
  secondFragranceRightArm?: string | null;
}):
  | { ok: true; data: { firstFragranceLeftArm: string; folio: string; secondFragranceRightArm: string } | null }
  | { ok: false; message: string } {
  const folio = normalizeHutText(input.folio);
  const firstFragranceLeftArm = normalizeHutText(input.firstFragranceLeftArm);
  const secondFragranceRightArm = normalizeHutText(input.secondFragranceRightArm);

  if (!folio && !firstFragranceLeftArm && !secondFragranceRightArm) {
    return { data: null, ok: true };
  }
  if (!folio || !firstFragranceLeftArm || !secondFragranceRightArm) {
    return { message: "Captura folio, primera fragancia y segunda fragancia.", ok: false };
  }

  return {
    data: {
      firstFragranceLeftArm,
      folio,
      secondFragranceRightArm
    },
    ok: true
  };
}

async function releaseParticipantRegistrationSlot(tx: HutPrismaClient, participantId: string) {
  await tx.hutRegistrationSlot.updateMany?.({
    data: {
      participantId: null,
      registeredAt: null,
      status: "AVAILABLE"
    },
    where: { participantId }
  });
}

function toAdminParticipant(participant: HutParticipantRecord, requestOrigin: string): HutAdminParticipant {
  const block1 = blockByNumber(participant, 1);
  const block2 = blockByNumber(participant, 2);
  const call1 = callByNumber(participant, 1);
  const call2 = callByNumber(participant, 2);
  const block = activeBlock(participant);
  const availability = block
    ? currentAvailability(participant, block, new Date())
    : { nextAvailableAt: null, reason: "BLOCK_NOT_ACTIVE" };

  return {
    availability: {
      blockNumber: "blockNumber" in availability ? availability.blockNumber : undefined,
      expectedVideoSequence: "expectedVideoSequence" in availability ? availability.expectedVideoSequence : undefined,
      nextAvailableAt: availability.nextAvailableAt,
      reason: availability.reason
    },
    block1: block1 ? toBlockSummary(block1) : null,
    block2: block2 ? toBlockSummary(block2) : null,
    call1: call1 ? toCallSummary(call1) : null,
    call2: call2 ? toCallSummary(call2) : null,
    currentBlockNumber: participant.currentBlockNumber,
    currentVideoSequence: participant.currentVideoSequence,
    email: participant.email,
    firstFragranceLeftArm: participant.firstFragranceLeftArm,
    folio: participant.folio,
    id: participant.id,
    link: participantLink(requestOrigin, participant.token),
    name: participant.name,
    phone: participant.phone,
    recruiter: participant.recruiter,
    reminderPending: Boolean(participant.dailyChecks?.some((check) => check.status === "REMINDER_PENDING")),
    referenceSelfie: participant.referenceSelfie
      ? {
          capturedAt: participant.referenceSelfie.capturedAt,
          signedUrl: null,
          status: "COMPLETE"
        }
      : {
          capturedAt: new Date(0),
          signedUrl: null,
          status: "MISSING"
        },
    registrationSlot: participant.registrationSlot
      ? {
          folio: participant.registrationSlot.folio,
          id: participant.registrationSlot.id,
          status: participant.registrationSlot.status
        }
      : null,
    status: participant.status,
    secondFragranceRightArm: participant.secondFragranceRightArm,
    token: participant.token,
    usedToleranceInCurrentBlock: Boolean(block && block.missedDaysCount >= block.maxMissedDaysAllowed),
    visualOverrideEnabled: participant.visualOverrideEnabled
  };
}

function toAdminRegistrationSlot(slot: HutRegistrationSlotRecord, requestOrigin: string): HutRegistrationSlotAdmin {
  return {
    email: slot.participant?.email ?? null,
    firstFragranceLeftArm: slot.firstFragranceLeftArm,
    folio: slot.folio,
    id: slot.id,
    link: registrationLink(requestOrigin, slot.registrationToken),
    participantId: slot.participantId,
    participantLink: slot.participant ? participantLink(requestOrigin, slot.participant.token) : null,
    participantName: slot.participant?.name ?? null,
    phone: slot.participant?.phone ?? null,
    referenceSelfieStatus: slot.participant?.referenceSelfie ? "COMPLETE" : "MISSING",
    secondFragranceRightArm: slot.secondFragranceRightArm,
    status: slot.status
  };
}

function toPortalView(participant: HutParticipantRecord): HutPortalView {
  const block = activeBlock(participant);
  const block1 = blockByNumber(participant, 1);
  const block2 = blockByNumber(participant, 2);
  const availability = block
    ? currentAvailability(participant, block, new Date())
    : { nextAvailableAt: null, reason: "BLOCK_NOT_ACTIVE" };

  if (participant.status === "DISQUALIFIED") {
    return {
      availableUpload: null,
      availability: {
        blockNumber: "blockNumber" in availability ? availability.blockNumber : undefined,
        expectedVideoSequence: "expectedVideoSequence" in availability ? availability.expectedVideoSequence : undefined,
        nextAvailableAt: availability.nextAvailableAt,
        reason: availability.reason
      },
      block1: block1 ? toBlockSummary(block1) : null,
      block2: block2 ? toBlockSummary(block2) : null,
      message:
        "Gracias por tu participacion. Por las reglas del estudio, no es posible continuar con esta etapa. El equipo podra contactarte si requiere informacion adicional.",
      name: participant.name,
      participantId: participant.id,
      status: participant.status,
      studyName: participant.study.name,
      token: participant.token
    };
  }

  const availableUpload = block && availability.reason === "AVAILABLE_FOR_VIDEO"
    ? {
        blockNumber: block.blockNumber,
        sequenceNumber: nextHutVideoSequence(block) ?? block.requiredVideos
      }
    : null;

  return {
    availableUpload,
    availability: {
      blockNumber: "blockNumber" in availability ? availability.blockNumber : undefined,
      expectedVideoSequence: "expectedVideoSequence" in availability ? availability.expectedVideoSequence : undefined,
      nextAvailableAt: availability.nextAvailableAt,
      reason: availability.reason
    },
    block1: block1 ? toBlockSummary(block1) : null,
    block2: block2 ? toBlockSummary(block2) : null,
    message: hutPortalMessage(participant),
    name: participant.name,
    participantId: participant.id,
    status: participant.status,
    studyName: participant.study.name,
    token: participant.token
  };
}

function hutPortalMessage(participant: HutParticipantRecord): string {
  switch (participant.status) {
    case "BLOCK_1_IN_PROGRESS":
    case "BLOCK_2_IN_PROGRESS":
      return "Tienes una actividad HUT disponible.";
    case "BLOCK_1_CALL_PENDING":
      return "Tu primera etapa de videos esta completa. El equipo te contactara para tu evaluacion.";
    case "BLOCK_2_CALL_PENDING":
      return "Tu segunda etapa de videos esta completa. El equipo te contactara para tu evaluacion final.";
    case "COMPLETED":
      return "Tu participacion HUT esta completa. Gracias por tu tiempo.";
    default:
      return "Aun no tienes actividades HUT disponibles. Espera indicaciones del equipo.";
  }
}

function toBlockSummary(block: HutBlockRecord): HutBlockSummary {
  return {
    blockNumber: block.blockNumber,
    disqualificationReason: block.disqualificationReason,
    missedDaysCount: block.missedDaysCount,
    status: block.status,
    submittedVideosCount: block.submittedVideosCount
  };
}

function toCallSummary(call: HutCallRecord): HutCallSummary {
  return {
    blockNumber: call.blockNumber,
    completedAt: call.completedAt,
    status: call.status
  };
}

function blockByNumber(participant: HutParticipantRecord, blockNumber: 1 | 2) {
  return participant.blocks.find((block) => block.blockNumber === blockNumber) ?? null;
}

function callByNumber(participant: HutParticipantRecord, blockNumber: 1 | 2) {
  return participant.callEvaluations.find((call) => call.blockNumber === blockNumber) ?? null;
}

function callForBlock(participant: HutParticipantRecord, blockNumber: 1 | 2, status: HutCallEvaluationStatus) {
  return callByNumber(participant, blockNumber)?.status === status;
}

function activeBlock(participant: HutParticipantRecord) {
  return participant.blocks.find((block) => block.status === "IN_PROGRESS") ?? null;
}

function nextBlockDayNumber(participant: HutParticipantRecord, block: HutBlockRecord): number {
  return nextHutBlockDayNumber(participant.dailyChecks?.filter((check) => check.blockId === block.id) ?? []);
}

function currentAvailability(participant: HutParticipantRecord, block: HutBlockRecord, now: Date) {
  const sequenceNumber = nextHutVideoSequence(block) ?? block.requiredVideos;
  const latestVerification = latestVerificationForSequence(participant, block.blockNumber, sequenceNumber);

  return getHutCurrentAvailability({
    block,
    dailyChecks: participant.dailyChecks?.filter((check) => check.blockId === block.id) ?? [],
    hasReferenceSelfie: Boolean(participant.referenceSelfie),
    hasVisualOverride: participant.visualOverrideEnabled,
    latestVerificationStatus: latestVerification?.status ?? null,
    now,
    timeZoneIana: participant.study.timeZoneIana || "America/Mexico_City"
  });
}

function latestVerificationForSequence(
  participant: HutParticipantRecord,
  blockNumber: number,
  sequenceNumber: number
) {
  return (
    participant.visualVerifications?.find(
      (verification) =>
        verification.blockNumber === blockNumber && verification.sequenceNumber === sequenceNumber
    ) ?? null
  );
}

function hutVisualStatusFromReview(reviewStatus: "APPROVED" | "PENDING" | "REJECTED") {
  if (reviewStatus === "APPROVED") {
    return "MATCHED" as const;
  }
  if (reviewStatus === "REJECTED") {
    return "NOT_MATCHED" as const;
  }

  return "UNCERTAIN" as const;
}

function videoUnavailableMessage(reason: string, nextAvailableAt: Date | null) {
  if (reason === "WAIT_UNTIL_5_AM") {
    return `Tu siguiente video estara disponible a partir de las 5:00 a.m.${nextAvailableAt ? ` (${nextAvailableAt.toISOString()})` : ""}.`;
  }
  if (reason === "MISSING_REFERENCE_SELFIE") {
    return "Tu registro aun no esta completo. Contacta al encuestador.";
  }
  if (reason === "AVAILABLE_FOR_SELFIE") {
    return "Antes de subir tu video, tomaremos una selfie para confirmar tu identidad.";
  }
  if (reason === "VISUAL_VERIFICATION_FAILED" || reason === "VISUAL_VERIFICATION_PENDING") {
    return "No pudimos confirmar tu identidad. Contacta al supervisor antes de continuar.";
  }

  return "No hay videos disponibles para subir en este momento.";
}

async function disqualifyParticipant(
  prisma: HutPrismaClient,
  input: { block: HutBlockRecord; participant: HutParticipantRecord; reason: string }
) {
  const now = new Date();
  await prisma.hutBlock.update?.({
    data: {
      disqualificationReason: input.reason,
      disqualifiedAt: now,
      status: "DISQUALIFIED"
    },
    where: { id: input.block.id }
  });
  await prisma.hutParticipant.update?.({
    data: {
      status: "DISQUALIFIED"
    },
    where: { id: input.participant.id }
  });
}

function participantLink(requestOrigin: string, token: string) {
  return new URL(`/hut/p/${encodeURIComponent(token)}`, requestOrigin).toString();
}

function registrationLink(requestOrigin: string, token: string) {
  return new URL(`/hut/register/${encodeURIComponent(token)}`, requestOrigin).toString();
}

async function createHutParticipantFoundation(
  tx: HutPrismaClient,
  input: { participantId: string; startDate: Date | null; startsNow: boolean }
) {
  await tx.hutBlock.create?.({
    data: {
      blockNumber: 1,
      maxMissedDaysAllowed: HUT_MAX_MISSED_DAYS_PER_BLOCK,
      participantId: input.participantId,
      requiredVideos: HUT_REQUIRED_VIDEOS_PER_BLOCK,
      startDate: input.startDate,
      status: input.startsNow ? "IN_PROGRESS" : "NOT_STARTED"
    }
  });
  await tx.hutBlock.create?.({
    data: {
      blockNumber: 2,
      maxMissedDaysAllowed: HUT_MAX_MISSED_DAYS_PER_BLOCK,
      participantId: input.participantId,
      requiredVideos: HUT_REQUIRED_VIDEOS_PER_BLOCK,
      status: "NOT_STARTED"
    }
  });
  await tx.hutCallEvaluation.create?.({
    data: {
      blockNumber: 1,
      participantId: input.participantId,
      status: "PENDING"
    }
  });
  await tx.hutCallEvaluation.create?.({
    data: {
      blockNumber: 2,
      participantId: input.participantId,
      status: "PENDING"
    }
  });
}

function extensionFromFilename(filename: string): string {
  return filename.trim().toLowerCase().split(".").pop() ?? "";
}

function dateForFilename(date: Date): string {
  return date.toISOString().slice(0, 10);
}
