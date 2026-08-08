"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createNavigoAppRepository } from "@/modules/navigo-app";
import { requireCapability } from "@/shared/auth/session";

export async function sendFieldNavigoEvaluationReminderNowAction(
  activityId: string,
  requestOrigin: string,
  returnTo: string,
  studyId: string
) {
  const actor = await requireCapability("field:access");
  const result = await createNavigoAppRepository().sendEvaluationReminderNow({
    actorUserId: actor.id,
    participantActivityId: activityId,
    requestOrigin,
    studyId
  });
  const params = new URLSearchParams();

  if (result.ok) {
    params.set("fieldOpsMessage", `Recordatorio ${result.data.activityCode} enviado correctamente.`);
  } else {
    params.set("fieldOpsError", result.message);
  }

  revalidatePath("/field/operations");
  redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}${params.toString()}`);
}
