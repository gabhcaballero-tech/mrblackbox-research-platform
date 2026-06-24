"use client";

import { useState } from "react";
import { normalizeParticipantTextInput } from "@/modules/participant-portal/text-normalization";

type CommonProps = {
  className: string;
  defaultValue?: string;
  maxLength?: number;
  minLength?: number;
  name: string;
  required?: boolean;
};

export function NormalizedParticipantTextInput({
  defaultValue = "",
  ...props
}: CommonProps & {
  autoComplete?: string;
  inputMode?: "text";
  placeholder?: string;
}) {
  const [value, setValue] = useState(normalizeParticipantTextInput(defaultValue));

  return (
    <input
      {...props}
      value={value}
      onChange={(event) => setValue(normalizeParticipantTextInput(event.target.value))}
    />
  );
}

export function NormalizedParticipantTextArea({
  defaultValue = "",
  rows,
  ...props
}: CommonProps & {
  rows?: number;
}) {
  const [value, setValue] = useState(normalizeParticipantTextInput(defaultValue));

  return (
    <textarea
      {...props}
      rows={rows}
      value={value}
      onChange={(event) => setValue(normalizeParticipantTextInput(event.target.value))}
    />
  );
}
