import { describe, expect, it } from "vitest";
import { getCtlDefinition, getCtlQuestions, type CtlDefinition } from "./definition";
import { createCtlRepository } from "./repository";
import { ctlFormDataToAnswerInput, doReferenceCodesMatch, parseCtlAnswers, type CtlAnswerInput } from "./service";

const interviewer = { id: "interviewer-1", role: "INTERVIEWER" as const, status: "ACTIVE" as const };
const otherInterviewer = { id: "interviewer-2", role: "INTERVIEWER" as const, status: "ACTIVE" as const };
const admin = { id: "admin-1", role: "ADMIN" as const, status: "ACTIVE" as const };

describe("ctl module", () => {
  it("exposes CTL definition by sections while keeping current questions", () => {
    const definition = getCtlDefinition();
    const questions = getCtlQuestions(definition);

    expect(definition.version).toBe(2);
    expect(definition.sections.map((section) => section.id)).toEqual([
      "TRIANGULAR_1",
      "TRIANGULAR_2",
      "FRAGRANCIA_1",
      "FRAGRANCIA_2",
      "COMPARATIVA",
      "DEMOGRAFICOS"
    ]);
    expect(questions).toHaveLength(38);
    expect(definition.sections.every((section) => Array.isArray(section.questions))).toBe(true);
    expect(questions.map((question) => question.code)).toEqual(expect.arrayContaining([
      "P1_TRIANGULAR_1",
      "P3_TRIANGULAR_2",
      "P5A_GUSTO_M1",
      "P5A_GUSTO_M2",
      "P8A_ATRIBUTOS_M1",
      "P8A_ATRIBUTOS_M2",
      "P14_PREFERENCIA",
      "D1_ESCOLARIDAD_JEFE",
      "D8_NSE_REGISTRADO"
    ]));
  });

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
    const parsed = parseCtlAnswers(createValidCtlAnswerInput());
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
      D8_NSE_REGISTRADO: "C_TIPICO",
      P1_TRIANGULAR_1: "1",
      P3_TRIANGULAR_2: "7",
      P5A_GUSTO_M1: 4,
      P5A_GUSTO_M2: 5
    });
  });

  it("rejects invalid select options", () => {
    const parsed = parseCtlAnswers({
      ...createValidCtlAnswerInput(),
      P1_TRIANGULAR_1: "999"
    });

    expect(parsed.ok).toBe(false);
    expect(parsed.ok ? "" : parsed.message).toBe("Selecciona una opcion valida.");
    expect(parsed.ok ? [] : parsed.missingQuestionCodes).toEqual(["P1_TRIANGULAR_1"]);
  });

  it("parses scale answers as numeric values", () => {
    const parsed = parseCtlAnswers({ P5A_GUSTO: "7" }, scaleDefinition);

    expect(parsed.ok).toBe(true);
    expect(parsed.ok ? parsed.answers : []).toEqual([
      {
        answerValue: 7,
        questionCode: "P5A_GUSTO"
      }
    ]);
  });

  it("rejects scale answers outside min and max", () => {
    const parsed = parseCtlAnswers({ P5A_GUSTO: "8" }, scaleDefinition);

    expect(parsed.ok).toBe(false);
    expect(parsed.ok ? "" : parsed.message).toBe("Selecciona un valor entre 1 y 7.");
    expect(parsed.ok ? [] : parsed.missingQuestionCodes).toEqual(["P5A_GUSTO"]);
  });

  it("keeps matrix answers grouped by row from form data", () => {
    const formData = new FormData();
    formData.set("P8A_ATRIBUTOS.LIMPIA", "4");
    formData.set("P8A_ATRIBUTOS.MASCULINA", "5");
    formData.set("complete", "1");

    const parsed = parseCtlAnswers(ctlFormDataToAnswerInput(formData), matrixDefinition);

    expect(parsed.ok).toBe(true);
    expect(parsed.ok ? parsed.answers : []).toEqual([
      {
        answerValue: {
          LIMPIA: "4",
          MASCULINA: "5"
        },
        questionCode: "P8A_ATRIBUTOS"
      }
    ]);
  });

  it("requires all matrix rows when matrix question is required", () => {
    const formData = new FormData();
    formData.set("P8A_ATRIBUTOS.LIMPIA", "4");

    const parsed = parseCtlAnswers(ctlFormDataToAnswerInput(formData), matrixDefinition);

    expect(parsed.ok).toBe(false);
    expect(parsed.ok ? "" : parsed.message).toBe("Responde las preguntas obligatorias antes de continuar.");
    expect(parsed.ok ? [] : parsed.missingQuestionCodes).toEqual(["P8A_ATRIBUTOS.MASCULINA"]);
  });

  it("blocks another interviewer from taking a folio with an open CTL session", async () => {
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
    expect(second.ok).toBe(false);
    expect(second.ok ? "" : second.message).toBe("Este folio ya fue tomado por otro encuestador.");
    expect(state.sessions).toHaveLength(1);
    expect(state.sessions.map((session) => session.interviewerId)).toEqual(["interviewer-1"]);
  });

  it("creates and validates a public CTL interviewer code without storing plain code", async () => {
    const state = createCtlState();
    const repository = createCtlRepository(state.prisma as never);

    const created = await repository.createInterviewerCode({
      actor: admin,
      code: "ika-1234",
      label: "Encuestador IKA 1",
      studyId: state.study.id
    });

    expect(created.ok).toBe(true);
    expect(state.ctlInterviewerCodes).toHaveLength(1);
    expect(state.ctlInterviewerCodes[0]?.codeHash).not.toBe("IKA-1234");

    const valid = await repository.validateInterviewerCode({
      code: " ika-1234 ",
      studyCode: state.study.code
    });
    const invalid = await repository.validateInterviewerCode({
      code: "otro-codigo",
      studyCode: state.study.code
    });

    expect(valid.ok).toBe(true);
    expect(valid.ok ? valid.interviewerCode.label : "").toBe("Encuestador IKA 1");
    expect(invalid.ok).toBe(false);
  });

  it("rejects disabled public CTL interviewer codes", async () => {
    const state = createCtlState();
    const repository = createCtlRepository(state.prisma as never);
    await repository.createInterviewerCode({
      actor: admin,
      code: "ika-1234",
      label: "Encuestador IKA 1",
      studyId: state.study.id
    });
    state.ctlInterviewerCodes[0]!.status = "DISABLED";

    const result = await repository.validateInterviewerCode({
      code: "ika-1234",
      studyCode: state.study.code
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.message).toBe("El codigo de encuestador no es valido.");
  });

  it("resolves public CTL interviewer actor and previews an available folio", async () => {
    const state = createCtlState();
    const repository = createCtlRepository(state.prisma as never);
    const created = await repository.createInterviewerCode({
      actor: admin,
      code: "ika-1234",
      label: "Encuestador IKA 1",
      studyId: state.study.id
    });

    const publicActor = await repository.getPublicInterviewerActor({
      ctlInterviewerCodeId: created.ok ? created.interviewerCode.id : "",
      studyCode: state.study.code
    });
    const preview = await repository.previewFolioForInterviewerCode({
      ctlInterviewerCodeId: created.ok ? created.interviewerCode.id : "",
      folio: "nav-001"
    });
    const deniedList = await repository.listParticipants({
      actor: publicActor!,
      studyId: state.study.id
    });

    expect(publicActor).toMatchObject({
      kind: "PUBLIC_CTL_INTERVIEWER",
      label: "Encuestador IKA 1",
      role: "CTL_INTERVIEWER",
      studyId: state.study.id
    });
    expect(preview.ok).toBe(true);
    expect(preview.ok ? preview.participant : null).toMatchObject({
      folio: "NAV-001",
      name: "ANA PEREZ",
      nse: "144 · RANGO-3",
      rotation: {
        firstSampleKey: "247",
        secondSampleKey: "583"
      }
    });
    expect(deniedList.ok).toBe(false);
    expect(deniedList.ok ? "" : deniedList.message).toBe("No tienes permiso para capturar CTL.");
  });

  it("claims a CTL folio for a public interviewer code and blocks a second code", async () => {
    const state = createCtlState();
    const repository = createCtlRepository(state.prisma as never);
    const firstCode = await repository.createInterviewerCode({
      actor: admin,
      code: "ika-1111",
      label: "Encuestador IKA 1",
      studyId: state.study.id
    });
    const secondCode = await repository.createInterviewerCode({
      actor: admin,
      code: "ika-2222",
      label: "Encuestador IKA 2",
      studyId: state.study.id
    });

    const firstClaim = await repository.claimFolioForInterviewerCode({
      ctlInterviewerCodeId: firstCode.ok ? firstCode.interviewerCode.id : "",
      folio: "nav-001"
    });
    const secondClaim = await repository.claimFolioForInterviewerCode({
      ctlInterviewerCodeId: secondCode.ok ? secondCode.interviewerCode.id : "",
      folio: "NAV-001"
    });

    expect(firstClaim.ok).toBe(true);
    expect(secondClaim.ok).toBe(false);
    expect(secondClaim.ok ? "" : secondClaim.message).toBe("Este folio ya fue tomado por otro encuestador.");
    expect(state.sessions).toMatchObject([
      {
        ctlInterviewerCodeId: firstCode.ok ? firstCode.interviewerCode.id : "",
        interviewerId: null,
        status: "PENDING",
        studyParticipantId: "participant-1"
      }
    ]);
  });

  it("reports an occupied folio before a public interviewer claims it", async () => {
    const state = createCtlState();
    const repository = createCtlRepository(state.prisma as never);
    const firstCode = await repository.createInterviewerCode({
      actor: admin,
      code: "ika-1111",
      label: "Encuestador IKA 1",
      studyId: state.study.id
    });
    const secondCode = await repository.createInterviewerCode({
      actor: admin,
      code: "ika-2222",
      label: "Encuestador IKA 2",
      studyId: state.study.id
    });

    await repository.claimFolioForInterviewerCode({
      ctlInterviewerCodeId: firstCode.ok ? firstCode.interviewerCode.id : "",
      folio: "NAV-001"
    });
    const preview = await repository.previewFolioForInterviewerCode({
      ctlInterviewerCodeId: secondCode.ok ? secondCode.interviewerCode.id : "",
      folio: "NAV-001"
    });

    expect(preview.ok).toBe(false);
    expect(preview.ok ? "" : preview.message).toBe("Este folio ya fue tomado por otro encuestador.");
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
    const parsed = parseCtlAnswers(createValidCtlAnswerInput());

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

const scaleDefinition: CtlDefinition = {
  sections: [
    {
      id: "FRAGRANCE_1",
      questions: [
        {
          code: "P5A_GUSTO",
          label: "Gusto general",
          labels: {
            1: "Le disgusta muchisimo",
            7: "Le gusta muchisimo"
          },
          max: 7,
          min: 1,
          required: true,
          type: "SCALE"
        }
      ],
      title: "Evaluacion primera fragancia"
    }
  ],
  version: 2
};

const matrixDefinition: CtlDefinition = {
  sections: [
    {
      id: "FRAGRANCE_1_ATTRIBUTES",
      questions: [
        {
          code: "P8A_ATRIBUTOS",
          columns: [
            { label: "Totalmente en desacuerdo", value: 1 },
            { label: "En desacuerdo", value: 2 },
            { label: "Ni de acuerdo ni en desacuerdo", value: 3 },
            { label: "De acuerdo", value: 4 },
            { label: "Totalmente de acuerdo", value: 5 }
          ],
          label: "Atributos de la fragancia",
          required: true,
          rows: [
            { code: "LIMPIA", label: "Limpia" },
            { code: "MASCULINA", label: "Masculina" }
          ],
          type: "MATRIX"
        }
      ],
      title: "Bateria de atributos"
    }
  ],
  version: 2
};

function createValidCtlAnswerInput(): CtlAnswerInput {
  return {
    D1_ESCOLARIDAD_JEFE: "8",
    D2_BANOS_COMPLETOS: "1",
    D3_AUTOS: "1",
    D4_INTERNET: "1",
    D5_TRABAJADORES: "2",
    D6_CUARTOS_DORMIR: "3",
    D7_PUNTAJE_NSE: "144",
    D8_NSE_REGISTRADO: "C_TIPICO",
    P1_TRIANGULAR_1: "1",
    P2_TRIANGULAR_1_RESULTADO: "1",
    P3_TRIANGULAR_2: "7",
    P4_TRIANGULAR_2_RESULTADO: "1",
    P5A_GUSTO_M1: "4",
    P5A_GUSTO_M2: "5",
    P6A_INTENSIDAD_PREFERIDA_M1: "3",
    P6A_INTENSIDAD_PREFERIDA_M2: "3",
    P7A_INTENSIDAD_PERCIBIDA_M1: "4",
    P7A_INTENSIDAD_PERCIBIDA_M2: "5",
    P8A_ATRIBUTOS_M1: createMatrixAnswer("4"),
    P8A_ATRIBUTOS_M2: createMatrixAnswer("5"),
    P9A_AROMA_M1: createAromaMatrixAnswer("1"),
    P9A_AROMA_M2: createAromaMatrixAnswer("0"),
    P10A_INTENCION_COMPRA_M1: "4",
    P10A_INTENCION_COMPRA_M2: "5",
    P11A_COMPARACION_MARCA_USUAL_M1: "3",
    P11A_COMPARACION_MARCA_USUAL_M2: "4",
    P12A_INTENCION_CAMBIO_M1: "2",
    P12A_INTENCION_CAMBIO_M2: "2",
    P13A_DURACION_M1: "3",
    P13A_DURACION_M2: "4",
    P14_PREFERENCIA: "1",
    P14A_RAZONES_PREFERENCIA: "  aroma mas fresco  ",
    P15_PREFERENCIA_INTENSIDAD: "1",
    P16_INTENSIDAD_PRIMERA: "4",
    P17_INTENSIDAD_SEGUNDA: "5",
    P18_MAYOR_DURACION: "1",
    P19_PREFERENCIA_CAMBIO: "2",
    P20_ADECUADA_JAFRA: "1"
  };
}

function createMatrixAnswer(value: string): Record<string, string> {
  return Object.fromEntries(
    [
      "LIMPIA",
      "MASCULINA",
      "FRESCA",
      "SEDUCTORA",
      "ATEMPORAL",
      "ATRACTIVA",
      "ALTA_CALIDAD",
      "INNOVADORA",
      "ENERGIZANTE",
      "TIENE_CARACTER",
      "PARA_ALGUIEN_COMO_YO",
      "VERSATIL",
      "ADICTIVA",
      "LLAMATIVA",
      "ME_HACE_SENTIR_SEGURO",
      "MODERNA",
      "ME_TRANSMITE_LIBERTAD",
      "ME_HACE_SENTIR_COMODO",
      "ELEGANTE",
      "ARTIFICIAL",
      "AUDAZ",
      "MISTERIOSA"
    ].map((rowCode) => [rowCode, value])
  );
}

function createAromaMatrixAnswer(value: string): Record<string, string> {
  return Object.fromEntries(
    [
      "FLORAL",
      "FRUTAL",
      "DULCE",
      "ATALCADA",
      "CITRICA",
      "AMADERADA_MADEROSA",
      "JUGOSA",
      "EMPALAGOSA",
      "ESPECIADA",
      "HERBAL",
      "LAVANDA",
      "MARINA",
      "ALCOHOL"
    ].map((rowCode) => [rowCode, value])
  );
}

function createCtlState() {
  const study = { code: "FMASCULINA-NAVIGO-2026", id: "study-1", name: "Navigo" };
  const users = [
    { id: "admin-1", name: "Admin Uno" },
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
    claimedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
    ctlInterviewerCodeId: string | null;
    id: string;
    interviewerId: string | null;
    screeningAttemptId: string | null;
    startedAt: Date | null;
    status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
    studyId: string;
    studyParticipantId: string;
  }> = [];
  const ctlInterviewerCodes: Array<{
    codeHash: string;
    createdAt: Date;
    createdByUserId: string;
    expiresAt: Date | null;
    id: string;
    label: string;
    lastUsedAt: Date | null;
    status: "ACTIVE" | "DISABLED" | "EXPIRED";
    studyId: string;
    updatedAt: Date;
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
    const user = users.find((candidate) => candidate.id === session.interviewerId) ?? null;
    const ctlInterviewerCode =
      ctlInterviewerCodes.find((candidate) => candidate.id === session.ctlInterviewerCodeId) ?? null;
    return {
      ...session,
      answers: answers.filter((answer) => answer.ctlSessionId === session.id),
      ctlInterviewerCode,
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
    ctlInterviewerCode: {
      async create(args: {
        data: {
          codeHash: string;
          createdByUserId: string;
          expiresAt: Date | null;
          label: string;
          status: "ACTIVE" | "DISABLED" | "EXPIRED";
          studyId: string;
        };
      }) {
        const record = {
          ...args.data,
          createdAt: new Date(),
          id: `ctl-code-${ctlInterviewerCodes.length + 1}`,
          lastUsedAt: null,
          updatedAt: new Date()
        };
        ctlInterviewerCodes.push(record);
        return record;
      },
      async findFirst(args: { where: { codeHash?: string; id?: string; study: { code: string } } }) {
        return (
          ctlInterviewerCodes.find(
            (code) =>
              (args.where.codeHash === undefined || code.codeHash === args.where.codeHash) &&
              (args.where.id === undefined || code.id === args.where.id) &&
              code.studyId === study.id &&
              args.where.study.code === study.code
          ) ?? null
        );
      },
      async findUnique(args: { where: { id: string } }) {
        return ctlInterviewerCodes.find((code) => code.id === args.where.id) ?? null;
      },
      async update(args: { data: { lastUsedAt: Date }; where: { id: string } }) {
        const code = ctlInterviewerCodes.find((candidate) => candidate.id === args.where.id);
        if (!code) throw new Error("interviewer code not found");
        Object.assign(code, args.data, { updatedAt: new Date() });
        return code;
      }
    },
    ctlSession: {
      async create(args: {
        data: Partial<Omit<(typeof sessions)[number], "completedAt" | "createdAt" | "id" | "startedAt">> & {
          screeningAttemptId: string | null;
          status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
          studyId: string;
          studyParticipantId: string;
        };
        select: { id: true };
      }) {
        const hasOpenSession = sessions.some(
          (session) =>
            session.studyParticipantId === args.data.studyParticipantId &&
            ["PENDING", "IN_PROGRESS"].includes(session.status)
        );
        if (hasOpenSession) {
          const error = new Error("unique constraint") as Error & { code: string };
          error.code = "P2002";
          throw error;
        }
        const record = {
          claimedAt: args.data.claimedAt ?? null,
          completedAt: null,
          createdAt: new Date(),
          ctlInterviewerCodeId: args.data.ctlInterviewerCodeId ?? null,
          id: `ctl-session-${sessions.length + 1}`,
          interviewerId: args.data.interviewerId ?? null,
          screeningAttemptId: args.data.screeningAttemptId,
          startedAt: null,
          status: args.data.status,
          studyId: args.data.studyId,
          studyParticipantId: args.data.studyParticipantId
        };
        sessions.push(record);
        return { id: record.id };
      },
      async findFirst(args: {
        where: {
          interviewerId?: string;
          status: { in: string[] };
          studyParticipantId: string;
        };
      }) {
        return (
          sessions.find(
            (session) =>
              (args.where.interviewerId === undefined || session.interviewerId === args.where.interviewerId) &&
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
    ctlInterviewerCodes,
    navigoActivities,
    prisma,
    sessions,
    study
  };
}
