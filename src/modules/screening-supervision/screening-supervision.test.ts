import { describe, expect, it } from "vitest";
import type { InternalUserRole } from "@/shared/auth/permissions";
import type { ScreenerDefinition } from "@/modules/screener";
import { DETERGENTS_STUDY_CODE, DETERGENT_RECRUITER_QUESTION_ID } from "@/modules/screener/study-overrides";
import { exportScreeningAttemptsCsvForStudy } from "./export";
import {
  getScreeningAttemptSupervisionDetail,
  listScreeningAttemptsForStudy,
  type ScreeningSupervisionActor
} from "./service";
import type {
  ScreeningSupervisionRepository,
  SupervisionAttemptDetailRecord,
  SupervisionAttemptExportRecord,
  SupervisionFieldUserRecord,
  SupervisionStudyRecord
} from "./repository";
import type { ScreeningAttemptFilters } from "./validation";

const study: SupervisionStudyRecord = {
  code: "FMASCULINA-NAVIGO-2026",
  id: "study-1",
  name: "Fragancia Masculina - Navigo Homme",
  timeZoneIana: "America/Mexico_City"
};

const detergentStudy: SupervisionStudyRecord = {
  code: DETERGENTS_STUDY_CODE,
  id: "study-detergents",
  name: "Detergentes y cuidado de la ropa",
  timeZoneIana: "America/Mexico_City"
};

const admin = actor("ADMIN");
const supervisor = actor("SUPERVISOR");
const interviewer = actor("INTERVIEWER");
const analyst = actor("ANALYST");

function actor(role: InternalUserRole): ScreeningSupervisionActor {
  return {
    id: `user-${role}`,
    role,
    status: "ACTIVE"
  };
}

const fieldUsers: SupervisionFieldUserRecord[] = [
  { email: "ana@example.com", id: "field-1", name: "Ana Campo" },
  { email: "ben@example.com", id: "field-2", name: "Ben Campo" }
];

function definition(): ScreenerDefinition {
  return {
    nse: {
      code: "NSE",
      inputs: [
        {
          missingScore: 0,
          questionId: "D1",
          scoreByAnswer: {
            HIGH: 144
          }
        }
      ],
      label: "Nivel socioeconómico",
      ranges: [{ code: "RANGO-3", eligible: true, label: "C típico", max: 167, min: 141 }],
      type: "score_table"
    },
    purpose: "SCREENER",
    questions: [
      {
        dataDestination: "SCREENING",
        id: "F1_GENERO",
        options: [choice("HOMBRE", "Hombre", 1), choice("MUJER", "Mujer", 2)],
        order: 1,
        required: true,
        text: "Género",
        type: "SINGLE_CHOICE",
        validation: {}
      },
      {
        dataDestination: "SCREENING",
        id: "F6_MARCAS",
        options: [choice("NAVIGO", "Navigo", 1), choice("OTRA", "Otra", 2, true)],
        order: 2,
        required: true,
        text: "Marcas que utiliza",
        type: "MULTIPLE_CHOICE",
        validation: {}
      },
      {
        dataDestination: "SCREENING",
        id: "F9A_VECES_AL_DIA",
        order: 3,
        required: true,
        text: "Veces al día",
        type: "INTEGER",
        validation: { max: 20, min: 2 },
        visibilityCondition: {
          questionId: "F1_GENERO",
          type: "ANSWER_EQUALS",
          value: "HOMBRE"
        }
      },
      {
        dataDestination: "SCREENING",
        id: "D1",
        options: [choice("HIGH", "Alto", 1)],
        order: 4,
        required: true,
        text: "Nivel de escolaridad",
        type: "SINGLE_CHOICE",
        validation: {}
      }
    ],
    rules: [],
    schemaVersion: "screening.v1",
    title: "Filtro"
  };
}

function choice(value: string, label: string, order: number, isOther = false) {
  return {
    actions: [],
    isOther,
    label,
    order,
    otherTextRequired: isOther,
    value
  };
}

function attempt(input: Partial<SupervisionAttemptDetailRecord> = {}): SupervisionAttemptDetailRecord {
  const status = input.status ?? "PASSED";
  const completedAt = status === "STARTED" || status === "INCOMPLETE" ? null : new Date("2026-06-23T16:00:00Z");

  return {
    answers: [
      { answerJson: "HOMBRE", questionId: "F1_GENERO" },
      { answerJson: { otherText: "Marca local", values: ["NAVIGO", "OTRA"] }, questionId: "F6_MARCAS" },
      { answerJson: 3, questionId: "F9A_VECES_AL_DIA" },
      { answerJson: "HIGH", questionId: "D1" }
    ],
    completedAt,
    evaluationJson: {
      flags: [{ code: "REVISION_CONTACTO", label: "Revisar contacto", requiresReview: true }],
      missingQuestionIds: [],
      reasons:
        status === "PENDING_REVIEW"
          ? [{ code: "REVISION_CONTACTO", reason: "Requiere revisión operativa." }]
          : [],
      schemaVersion: "screening-evaluation.v1",
      status
    },
    fieldUser: input.fieldUser ?? fieldUsers[0]!,
    fieldUserId: input.fieldUserId ?? fieldUsers[0]!.id,
    id: input.id ?? "attempt-1",
    nseClass: input.nseClass ?? "RANGO-3",
    nseScore: input.nseScore ?? 144,
    participantConfirmation: input.participantConfirmation ?? null,
    participantScreeningReview: input.participantScreeningReview ?? null,
    questionnaireVersion:
      input.questionnaireVersion ??
      {
        definitionHash: "hash-version-1",
        definitionJson: definition(),
        id: "version-1",
        study,
        versionNumber: 1
      },
    questionnaireVersionId: "version-1",
    startedAt: input.startedAt ?? new Date("2026-06-23T15:00:00Z"),
    status,
    studyParticipant: input.studyParticipant ?? {
      id: "study-participant-1",
      participantProfile: {
        email: "participante@example.com",
        externalReference: "REF-1",
        createdAt: new Date("2026-06-23T14:30:00Z"),
        id: "profile-1",
        name: "Participante Uno",
        phone: "5550000000"
      },
      studyId: study.id
    },
    studyParticipantId: "study-participant-1",
    source: input.source ?? "FIELD",
    terminationCode: input.terminationCode ?? (status === "TERMINATED" ? "GENERO_NO_ELEGIBLE" : null),
    terminationReason: input.terminationReason ?? (status === "TERMINATED" ? "No califica." : null)
  };
}

function exportAttempt(input: Partial<SupervisionAttemptExportRecord> = {}): SupervisionAttemptExportRecord {
  const detailInput = input as Partial<SupervisionAttemptDetailRecord>;

  return {
    ...attempt(detailInput),
    participantEvidence: input.participantEvidence ?? []
  };
}

function repository(
  records: Array<SupervisionAttemptDetailRecord | SupervisionAttemptExportRecord> = [attempt()]
): ScreeningSupervisionRepository {
  return {
    async getAttemptDetail(attemptId) {
      return records.find((record) => record.id === attemptId) ?? null;
    },
    async getStudy(studyId) {
      return studyId === study.id ? study : null;
    },
    async listAttemptFieldUsers(studyId) {
      return studyId === study.id ? fieldUsers : [];
    },
    async listStudyAttempts({ filters, studyId }) {
      return records
        .filter((record) => record.studyParticipant.studyId === studyId)
        .filter((record) => matchesFilters(record, filters))
        .sort((left, right) => right.startedAt.getTime() - left.startedAt.getTime());
    },
    async listStudyAttemptsForExport({ filters, studyId }) {
      return records
        .filter((record) => record.studyParticipant.studyId === studyId)
        .filter((record) => matchesFilters(record, filters))
        .sort((left, right) => right.startedAt.getTime() - left.startedAt.getTime())
        .map((record) => ({
          ...record,
          participantEvidence: "participantEvidence" in record ? record.participantEvidence : []
        }));
    }
  };
}

function matchesFilters(record: SupervisionAttemptDetailRecord, filters: ScreeningAttemptFilters): boolean {
  if (filters.status && record.status !== filters.status) {
    return false;
  }

  if (filters.fieldUserId && record.fieldUserId !== filters.fieldUserId) {
    return false;
  }

  if (filters.dateFrom && record.startedAt < filters.dateFrom) {
    return false;
  }

  if (filters.dateTo) {
    const endOfDay = new Date(filters.dateTo);
    endOfDay.setHours(23, 59, 59, 999);
    if (record.startedAt > endOfDay) {
      return false;
    }
  }

  if (filters.code) {
    const query = filters.code.toUpperCase();
    const byCode = record.terminationCode?.toUpperCase().includes(query);
    const byReason = record.terminationReason?.toUpperCase().includes(query);
    const byStatus = record.status === query;

    if (!byCode && !byReason && !byStatus) {
      return false;
    }
  }

  if (filters.participantQuery) {
    const query = filters.participantQuery.toUpperCase();
    const profile = record.studyParticipant.participantProfile;
    const matchesParticipant = [profile.name, profile.externalReference, profile.phone, profile.email]
      .filter(Boolean)
      .some((value) => String(value).toUpperCase().includes(query));

    if (!matchesParticipant) {
      return false;
    }
  }

  return true;
}

describe("screening supervision service", () => {
  it("allows ADMIN and SUPERVISOR to list study attempts", async () => {
    await expect(
      listScreeningAttemptsForStudy({ actor: admin, filters: {}, repository: repository(), studyId: study.id })
    ).resolves.toMatchObject({ ok: true });
    await expect(
      listScreeningAttemptsForStudy({ actor: supervisor, filters: {}, repository: repository(), studyId: study.id })
    ).resolves.toMatchObject({ ok: true });
  });

  it("denies INTERVIEWER and ANALYST", async () => {
    await expect(
      listScreeningAttemptsForStudy({ actor: interviewer, filters: {}, repository: repository(), studyId: study.id })
    ).resolves.toMatchObject({ code: "UNAUTHORIZED", ok: false });
    await expect(
      listScreeningAttemptsForStudy({ actor: analyst, filters: {}, repository: repository(), studyId: study.id })
    ).resolves.toMatchObject({ code: "UNAUTHORIZED", ok: false });
  });

  it("filters by status, interviewer, date and code", async () => {
    const records = [
      attempt({ id: "passed", startedAt: new Date("2026-06-23T15:00:00Z"), status: "PASSED" }),
      attempt({
        fieldUser: fieldUsers[1]!,
        fieldUserId: fieldUsers[1]!.id,
        id: "terminated",
        startedAt: new Date("2026-06-24T15:00:00Z"),
        status: "TERMINATED",
        terminationCode: "GENERO_NO_ELEGIBLE"
      })
    ];
    const repo = repository(records);

    const byStatus = await listScreeningAttemptsForStudy({
      actor: admin,
      filters: { status: "PASSED" },
      repository: repo,
      studyId: study.id
    });
    const byInterviewer = await listScreeningAttemptsForStudy({
      actor: admin,
      filters: { fieldUserId: fieldUsers[1]!.id },
      repository: repo,
      studyId: study.id
    });
    const byDate = await listScreeningAttemptsForStudy({
      actor: admin,
      filters: { dateFrom: "2026-06-24", dateTo: "2026-06-24" },
      repository: repo,
      studyId: study.id
    });
    const byCode = await listScreeningAttemptsForStudy({
      actor: admin,
      filters: { code: "GENERO" },
      repository: repo,
      studyId: study.id
    });

    expect(byStatus.ok ? byStatus.data.attempts.map((item) => item.id) : []).toEqual(["passed"]);
    expect(byInterviewer.ok ? byInterviewer.data.attempts.map((item) => item.id) : []).toEqual(["terminated"]);
    expect(byDate.ok ? byDate.data.attempts.map((item) => item.id) : []).toEqual(["terminated"]);
    expect(byCode.ok ? byCode.data.attempts.map((item) => item.id) : []).toEqual(["terminated"]);
  });

  it("filters by participant name and external reference", async () => {
    const records = [
      attempt(),
      attempt({
        id: "attempt-2",
        studyParticipant: {
          id: "study-participant-2",
          participantProfile: {
            createdAt: new Date("2026-06-23T14:45:00Z"),
            email: "otra@example.com",
            externalReference: "REF-77",
            id: "profile-2",
            name: "Gabriela Dos",
            phone: "5559998888"
          },
          studyId: study.id
        }
      })
    ];
    const repo = repository(records);

    const byName = await listScreeningAttemptsForStudy({
      actor: admin,
      filters: { participantQuery: "Gabriela" },
      repository: repo,
      studyId: study.id
    });
    const byReference = await listScreeningAttemptsForStudy({
      actor: admin,
      filters: { participantQuery: "REF-77" },
      repository: repo,
      studyId: study.id
    });

    expect(byName.ok ? byName.data.attempts.map((item) => item.id) : []).toEqual(["attempt-2"]);
    expect(byReference.ok ? byReference.data.attempts.map((item) => item.id) : []).toEqual(["attempt-2"]);
  });

  it("loads attempt detail with readable answers and option labels from the published version", async () => {
    const result = await getScreeningAttemptSupervisionDetail({
      actor: admin,
      attemptId: "attempt-1",
      repository: repository()
    });

    expect(result.ok ? result.data.answers.find((answer) => answer.questionId === "F1_GENERO")?.answerText : null).toBe("Hombre");
    expect(result.ok ? result.data.answers.find((answer) => answer.questionId === "F6_MARCAS")?.answerText : null).toBe(
      "Navigo, Otra. Especificación: Marca local"
    );
    expect(result.ok ? result.data.nseClassLabel : null).toBe("C típico");
    expect(JSON.stringify(result)).not.toContain("StudyProduct.realName");
  });

  it("shows the detergent recruiter answer in list and detail even when the active definition lacks F0", async () => {
    const record = attempt({
      questionnaireVersion: {
        definitionHash: "hash-detergents-1",
        definitionJson: definition(),
        id: "version-detergents-1",
        study: detergentStudy,
        versionNumber: 1
      },
      studyParticipant: {
        id: "study-participant-detergents",
        participantProfile: {
          createdAt: new Date("2026-06-23T14:30:00Z"),
          email: "persona@example.com",
          externalReference: "DET-1",
          id: "profile-detergents",
          name: "Participante Detergentes",
          phone: "5550000000"
        },
        studyId: detergentStudy.id
      }
    });
    record.answers = [
      { answerJson: "MAR\u00cdA \u00d1AND\u00da", questionId: DETERGENT_RECRUITER_QUESTION_ID },
      ...record.answers
    ];
    const repo = {
      ...repository([record]),
      async getStudy(studyId: string) {
        return studyId === detergentStudy.id ? detergentStudy : null;
      }
    } satisfies ScreeningSupervisionRepository;

    const list = await listScreeningAttemptsForStudy({
      actor: admin,
      filters: {},
      repository: repo,
      studyId: detergentStudy.id
    });
    const detail = await getScreeningAttemptSupervisionDetail({
      actor: admin,
      attemptId: record.id,
      repository: repo
    });

    expect(list.ok ? list.data.attempts[0]?.recruiterName : null).toBe("MAR\u00cdA \u00d1AND\u00da");
    expect(detail.ok ? detail.data.answers[0]?.questionId : null).toBe(DETERGENT_RECRUITER_QUESTION_ID);
    expect(detail.ok ? detail.data.answers[0]?.answerText : null).toBe("MAR\u00cdA \u00d1AND\u00da");
    expect(detail.ok ? detail.data.answers[0]?.questionText : null).toBe(
      "Escribe el nombre de tu reclutador o reclutadora."
    );
  });

  it("prioritizes approved participant evidence review as confirmed in supervision labels", async () => {
    const record = attempt({
      participantConfirmation: {
        folio: "NAV-001",
        manualMessageStatus: "NOT_SENT",
        referenceCodes: [
          { code: "4821", slot: 1 },
          { code: "7710", slot: 2 },
          { code: "9034", slot: 3 }
        ]
      },
      participantScreeningReview: { status: "APPROVED" },
      status: "PENDING_REVIEW"
    });
    const result = await getScreeningAttemptSupervisionDetail({
      actor: admin,
      attemptId: record.id,
      repository: repository([record])
    });

    expect(result.ok ? result.data.statusLabel : null).toBe("Elegible confirmado");
    expect(result.ok ? result.data.resultLabel : null).toBe("Elegible confirmado");
    expect(result.ok ? result.data.confirmation?.folio : null).toBe("NAV-001");
  });

  it("rejects missing attempts", async () => {
    await expect(
      getScreeningAttemptSupervisionDetail({ actor: admin, attemptId: "missing", repository: repository() })
    ).resolves.toMatchObject({ code: "ATTEMPT_NOT_FOUND", ok: false });
  });

  it("uses fallback labels for unknown options and NSE ranges", async () => {
    const customDefinition = definition();
    customDefinition.nse = {
      ...customDefinition.nse!,
      ranges: [{ code: "OTRO_RANGO", eligible: true, label: "Otro rango", max: 300, min: 0 }]
    };
    const record = attempt({
      nseClass: "RANGO-X",
      questionnaireVersion: {
        definitionHash: "hash-version-1",
        definitionJson: customDefinition,
        id: "version-1",
        study,
        versionNumber: 1
      }
    });
    record.answers = [{ answerJson: "NO_EXISTE", questionId: "F1_GENERO" }];

    const result = await getScreeningAttemptSupervisionDetail({
      actor: admin,
      attemptId: record.id,
      repository: repository([record])
    });

    expect(result.ok ? result.data.nseClassLabel : null).toBe("RANGO-X");
    expect(result.ok ? result.data.answers[0]?.answerText : null).toBe("Valor registrado: NO_EXISTE");
  });

  it("marks stored answers that are currently hidden by visibility conditions", async () => {
    const record = attempt();
    record.answers = [
      { answerJson: "MUJER", questionId: "F1_GENERO" },
      { answerJson: 3, questionId: "F9A_VECES_AL_DIA" }
    ];
    const result = await getScreeningAttemptSupervisionDetail({
      actor: admin,
      attemptId: record.id,
      repository: repository([record])
    });

    expect(
      result.ok ? result.data.answers.find((answer) => answer.questionId === "F9A_VECES_AL_DIA")?.currentlyHidden : null
    ).toBe(true);
  });

  it("shows missing visible questions from evaluationJson", async () => {
    const record = attempt({ status: "INCOMPLETE" });
    record.answers = [{ answerJson: "HOMBRE", questionId: "F1_GENERO" }];
    record.evaluationJson = {
      missingQuestionIds: ["F9A_VECES_AL_DIA"],
      reasons: [],
      flags: []
    };
    const result = await getScreeningAttemptSupervisionDetail({
      actor: admin,
      attemptId: record.id,
      repository: repository([record])
    });

    expect(result.ok ? result.data.answers.find((answer) => answer.questionId === "F9A_VECES_AL_DIA")?.missing : null).toBe(true);
  });

  it("exports TSV compatible with Excel using filters and cleaned cell values", async () => {
    const record = exportAttempt({
      participantConfirmation: {
        folio: "NAV-001",
        manualMessageMarkedSentAt: new Date("2026-06-24T18:00:00Z"),
        manualMessageMarkedSentBy: { email: "sup@example.com", id: "supervisor-1", name: "Supervisor Uno" },
        manualMessageStatus: "MARKED_SENT",
        referenceCodes: [
          { code: "A7K4", slot: 1 },
          { code: "M3P9", slot: 2 },
          { code: "T8R2", slot: 3 }
        ]
      },
      participantEvidence: [
        {
          internalNote: null,
          rejectionReason: null,
          reviewStatus: "APPROVED",
          reviewedAt: new Date("2026-06-24T17:00:00Z"),
          reviewedBy: { email: "sup@example.com", id: "supervisor-1", name: "Supervisor Uno" },
          type: "SELFIE_IDENTIFICATION"
        },
        {
          internalNote: null,
          rejectionReason: null,
          reviewStatus: "APPROVED",
          reviewedAt: new Date("2026-06-24T17:05:00Z"),
          reviewedBy: { email: "sup@example.com", id: "supervisor-1", name: "Supervisor Uno" },
          type: "PERFUME_PHOTO"
        }
      ],
      participantScreeningReview: {
        internalNote: "Evidencia\tclara.\nLista",
        rejectionReason: "Motivo; interno, con separadores",
        reviewedAt: new Date("2026-06-24T17:10:00Z"),
        reviewedBy: { email: "sup@example.com", id: "supervisor-1", name: "Supervisor Uno" },
        status: "APPROVED"
      },
      source: "PARTICIPANT_PORTAL"
    });
    record.answers = [
      { answerJson: "MAR\u00cdA \u00d1AND\u00da", questionId: DETERGENT_RECRUITER_QUESTION_ID },
      ...record.answers
    ];
    const result = await exportScreeningAttemptsCsvForStudy({
      actor: admin,
      filters: { participantQuery: "Participante" },
      now: new Date("2026-06-24T12:00:00Z"),
      repository: repository([
        record,
        exportAttempt({
          id: "other-attempt",
          studyParticipant: {
            id: "study-participant-other",
            participantProfile: {
              createdAt: new Date("2026-06-23T14:55:00Z"),
              email: "otra@example.com",
              externalReference: "OTRA-1",
              id: "profile-other",
              name: "Otra Persona",
              phone: "5551112222"
            },
            studyId: study.id
          }
        })
      ]),
      studyId: study.id
    });

    expect(result.ok ? result.data.filename : null).toBe("FMASCULINA-NAVIGO-2026_intentos_screener_2026-06-24.tsv");
    expect(result.ok ? result.data.contentType : null).toBe("text/tab-separated-values; charset=utf-8");
    expect(result.ok ? result.data.rowCount : null).toBe(1);
    expect(result.ok ? result.data.fileContent.startsWith("\uFEFF") : false).toBe(true);
    expect(result.ok ? result.data.fileContent : "").toContain("Código del estudio\tNombre del estudio");
    expect(result.ok ? result.data.fileContent : "").toContain("Reclutador\tConsentimiento");
    expect(result.ok ? result.data.fileContent : "").toContain("FMASCULINA-NAVIGO-2026");
    expect(result.ok ? result.data.fileContent : "").toContain("MAR\u00cdA \u00d1AND\u00da");
    expect(result.ok ? result.data.fileContent : "").toContain("Portal participante");
    expect(result.ok ? result.data.fileContent : "").toContain("Elegible confirmado");
    expect(result.ok ? result.data.fileContent : "").toContain("23 jun 2026, 8:30 a.m.");
    expect(result.ok ? result.data.fileContent : "").toContain("23 jun 2026, 9:00 a.m.");
    expect(result.ok ? result.data.fileContent : "").toContain("23 jun 2026, 10:00 a.m.");
    expect(result.ok ? result.data.fileContent : "").toContain("24 jun 2026, 11:10 a.m.");
    expect(result.ok ? result.data.fileContent : "").toContain("24 jun 2026, 12:00 p.m.");
    expect(result.ok ? result.data.fileContent : "").toContain("144\tC típico\tRANGO-3");
    expect(result.ok ? result.data.fileContent : "").toContain("Sí\t1\tSí\tNAV-001\tA7K4\tM3P9\tT8R2");
    expect(result.ok ? result.data.fileContent : "").toContain("Navigo|Otra - Especificación: Marca local");
    expect(result.ok ? result.data.fileContent : "").toContain("Evidencia clara. Lista");
    expect(result.ok ? result.data.fileContent : "").toContain("Motivo; interno, con separadores");
    expect(result.ok ? result.data.fileContent : "").not.toContain("Evidencia\tclara.");
    expect(result.ok ? result.data.fileContent : "").not.toContain("other-attempt");
    expect(result.ok ? result.data.fileContent : "").not.toContain("privateStorageKey");
    expect(result.ok ? result.data.fileContent : "").not.toContain("signedUrl");

    if (result.ok) {
      const lines = result.data.fileContent.trimEnd().split("\r\n");
      const headerTabCount = (lines[0]?.match(/\t/g) ?? []).length;

      expect(headerTabCount).toBeGreaterThan(10);
      expect(lines[1]).toContain("\t");
      expect(lines[0]).not.toContain("Código del estudio;Nombre del estudio");
    }
  });

  it("allows SUPERVISOR to export CSV", async () => {
    const result = await exportScreeningAttemptsCsvForStudy({
      actor: supervisor,
      filters: {},
      now: new Date("2026-06-24T12:00:00Z"),
      repository: repository([exportAttempt()]),
      studyId: study.id
    });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.data.filename : null).toBe("FMASCULINA-NAVIGO-2026_intentos_screener_2026-06-24.tsv");
  });

  it("falls back to America/Mexico_City when the study time zone is missing or invalid during export", async () => {
    const invalidTimeZoneStudy: SupervisionStudyRecord = {
      ...study,
      timeZoneIana: "Invalid/Zone"
    };
    const invalidTimeZoneRecord = exportAttempt({
      questionnaireVersion: {
        definitionHash: "hash-version-1",
        definitionJson: definition(),
        id: "version-1",
        study: invalidTimeZoneStudy,
        versionNumber: 1
      },
      studyParticipant: {
        id: "study-participant-1",
        participantProfile: {
          createdAt: new Date("2026-06-23T14:30:00Z"),
          email: "participante@example.com",
          externalReference: "REF-1",
          id: "profile-1",
          name: "Participante Uno",
          phone: "5550000000"
        },
        studyId: invalidTimeZoneStudy.id
      }
    });
    const invalidTimeZoneRepository = {
      ...repository([invalidTimeZoneRecord]),
      async getStudy(studyId: string) {
        return studyId === invalidTimeZoneStudy.id ? invalidTimeZoneStudy : null;
      }
    } satisfies ScreeningSupervisionRepository;

    const result = await exportScreeningAttemptsCsvForStudy({
      actor: admin,
      filters: {},
      now: new Date("2026-06-24T12:00:00Z"),
      repository: invalidTimeZoneRepository,
      studyId: invalidTimeZoneStudy.id
    });

    expect(result.ok ? result.data.fileContent : "").toContain("23 jun 2026, 8:30 a.m.");
    expect(result.ok ? result.data.fileContent : "").toContain("23 jun 2026, 9:00 a.m.");
    expect(result.ok ? result.data.fileContent : "").toContain("23 jun 2026, 10:00 a.m.");
    expect(result.ok ? result.data.filename : null).toBe("FMASCULINA-NAVIGO-2026_intentos_screener_2026-06-24.tsv");
  });

  it("exports headers only when there are no matching attempts", async () => {
    const result = await exportScreeningAttemptsCsvForStudy({
      actor: supervisor,
      filters: { participantQuery: "NO_EXISTE" },
      now: new Date("2026-06-24T12:00:00Z"),
      repository: repository([exportAttempt()]),
      studyId: study.id
    });

    expect(result.ok ? result.data.rowCount : null).toBe(0);
    expect(result.ok ? result.data.fileContent.split("\r\n").filter(Boolean).length : null).toBe(1);
    expect(result.ok ? result.data.fileContent : "").toContain("Código del estudio");
  });

  it("denies CSV export to roles without screening review permission", async () => {
    await expect(
      exportScreeningAttemptsCsvForStudy({
        actor: interviewer,
        filters: {},
        repository: repository([exportAttempt()]),
        studyId: study.id
      })
    ).resolves.toMatchObject({ code: "UNAUTHORIZED", ok: false });
    await expect(
      exportScreeningAttemptsCsvForStudy({
        actor: analyst,
        filters: {},
        repository: repository([exportAttempt()]),
        studyId: study.id
      })
    ).resolves.toMatchObject({ code: "UNAUTHORIZED", ok: false });
  });
});
