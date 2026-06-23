export const INTERNAL_USER_ROLES = ["ADMIN", "SUPERVISOR", "INTERVIEWER", "ANALYST"] as const;

export type InternalUserRole = (typeof INTERNAL_USER_ROLES)[number];

export const INTERNAL_USER_STATUSES = ["ACTIVE", "INACTIVE"] as const;

export type InternalUserStatus = (typeof INTERNAL_USER_STATUSES)[number];

export const CAPABILITIES = [
  "admin:access",
  "field:access",
  "screening:apply",
  "participants:create",
  "participants:pii:read",
  "application-time:record",
  "application-time:correct-before-start",
  "application-time:correct-after-start",
  "activity:reopen",
  "exports:anonymized",
  "exports:pii",
  "quota:manage",
  "rotation:register",
  "rotation:change",
  "product-real:read"
] as const;

export type Capability = (typeof CAPABILITIES)[number];

const ALL_CAPABILITIES = new Set<Capability>(CAPABILITIES);

export const ROLE_CAPABILITIES: Record<InternalUserRole, ReadonlySet<Capability>> = {
  ADMIN: ALL_CAPABILITIES,
  SUPERVISOR: new Set<Capability>([
    "field:access",
    "screening:apply",
    "participants:create",
    "participants:pii:read",
    "application-time:record",
    "application-time:correct-before-start",
    "application-time:correct-after-start",
    "activity:reopen",
    "exports:anonymized",
    "exports:pii",
    "rotation:register"
  ]),
  INTERVIEWER: new Set<Capability>([
    "field:access",
    "screening:apply",
    "participants:create",
    "application-time:record",
    "rotation:register"
  ]),
  ANALYST: new Set<Capability>(["exports:anonymized"])
};

export function hasCapability(role: InternalUserRole, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role].has(capability);
}

export function listCapabilities(role: InternalUserRole): Capability[] {
  return [...ROLE_CAPABILITIES[role]];
}
