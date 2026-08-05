import { describe, expect, it } from "vitest";
import { createCtlRepository } from "./repository";
import { doReferenceCodesMatch, parseCtlAnswers } from "./service";

const interviewer = { id: "interviewer-1", role: "INTERVIEWER" as const, status: "ACTIVE" as const };
const otherInterviewer = { id: "interviewer-2", role: "INTERVIEWER" as const, status: "ACTIVE" as const };

describe("ctl module", () => {
  it("validates participant reference codes in slot order", () => {
    expect(
      doReferenceCodesMatch(
        [
          { code: "A7K4", slot: 1 },
          { code: "M3P9", slot: 2 },
          { code: "T8R2", slot: 3 }
        ],
        ["a7k4", "m3p9", "t8r2"]
      )
    ).toBe(true);
  });

  it("rejects incorrect participant codes", async () => {
    const state = createCtlState();
    const repository = createCtlRepository(state.prisma as never);

    const result = await repository.startSession({
      actor: interviewer,
      code1: "A7K4",
      code2: "M3P9",
      code3: "XXXX",
      folio: "NAV-001",
      studyId: state.study.id
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.message).toBe("Los codigos no corresponden al participante.");
    expect(state.sessions).toHaveLength(0);
  });

  it("creates a CTL session after validating participant codes", async () => {
    const state = createCtlState();
    const repository = createCtlRepository(state.prisma as never);

    const result = await repository.startSession({
      actor: interviewer,
      code1: "A7K4",
      code2: "M3P9",
      code3: "T8R2",
      folio: "NAV-001",
      studyId: state.study.id
    });

    expect(result.ok).toBe(true);
    expect(state.sessions).toMatchObject([
      {
        interviewerId: "interviewer-1",
        screeningAttemptId: "attempt-1",
        status: "PENDING",
        studyParticipantId: "participant-1"
      }
    ]);
  });

  it("saves answers and continues capture later", async () => {
    const state = createCtlState();
    const repository = createCtlRepository(state.prisma as never);
    const started = await repository.startSession({
      actor: interviewer,
      code1: "A7K4",
      code2: "M3P9",
      code3: "T8R2",
      folio: "NAV-001",
      studyId: state.study.id
    });

    expect(started.ok).toBe(true);
    const sessionId = started.ok ? started.sessionId : "";
    const parsed = parseCtlAnswers({
      OBSERVACIONES_CTL: "  todo bien  ",
      P1_TRIANGULAR_1: "247",
      P2_TRIANGULAR_2: "583",
      P5_GUSTO: "4"
    });
    expect(parsed.ok).toBe(true);

    const saved = await repository.saveAnswers({
      actor: interviewer,
      answers: parsed.ok ? parsed.answers : [],
      complete: false,
      sessionId
    });
    const session = await repository.getSession({ actor: interviewer, sessionId });

    expect(saved.ok).toBe(true);
    expect(session?.status).toBe("IN_PROGRESS");
    expect(session?.answers).toMatchObject({
      OBSERVACIONES_CTL: "TODO BIEN",
      P1_TRIANGULAR_1: "247",
      P2_TRIANGULAR_2: "583",
      P5_GUSTO: "4"
    });
  });

  it("allows multiple interviewers to have separate CTL sessions for the same participant", async () => {
    const state = createCtlState();
    const repository = createCtlRepository(state.prisma as never);
    const first = await repository.startSession({
      actor: interviewer,
      code1: "A7K4",
      code2: "M3P9",
      code3: "T8R2",
      folio: "NAV-001",
      studyId: state.study.id
    });
    const second = await repository.startSession({
      actor: otherInterviewer,
      code1: "A7K4",
      code2: "M3P9",
      code3: "T8R2",
      folio: "NAV-001",
      studyId: state.study.id
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(state.sessions).toHaveLength(2);
    expect(state.sessions.map((session) => session.interviewerId)).toEqual(["interviewer-1", "interviewer-2"]);
  });

  it("lists NSE from screening and shows rotation without modifying it", async () => {
    const state = createCtlState();
    const repository = createCtlRepository(state.prisma as never);

    const result = await repository.listParticipants({ actor: interviewer, studyId: state.study.id });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.participants[0]?.nse : "").toBe("144 · RANGO-3");
    expect(result.ok ? result.participants[0]?.rotation : null).toEqual({
      firstSampleKey: "247",
      secondSampleKey: "583"
    });
    expect(state.armAssignments).toHaveLength(2);
  });

  it("releases Navigo when CTL is completed", async () => {
    const state = createCtlState();
    const repository = createCtlRepository(state.prisma as never);
    const started = await repository.startSession({
      actor: interviewer,
      code1: "A7K4",
      code2: "M3P9",
      code3: "T8R2",
      folio: "NAV-001",
      studyId: state.study.id
    });
    const parsed = parseCtlAnswers({
      P1_TRIANGULAR_1: "247",
      P2_TRIANGULAR_2: "583",
      P5_GUSTO: "5"
    });

    await repository.saveAnswers({
      actor: interviewer,
      answers: parsed.ok ? parsed.answers : [],
      complete: true,
      sessionId: started.ok ? started.sessionId : ""
    });

    expect(state.sessions[0]?.status).toBe("COMPLETED");
    expect(state.navigoActivities).toMatchObject([
      {
        status: "AVAILABLE",
        studyParticipantId: "participant-1"
      }
    ]);
    expect(state.accessTokens).toHaveLength(1);
  });
});

function createCtlState() {
  const study = { code: "FMASCULINA-NAVIGO-2026", id: "study-1", name: "Navigo" };
  const users = [
    { id: "interviewer-1", name: "Encuestador Uno" },
    { id: "interviewer-2", name: "Encuestador Dos" }
  ];
  const participant = {
    applicationStartedAt: null as Date | null,
    id: "participant-1",
    participantEvidence: [],
    participantProfile: { name: "ANA PEREZ" },
    participantScreeningReviews: [{ status: "APPROVED" as const }],
    rotationAssignment: {
      rotationCode: "ROTACION_1",
      arms: [
        {
          applicationOrder: 1,
          participantVisibleLabel: "Primera fragancia",
          studyArm: { code: "LEFT", label: "Brazo izquierdo", sortOrder: 1 },
          studyProduct: { displayLabel: "Fragancia A", id: "product-1", internalCode: "247" }
        },
        {
          applicationOrder: 2,
          participantVisibleLabel: "Segunda fragancia",
          studyArm: { code: "RIGHT", label: "Brazo derecho", sortOrder: 2 },
          studyProduct: { displayLabel: "Fragancia B", id: "product-2", internalCode: "583" }
        }
      ]
    },
    screeningStatus: "PASSED" as const,
    study: { ...study, status: "ACTIVE" as const, timeZoneIana: "America/Mexico_City" },
    visualVerificationMode: null
  };
  const confirmation = {
    folio: "NAV-001",
    folioSequence: 1,
    referenceCodes: [
      { code: "A7K4", slot: 1 },
      { code: "M3P9", slot: 2 },
      { code: "T8R2", slot: 3 }
    ],
    screeningAttempt: { id: "attempt-1", nseClass: "RANGO-3", nseScore: 144 },
    studyId: study.id,
    studyParticipant: participant
  };
  const sessions: Array<{
    completedAt: Date | null;
    createdAt: Date;
    id: string;
    interviewerId: string;
    screeningAttemptId: string | null;
    startedAt: Date | null;
    status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
    studyId: string;
    studyParticipantId: string;
  }> = [];
  const answers: Array<{ answerValue: unknown; ctlSessionId: string; questionCode: string }> = [];
  const armAssignments = [{ id: "arm-1" }, { id: "arm-2" }];
  const activitySchedules = [
    {
      code: "T0_SALON",
      id: "schedule-t0",
      offsetMinutes: 0,
      questionnaireVersionId: null,
      sortOrder: 0,
      status: "ACTIVE",
      studyId: study.id,
      type: "INTERNAL_FOLLOWUP",
      windowEndsMinutes: 0,
      windowStartsMinutes: 0
    }
  ];
  const navigoActivities: Array<{
    activitySchedule: (typeof activitySchedules)[number];
    activityScheduleId: string;
    actualCompletedAt: Date | null;
    actualStartedAt: Date | null;
    availableFrom: Date;
    availableUntil: Date;
    id: string;
    occurrenceKey: string;
    participantActivityEvidence: Array<never>;
    responses: Array<never>;
    scheduledAt: Date;
    status: string;
    studyParticipantId: string;
  }> = [];
  const accessTokens: Array<{ createdByUserId: string; expiresAt: Date; id: string; status: string; studyParticipantId: string; tokenHash: string }> = [];

  function toSessionRecord(session: (typeof sessions)[number]) {
    const user = users.find((candidate) => candidate.id === session.interviewerId) ?? users[0]!;
    return {
      ...session,
      answers: answers.filter((answer) => answer.ctlSessionId === session.id),
      interviewer: user,
      studyParticipant: {
        ...participant,
        participantConfirmation: confirmation
      }
    };
  }

  const tx = {
    ctlAnswer: {
      async upsert(args: {
        create: { answerValue: unknown; ctlSessionId: string; questionCode: string };
        update: { answerValue: unknown };
        where: { ctlSessionId_questionCode: { ctlSessionId: string; questionCode: string } };
      }) {
        const target = answers.find(
          (answer) =>
            answer.ctlSessionId === args.where.ctlSessionId_questionCode.ctlSessionId &&
            answer.questionCode === args.where.ctlSessionId_questionCode.questionCode
        );
        if (target) {
          Object.assign(target, args.update);
          return target;
        }
        answers.push(args.create);
        return args.create;
      }
    },
    ctlSession: {
      async create(args: { data: Omit<(typeof sessions)[number], "completedAt" | "createdAt" | "id" | "startedAt">; select: { id: true } }) {
        const record = {
          ...args.data,
          completedAt: null,
          createdAt: new Date(),
          id: `ctl-session-${sessions.length + 1}`,
          startedAt: null
        };
        sessions.push(record);
        return { id: record.id };
      },
      async findFirst(args: {
        where: {
          interviewerId: string;
          status: { in: string[] };
          studyParticipantId: string;
        };
      }) {
        return (
          sessions.find(
            (session) =>
              session.interviewerId === args.where.interviewerId &&
              session.studyParticipantId === args.where.studyParticipantId &&
              args.where.status.in.includes(session.status)
          ) ?? null
        );
      },
      async findMany(args: { where: { studyId: string } }) {
        return sessions.filter((session) => session.studyId === args.where.studyId).map(toSessionRecord);
      },
      async findUnique(args: { where: { id: string } }) {
        const session = sessions.find((candidate) => candidate.id === args.where.id);
        return session ? toSessionRecord(session) : null;
      },
      async update(args: { data: Partial<(typeof sessions)[number]>; where: { id: string } }) {
        const session = sessions.find((candidate) => candidate.id === args.where.id);
        if (!session) throw new Error("session not found");
        Object.assign(session, args.data);
        return session;
      }
    },
    activitySchedule: {
      async create(args: { data: (typeof activitySchedules)[number] }) {
        const record = { ...args.data, id: `schedule-${args.data.code}` };
        activitySchedules.push(record);
        return { id: record.id };
      },
      async findFirst(args: { where: { code: string; status: string; studyId: string } }) {
        return activitySchedules.find(
          (schedule) =>
            schedule.code === args.where.code &&
            schedule.status === args.where.status &&
            schedule.studyId === args.where.studyId
        ) ?? null;
      },
      async findMany(args: { where: { code: { in: string[] }; studyId: string } }) {
        return activitySchedules.filter(
          (schedule) => schedule.studyId === args.where.studyId && args.where.code.in.includes(schedule.code)
        );
      },
      async update(args: { data: Partial<(typeof activitySchedules)[number]>; where: { id: string } }) {
        const schedule = activitySchedules.find((candidate) => candidate.id === args.where.id);
        if (!schedule) throw new Error("schedule not found");
        Object.assign(schedule, args.data);
        return schedule;
      }
    },
    participantAccessToken: {
      async create(args: { data: (typeof accessTokens)[number] }) {
        accessTokens.push(args.data);
        return args.data;
      }
    },
    participantActivity: {
      async create(args: { data: Omit<(typeof navigoActivities)[number], "activitySchedule" | "id" | "participantActivityEvidence" | "responses">; select: { id: true } }) {
        const schedule = activitySchedules.find((item) => item.id === args.data.activityScheduleId);
        if (!schedule) throw new Error("schedule not found");
        const record = {
          ...args.data,
          activitySchedule: schedule,
          id: `activity-${navigoActivities.length + 1}`,
          participantActivityEvidence: [],
          responses: []
        };
        navigoActivities.push(record);
        return { id: record.id };
      }
    },
    participantConfirmation: {
      async findFirst(args: { where: { folio: string; studyId: string } }) {
        return args.where.studyId === study.id && args.where.folio === confirmation.folio ? confirmation : null;
      },
      async findMany(args: { where: { studyId: string } }) {
        return args.where.studyId === study.id ? [confirmation] : [];
      }
    },
    study: {
      async findUnique(args: { where: { id: string } }) {
        return args.where.id === study.id ? study : null;
      }
    },
    participantRotationAssignment: {
      async findMany() {
        return [{ rotationPlanId: "rotation-plan-1" }];
      }
    },
    questionnaireVersion: {
      async findFirst() {
        return { id: "measurement-version-1" };
      }
    },
    rotationPlan: {
      async findMany() {
        return [];
      }
    },
    studyParticipant: {
      async findUnique(args: { where: { id: string } }) {
        if (args.where.id !== participant.id) {
          return null;
        }
        return {
          ...participant,
          activities: navigoActivities,
          ctlSessions: sessions
            .filter((session) => session.studyParticipantId === participant.id)
            .map((session) => ({
              completedAt: session.completedAt,
              id: session.id,
              interviewer: users.find((user) => user.id === session.interviewerId) ?? users[0]!,
              status: session.status
            })),
          participantConfirmation: confirmation
        };
      },
      async update(args: { data: { operationalStatus: string }; where: { id: string } }) {
        return args.where.id === participant.id ? participant : null;
      }
    }
  };

  const prisma = {
    ...tx,
    async $transaction<T>(callback: (transaction: typeof tx) => Promise<T>) {
      return callback(tx);
    }
  };

  return {
    answers,
    accessTokens,
    armAssignments,
    navigoActivities,
    prisma,
    sessions,
    study
  };
}
