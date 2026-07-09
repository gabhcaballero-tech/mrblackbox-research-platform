import { redirect } from "next/navigation";
import { getCurrentInternalAccess } from "@/shared/auth/session";
import { PUBLIC_FIELD_ACTOR, type FieldActor } from "./service";

export async function getFieldActorForRequest(): Promise<FieldActor> {
  const access = await getCurrentInternalAccess({ requiredCapability: "screening:apply" });

  if (access.status === "allowed") {
    return access.internalUser;
  }

  if (access.code === "NO_SESSION" || access.code === "NO_INTERNAL_USER") {
    return PUBLIC_FIELD_ACTOR;
  }

  redirect("/unauthorized");
}
