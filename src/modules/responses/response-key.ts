import {
  researchResponseIdentitySchema,
  researchResponseKeyInputSchema,
  type ResearchResponseIdentity,
  type ResearchResponseKeyInput
} from "./schemas";

export type ResponseKeyValidationResult =
  | {
      success: true;
    }
  | {
      success: false;
      duplicateKeys: string[];
    };

export function buildResearchResponseKey(input: ResearchResponseKeyInput): string {
  const parsed = researchResponseKeyInputSchema.parse(input);
  const blockKey = parsed.blockInstanceKey ?? "none";

  switch (parsed.context.type) {
    case "none":
      return joinResponseKeyParts(parsed.questionId, blockKey, "none", "none");
    case "product":
      return joinResponseKeyParts(parsed.questionId, blockKey, "product", parsed.context.productId);
    case "arm":
      return joinResponseKeyParts(parsed.questionId, blockKey, "arm", parsed.context.armId);
  }
}

export function validateUniqueResponseKeys(
  responses: ResearchResponseIdentity[]
): ResponseKeyValidationResult {
  const seenKeys = new Set<string>();
  const duplicateKeys = new Set<string>();

  for (const responseInput of responses) {
    const response = researchResponseIdentitySchema.parse(responseInput);
    const key = `${response.participantActivityId}:${response.responseKey}`;

    if (seenKeys.has(key)) {
      duplicateKeys.add(key);
      continue;
    }

    seenKeys.add(key);
  }

  if (duplicateKeys.size > 0) {
    return {
      success: false,
      duplicateKeys: [...duplicateKeys]
    };
  }

  return {
    success: true
  };
}

function joinResponseKeyParts(
  questionId: string,
  blockInstanceKey: string,
  contextType: string,
  contextId: string
): string {
  return [
    `question=${encodeResponseKeyPart(questionId)}`,
    `block=${encodeResponseKeyPart(blockInstanceKey)}`,
    `context=${encodeResponseKeyPart(contextType)}`,
    `contextId=${encodeResponseKeyPart(contextId)}`
  ].join("|");
}

function encodeResponseKeyPart(value: string): string {
  return encodeURIComponent(value.trim());
}
