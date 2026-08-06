import { createPrismaClient, type PrismaClientLike } from "@/shared/db/client";
import { releaseNavigoParticipantForCtl } from "@/modules/navigo-app/repository";
import { getCtlDefinition } from "./definition";
import {
  canAccessCtl,
  ctlStatusLabel,
  doReferenceCodesMatch,
  generateCtlInterviewerCode,
  hashCtlInterviewerCode,
  isPublicCtlInterviewerActor,
  normalizeCtlCode,
  type CtlActor,
  type CtlAnswerDraft,
  type CtlInterviewerCodeStatus,
  type CtlPublicInterviewerActor,
  type CtlSessionStatus
} from "./service";

type Delegate = {
  create?: (args: unknown) => Promise<unknown>;
  findFirst?: (args: unknown) => Promise<unknown>;
  findMany?: (args: unknown) => Promise<unknown[]>;
  findUnique?: (args: unknown) => Promise<unknown>;
  update?: (args: unknown) => Promise<unknown>;
  upsert?: (args: unknown) => Promise<unknown>;
};

type CtlPrismaClient = PrismaClientLike & {
  $transaction: <T>(callback: (tx: CtlTransactionClient) => Promise<T>) => Promise<T>;
  ctlAnswer: Delegate;
  ctlInterviewerCode: Delegate;
  ctlSession: Delegate;
  participantConfirmation: Delegate;
  study: Delegate;
  studyParticipant: Delegate;
};

type CtlTransactionClient = Omit<CtlPrismaClient, "$connect" | "$disconnect" | "$transaction">;

export type CtlParticipantSummary = {
  ctlStatus: CtlSessionStatus | null;
  folio: string;
  id: string;
  interviewerName: string | null;
  name: string;
  nse: string;
  referenceCodes: Array<{ code: string; slot: number }>;
  rotation: {
    firstSampleKey: string | null;
    secondSampleKey: string | null;
  };
  sessionId: string | null;
};

export type CtlAvailableParticipantSummary = {
  ctlStatus: CtlSessionStatus | null;
  folio: string;
  id: string;
  name: string;
};

export type CtlSessionView = {
  answers: Record<string, unknown>;
  completedAt: Date | null;
  definition: ReturnType<typeof getCtlDefinition>;
  id: string;
  interviewerName: string;
  participant: CtlParticipantSummary;
  startedAt: Date | null;
  status: CtlSessionStatus;
};

export type CtlInterviewerCodeView = {
  createdAt: Date;
  expiresAt: Date | null;
  id: string;
  label: string;
  lastUsedAt: Date | null;
  status: CtlInterviewerCodeStatus;
  studyId: string;
};

type ConfirmationRecord = {
  folio: string;
  referenceCodes: Array<{ code: string; slot: number }>;
  screeningAttempt: {
    id: string;
    nseClass: string | null;
    nseScore: number | null;
    status: string;
  };
  studyParticipant: ParticipantRecord;
};

type ParticipantRecord = {
  id: string;
  participantProfile: {
    name: string;
  };
  rotationAssignment: {
    arms: Array<{
      applicationOrder: number;
      studyProduct: {
        internalCode: string;
      };
    }>;
  } | null;
  screeningStatus: string;
};

type SessionRecord = {
  answers?: Array<{ answerValue: unknown; questionCode: string }>;
  completedAt: Date | null;
  ctlInterviewerCode: { createdByUserId: string; id: string; label: string } | null;
  ctlInterviewerCodeId: string | null;
  id: string;
  interviewer: { id: string; name: string } | null;
  interviewerId: string | null;
  screeningAttemptId: string | null;
  startedAt: Date | null;
  status: CtlSessionStatus;
  studyId: string;
  studyParticipant: ParticipantRecord & {
    participantConfirmation: {
      folio: string;
      referenceCodes: Array<{ code: string; slot: number }>;
      screeningAttempt: {
        id: string;
        nseClass: string | null;
        nseScore: number | null;
        status: string;
      };
    } | null;
  };
  studyParticipantId: string;
};

export type CtlRepository = {
  claimFolioForInterviewerCode: (input: {
    ctlInterviewerCodeId: string;
    folio: string;
    now?: Date;
  }) => Promise<{ message: string; ok: false } | { ok: true; sessionId: string }>;
  createInterviewerCode: (input: {
    actor: CtlActor;
    code?: string;
    expiresAt?: Date | null;
    label: string;
    studyId: string;
  }) => Promise<{ code: string; interviewerCode: CtlInterviewerCodeView; ok: true } | { message: string; ok: false }>;
  listInterviewerCodes: (input: {
    actor: CtlActor;
    studyId: string;
  }) => Promise<{ codes: CtlInterviewerCodeView[]; ok: true } | { message: string; ok: false }>;
  getSession: (input: { actor: CtlActor; sessionId: string }) => Promise<CtlSessionView | null>;
  getPublicInterviewerActor: (input: {
    ctlInterviewerCodeId: string;
    now?: Date;
    studyCode: string;
  }) => Promise<CtlPublicInterviewerActor | null>;
  listAvailableParticipantsForInterviewerCode: (input: {
    ctlInterviewerCodeId: string;
    now?: Date;
  }) => Promise<{ ok: true; participants: CtlAvailableParticipantSummary[] } | { message: string; ok: false }>;
  listParticipants: (input: { actor: CtlActor; studyId: string }) => Promise<{
    ok: true;
    participants: CtlParticipantSummary[];
    study: { code: string; id: string; name: string };
  } | { message: string; ok: false }>;
  previewFolioForInterviewerCode: (input: {
    ctlInterviewerCodeId: string;
    folio: string;
    now?: Date;
  }) => Promise<{ ok: true; participant: CtlParticipantSummary } | { message: string; ok: false }>;
  saveAnswers: (input: {
    actor: CtlActor;
    answers: CtlAnswerDraft[];
    complete: boolean;
    sessionId: string;
  }) => Promise<{ message: string; ok: false } | { ok: true; sessionId: string }>;
  startSession: (input: {
    actor: CtlActor;
    code1: string;
    code2: string;
    code3: string;
    folio: string;
    studyId: string;
  }) => Promise<{ message: string; ok: false } | { ok: true; sessionId: string }>;
  validateInterviewerCode: (input: {
    code: string;
    now?: Date;
    studyCode: string;
  }) => Promise<{ interviewerCode: CtlInterviewerCodeView; ok: true } | { message: string; ok: false }>;
  updateInterviewerCodeStatus: (input: {
    actor: CtlActor;
    ctlInterviewerCodeId: string;
    status: Extract<CtlInterviewerCodeStatus, "ACTIVE" | "DISABLED">;
    studyId: string;
  }) => Promise<{ ok: true } | { message: string; ok: false }>;
};

export function createCtlRepository(prismaClient?: CtlPrismaClient): CtlRepository {
  async function getPrisma() {
    return prismaClient ?? ((await createPrismaClient()) as CtlPrismaClient);
  }

  return {
    async claimFolioForInterviewerCode(input) {
      const prisma = await getPrisma();
      const now = input.now ?? new Date();

      return prisma.$transaction(async (tx) => {
        const interviewerCode = (await tx.ctlInterviewerCode.findUnique?.({
          select: {
            expiresAt: true,
            id: true,
            label: true,
            status: true,
            studyId: true
          },
          where: { id: input.ctlInterviewerCodeId }
        })) as (CtlInterviewerCodeView & { studyId: string }) | null;

        if (!interviewerCode || !isUsableInterviewerCode(interviewerCode, now)) {
          return { message: "El codigo de encuestador no es valido.", ok: false };
        }

        const confirmation = (await tx.participantConfirmation.findFirst?.({
          select: confirmationSelect,
          where: {
            folio: normalizeCtlCode(input.folio),
            studyId: interviewerCode.studyId
          }
        })) as ConfirmationRecord | null;

        if (!confirmation) {
          return { message: "No encontramos un participante con ese folio.", ok: false };
        }

        const existing = (await tx.ctlSession.findFirst?.({
          orderBy: { createdAt: "desc" },
          select: {
            ctlInterviewerCodeId: true,
            id: true,
            interviewerId: true,
            status: true
          },
          where: {
            status: { in: ["PENDING", "IN_PROGRESS", "COMPLETED"] },
            studyParticipantId: confirmation.studyParticipant.id
          }
        })) as Pick<SessionRecord, "ctlInterviewerCodeId" | "id" | "interviewerId" | "status"> | null;

        if (existing?.status === "COMPLETED") {
          return { message: "Este folio ya tiene CTL completado.", ok: false };
        }

        if (existing) {
          if (existing.ctlInterviewerCodeId === interviewerCode.id) {
            return { ok: true, sessionId: existing.id };
          }

          return { message: "Este folio ya fue tomado por otro encuestador.", ok: false };
        }

        try {
          const created = (await tx.ctlSession.create?.({
            data: {
              claimedAt: now,
              ctlInterviewerCodeId: interviewerCode.id,
              screeningAttemptId: confirmation.screeningAttempt.id,
              status: "PENDING",
              studyId: interviewerCode.studyId,
              studyParticipantId: confirmation.studyParticipant.id
            },
            select: { id: true }
          })) as { id: string };

          await tx.ctlInterviewerCode.update?.({
            data: { lastUsedAt: now },
            where: { id: interviewerCode.id }
          });

          return { ok: true, sessionId: created.id };
        } catch (error) {
          if (isUniqueConstraintError(error)) {
            return { message: "Este folio ya fue tomado por otro encuestador.", ok: false };
          }

          throw error;
        }
      });
    },

    async createInterviewerCode(input) {
      if (!isInternalAdmin(input.actor)) {
        return { message: "No tienes permiso para generar codigos CTL.", ok: false };
      }

      if (!input.label.trim()) {
        return { message: "Captura el nombre del encuestador.", ok: false };
      }

      const prisma = await getPrisma();
      const code = input.code ? normalizeCtlCode(input.code) : generateCtlInterviewerCode();
      const created = (await prisma.ctlInterviewerCode.create?.({
        data: {
          codeHash: hashCtlInterviewerCode(code),
          createdByUserId: input.actor.id,
          expiresAt: input.expiresAt ?? null,
          label: input.label.trim(),
          status: "ACTIVE",
          studyId: input.studyId
        },
        select: ctlInterviewerCodeSelect
      })) as CtlInterviewerCodeView;

      return {
        code,
        interviewerCode: created,
        ok: true
      };
    },

    async listInterviewerCodes(input) {
      if (!isInternalAdmin(input.actor)) {
        return { message: "No tienes permiso para administrar codigos CTL.", ok: false };
      }

      const prisma = await getPrisma();
      const codes = (await prisma.ctlInterviewerCode.findMany?.({
        orderBy: { createdAt: "desc" },
        select: ctlInterviewerCodeSelect,
        where: { studyId: input.studyId }
      })) as CtlInterviewerCodeView[];

      return {
        codes,
        ok: true
      };
    },

    async getSession(input) {
      if (!canAccessCtl(input.actor)) {
        return null;
      }

      const prisma = await getPrisma();
      const session = (await prisma.ctlSession.findUnique?.({
        select: sessionSelect,
        where: { id: input.sessionId }
      })) as SessionRecord | null;

      if (!session || !canReadSession(input.actor, session)) {
        return null;
      }

      return toSessionView(session);
    },

    async getPublicInterviewerActor(input) {
      const prisma = await getPrisma();
      const now = input.now ?? new Date();
      const interviewerCode = (await prisma.ctlInterviewerCode.findFirst?.({
        select: ctlInterviewerCodeSelect,
        where: {
          id: input.ctlInterviewerCodeId,
          study: { code: input.studyCode }
        }
      })) as CtlInterviewerCodeView | null;

      if (!interviewerCode || !isUsableInterviewerCode(interviewerCode, now)) {
        return null;
      }

      return {
        id: interviewerCode.id,
        kind: "PUBLIC_CTL_INTERVIEWER",
        label: interviewerCode.label,
        role: "CTL_INTERVIEWER",
        status: "ACTIVE",
        studyId: interviewerCode.studyId
      };
    },

    async listAvailableParticipantsForInterviewerCode(input) {
      const prisma = await getPrisma();
      const now = input.now ?? new Date();
      const interviewerCode = (await prisma.ctlInterviewerCode.findUnique?.({
        select: ctlInterviewerCodeSelect,
        where: { id: input.ctlInterviewerCodeId }
      })) as CtlInterviewerCodeView | null;

      if (!interviewerCode || !isUsableInterviewerCode(interviewerCode, now)) {
        return { message: "El codigo de encuestador no es valido.", ok: false };
      }

      const confirmations = (await prisma.participantConfirmation.findMany?.({
        orderBy: { folioSequence: "asc" },
        select: confirmationSelect,
        where: { studyId: interviewerCode.studyId }
      })) as ConfirmationRecord[];
      const sessions = (await prisma.ctlSession.findMany?.({
        select: {
          status: true,
          studyParticipantId: true
        },
        where: {
          status: { in: ["PENDING", "IN_PROGRESS", "COMPLETED"] },
          studyId: interviewerCode.studyId
        }
      })) as Array<{ status: CtlSessionStatus; studyParticipantId: string }>;
      const unavailableParticipantIds = new Set(sessions.map((session) => session.studyParticipantId));

      return {
        ok: true,
        participants: confirmations
          .filter((confirmation) =>
            isCtlAvailableConfirmation(confirmation) &&
            !unavailableParticipantIds.has(confirmation.studyParticipant.id)
          )
          .map((confirmation) => ({
            ctlStatus: null,
            folio: confirmation.folio,
            id: confirmation.studyParticipant.id,
            name: confirmation.studyParticipant.participantProfile.name
          }))
      };
    },

    async listParticipants(input) {
      if (!canAccessCtl(input.actor) || isPublicCtlInterviewerActor(input.actor)) {
        return { message: "No tienes permiso para capturar CTL.", ok: false };
      }

      const prisma = await getPrisma();
      const study = (await prisma.study.findUnique?.({
        select: { code: true, id: true, name: true },
        where: { id: input.studyId }
      })) as { code: string; id: string; name: string } | null;

      if (!study) {
        return { message: "No encontramos el estudio.", ok: false };
      }

      const confirmations = (await prisma.participantConfirmation.findMany?.({
        orderBy: { folioSequence: "asc" },
        select: confirmationSelect,
        where: { studyId: input.studyId }
      })) as ConfirmationRecord[];
      const sessions = (await prisma.ctlSession.findMany?.({
        orderBy: { createdAt: "desc" },
        select: {
          ctlInterviewerCode: { select: { label: true } },
          id: true,
          interviewer: { select: { name: true } },
          status: true,
          studyParticipantId: true
        },
        where: { studyId: input.studyId }
      })) as Array<{
        ctlInterviewerCode: { label: string } | null;
        id: string;
        interviewer: { name: string } | null;
        status: CtlSessionStatus;
        studyParticipantId: string;
      }>;
      const latestSessionByParticipant = new Map<string, (typeof sessions)[number]>();
      for (const session of sessions) {
        if (!latestSessionByParticipant.has(session.studyParticipantId)) {
          latestSessionByParticipant.set(session.studyParticipantId, session);
        }
      }

      return {
        ok: true,
        participants: confirmations.map((confirmation) =>
          toParticipantSummary(confirmation, latestSessionByParticipant.get(confirmation.studyParticipant.id) ?? null)
        ),
        study
      };
    },

    async previewFolioForInterviewerCode(input) {
      const prisma = await getPrisma();
      const now = input.now ?? new Date();
      const interviewerCode = (await prisma.ctlInterviewerCode.findUnique?.({
        select: ctlInterviewerCodeSelect,
        where: { id: input.ctlInterviewerCodeId }
      })) as CtlInterviewerCodeView | null;

      if (!interviewerCode || !isUsableInterviewerCode(interviewerCode, now)) {
        return { message: "El codigo de encuestador no es valido.", ok: false };
      }

      const confirmation = (await prisma.participantConfirmation.findFirst?.({
        select: confirmationSelect,
        where: {
          folio: normalizeCtlCode(input.folio),
          studyId: interviewerCode.studyId
        }
      })) as ConfirmationRecord | null;

      if (!confirmation) {
        return { message: "No encontramos un participante con ese folio.", ok: false };
      }

      const existing = (await prisma.ctlSession.findFirst?.({
        orderBy: { createdAt: "desc" },
        select: {
          ctlInterviewerCode: { select: { label: true } },
          ctlInterviewerCodeId: true,
          id: true,
          interviewer: { select: { name: true } },
          interviewerId: true,
          status: true
        },
        where: {
          status: { in: ["PENDING", "IN_PROGRESS", "COMPLETED"] },
          studyParticipantId: confirmation.studyParticipant.id
        }
      })) as {
        ctlInterviewerCode: { label: string } | null;
        ctlInterviewerCodeId: string | null;
        id: string;
        interviewer: { name: string } | null;
        interviewerId: string | null;
        status: CtlSessionStatus;
      } | null;

      if (existing?.status === "COMPLETED") {
        return { message: "Este folio ya tiene CTL completado.", ok: false };
      }

      if (existing && existing.ctlInterviewerCodeId !== interviewerCode.id) {
        return { message: "Este folio ya fue tomado por otro encuestador.", ok: false };
      }

      return {
        ok: true,
        participant: toParticipantSummary(confirmation, existing)
      };
    },

    async saveAnswers(input) {
      if (!canAccessCtl(input.actor)) {
        return { message: "No tienes permiso para capturar CTL.", ok: false };
      }

      const prisma = await getPrisma();

      return prisma.$transaction(async (tx) => {
        const session = (await tx.ctlSession.findUnique?.({
          select: sessionSelect,
          where: { id: input.sessionId }
        })) as SessionRecord | null;

        if (!session || !canReadSession(input.actor, session)) {
          return { message: "No encontramos la sesion CTL.", ok: false };
        }

        if (session.status === "COMPLETED" || session.status === "CANCELLED") {
          return { message: "Esta sesion CTL ya no se puede editar.", ok: false };
        }

        for (const answer of input.answers) {
          await tx.ctlAnswer.upsert?.({
            create: {
              answerValue: answer.answerValue,
              ctlSessionId: session.id,
              questionCode: answer.questionCode
            },
            update: {
              answerValue: answer.answerValue
            },
            where: {
              ctlSessionId_questionCode: {
                ctlSessionId: session.id,
                questionCode: answer.questionCode
              }
            }
          });
        }

        const now = new Date();
        await tx.ctlSession.update?.({
          data: {
            completedAt: input.complete ? now : null,
            startedAt: session.startedAt ?? now,
            status: input.complete ? "COMPLETED" : "IN_PROGRESS"
          },
          where: { id: session.id }
        });

        if (input.complete) {
          const actorUserId = isPublicCtlInterviewerActor(input.actor)
            ? session.ctlInterviewerCode?.createdByUserId
            : input.actor.id;

          if (!actorUserId) {
            return { message: "No encontramos el responsable interno para liberar Navigo.", ok: false };
          }

          const release = await releaseNavigoParticipantForCtl({
            actorUserId,
            now,
            prisma: tx as never,
            studyParticipantId: session.studyParticipantId
          });

          if (!release.ok) {
            await tx.ctlSession.update?.({
              data: {
                completedAt: session.completedAt,
                startedAt: session.startedAt,
                status: session.status
              },
              where: { id: session.id }
            });
            return { message: release.message, ok: false };
          }
        }

        return { ok: true, sessionId: session.id };
      });
    },

    async startSession(input) {
      if (!canAccessCtl(input.actor) || isPublicCtlInterviewerActor(input.actor)) {
        return { message: "No tienes permiso para capturar CTL.", ok: false };
      }

      const prisma = await getPrisma();
      const confirmation = (await prisma.participantConfirmation.findFirst?.({
        select: confirmationSelect,
        where: {
          folio: normalizeCtlCode(input.folio),
          studyId: input.studyId
        }
      })) as ConfirmationRecord | null;

      if (!confirmation) {
        return { message: "No encontramos un participante con ese folio.", ok: false };
      }

      if (!doReferenceCodesMatch(confirmation.referenceCodes, [input.code1, input.code2, input.code3])) {
        return { message: "Los codigos no corresponden al participante.", ok: false };
      }

      const existing = (await prisma.ctlSession.findFirst?.({
        orderBy: { createdAt: "desc" },
        select: { interviewerId: true, id: true, status: true },
        where: {
          status: { in: ["PENDING", "IN_PROGRESS", "COMPLETED"] },
          studyParticipantId: confirmation.studyParticipant.id
        }
      })) as { id: string; interviewerId: string | null; status: CtlSessionStatus } | null;

      if (existing) {
        if (existing.status === "COMPLETED") {
          return { message: "Este folio ya tiene CTL completado.", ok: false };
        }

        if (existing.interviewerId === input.actor.id) {
          return { ok: true, sessionId: existing.id };
        }

        return { message: "Este folio ya fue tomado por otro encuestador.", ok: false };
      }

      const created = (await prisma.ctlSession.create?.({
        data: {
          interviewerId: input.actor.id,
          screeningAttemptId: confirmation.screeningAttempt.id,
          claimedAt: new Date(),
          status: "PENDING",
          studyId: input.studyId,
          studyParticipantId: confirmation.studyParticipant.id
        },
        select: { id: true }
      })) as { id: string };

      return { ok: true, sessionId: created.id };
    },

    async validateInterviewerCode(input) {
      const prisma = await getPrisma();
      const now = input.now ?? new Date();
      const interviewerCode = (await prisma.ctlInterviewerCode.findFirst?.({
        select: ctlInterviewerCodeSelect,
        where: {
          codeHash: hashCtlInterviewerCode(input.code),
          study: { code: input.studyCode }
        }
      })) as CtlInterviewerCodeView | null;

      if (!interviewerCode || !isUsableInterviewerCode(interviewerCode, now)) {
        return { message: "El codigo de encuestador no es valido.", ok: false };
      }

      return {
        interviewerCode,
        ok: true
      };
    },

    async updateInterviewerCodeStatus(input) {
      if (!isInternalAdmin(input.actor)) {
        return { message: "No tienes permiso para administrar codigos CTL.", ok: false };
      }

      const prisma = await getPrisma();
      const existing = (await prisma.ctlInterviewerCode.findFirst?.({
        select: { id: true },
        where: {
          id: input.ctlInterviewerCodeId,
          studyId: input.studyId
        }
      })) as { id: string } | null;

      if (!existing) {
        return { message: "No encontramos el codigo CTL.", ok: false };
      }

      await prisma.ctlInterviewerCode.update?.({
        data: { status: input.status },
        where: { id: input.ctlInterviewerCodeId }
      });

      return { ok: true };
    }
  };
}

const ctlInterviewerCodeSelect = {
  createdAt: true,
  expiresAt: true,
  id: true,
  label: true,
  lastUsedAt: true,
  status: true,
  studyId: true
} as const;

const confirmationSelect = {
  folio: true,
  referenceCodes: {
    orderBy: { slot: "asc" },
    select: { code: true, slot: true }
  },
  screeningAttempt: {
    select: { id: true, nseClass: true, nseScore: true, status: true }
  },
  studyParticipant: {
    select: {
      id: true,
      participantProfile: { select: { name: true } },
      rotationAssignment: {
        select: {
          arms: {
            orderBy: { applicationOrder: "asc" },
            select: {
              applicationOrder: true,
              studyProduct: { select: { internalCode: true } }
            }
          }
        }
      },
      screeningStatus: true
    }
  }
} as const;

const sessionSelect = {
  answers: {
    orderBy: { questionCode: "asc" },
    select: { answerValue: true, questionCode: true }
  },
  completedAt: true,
  ctlInterviewerCode: { select: { createdByUserId: true, id: true, label: true } },
  ctlInterviewerCodeId: true,
  id: true,
  interviewer: { select: { id: true, name: true } },
  interviewerId: true,
  screeningAttemptId: true,
  startedAt: true,
  status: true,
  studyId: true,
  studyParticipant: {
    select: {
      id: true,
      participantConfirmation: {
        select: {
          folio: true,
          referenceCodes: {
            orderBy: { slot: "asc" },
            select: { code: true, slot: true }
          },
          screeningAttempt: {
            select: { id: true, nseClass: true, nseScore: true, status: true }
          }
        }
      },
      participantProfile: { select: { name: true } },
      rotationAssignment: {
        select: {
          arms: {
            orderBy: { applicationOrder: "asc" },
            select: {
              applicationOrder: true,
              studyProduct: { select: { internalCode: true } }
            }
          }
        }
      },
      screeningStatus: true
    }
  },
  studyParticipantId: true
} as const;

function canReadSession(
  actor: CtlActor,
  session: Pick<SessionRecord, "ctlInterviewerCodeId" | "interviewerId" | "studyId">
): boolean {
  if (isPublicCtlInterviewerActor(actor)) {
    return session.studyId === actor.studyId && session.ctlInterviewerCodeId === actor.id;
  }

  return actor.role === "ADMIN" || actor.role === "SUPERVISOR" || session.interviewerId === actor.id;
}

function toParticipantSummary(
  confirmation: ConfirmationRecord,
  session: {
    ctlInterviewerCode?: { label: string } | null;
    id: string;
    interviewer: { name: string } | null;
    status: CtlSessionStatus;
  } | null
): CtlParticipantSummary {
  const arms = confirmation.studyParticipant.rotationAssignment?.arms ?? [];
  return {
    ctlStatus: session?.status ?? null,
    folio: confirmation.folio,
    id: confirmation.studyParticipant.id,
    interviewerName: session ? getSessionInterviewerName(session) : null,
    name: confirmation.studyParticipant.participantProfile.name,
    nse: formatNse(confirmation.screeningAttempt),
    referenceCodes: confirmation.referenceCodes,
    rotation: {
      firstSampleKey: arms.find((arm) => arm.applicationOrder === 1)?.studyProduct.internalCode ?? null,
      secondSampleKey: arms.find((arm) => arm.applicationOrder === 2)?.studyProduct.internalCode ?? null
    },
    sessionId: session?.id ?? null
  };
}

function isCtlAvailableConfirmation(confirmation: ConfirmationRecord): boolean {
  const arms = confirmation.studyParticipant.rotationAssignment?.arms ?? [];
  const hasCompleteRotation =
    Boolean(arms.find((arm) => arm.applicationOrder === 1)?.studyProduct.internalCode) &&
    Boolean(arms.find((arm) => arm.applicationOrder === 2)?.studyProduct.internalCode);
  const hasThreeCodes = new Set(confirmation.referenceCodes.map((code) => code.slot)).size >= 3;

  return (
    confirmation.screeningAttempt.status === "PASSED" &&
    confirmation.studyParticipant.screeningStatus === "PASSED" &&
    hasThreeCodes &&
    hasCompleteRotation
  );
}

function toSessionView(session: SessionRecord): CtlSessionView {
  const confirmation = session.studyParticipant.participantConfirmation;
  const interviewerName = getSessionInterviewerName(session);
  return {
    answers: Object.fromEntries((session.answers ?? []).map((answer) => [answer.questionCode, answer.answerValue])),
    completedAt: session.completedAt,
    definition: getCtlDefinition(),
    id: session.id,
    interviewerName,
    participant: confirmation
      ? toParticipantSummary(
          {
            folio: confirmation.folio,
            referenceCodes: confirmation.referenceCodes,
            screeningAttempt: confirmation.screeningAttempt,
            studyParticipant: session.studyParticipant
          },
          {
            ctlInterviewerCode: session.ctlInterviewerCode,
            id: session.id,
            interviewer: session.interviewer,
            status: session.status
          }
        )
      : {
          ctlStatus: session.status,
          folio: "SIN FOLIO",
          id: session.studyParticipant.id,
          interviewerName,
          name: session.studyParticipant.participantProfile.name,
          nse: "Sin NSE",
          referenceCodes: [],
          rotation: { firstSampleKey: null, secondSampleKey: null },
          sessionId: session.id
        },
    startedAt: session.startedAt,
    status: session.status
  };
}

function isInternalAdmin(actor: CtlActor): boolean {
  return !isPublicCtlInterviewerActor(actor) && actor.status === "ACTIVE" && actor.role === "ADMIN";
}

function isUsableInterviewerCode(
  interviewerCode: Pick<CtlInterviewerCodeView, "expiresAt" | "status">,
  now: Date
): boolean {
  return interviewerCode.status === "ACTIVE" && (!interviewerCode.expiresAt || interviewerCode.expiresAt > now);
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
  );
}

function formatNse(input: { nseClass: string | null; nseScore: number | null }): string {
  if (input.nseScore === null && !input.nseClass) {
    return "Sin NSE";
  }

  return [input.nseScore ?? null, input.nseClass ?? null].filter((value) => value !== null).join(" · ");
}

function getSessionInterviewerName(session: {
  ctlInterviewerCode?: { label: string } | null;
  interviewer: { name: string } | null;
}): string {
  return session.interviewer?.name ?? session.ctlInterviewerCode?.label ?? "Encuestador CTL";
}

export { ctlStatusLabel };
