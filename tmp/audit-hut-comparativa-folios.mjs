import fs from "node:fs";

const source = JSON.parse(fs.readFileSync("outputs/v1_master_participants_export/V1_MASTER_PARTICIPANTS_EXPORT.json", "utf8"));
const folios = ["NAV-117", "NAV-100", "NAV-110", "NAV-078", "NAV-124", "NAV-129"];
const parts = source.sheets.participants;
const activities = source.sheets.activities;
const answers = source.sheets.answers;
const evidence = source.sheets.evidence;

const result = folios.map((folio) => {
  const participant = parts.find((row) => row.navFolio === folio);
  const participantId = participant?.participantIdV1;
  const hutAnswers = answers.filter((row) => row.participantIdV1 === participantId && String(row.activity).startsWith("HUT"));
  const comparativaAnswers = hutAnswers.filter((row) => {
    const text = `${row.questionId ?? ""} ${row.questionText ?? ""}`;
    return /P2[4-7]|COMPARATIVA/i.test(text);
  });
  const hutActivities = activities.filter((row) => row.participantIdV1 === participantId && row.type === "HUT");
  const comparativaActivities = hutActivities.filter((row) => {
    const text = `${row.name ?? ""} ${row.status ?? ""}`;
    return /COMPARATIVA|SEGUNDA_VISITA|EVALUACION_SEGUNDO/i.test(text);
  });
  const hutEvidence = evidence.filter((row) => row.participantIdV1 === participantId && String(row.activity).startsWith("HUT"));
  return {
    folio,
    name: participant?.name ?? null,
    hutFolio: participant?.hutFolio ?? null,
    participantId,
    hutAnswersCount: hutAnswers.length,
    comparativaAnswers: comparativaAnswers.map((row) => ({
      questionId: row.questionId,
      questionText: row.questionText,
      answerReadable: row.answerReadable,
      answerJson: row.answerJson,
      answeredAt: row.answeredAt
    })),
    comparativaActivities: comparativaActivities.map((row) => ({
      name: row.name,
      status: row.status,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      updatedAt: row.updatedAt
    })),
    hutEvidence: hutEvidence.map((row) => ({
      activity: row.activity,
      evidenceType: row.evidenceType,
      date: row.date,
      fileReference: row.fileReference
    }))
  };
});

console.log(JSON.stringify(result, null, 2));
