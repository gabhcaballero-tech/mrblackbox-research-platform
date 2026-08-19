export const V1_PARTICIPANT_MIGRATION_TITLE = "Este sistema ha migrado";

export const V1_PARTICIPANT_MIGRATION_MESSAGE =
  "Este sistema ha migrado a una nueva plataforma.\nPor favor contacta a tu reclutador para recibir tu nuevo enlace de acceso y continuar tu participación.";

export function isV1ParticipantOperationBlocked(): boolean {
  return true;
}

export function createV1ParticipantMigrationBlockedResult() {
  return {
    message: V1_PARTICIPANT_MIGRATION_MESSAGE,
    ok: false as const
  };
}
