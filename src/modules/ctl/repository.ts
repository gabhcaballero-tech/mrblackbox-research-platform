import { createPrismaClient, type PrismaClientLike } from "@/shared/db/client";
import { releaseNavigoParticipantForCtl } from "@/modules/navigo-app/repository";
import { getCtlDefinition } from "./definition";
import {
  canAccessCtl,
  ctlStatusLabel,
  doReferenceCodesMatch,
  normalizeCtlCode,
  type CtlActor,
  type CtlAnswerDraft,
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

type ConfirmationRecord = {
  folio: string;
  referenceCodes: Array<{ code: string; slot: number }>;
  screeningAttempt: {
    id: string;
    nseClass: string | null;
    nseScore: number | null;
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
};

type SessionRecord = {
  answers?: Array<{ answerValue: unknown; questionCode: string }>;
  completedAt: Date | null;
  id: string;
  interviewer: { id: string; name: string };
  interviewerId: string;
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
      };
    } | null;
  };
  studyParticipantId: string;
};

export type CtlRepository = {
  getSession: (input: { actor: CtlActor; sessionId: string }) => Promise<CtlSessionView | null>;
  listParticipants: (input: { actor: CtlActor; studyId: string }) => Promise<{
    ok: true;
    participants: CtlParticipantSummary[];
    study: { code: string; id: string; name: string };
  } | { message: string; ok: false }>;
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
};

export function createCtlRepository(prismaClient?: CtlPrismaClient): CtlRepository {
  async function getPrisma() {
    return prismaClient ?? ((await createPrismaClient()) as CtlPrismaClient);
  }

  return {
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

    async listParticipants(input) {
      if (!canAccessCtl(input.actor)) {
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
          id: true,
          interviewer: { select: { name: true } },
          status: true,
          studyParticipantId: true
        },
        where: { studyId: input.studyId }
      })) as Array<{
        id: string;
        interviewer: { name: string };
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
          const release = await releaseNavigoParticipantForCtl({
            actorUserId: input.actor.id,
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
      if (!canAccessCtl(input.actor)) {
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
        select: { id: true },
        where: {
          interviewerId: input.actor.id,
          status: { in: ["PENDING", "IN_PROGRESS"] },
          studyParticipantId: confirmation.studyParticipant.id
        }
      })) as { id: string } | null;

      if (existing) {
        return { ok: true, sessionId: existing.id };
      }

      const created = (await prisma.ctlSession.create?.({
        data: {
          interviewerId: input.actor.id,
          screeningAttemptId: confirmation.screeningAttempt.id,
          status: "PENDING",
          studyId: input.studyId,
          studyParticipantId: confirmation.studyParticipant.id
        },
        select: { id: true }
      })) as { id: string };

      return { ok: true, sessionId: created.id };
    }
  };
}

const confirmationSelect = {
  folio: true,
  referenceCodes: {
    orderBy: { slot: "asc" },
    select: { code: true, slot: true }
  },
  screeningAttempt: {
    select: { id: true, nseClass: true, nseScore: true }
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
      }
    }
  }
} as const;

const sessionSelect = {
  answers: {
    orderBy: { questionCode: "asc" },
    select: { answerValue: true, questionCode: true }
  },
  completedAt: true,
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
            select: { id: true, nseClass: true, nseScore: true }
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
      }
    }
  },
  studyParticipantId: true
} as const;

function canReadSession(actor: CtlActor, session: Pick<SessionRecord, "interviewerId">): boolean {
  return actor.role === "ADMIN" || actor.role === "SUPERVISOR" || session.interviewerId === actor.id;
}

function toParticipantSummary(
  confirmation: ConfirmationRecord,
  session: { id: string; interviewer: { name: string }; status: CtlSessionStatus } | null
): CtlParticipantSummary {
  const arms = confirmation.studyParticipant.rotationAssignment?.arms ?? [];
  return {
    ctlStatus: session?.status ?? null,
    folio: confirmation.folio,
    id: confirmation.studyParticipant.id,
    interviewerName: session?.interviewer.name ?? null,
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

function toSessionView(session: SessionRecord): CtlSessionView {
  const confirmation = session.studyParticipant.participantConfirmation;
  return {
    answers: Object.fromEntries((session.answers ?? []).map((answer) => [answer.questionCode, answer.answerValue])),
    completedAt: session.completedAt,
    definition: getCtlDefinition(),
    id: session.id,
    interviewerName: session.interviewer.name,
    participant: confirmation
      ? toParticipantSummary(
          {
            folio: confirmation.folio,
            referenceCodes: confirmation.referenceCodes,
            screeningAttempt: confirmation.screeningAttempt,
            studyParticipant: session.studyParticipant
          },
          { id: session.id, interviewer: session.interviewer, status: session.status }
        )
      : {
          ctlStatus: session.status,
          folio: "SIN FOLIO",
          id: session.studyParticipant.id,
          interviewerName: session.interviewer.name,
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

function formatNse(input: { nseClass: string | null; nseScore: number | null }): string {
  if (input.nseScore === null && !input.nseClass) {
    return "Sin NSE";
  }

  return [input.nseScore ?? null, input.nseClass ?? null].filter((value) => value !== null).join(" · ");
}

export { ctlStatusLabel };
