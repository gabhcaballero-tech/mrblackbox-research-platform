import { describe, expect, it } from "vitest";
import { createQaParticipantsRepository } from "./repository";

describe("qa participants repository", () => {
  it("crea, lista y obtiene un run QA vacio", async () => {
    const prisma = createQaPrisma();
    const repository = createQaParticipantsRepository(prisma as never);

    const created = await repository.createEmptyRun({
      createdByUserId: "user-admin",
      executionMode: "FAST_FORWARD",
      folio: " qa-nav-001 ",
      reportJson: { step: "foundation" },
      scenario: "CLT_NAVIGO_HUT",
      studyId: "study-qa"
    });

    expect(created.ok).toBe(true);
    expect(created.ok ? created.data.folio : null).toBe("QA-NAV-001");
    expect(created.ok ? created.data.status : null).toBe("CREATED");

    const list = await repository.listRuns({ studyId: "study-qa" });
    expect(list).toHaveLength(1);
    expect(list[0]?.scenario).toBe("CLT_NAVIGO_HUT");

    const detail = await repository.getRun(list[0]!.id);
    expect(detail?.reportJson).toEqual({ step: "foundation" });
  });

  it("marca como limpio un run sin participantes asociados", async () => {
    const prisma = createQaPrisma();
    const repository = createQaParticipantsRepository(prisma as never);
    const created = await repository.createEmptyRun({
      createdByUserId: "user-admin",
      executionMode: "REALISTIC",
      scenario: "CLT_ONLY",
      studyId: "study-qa"
    });

    const cleaned = await repository.cleanupRun({
      cleanedByUserId: "user-admin",
      runId: created.ok ? created.data.id : "missing"
    });

    expect(cleaned.ok).toBe(true);
    expect(cleaned.ok ? cleaned.data.status : null).toBe("CLEANED");
    expect(cleaned.ok ? cleaned.data.cleanupReportJson : null).toMatchObject({
      hutParticipantId: null,
      studyParticipantId: null
    });
  });

  it("limpia solo los participantes enlazados por QaParticipantRun", async () => {
    const prisma = createQaPrisma();
    const repository = createQaParticipantsRepository(prisma as never);
    const run = prisma.seedRun({
      hutParticipantId: "hut-qa",
      studyParticipantId: "study-participant-qa"
    });

    const result = await repository.cleanupRun({
      cleanedByUserId: "user-admin",
      runId: run.id
    });

    expect(result.ok).toBe(true);
    expect(prisma.calls.some((call: FakePrismaCall) => call.modelName === "studyParticipant" && call.where === "PREFIX")).toBe(false);
    expect(prisma.calls).toContainEqual(
      expect.objectContaining({
        modelName: "studyParticipant",
        operation: "deleteMany",
        where: { id: "study-participant-qa" }
      })
    );
    expect(prisma.calls).toContainEqual(
      expect.objectContaining({
        modelName: "hutParticipant",
        operation: "deleteMany",
        where: { id: "hut-qa" }
      })
    );
  });

  it("previsualiza relaciones para folios antiguos autorizados sin usar prefijos", async () => {
    const prisma = createQaPrisma();
    prisma.seedLegacyParticipant({
      folio: "NAV-104",
      hutParticipantId: "hut-nav-104",
      name: "Participante antiguo",
      studyParticipantId: "study-participant-nav-104"
    });
    prisma.seedLegacyRotationPlan({
      arms: ["AAA", "BBB"],
      assignments: [
        {
          folio: "NAV-104",
          id: "assignment-nav-104",
          name: "Participante antiguo",
          qa: false,
          studyParticipantId: "study-participant-nav-104"
        }
      ],
      id: "rotation-nav-104",
      rotationCode: "NAV-104__AAA__BBB"
    });
    const repository = createQaParticipantsRepository(prisma as never);

    const preview = await repository.previewLegacyCleanup({
      folios: ["NAV-104"],
      studyId: "study-qa"
    });

    expect(preview.blockedFolios).toEqual([]);
    expect(preview.folios).toEqual([
      expect.objectContaining({
        folio: "NAV-104",
        found: true,
        hutParticipantId: "hut-nav-104",
        participantName: "Participante antiguo",
        studyParticipantId: "study-participant-nav-104"
      })
    ]);
    expect(preview.folios[0]?.relationCounts).toMatchObject({
      ctlSessions: 1,
      participantAccessTokens: 1,
      hutPhaseCodes: 1,
      participantActivities: 1,
      participantConfirmations: 1,
      participantProfiles: 1,
      screeningAnswers: 1,
      studyParticipants: 1,
      whatsAppMessagesHut: 1,
      whatsAppMessagesNavigo: 1
    });
    expect(prisma.calls).toContainEqual(
      expect.objectContaining({
        modelName: "oneuiWhatsAppMessage",
        operation: "count",
        where: {
          conversation: {
            linkedParticipantId: "study-participant-nav-104",
            sourceModule: "NAVIGO"
          }
        }
      })
    );
    expect(prisma.calls).toContainEqual(
      expect.objectContaining({
        modelName: "oneuiWhatsAppMessage",
        operation: "count",
        where: {
          conversation: {
            linkedParticipantId: "hut-nav-104",
            sourceModule: "HUT"
          }
        }
      })
    );
    expect(preview.rotationPlans).toEqual([
      expect.objectContaining({
        rotationCode: "NAV-104__AAA__BBB",
        willDelete: true
      })
    ]);
  });

  it("bloquea limpieza temporal si la lista incluye folios no autorizados", async () => {
    const prisma = createQaPrisma();
    const repository = createQaParticipantsRepository(prisma as never);

    const result = await repository.cleanupLegacyAuthorizedFolios({
      cleanedByUserId: "user-admin",
      folios: ["NAV-106", "NAV-REAL"],
      studyId: "study-qa"
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.message).toContain("NAV-REAL");
    expect(prisma.calls).not.toContainEqual(expect.objectContaining({ operation: "deleteMany" }));
  });

  it("bloquea PRUEBA porque la lista blanca temporal es explicita", async () => {
    const prisma = createQaPrisma();
    const repository = createQaParticipantsRepository(prisma as never);

    const result = await repository.cleanupLegacyAuthorizedFolios({
      cleanedByUserId: "user-admin",
      folios: ["PRUEBA"],
      studyId: "study-qa"
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.message).toContain("PRUEBA");
  });

  it("limpia folios antiguos autorizados, rotaciones asociadas y guarda reporte de limpieza", async () => {
    const prisma = createQaPrisma();
    prisma.seedLegacyParticipant({
      folio: "NAV-106",
      hutParticipantId: "hut-nav-106",
      name: "Participante antiguo",
      studyParticipantId: "study-participant-nav-106"
    });
    prisma.seedLegacyRotationPlan({
      arms: ["AAA", "BBB"],
      assignments: [
        {
          folio: "NAV-106",
          id: "assignment-nav-106",
          name: "Participante antiguo",
          qa: false,
          studyParticipantId: "study-participant-nav-106"
        }
      ],
      id: "rotation-nav-106",
      rotationCode: "NAV-106__AAA__BBB"
    });
    prisma.seedLegacyRotationPlan({
      arms: ["247", "583"],
      assignments: [
        {
          folio: "NAV-106",
          id: "assignment-official",
          name: "Participante antiguo",
          qa: false,
          studyParticipantId: "study-participant-nav-106"
        }
      ],
      id: "official-rotation",
      rotationCode: "ROTACION_1"
    });
    const repository = createQaParticipantsRepository(prisma as never);

    const result = await repository.cleanupLegacyQaParticipant({
      cleanedByUserId: "user-admin",
      folios: ["NAV-106"],
      studyId: "study-qa"
    });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.data.folios[0]?.cleanupReport : null).toMatchObject({
      hutParticipantId: "hut-nav-106",
      studyParticipantId: "study-participant-nav-106"
    });
    expect(prisma.calls).toContainEqual(
      expect.objectContaining({
        modelName: "studyParticipant",
        operation: "deleteMany",
        where: { id: "study-participant-nav-106" }
      })
    );
    expect(prisma.calls).toContainEqual(
      expect.objectContaining({
        modelName: "hutParticipant",
        operation: "deleteMany",
        where: { id: "hut-nav-106" }
      })
    );
    expect(prisma.calls).toContainEqual(
      expect.objectContaining({
        modelName: "oneuiWhatsAppMessage",
        operation: "deleteMany",
        where: {
          conversation: {
            linkedParticipantId: "study-participant-nav-106",
            sourceModule: "NAVIGO"
          }
        }
      })
    );
    expect(prisma.calls).toContainEqual(
      expect.objectContaining({
        modelName: "oneuiWhatsAppMessage",
        operation: "deleteMany",
        where: {
          conversation: {
            linkedParticipantId: "hut-nav-106",
            sourceModule: "HUT"
          }
        }
      })
    );
    expect(result.ok ? result.data.rotationCleanup.plans : null).toEqual([
      expect.objectContaining({ rotationCode: "NAV-106__AAA__BBB" })
    ]);
    expect(result.ok ? result.data.rotationCleanup.blockedPlans : null).toEqual([
      expect.objectContaining({
        blockReasons: ["Rotacion oficial conservada."],
        rotationCode: "ROTACION_1"
      })
    ]);
    expect(prisma.calls).toContainEqual(
      expect.objectContaining({
        modelName: "rotationPlan",
        operation: "deleteMany",
        where: { id: { in: ["rotation-nav-106"] } }
      })
    );
    expect(prisma.calls).not.toContainEqual(
      expect.objectContaining({
        modelName: "rotationPlan",
        operation: "deleteMany",
        where: { id: { in: ["official-rotation"] } }
      })
    );
    expect(prisma.runs.some((run: FakeQaRun) => run.status === "CLEANED" && run.cleanupReportJson)).toBe(true);
  });

  it("crea escenario CLT_ONLY listo para reclamar CTL sin crear link Navigo", async () => {
    const prisma = createQaPrisma();
    const repository = createQaParticipantsRepository(prisma as never);

    const result = await repository.createScenario({
      createdByUserId: "user-admin",
      executionMode: "FAST_FORWARD",
      now: new Date("2026-08-08T12:00:00.000Z"),
      scenario: "CLT_ONLY",
      studyId: "study-qa"
    });

    expect(result.ok).toBe(true);
    const data = result.ok ? result.data : null;
    expect(data?.folio?.startsWith("QA-")).toBe(true);
    expect(data?.studyParticipantId).toBeTruthy();
    expect(data?.hutParticipantId).toBeNull();
    expect(data?.reportJson).toMatchObject({
      links: {
        ctlPublic: "/ctl/FMASCULINA-NAVIGO-2026"
      },
      objects: {
        participantConfirmationId: expect.any(String),
        rotationAssignmentId: expect.any(String),
        studyParticipantId: expect.any(String),
        triangularRotationAssignmentId: expect.any(String)
      },
      referenceCodes: [
        { generated: true, slot: 1 },
        { generated: true, slot: 2 },
        { generated: true, slot: 3 }
      ],
      scenario: "CLT_ONLY"
    });
    expect(prisma.calls).not.toContainEqual(expect.objectContaining({ modelName: "participantAccessToken", operation: "create" }));
    expect(prisma.calls).not.toContainEqual(expect.objectContaining({ modelName: "oneuiWhatsAppMessage", operation: "create" }));
    expect(prisma.calls).toContainEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          screeningAttemptId: expect.any(String),
          status: "APPROVED"
        }),
        modelName: "participantScreeningReview",
        operation: "create"
      })
    );
    const reviewCreate = prisma.calls.find((call: FakePrismaCall) => call.modelName === "participantScreeningReview" && call.operation === "create");
    expect(reviewCreate?.data).not.toHaveProperty("evidenceReviewStatus");
  });

  it("crea escenario CLT_NAVIGO sin fallar al conectar revision con intento de screening", async () => {
    const prisma = createQaPrisma();
    const repository = createQaParticipantsRepository(prisma as never);

    const result = await repository.createScenario({
      createdByUserId: "user-admin",
      executionMode: "FAST_FORWARD",
      now: new Date("2026-08-08T12:00:00.000Z"),
      scenario: "CLT_NAVIGO",
      studyId: "study-qa"
    });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.data.reportJson : null).toMatchObject({
      objects: {
        ctlSessionId: expect.any(String),
        participantAccessTokenId: expect.any(String),
        screeningAttemptId: expect.any(String)
      },
      scenario: "CLT_NAVIGO"
    });
    expect(prisma.calls).toContainEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          screeningAttemptId: expect.any(String),
          status: "APPROVED"
        }),
        modelName: "participantScreeningReview",
        operation: "create"
      })
    );
    const reviewCreate = prisma.calls.find((call: FakePrismaCall) => call.modelName === "participantScreeningReview" && call.operation === "create");
    expect(reviewCreate?.data).not.toHaveProperty("evidenceReviewStatus");
  });

  it("crea escenario CLT_NAVIGO_HUT con CTL completado, link Navigo y HUT APPLICATION_PHOTO", async () => {
    const prisma = createQaPrisma();
    const repository = createQaParticipantsRepository(prisma as never);

    const result = await repository.createScenario({
      baseUrl: "https://qa.local",
      createdByUserId: "user-admin",
      executionMode: "FAST_FORWARD",
      hutPhaseCodeSecret: "secret-for-tests-123",
      now: new Date("2026-08-08T12:00:00.000Z"),
      scenario: "CLT_NAVIGO_HUT",
      studyId: "study-qa"
    });

    expect(result.ok).toBe(true);
    const report = result.ok ? result.data.reportJson : null;
    expect(report).toMatchObject({
      links: {
        hutParticipant: expect.stringContaining("/hut/p/"),
        navigoParticipant: expect.stringContaining("/p/")
      },
      objects: {
        ctlSessionId: expect.any(String),
        hutParticipantId: expect.any(String),
        hutQuestionnaireAttemptId: expect.any(String),
        participantAccessTokenId: expect.any(String)
      },
      rotations: {
        hut: {
          eva1: "247",
          eva2: "583"
        },
        navigo: {
          armAssignmentCount: 2,
          firstFragrance: "247",
          secondFragrance: "583"
        }
      },
      scenario: "CLT_NAVIGO_HUT"
    });
    expect(prisma.calls.filter((call: FakePrismaCall) => call.modelName === "hutParticipantPhaseCode" && call.operation === "create")).toHaveLength(3);
    expect(prisma.calls).not.toContainEqual(expect.objectContaining({ modelName: "hutBlock", operation: "create" }));
    expect(prisma.calls).not.toContainEqual(expect.objectContaining({ modelName: "oneuiWhatsAppMessage", operation: "create" }));
  });

  it("crea escenario HUT_DIRECTO sin participante Navigo y con cuestionario pendiente", async () => {
    const prisma = createQaPrisma();
    const repository = createQaParticipantsRepository(prisma as never);

    const result = await repository.createScenario({
      createdByUserId: "user-admin",
      executionMode: "REALISTIC",
      hutPhaseCodeSecret: "secret-for-tests-123",
      now: new Date("2026-08-08T12:00:00.000Z"),
      scenario: "HUT_DIRECTO",
      studyId: "study-qa"
    });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.data.studyParticipantId : null).toBeNull();
    expect(result.ok ? result.data.hutParticipantId : null).toBeTruthy();
    expect(result.ok ? result.data.reportJson : null).toMatchObject({
      objects: {
        hutParticipantId: expect.any(String),
        hutQuestionnaireAttemptId: expect.any(String)
      },
      scenario: "HUT_DIRECTO"
    });
    expect(prisma.calls).toContainEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          origin: "HUT_DIRECTO",
          protocolVersion: "APPLICATION_PHOTO"
        }),
        modelName: "hutParticipant",
        operation: "create"
      })
    );
  });
});

type FakeQaRun = {
  cleanupReportJson: unknown | null;
  cleanedAt: Date | null;
  cleanedByUserId: string | null;
  createdAt: Date;
  createdByUserId: string;
  executionMode: "FAST_FORWARD" | "REALISTIC";
  folio: string | null;
  hutParticipantId: string | null;
  id: string;
  reportJson: unknown | null;
  scenario: "CLT_NAVIGO" | "CLT_NAVIGO_HUT" | "CLT_ONLY" | "HUT_DIRECTO";
  status: "CLEANED" | "CREATED" | "FAILED";
  studyId: string;
  studyParticipantId: string | null;
  updatedAt: Date;
};

function createQaPrisma() {
  const runs: FakeQaRun[] = [];
  const calls: FakePrismaCall[] = [];
  const legacyConfirmations: FakeLegacyConfirmation[] = [];
  const legacyHutParticipants: FakeLegacyHutParticipant[] = [];
  const legacyRotationPlans: FakeLegacyRotationPlan[] = [];
  const now = new Date("2026-08-08T12:00:00.000Z");
  let idSequence = 1;

  const deleteDelegate = (modelName: string) => ({
    count: async (args: { where: unknown }) => {
      calls.push({ modelName, operation: "count", where: args.where });
      return 1;
    },
    deleteMany: async (args: { where: unknown }) => {
      calls.push({ modelName, operation: "deleteMany", where: args.where });
      return { count: 1 };
    }
  });
  const updateDelegate = (modelName: string) => ({
    updateMany: async (args: { where: unknown }) => {
      calls.push({ modelName, operation: "updateMany", where: args.where });
      return { count: 1 };
    }
  });
  const createDelegate = (modelName: string) => ({
    create: async (args: { data: Record<string, unknown>; select?: Record<string, boolean> }) => {
      const id = `${modelName}-${idSequence++}`;
      calls.push({ data: args.data, modelName, operation: "create", where: null });
      return selectFakeRecord({ ...args.data, id }, args.select);
    }
  });

  type FakeQaPrisma = {
    $transaction: <T>(callback: (tx: FakeQaPrisma) => Promise<T>) => Promise<T>;
    calls: FakePrismaCall[];
    runs: FakeQaRun[];
    seedLegacyParticipant: (input: FakeLegacyParticipantInput) => void;
    seedLegacyRotationPlan: (input: FakeLegacyRotationPlanInput) => void;
    seedRun: (input: Partial<FakeQaRun>) => FakeQaRun;
    [key: string]: unknown;
  };

  const prisma: FakeQaPrisma = {
    calls,
    runs,
    seedLegacyParticipant(input: FakeLegacyParticipantInput) {
      legacyConfirmations.push({
        folio: input.folio,
        studyParticipant: {
          hutParticipant: input.hutParticipantId ? { id: input.hutParticipantId } : null,
          participantProfile: { name: input.name }
        },
        studyParticipantId: input.studyParticipantId
      });
      if (input.hutParticipantId) {
        legacyHutParticipants.push({
          folio: input.folio,
          id: input.hutParticipantId,
          name: input.name,
          studyParticipantId: input.studyParticipantId
        });
      }
    },
    seedLegacyRotationPlan(input: FakeLegacyRotationPlanInput) {
      legacyRotationPlans.push({
        arms: input.arms.map((sampleKey, index) => ({
          applicationOrder: index + 1,
          id: `${input.id}-arm-${index + 1}`,
          participantVisibleLabel: sampleKey,
          studyArm: { code: index === 0 ? "LEFT" : "RIGHT", label: index === 0 ? "Brazo izquierdo" : "Brazo derecho" },
          studyArmId: `${input.id}-study-arm-${index + 1}`,
          studyProduct: { displayLabel: `Fragancia ${sampleKey}`, internalCode: sampleKey },
          studyProductId: `${input.id}-product-${index + 1}`
        })),
        assignments: (input.assignments ?? []).map((assignment) => ({
          id: assignment.id,
          studyParticipant: {
            id: assignment.studyParticipantId,
            participantConfirmation: { folio: assignment.folio },
            participantProfile: { name: assignment.name },
            qaParticipantRun: assignment.qa ? { id: `qa-${assignment.studyParticipantId}` } : null
          },
          studyParticipantId: assignment.studyParticipantId
        })),
        id: input.id,
        rotationCode: input.rotationCode
      });
    },
    seedRun(input: Partial<FakeQaRun>) {
      const run: FakeQaRun = {
        cleanupReportJson: null,
        cleanedAt: null,
        cleanedByUserId: null,
        createdAt: now,
        createdByUserId: "user-admin",
        executionMode: "FAST_FORWARD",
        folio: "QA-NAV-001",
        hutParticipantId: null,
        id: `qa-run-${runs.length + 1}`,
        reportJson: null,
        scenario: "CLT_NAVIGO_HUT",
        status: "CREATED",
        studyId: "study-qa",
        studyParticipantId: null,
        updatedAt: now,
        ...input
      };
      runs.push(run);
      return run;
    },
    $transaction: async <T>(callback: (tx: FakeQaPrisma) => Promise<T>) => callback(prisma),
    applicationTimeEvent: deleteDelegate("applicationTimeEvent"),
    ctlAnswer: {
      ...createDelegate("ctlAnswer"),
      ...deleteDelegate("ctlAnswer")
    },
    ctlPhaseProgress: {
      ...createDelegate("ctlPhaseProgress"),
      ...deleteDelegate("ctlPhaseProgress")
    },
    ctlSession: {
      ...createDelegate("ctlSession"),
      ...deleteDelegate("ctlSession")
    },
    ctlTriangularRotationAssignment: {
      create: async (args: { data: Record<string, unknown> }) => {
        const id = `ctlTriangularRotationAssignment-${idSequence++}`;
        const record = { ...args.data, id };
        calls.push({ data: args.data, modelName: "ctlTriangularRotationAssignment", operation: "create", where: null });
        return record;
      },
      ...deleteDelegate("ctlTriangularRotationAssignment")
    },
    hutAnswer: deleteDelegate("hutAnswer"),
    hutApplicationEvidence: deleteDelegate("hutApplicationEvidence"),
    hutApplicationPhotoEntry: deleteDelegate("hutApplicationPhotoEntry"),
    hutBlock: deleteDelegate("hutBlock"),
    hutCallEvaluation: deleteDelegate("hutCallEvaluation"),
    hutDailyCheck: deleteDelegate("hutDailyCheck"),
    hutParticipant: {
      ...createDelegate("hutParticipant"),
      ...deleteDelegate("hutParticipant"),
      findMany: async (args: { where: { folio: { in: string[] }; studyId: string } }) =>
        legacyHutParticipants.filter((participant) => participant.folio && args.where.folio.in.includes(participant.folio))
    },
    hutParticipantPhaseCode: {
      ...createDelegate("hutParticipantPhaseCode"),
      ...deleteDelegate("hutParticipantPhaseCode")
    },
    hutQuestionnaireAttempt: {
      ...createDelegate("hutQuestionnaireAttempt"),
      ...deleteDelegate("hutQuestionnaireAttempt")
    },
    hutReferenceSelfie: deleteDelegate("hutReferenceSelfie"),
    hutRegistrationSlot: {
      ...updateDelegate("hutRegistrationSlot"),
      upsert: async (args: { create: Record<string, unknown>; where: unknown }) => {
        calls.push({ data: args.create, modelName: "hutRegistrationSlot", operation: "upsert", where: args.where });
        return { ...args.create, id: `hutRegistrationSlot-${idSequence++}` };
      }
    },
    hutVideoSubmission: deleteDelegate("hutVideoSubmission"),
    hutVisitProgress: deleteDelegate("hutVisitProgress"),
    hutVisualVerification: deleteDelegate("hutVisualVerification"),
    mediaEvidencePlaceholder: deleteDelegate("mediaEvidencePlaceholder"),
    oneuiWhatsAppMessage: deleteDelegate("oneuiWhatsAppMessage"),
    participantAccessToken: {
      ...createDelegate("participantAccessToken"),
      ...deleteDelegate("participantAccessToken")
    },
    participantActivity: deleteDelegate("participantActivity"),
    participantActivityEvidence: deleteDelegate("participantActivityEvidence"),
    participantArmAssignment: {
      ...createDelegate("participantArmAssignment"),
      ...deleteDelegate("participantArmAssignment")
    },
    participantAttributeOrder: deleteDelegate("participantAttributeOrder"),
    participantConfirmation: {
      ...createDelegate("participantConfirmation"),
      ...deleteDelegate("participantConfirmation"),
      findMany: async (args: { where: { folio: { in: string[] }; studyId: string } }) =>
        legacyConfirmations.filter((confirmation) => args.where.folio.in.includes(confirmation.folio))
    },
    participantConsent: deleteDelegate("participantConsent"),
    participantEvidence: deleteDelegate("participantEvidence"),
    participantProfile: {
      ...createDelegate("participantProfile"),
      ...deleteDelegate("participantProfile")
    },
    participantReferenceCode: {
      ...createDelegate("participantReferenceCode"),
      ...deleteDelegate("participantReferenceCode")
    },
    participantRotationAssignment: {
      ...createDelegate("participantRotationAssignment"),
      ...deleteDelegate("participantRotationAssignment")
    },
    participantScreeningReview: {
      ...createDelegate("participantScreeningReview"),
      ...deleteDelegate("participantScreeningReview")
    },
    qaParticipantRun: {
      create: async (args: { data: Partial<FakeQaRun> }) => {
        return prisma.seedRun(args.data);
      },
      findMany: async (args: { where: { status?: { not: string }; studyId: string } }) => {
        return runs.filter((run) => run.studyId === args.where.studyId && run.status !== args.where.status?.not);
      },
      findUnique: async (args: { where: { id: string } }) => {
        return runs.find((run) => run.id === args.where.id) ?? null;
      },
      update: async (args: { data: Partial<FakeQaRun>; where: { id: string } }) => {
        const run = runs.find((item) => item.id === args.where.id);
        if (!run) {
          throw new Error("Run not found");
        }
        Object.assign(run, args.data, { updatedAt: now });
        return run;
      }
    },
    quotaEvaluation: deleteDelegate("quotaEvaluation"),
    questionnaireVersion: {
      findFirst: async () => ({ id: "questionnaire-version-1" })
    },
    reminderLog: deleteDelegate("reminderLog"),
    researchResponse: deleteDelegate("researchResponse"),
    rotationPlan: {
      deleteMany: async (args: { where: unknown }) => {
        calls.push({ modelName: "rotationPlan", operation: "deleteMany", where: args.where });
        return { count: 1 };
      },
      findMany: async (args?: { where?: { assignments?: { some?: { studyParticipant?: { participantConfirmation?: { folio?: { in: string[] } } } } } } }) => {
        if (legacyRotationPlans.length > 0) {
          const folios = args?.where?.assignments?.some?.studyParticipant?.participantConfirmation?.folio?.in ?? [];
          return legacyRotationPlans.filter((plan) =>
            folios.length === 0 ||
            plan.assignments.some((assignment) =>
              assignment.studyParticipant.participantConfirmation?.folio &&
              folios.includes(assignment.studyParticipant.participantConfirmation.folio)
            )
          );
        }
        return [
          {
          arms: [
            {
              applicationOrder: 1,
              participantVisibleLabel: "247",
              studyArm: { code: "LEFT", label: "Brazo izquierdo" },
              studyArmId: "arm-left",
              studyProduct: { displayLabel: "Fragancia 247", internalCode: "247" },
              studyProductId: "product-247"
            },
            {
              applicationOrder: 2,
              participantVisibleLabel: "583",
              studyArm: { code: "RIGHT", label: "Brazo derecho" },
              studyArmId: "arm-right",
              studyProduct: { displayLabel: "Fragancia 583", internalCode: "583" },
              studyProductId: "product-583"
            }
          ],
          id: "rotation-plan-1",
          rotationCode: "QA-R1"
        }
        ];
      }
    },
    rotationPlanArm: deleteDelegate("rotationPlanArm"),
    screeningAnswer: {
      ...createDelegate("screeningAnswer"),
      ...deleteDelegate("screeningAnswer")
    },
    screeningAttempt: {
      ...createDelegate("screeningAttempt"),
      ...deleteDelegate("screeningAttempt")
    },
    study: {
      findUnique: async () => ({
        code: "FMASCULINA-NAVIGO-2026",
        id: "study-qa",
        name: "QA Study"
      })
    },
    studyParticipant: {
      ...createDelegate("studyParticipant"),
      ...deleteDelegate("studyParticipant"),
      findUnique: async () => ({ participantProfileId: "profile-qa" }),
      update: async (args: { data: Record<string, unknown>; where: unknown }) => {
        calls.push({ data: args.data, modelName: "studyParticipant", operation: "update", where: args.where });
        return { ...args.data, id: "studyParticipant-updated" };
      }
    }
  };

  return prisma;
}

type FakePrismaCall = {
  data?: unknown;
  modelName: string;
  operation: string;
  where: unknown;
};

type FakeLegacyParticipantInput = {
  folio: string;
  hutParticipantId: string | null;
  name: string;
  studyParticipantId: string;
};

type FakeLegacyConfirmation = {
  folio: string;
  studyParticipant: {
    hutParticipant: { id: string } | null;
    participantProfile: { name: string };
  };
  studyParticipantId: string;
};

type FakeLegacyHutParticipant = {
  folio: string;
  id: string;
  name: string;
  studyParticipantId: string;
};

type FakeLegacyRotationPlan = {
  arms: Array<{
    applicationOrder: number;
    id: string;
    participantVisibleLabel: string;
    studyArm: { code: string; label: string };
    studyArmId: string;
    studyProduct: { displayLabel: string; internalCode: string };
    studyProductId: string;
  }>;
  assignments: Array<{
    id: string;
    studyParticipant: {
      id: string;
      participantConfirmation: { folio: string | null } | null;
      participantProfile: { name: string | null } | null;
      qaParticipantRun: { id: string } | null;
    };
    studyParticipantId: string;
  }>;
  id: string;
  rotationCode: string;
};

type FakeLegacyRotationPlanInput = {
  arms: string[];
  assignments?: Array<{
    folio: string | null;
    id: string;
    name: string | null;
    qa: boolean;
    studyParticipantId: string;
  }>;
  id: string;
  rotationCode: string;
};

function selectFakeRecord(record: Record<string, unknown>, select?: Record<string, boolean>) {
  if (!select) {
    return record;
  }
  return Object.fromEntries(Object.entries(select).filter(([, enabled]) => enabled).map(([key]) => [key, record[key]]));
}
