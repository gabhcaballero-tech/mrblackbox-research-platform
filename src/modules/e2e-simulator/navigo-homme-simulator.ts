import { createCtlRepository } from "@/modules/ctl/repository";
import { saveFieldScreeningAnswer, startFieldScreeningAttempt } from "@/modules/field/service";
import { createHutRepository } from "@/modules/hut";
import {
  NAVIGO_ACTIVITY_CODES,
  createNavigoAppRepository,
  prepareNavigoParticipantActivities
} from "@/modules/navigo-app";
import { applyStudyScreenerDefinitionOverrides, NAVIGO_HUT_ACCESS_QUESTION_ID } from "@/modules/screener/study-overrides";
import { parseScreenerDefinition } from "@/modules/screener";
import { createPrismaClient, type PrismaClientLike } from "@/shared/db/client";
import {
  createDefaultNavigoHommeSimulationClock,
  previewNavigoActivitySchedule,
  type SimulationClock
} from "./clock";
import { createNavigoHommeSimulationFixtures, NAVIGO_HOMME_SIMULATION_STUDY_CODE } from "./fixtures";
import {
  createSimulationReportSection,
  summarizeSimulationChecks,
  summarizeSimulationSections
} from "./report";
import type {
  NavigoHommePhase2Report,
  NavigoHommePrecheckReport,
  NavigoHommePrecheckStudy,
  NavigoHommeSimulationExecutionPort,
  NavigoHommeSimulationFixtures,
  NavigoHommeSimulationParticipantResult,
  NavigoHommeSimulationReadinessResult,
  NavigoHommeSimulationRotationResult,
  NavigoHommeSimulatorRepository,
  NavigoHommeSimulatorServiceCatalog,
  SimulationCheck,
  SimulationReportSection
} from "./types";

type RunNavigoHommePrecheckInput = {
  fixtures?: NavigoHommeSimulationFixtures;
  now?: Date;
  repository?: NavigoHommeSimulatorRepository;
  serviceCatalog?: NavigoHommeSimulatorServiceCatalog;
  studyCode?: string;
};

type RunNavigoHommePhase2Input = RunNavigoHommePrecheckInput & {
  clock?: SimulationClock;
  executor: NavigoHommeSimulationExecutionPort;
};

type StudyReadClient = PrismaClientLike & {
  study: {
    findUnique: (args: unknown) => Promise<{
      code: string;
      id: string;
      name: string;
      questionnaireVersions: Array<{ definitionJson: unknown }>;
      status: string;
    } | null>;
  };
};

export async function runNavigoHommeSimulationPrecheck({
  fixtures = createNavigoHommeSimulationFixtures(),
  now = new Date(),
  repository = createE2ESimulatorReadRepository(),
  serviceCatalog = createDefaultSimulatorServiceCatalog(),
  studyCode = NAVIGO_HOMME_SIMULATION_STUDY_CODE
}: RunNavigoHommePrecheckInput = {}): Promise<NavigoHommePrecheckReport> {
  const study = await repository.getStudyByCode(studyCode);
  const screenerResult = resolveScreenerPrecheck(study);
  const sections = [
    createSimulationReportSection("ESTUDIO", [
      {
        code: "study.exists",
        detail: study ? `${study.name} (${study.status})` : undefined,
        label: `${studyCode} existe`,
        status: study ? "OK" : "BLOCKED"
      }
    ]),
    createSimulationReportSection("SCREENING", screenerResult.checks),
    createSimulationReportSection("ROTACIONES", createRotationChecks(fixtures)),
    createSimulationReportSection("CTL", createCtlServiceChecks(serviceCatalog)),
    createSimulationReportSection("NAVIGO", createNavigoServiceChecks(serviceCatalog)),
    createSimulationReportSection("HUT", createHutServiceChecks(serviceCatalog))
  ];

  return {
    fixtures,
    generatedAt: now,
    screenerDefinition: screenerResult.definition,
    sections,
    simulationMode: true,
    status: summarizeSimulationSections(sections),
    study,
    studyCode
  };
}

export async function runNavigoHommeSimulationPhase2({
  clock = createDefaultNavigoHommeSimulationClock(),
  executor,
  fixtures = createNavigoHommeSimulationFixtures(),
  now = clock.now(),
  repository = createE2ESimulatorReadRepository(),
  serviceCatalog = createDefaultSimulatorServiceCatalog(),
  studyCode = NAVIGO_HOMME_SIMULATION_STUDY_CODE
}: RunNavigoHommePhase2Input): Promise<NavigoHommePhase2Report> {
  const precheck = await runNavigoHommeSimulationPrecheck({
    fixtures,
    now,
    repository,
    serviceCatalog,
    studyCode
  });
  const activitySchedulePreview = previewNavigoActivitySchedule(clock);

  if (precheck.status === "BLOCKED" || !precheck.study) {
    const sections = createPhase2Sections({
      participant: null,
      readiness: null,
      rotations: null,
      precheckBlocked: true
    });

    return {
      activitySchedulePreview,
      fixtures,
      generatedAt: now,
      participant: null,
      precheck,
      readiness: null,
      rotations: null,
      sections,
      simulationMode: true,
      status: summarizeSimulationSections(sections),
      studyCode
    };
  }

  const participant = await executor.createScreeningParticipant({
    clock,
    fixtures,
    study: precheck.study
  });
  const rotations = await executor.applyRotationFixtures({
    clock,
    fixtures,
    participant,
    study: precheck.study
  });
  const readiness = await executor.validateInitialReadiness({
    clock,
    fixtures,
    participant,
    rotations,
    study: precheck.study
  });
  const sections = createPhase2Sections({
    participant,
    readiness,
    rotations,
    precheckBlocked: false
  });

  return {
    activitySchedulePreview,
    fixtures,
    generatedAt: now,
    participant,
    precheck,
    readiness,
    rotations,
    sections,
    simulationMode: true,
    status: summarizeSimulationSections(sections),
    studyCode
  };
}

export function createDefaultSimulatorServiceCatalog(): NavigoHommeSimulatorServiceCatalog {
  const ctlRepository = createCtlRepository();
  const hutRepository = createHutRepository();
  const navigoRepository = createNavigoAppRepository();

  return {
    ctl: {
      canClaimFolio: typeof ctlRepository.claimFolioForInterviewerCode === "function",
      canCompleteCtl: typeof ctlRepository.saveAnswers === "function",
      canCreateInterviewerCode: typeof ctlRepository.createInterviewerCode === "function",
      canSaveAnswers: typeof ctlRepository.saveAnswers === "function"
    },
    hut: {
      canCreateParticipant: typeof hutRepository.createParticipant === "function",
      canCreateRegistrationSlot: typeof hutRepository.createRegistrationSlot === "function",
      canEnsurePhaseCodes: typeof hutRepository.ensureHutPhaseCodesForParticipant === "function",
      canValidatePhase: typeof hutRepository.validatePhaseCode === "function"
    },
    navigo: {
      canCreateActivities: typeof prepareNavigoParticipantActivities === "function" && NAVIGO_ACTIVITY_CODES.length === 3,
      canCreateToken: typeof navigoRepository.generateParticipantLink === "function",
      canRegisterInitialApplication: typeof navigoRepository.registerInitialApplication === "function",
      canReleaseParticipant: typeof navigoRepository.releaseParticipantAfterCtl === "function"
    },
    screening: {
      canCreateAttempt: typeof startFieldScreeningAttempt === "function",
      canSaveAnswers: typeof saveFieldScreeningAnswer === "function"
    }
  };
}

export function createE2ESimulatorReadRepository(): NavigoHommeSimulatorRepository {
  return {
    async getStudyByCode(studyCode) {
      const prisma = (await createPrismaClient()) as StudyReadClient;
      const study = await prisma.study.findUnique({
        select: {
          code: true,
          id: true,
          name: true,
          questionnaireVersions: {
            orderBy: {
              versionNumber: "desc"
            },
            select: {
              definitionJson: true
            },
            take: 1,
            where: {
              status: "ACTIVE"
            }
          },
          status: true
        },
        where: {
          code: studyCode
        }
      });

      if (!study) {
        return null;
      }

      return {
        activeScreenerDefinitionJson: study.questionnaireVersions[0]?.definitionJson ?? null,
        code: study.code,
        id: study.id,
        name: study.name,
        status: study.status
      };
    }
  };
}

function resolveScreenerPrecheck(study: NavigoHommePrecheckStudy | null): {
  checks: SimulationCheck[];
  definition: NavigoHommePrecheckReport["screenerDefinition"];
} {
  if (!study) {
    return {
      checks: [
        {
          code: "screener.study_missing",
          label: "Definicion del screener disponible",
          status: "BLOCKED"
        }
      ],
      definition: null
    };
  }

  if (!study.activeScreenerDefinitionJson) {
    return {
      checks: [
        {
          code: "screener.definition_missing",
          label: "Definicion del screener disponible",
          status: "BLOCKED"
        }
      ],
      definition: null
    };
  }

  try {
    const definition = applyStudyScreenerDefinitionOverrides(
      study.code,
      parseScreenerDefinition(study.activeScreenerDefinitionJson)
    );
    const hasHutQuestion = definition.questions.some((question) => question.id === NAVIGO_HUT_ACCESS_QUESTION_ID);

    return {
      checks: [
        {
          code: "screener.definition_available",
          detail: `${definition.questions.length} preguntas`,
          label: "Definicion del screener disponible",
          status: "OK"
        },
        {
          code: "screener.hut_access_question",
          label: `Pregunta ${NAVIGO_HUT_ACCESS_QUESTION_ID} existe`,
          status: hasHutQuestion ? "OK" : "BLOCKED"
        }
      ],
      definition
    };
  } catch (error) {
    return {
      checks: [
        {
          code: "screener.definition_invalid",
          detail: error instanceof Error ? error.message : "No fue posible parsear la definicion",
          label: "Definicion del screener disponible",
          status: "BLOCKED"
        }
      ],
      definition: null
    };
  }
}

function createRotationChecks(fixtures: NavigoHommeSimulationFixtures): SimulationCheck[] {
  const { ctl, hut } = fixtures.rotations;

  return [
    {
      code: "rotation.navigo",
      detail: `${ctl.primeraFragancia} / ${ctl.segundaFragancia}`,
      label: "Fixture Navigo EVA1/EVA2",
      status: ctl.primeraFragancia && ctl.segundaFragancia ? "OK" : "BLOCKED"
    },
    {
      code: "rotation.ctl_triangular",
      detail: `T1 ${ctl.triangular1Pr1}-${ctl.triangular1Pr2}-${ctl.triangular1Pr3}; T2 ${ctl.triangular2Pr1}-${ctl.triangular2Pr2}-${ctl.triangular2Pr3}`,
      label: "Fixture CTL PR1-PR6 y VERI",
      status: hasCompleteCtlRotationFixture(fixtures) ? "OK" : "BLOCKED"
    },
    {
      code: "rotation.hut",
      detail: `${hut.hutEva1} / ${hut.hutEva2}`,
      label: "Fixture HUT EVA1/EVA2",
      status: hut.hutEva1 && hut.hutEva2 ? "OK" : "BLOCKED"
    }
  ];
}

function createCtlServiceChecks(catalog: NavigoHommeSimulatorServiceCatalog): SimulationCheck[] {
  return [
    serviceCheck("ctl.create_interviewer_code", "Crear encuestador IKA", catalog.ctl.canCreateInterviewerCode),
    serviceCheck("ctl.claim_folio", "Reclamar folio CTL", catalog.ctl.canClaimFolio),
    serviceCheck("ctl.save_answers", "Guardar respuestas CTL", catalog.ctl.canSaveAnswers),
    serviceCheck("ctl.complete", "Completar CTL", catalog.ctl.canCompleteCtl)
  ];
}

function createNavigoServiceChecks(catalog: NavigoHommeSimulatorServiceCatalog): SimulationCheck[] {
  return [
    serviceCheck("navigo.release", "Liberar participante desde CTL", catalog.navigo.canReleaseParticipant),
    serviceCheck("navigo.token", "Crear token/link participante", catalog.navigo.canCreateToken),
    serviceCheck(
      "navigo.initial_application",
      "Registrar aplicacion inicial",
      catalog.navigo.canRegisterInitialApplication
    ),
    serviceCheck("navigo.activities", "Crear actividades Navigo", catalog.navigo.canCreateActivities)
  ];
}

function createHutServiceChecks(catalog: NavigoHommeSimulatorServiceCatalog): SimulationCheck[] {
  return [
    serviceCheck("hut.create_participant", "Crear/vincular participante HUT", catalog.hut.canCreateParticipant),
    serviceCheck("hut.registration_slot", "Crear slot HUT", catalog.hut.canCreateRegistrationSlot),
    serviceCheck("hut.phase_codes", "Generar phase codes", catalog.hut.canEnsurePhaseCodes),
    serviceCheck("hut.validate_phase", "Validar fases HUT", catalog.hut.canValidatePhase)
  ];
}

function serviceCheck(code: string, label: string, ok: boolean): SimulationCheck {
  return {
    code,
    label,
    status: ok ? "OK" : "BLOCKED"
  };
}

function createPhase2Sections({
  participant,
  precheckBlocked,
  readiness,
  rotations
}: {
  participant: NavigoHommeSimulationParticipantResult | null;
  precheckBlocked: boolean;
  readiness: NavigoHommeSimulationReadinessResult | null;
  rotations: NavigoHommeSimulationRotationResult | null;
}): SimulationReportSection[] {
  if (precheckBlocked) {
    return [
      createSimulationReportSection("SIMULACION FASE 2", [
        {
          code: "phase2.precheck",
          label: "PRECHECK completo",
          status: "BLOCKED"
        }
      ])
    ];
  }

  return [
    createSimulationReportSection("PARTICIPANTE", [
      {
        code: "phase2.participant",
        detail: participant ? `${participant.participantName} / ${participant.participantId}` : undefined,
        label: "SIM-NAV-001 creado",
        status: participant ? "OK" : "BLOCKED"
      }
    ]),
    createSimulationReportSection("SCREENING", [
      {
        code: "phase2.screening",
        detail: participant?.screeningAttemptId,
        label: "Screening aprobado",
        status: participant?.screeningStatus === "PASSED" ? "OK" : "BLOCKED"
      }
    ]),
    createSimulationReportSection("FOLIO", [
      {
        code: "phase2.folio",
        detail: participant?.folio,
        label: "Folio generado",
        status: participant?.folio ? "OK" : "BLOCKED"
      }
    ]),
    createSimulationReportSection("CODIGOS", [
      {
        code: "phase2.reference_codes",
        detail: participant ? `${participant.referenceCodes.length} slots` : undefined,
        label: "3 codigos generados",
        status: participant?.referenceCodes.length === 3 && participant.referenceCodes.every((code) => code.generated)
          ? "OK"
          : "BLOCKED"
      }
    ]),
    createSimulationReportSection("ROTACION", [
      {
        code: "phase2.rotation.navigo",
        label: "Navigo OK",
        status: rotations?.navigo.ready ? "OK" : "BLOCKED"
      },
      {
        code: "phase2.rotation.ctl",
        label: "CTL OK",
        status: rotations?.ctl.ready ? "OK" : "BLOCKED"
      },
      {
        code: "phase2.rotation.hut",
        label: "HUT OK",
        status: rotations?.hut.ready ? "OK" : "BLOCKED"
      }
    ]),
    createSimulationReportSection("CTL", [
      {
        code: "phase2.ctl.ready",
        detail: readiness?.reasons.join("; "),
        label: "Listo para iniciar",
        status: readiness?.ctlReady ? "OK" : "BLOCKED"
      },
      {
        code: "phase2.hut.candidate",
        label: "Candidato HUT",
        status: readiness?.candidateHut ? "OK" : "PENDING"
      }
    ])
  ].map((section) => ({
    ...section,
    status: summarizeSimulationChecks(section.checks)
  }));
}

function hasCompleteCtlRotationFixture(fixtures: NavigoHommeSimulationFixtures): boolean {
  const ctl = fixtures.rotations.ctl;
  return [
    ctl.triangular1Pr1,
    ctl.triangular1Pr2,
    ctl.triangular1Pr3,
    ctl.triangular1Verify,
    ctl.triangular2Pr1,
    ctl.triangular2Pr2,
    ctl.triangular2Pr3,
    ctl.triangular2Verify
  ].every(Boolean);
}
