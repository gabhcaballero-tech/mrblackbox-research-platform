export type EvidenceReviewFocus = "confirmacion-final" | "datos-participante" | "evidencias" | "whatsapp" | "zona-peligro";

export function buildEvidenceReviewPath({
  attemptId,
  focus,
  key,
  value
}: {
  attemptId: string;
  focus?: EvidenceReviewFocus;
  key: "evidenceError" | "evidenceMessage";
  value: string;
}): string {
  const params = new URLSearchParams({ [key]: value });

  if (focus) {
    params.set("evidenceFocus", focus);
  }

  return `/admin/screening-attempts/${attemptId}?${params.toString()}${focus ? `#${focus}` : ""}`;
}
