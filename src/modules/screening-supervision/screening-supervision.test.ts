import { afterEach, describe, expect, it, vi } from "vitest";
import type { InternalUserRole } from "@/shared/auth/permissions";
import type { ScreenerDefinition } from "@/modules/screener";
import { DETERGENTS_STUDY_CODE, DETERGENT_RECRUITER_QUESTION_ID } from "@/modules/screener/study-overrides";
import { exportScreeningAttemptsCsvForStudy } from "./export";
import { exportScreeningPerfumeParticipantsForStudy } from "./perfume-export";
import {
  createSignedEvidenceToken,
  verifySignedEvidenceToken
} from "./signed-evidence-links";
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
  SupervisionPerfumeEvidenceRecord,
  SupervisionPerfumeExportRecord,
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

afterEach(() => {
  vi.unstubAllEnvs();
});

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
    answers: input.answers ?? [
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
    studyParticipantId: input.studyParticipantId ?? "study-participant-1",
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

type PerfumeExportAttemptInput = Omit<Partial<SupervisionPerfumeExportRecord>, "studyParticipant"> & {
  studyParticipant?: Partial<SupervisionPerfumeExportRecord["studyParticipant"]>;
};

function perfumeExportAttempt(input: PerfumeExportAttemptInput = {}): SupervisionPerfumeExportRecord {
  const detailInput = input as Partial<SupervisionAttemptDetailRecord>;
  const base = attempt(detailInput);

  return {
    ...base,
    studyParticipant: ctlReadyStudyParticipant(input.studyParticipant),
    participantEvidence: input.participantEvidence ?? []
  };
}

function ctlReadyStudyParticipant(
  input: Partial<SupervisionPerfumeExportRecord["studyParticipant"]> = {}
): SupervisionPerfumeExportRecord["studyParticipant"] {
  const base = attempt().studyParticipant;

  return {
    ctlSessions: input.ctlSessions ?? [],
    id: input.id ?? base.id,
    operationalStatus: input.operationalStatus ?? "SCREENING_PASSED",
    participantProfile: input.participantProfile ?? base.participantProfile,
    rotationAssignment:
      input.rotationAssignment === undefined
        ? {
            arms: [
              { applicationOrder: 1, studyProduct: { internalCode: "247" } },
              { applicationOrder: 2, studyProduct: { internalCode: "583" } }
            ],
            id: "rotation-assignment-1"
          }
        : input.rotationAssignment,
    screeningStatus: input.screeningStatus ?? "PASSED",
    studyId: input.studyId ?? base.studyId
  };
}

function perfumeEvidence(input: Partial<SupervisionPerfumeEvidenceRecord> = {}): SupervisionPerfumeEvidenceRecord {
  const id = input.id ?? "perfume-evidence-1";

  return {
    id,
    privateStorageKey: input.privateStorageKey ?? `studies/study-1/participants/profile-1/screening-attempts/attempt-1/perfume_photo/${id}.jpg`,
    relatedQuestionId: input.relatedQuestionId ?? "F6_MARCAS_UTILIZA",
    storageBucket: input.storageBucket ?? "participant-evidence",
    type: input.type ?? "PERFUME_PHOTO",
    uploadedAt: input.uploadedAt ?? new Date("2026-06-23T16:30:00Z")
  };
}

function repository(
  records: Array<SupervisionAttemptDetailRecord | SupervisionAttemptExportRecord | SupervisionPerfumeExportRecord> = [attempt()]
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
        })) as SupervisionAttemptExportRecord[];
    },
    async listStudyAttemptsForPerfumeExport({ studyId }) {
      return records
        .filter((record) => record.studyParticipant.studyId === studyId)
        .sort((left, right) => right.startedAt.getTime() - left.startedAt.getTime())
        .map((record) => ({
          ...record,
          participantEvidence: ("participantEvidence" in record ? record.participantEvidence as unknown[] : [])
            .filter(isPerfumeEvidenceRecord)
        })) as unknown as SupervisionPerfumeExportRecord[];
    },
    async getParticipantEvidenceForSignedLink(evidenceId) {
      for (const record of records) {
        const evidence = ("participantEvidence" in record ? record.participantEvidence as unknown[] : [])
          .find((item): item is SupervisionPerfumeEvidenceRecord => isPerfumeEvidenceRecord(item) && item.id === evidenceId);

        if (evidence) {
          return evidence;
        }
      }

      return null;
    }
  };
}

function isPerfumeEvidenceRecord(value: unknown): value is SupervisionPerfumeEvidenceRecord {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as { id?: unknown }).id === "string" &&
      typeof (value as { privateStorageKey?: unknown }).privateStorageKey === "string" &&
      typeof (value as { storageBucket?: unknown }).storageBucket === "string" &&
      (value as { type?: unknown }).type === "PERFUME_PHOTO"
  );
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

function parseTsv(content: string): Array<Record<string, string>> {
  const rows = splitTsvRows(content);
  const headers = rows[0] ?? [];

  return rows.slice(1).map((cells) => {
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
  });
}

function splitTsvRows(content: string): string[][] {
  return content
    .replace(/^\uFEFF/, "")
    .replace(/\r\n$/, "")
    .split("\r\n")
    .map((line) => line.split("\t"));
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
    expect(result.ok ? result.data.fileContent : "").toContain("Folio\tNombre\tTeléfono\tWhatsApp");
    expect(result.ok ? result.data.fileContent : "").toContain("F1_GENERO\tF6_MARCAS\tF9A_VECES_AL_DIA\tD1\tF0_RECLUTADOR");
    expect(result.ok ? result.data.fileContent : "").toContain("MAR\u00cdA \u00d1AND\u00da");
    expect(result.ok ? result.data.fileContent : "").toContain("Portal participante");
    expect(result.ok ? result.data.fileContent : "").toContain("Elegible confirmado");
    expect(result.ok ? result.data.fileContent : "").toContain("23 jun 2026, 9:00 a.m.");
    expect(result.ok ? result.data.fileContent : "").toContain("23 jun 2026, 10:00 a.m.");
    expect(result.ok ? result.data.fileContent : "").toContain("144\tC típico\tRANGO-3");
    expect(result.ok ? result.data.fileContent : "").toContain("Navigo|Otra - Especificación: Marca local");
    expect(result.ok ? result.data.fileContent : "").toContain("Motivo; interno, con separadores");
    expect(result.ok ? result.data.fileContent : "").not.toContain("Evidencia\tclara.");
    expect(result.ok ? result.data.fileContent : "").not.toContain("other-attempt");
    expect(result.ok ? result.data.fileContent : "").not.toContain("privateStorageKey");
    expect(result.ok ? result.data.fileContent : "").not.toContain("signedUrl");

    if (result.ok) {
      const lines = result.data.fileContent.trimEnd().split("\r\n");
      const headerTabCount = (lines[0]?.match(/\t/g) ?? []).length;
      const [row] = parseTsv(result.data.fileContent);

      expect(headerTabCount).toBeGreaterThan(10);
      expect(lines[1]).toContain("\t");
      expect(lines[0]).not.toContain("Código del estudio;Nombre del estudio");
      expect(row?.Folio).toBe("NAV-001");
      expect(lines[0]?.replace(/^\uFEFF/, "").split("\t").slice(0, 29)).toEqual([
        "Folio",
        "Nombre",
        "Teléfono",
        "WhatsApp",
        "Correo",
        "Fecha creación",
        "Fecha finalización",
        "Reclutador",
        "Entrevistador",
        "Referencia/código origen",
        "Fuente",
        "Estado intento",
        "Elegibilidad",
        "Motivo rechazo/revisión",
        "NSE",
        "Clasificación NSE",
        "Código NSE interno",
        "Código 1",
        "Código 2",
        "Código 3",
        "Selfie registrada",
        "Número fotos perfumes",
        "Evidencia completa",
        "Estado revisión evidencia",
        "F1_GENERO",
        "F6_MARCAS",
        "F9A_VECES_AL_DIA",
        "D1",
        "F0_RECLUTADOR"
      ]);
      expect(row?.Nombre).toBe("Participante Uno");
      expect(row?.Teléfono).toBe("5550000000");
      expect(row?.WhatsApp).toBe("5550000000");
      expect(row?.Reclutador).toBe("MAR\u00cdA \u00d1AND\u00da");
      expect(row?.NSE).toBe("144");
      expect(row?.["Clasificación NSE"]).toBe("C típico");
      expect(row?.["Selfie registrada"]).toBe("Sí");
      expect(row?.["Número fotos perfumes"]).toBe("1");
      expect(row?.["Evidencia completa"]).toBe("Sí");
      expect(row?.["Estado revisión evidencia"]).toBe("Aprobado");
      expect(row?.["Código 1"]).toBe("A7K4");
      expect(row?.["Código 2"]).toBe("M3P9");
      expect(row?.["Código 3"]).toBe("T8R2");
      expect(row?.F1_GENERO).toBe("Hombre");
      expect(row?.F6_MARCAS).toBe("Navigo|Otra - Especificación: Marca local");
      expect(row?.F9A_VECES_AL_DIA).toBe("3");
      expect(row?.D1).toBe("Alto");
      expect(row?.F0_RECLUTADOR).toBe("MAR\u00cdA \u00d1AND\u00da");
    }
  });

  it("exports participant perfume brands with one temporary photo link", async () => {
    vi.stubEnv("PARTICIPANT_PORTAL_HASH_SECRET", "test-secret");
    vi.stubEnv("SCREENING_EVIDENCE_SIGNED_LINK_TTL_SECONDS", "604800");
    const record = perfumeExportAttempt({
      answers: [{ answerJson: "NAVIGO HOMME AZUL", questionId: "F6_MARCAS_UTILIZA" }],
      participantConfirmation: {
        folio: "NAV-001",
        manualMessageMarkedSentAt: null,
        manualMessageMarkedSentBy: null,
        manualMessageStatus: "NOT_SENT",
        referenceCodes: []
      },
      studyParticipant: ctlReadyStudyParticipant(),
      participantEvidence: [perfumeEvidence()]
    });

    const result = await exportScreeningPerfumeParticipantsForStudy({
      actor: admin,
      now: new Date("2026-06-24T12:00:00Z"),
      repository: repository([record]),
      requestOrigin: "https://mrblackbox.example",
      studyId: study.id
    });

    expect(result.ok ? result.data.filename : null).toBe("FMASCULINA-NAVIGO-2026_perfumes_participantes_2026-06-24.tsv");
    expect(result.ok ? result.data.contentType : null).toBe("text/tab-separated-values; charset=utf-8");
    expect(result.ok ? result.data.linkTtlSeconds : null).toBe(604800);
    const [row] = parseTsv(result.ok ? result.data.fileContent : "");

    expect(row).toMatchObject({
      Folio: "NAV-001",
      Elegible: "SI",
      "Estado screening": "Aprobado",
      Participante: "Participante Uno",
      "Marca perfume": "NAVIGO HOMME AZUL"
    });
    expect(row?.["Foto perfume 1"]).toContain("https://mrblackbox.example/evidence/signed/");
    expect(row?.["Foto perfume 2"]).toBe("");
    expect(result.ok ? result.data.fileContent : "").not.toContain("privateStorageKey");
    expect(result.ok ? result.data.fileContent : "").not.toContain("perfume_photo");
  });

  it("exports multiple perfume photos in separated columns and leaves missing photos blank", async () => {
    vi.stubEnv("PARTICIPANT_PORTAL_HASH_SECRET", "test-secret");
    const recordWithPhotos = perfumeExportAttempt({
      answers: [{ answerJson: "MARCA CON\tESPACIO\nNUEVO", questionId: "F6_MARCAS_UTILIZA" }],
      participantConfirmation: {
        folio: "NAV-002",
        manualMessageMarkedSentAt: null,
        manualMessageMarkedSentBy: null,
        manualMessageStatus: "NOT_SENT",
        referenceCodes: []
      },
      studyParticipant: ctlReadyStudyParticipant(),
      participantEvidence: [
        perfumeEvidence({ id: "photo-1" }),
        perfumeEvidence({ id: "photo-2" }),
        perfumeEvidence({ id: "photo-3" }),
        perfumeEvidence({ id: "photo-4" })
      ]
    });
    const recordWithoutPhotos = perfumeExportAttempt({
      answers: [{ answerJson: "", questionId: "F6_MARCAS_UTILIZA" }],
      id: "attempt-empty",
      participantConfirmation: {
        folio: "NAV-003",
        manualMessageMarkedSentAt: null,
        manualMessageMarkedSentBy: null,
        manualMessageStatus: "NOT_SENT",
        referenceCodes: []
      },
      studyParticipant: {
        id: "study-participant-empty",
        participantProfile: {
          createdAt: new Date("2026-06-23T14:30:00Z"),
          email: null,
          externalReference: null,
          id: "profile-empty",
          name: "Participante Sin Fotos",
          phone: null
        },
        studyId: study.id
      },
      studyParticipantId: "study-participant-empty"
    });

    const result = await exportScreeningPerfumeParticipantsForStudy({
      actor: admin,
      repository: repository([recordWithPhotos, recordWithoutPhotos]),
      requestOrigin: "https://mrblackbox.example",
      studyId: study.id
    });
    const rows = parseTsv(result.ok ? result.data.fileContent : "");
    const withPhotos = rows.find((row) => row.Folio === "NAV-002");
    const withoutPhotos = rows.find((row) => row.Folio === "NAV-003");

    expect(result.ok ? result.data.rowCount : null).toBe(2);
    expect(withPhotos?.["Marca perfume"]).toBe("MARCA CON ESPACIO NUEVO");
    expect(withPhotos?.["Foto perfume 1"]).toContain("/evidence/signed/");
    expect(withPhotos?.["Foto perfume 2"]).toContain("/evidence/signed/");
    expect(withPhotos?.["Foto perfume 3"]).toContain("/evidence/signed/");
    expect(withPhotos && Object.keys(withPhotos)).toEqual([
      "Folio",
      "Participante",
      "Estado screening",
      "Elegible",
      "Marca perfume",
      "Foto perfume 1",
      "Foto perfume 2",
      "Foto perfume 3"
    ]);
    expect(withoutPhotos?.["Foto perfume 1"]).toBe("");
    expect(withoutPhotos?.["Foto perfume 2"]).toBe("");
    expect(withoutPhotos?.["Foto perfume 3"]).toBe("");
  });

  it("marks perfume export rows as not eligible when screening is pending or rejected", async () => {
    vi.stubEnv("PARTICIPANT_PORTAL_HASH_SECRET", "test-secret");
    const pending = perfumeExportAttempt({
      id: "attempt-pending",
      participantConfirmation: null,
      status: "PENDING_REVIEW",
      studyParticipant: ctlReadyStudyParticipant({
        id: "participant-pending",
        participantProfile: {
          createdAt: new Date("2026-06-23T14:30:00Z"),
          email: null,
          externalReference: null,
          id: "profile-pending",
          name: "Participante Pendiente",
          phone: null
        },
        screeningStatus: "PENDING_REVIEW"
      }),
      studyParticipantId: "participant-pending"
    });
    const rejected = perfumeExportAttempt({
      id: "attempt-rejected",
      participantConfirmation: null,
      status: "TERMINATED",
      studyParticipant: ctlReadyStudyParticipant({
        id: "participant-rejected",
        participantProfile: {
          createdAt: new Date("2026-06-23T14:30:00Z"),
          email: null,
          externalReference: null,
          id: "profile-rejected",
          name: "Participante Rechazada",
          phone: null
        },
        screeningStatus: "TERMINATED"
      }),
      studyParticipantId: "participant-rejected"
    });

    const result = await exportScreeningPerfumeParticipantsForStudy({
      actor: admin,
      repository: repository([pending, rejected]),
      requestOrigin: "https://mrblackbox.example",
      studyId: study.id
    });
    const rows = parseTsv(result.ok ? result.data.fileContent : "");

    expect(rows.find((row) => row.Participante === "Participante Pendiente")).toMatchObject({
      Elegible: "NO",
      "Estado screening": "Pendiente de revisión"
    });
    expect(rows.find((row) => row.Participante === "Participante Rechazada")).toMatchObject({
      Elegible: "NO",
      "Estado screening": "Rechazado"
    });
  });

  it("uses CTL availability logic for approved perfume export rows", async () => {
    vi.stubEnv("PARTICIPANT_PORTAL_HASH_SECRET", "test-secret");
    const approvedWithoutRotation = perfumeExportAttempt({
      participantConfirmation: {
        folio: "NAV-004",
        manualMessageMarkedSentAt: null,
        manualMessageMarkedSentBy: null,
        manualMessageStatus: "NOT_SENT",
        referenceCodes: []
      },
      studyParticipant: ctlReadyStudyParticipant({
        rotationAssignment: null
      })
    });
    const approvedWithOpenCtlSession = perfumeExportAttempt({
      id: "attempt-with-ctl",
      participantConfirmation: {
        folio: "NAV-005",
        manualMessageMarkedSentAt: null,
        manualMessageMarkedSentBy: null,
        manualMessageStatus: "NOT_SENT",
        referenceCodes: []
      },
      studyParticipant: ctlReadyStudyParticipant({
        ctlSessions: [{ status: "IN_PROGRESS" }],
        id: "participant-with-ctl"
      }),
      studyParticipantId: "participant-with-ctl"
    });

    const result = await exportScreeningPerfumeParticipantsForStudy({
      actor: admin,
      repository: repository([approvedWithoutRotation, approvedWithOpenCtlSession]),
      requestOrigin: "https://mrblackbox.example",
      studyId: study.id
    });
    const rows = parseTsv(result.ok ? result.data.fileContent : "");

    expect(rows.find((row) => row.Folio === "NAV-004")).toMatchObject({
      Elegible: "NO",
      "Estado screening": "Aprobado"
    });
    expect(rows.find((row) => row.Folio === "NAV-005")).toMatchObject({
      Elegible: "NO",
      "Estado screening": "Aprobado"
    });
  });

  it("creates temporary evidence tokens that validate and reject expired links", () => {
    const validToken = createSignedEvidenceToken({
      evidenceId: "evidence-1",
      now: new Date("2026-06-24T12:00:00Z"),
      secret: "test-secret",
      ttlSeconds: 60
    });

    expect(validToken).not.toBeNull();
    expect(verifySignedEvidenceToken({
      now: new Date("2026-06-24T12:00:30Z"),
      secret: "test-secret",
      token: validToken ?? ""
    })).toMatchObject({ evidenceId: "evidence-1", ok: true });
    expect(verifySignedEvidenceToken({
      now: new Date("2026-06-24T12:02:00Z"),
      secret: "test-secret",
      token: validToken ?? ""
    })).toMatchObject({ code: "EXPIRED", ok: false });
  });

  it("denies perfume export to non-admin users", async () => {
    vi.stubEnv("PARTICIPANT_PORTAL_HASH_SECRET", "test-secret");

    await expect(exportScreeningPerfumeParticipantsForStudy({
      actor: supervisor,
      repository: repository([perfumeExportAttempt()]),
      requestOrigin: "https://mrblackbox.example",
      studyId: study.id
    })).resolves.toMatchObject({
      code: "UNAUTHORIZED",
      ok: false
    });
  });

  it("exports every screener question column and leaves missing answers blank", async () => {
    const record = exportAttempt({
      id: "missing-answer-attempt",
      participantConfirmation: {
        folio: "NAV-002",
        manualMessageStatus: "NOT_SENT",
        referenceCodes: []
      }
    });
    record.answers = [{ answerJson: "HOMBRE", questionId: "F1_GENERO" }];
    const result = await exportScreeningAttemptsCsvForStudy({
      actor: admin,
      filters: {},
      repository: repository([record]),
      studyId: study.id
    });

    expect(result.ok ? result.data.fileContent : "").toContain("F1_GENERO\tF6_MARCAS\tF9A_VECES_AL_DIA\tD1");

    if (result.ok) {
      const [row] = parseTsv(result.data.fileContent);

      expect(row?.F1_GENERO).toBe("Hombre");
      expect(row?.F6_MARCAS).toBe("");
      expect(row?.F9A_VECES_AL_DIA).toBe("");
      expect(row?.D1).toBe("");
      expect(row?.["Código 1"]).toBe("");
      expect(row?.["Código 2"]).toBe("");
      expect(row?.["Código 3"]).toBe("");
    }
  });

  it("keeps folio and assigned reference codes on the same participant row without generating missing codes", async () => {
    const firstRecord = exportAttempt({
      id: "coded-attempt-1",
      participantConfirmation: {
        folio: "NAV-101",
        manualMessageStatus: "NOT_SENT",
        referenceCodes: [
          { code: "A7K4", slot: 1 },
          { code: "M3P9", slot: 2 },
          { code: "T8R2", slot: 3 }
        ]
      },
      studyParticipant: {
        id: "study-participant-coded-1",
        participantProfile: {
          createdAt: new Date("2026-06-23T14:30:00Z"),
          email: "uno@example.com",
          externalReference: "COD-1",
          id: "profile-coded-1",
          name: "Participante Codigos Uno",
          phone: "5551010101"
        },
        studyId: study.id
      }
    });
    const secondRecord = exportAttempt({
      id: "coded-attempt-2",
      participantConfirmation: {
        folio: "NAV-102",
        manualMessageStatus: "NOT_SENT",
        referenceCodes: [{ code: "B6N7", slot: 2 }]
      },
      studyParticipant: {
        id: "study-participant-coded-2",
        participantProfile: {
          createdAt: new Date("2026-06-23T14:35:00Z"),
          email: "dos@example.com",
          externalReference: "COD-2",
          id: "profile-coded-2",
          name: "Participante Codigos Dos",
          phone: "5552020202"
        },
        studyId: study.id
      }
    });

    const result = await exportScreeningAttemptsCsvForStudy({
      actor: admin,
      filters: {},
      repository: repository([firstRecord, secondRecord]),
      studyId: study.id
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      const rows = parseTsv(result.data.fileContent);
      const firstRow = rows.find((row) => row.Folio === "NAV-101");
      const secondRow = rows.find((row) => row.Folio === "NAV-102");

      expect(firstRow?.Nombre).toBe("Participante Codigos Uno");
      expect(firstRow?.["Código 1"]).toBe("A7K4");
      expect(firstRow?.["Código 2"]).toBe("M3P9");
      expect(firstRow?.["Código 3"]).toBe("T8R2");
      expect(secondRow?.Nombre).toBe("Participante Codigos Dos");
      expect(secondRow?.["Código 1"]).toBe("");
      expect(secondRow?.["Código 2"]).toBe("B6N7");
      expect(secondRow?.["Código 3"]).toBe("");
    }
  });

  it("sanitizes tabs, line breaks, Unicode, multiple answers and JSON without creating extra columns", async () => {
    const customDefinition = definition();
    customDefinition.questions = [
      ...customDefinition.questions,
      {
        dataDestination: "SCREENING",
        id: "F11_NOTAS_MARCAS",
        order: 5,
        required: false,
        text: "Notas de marcas",
        type: "LONG_TEXT",
        validation: {}
      }
    ];
    const record = exportAttempt({
      id: "open-answer-attempt",
      participantScreeningReview: {
        rejectionReason: "Motivo\tcon tab\n y salto",
        status: "REJECTED"
      },
      questionnaireVersion: {
        definitionHash: "hash-open-answer",
        definitionJson: customDefinition,
        id: "version-open-answer",
        study,
        versionNumber: 1
      }
    });
    record.answers = [
      { answerJson: "HOMBRE", questionId: "F1_GENERO" },
      {
        answerJson: {
          otherText: "Marca A\tMarca B\nMarca C",
          values: ["NAVIGO", "OTRA"]
        },
        questionId: "F6_MARCAS"
      },
      { answerJson: "Texto Unicode Ñandú\tlínea 1\nlínea 2", questionId: "F11_NOTAS_MARCAS" },
      {
        answerJson: {
          nested: {
            brand: "Marca\tJSON",
            note: "Línea A\nLínea B"
          }
        },
        questionId: "JSON_ACCIDENTAL"
      }
    ];
    const secondRecord = exportAttempt({
      id: "second-structural-attempt",
      studyParticipant: {
        id: "study-participant-structural-2",
        participantProfile: {
          createdAt: new Date("2026-06-23T14:55:00Z"),
          email: "estructura@example.com",
          externalReference: "EST-2",
          id: "profile-structural-2",
          name: "Participante Estructura",
          phone: "5553334444"
        },
        studyId: study.id
      },
      questionnaireVersion: {
        definitionHash: "hash-open-answer",
        definitionJson: customDefinition,
        id: "version-open-answer",
        study,
        versionNumber: 1
      }
    });
    secondRecord.answers = [
      { answerJson: "MUJER", questionId: "F1_GENERO" },
      { answerJson: ["NAVIGO", "OTRA"], questionId: "F6_MARCAS" },
      { answerJson: "Sin caracteres raros", questionId: "F11_NOTAS_MARCAS" }
    ];
    const result = await exportScreeningAttemptsCsvForStudy({
      actor: admin,
      filters: {},
      repository: repository([record, secondRecord]),
      studyId: study.id
    });

    expect(result.ok ? result.data.fileContent : "").toContain("Marca A Marca B Marca C");
    expect(result.ok ? result.data.fileContent : "").toContain("Texto Unicode Ñandú línea 1 línea 2");
    expect(result.ok ? result.data.fileContent : "").toContain('"brand":"Marca JSON"');
    expect(result.ok ? result.data.fileContent : "").toContain("Motivo con tab y salto");
    expect(result.ok ? result.data.fileContent : "").not.toContain("Marca A\tMarca B");
    expect(result.ok ? result.data.fileContent : "").not.toContain("Marca B\nMarca C");

    if (result.ok) {
      const [header, ...rows] = splitTsvRows(result.data.fileContent);
      const headerColumnCount = header?.length ?? 0;
      const [row] = parseTsv(result.data.fileContent);

      expect(row?.F6_MARCAS).toBe("Navigo|Otra - Especificación: Marca A Marca B Marca C");
      expect(row?.F11_NOTAS_MARCAS).toBe("Texto Unicode Ñandú línea 1 línea 2");
      expect(row?.JSON_ACCIDENTAL).toBe('{"nested":{"brand":"Marca JSON","note":"Línea A Línea B"}}');
      expect(row?.["Motivo rechazo/revisión"]).toBe("Motivo con tab y salto");
      expect(rows).toHaveLength(2);
      expect(rows.every((cells) => cells.length === headerColumnCount)).toBe(true);
    }
  });

  it("uses OP1_RECLUTADOR as recruiter fallback when F0 is empty", async () => {
    const record = exportAttempt({
      id: "op-recruiter-attempt"
    });
    record.answers = [
      { answerJson: "", questionId: DETERGENT_RECRUITER_QUESTION_ID },
      { answerJson: "RECLUTADOR OPERATIVO", questionId: "OP1_RECLUTADOR" },
      { answerJson: "HOMBRE", questionId: "F1_GENERO" }
    ];
    const result = await exportScreeningAttemptsCsvForStudy({
      actor: admin,
      filters: {},
      repository: repository([record]),
      studyId: study.id
    });

    if (result.ok) {
      const [row] = parseTsv(result.data.fileContent);

      expect(row?.Reclutador).toBe("RECLUTADOR OPERATIVO");
      expect(row?.OP1_RECLUTADOR).toBe("RECLUTADOR OPERATIVO");
      expect(row?.F1_GENERO).toBe("Hombre");
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
    expect(result.ok ? result.data.fileContent : "").toContain("Folio\tNombre\tTeléfono\tWhatsApp");
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
