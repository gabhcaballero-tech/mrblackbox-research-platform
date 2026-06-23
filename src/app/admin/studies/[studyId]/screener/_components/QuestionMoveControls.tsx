"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import {
  moveScreenerQuestionWithFeedbackAction,
  type ScreenerQuestionMoveActionState
} from "@/modules/screener/actions";
import { UI_LABELS } from "@/shared/ui/labels";

type MoveDirection = "down" | "up";

type QuestionMoveControlsProps = {
  moveAction?: (
    studyId: string,
    questionId: string,
    direction: MoveDirection,
    previousState: ScreenerQuestionMoveActionState,
    formData: FormData
  ) => Promise<ScreenerQuestionMoveActionState>;
  questionId: string;
  readOnly: boolean;
  studyId: string;
};

const initialState: ScreenerQuestionMoveActionState = {
  message: "",
  ok: false
};

export function QuestionMoveControls({
  moveAction = moveScreenerQuestionWithFeedbackAction,
  questionId,
  readOnly,
  studyId
}: QuestionMoveControlsProps) {
  const router = useRouter();
  const [moveUpState, moveUpFormAction] = useActionState(
    moveAction.bind(null, studyId, questionId, "up"),
    initialState
  );
  const [moveDownState, moveDownFormAction] = useActionState(
    moveAction.bind(null, studyId, questionId, "down"),
    initialState
  );
  const feedback =
    moveDownState.message.length > 0 ? moveDownState : moveUpState.message.length > 0 ? moveUpState : null;

  useEffect(() => {
    if (moveUpState.ok || moveDownState.ok) {
      router.refresh();
    }
  }, [moveDownState.ok, moveUpState.ok, router]);

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap gap-2">
        <MoveForm action={moveUpFormAction} disabled={readOnly}>
          {UI_LABELS.actions.moveUp}
        </MoveForm>
        <MoveForm action={moveDownFormAction} disabled={readOnly}>
          {UI_LABELS.actions.moveDown}
        </MoveForm>
      </div>

      {feedback?.message ? (
        <p
          className={`text-xs ${
            feedback.ok ? "text-emerald-700" : "text-rose-700"
          }`}
          role={feedback.ok ? "status" : "alert"}
        >
          {feedback.message}
        </p>
      ) : null}
    </div>
  );
}

function MoveForm({
  action,
  children,
  disabled
}: {
  action: (formData: FormData) => void;
  children: string;
  disabled: boolean;
}) {
  return (
    <form action={action}>
      <MoveButton disabled={disabled}>{children}</MoveButton>
    </form>
  );
}

function MoveButton({ children, disabled }: { children: string; disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button className={tinyButtonClass} disabled={disabled || pending} type="submit">
      {pending ? UI_LABELS.common.saving : children}
    </button>
  );
}

const tinyButtonClass =
  "inline-flex rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-400";
