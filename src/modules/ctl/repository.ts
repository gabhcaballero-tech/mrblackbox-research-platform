import { createPrismaClient, type PrismaClientLike } from "@/shared/db/client";
import { releaseNavigoParticipantForCtl } from "@/modules/navigo-app/repository";
import { calculateCtlNse, getCtlDefinition } from "./definition";
import {
  canAccessCtl,
  ctlStatusLabel,
  buildPermanentCtlInterviewerCode,
  formatCtlDate,
  formatCtlTime,
  generateCtlInterviewerCode,
  hashCtlInterviewerCode,
  INITIAL_PERMANENT_CTL_INTERVIEWERS,
  isPublicCtlInterviewerActor,
  normalizeCtlCode,
  type CtlActor,
  type CtlAnswerDraft,
  type CtlInterviewerCodeStatus,
  type CtlOperationalPhase,
  type CtlPhaseProgressStatus,
  type CtlPublicInterviewerActor,
  type CtlSessionStatus
} from "./service";

type Delegate = {
  create?: (args: unknown) => Promise<unknown>;
  delete?: (args: unknown) => Promise<unknown>;
  deleteMany?: (args: unknown) => Promise<unknown>;
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
  ctlPhaseProgress: Delegate;
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
  participantLinkToken: string | null;
  referenceCodes: Array<{ code: string; slot: number }>;
  rotation: {
    firstSampleKey: string | null;
    secondSampleKey: string | null;
  };
  sessionId: string | null;
  triangularRotation: CtlTriangularRotationSnapshot | null;
};

export type CtlPhaseProgressView = {
  arm: string | null;
  completedAt: Date | null;
  phase: CtlOperationalPhase;
  productCode: string | null;
  referenceCodeSlot: 1 | 2 | 3;
  rotationSnapshot: unknown;
  startedAt: Date | null;
  status: CtlPhaseProgressStatus;
  validatedAt: Date | null;
  validatedBy: string | null;
};

export type CtlAvailableParticipantSummary = {
  ctlStatus: CtlSessionStatus | null;
  folio: string;
  id: string;
  name: string;
};

export type CtlOpenInterviewerSessionSummary = {
  folio: string;
  id: string;
  name: string;
  sessionId: string;
  status: Extract<CtlSessionStatus, "IN_PROGRESS" | "PENDING">;
};

export type CtlSessionView = {
  answers: Record<string, unknown>;
  completedAt: Date | null;
  definition: ReturnType<typeof getCtlDefinition>;
  id: string;
  interviewerName: string;
  participant: CtlParticipantSummary;
  phaseProgress: CtlPhaseProgressView[];
  responsibleUserId: string | null;
  startedAt: Date | null;
  status: CtlSessionStatus;
};

export type CtlInterviewerCodeView = {
  createdAt: Date;
  expiresAt: Date | null;
  id: string;
  label: string;
  lastUsedAt: Date | null;
  operationalCode: string | null;
  sessionCount: number;
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
  accessTokens?: Array<{ expiresAt: Date; id: string; status: string; tokenHash: string }>;
  ctlTriangularRotationAssignment?: CtlTriangularRotationAssignmentRecord | null;
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

type CtlTriangularRotationAssignmentRecord = {
  id: string;
  triangular1Pr1: string;
  triangular1Pr2: string;
  triangular1Pr3: string;
  triangular1Verify: string;
  triangular2Pr1: string;
  triangular2Pr2: string;
  triangular2Pr3: string;
  triangular2Verify: string;
};

export type CtlTriangularRotationSnapshot = {
  assignmentId: string;
  triangular1: {
    pr1: string;
    pr2: string;
    pr3: string;
    verify: string;
  };
  triangular2: {
    pr1: string;
    pr2: string;
    pr3: string;
    verify: string;
  };
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
  phaseProgress?: CtlPhaseProgressRecord[];
  triangularRotationSnapshot: unknown;
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

type CtlPhaseProgressRecord = {
  arm: string | null;
  completedAt: Date | null;
  phase: CtlOperationalPhase;
  productCode: string | null;
  referenceCodeSlot: number;
  rotationSnapshot: unknown;
  startedAt: Date | null;
  status: CtlPhaseProgressStatus;
  validatedAt: Date | null;
  validatedBy: string | null;
};

export type CtlRepository = {
  cancelSessionAsNotQualified: (input: {
    actor: CtlActor;
    sessionId: string;
  }) => Promise<{ message: string; ok: false } | { ok: true; sessionId: string }>;
  claimFolioForInterviewerCode: (input: {
    ctlInterviewerCodeId: string;
    folio: string;
    includeQa?: boolean;
    now?: Date;
  }) => Promise<{ message: string; ok: false } | { ok: true; sessionId: string }>;
  createInterviewerCode: (input: {
    actor: CtlActor;
    code?: string;
    expiresAt?: Date | null;
    label: string;
    studyId: string;
  }) => Promise<{ code: string; interviewerCode: CtlInterviewerCodeView; ok: true } | { message: string; ok: false }>;
  ensurePermanentInterviewerCodes: (input: {
    actor: CtlActor;
    studyId: string;
  }) => Promise<{
    blocked: Array<{ code: string; label: string }>;
    codes: Array<{ code: string; interviewerCode: CtlInterviewerCodeView; mode: "created" | "updated" }>;
    ok: true;
  } | { message: string; ok: false }>;
  deleteInterviewerCode: (input: {
    actor: CtlActor;
    ctlInterviewerCodeId: string;
    studyId: string;
  }) => Promise<{ mode: "deleted" | "disabled"; ok: true } | { message: string; ok: false }>;
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
    includeQa?: boolean;
    now?: Date;
  }) => Promise<{ ok: true; participants: CtlAvailableParticipantSummary[] } | { message: string; ok: false }>;
  listOpenSessionsForInterviewerCode: (input: {
    ctlInterviewerCodeId: string;
    includeQa?: boolean;
    now?: Date;
    studyCode: string;
  }) => Promise<{ ok: true; sessions: CtlOpenInterviewerSessionSummary[] } | { message: string; ok: false }>;
  listParticipants: (input: { actor: CtlActor; includeQa?: boolean; studyId: string }) => Promise<{
    ok: true;
    participants: CtlParticipantSummary[];
    study: { code: string; id: string; name: string };
  } | { message: string; ok: false }>;
  previewFolioForInterviewerCode: (input: {
    ctlInterviewerCodeId: string;
    folio: string;
    includeQa?: boolean;
    now?: Date;
  }) => Promise<{ ok: true; participant: CtlParticipantSummary } | { message: string; ok: false }>;
  resetInterviewerCode: (input: {
    actor: CtlActor;
    ctlInterviewerCodeId: string;
    studyId: string;
  }) => Promise<{ code: string; interviewerCode: CtlInterviewerCodeView; ok: true } | { message: string; ok: false }>;
  resetSession: (input: {
    actor: CtlActor;
    sessionId: string;
  }) => Promise<{ message: string; ok: false } | { ok: true; sessionId: string }>;
  saveAnswers: (input: {
    actor: CtlActor;
    answers: CtlAnswerDraft[];
    complete: boolean;
    sessionId: string;
  }) => Promise<{ message: string; ok: false } | { ok: true; sessionId: string }>;
  startSession: (input: {
    actor: CtlActor;
    folio: string;
    includeQa?: boolean;
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
  validatePhaseCode: (input: {
    actor: CtlActor;
    code: string;
    phase: CtlOperationalPhase;
    sessionId: string;
  }) => Promise<{ ok: true; phase: CtlOperationalPhase } | { message: string; ok: false }>;
};

export function createCtlRepository(prismaClient?: CtlPrismaClient): CtlRepository {
  async function getPrisma() {
    return prismaClient ?? ((await createPrismaClient()) as CtlPrismaClient);
  }

  return {
    async cancelSessionAsNotQualified(input) {
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

        if (session.status === "COMPLETED") {
          return { message: "Esta sesion CTL ya fue completada.", ok: false };
        }

        if (session.status === "CANCELLED") {
          return { ok: true, sessionId: session.id };
        }

        const now = new Date();
        await tx.ctlSession.update?.({
          data: {
            completedAt: now,
            startedAt: session.startedAt ?? now,
            status: "CANCELLED"
          },
          where: { id: session.id }
        });

        return { ok: true, sessionId: session.id };
      });
    },

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
            studyId: interviewerCode.studyId,
            ...(input.includeQa ? {} : { studyParticipant: { qaParticipantRun: { is: null } } })
          }
        })) as ConfirmationRecord | null;

        if (!confirmation) {
          return { message: "No encontramos un participante con ese folio.", ok: false };
        }

        if (!isCtlAvailableConfirmation(confirmation)) {
          return { message: "Este folio aun no esta listo para CTL.", ok: false };
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
              startedAt: now,
              status: "PENDING",
              studyId: interviewerCode.studyId,
              studyParticipantId: confirmation.studyParticipant.id,
              triangularRotationSnapshot: buildCtlTriangularRotationSnapshot(
                confirmation.studyParticipant.ctlTriangularRotationAssignment ?? null
              )
            },
            select: { id: true }
          })) as { id: string };

          await upsertAutomaticCtlStartAnswers(tx, {
            participantName: confirmation.studyParticipant.participantProfile.name,
            sessionId: created.id,
            startedAt: now
          });
          await createCtlPhaseProgressFoundation(tx, {
            confirmation,
            sessionId: created.id,
            startedAt: now
          });

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
      const created = await prisma.ctlInterviewerCode.create?.({
        data: {
          codeHash: hashCtlInterviewerCode(code),
          createdByUserId: input.actor.id,
          expiresAt: input.expiresAt ?? null,
          label: input.label.trim(),
          status: "ACTIVE",
          studyId: input.studyId
        },
        select: ctlInterviewerCodeSelect
      });

      return {
        code,
        interviewerCode: toInterviewerCodeView(created)!,
        ok: true
      };
    },

    async ensurePermanentInterviewerCodes(input) {
      if (!isInternalAdmin(input.actor)) {
        return { message: "No tienes permiso para generar codigos CTL.", ok: false };
      }

      const prisma = await getPrisma();
      const codes: Array<{ code: string; interviewerCode: CtlInterviewerCodeView; mode: "created" | "updated" }> = [];
      const blocked: Array<{ code: string; label: string }> = [];

      for (const label of INITIAL_PERMANENT_CTL_INTERVIEWERS) {
        const code = buildPermanentCtlInterviewerCode(label);

        if (!code) {
          continue;
        }

        const codeHash = hashCtlInterviewerCode(code);
        const existing = toInterviewerCodeView(await prisma.ctlInterviewerCode.findFirst?.({
          select: ctlInterviewerCodeSelect,
          where: { codeHash }
        }));

        if (existing && existing.studyId !== input.studyId) {
          blocked.push({ code, label });
          continue;
        }

        if (existing) {
          const updated = await prisma.ctlInterviewerCode.update?.({
            data: {
              expiresAt: null,
              label,
              status: "ACTIVE"
            },
            select: ctlInterviewerCodeSelect,
            where: { id: existing.id }
          });

          codes.push({
            code,
            interviewerCode: toInterviewerCodeView(updated)!,
            mode: "updated"
          });
          continue;
        }

        const created = await prisma.ctlInterviewerCode.create?.({
          data: {
            codeHash,
            createdByUserId: input.actor.id,
            expiresAt: null,
            label,
            status: "ACTIVE",
            studyId: input.studyId
          },
          select: ctlInterviewerCodeSelect
        });

        codes.push({
          code,
          interviewerCode: toInterviewerCodeView(created)!,
          mode: "created"
        });
      }

      return {
        blocked,
        codes,
        ok: true
      };
    },

    async deleteInterviewerCode(input) {
      if (!isInternalAdmin(input.actor)) {
        return { message: "No tienes permiso para eliminar codigos CTL.", ok: false };
      }

      const prisma = await getPrisma();
      const existing = toInterviewerCodeView(await prisma.ctlInterviewerCode.findFirst?.({
        select: ctlInterviewerCodeSelect,
        where: {
          id: input.ctlInterviewerCodeId,
          studyId: input.studyId
        }
      }));

      if (!existing) {
        return { message: "No encontramos el codigo CTL.", ok: false };
      }

      if (existing.sessionCount > 0) {
        await prisma.ctlInterviewerCode.update?.({
          data: { status: "DISABLED" },
          where: { id: input.ctlInterviewerCodeId }
        });

        return { mode: "disabled", ok: true };
      }

      await prisma.ctlInterviewerCode.delete?.({
        where: { id: input.ctlInterviewerCodeId }
      });

      return { mode: "deleted", ok: true };
    },

    async listInterviewerCodes(input) {
      if (!isInternalAdmin(input.actor)) {
        return { message: "No tienes permiso para administrar codigos CTL.", ok: false };
      }

      const prisma = await getPrisma();
      const codes = await prisma.ctlInterviewerCode.findMany?.({
        orderBy: { createdAt: "desc" },
        select: ctlInterviewerCodeSelect,
        where: { studyId: input.studyId }
      });

      return {
        codes: (codes ?? []).map(toInterviewerCodeView).filter((code): code is CtlInterviewerCodeView => Boolean(code)),
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
      const interviewerCode = toInterviewerCodeView(await prisma.ctlInterviewerCode.findFirst?.({
        select: ctlInterviewerCodeSelect,
        where: {
          id: input.ctlInterviewerCodeId,
          study: { code: input.studyCode }
        }
      }));

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
      const interviewerCode = toInterviewerCodeView(await prisma.ctlInterviewerCode.findUnique?.({
        select: ctlInterviewerCodeSelect,
        where: { id: input.ctlInterviewerCodeId }
      }));

      if (!interviewerCode || !isUsableInterviewerCode(interviewerCode, now)) {
        return { message: "El codigo de encuestador no es valido.", ok: false };
      }

      const confirmations = (await prisma.participantConfirmation.findMany?.({
        orderBy: { folioSequence: "asc" },
        select: confirmationSelect,
        where: {
          studyId: interviewerCode.studyId,
          ...(input.includeQa ? {} : { studyParticipant: { qaParticipantRun: { is: null } } })
        }
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

    async listOpenSessionsForInterviewerCode(input) {
      const prisma = await getPrisma();
      const now = input.now ?? new Date();
      const interviewerCode = toInterviewerCodeView(await prisma.ctlInterviewerCode.findFirst?.({
        select: ctlInterviewerCodeSelect,
        where: {
          id: input.ctlInterviewerCodeId,
          study: { code: input.studyCode }
        }
      }));

      if (!interviewerCode || !isUsableInterviewerCode(interviewerCode, now)) {
        return { message: "El codigo de encuestador no es valido.", ok: false };
      }

      const sessions = (await prisma.ctlSession.findMany?.({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          studyParticipant: {
            select: {
              participantConfirmation: {
                select: { folio: true }
              },
              participantProfile: { select: { name: true } }
            }
          }
        },
        where: {
          ctlInterviewerCodeId: interviewerCode.id,
          ...(input.includeQa ? {} : { studyParticipant: { qaParticipantRun: { is: null } } }),
          status: { in: ["PENDING", "IN_PROGRESS"] },
          studyId: interviewerCode.studyId
        }
      })) as Array<{
        id: string;
        status: Extract<CtlSessionStatus, "IN_PROGRESS" | "PENDING">;
        studyParticipant: {
          participantConfirmation: { folio: string } | null;
          participantProfile: { name: string };
        };
      }>;

      return {
        ok: true,
        sessions: sessions.map((session) => ({
          folio: session.studyParticipant.participantConfirmation?.folio ?? "SIN FOLIO",
          id: session.id,
          name: session.studyParticipant.participantProfile.name,
          sessionId: session.id,
          status: session.status
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
        where: {
          studyId: input.studyId,
          ...(input.includeQa ? {} : { studyParticipant: { qaParticipantRun: { is: null } } })
        }
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
        where: {
          ...(input.includeQa ? {} : { studyParticipant: { qaParticipantRun: { is: null } } }),
          studyId: input.studyId
        }
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
      const interviewerCode = toInterviewerCodeView(await prisma.ctlInterviewerCode.findUnique?.({
        select: ctlInterviewerCodeSelect,
        where: { id: input.ctlInterviewerCodeId }
      }));

      if (!interviewerCode || !isUsableInterviewerCode(interviewerCode, now)) {
        return { message: "El codigo de encuestador no es valido.", ok: false };
      }

      const confirmation = (await prisma.participantConfirmation.findFirst?.({
        select: confirmationSelect,
        where: {
          folio: normalizeCtlCode(input.folio),
          studyId: interviewerCode.studyId,
          ...(input.includeQa ? {} : { studyParticipant: { qaParticipantRun: { is: null } } })
        }
      })) as ConfirmationRecord | null;

      if (!confirmation) {
        return { message: "No encontramos un participante con ese folio.", ok: false };
      }

      if (!isCtlAvailableConfirmation(confirmation)) {
        return { message: "Este folio aun no esta listo para CTL.", ok: false };
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

    async resetInterviewerCode(input) {
      if (!isInternalAdmin(input.actor)) {
        return { message: "No tienes permiso para regenerar codigos CTL.", ok: false };
      }

      const prisma = await getPrisma();
      const existing = await prisma.ctlInterviewerCode.findFirst?.({
        select: { id: true },
        where: {
          id: input.ctlInterviewerCodeId,
          studyId: input.studyId
        }
      }) as { id: string } | null;

      if (!existing) {
        return { message: "No encontramos el codigo CTL.", ok: false };
      }

      const code = generateCtlInterviewerCode();
      const updated = await prisma.ctlInterviewerCode.update?.({
        data: {
          codeHash: hashCtlInterviewerCode(code),
          lastUsedAt: null,
          status: "ACTIVE"
        },
        select: ctlInterviewerCodeSelect,
        where: { id: input.ctlInterviewerCodeId }
      });

      return {
        code,
        interviewerCode: toInterviewerCodeView(updated)!,
        ok: true
      };
    },

    async resetSession(input) {
      if (!canAccessCtl(input.actor) || isPublicCtlInterviewerActor(input.actor)) {
        return { message: "No tienes permiso para reiniciar CTL.", ok: false };
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

        await tx.ctlAnswer.deleteMany?.({
          where: { ctlSessionId: session.id }
        });
        await tx.ctlPhaseProgress.deleteMany?.({
          where: { ctlSessionId: session.id }
        });
        if (session.studyParticipant.participantConfirmation) {
          await createCtlPhaseProgressFoundation(tx, {
            confirmation: {
              folio: session.studyParticipant.participantConfirmation.folio,
              referenceCodes: session.studyParticipant.participantConfirmation.referenceCodes,
              screeningAttempt: session.studyParticipant.participantConfirmation.screeningAttempt,
              studyParticipant: session.studyParticipant
            },
            sessionId: session.id,
            startedAt: new Date()
          });
        }
        await tx.ctlSession.update?.({
          data: {
            completedAt: null,
            startedAt: null,
            status: "PENDING"
          },
          where: { id: session.id }
        });

        return { ok: true, sessionId: session.id };
      });
    },

    async validatePhaseCode(input) {
      if (!canAccessCtl(input.actor)) {
        return { message: "No tienes permiso para validar fases CTL.", ok: false };
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

        const confirmation = session.studyParticipant.participantConfirmation;
        if (!confirmation) {
          return { message: "No encontramos los codigos del participante.", ok: false };
        }

        const referenceCodeSlot = ctlReferenceCodeSlotForPhase(input.phase);
        const expectedCode = confirmation.referenceCodes.find((code) => code.slot === referenceCodeSlot);
        if (!expectedCode) {
          return { message: `Falta el codigo ${referenceCodeSlot} para validar esta fase.`, ok: false };
        }

        if (normalizeCtlCode(input.code) !== normalizeCtlCode(expectedCode.code)) {
          return { message: "El codigo de fase CTL no es correcto.", ok: false };
        }

        const now = new Date();
        const phaseData = ctlPhaseProgressData(input.phase, session);
        await tx.ctlPhaseProgress.upsert?.({
          create: {
            ...phaseData,
            ctlSessionId: session.id,
            referenceCodeSlot,
            status: "COMPLETED",
            startedAt: now,
            validatedAt: now,
            completedAt: now,
            validatedBy: ctlPhaseValidatedBy(input.actor)
          },
          update: {
            ...phaseData,
            status: "COMPLETED",
            startedAt: now,
            validatedAt: now,
            completedAt: now,
            validatedBy: ctlPhaseValidatedBy(input.actor)
          },
          where: {
            ctlSessionId_phase: {
              ctlSessionId: session.id,
              phase: input.phase
            }
          }
        });

        await tx.ctlSession.update?.({
          data: {
            startedAt: session.startedAt ?? now,
            status: "IN_PROGRESS"
          },
          where: { id: session.id }
        });

        return { ok: true, phase: input.phase };
      });
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
          await upsertCtlAnswer(tx, session.id, answer);
        }

        const now = new Date();
        if (input.complete) {
          const nseCalculation = calculateCtlNse(
            getCtlDefinition(),
            mergeCtlAnswerLookup(session.answers ?? [], input.answers)
          );

          if (!nseCalculation.ok) {
            return {
              message: `Faltan datos demograficos para calcular NSE: ${nseCalculation.missingQuestionCodes.join(", ")}.`,
              ok: false
            };
          }

          await upsertCtlAnswer(tx, session.id, {
            answerValue: String(nseCalculation.totalPoints),
            questionCode: "D_TOTAL_PUNTOS_NSE"
          });
          await upsertCtlAnswer(tx, session.id, {
            answerValue: nseCalculation.classificationCode,
            questionCode: "D_NSE_CLASIFICACION"
          });
          await upsertCtlAnswer(tx, session.id, {
            answerValue: formatCtlTime(now),
            questionCode: "DG_HORA_TERMINO"
          });
        }

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
          studyId: input.studyId,
          ...(input.includeQa ? {} : { studyParticipant: { qaParticipantRun: { is: null } } })
        }
      })) as ConfirmationRecord | null;

      if (!confirmation) {
        return { message: "No encontramos un participante con ese folio.", ok: false };
      }

      if (!isCtlAvailableConfirmation(confirmation)) {
        return { message: "Este folio aun no esta listo para CTL.", ok: false };
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

      const now = new Date();
      const created = (await prisma.ctlSession.create?.({
        data: {
          interviewerId: input.actor.id,
          screeningAttemptId: confirmation.screeningAttempt.id,
          claimedAt: now,
          startedAt: now,
          status: "PENDING",
          studyId: input.studyId,
          studyParticipantId: confirmation.studyParticipant.id,
          triangularRotationSnapshot: buildCtlTriangularRotationSnapshot(
            confirmation.studyParticipant.ctlTriangularRotationAssignment ?? null
          )
        },
        select: { id: true }
      })) as { id: string };

      await upsertAutomaticCtlStartAnswers(prisma as CtlTransactionClient, {
        participantName: confirmation.studyParticipant.participantProfile.name,
        sessionId: created.id,
        startedAt: now
      });
      await createCtlPhaseProgressFoundation(prisma as CtlTransactionClient, {
        confirmation,
        sessionId: created.id,
        startedAt: now
      });

      return { ok: true, sessionId: created.id };
    },

    async validateInterviewerCode(input) {
      const prisma = await getPrisma();
      const now = input.now ?? new Date();
      const interviewerCode = toInterviewerCodeView(await prisma.ctlInterviewerCode.findFirst?.({
        select: ctlInterviewerCodeSelect,
        where: {
          codeHash: hashCtlInterviewerCode(input.code),
          study: { code: input.studyCode }
        }
      }));

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
  _count: {
    select: { ctlSessions: true }
  },
  codeHash: true,
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
      accessTokens: {
        orderBy: { createdAt: "desc" },
        select: { expiresAt: true, id: true, status: true, tokenHash: true },
        take: 1,
        where: { status: "ACTIVE" }
      },
      id: true,
      ctlTriangularRotationAssignment: {
        select: {
          id: true,
          triangular1Pr1: true,
          triangular1Pr2: true,
          triangular1Pr3: true,
          triangular1Verify: true,
          triangular2Pr1: true,
          triangular2Pr2: true,
          triangular2Pr3: true,
          triangular2Verify: true
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
  phaseProgress: {
    orderBy: { referenceCodeSlot: "asc" },
    select: {
      arm: true,
      completedAt: true,
      phase: true,
      productCode: true,
      referenceCodeSlot: true,
      rotationSnapshot: true,
      startedAt: true,
      status: true,
      validatedAt: true,
      validatedBy: true
    }
  },
  startedAt: true,
  status: true,
  studyId: true,
  triangularRotationSnapshot: true,
  studyParticipant: {
    select: {
      accessTokens: {
        orderBy: { createdAt: "desc" },
        select: { expiresAt: true, id: true, status: true, tokenHash: true },
        take: 1,
        where: { status: "ACTIVE" }
      },
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

async function upsertAutomaticCtlStartAnswers(
  tx: CtlTransactionClient,
  input: {
    participantName: string;
    sessionId: string;
    startedAt: Date;
  }
): Promise<void> {
  await upsertCtlAnswer(tx, input.sessionId, {
    answerValue: input.participantName,
    questionCode: "DG_NOMBRE"
  });
  await upsertCtlAnswer(tx, input.sessionId, {
    answerValue: formatCtlDate(input.startedAt),
    questionCode: "DG_FECHA"
  });
  await upsertCtlAnswer(tx, input.sessionId, {
    answerValue: formatCtlTime(input.startedAt),
    questionCode: "DG_HORA_INICIO"
  });
}

async function createCtlPhaseProgressFoundation(
  tx: CtlTransactionClient,
  input: {
    confirmation: ConfirmationRecord;
    sessionId: string;
    startedAt: Date;
  }
): Promise<void> {
  for (const phase of CTL_OPERATIONAL_PHASES) {
    const data = ctlPhaseProgressDataFromConfirmation(phase, input.confirmation);
    await tx.ctlPhaseProgress.create?.({
      data: {
        ...data,
        ctlSessionId: input.sessionId,
        referenceCodeSlot: ctlReferenceCodeSlotForPhase(phase),
        startedAt: phase === "COLOCACION" ? input.startedAt : null,
        status: phase === "COLOCACION" ? "IN_PROGRESS" : "PENDING"
      }
    });
  }
}

async function upsertCtlAnswer(
  tx: CtlTransactionClient,
  sessionId: string,
  answer: CtlAnswerDraft
): Promise<void> {
  await tx.ctlAnswer.upsert?.({
    create: {
      answerValue: answer.answerValue,
      ctlSessionId: sessionId,
      questionCode: answer.questionCode
    },
    update: {
      answerValue: answer.answerValue
    },
    where: {
      ctlSessionId_questionCode: {
        ctlSessionId: sessionId,
        questionCode: answer.questionCode
      }
    }
  });
}

function mergeCtlAnswerLookup(
  existingAnswers: Array<{ answerValue: unknown; questionCode: string }>,
  nextAnswers: CtlAnswerDraft[]
): Record<string, unknown> {
  return {
    ...Object.fromEntries(existingAnswers.map((answer) => [answer.questionCode, answer.answerValue])),
    ...Object.fromEntries(nextAnswers.map((answer) => [answer.questionCode, answer.answerValue]))
  };
}

function canReadSession(
  actor: CtlActor,
  session: Pick<SessionRecord, "ctlInterviewerCodeId" | "interviewerId" | "studyId">
): boolean {
  if (isPublicCtlInterviewerActor(actor)) {
    return session.studyId === actor.studyId && session.ctlInterviewerCodeId === actor.id;
  }

  return actor.role === "ADMIN" || actor.role === "SUPERVISOR" || session.interviewerId === actor.id;
}

const CTL_OPERATIONAL_PHASES: CtlOperationalPhase[] = ["COLOCACION", "EVALUACION_1", "EVALUACION_2"];

function ctlReferenceCodeSlotForPhase(phase: CtlOperationalPhase): 1 | 2 | 3 {
  const slots: Record<CtlOperationalPhase, 1 | 2 | 3> = {
    COLOCACION: 1,
    EVALUACION_1: 2,
    EVALUACION_2: 3
  };
  return slots[phase];
}

function ctlPhaseValidatedBy(actor: CtlActor): string {
  return isPublicCtlInterviewerActor(actor) ? actor.label : actor.id;
}

function ctlPhaseProgressData(phase: CtlOperationalPhase, session: SessionRecord) {
  return ctlPhaseProgressDataFromParticipant(phase, session.studyParticipant);
}

function ctlPhaseProgressDataFromConfirmation(phase: CtlOperationalPhase, confirmation: ConfirmationRecord) {
  return ctlPhaseProgressDataFromParticipant(phase, confirmation.studyParticipant);
}

function ctlPhaseProgressDataFromParticipant(phase: CtlOperationalPhase, participant: ParticipantRecord) {
  const arms = participant.rotationAssignment?.arms ?? [];
  const firstSampleKey = arms.find((arm) => arm.applicationOrder === 1)?.studyProduct.internalCode ?? null;
  const secondSampleKey = arms.find((arm) => arm.applicationOrder === 2)?.studyProduct.internalCode ?? null;
  const triangularRotation = buildCtlTriangularRotationSnapshot(participant.ctlTriangularRotationAssignment ?? null);
  const productCode = phase === "COLOCACION" ? firstSampleKey : secondSampleKey;
  const arm = phase === "COLOCACION" ? "IZQUIERDO" : phase === "EVALUACION_1" ? "DERECHO" : null;

  return {
    arm,
    phase,
    productCode,
    rotationSnapshot: {
      firstSampleKey,
      secondSampleKey,
      triangularRotation
    }
  };
}

function buildCtlTriangularRotationSnapshot(
  assignment: CtlTriangularRotationAssignmentRecord | null
): CtlTriangularRotationSnapshot | null {
  if (!assignment) {
    return null;
  }

  return {
    assignmentId: assignment.id,
    triangular1: {
      pr1: assignment.triangular1Pr1,
      pr2: assignment.triangular1Pr2,
      pr3: assignment.triangular1Pr3,
      verify: assignment.triangular1Verify
    },
    triangular2: {
      pr1: assignment.triangular2Pr1,
      pr2: assignment.triangular2Pr2,
      pr3: assignment.triangular2Pr3,
      verify: assignment.triangular2Verify
    }
  };
}

function parseCtlTriangularRotationSnapshot(value: unknown): CtlTriangularRotationSnapshot | null {
  if (!isRecord(value) || !isRecord(value.triangular1) || !isRecord(value.triangular2)) {
    return null;
  }

  const snapshot = {
    assignmentId: String(value.assignmentId ?? ""),
    triangular1: {
      pr1: String(value.triangular1.pr1 ?? ""),
      pr2: String(value.triangular1.pr2 ?? ""),
      pr3: String(value.triangular1.pr3 ?? ""),
      verify: String(value.triangular1.verify ?? "")
    },
    triangular2: {
      pr1: String(value.triangular2.pr1 ?? ""),
      pr2: String(value.triangular2.pr2 ?? ""),
      pr3: String(value.triangular2.pr3 ?? ""),
      verify: String(value.triangular2.verify ?? "")
    }
  };

  return snapshot.assignmentId &&
    snapshot.triangular1.pr1 &&
    snapshot.triangular1.pr2 &&
    snapshot.triangular1.pr3 &&
    snapshot.triangular1.verify &&
    snapshot.triangular2.pr1 &&
    snapshot.triangular2.pr2 &&
    snapshot.triangular2.pr3 &&
    snapshot.triangular2.verify
    ? snapshot
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function toParticipantSummary(
  confirmation: ConfirmationRecord,
  session: {
    ctlInterviewerCode?: { label: string } | null;
    id: string;
    interviewer: { name: string } | null;
    status: CtlSessionStatus;
  } | null,
  triangularRotation: CtlTriangularRotationSnapshot | null = buildCtlTriangularRotationSnapshot(
    confirmation.studyParticipant.ctlTriangularRotationAssignment ?? null
  )
): CtlParticipantSummary {
  const arms = confirmation.studyParticipant.rotationAssignment?.arms ?? [];
  return {
    ctlStatus: session?.status ?? null,
    folio: confirmation.folio,
    id: confirmation.studyParticipant.id,
    interviewerName: session ? getSessionInterviewerName(session) : null,
    name: confirmation.studyParticipant.participantProfile.name,
    nse: formatNse(confirmation.screeningAttempt),
    participantLinkToken: confirmation.studyParticipant.accessTokens?.[0]?.id ?? null,
    referenceCodes: confirmation.referenceCodes,
    rotation: {
      firstSampleKey: arms.find((arm) => arm.applicationOrder === 1)?.studyProduct.internalCode ?? null,
      secondSampleKey: arms.find((arm) => arm.applicationOrder === 2)?.studyProduct.internalCode ?? null
    },
    sessionId: session?.id ?? null,
    triangularRotation
  };
}

function isCtlAvailableConfirmation(confirmation: ConfirmationRecord): boolean {
  const arms = confirmation.studyParticipant.rotationAssignment?.arms ?? [];
  const hasCompleteRotation =
    Boolean(arms.find((arm) => arm.applicationOrder === 1)?.studyProduct.internalCode) &&
    Boolean(arms.find((arm) => arm.applicationOrder === 2)?.studyProduct.internalCode);
  const hasTriangularRotation = Boolean(confirmation.studyParticipant.ctlTriangularRotationAssignment);
  return (
    confirmation.screeningAttempt.status === "PASSED" &&
    confirmation.studyParticipant.screeningStatus === "PASSED" &&
    hasCompleteRotation &&
    hasTriangularRotation
  );
}

function toSessionView(session: SessionRecord): CtlSessionView {
  const confirmation = session.studyParticipant.participantConfirmation;
  const interviewerName = getSessionInterviewerName(session);
  const triangularRotation =
    parseCtlTriangularRotationSnapshot(session.triangularRotationSnapshot) ??
    buildCtlTriangularRotationSnapshot(session.studyParticipant.ctlTriangularRotationAssignment ?? null);
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
          },
          triangularRotation
        )
      : {
          ctlStatus: session.status,
          folio: "SIN FOLIO",
          id: session.studyParticipant.id,
          interviewerName,
          name: session.studyParticipant.participantProfile.name,
          nse: "Sin NSE",
          participantLinkToken: session.studyParticipant.accessTokens?.[0]?.id ?? null,
          referenceCodes: [],
          rotation: { firstSampleKey: null, secondSampleKey: null },
          sessionId: session.id,
          triangularRotation
        },
    phaseProgress: toPhaseProgressViews(session.phaseProgress ?? []),
    responsibleUserId: session.ctlInterviewerCode?.createdByUserId ?? session.interviewer?.id ?? null,
    startedAt: session.startedAt,
    status: session.status
  };
}

function toPhaseProgressViews(phases: CtlPhaseProgressRecord[]): CtlPhaseProgressView[] {
  return phases
    .slice()
    .sort((left, right) => left.referenceCodeSlot - right.referenceCodeSlot)
    .map((phase) => ({
      arm: phase.arm,
      completedAt: phase.completedAt,
      phase: phase.phase,
      productCode: phase.productCode,
      referenceCodeSlot: phase.referenceCodeSlot as 1 | 2 | 3,
      rotationSnapshot: phase.rotationSnapshot,
      startedAt: phase.startedAt,
      status: phase.status,
      validatedAt: phase.validatedAt,
      validatedBy: phase.validatedBy
    }));
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
  const level = input.nseClass ? nseClassLabel(input.nseClass) : null;

  if (input.nseScore === null && !level) {
    return "Sin NSE";
  }

  if (level && input.nseScore !== null) {
    return `${level} (${input.nseScore} pts.)`;
  }

  return level ?? `${input.nseScore} pts.`;
}

function nseClassLabel(value: string): string | null {
  switch (value.toUpperCase()) {
    case "AB":
    case "A/B":
    case "RANGO-1":
      return "A/B";
    case "C_PLUS":
    case "C+":
    case "RANGO-2":
      return "C+";
    case "C_TIPICO":
    case "C TIPICO":
    case "RANGO-3":
      return "C Tipico";
    case "C_MINUS":
    case "C-":
    case "RANGO-4":
      return "C-";
    case "D_PLUS":
    case "D+":
    case "RANGO-5":
      return "D+";
    case "D":
    case "RANGO-6":
      return "D";
    case "E":
    case "RANGO-7":
      return "E";
    default:
      return value;
  }
}

function getSessionInterviewerName(session: {
  ctlInterviewerCode?: { label: string } | null;
  interviewer: { name: string } | null;
}): string {
  return session.interviewer?.name ?? session.ctlInterviewerCode?.label ?? "Encuestador CTL";
}

function toInterviewerCodeView(value: unknown): CtlInterviewerCodeView | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as {
    _count?: { ctlSessions?: number };
    codeHash: string;
    createdAt: Date;
    expiresAt: Date | null;
    id: string;
    label: string;
    lastUsedAt: Date | null;
    status: CtlInterviewerCodeStatus;
    studyId: string;
  };

  return {
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    id: record.id,
    label: record.label,
    lastUsedAt: record.lastUsedAt,
    operationalCode: getVerifiedPermanentOperationalCode(record),
    sessionCount: record._count?.ctlSessions ?? 0,
    status: record.status,
    studyId: record.studyId
  };
}

function getVerifiedPermanentOperationalCode(record: { codeHash: string; expiresAt: Date | null; label: string }): string | null {
  const operationalCode = buildPermanentCtlInterviewerCode(record.label);

  if (!operationalCode || record.expiresAt || hashCtlInterviewerCode(operationalCode) !== record.codeHash) {
    return null;
  }

  return operationalCode;
}

export { ctlStatusLabel };
