export const V1_PARTICIPANT_MIGRATION_TITLE = "Este sistema ha migrado";

export const V1_PARTICIPANT_MIGRATION_MESSAGE =
  "Este sistema ha migrado a una nueva plataforma.\nPor favor contacta a tu reclutador para recibir tu nuevo enlace de acceso y continuar tu participación.";

export const V1_PARTICIPANT_MIGRATION_PATH = "/migracion-v1";

const V1_PARTICIPANT_ROUTE_PREFIXES = ["/participar/", "/p/", "/ctl/", "/hut/p/", "/hut/register/"];
const V1_PARTICIPANT_ROUTE_EXACT = new Set(["/participar", "/p", "/ctl", "/hut/p", "/hut/register"]);

export function isV1ParticipantOperationBlocked(): boolean {
  return true;
}

export function createV1ParticipantMigrationBlockedResult() {
  return {
    message: V1_PARTICIPANT_MIGRATION_MESSAGE,
    ok: false as const
  };
}

export function isV1ParticipantRoute(pathname: string): boolean {
  return (
    V1_PARTICIPANT_ROUTE_EXACT.has(pathname) ||
    V1_PARTICIPANT_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}
