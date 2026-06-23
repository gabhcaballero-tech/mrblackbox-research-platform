import type { FoundationStatus } from "@/shared/validation/foundation";

const statusTones: Record<FoundationStatus, string> = {
  blocked: "border-red-200 bg-red-50 text-red-800",
  planned: "border-amber-200 bg-amber-50 text-amber-800",
  ready: "border-emerald-200 bg-emerald-50 text-emerald-800"
};

export function getStatusTone(status: FoundationStatus): string {
  return statusTones[status];
}
