"use client";

import { useFormStatus } from "react-dom";

type DangerSubmitButtonProps = {
  pendingLabel: string;
  children: string;
};

export function DangerSubmitButton({ children, pendingLabel }: DangerSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      className="rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:border-red-300 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:bg-zinc-100 disabled:text-zinc-500"
      disabled={pending}
      type="submit"
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
