import { z } from "zod";

export const actorRoleSchema = z.enum(["admin", "supervisor", "interviewer", "analyst"]);

export type ActorRole = z.infer<typeof actorRoleSchema>;
