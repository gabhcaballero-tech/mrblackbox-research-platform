import { createPrismaClient } from "@/shared/db/client";
import { NAVIGO_ACTIVITY_CODES } from "@/modules/navigo-app/definition";
import {
  calculateParticipantOperationalReadiness,
  type ParticipantOperationalReadiness,
  type ParticipantReadinessInput
} from "@/modules/participant-readiness";
import { NAVIGO_HUT_ACCESS_QUESTION_ID, isNavigoHutAccessEnabled } from "@/modules/screener/study-overrides";

export type DiagnosticStatus = "BLOCKED" | "OK" | "PENDING";
export type E2EDiagnosticStatus = "BLOQUEADO" | "LISTO" | "PENDIENTE";

export type DiagnosticItem = {
  label: string;
  status: DiagnosticStatus;
  value: string;
};

export type DiagnosticBlock = {
  id: "ctl" | "hut" | "navigo" | "rotations" | "screening";
  items: DiagnosticItem[];
  status: DiagnosticStatus;
  title: string;
};

export type FolioDiagnosticReport = {
  blocks: DiagnosticBlock[];
  e2eStatus: E2EDiagnosticStatus;
  folio: string;
  participantName: string | null;
  readiness: ParticipantOperationalReadiness;
  study: {
    code: string;
    id: string;
    name: string;
  } | null;
  suggestions: string[];
  technicalDetails: FolioTechnicalDetails | null;
};

export type FolioTechnicalDetails = {
  ctlTriangular: {
    source: "CtlSession snapshot" | "CtlTriangularRotationAssignment" | "Sin snapshot" | "No importado";
    triangular1: {
      pr1: string | null;
      pr2: string | null;
      pr3: string | null;
      veri1: string | null;
    };
    triangular2: {
      pr4: string | null;
      pr5: string | null;
      pr6: string | null;
      veri2: string | null;
    };
  };
  hut: {
    eva1: string | null;
    eva2: string | null;
    source: "HutParticipant" | "HutRegistrationSlot" | "No importado";
  };
  navigo: {
    firstFragrance: string | null;
    firstFragranceArm: string | null;
    firstFragranceApplicationOrder: number | null;
    source: "No asignado" | "ParticipantRotationAssignment";
    secondFragrance: string | null;
    secondFragranceArm: string | null;
    secondFragranceApplicationOrder: number | null;
  };
};

type StudySnapshot = {
  code: string;
  id: string;
  name: string;
};

type RotationArmSnapshot = {
  applicationOrder: number;
  participantVisibleLabel: string | null;
  studyArm: { label: string | null } | null;
  studyProduct: { internalCode: string | null } | null;
};

type CtlTriangularSnapshot = {
  triangular1Pr1: string | null;
  triangular1Pr2: string | null;
  triangular1Pr3: string | null;
  triangular1Verify: string | null;
  triangular2Pr1: string | null;
  triangular2Pr2: string | null;
  triangular2Pr3: string | null;
  triangular2Verify: string | null;
};

type CtlSessionSnapshot = {
  ctlInterviewerCodeId: string | null;
  id: string;
  status: string;
  triangularRotationSnapshot: unknown;
};

type AccessTokenSnapshot = {
  expiresAt: Date;
  id: string;
  status: string;
};

type ScheduleSnapshot = {
  code: string | null;
  offsetMinutes: number;
  status: string;
};

type ActivitySnapshot = {
  activitySchedule: { code: string | null } | null;
  status: string;
};

type HutPhaseCodeSnapshot = {
  phase: string;
  slot: number;
  status: string;
};

type HutParticipantSnapshot = {
  firstFragranceLeftArm: string | null;
  id: string;
  origin: string;
  protocolVersion: string;
  questionnaireAttempt: { status: string } | null;
  registrationSlot: {
    firstFragranceLeftArm: string | null;
    secondFragranceRightArm: string | null;
    status: string;
  } | null;
  secondFragranceRightArm: string | null;
  status: string;
  studyParticipantId: string | null;
  phaseCodes: HutPhaseCodeSnapshot[];
};

type ParticipantSnapshot = {
  accessTokens: AccessTokenSnapshot[];
  activities: ActivitySnapshot[];
  applicationStartedAt: Date | null;
  ctlSessions: CtlSessionSnapshot[];
  ctlTriangularRotationAssignment: CtlTriangularSnapshot | null;
  hutParticipant: HutParticipantSnapshot | null;
  id: string;
  participantProfile: {
    name: string;
  };
  rotationAssignment: {
    arms: RotationArmSnapshot[];
    rotationCode: string;
  } | null;
  screeningStatus: string;
};

type ConfirmationSnapshot = {
  folio: string;
  referenceCodes: Array<{ slot: number }>;
  screeningAttempt: {
    answers: Array<{ answerJson: unknown; questionId: string }>;
    id: string;
    status: string;
  };
  studyParticipant: ParticipantSnapshot;
};

type CtlInterviewerCodeSnapshot = {
  createdByUserId: string | null;
  expiresAt: Date | null;
  id: string;
  label: string;
  status: string;
  studyId: string;
};

export type FolioDiagnosticSnapshot = {
  ctlInterviewerCode: CtlInterviewerCodeSnapshot | null;
  folio: string;
  hutParticipantByFolio: HutParticipantSnapshot | null;
  now: Date;
  confirmation: ConfirmationSnapshot | null;
  schedules: ScheduleSnapshot[];
  study: StudySnapshot | null;
};

type DiagnosticPrismaClient = {
  activitySchedule: {
    findMany: (args: unknown) => Promise<ScheduleSnapshot[]>;
  };
  ctlInterviewerCode: {
    findUnique: (args: unknown) => Promise<CtlInterviewerCodeSnapshot | null>;
  };
  hutParticipant: {
    findFirst: (args: unknown) => Promise<HutParticipantSnapshot | null>;
  };
  participantConfirmation: {
    findFirst: (args: unknown) => Promise<ConfirmationSnapshot | null>;
  };
  study: {
    findUnique: (args: unknown) => Promise<StudySnapshot | null>;
  };
};

export async function diagnoseNavigoFolio(input: {
  ctlInterviewerCodeId?: string | null;
  folio: string;
  includeTechnicalDetail?: boolean;
  now?: Date;
  studyCode: string;
}): Promise<FolioDiagnosticReport> {
  const prisma = (await createPrismaClient()) as unknown as DiagnosticPrismaClient;
  const snapshot = await loadFolioDiagnosticSnapshot(prisma, input);

  return buildFolioDiagnosticReport(snapshot, { includeTechnicalDetail: input.includeTechnicalDetail });
}

export async function loadFolioDiagnosticSnapshot(
  prisma: DiagnosticPrismaClient,
  input: {
    ctlInterviewerCodeId?: string | null;
    folio: string;
    now?: Date;
    studyCode: string;
  }
): Promise<FolioDiagnosticSnapshot> {
  const folio = normalizeDiagnosticCode(input.folio);
  const studyCode = normalizeDiagnosticCode(input.studyCode);
  const now = input.now ?? new Date();
  const study = await prisma.study.findUnique({
    select: { code: true, id: true, name: true },
    where: { code: studyCode }
  });

  if (!study) {
    return {
      confirmation: null,
      ctlInterviewerCode: null,
      folio,
      hutParticipantByFolio: null,
      now,
      schedules: [],
      study: null
    };
  }

  const [confirmation, schedules, hutParticipantByFolio, ctlInterviewerCode] = await Promise.all([
    prisma.participantConfirmation.findFirst({
      select: confirmationDiagnosticSelect,
      where: { folio, studyId: study.id }
    }),
    prisma.activitySchedule.findMany({
      select: { code: true, offsetMinutes: true, status: true },
      where: { code: { in: [...NAVIGO_ACTIVITY_CODES] }, studyId: study.id }
    }),
    prisma.hutParticipant.findFirst({
      select: hutParticipantDiagnosticSelect,
      where: { folio, studyId: study.id }
    }),
    input.ctlInterviewerCodeId
      ? prisma.ctlInterviewerCode.findUnique({
          select: {
            createdByUserId: true,
            expiresAt: true,
            id: true,
            label: true,
            status: true,
            studyId: true
          },
          where: { id: input.ctlInterviewerCodeId }
        })
      : Promise.resolve(null)
  ]);

  return {
    confirmation,
    ctlInterviewerCode,
    folio,
    hutParticipantByFolio,
    now,
    schedules,
    study
  };
}

export function buildFolioDiagnosticReport(
  snapshot: FolioDiagnosticSnapshot,
  options: { includeTechnicalDetail?: boolean } = {}
): FolioDiagnosticReport {
  const screening = buildScreeningBlock(snapshot);
  const rotations = buildRotationsBlock(snapshot);
  const ctl = buildCtlBlock(snapshot);
  const navigo = buildNavigoBlock(snapshot);
  const hut = buildHutBlock(snapshot);
  const blocks = [screening, rotations, ctl, navigo, hut];
  const suggestions = buildSuggestions(blocks);
  const readiness = calculateParticipantOperationalReadiness(toParticipantReadinessInput(snapshot));
  const e2eStatus = blocks.some((block) => block.status === "BLOCKED")
    ? "BLOQUEADO"
    : blocks.some((block) => block.status === "PENDING")
      ? "PENDIENTE"
      : "LISTO";

  return {
    blocks,
    e2eStatus,
    folio: snapshot.folio,
    participantName: snapshot.confirmation?.studyParticipant.participantProfile.name ?? null,
    readiness,
    study: snapshot.study,
    suggestions,
    technicalDetails: options.includeTechnicalDetail ? buildTechnicalDetails(snapshot) : null
  };
}

function buildScreeningBlock(snapshot: FolioDiagnosticSnapshot): DiagnosticBlock {
  const confirmation = snapshot.confirmation;
  const participant = confirmation?.studyParticipant ?? null;
  const referenceCodeSlots = new Set(confirmation?.referenceCodes.map((code) => code.slot) ?? []);
  const hutAccessAnswer = confirmation?.screeningAttempt.answers.find(
    (answer) => answer.questionId === NAVIGO_HUT_ACCESS_QUESTION_ID
  )?.answerJson;
  const hutCandidate = isNavigoHutAccessEnabled(hutAccessAnswer);

  return block("screening", "SCREENING", [
    item("StudyParticipant existe", participant ? "OK" : "BLOCKED", participant ? "SI" : "NO"),
    item("ParticipantConfirmation existe", confirmation ? "OK" : "BLOCKED", confirmation ? "SI" : "NO"),
    item(
      "ScreeningAttempt.status",
      confirmation?.screeningAttempt.status === "PASSED" ? "OK" : "BLOCKED",
      confirmation?.screeningAttempt.status ?? "Sin intento"
    ),
    item(
      "StudyParticipant.screeningStatus",
      participant?.screeningStatus === "PASSED" ? "OK" : "BLOCKED",
      participant?.screeningStatus ?? "Sin participante"
    ),
    item("Codigo slot 1", referenceCodeSlots.has(1) ? "OK" : "BLOCKED", referenceCodeSlots.has(1) ? "Existe" : "Falta"),
    item("Codigo slot 2", referenceCodeSlots.has(2) ? "OK" : "BLOCKED", referenceCodeSlots.has(2) ? "Existe" : "Falta"),
    item("Codigo slot 3", referenceCodeSlots.has(3) ? "OK" : "BLOCKED", referenceCodeSlots.has(3) ? "Existe" : "Falta"),
    item("HUT_ACCESO_CORRIDO historico", "OK", hutAccessAnswer === undefined ? "Sin respuesta historica" : hutCandidate ? "SI - legacy" : "NO/vacio - legacy")
  ]);
}

function buildRotationsBlock(snapshot: FolioDiagnosticSnapshot): DiagnosticBlock {
  const participant = snapshot.confirmation?.studyParticipant ?? null;
  const arms = participant?.rotationAssignment?.arms ?? [];
  const firstArm = arms.find((arm) => arm.applicationOrder === 1) ?? null;
  const secondArm = arms.find((arm) => arm.applicationOrder === 2) ?? null;
  const triangular = participant?.ctlTriangularRotationAssignment ?? null;
  const hutParticipant = participant?.hutParticipant ?? snapshot.hutParticipantByFolio;
  const hutSlot = hutParticipant?.registrationSlot ?? null;

  return block("rotations", "ROTACIONES", [
    item("Navigo primera fragancia", firstArm?.studyProduct?.internalCode ? "OK" : "BLOCKED", firstArm?.studyProduct?.internalCode ? "Existe" : "Falta"),
    item("Navigo segunda fragancia", secondArm?.studyProduct?.internalCode ? "OK" : "BLOCKED", secondArm?.studyProduct?.internalCode ? "Existe" : "Falta"),
    item("Brazo primera fragancia", firstArm ? "OK" : "BLOCKED", armLabel(firstArm)),
    item("Brazo segunda fragancia", secondArm ? "OK" : "BLOCKED", armLabel(secondArm)),
    item("CTL triangular asignada", triangular ? "OK" : "BLOCKED", triangular ? "SI" : "Falta"),
    item("CTL PR1", triangular?.triangular1Pr1 ? "OK" : "BLOCKED", triangular?.triangular1Pr1 ? "Existe" : "Falta"),
    item("CTL PR2", triangular?.triangular1Pr2 ? "OK" : "BLOCKED", triangular?.triangular1Pr2 ? "Existe" : "Falta"),
    item("CTL PR3", triangular?.triangular1Pr3 ? "OK" : "BLOCKED", triangular?.triangular1Pr3 ? "Existe" : "Falta"),
    item("CTL VERI_1", triangular?.triangular1Verify ? "OK" : "BLOCKED", triangular?.triangular1Verify ? "Existe" : "Falta"),
    item("CTL PR4", triangular?.triangular2Pr1 ? "OK" : "BLOCKED", triangular?.triangular2Pr1 ? "Existe" : "Falta"),
    item("CTL PR5", triangular?.triangular2Pr2 ? "OK" : "BLOCKED", triangular?.triangular2Pr2 ? "Existe" : "Falta"),
    item("CTL PR6", triangular?.triangular2Pr3 ? "OK" : "BLOCKED", triangular?.triangular2Pr3 ? "Existe" : "Falta"),
    item("CTL VERI_2", triangular?.triangular2Verify ? "OK" : "BLOCKED", triangular?.triangular2Verify ? "Existe" : "Falta"),
    item("HUT participante", hutParticipant ? "OK" : "PENDING", hutParticipant ? "Existe" : "No sincronizado"),
    item("HUT registration slot", hutSlot ? "OK" : "PENDING", hutSlot ? hutSlot.status : "Falta"),
    item("HUT EVA1", hutEva1(hutParticipant) ? "OK" : "PENDING", hutEva1(hutParticipant) ? "Existe" : "Falta"),
    item("HUT EVA2", hutEva2(hutParticipant) ? "OK" : "PENDING", hutEva2(hutParticipant) ? "Existe" : "Falta")
  ]);
}

function buildCtlBlock(snapshot: FolioDiagnosticSnapshot): DiagnosticBlock {
  const confirmation = snapshot.confirmation;
  const participant = confirmation?.studyParticipant ?? null;
  const sessions = participant?.ctlSessions ?? [];
  const activeSession = sessions.find((session) => ["PENDING", "IN_PROGRESS"].includes(session.status));
  const completedSession = sessions.find((session) => session.status === "COMPLETED");
  const ctlReady = isCtlAvailable(snapshot);
  const interviewerCode = snapshot.ctlInterviewerCode;
  const codeStatus = ctlInterviewerCodeStatus(interviewerCode, snapshot);

  return block("ctl", "CTL", [
    item("Puede aparecer en CTL", ctlReady ? "OK" : completedSession ? "OK" : "BLOCKED", ctlAvailabilityLabel(snapshot)),
    item("CtlSession activa", activeSession ? "BLOCKED" : "OK", activeSession ? `${activeSession.status} (${activeSession.id})` : "No"),
    item("CtlSession completada", "OK", completedSession ? completedSession.id : "No"),
    item("Codigo IKA", codeStatus.status, codeStatus.value),
    item(
      "Codigo IKA createdByUserId",
      !interviewerCode ? "OK" : interviewerCode.createdByUserId ? "OK" : "BLOCKED",
      !interviewerCode ? "No proporcionado" : interviewerCode.createdByUserId ? "Existe" : "Falta"
    )
  ]);
}

function buildNavigoBlock(snapshot: FolioDiagnosticSnapshot): DiagnosticBlock {
  const participant = snapshot.confirmation?.studyParticipant ?? null;
  const activeToken = participant?.accessTokens.find(
    (token) => token.status === "ACTIVE" && token.expiresAt.getTime() > snapshot.now.getTime()
  );
  const schedulesByCode = new Map(snapshot.schedules.map((schedule) => [schedule.code, schedule]));
  const activitiesByCode = new Map(
    (participant?.activities ?? []).map((activity) => [activity.activitySchedule?.code ?? "", activity])
  );
  const scheduleItems = NAVIGO_ACTIVITY_CODES.map((code) => {
    const schedule = schedulesByCode.get(code);
    return item(`Schedule ${code}`, schedule?.status === "ACTIVE" ? "OK" : "BLOCKED", schedule ? `${schedule.status} / ${schedule.offsetMinutes} min` : "Falta");
  });
  const activityItems = NAVIGO_ACTIVITY_CODES.map((code) => {
    const activity = activitiesByCode.get(code);
    return item(`Actividad ${code}`, activity ? "OK" : "PENDING", activity?.status ?? "No creada");
  });

  return block("navigo", "NAVIGO", [
    item("ParticipantAccessToken", activeToken ? "OK" : "PENDING", activeToken ? "ACTIVE - vigente" : "Falta token activo"),
    item("applicationStartedAt", participant?.applicationStartedAt ? "OK" : "PENDING", participant?.applicationStartedAt?.toISOString() ?? "Pendiente"),
    ...scheduleItems,
    ...activityItems
  ]);
}

function buildHutBlock(snapshot: FolioDiagnosticSnapshot): DiagnosticBlock {
  const hutCandidate = isHutCandidate(snapshot);
  const participant = snapshot.confirmation?.studyParticipant ?? null;
  const hutParticipant = participant?.hutParticipant ?? snapshot.hutParticipantByFolio;
  const hutSlot = hutParticipant?.registrationSlot ?? null;
  const phases = new Map((hutParticipant?.phaseCodes ?? []).map((code) => [code.phase, code]));

  if (!hutCandidate) {
    return block("hut", "HUT", [
      item("Preparado para HUT", "OK", "No aplica: sin HutParticipant")
    ]);
  }

  return block("hut", "HUT", [
    item("Origen HUT", hutParticipant?.origin ? "OK" : "BLOCKED", hutParticipant?.origin ?? "Falta"),
    item("Protocolo HUT", hutParticipant?.protocolVersion ? "OK" : "BLOCKED", hutParticipant?.protocolVersion ?? "Falta"),
    item("HutParticipant vinculado", hutParticipant?.studyParticipantId === participant?.id ? "OK" : "BLOCKED", hutParticipant?.studyParticipantId === participant?.id ? "SI" : "Falta vinculo"),
    item("HutRegistrationSlot", hutSlot ? "OK" : "BLOCKED", hutSlot ? hutSlot.status : "Falta"),
    item("HUT EVA1", hutEva1(hutParticipant) ? "OK" : "BLOCKED", hutEva1(hutParticipant) ? "Existe" : "Falta"),
    item("HUT EVA2", hutEva2(hutParticipant) ? "OK" : "BLOCKED", hutEva2(hutParticipant) ? "Existe" : "Falta"),
    item("Cuestionario HUT", hutParticipant?.questionnaireAttempt ? "OK" : "PENDING", hutParticipant?.questionnaireAttempt?.status ?? "Pendiente"),
    item("PhaseCode COLOCACION", phases.has("COLOCACION") ? "OK" : "BLOCKED", phases.get("COLOCACION")?.status ?? "Falta"),
    item("PhaseCode REGRESO_1", phases.has("REGRESO_1") ? "OK" : "BLOCKED", phases.get("REGRESO_1")?.status ?? "Falta"),
    item("PhaseCode REGRESO_2", phases.has("REGRESO_2") ? "OK" : "BLOCKED", phases.get("REGRESO_2")?.status ?? "Falta"),
    item("Preparado para HUT", hutParticipant && hutSlot && hutEva1(hutParticipant) && hutEva2(hutParticipant) && phases.has("COLOCACION") && phases.has("REGRESO_1") && phases.has("REGRESO_2") ? "OK" : "BLOCKED", hutParticipant ? "Ver detalle de fases" : "No")
  ]);
}

function buildTechnicalDetails(snapshot: FolioDiagnosticSnapshot): FolioTechnicalDetails {
  const participant = snapshot.confirmation?.studyParticipant ?? null;
  const arms = participant?.rotationAssignment?.arms ?? [];
  const firstArm = arms.find((arm) => arm.applicationOrder === 1) ?? null;
  const secondArm = arms.find((arm) => arm.applicationOrder === 2) ?? null;
  const sessionSnapshot = resolveCtlSessionTriangularSnapshot(participant?.ctlSessions ?? []);
  const assignment = participant?.ctlTriangularRotationAssignment ?? null;
  const triangular = sessionSnapshot?.triangular ?? assignment;
  const hutParticipant = participant?.hutParticipant ?? snapshot.hutParticipantByFolio;
  const hutSlot = hutParticipant?.registrationSlot ?? null;

  return {
    ctlTriangular: {
      source: sessionSnapshot
        ? "CtlSession snapshot"
        : assignment
          ? "CtlTriangularRotationAssignment"
          : participant?.ctlSessions.length
            ? "Sin snapshot"
            : "No importado",
      triangular1: {
        pr1: triangular?.triangular1Pr1 ?? null,
        pr2: triangular?.triangular1Pr2 ?? null,
        pr3: triangular?.triangular1Pr3 ?? null,
        veri1: triangular?.triangular1Verify ?? null
      },
      triangular2: {
        pr4: triangular?.triangular2Pr1 ?? null,
        pr5: triangular?.triangular2Pr2 ?? null,
        pr6: triangular?.triangular2Pr3 ?? null,
        veri2: triangular?.triangular2Verify ?? null
      }
    },
    hut: {
      eva1: hutEva1(hutParticipant),
      eva2: hutEva2(hutParticipant),
      source: hutSlot
        ? "HutRegistrationSlot"
        : hutParticipant?.firstFragranceLeftArm || hutParticipant?.secondFragranceRightArm
          ? "HutParticipant"
          : "No importado"
    },
    navigo: {
      firstFragrance: firstArm?.studyProduct?.internalCode ?? null,
      firstFragranceArm: armLabelOrNull(firstArm),
      firstFragranceApplicationOrder: firstArm?.applicationOrder ?? null,
      source: participant?.rotationAssignment ? "ParticipantRotationAssignment" : "No asignado",
      secondFragrance: secondArm?.studyProduct?.internalCode ?? null,
      secondFragranceArm: armLabelOrNull(secondArm),
      secondFragranceApplicationOrder: secondArm?.applicationOrder ?? null
    }
  };
}

function toParticipantReadinessInput(snapshot: FolioDiagnosticSnapshot): ParticipantReadinessInput {
  const participant = snapshot.confirmation?.studyParticipant ?? null;
  const hutParticipant = participant?.hutParticipant ?? snapshot.hutParticipantByFolio ?? null;

  return {
    accessTokens: participant?.accessTokens.map((token) => ({
      expiresAt: token.expiresAt,
      status: token.status
    })) ?? [],
    activities: participant?.activities.map((activity) => ({
      activitySchedule: activity.activitySchedule
        ? {
            code: activity.activitySchedule.code
          }
        : null,
      status: activity.status
    })) ?? [],
    applicationStartedAt: participant?.applicationStartedAt ?? null,
    ctlSessions: participant?.ctlSessions.map((session) => ({ status: session.status })) ?? [],
    ctlTriangularRotationAssignment: participant?.ctlTriangularRotationAssignment ?? null,
    hutParticipant: hutParticipant
      ? {
          firstFragranceLeftArm: hutParticipant.firstFragranceLeftArm,
          folio: null,
          id: hutParticipant.id,
          name: snapshot.folio,
          origin: hutParticipant.origin,
          phaseCodes: hutParticipant.phaseCodes.map((code) => ({
            phase: code.phase,
            status: code.status
          })),
          protocolVersion: hutParticipant.protocolVersion,
          questionnaireAttempt: hutParticipant.questionnaireAttempt
            ? {
                status: hutParticipant.questionnaireAttempt.status,
                visits: []
              }
            : null,
          secondFragranceRightArm: hutParticipant.secondFragranceRightArm,
          status: hutParticipant.status,
          studyParticipantId: hutParticipant.studyParticipantId
        }
      : null,
    id: participant?.id ?? null,
    operationalStatus: null,
    participantConfirmation: snapshot.confirmation
      ? {
          referenceCodes: snapshot.confirmation.referenceCodes.map((code) => ({ slot: code.slot })),
          screeningAttempt: {
            status: snapshot.confirmation.screeningAttempt.status
          }
        }
      : null,
    participantScreeningReviews: [],
    rotationAssignment: participant?.rotationAssignment
      ? {
          arms: participant.rotationAssignment.arms.map((arm) => ({
            applicationOrder: arm.applicationOrder,
            studyProduct: {
              internalCode: arm.studyProduct?.internalCode ?? null
            }
          }))
        }
      : null,
    screeningStatus: participant?.screeningStatus ?? null
  };
}

function resolveCtlSessionTriangularSnapshot(
  sessions: CtlSessionSnapshot[]
): { triangular: CtlTriangularSnapshot } | null {
  for (const session of sessions) {
    const triangular = parseCtlTriangularSnapshot(session.triangularRotationSnapshot);
    if (triangular) {
      return { triangular };
    }
  }

  return null;
}

function parseCtlTriangularSnapshot(value: unknown): CtlTriangularSnapshot | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as {
    triangular1?: { pr1?: unknown; pr2?: unknown; pr3?: unknown; verify?: unknown };
    triangular2?: { pr1?: unknown; pr2?: unknown; pr3?: unknown; verify?: unknown };
  };

  const triangular1Pr1 = stringOrNull(candidate.triangular1?.pr1);
  const triangular1Pr2 = stringOrNull(candidate.triangular1?.pr2);
  const triangular1Pr3 = stringOrNull(candidate.triangular1?.pr3);
  const triangular1Verify = stringOrNull(candidate.triangular1?.verify);
  const triangular2Pr1 = stringOrNull(candidate.triangular2?.pr1);
  const triangular2Pr2 = stringOrNull(candidate.triangular2?.pr2);
  const triangular2Pr3 = stringOrNull(candidate.triangular2?.pr3);
  const triangular2Verify = stringOrNull(candidate.triangular2?.verify);

  if (
    !triangular1Pr1 ||
    !triangular1Pr2 ||
    !triangular1Pr3 ||
    !triangular1Verify ||
    !triangular2Pr1 ||
    !triangular2Pr2 ||
    !triangular2Pr3 ||
    !triangular2Verify
  ) {
    return null;
  }

  return {
    triangular1Pr1,
    triangular1Pr2,
    triangular1Pr3,
    triangular1Verify,
    triangular2Pr1,
    triangular2Pr2,
    triangular2Pr3,
    triangular2Verify
  };
}

function isCtlAvailable(snapshot: FolioDiagnosticSnapshot): boolean {
  const confirmation = snapshot.confirmation;
  const participant = confirmation?.studyParticipant;
  if (!confirmation || !participant) {
    return false;
  }

  const arms = participant.rotationAssignment?.arms ?? [];
  const hasCompleteRotation =
    Boolean(arms.find((arm) => arm.applicationOrder === 1)?.studyProduct?.internalCode) &&
    Boolean(arms.find((arm) => arm.applicationOrder === 2)?.studyProduct?.internalCode);
  const hasBlockingSession = participant.ctlSessions.some((session) =>
    ["PENDING", "IN_PROGRESS", "COMPLETED"].includes(session.status)
  );

  return (
    confirmation.screeningAttempt.status === "PASSED" &&
    participant.screeningStatus === "PASSED" &&
    hasCompleteRotation &&
    Boolean(participant.ctlTriangularRotationAssignment) &&
    !hasBlockingSession
  );
}

function ctlAvailabilityLabel(snapshot: FolioDiagnosticSnapshot): string {
  const confirmation = snapshot.confirmation;
  const participant = confirmation?.studyParticipant;
  if (!confirmation || !participant) {
    return "NO - falta participante/folio";
  }
  if (confirmation.screeningAttempt.status !== "PASSED") {
    return `NO - screening ${confirmation.screeningAttempt.status}`;
  }
  if (participant.screeningStatus !== "PASSED") {
    return `NO - participante ${participant.screeningStatus}`;
  }
  const arms = participant.rotationAssignment?.arms ?? [];
  if (!arms.find((arm) => arm.applicationOrder === 1)?.studyProduct?.internalCode) {
    return "NO - falta primera fragancia Navigo";
  }
  if (!arms.find((arm) => arm.applicationOrder === 2)?.studyProduct?.internalCode) {
    return "NO - falta segunda fragancia Navigo";
  }
  if (!participant.ctlTriangularRotationAssignment) {
    return "NO - falta rotacion triangular CTL";
  }
  const blockingSession = participant.ctlSessions.find((session) =>
    ["PENDING", "IN_PROGRESS", "COMPLETED"].includes(session.status)
  );
  if (blockingSession) {
    return `NO - CTL ${blockingSession.status}`;
  }

  return "SI";
}

function ctlInterviewerCodeStatus(
  interviewerCode: CtlInterviewerCodeSnapshot | null,
  snapshot: FolioDiagnosticSnapshot
): DiagnosticItem {
  if (!interviewerCode) {
    return item("Codigo IKA", "OK", "No proporcionado");
  }
  if (!snapshot.study || interviewerCode.studyId !== snapshot.study.id) {
    return item("Codigo IKA", "BLOCKED", "No pertenece al estudio");
  }
  if (interviewerCode.status !== "ACTIVE") {
    return item("Codigo IKA", "BLOCKED", interviewerCode.status);
  }
  if (interviewerCode.expiresAt && interviewerCode.expiresAt <= snapshot.now) {
    return item("Codigo IKA", "BLOCKED", "Expirado");
  }

  return item("Codigo IKA", "OK", `Activo - ${interviewerCode.label}`);
}

function isHutCandidate(snapshot: FolioDiagnosticSnapshot): boolean {
  const participant = snapshot.confirmation?.studyParticipant ?? null;
  const hutParticipant = participant?.hutParticipant ?? snapshot.hutParticipantByFolio;

  return Boolean(hutParticipant);
}

function buildSuggestions(blocks: DiagnosticBlock[]): string[] {
  const suggestions: string[] = [];
  for (const block of blocks) {
    for (const item of block.items) {
      if (item.status === "BLOCKED") {
        suggestions.push(`${item.label}: ${item.value}`);
      }
    }
  }
  if (suggestions.length === 0) {
    suggestions.push("CTL listo para reclamar o flujo listo para continuar segun etapa actual.");
  }

  return suggestions;
}

function block(id: DiagnosticBlock["id"], title: string, items: DiagnosticItem[]): DiagnosticBlock {
  return {
    id,
    items,
    status: items.some((candidate) => candidate.status === "BLOCKED")
      ? "BLOCKED"
      : items.some((candidate) => candidate.status === "PENDING")
        ? "PENDING"
        : "OK",
    title
  };
}

function item(label: string, status: DiagnosticStatus, value: string): DiagnosticItem {
  return { label, status, value };
}

function armLabel(arm: RotationArmSnapshot | null): string {
  if (!arm) {
    return "Falta";
  }

  return arm.studyArm?.label ?? arm.participantVisibleLabel ?? `Orden ${arm.applicationOrder}`;
}

function armLabelOrNull(arm: RotationArmSnapshot | null): string | null {
  return arm ? armLabel(arm) : null;
}

function hutEva1(participant: HutParticipantSnapshot | null | undefined): string | null {
  return participant?.firstFragranceLeftArm ?? participant?.registrationSlot?.firstFragranceLeftArm ?? null;
}

function hutEva2(participant: HutParticipantSnapshot | null | undefined): string | null {
  return participant?.secondFragranceRightArm ?? participant?.registrationSlot?.secondFragranceRightArm ?? null;
}

function normalizeDiagnosticCode(value: string): string {
  return value.trim().toUpperCase();
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

const hutParticipantDiagnosticSelect = {
  firstFragranceLeftArm: true,
  id: true,
  origin: true,
  phaseCodes: {
    orderBy: { slot: "asc" },
    select: {
      phase: true,
      slot: true,
      status: true
    }
  },
  protocolVersion: true,
  questionnaireAttempt: {
    select: { status: true }
  },
  registrationSlot: {
    select: {
      firstFragranceLeftArm: true,
      secondFragranceRightArm: true,
      status: true
    }
  },
  secondFragranceRightArm: true,
  status: true,
  studyParticipantId: true
} as const;

const confirmationDiagnosticSelect = {
  folio: true,
  referenceCodes: {
    orderBy: { slot: "asc" },
    select: { slot: true }
  },
  screeningAttempt: {
    select: {
      answers: {
        select: {
          answerJson: true,
          questionId: true
        },
        where: { questionId: NAVIGO_HUT_ACCESS_QUESTION_ID }
      },
      id: true,
      status: true
    }
  },
  studyParticipant: {
    select: {
      accessTokens: {
        orderBy: { createdAt: "desc" },
        select: {
          expiresAt: true,
          id: true,
          status: true
        }
      },
      activities: {
        select: {
          activitySchedule: {
            select: { code: true }
          },
          status: true
        }
      },
      applicationStartedAt: true,
      ctlSessions: {
        orderBy: { createdAt: "desc" },
        select: {
          ctlInterviewerCodeId: true,
          id: true,
          status: true,
          triangularRotationSnapshot: true
        }
      },
      ctlTriangularRotationAssignment: {
        select: {
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
      hutParticipant: {
        select: hutParticipantDiagnosticSelect
      },
      id: true,
      participantProfile: {
        select: { name: true }
      },
      rotationAssignment: {
        select: {
          arms: {
            orderBy: { applicationOrder: "asc" },
            select: {
              applicationOrder: true,
              participantVisibleLabel: true,
              studyArm: { select: { label: true } },
              studyProduct: { select: { internalCode: true } }
            }
          },
          rotationCode: true
        }
      },
      screeningStatus: true
    }
  }
} as const;
