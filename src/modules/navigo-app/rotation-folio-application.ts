import { createNavigoAppRepository } from "./repository";

export async function applyStoredNavigoRotationForParticipantBestEffort({
  actorUserId,
  context,
  studyParticipantId
}: {
  actorUserId: string;
  context: string;
  studyParticipantId: string;
}): Promise<void> {
  try {
    const result = await createNavigoAppRepository().applyStoredRotationForParticipant({
      actorUserId,
      studyParticipantId
    });

    if (!result.ok) {
      console.warn(
        `navigo stored rotation application skipped: context=${context} studyParticipantId=${studyParticipantId} message=${result.message}`
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.warn(
      `navigo stored rotation application failed: context=${context} studyParticipantId=${studyParticipantId} message=${message}`
    );
  }
}
