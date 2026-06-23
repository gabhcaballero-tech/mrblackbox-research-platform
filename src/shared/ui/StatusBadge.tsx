import type { FoundationStatus } from "@/shared/validation/foundation";
import { getStatusTone } from "@/shared/utils/status";

type StatusBadgeProps = {
  status: FoundationStatus;
  children: string;
};

export function StatusBadge({ status, children }: StatusBadgeProps) {
  const tone = getStatusTone(status);

  return (
    <span
      className={`inline-flex w-fit items-center rounded-md border px-2.5 py-1 text-xs font-semibold ${tone}`}
    >
      {children}
    </span>
  );
}
