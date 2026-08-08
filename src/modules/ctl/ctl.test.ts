import { describe, expect, it } from "vitest";
import { getCtlApplicableQuestions, getCtlDefinition, getCtlQuestions, type CtlDefinition } from "./definition";
import { createCtlRepository } from "./repository";
import {
  buildCtlTriangularAnswerValue,
  ctlFormDataToAnswerInput,
  isCtlTerminatingAnswer,
  parseCtlAnswers,
  parseCtlQuestionAnswer,
  type CtlAnswerInput
} from "./service";

const interviewer = { id: "interviewer-1", role: "INTERVIEWER" as const, status: "ACTIVE" as const };
const otherInterviewer = { id: "interviewer-2", role: "INTERVIEWER" as const, status: "ACTIVE" as const };
const admin = { id: "admin-1", role: "ADMIN" as const, status: "ACTIVE" as const };

describe("ctl module", () => {
  it("exposes the Navigo Homme CTL v7 definition with comparative and demographic sections", () => {
    const definition = getCtlDefinition();
    const questions = getCtlQuestions(definition);

    expect(definition.version).toBe(2);
    expect(definition.sections.map((section) => section.id)).toEqual([
      "DATOS_GENERALES",
      "FILTROS",
      "TRIANGULAR_1",
      "TRIANGULAR_2",
      "FRAGRANCIA_1",
      "FRAGRANCIA_2",
      "COMPARATIVA_15_MIN",
      "DEMOGRAFICOS"
    ]);
    expect(questions).toHaveLength(62);
    expect(definition.sections.every((section) => Array.isArray(section.questions))).toBe(true);
    expect(questions.map((question) => question.code)).toEqual(expect.arrayContaining([
      "F0",
      "F1",
      "F11",
      "F11A",
      "F14",
      "P1",
      "P3",
      "P5A",
      "P5B",
      "P8A",
      "P8B",
      "P13A",
      "P13B",
      "P14",
      "P14A",
      "P15",
      "P16",
      "P17",
      "P18",
      "P19",
      "P20",
      "DG_NOMBRE",
      "DG_TELEFONO",
      "D1_ESCOLARIDAD_JEFE_HOGAR",
      "D6_CUARTOS_DORMIR",
      "D_TOTAL_PUNTOS_NSE",
      "D_NSE_CLASIFICACION"
    ]));
    expect(questions.findIndex((question) => question.code === "DG_NOMBRE")).toBeLessThan(
      questions.findIndex((question) => question.code === "F0")
    );
    expect(questions.findIndex((question) => question.code === "P14")).toBeGreaterThan(
      questions.findIndex((question) => question.code === "P13B")
    );
    expect(questions.findIndex((question) => question.code === "P20")).toBeLessThan(
      questions.findIndex((question) => question.code === "D1_ESCOLARIDAD_JEFE_HOGAR")
    );
  });

  it("defines the CTL 15-minute comparative questions from P14 to P20", () => {
    const questions = getCtlQuestions(getCtlDefinition());
    const p14 = questions.find((question) => question.code === "P14");
    const p14a = questions.find((question) => question.code === "P14A");
    const p16 = questions.find((question) => question.code === "P16");
    const p17 = questions.find((question) => question.code === "P17");
    const p20 = questions.find((question) => question.code === "P20");

    expect(p14?.type).toBe("SELECT");
    if (!p14 || p14.type !== "SELECT") {
      throw new Error("P14 must be a SELECT question");
    }
    expect(p14?.options?.map((option) => option.value)).toEqual(["1", "2", "3", "4"]);
    expect(p14?.options?.map((option) => option.label)).toEqual([
      "La primera (izquierda)",
      "La segunda (derecha)",
      "Ambas",
      "Ninguna"
    ]);
    expect(p14?.references?.map((reference) => reference.source)).toEqual(["FIRST_SAMPLE", "SECOND_SAMPLE"]);
    expect(p14a?.type).toBe("LONG_TEXT");
    expect(p14a?.label).toContain("MENCIONAR LA FRAGANCIA QUE PREFIRIÓ EN P14");
    expect(p16).toMatchObject({ max: 7, min: 1, type: "SCALE" });
    expect(p17).toMatchObject({ max: 7, min: 1, type: "SCALE" });
    expect(p20?.type).toBe("SELECT");
    if (!p20 || p20.type !== "SELECT") {
      throw new Error("P20 must be a SELECT question");
    }
    expect(p20.options.map((option) => option.value)).toEqual(["1", "2", "3", "4"]);
  });

  it("includes v7 operational instructions for triangular strips and fragrance application arms", () => {
    const definition = getCtlDefinition();
    const triangular1 = definition.sections.find((section) => section.id === "TRIANGULAR_1");
    const triangular2 = definition.sections.find((section) => section.id === "TRIANGULAR_2");
    const fragrance1 = definition.sections.find((section) => section.id === "FRAGRANCIA_1");
    const fragrance2 = definition.sections.find((section) => section.id === "FRAGRANCIA_2");
    const comparative = definition.sections.find((section) => section.id === "COMPARATIVA_15_MIN");
    const p5a = getCtlQuestions(definition).find((question) => question.code === "P5A");
    const p5b = getCtlQuestions(definition).find((question) => question.code === "P5B");
    const p14 = getCtlQuestions(definition).find((question) => question.code === "P14");

    expect(triangular1?.instructions?.[0]?.text).toContain("TRES PRIMERAS TIRAS");
    expect(triangular2?.instructions?.[0]?.text).toContain("TRES SEGUNDAS TIRAS");
    expect(fragrance1?.description).toContain("PRIMERA FRAGANCIA EN EL BRAZO IZQUIERDO");
    expect(fragrance2?.description).toContain("SEGUNDA FRAGANCIA EN EL BRAZO DERECHO");
    expect(fragrance1?.instructions?.[0]?.text).toContain("CARÁTULA DE ROTACIÓN");
    expect(fragrance2?.instructions?.[0]?.text).toContain("CARÁTULA DE ROTACIÓN");
    expect(p5a?.label).toContain("antebrazo IZQUIERDO");
    expect(p5b?.label).toContain("antebrazo DERECHO");
    expect(comparative?.description).toContain("IDENTIFIQUE EN QUÉ BRAZO SE COLOCÓ CADA CLAVE");
    expect(comparative?.instructions?.[0]?.text).toContain("HUELA AMBOS ANTEBRAZOS");
    expect(p14?.instructions?.[0]?.text).toContain("CARÁTULA DE ROTACIÓN");
  });

  it("defines real demographic NSE capture questions without automatic score calculation", () => {
    const questions = getCtlQuestions(getCtlDefinition());
    const d1 = questions.find((question) => question.code === "D1_ESCOLARIDAD_JEFE_HOGAR");
    const nse = questions.find((question) => question.code === "D_NSE_CLASIFICACION");

    expect(d1?.type).toBe("SELECT");
    if (!d1 || d1.type !== "SELECT") {
      throw new Error("D1 must be a SELECT question");
    }
    expect(d1.options).toHaveLength(10);
    expect(nse?.type).toBe("SELECT");
    if (!nse || nse.type !== "SELECT") {
      throw new Error("D_NSE_CLASIFICACION must be a SELECT question");
    }
    expect(nse.options.map((option) => option.value)).toEqual([
      "A_B",
      "C_PLUS",
      "C_TIPICO",
      "C_MINUS",
      "D_PLUS",
      "D",
      "E"
    ]);
  });

  it("uses numeric CTL yes/no matrix values with Si=1 and No=2", () => {
    const p9a = getCtlQuestions(getCtlDefinition()).find((question) => question.code === "P9A");

    expect(p9a?.type).toBe("MATRIX");
    if (!p9a || p9a.type !== "MATRIX") {
      throw new Error("P9A must be a MATRIX question");
    }

    expect(p9a.columns).toEqual([
      { label: "Sí", value: 1 },
      { label: "No", value: 2 }
    ]);
  });

  it("marks terminating CTL filter answers as termination conditions", () => {
    expect(isCtlTerminatingAnswer("F0", "2")).toBe(true);
    expect(isCtlTerminatingAnswer("F0", "1")).toBe(false);
    expect(isCtlTerminatingAnswer("F1", "2")).toBe(true);
    expect(isCtlTerminatingAnswer("F2", "28")).toBe(true);
    expect(isCtlTerminatingAnswer("F2", "35")).toBe(false);
    expect(isCtlTerminatingAnswer("F2", "58")).toBe(true);
    expect(isCtlTerminatingAnswer("F2", { exactAge: 35, rangeCode: "2", rangeLabel: "30 a 45 años" })).toBe(false);
    expect(isCtlTerminatingAnswer("F9", "1")).toBe(true);
    expect(isCtlTerminatingAnswer("F9", "3")).toBe(false);
    expect(isCtlTerminatingAnswer("P1", "PR1")).toBe(false);
  });

  it("captures F2 as exact age and derives the operational age range", () => {
    const parsed = parseCtlQuestionAnswer("F2", { F2: "35" });

    expect(parsed.ok).toBe(true);
    expect(parsed.ok ? parsed.answer : null).toEqual({
      answerValue: {
        exactAge: 35,
        rangeCode: "2",
        rangeLabel: "30 a 45 años"
      },
      questionCode: "F2"
    });
  });

  it("keeps historical F2 range answers compatible", () => {
    const parsed = parseCtlQuestionAnswer("F2", { F2: "2" });

    expect(parsed.ok).toBe(true);
    expect(parsed.ok ? parsed.answer : null).toEqual({
      answerValue: "2",
      questionCode: "F2"
    });
  });

  it("skips F11a when F11 indicates no difference", () => {
    const applicableCodes = getCtlApplicableQuestions(getCtlDefinition(), {
      ...createValidCtlAnswerInput(),
      F11: "2"
    }).map((question) => question.code);
    const withoutF11a = createValidCtlAnswerInput();
    delete withoutF11a.F11A;
    withoutF11a.F11 = "2";
    const parsed = parseCtlAnswers(withoutF11a);

    expect(applicableCodes).not.toContain("F11A");
    expect(parsed.ok).toBe(true);
  });

  it("starts a CTL session without requiring participant reference codes", async () => {
    const state = createCtlState();
    const repository = createCtlRepository(state.prisma as never);
    state.confirmations[0]!.referenceCodes = [];

    const result = await repository.startSession({
      actor: interviewer,
      folio: "NAV-001",
      studyId: state.study.id
    });

    expect(result.ok).toBe(true);
    expect(state.sessions).toHaveLength(1);
  });

  it("saves automatic general data when an admin starts CTL", async () => {
    const state = createCtlState();
    const repository = createCtlRepository(state.prisma as never);

    const result = await repository.startSession({
      actor: interviewer,
      folio: "NAV-001",
      studyId: state.study.id
    });

    expect(result.ok).toBe(true);
    expect(state.sessions[0]?.startedAt).toBeInstanceOf(Date);
    expect(Object.fromEntries(state.answers.map((answer) => [answer.questionCode, answer.answerValue]))).toMatchObject({
      DG_NOMBRE: "ANA PEREZ",
      DG_HORA_INICIO: expect.any(String)
    });
  });

  it("creates a CTL session after validating participant codes", async () => {
    const state = createCtlState();
    const repository = createCtlRepository(state.prisma as never);

    const result = await repository.startSession({
      actor: interviewer,
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

  it("snapshots triangular rotation when CTL session is created", async () => {
    const state = createCtlState();
    const repository = createCtlRepository(state.prisma as never);

    const result = await repository.startSession({
      actor: interviewer,
      folio: "NAV-001",
      studyId: state.study.id
    });

    expect(result.ok).toBe(true);
    expect(state.sessions[0]?.triangularRotationSnapshot).toEqual({
      assignmentId: "triangular-1",
      triangular1: {
        pr1: "K-247",
        pr2: "0-472",
        pr3: "H-358",
        verify: "H-358"
      },
      triangular2: {
        pr1: "G-835",
        pr2: "Z-724",
        pr3: "C-583",
        verify: "Z-724"
      }
    });
    expect(state.answers.some((answer) => answer.questionCode.startsWith("SYS_TRIANGULAR"))).toBe(false);
  });

  it("uses the CTL session triangular snapshot even if the live assignment changes later", async () => {
    const state = createCtlState();
    const repository = createCtlRepository(state.prisma as never);
    const result = await repository.startSession({
      actor: interviewer,
      folio: "NAV-001",
      studyId: state.study.id
    });

    state.participant.ctlTriangularRotationAssignment = {
      ...state.participant.ctlTriangularRotationAssignment!,
      triangular1Pr1: "999",
      triangular1Verify: "999"
    };

    const session = await repository.getSession({
      actor: interviewer,
      sessionId: result.ok ? result.sessionId : ""
    });

    expect(session?.participant.triangularRotation?.triangular1).toEqual({
      pr1: "K-247",
      pr2: "0-472",
      pr3: "H-358",
      verify: "H-358"
    });
  });

  it("does not make new CTL sessions available without triangular rotation", async () => {
    const state = createCtlState();
    const repository = createCtlRepository(state.prisma as never);
    state.participant.ctlTriangularRotationAssignment = null;

    const started = await repository.startSession({
      actor: interviewer,
      folio: "NAV-001",
      studyId: state.study.id
    });

    expect(started.ok).toBe(false);
    expect(started.ok ? "" : started.message).toBe("Este folio aun no esta listo para CTL.");
  });

  it("saves answers and continues capture later", async () => {
    const state = createCtlState();
    const repository = createCtlRepository(state.prisma as never);
    const started = await repository.startSession({
      actor: interviewer,
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
      F0: "1",
      F1: "1",
      P1: "PR1",
      P3: "PR1",
      P5A: 4,
      P5B: 5
    });
  });

  it("closes a CTL session as not qualified without releasing Navigo", async () => {
    const state = createCtlState();
    const repository = createCtlRepository(state.prisma as never);
    const started = await repository.startSession({
      actor: interviewer,
      folio: "NAV-001",
      studyId: state.study.id
    });
    const saved = await repository.saveAnswers({
      actor: interviewer,
      answers: [{ answerValue: "2", questionCode: "F0" }],
      complete: false,
      sessionId: started.ok ? started.sessionId : ""
    });
    const closed = await repository.cancelSessionAsNotQualified({
      actor: interviewer,
      sessionId: started.ok ? started.sessionId : ""
    });

    expect(saved.ok).toBe(true);
    expect(closed.ok).toBe(true);
    expect(state.sessions[0]?.status).toBe("CANCELLED");
    expect(state.sessions[0]?.completedAt).toBeInstanceOf(Date);
    expect(state.navigoActivities).toHaveLength(0);
    expect(state.accessTokens).toHaveLength(0);
  });

  it("rejects invalid select options", () => {
    const parsed = parseCtlAnswers({
      ...createValidCtlAnswerInput(),
      P1: "999"
    });

    expect(parsed.ok).toBe(false);
    expect(parsed.ok ? "" : parsed.message).toBe("Selecciona una opcion valida.");
    expect(parsed.ok ? [] : parsed.missingQuestionCodes).toEqual(["P1"]);
  });

  it("builds auditable triangular answers with selected position, shown key and correctness", () => {
    const correct = buildCtlTriangularAnswerValue({
      answerValue: "PR2",
      questionCode: "P1",
      triangularRotation: {
        triangular1: { pr1: "247", pr2: "583", pr3: "912", verify: "583" },
        triangular2: { pr1: "835", pr2: "724", pr3: "583", verify: "724" }
      }
    });
    const incorrect = buildCtlTriangularAnswerValue({
      answerValue: "PR1",
      questionCode: "P3",
      triangularRotation: {
        triangular1: { pr1: "247", pr2: "583", pr3: "912", verify: "583" },
        triangular2: { pr1: "835", pr2: "724", pr3: "583", verify: "724" }
      }
    });

    expect(correct).toEqual({
      answerValue: {
        correct: 1,
        selectedKey: "583",
        selectedPosition: "PR2"
      },
      ok: true
    });
    expect(incorrect).toEqual({
      answerValue: {
        correct: 0,
        selectedKey: "835",
        selectedPosition: "PR1"
      },
      ok: true
    });
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

  it("validates a single CTL question without requiring the full questionnaire", () => {
    const parsed = parseCtlQuestionAnswer("P5A_GUSTO", { P5A_GUSTO: "6" }, scaleDefinition);

    expect(parsed.ok).toBe(true);
    expect(parsed.ok ? parsed.answer : null).toEqual({
      answerValue: 6,
      questionCode: "P5A_GUSTO"
    });
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

  it("validates one matrix question for incremental CTL saving", () => {
    const formData = new FormData();
    formData.set("P8A_ATRIBUTOS.LIMPIA", "4");
    formData.set("P8A_ATRIBUTOS.MASCULINA", "5");

    const parsed = parseCtlQuestionAnswer(
      "P8A_ATRIBUTOS",
      ctlFormDataToAnswerInput(formData),
      matrixDefinition
    );

    expect(parsed.ok).toBe(true);
    expect(parsed.ok ? parsed.answer : null).toEqual({
      answerValue: {
        LIMPIA: "4",
        MASCULINA: "5"
      },
      questionCode: "P8A_ATRIBUTOS"
    });
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
      folio: "NAV-001",
      studyId: state.study.id
    });
    const second = await repository.startSession({
      actor: otherInterviewer,
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

  it("validates the generated plain CTL interviewer code through public access lookup", async () => {
    const state = createCtlState();
    const repository = createCtlRepository(state.prisma as never);

    const created = await repository.createInterviewerCode({
      actor: admin,
      label: "Encuestador IKA generado",
      studyId: state.study.id
    });
    const validByStudyCode = await repository.validateInterviewerCode({
      code: created.ok ? created.code : "",
      studyCode: state.study.code
    });
    const invalidByStudyId = await repository.validateInterviewerCode({
      code: created.ok ? created.code : "",
      studyCode: state.study.id
    });

    expect(created.ok).toBe(true);
    expect(created.ok ? created.code : "").toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ2346789]{8}$/);
    expect(validByStudyCode.ok).toBe(true);
    expect(validByStudyCode.ok ? validByStudyCode.interviewerCode.label : "").toBe("Encuestador IKA generado");
    expect(invalidByStudyId.ok).toBe(false);
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

  it("lists and toggles CTL interviewer codes for admin", async () => {
    const state = createCtlState();
    const repository = createCtlRepository(state.prisma as never);
    const created = await repository.createInterviewerCode({
      actor: admin,
      code: "ika-1234",
      label: "Encuestador IKA 1",
      studyId: state.study.id
    });

    const listed = await repository.listInterviewerCodes({
      actor: admin,
      studyId: state.study.id
    });
    const disabled = await repository.updateInterviewerCodeStatus({
      actor: admin,
      ctlInterviewerCodeId: created.ok ? created.interviewerCode.id : "",
      status: "DISABLED",
      studyId: state.study.id
    });
    const invalidAfterDisable = await repository.validateInterviewerCode({
      code: "ika-1234",
      studyCode: state.study.code
    });
    const reactivated = await repository.updateInterviewerCodeStatus({
      actor: admin,
      ctlInterviewerCodeId: created.ok ? created.interviewerCode.id : "",
      status: "ACTIVE",
      studyId: state.study.id
    });
    const validAfterReactivate = await repository.validateInterviewerCode({
      code: "ika-1234",
      studyCode: state.study.code
    });

    expect(listed.ok).toBe(true);
    expect(listed.ok ? listed.codes : []).toMatchObject([
      {
        label: "Encuestador IKA 1",
        status: "ACTIVE"
      }
    ]);
    expect(disabled.ok).toBe(true);
    expect(invalidAfterDisable.ok).toBe(false);
    expect(reactivated.ok).toBe(true);
    expect(validAfterReactivate.ok).toBe(true);
  });

  it("resets an interviewer code and invalidates the previous code", async () => {
    const state = createCtlState();
    const repository = createCtlRepository(state.prisma as never);
    const created = await repository.createInterviewerCode({
      actor: admin,
      code: "ika-1234",
      label: "Encuestador IKA 1",
      studyId: state.study.id
    });

    const reset = await repository.resetInterviewerCode({
      actor: admin,
      ctlInterviewerCodeId: created.ok ? created.interviewerCode.id : "",
      studyId: state.study.id
    });
    const previousCode = await repository.validateInterviewerCode({
      code: "ika-1234",
      studyCode: state.study.code
    });
    const newCode = await repository.validateInterviewerCode({
      code: reset.ok ? reset.code : "",
      studyCode: state.study.code
    });

    expect(reset.ok).toBe(true);
    expect(reset.ok ? reset.code : "").toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ2346789]{8}$/);
    expect(previousCode.ok).toBe(false);
    expect(newCode.ok).toBe(true);
  });

  it("deletes an unused interviewer code and disables one with session history", async () => {
    const state = createCtlState();
    const repository = createCtlRepository(state.prisma as never);
    const unused = await repository.createInterviewerCode({
      actor: admin,
      code: "ika-1111",
      label: "Encuestador sin uso",
      studyId: state.study.id
    });
    const used = await repository.createInterviewerCode({
      actor: admin,
      code: "ika-2222",
      label: "Encuestador con uso",
      studyId: state.study.id
    });

    await repository.claimFolioForInterviewerCode({
      ctlInterviewerCodeId: used.ok ? used.interviewerCode.id : "",
      folio: "NAV-001"
    });
    const deleted = await repository.deleteInterviewerCode({
      actor: admin,
      ctlInterviewerCodeId: unused.ok ? unused.interviewerCode.id : "",
      studyId: state.study.id
    });
    const disabled = await repository.deleteInterviewerCode({
      actor: admin,
      ctlInterviewerCodeId: used.ok ? used.interviewerCode.id : "",
      studyId: state.study.id
    });
    const stillListed = await repository.listInterviewerCodes({ actor: admin, studyId: state.study.id });
    const usedCodeAccess = await repository.validateInterviewerCode({
      code: "ika-2222",
      studyCode: state.study.code
    });

    expect(deleted).toEqual({ mode: "deleted", ok: true });
    expect(disabled).toEqual({ mode: "disabled", ok: true });
    expect(stillListed.ok ? stillListed.codes.map((code) => code.label) : []).toEqual(["Encuestador con uso"]);
    expect(stillListed.ok ? stillListed.codes[0]?.sessionCount : 0).toBe(1);
    expect(stillListed.ok ? stillListed.codes[0]?.status : "").toBe("DISABLED");
    expect(usedCodeAccess.ok).toBe(false);
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
      nse: "C Tipico (144 pts.)",
      rotation: {
        firstSampleKey: "247",
        secondSampleKey: "583"
      }
    });
    expect(deniedList.ok).toBe(false);
    expect(deniedList.ok ? "" : deniedList.message).toBe("No tienes permiso para capturar CTL.");
  });

  it("lists only available CTL participants for public interviewers", async () => {
    const state = createCtlState();
    const repository = createCtlRepository(state.prisma as never);
    const created = await repository.createInterviewerCode({
      actor: admin,
      code: "ika-1234",
      label: "Encuestador IKA 1",
      studyId: state.study.id
    });
    state.confirmations.push({
      ...state.confirmations[0]!,
      folio: "NAV-002",
      referenceCodes: [
        { code: "AAAA", slot: 1 },
        { code: "BBBB", slot: 2 },
        { code: "CCCC", slot: 3 }
      ],
      screeningAttempt: { id: "attempt-2", nseClass: "RANGO-2", nseScore: 120, status: "PASSED" },
      studyParticipant: {
        ...state.confirmations[0]!.studyParticipant,
        id: "participant-2",
        participantProfile: { name: "BEA LOPEZ" },
        screeningStatus: "TERMINATED" as never
      }
    });
    state.confirmations.push({
      ...state.confirmations[0]!,
      folio: "NAV-003",
      referenceCodes: [
        { code: "DDDD", slot: 1 },
        { code: "EEEE", slot: 2 },
        { code: "FFFF", slot: 3 }
      ],
      screeningAttempt: { id: "attempt-3", nseClass: "RANGO-1", nseScore: 100, status: "PASSED" },
      studyParticipant: {
        ...state.confirmations[0]!.studyParticipant,
        id: "participant-3",
        participantProfile: { name: "CARLA DIAZ" },
        rotationAssignment: null as never,
        screeningStatus: "PASSED"
      }
    });
    state.confirmations.push({
      ...state.confirmations[0]!,
      folio: "NAV-004",
      referenceCodes: [],
      screeningAttempt: { id: "attempt-4", nseClass: "RANGO-1", nseScore: 100, status: "PASSED" },
      studyParticipant: {
        ...state.confirmations[0]!.studyParticipant,
        id: "participant-4",
        participantProfile: { name: "DIANA CRUZ" },
        screeningStatus: "PASSED"
      }
    });

    const available = await repository.listAvailableParticipantsForInterviewerCode({
      ctlInterviewerCodeId: created.ok ? created.interviewerCode.id : ""
    });

    expect(available.ok).toBe(true);
    expect(available.ok ? available.participants : []).toEqual([
      {
        ctlStatus: null,
        folio: "NAV-001",
        id: "participant-1",
        name: "ANA PEREZ"
      },
      {
        ctlStatus: null,
        folio: "NAV-004",
        id: "participant-4",
        name: "DIANA CRUZ"
      }
    ]);
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
        startedAt: expect.any(Date),
        status: "PENDING",
        studyParticipantId: "participant-1"
      }
    ]);
    expect(Object.fromEntries(state.answers.map((answer) => [answer.questionCode, answer.answerValue]))).toMatchObject({
      DG_FECHA: expect.any(String),
      DG_HORA_INICIO: expect.any(String),
      DG_NOMBRE: "ANA PEREZ"
    });
  });

  it("creates the public CTL session from the interviewer flow without admin pre-start", async () => {
    const state = createCtlState();
    const repository = createCtlRepository(state.prisma as never);
    const code = await repository.createInterviewerCode({
      actor: admin,
      code: "ika-1111",
      label: "Encuestador IKA 1",
      studyId: state.study.id
    });

    expect(state.sessions).toHaveLength(0);
    const available = await repository.listAvailableParticipantsForInterviewerCode({
      ctlInterviewerCodeId: code.ok ? code.interviewerCode.id : ""
    });
    const claim = await repository.claimFolioForInterviewerCode({
      ctlInterviewerCodeId: code.ok ? code.interviewerCode.id : "",
      folio: "NAV-001"
    });

    expect(available.ok ? available.participants.map((participant) => participant.folio) : []).toEqual(["NAV-001"]);
    expect(claim.ok).toBe(true);
    expect(state.sessions).toMatchObject([
      {
        ctlInterviewerCodeId: code.ok ? code.interviewerCode.id : "",
        status: "PENDING",
        studyParticipantId: "participant-1"
      }
    ]);
  });

  it("moves a claimed folio from available to the interviewer's open sessions", async () => {
    const state = createCtlState();
    const repository = createCtlRepository(state.prisma as never);
    const code = await repository.createInterviewerCode({
      actor: admin,
      code: "ika-1111",
      label: "Encuestador IKA 1",
      studyId: state.study.id
    });

    const beforeClaim = await repository.listAvailableParticipantsForInterviewerCode({
      ctlInterviewerCodeId: code.ok ? code.interviewerCode.id : ""
    });
    const claim = await repository.claimFolioForInterviewerCode({
      ctlInterviewerCodeId: code.ok ? code.interviewerCode.id : "",
      folio: "NAV-001"
    });
    const afterClaim = await repository.listAvailableParticipantsForInterviewerCode({
      ctlInterviewerCodeId: code.ok ? code.interviewerCode.id : ""
    });
    const openSessions = await repository.listOpenSessionsForInterviewerCode({
      ctlInterviewerCodeId: code.ok ? code.interviewerCode.id : "",
      studyCode: state.study.code
    });

    expect(beforeClaim.ok ? beforeClaim.participants.map((participant) => participant.folio) : []).toEqual(["NAV-001"]);
    expect(claim.ok).toBe(true);
    expect(afterClaim.ok ? afterClaim.participants : []).toEqual([]);
    expect(openSessions.ok ? openSessions.sessions : []).toEqual([
      {
        folio: "NAV-001",
        id: claim.ok ? claim.sessionId : "",
        name: "ANA PEREZ",
        sessionId: claim.ok ? claim.sessionId : "",
        status: "PENDING"
      }
    ]);
  });

  it("keeps open CTL sessions private to the interviewer code that claimed them", async () => {
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

    const claim = await repository.claimFolioForInterviewerCode({
      ctlInterviewerCodeId: firstCode.ok ? firstCode.interviewerCode.id : "",
      folio: "NAV-001"
    });
    const firstActor = await repository.getPublicInterviewerActor({
      ctlInterviewerCodeId: firstCode.ok ? firstCode.interviewerCode.id : "",
      studyCode: state.study.code
    });
    const secondActor = await repository.getPublicInterviewerActor({
      ctlInterviewerCodeId: secondCode.ok ? secondCode.interviewerCode.id : "",
      studyCode: state.study.code
    });
    const firstOpenSessions = await repository.listOpenSessionsForInterviewerCode({
      ctlInterviewerCodeId: firstCode.ok ? firstCode.interviewerCode.id : "",
      studyCode: state.study.code
    });
    const secondOpenSessions = await repository.listOpenSessionsForInterviewerCode({
      ctlInterviewerCodeId: secondCode.ok ? secondCode.interviewerCode.id : "",
      studyCode: state.study.code
    });
    const secondRead = await repository.getSession({
      actor: secondActor!,
      sessionId: claim.ok ? claim.sessionId : ""
    });
    const firstRead = await repository.getSession({
      actor: firstActor!,
      sessionId: claim.ok ? claim.sessionId : ""
    });

    expect(firstOpenSessions.ok ? firstOpenSessions.sessions.map((session) => session.folio) : []).toEqual(["NAV-001"]);
    expect(secondOpenSessions.ok ? secondOpenSessions.sessions : []).toEqual([]);
    expect(secondRead).toBeNull();
    expect(firstRead?.id).toBe(claim.ok ? claim.sessionId : "");
  });

  it("rejects direct public CTL claim when the folio is not ready", async () => {
    const state = createCtlState();
    const repository = createCtlRepository(state.prisma as never);
    const code = await repository.createInterviewerCode({
      actor: admin,
      code: "ika-1111",
      label: "Encuestador IKA 1",
      studyId: state.study.id
    });
    state.confirmations[0]!.studyParticipant.rotationAssignment = null as never;

    const claim = await repository.claimFolioForInterviewerCode({
      ctlInterviewerCodeId: code.ok ? code.interviewerCode.id : "",
      folio: "NAV-001"
    });

    expect(claim.ok).toBe(false);
    expect(claim.ok ? "" : claim.message).toBe("Este folio aun no esta listo para CTL.");
    expect(state.sessions).toHaveLength(0);
  });

  it("hides participants with completed CTL from public availability", async () => {
    const state = createCtlState();
    const repository = createCtlRepository(state.prisma as never);
    const code = await repository.createInterviewerCode({
      actor: admin,
      code: "ika-1111",
      label: "Encuestador IKA 1",
      studyId: state.study.id
    });
    const claim = await repository.claimFolioForInterviewerCode({
      ctlInterviewerCodeId: code.ok ? code.interviewerCode.id : "",
      folio: "NAV-001"
    });
    state.sessions[0]!.status = "COMPLETED";
    state.sessions[0]!.completedAt = new Date();

    const available = await repository.listAvailableParticipantsForInterviewerCode({
      ctlInterviewerCodeId: code.ok ? code.interviewerCode.id : ""
    });

    expect(claim.ok).toBe(true);
    expect(available.ok).toBe(true);
    expect(available.ok ? available.participants : []).toEqual([]);
  });

  it("removes occupied CTL folios from public availability", async () => {
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
    const available = await repository.listAvailableParticipantsForInterviewerCode({
      ctlInterviewerCodeId: secondCode.ok ? secondCode.interviewerCode.id : ""
    });
    const secondClaim = await repository.claimFolioForInterviewerCode({
      ctlInterviewerCodeId: secondCode.ok ? secondCode.interviewerCode.id : "",
      folio: "NAV-001"
    });

    expect(available.ok).toBe(true);
    expect(available.ok ? available.participants : []).toEqual([]);
    expect(secondClaim.ok).toBe(false);
    expect(secondClaim.ok ? "" : secondClaim.message).toBe("Este folio ya fue tomado por otro encuestador.");
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
    expect(result.ok ? result.participants[0]?.nse : "").toBe("C Tipico (144 pts.)");
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
      folio: "NAV-001",
      studyId: state.study.id
    });
    const parsed = parseCtlAnswers(createValidCtlAnswerInput());
    await validateAllCtlPhases(repository, started.ok ? started.sessionId : "");

    await repository.saveAnswers({
      actor: interviewer,
      answers: parsed.ok ? parsed.answers : [],
      complete: true,
      sessionId: started.ok ? started.sessionId : ""
    });

    expect(state.sessions[0]?.status).toBe("COMPLETED");
    expect(Object.fromEntries(state.answers.map((answer) => [answer.questionCode, answer.answerValue]))).toMatchObject({
      DG_HORA_TERMINO: expect.any(String)
    });
    expect(state.navigoActivities).toEqual([]);
    expect(state.accessTokens).toHaveLength(1);
  });

  it("blocks CTL completion until operational phases are validated", async () => {
    const state = createCtlState();
    const repository = createCtlRepository(state.prisma as never);
    const started = await repository.startSession({
      actor: interviewer,
      folio: "NAV-001",
      studyId: state.study.id
    });
    const parsed = parseCtlAnswers(createValidCtlAnswerInput());

    const result = await repository.saveAnswers({
      actor: interviewer,
      answers: parsed.ok ? parsed.answers : [],
      complete: true,
      sessionId: started.ok ? started.sessionId : ""
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.message).toContain("Valida la fase Colocacion");
    expect(state.sessions[0]?.status).toBe("PENDING");
    expect(state.accessTokens).toHaveLength(0);
  });

  it("validates CTL phases using participant reference code slots", async () => {
    const state = createCtlState();
    const repository = createCtlRepository(state.prisma as never);
    const started = await repository.startSession({
      actor: interviewer,
      folio: "NAV-001",
      studyId: state.study.id
    });

    const invalid = await repository.validatePhaseCode({
      actor: interviewer,
      code: "codigo-equivocado",
      phase: "EVALUACION_1",
      sessionId: started.ok ? started.sessionId : ""
    });
    const valid = await repository.validatePhaseCode({
      actor: interviewer,
      code: "M3P9",
      phase: "EVALUACION_1",
      sessionId: started.ok ? started.sessionId : ""
    });

    expect(invalid.ok).toBe(false);
    expect(invalid.ok ? "" : invalid.message).toBe("El codigo de fase CTL no es correcto.");
    expect(valid.ok).toBe(true);
    expect(state.phaseProgress.find((phase) => phase.phase === "EVALUACION_1")).toMatchObject({
      referenceCodeSlot: 2,
      status: "COMPLETED",
      validatedBy: interviewer.id
    });
  });

  it("resets a CTL session by deleting answers and preserving the session", async () => {
    const state = createCtlState();
    const repository = createCtlRepository(state.prisma as never);
    const started = await repository.startSession({
      actor: interviewer,
      folio: "NAV-001",
      studyId: state.study.id
    });
    const parsed = parseCtlAnswers(createValidCtlAnswerInput());
    await repository.saveAnswers({
      actor: interviewer,
      answers: parsed.ok ? parsed.answers : [],
      complete: false,
      sessionId: started.ok ? started.sessionId : ""
    });

    const reset = await repository.resetSession({
      actor: admin,
      sessionId: started.ok ? started.sessionId : ""
    });
    const session = await repository.getSession({
      actor: admin,
      sessionId: started.ok ? started.sessionId : ""
    });

    expect(reset.ok).toBe(true);
    expect(state.sessions).toHaveLength(1);
    expect(state.answers).toHaveLength(0);
    expect(session?.status).toBe("PENDING");
    expect(session?.answers).toEqual({});
  });
});

async function validateAllCtlPhases(repository: ReturnType<typeof createCtlRepository>, sessionId: string) {
  await repository.validatePhaseCode({
    actor: interviewer,
    code: "A7K4",
    phase: "COLOCACION",
    sessionId
  });
  await repository.validatePhaseCode({
    actor: interviewer,
    code: "M3P9",
    phase: "EVALUACION_1",
    sessionId
  });
  await repository.validatePhaseCode({
    actor: interviewer,
    code: "T8R2",
    phase: "EVALUACION_2",
    sessionId
  });
}

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
    F0: "1",
    F1: "1",
    F2: "35",
    F3: "7",
    F4: "1",
    F5: "7",
    F6: "NAVIGO HOMME AZUL",
    F7: "NAVIGO HOMME AZUL",
    F8: "AZUL",
    F9: "3",
    F10: "2 MESES",
    F11: "1",
    F11A: "MAYOR DURACION",
    F12: "2",
    F13: "1",
    F14: "2",
    P1: "PR1",
    P2: "1",
    P3: "PR1",
    P4: "1",
    P5A: "4",
    P5B: "5",
    P6A: "3",
    P6B: "3",
    P7A: "4",
    P7B: "5",
    P8A: createMatrixAnswer("4"),
    P8B: createMatrixAnswer("5"),
    P9A: createAromaMatrixAnswer("1"),
    P9B: createAromaMatrixAnswer("2"),
    P10A: "4",
    P10B: "5",
    P11A: "3",
    P11B: "4",
    P12A: "2",
    P12B: "2",
    P13A: "3",
    P13B: "4",
    P14: "1",
    P14A: "PREFIERE LA PRIMERA POR EL AROMA",
    P15: "1",
    P16: "4",
    P17: "5",
    P18: "2",
    P19: "1",
    P20: "1",
    DG_NOMBRE: "ANA PEREZ",
    DG_DIRECCION: "CALLE 1",
    DG_COLONIA: "CENTRO",
    DG_MUNICIPIO: "CDMX",
    DG_TELEFONO: "5512345678",
    DG_FECHA: "2026-08-05",
    DG_HORA_INICIO: "10:00",
    DG_HORA_TERMINO: "11:00",
    D1_ESCOLARIDAD_JEFE_HOGAR: "8",
    D2_BANOS_COMPLETOS: "1",
    D3_AUTOS: "1",
    D4_INTERNET: "1",
    D5_PERSONAS_TRABAJARON: "1",
    D6_CUARTOS_DORMIR: "2",
    D_TOTAL_PUNTOS_NSE: "152",
    D_NSE_CLASIFICACION: "C_TIPICO"
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
      "ARTIFICIAL"
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
    ctlTriangularRotationAssignment: {
      id: "triangular-1",
      triangular1Pr1: "K-247",
      triangular1Pr2: "0-472",
      triangular1Pr3: "H-358",
      triangular1Verify: "H-358",
      triangular2Pr1: "G-835",
      triangular2Pr2: "Z-724",
      triangular2Pr3: "C-583",
      triangular2Verify: "Z-724"
    } as null | {
      id: string;
      triangular1Pr1: string;
      triangular1Pr2: string;
      triangular1Pr3: string;
      triangular1Verify: string;
      triangular2Pr1: string;
      triangular2Pr2: string;
      triangular2Pr3: string;
      triangular2Verify: string;
    },
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
    screeningAttempt: { id: "attempt-1", nseClass: "RANGO-3", nseScore: 144, status: "PASSED" },
    studyId: study.id,
    studyParticipant: participant
  };
  const confirmations = [confirmation];
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
    triangularRotationSnapshot?: unknown;
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
  const phaseProgress: Array<{
    arm: string | null;
    completedAt: Date | null;
    ctlSessionId: string;
    phase: "COLOCACION" | "EVALUACION_1" | "EVALUACION_2";
    productCode: string | null;
    referenceCodeSlot: number;
    rotationSnapshot: unknown;
    startedAt: Date | null;
    status: "PENDING" | "IN_PROGRESS" | "VALIDATED" | "COMPLETED";
    validatedAt: Date | null;
    validatedBy: string | null;
  }> = [];
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
      phaseProgress: phaseProgress.filter((phase) => phase.ctlSessionId === session.id),
      studyParticipant: {
        ...participant,
        participantConfirmation: confirmation
      }
    };
  }

  function toInterviewerCodeRecord(code: (typeof ctlInterviewerCodes)[number]) {
    return {
      ...code,
      _count: {
        ctlSessions: sessions.filter((session) => session.ctlInterviewerCodeId === code.id).length
      }
    };
  }

  const tx = {
    ctlAnswer: {
      async deleteMany(args: { where: { ctlSessionId: string } }) {
        for (let index = answers.length - 1; index >= 0; index -= 1) {
          if (answers[index]?.ctlSessionId === args.where.ctlSessionId) {
            answers.splice(index, 1);
          }
        }
        return { count: 0 };
      },
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
        return toInterviewerCodeRecord(record);
      },
      async delete(args: { where: { id: string } }) {
        const index = ctlInterviewerCodes.findIndex((code) => code.id === args.where.id);
        if (index === -1) throw new Error("interviewer code not found");
        const [deleted] = ctlInterviewerCodes.splice(index, 1);
        return deleted;
      },
      async findFirst(args: { where: { codeHash?: string; id?: string; study?: { code: string }; studyId?: string } }) {
        const found = ctlInterviewerCodes.find(
            (code) =>
              (args.where.codeHash === undefined || code.codeHash === args.where.codeHash) &&
              (args.where.id === undefined || code.id === args.where.id) &&
              (args.where.studyId === undefined || code.studyId === args.where.studyId) &&
              (args.where.study === undefined || (code.studyId === study.id && args.where.study.code === study.code))
          ) ?? null;
        return found ? toInterviewerCodeRecord(found) : null;
      },
      async findMany(args: { where: { studyId: string } }) {
        return ctlInterviewerCodes
          .filter((code) => code.studyId === args.where.studyId)
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
          .map(toInterviewerCodeRecord);
      },
      async findUnique(args: { where: { id: string } }) {
        const found = ctlInterviewerCodes.find((code) => code.id === args.where.id) ?? null;
        return found ? toInterviewerCodeRecord(found) : null;
      },
      async update(args: { data: Partial<{ codeHash: string; lastUsedAt: Date | null; status: "ACTIVE" | "DISABLED" | "EXPIRED" }>; where: { id: string } }) {
        const code = ctlInterviewerCodes.find((candidate) => candidate.id === args.where.id);
        if (!code) throw new Error("interviewer code not found");
        Object.assign(code, args.data, { updatedAt: new Date() });
        return toInterviewerCodeRecord(code);
      }
    },
    ctlPhaseProgress: {
      async create(args: { data: (typeof phaseProgress)[number] }) {
        const record = {
          ...args.data,
          completedAt: args.data.completedAt ?? null,
          startedAt: args.data.startedAt ?? null,
          validatedAt: args.data.validatedAt ?? null,
          validatedBy: args.data.validatedBy ?? null
        };
        phaseProgress.push(record);
        return record;
      },
      async deleteMany(args: { where: { ctlSessionId: string } }) {
        for (let index = phaseProgress.length - 1; index >= 0; index -= 1) {
          if (phaseProgress[index]?.ctlSessionId === args.where.ctlSessionId) {
            phaseProgress.splice(index, 1);
          }
        }
        return { count: 0 };
      },
      async upsert(args: {
        create: (typeof phaseProgress)[number];
        update: Partial<(typeof phaseProgress)[number]>;
        where: { ctlSessionId_phase: { ctlSessionId: string; phase: "COLOCACION" | "EVALUACION_1" | "EVALUACION_2" } };
      }) {
        const target = phaseProgress.find(
          (phase) =>
            phase.ctlSessionId === args.where.ctlSessionId_phase.ctlSessionId &&
            phase.phase === args.where.ctlSessionId_phase.phase
        );
        if (target) {
          Object.assign(target, args.update);
          return target;
        }
        phaseProgress.push(args.create);
        return args.create;
      }
    },
    ctlSession: {
      async create(args: {
        data: Partial<Omit<(typeof sessions)[number], "completedAt" | "createdAt" | "id">> & {
          screeningAttemptId: string | null;
          status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
          studyId: string;
          studyParticipantId: string;
          triangularRotationSnapshot?: unknown;
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
          startedAt: args.data.startedAt ?? null,
          status: args.data.status,
          studyId: args.data.studyId,
          studyParticipantId: args.data.studyParticipantId,
          triangularRotationSnapshot: args.data.triangularRotationSnapshot
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
      async findMany(args: {
        where: {
          ctlInterviewerCodeId?: string;
          status?: { in: string[] };
          studyId: string;
        };
      }) {
        return sessions
          .filter(
            (session) =>
              session.studyId === args.where.studyId &&
              (args.where.ctlInterviewerCodeId === undefined ||
                session.ctlInterviewerCodeId === args.where.ctlInterviewerCodeId) &&
              (args.where.status === undefined || args.where.status.in.includes(session.status))
          )
          .map(toSessionRecord);
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
        return confirmations.find(
          (candidate) => args.where.studyId === study.id && args.where.folio === candidate.folio
        ) ?? null;
      },
      async findMany(args: { where: { studyId: string } }) {
        return args.where.studyId === study.id ? confirmations : [];
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
    confirmations,
    ctlInterviewerCodes,
    phaseProgress,
    navigoActivities,
    participant,
    prisma,
    sessions,
    study
  };
}
