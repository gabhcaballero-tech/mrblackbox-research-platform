import { describe, expect, it } from "vitest";
import type { InternalUserRole } from "@/shared/auth/permissions";
import type { ScreenerDefinition } from "@/modules/screener";
import {
  getScreeningAttemptSupervisionDetail,
  listScreeningAttemptsForStudy,
  type ScreeningSupervisionActor
} from "./service";
import type {
  ScreeningSupervisionRepository,
  SupervisionAttemptDetailRecord,
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
        id: "profile-1",
        name: "Participante Uno",
        phone: "5550000000"
      },
      studyId: study.id
    },
    studyParticipantId: "study-participant-1",
    terminationCode: input.terminationCode ?? (status === "TERMINATED" ? "GENERO_NO_ELEGIBLE" : null),
    terminationReason: input.terminationReason ?? (status === "TERMINATED" ? "No califica." : null)
  };
}

function repository(records: SupervisionAttemptDetailRecord[] = [attempt()]): ScreeningSupervisionRepository {
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
});
