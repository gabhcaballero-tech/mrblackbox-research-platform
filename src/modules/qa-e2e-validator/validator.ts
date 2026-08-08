import { NAVIGO_ACTIVITY_CODES } from "@/modules/navigo-app/definition";
import { createPrismaClient } from "@/shared/db/client";
import type {
  QaE2eValidationBlock,
  QaE2eValidationCheck,
  QaE2eValidationLinks,
  QaE2eValidationReport,
  QaE2eValidationStatus
} from "./types";
import type { QaParticipantScenario, QaParticipantScenarioReport } from "@/modules/qa-participants";

type Delegate = {
  findMany?: (args: unknown) => Promise<unknown[]>;
  findUnique?: (args: unknown) => Promise<unknown | null>;
};

type QaE2ePrismaClient = {
  activitySchedule: Delegate;
  qaParticipantRun: Delegate;
};

type ValidateQaE2eRunInput = {
  baseUrl?: string;
  now?: Date;
  prismaClient?: QaE2ePrismaClient;
  runId: string;
  studyId: string;
};

type QaRunRecord = {
  hutParticipant: HutParticipantRecord | null;
  hutParticipantId: string | null;
  id: string;
  reportJson: unknown | null;
  scenario: QaParticipantScenario;
  status: string;
  studyId: string;
  studyParticipant: StudyParticipantRecord | null;
  studyParticipantId: string | null;
};

type StudyParticipantRecord = {
  accessTokens: Array<{ expiresAt: Date; id: string; status: string }>;
  ctlSessions: Array<{
    completedAt: Date | null;
    id: string;
    phaseProgress: Array<{ phase: string; status: string }>;
    status: string;
  }>;
  ctlTriangularRotationAssignment: { id: string } | null;
  id: string;
  participantConfirmation: {
    id: string;
    folio: string;
    referenceCodes: Array<{ id: string; slot: number }>;
    screeningAttempt: {
      id: string;
      status: string;
    } | null;
  } | null;
  rotationAssignment: {
    arms: Array<{ applicationOrder: number; id: string }>;
    id: string;
  } | null;
  screeningStatus: string;
};

type HutParticipantRecord = {
  folio: string | null;
  id: string;
  origin: string;
  phaseCodes: Array<{ id: string; phase: string; slot: number; status: string }>;
  protocolVersion: string;
  questionnaireAttempt: {
    id: string;
    status: string;
  } | null;
  token: string;
};

type ActivityScheduleRecord = {
  code: string | null;
  id: string;
  offsetMinutes: number;
  status: string;
};

export async function validateQaE2eRun({
  baseUrl,
  now = new Date(),
  prismaClient,
  runId,
  studyId
}: ValidateQaE2eRunInput): Promise<QaE2eValidationReport> {
  const prisma = prismaClient ?? ((await createPrismaClient()) as unknown as QaE2ePrismaClient);
  const run = (await prisma.qaParticipantRun.findUnique?.({
    select: qaRunSelect,
    where: { id: runId }
  })) as QaRunRecord | null;

  if (!run || run.studyId !== studyId) {
    return failedMissingRunReport({ now, runId, studyId });
  }

  const schedules = ((await prisma.activitySchedule.findMany?.({
    select: {
      code: true,
      id: true,
      offsetMinutes: true,
      status: true
    },
    where: {
      code: { in: NAVIGO_ACTIVITY_CODES },
      status: "ACTIVE",
      studyId
    }
  })) ?? []) as ActivityScheduleRecord[];

  const blocks = blocksForScenario(run, schedules, now);
  const reportJson = parseScenarioReport(run.reportJson);
  const links = resolveLinks({ baseUrl, reportJson, run });

  return {
    blocks,
    generatedAt: now,
    links,
    relatedIds: {
      activeAccessTokenId: run.studyParticipant?.accessTokens[0]?.id ?? null,
      completedCtlSessionId: completedCtlSession(run.studyParticipant)?.id ?? null,
      hutParticipantId: run.hutParticipantId,
      hutQuestionnaireAttemptId: run.hutParticipant?.questionnaireAttempt?.id ?? null,
      participantConfirmationId: run.studyParticipant?.participantConfirmation?.id ?? null,
      screeningAttemptId: run.studyParticipant?.participantConfirmation?.screeningAttempt?.id ?? null,
      studyParticipantId: run.studyParticipantId
    },
    runId: run.id,
    scenario: run.scenario,
    status: summarizeBlocks(blocks),
    studyId
  };
}

const qaRunSelect = {
  hutParticipant: {
    select: {
      folio: true,
      id: true,
      origin: true,
      phaseCodes: {
        orderBy: { slot: "asc" },
        select: {
          id: true,
          phase: true,
          slot: true,
          status: true
        }
      },
      protocolVersion: true,
      questionnaireAttempt: {
        select: {
          id: true,
          status: true
        }
      },
      token: true
    }
  },
  hutParticipantId: true,
  id: true,
  reportJson: true,
  scenario: true,
  status: true,
  studyId: true,
  studyParticipant: {
    select: {
      accessTokens: {
        orderBy: { createdAt: "desc" },
        select: {
          expiresAt: true,
          id: true,
          status: true
        },
        take: 1,
        where: { status: "ACTIVE" }
      },
      ctlSessions: {
        orderBy: { createdAt: "desc" },
        select: {
          completedAt: true,
          id: true,
          phaseProgress: {
            select: {
              phase: true,
              status: true
            }
          },
          status: true
        }
      },
      ctlTriangularRotationAssignment: {
        select: { id: true }
      },
      id: true,
      participantConfirmation: {
        select: {
          folio: true,
          id: true,
          referenceCodes: {
            orderBy: { slot: "asc" },
            select: {
              id: true,
              slot: true
            }
          },
          screeningAttempt: {
            select: {
              id: true,
              status: true
            }
          }
        }
      },
      rotationAssignment: {
        select: {
          arms: {
            orderBy: { applicationOrder: "asc" },
            select: {
              applicationOrder: true,
              id: true
            }
          },
          id: true
        }
      },
      screeningStatus: true
    }
  },
  studyParticipantId: true
} as const;

function blocksForScenario(
  run: QaRunRecord,
  schedules: ActivityScheduleRecord[],
  now: Date
): QaE2eValidationBlock[] {
  if (run.scenario === "HUT_DIRECTO") {
    return [hutBlock(run, "HUT_DIRECTO")];
  }

  const common = [
    screeningBlock(run),
    rotationsBlock(run)
  ];

  if (run.scenario === "CLT_ONLY") {
    return [...common, ctlAvailabilityBlock(run)];
  }

  const navigoBlocks = [ctlCompletedBlock(run), navigoBlock(run, schedules, now)];
  if (run.scenario === "CLT_NAVIGO") {
    return [...common, ...navigoBlocks];
  }

  return [...common, ...navigoBlocks, hutBlock(run, "CLT_HUT")];
}

function screeningBlock(run: QaRunRecord): QaE2eValidationBlock {
  const participant = run.studyParticipant;
  const confirmation = participant?.participantConfirmation ?? null;
  const referenceSlots = new Set((confirmation?.referenceCodes ?? []).map((code) => code.slot));

  return block("SCREENING", [
    check(Boolean(participant), "StudyParticipant existe", participant?.id, "Falta StudyParticipant asociado al run QA."),
    check(participant?.screeningStatus === "PASSED", "StudyParticipant.screeningStatus = PASSED", participant?.id, `Estado actual: ${participant?.screeningStatus ?? "sin participante"}.`),
    check(confirmation?.screeningAttempt?.status === "PASSED", "ScreeningAttempt.status = PASSED", confirmation?.screeningAttempt?.id, `Estado actual: ${confirmation?.screeningAttempt?.status ?? "sin attempt"}.`),
    check(Boolean(confirmation), "ParticipantConfirmation existe", confirmation?.id, "Falta confirmacion/folio."),
    check(
      [1, 2, 3].every((slot) => referenceSlots.has(slot)),
      "Reference codes slots 1,2,3 existen",
      confirmation?.id,
      `Slots encontrados: ${[...referenceSlots].join(", ") || "ninguno"}.`
    )
  ]);
}

function rotationsBlock(run: QaRunRecord): QaE2eValidationBlock {
  const participant = run.studyParticipant;
  const arms = participant?.rotationAssignment?.arms ?? [];
  const orders = new Set(arms.map((arm) => arm.applicationOrder));

  return block("ROTACIONES", [
    check(Boolean(participant?.rotationAssignment), "Rotacion Navigo existe", participant?.rotationAssignment?.id, "Falta ParticipantRotationAssignment."),
    check(
      orders.has(1) && orders.has(2),
      "Rotacion Navigo tiene primera y segunda muestra",
      participant?.rotationAssignment?.id,
      `Ordenes encontrados: ${[...orders].join(", ") || "ninguno"}.`
    ),
    check(Boolean(participant?.ctlTriangularRotationAssignment), "Rotacion triangular CTL existe", participant?.ctlTriangularRotationAssignment?.id, "Falta CtlTriangularRotationAssignment.")
  ]);
}

function ctlAvailabilityBlock(run: QaRunRecord): QaE2eValidationBlock {
  const participant = run.studyParticipant;
  const blockingSession = (participant?.ctlSessions ?? []).find((session) => ["PENDING", "IN_PROGRESS", "COMPLETED"].includes(session.status));

  return block("CTL DISPONIBLE", [
    check(Boolean(participant), "Participante base existe", participant?.id, "Falta StudyParticipant."),
    check(!blockingSession, "Sin CtlSession activa/completada", blockingSession?.id, blockingSession ? `Sesion existente en estado ${blockingSession.status}.` : "Listo para reclamar CTL QA."),
    check(
      run.status === "CREATED",
      "Run QA creado",
      run.id,
      `Estado actual del run: ${run.status}.`
    )
  ]);
}

function ctlCompletedBlock(run: QaRunRecord): QaE2eValidationBlock {
  const session = completedCtlSession(run.studyParticipant);
  const phases = session?.phaseProgress ?? [];
  const completedPhases = new Set(phases.filter((phase) => phase.status === "COMPLETED").map((phase) => phase.phase));

  return block("CTL COMPLETADO", [
    check(Boolean(session), "CtlSession COMPLETED existe", session?.id, "Falta sesion CTL completada."),
    check(
      ["COLOCACION", "EVALUACION_1", "EVALUACION_2"].every((phase) => completedPhases.has(phase)),
      "Fases operativas CTL completadas",
      session?.id,
      `Fases completadas: ${[...completedPhases].join(", ") || "ninguna"}.`
    )
  ]);
}

function navigoBlock(
  run: QaRunRecord,
  schedules: ActivityScheduleRecord[],
  now: Date
): QaE2eValidationBlock {
  const token = run.studyParticipant?.accessTokens[0] ?? null;
  const scheduleByCode = new Map(schedules.map((schedule) => [schedule.code, schedule]));

  return block("NAVIGO", [
    check(Boolean(token), "ParticipantAccessToken activo existe", token?.id, "Falta token activo para link Navigo."),
    check(
      !token || token.expiresAt.getTime() > now.getTime(),
      "ParticipantAccessToken no expirado",
      token?.id,
      token ? `Expira en ${token.expiresAt.toISOString()}.` : "Sin token."
    ),
    ...NAVIGO_ACTIVITY_CODES.map((code) =>
      check(
        Boolean(scheduleByCode.get(code)),
        `Schedule activo ${code}`,
        scheduleByCode.get(code)?.id,
        `No se encontro ActivitySchedule activo ${code}.`
      )
    )
  ]);
}

function hutBlock(run: QaRunRecord, expectedOrigin: "CLT_HUT" | "HUT_DIRECTO"): QaE2eValidationBlock {
  const participant = run.hutParticipant;
  const phaseSlots = new Set((participant?.phaseCodes ?? []).map((code) => code.slot));

  return block("HUT", [
    check(Boolean(participant), "HutParticipant existe", participant?.id, "Falta HutParticipant asociado al run."),
    check(participant?.origin === expectedOrigin, `Origin = ${expectedOrigin}`, participant?.id, `Origin actual: ${participant?.origin ?? "sin HUT"}.`),
    check(participant?.protocolVersion === "APPLICATION_PHOTO", "ProtocolVersion = APPLICATION_PHOTO", participant?.id, `Protocol actual: ${participant?.protocolVersion ?? "sin HUT"}.`),
    check(
      [1, 2, 3].every((slot) => phaseSlots.has(slot)),
      "Phase codes HUT slots 1,2,3 existen",
      participant?.id,
      `Slots encontrados: ${[...phaseSlots].join(", ") || "ninguno"}.`
    ),
    check(
      participant?.questionnaireAttempt?.status === "PENDING",
      "HutQuestionnaireAttempt pendiente",
      participant?.questionnaireAttempt?.id,
      `Estado actual: ${participant?.questionnaireAttempt?.status ?? "sin intento"}.`
    )
  ]);
}

function completedCtlSession(participant: StudyParticipantRecord | null | undefined) {
  return (participant?.ctlSessions ?? []).find((session) => session.status === "COMPLETED") ?? null;
}

function block(title: string, checks: QaE2eValidationCheck[]): QaE2eValidationBlock {
  return {
    checks,
    status: checks.every((item) => item.status === "PASS") ? "PASS" : "FAIL",
    title
  };
}

function check(ok: boolean, label: string, id: string | null | undefined, failureCause: string): QaE2eValidationCheck {
  return {
    cause: ok ? undefined : failureCause,
    id: id ?? null,
    label,
    status: ok ? "PASS" : "FAIL"
  };
}

function summarizeBlocks(blocks: QaE2eValidationBlock[]): QaE2eValidationStatus {
  return blocks.every((block) => block.status === "PASS") ? "PASS" : "FAIL";
}

function failedMissingRunReport(input: {
  now: Date;
  runId: string;
  studyId: string;
}): QaE2eValidationReport {
  const blocks = [
    block("RUN QA", [
      {
        cause: "No encontramos un QaParticipantRun del estudio solicitado.",
        id: input.runId,
        label: "QaParticipantRun existe",
        status: "FAIL"
      }
    ])
  ];

  return {
    blocks,
    generatedAt: input.now,
    links: {},
    relatedIds: {},
    runId: input.runId,
    scenario: "CLT_ONLY",
    status: "FAIL",
    studyId: input.studyId
  };
}

function resolveLinks({
  baseUrl,
  reportJson,
  run
}: {
  baseUrl?: string;
  reportJson: QaParticipantScenarioReport | null;
  run: QaRunRecord;
}): QaE2eValidationLinks {
  const token = run.studyParticipant?.accessTokens[0]?.id;
  const hutToken = run.hutParticipant?.token;
  const completedSession = completedCtlSession(run.studyParticipant);

  return {
    adminCtl: completedSession ? buildLink(baseUrl, `/admin/studies/${run.studyId}/ctl/${completedSession.id}`) : undefined,
    ctlPublic: reportJson?.links.ctlPublic,
    hutParticipant: hutToken ? buildLink(baseUrl, `/hut/p/${hutToken}`) : reportJson?.links.hutParticipant,
    navigoParticipant: token ? buildLink(baseUrl, `/p/${token}/activities`) : reportJson?.links.navigoParticipant
  };
}

function buildLink(baseUrl: string | undefined, path: string): string {
  const trimmed = baseUrl?.trim().replace(/\/+$/g, "");
  return trimmed ? `${trimmed}${path}` : path;
}

function parseScenarioReport(value: unknown): QaParticipantScenarioReport | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Partial<QaParticipantScenarioReport>;
  return candidate.qa === true && candidate.objects && candidate.links ? (candidate as QaParticipantScenarioReport) : null;
}
