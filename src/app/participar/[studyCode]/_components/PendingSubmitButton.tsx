"use client";

import { useFormStatus } from "react-dom";

type PendingSubmitButtonProps = {
  className: string;
  disabled?: boolean;
  label: string;
  pendingLabel: string;
};

export function PendingSubmitButton({
  className,
  disabled = false,
  label,
  pendingLabel
}: PendingSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button className={className} disabled={disabled || pending} type="submit">
      {pending ? <LoadingLabel label={pendingLabel} /> : label}
    </button>
  );
}

export function LoadingLabel({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center justify-center gap-2">
      <span
        aria-hidden="true"
        className="h-4 w-4 animate-spin rounded-full border-2 border-white/70 border-t-transparent"
      />
      {label}
    </span>
  );
}
