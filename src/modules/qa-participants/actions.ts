"use server";

import { requireCapability } from "@/shared/auth/session";
import { createQaParticipantsRepository } from "./repository";
import type {
  CleanupOrphanParticipantProfilesReport,
  LegacyQaCleanupPreview,
  LegacyQaCleanupReport,
  QaParticipantActionResult,
  QaParticipantExecutionMode,
  QaParticipantRunSummary,
  QaParticipantScenario
} from "./types";

const QA_SCENARIOS: QaParticipantScenario[] = ["CLT_ONLY", "CLT_NAVIGO", "CLT_NAVIGO_HUT", "HUT_DIRECTO"];
const QA_EXECUTION_MODES: QaParticipantExecutionMode[] = ["REALISTIC", "FAST_FORWARD"];

export async function createQaParticipantScenarioAction(input: {
  executionMode?: QaParticipantExecutionMode;
  scenario: QaParticipantScenario;
  studyId: string;
}): Promise<QaParticipantActionResult<QaParticipantRunSummary>> {
  const actor = await requireCapability("admin:access");
  const scenario = normalizeScenario(input.scenario);
  if (!scenario) {
    return { message: "Escenario QA no valido.", ok: false };
  }
  const executionMode = normalizeExecutionMode(input.executionMode);

  return createQaParticipantsRepository().createScenario({
    createdByUserId: actor.id,
    executionMode,
    scenario,
    studyId: input.studyId
  });
}

export async function cleanupQaParticipantRunAction(
  runId: string
): Promise<QaParticipantActionResult<QaParticipantRunSummary>> {
  const actor = await requireCapability("admin:access");

  return createQaParticipantsRepository().cleanupRun({
    cleanedByUserId: actor.id,
    runId
  });
}

export async function previewLegacyQaCleanupAction(input: {
  folios: string[];
  studyId: string;
}): Promise<LegacyQaCleanupPreview> {
  await requireCapability("admin:access");

  return createQaParticipantsRepository().previewLegacyCleanup(input);
}

export async function cleanupLegacyQaAuthorizedFoliosAction(input: {
  folios: string[];
  studyId: string;
}): Promise<QaParticipantActionResult<LegacyQaCleanupReport>> {
  const actor = await requireCapability("admin:access");

  return createQaParticipantsRepository().cleanupLegacyAuthorizedFolios({
    cleanedByUserId: actor.id,
    folios: input.folios,
    studyId: input.studyId
  });
}

export async function cleanupLegacyQaParticipantAction(input: {
  folios: string[];
  studyId: string;
}): Promise<QaParticipantActionResult<LegacyQaCleanupReport>> {
  const actor = await requireCapability("admin:access");

  return createQaParticipantsRepository().cleanupLegacyQaParticipant({
    cleanedByUserId: actor.id,
    folios: input.folios,
    studyId: input.studyId
  });
}

export async function cleanupOrphanParticipantProfilesAction(input: {
  studyId: string;
}): Promise<QaParticipantActionResult<CleanupOrphanParticipantProfilesReport>> {
  const actor = await requireCapability("admin:access");

  return createQaParticipantsRepository().cleanupOrphanParticipantProfiles({
    cleanedByUserId: actor.id,
    studyId: input.studyId
  });
}

function normalizeScenario(value: unknown): QaParticipantScenario | null {
  return QA_SCENARIOS.find((scenario) => scenario === value) ?? null;
}

function normalizeExecutionMode(value: unknown): QaParticipantExecutionMode {
  return QA_EXECUTION_MODES.find((mode) => mode === value) ?? "FAST_FORWARD";
}
