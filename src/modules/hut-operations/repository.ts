import { createPrismaClient, type PrismaClientLike } from "@/shared/db/client";
import {
  buildHutPhotoTimeline,
  resolveHutOperationalStatusLabel
} from "@/modules/hut";
import {
  buildHutAnswerGroups,
  getHutQuestionCount,
  latestTimelineDate,
  resolveHutQuestionnaireProgress
} from "./service";
import type {
  HutOperationsDashboard,
  HutOperationsDetail,
  HutOperationsPhotoSummary,
  HutOperationsRotationSummary,
  HutOperationsTimelineItem
} from "./types";

type Delegate = {
  findMany?: (args: unknown) => Promise<unknown[]>;
  findUnique?: (args: unknown) => Promise<unknown>;
};

type HutOperationsPrismaClient = PrismaClientLike & {
  hutParticipant: Delegate;
  study: Delegate;
};

export type HutOperationsRepository = {
  getDashboard: (input: {
    detailParticipantId?: string | null;
    studyId: string;
  }) => Promise<HutOperationsDashboard | null>;
};

export function createHutOperationsRepository(prismaClient?: HutOperationsPrismaClient): HutOperationsRepository {
  async function getPrisma() {
    return prismaClient ?? ((await createPrismaClient()) as HutOperationsPrismaClient);
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

      const participants = await prisma.hutParticipant.findMany?.({
        orderBy: [
          { updatedAt: "desc" },
          { createdAt: "desc" }
        ],
        select: hutParticipantSelect,
        where: {
          qaParticipantRun: { is: null },
          studyId: input.studyId
        }
      }) as HutParticipantRecord[] | undefined;
      const details = (participants ?? []).map(toDetail);

      return {
        detail: input.detailParticipantId
          ? details.find((participant) => participant.id === input.detailParticipantId) ?? null
          : null,
        participants: details,
        study
      };
    }
  };
}

const hutParticipantSelect = {
  applicationEvidence: {
    orderBy: [
      { capturedAt: "asc" }
    ],
    select: {
      capturedAt: true,
      phase: true,
      productCode: true
    }
  },
  applicationPhotoEntries: {
    orderBy: [
      { capturedAt: "desc" }
    ],
    select: {
      capturedAt: true,
      capturedLocalDate: true,
      productCode: true,
      useDayNumber: true
    }
  },
  createdAt: true,
  email: true,
  firstFragranceLeftArm: true,
  folio: true,
  id: true,
  name: true,
  origin: true,
  phaseCodes: {
    orderBy: { slot: "asc" },
    select: {
      expiresAt: true,
      phase: true,
      sentAt: true,
      slot: true,
      status: true,
      usedAt: true,
      validatedAt: true
    }
  },
  phone: true,
  protocolVersion: true,
  questionnaireAttempt: {
    select: {
      answers: {
        orderBy: { questionCode: "asc" },
        select: {
          answerJson: true,
          answeredAt: true,
          questionCode: true,
          visitProgress: {
            select: {
              section: true
            }
          }
        }
      },
      completedAt: true,
      createdAt: true,
      startedAt: true,
      status: true,
      terminatedAt: true,
      terminationReason: true,
      updatedAt: true,
      visits: {
        orderBy: { createdAt: "asc" },
        select: {
          completedAt: true,
          section: true,
          startedAt: true,
          status: true,
          updatedAt: true
        }
      }
    }
  },
  secondFragranceRightArm: true,
  status: true,
  studyParticipant: {
    select: {
      accessTokens: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true
        }
      },
      participantConfirmation: {
        select: {
          folio: true
        }
      },
      rotationAssignment: {
        select: {
          rotationCode: true
        }
      }
    }
  },
  updatedAt: true
} as const;

type StudyRecord = {
  code: string;
  id: string;
  name: string;
  timeZoneIana: string;
};

type HutParticipantRecord = {
  applicationEvidence: Array<{
    capturedAt: Date;
    phase: "COLOCACION" | "REGRESO_1" | "REGRESO_2";
    productCode: string | null;
  }>;
  applicationPhotoEntries: Array<{
    capturedAt: Date;
    capturedLocalDate: string;
    productCode: string | null;
    useDayNumber: number;
  }>;
  createdAt: Date;
  email: string | null;
  firstFragranceLeftArm: string | null;
  folio: string | null;
  id: string;
  name: string;
  origin: string;
  phaseCodes: Array<{
    expiresAt: Date | null;
    phase: string;
    sentAt: Date | null;
    slot: number;
    status: string;
    usedAt: Date | null;
    validatedAt: Date | null;
  }>;
  phone: string | null;
  protocolVersion: string;
  questionnaireAttempt: {
    answers: Array<{
      answerJson: unknown;
      answeredAt: Date;
      questionCode: string;
      visitProgress: {
        section: string;
      } | null;
    }>;
    completedAt: Date | null;
    createdAt: Date;
    startedAt: Date | null;
    status: string;
    terminatedAt: Date | null;
    terminationReason: string | null;
    updatedAt: Date;
    visits: Array<{
      completedAt: Date | null;
      section: string;
      startedAt: Date | null;
      status: string;
      updatedAt: Date;
    }>;
  } | null;
  secondFragranceRightArm: string | null;
  status: string;
  studyParticipant: {
    accessTokens: Array<{
      id: string;
      status: string;
    }>;
    participantConfirmation: {
      folio: string;
    } | null;
    rotationAssignment: {
      rotationCode: string;
    } | null;
  } | null;
  updatedAt: Date;
};

function toDetail(participant: HutParticipantRecord): HutOperationsDetail {
  const answerCount = participant.questionnaireAttempt?.answers.length ?? 0;
  const questionCount = getHutQuestionCount();
  const visits = participant.questionnaireAttempt?.visits.map((visit) => ({
    completedAt: visit.completedAt,
    section: visit.section,
    startedAt: visit.startedAt,
    status: visit.status
  })) ?? [];
  const photos = toPhotos(participant);
  const photoTimeline = buildHutPhotoTimeline({
    applicationEvidence: participant.applicationEvidence,
    dailyEntries: participant.applicationPhotoEntries,
    rotation: {
      eva1: participant.firstFragranceLeftArm,
      eva2: participant.secondFragranceRightArm
    }
  });
  const timeline = buildTimeline(participant);
  const rotation = toRotation(participant);

  return {
    answerGroups: buildHutAnswerGroups(participant.questionnaireAttempt?.answers ?? []),
    currentPhase: resolveCurrentPhase(participant),
    hutFolio: participant.folio ?? "Sin folio",
    id: participant.id,
    lastActivityAt: latestTimelineDate(timeline),
    navFolio: participant.studyParticipant?.participantConfirmation?.folio ?? null,
    navigo: {
      activeTokenId: participant.studyParticipant?.accessTokens.find((token) => token.status === "ACTIVE")?.id ?? null,
      rotation
    },
    origin: participant.origin,
    participant: {
      email: participant.email,
      name: participant.name,
      phone: participant.phone
    },
    phaseCodes: participant.phaseCodes,
    photoTimeline,
    photoCount: photoTimeline.filter((slot) => slot.evidence).length,
    photos,
    protocolVersion: participant.protocolVersion,
    questionnaireProgressLabel: resolveHutQuestionnaireProgress(answerCount, questionCount),
    questionnaireStatus: participant.questionnaireAttempt?.status ?? null,
    rotation,
    timeline,
    visits
  };
}

function resolveCurrentPhase(participant: HutParticipantRecord): string {
  const pendingPhase = participant.phaseCodes.find((code) => !["USED", "VALIDATED"].includes(code.status));

  if (pendingPhase) {
    const timeline = buildHutPhotoTimeline({
      availablePhase: pendingPhase.phase as "COLOCACION" | "REGRESO_1" | "REGRESO_2",
      rotation: {
        eva1: participant.firstFragranceLeftArm,
        eva2: participant.secondFragranceRightArm
      }
    });
    return timeline.find((slot) => slot.status === "CURRENT")?.title ?? pendingPhase.phase;
  }

  const activeVisit = participant.questionnaireAttempt?.visits.find((visit) => visit.status !== "COMPLETED");
  if (activeVisit) {
    return activeVisit.section;
  }

  return participant.questionnaireAttempt?.status === "COMPLETED" ? "COMPLETADO" : resolveHutOperationalStatusLabel(participant.status);
}

function toRotation(participant: HutParticipantRecord): HutOperationsRotationSummary {
  return {
    hutEva1: participant.firstFragranceLeftArm,
    hutEva2: participant.secondFragranceRightArm,
    navigoRotationCode: participant.studyParticipant?.rotationAssignment?.rotationCode ?? null
  };
}

function toPhotos(participant: HutParticipantRecord): HutOperationsPhotoSummary[] {
  const phasePhotos = participant.applicationEvidence.map((photo) => ({
    capturedAt: photo.capturedAt,
    capturedLocalDate: "",
    phase: photo.phase,
    productCode: photo.productCode,
    source: "PHASE_EVIDENCE" as const,
    useDayNumber: 0
  }));
  const dailyPhotos = participant.applicationPhotoEntries.map((photo) => ({
    capturedAt: photo.capturedAt,
    capturedLocalDate: photo.capturedLocalDate,
    phase: null,
    productCode: photo.productCode,
    source: "DAILY_ENTRY" as const,
    useDayNumber: photo.useDayNumber
  }));

  return [...phasePhotos, ...dailyPhotos].sort((left, right) => left.capturedAt.getTime() - right.capturedAt.getTime());
}

function buildTimeline(participant: HutParticipantRecord): HutOperationsTimelineItem[] {
  const timeline: HutOperationsTimelineItem[] = [
    { at: participant.createdAt, label: "Participante HUT creado" },
    { at: participant.updatedAt, label: "Participante HUT actualizado" }
  ];

  for (const code of participant.phaseCodes) {
    if (code.sentAt) {
      timeline.push({ at: code.sentAt, label: `${code.phase}: codigo enviado` });
    }
    if (code.validatedAt) {
      timeline.push({ at: code.validatedAt, label: `${code.phase}: codigo validado` });
    }
    if (code.usedAt) {
      timeline.push({ at: code.usedAt, label: `${code.phase}: codigo usado` });
    }
  }

  if (participant.questionnaireAttempt) {
    timeline.push({ at: participant.questionnaireAttempt.createdAt, label: "Cuestionario HUT creado" });
    timeline.push({ at: participant.questionnaireAttempt.updatedAt, label: "Cuestionario HUT actualizado" });
    if (participant.questionnaireAttempt.startedAt) {
      timeline.push({ at: participant.questionnaireAttempt.startedAt, label: "Cuestionario HUT iniciado" });
    }
    if (participant.questionnaireAttempt.completedAt) {
      timeline.push({ at: participant.questionnaireAttempt.completedAt, label: "Cuestionario HUT completado" });
    }
    if (participant.questionnaireAttempt.terminatedAt) {
      timeline.push({ at: participant.questionnaireAttempt.terminatedAt, label: "Cuestionario HUT terminado" });
    }

    for (const visit of participant.questionnaireAttempt.visits) {
      if (visit.startedAt) {
        timeline.push({ at: visit.startedAt, label: `${visit.section}: iniciado` });
      }
      if (visit.completedAt) {
        timeline.push({ at: visit.completedAt, label: `${visit.section}: completado` });
      }
      timeline.push({ at: visit.updatedAt, label: `${visit.section}: actualizado` });
    }

    for (const answer of participant.questionnaireAttempt.answers) {
      timeline.push({ at: answer.answeredAt, label: `${answer.questionCode}: respuesta guardada` });
    }
  }

  for (const photo of participant.applicationPhotoEntries) {
    timeline.push({ at: photo.capturedAt, label: `Foto dia ${photo.useDayNumber} capturada` });
  }

  return timeline.sort((left, right) => right.at.getTime() - left.at.getTime());
}
