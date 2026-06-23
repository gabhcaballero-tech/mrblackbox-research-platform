import {
  attributeDefinitionSchema,
  attributeRandomizationConfigSchema,
  otherAttributeAnswerSchema,
  participantAttributeOrderSchema,
  randomizationContextSchema,
  type AttributeDefinition,
  type AttributeGroup,
  type AttributeRandomizationConfig,
  type AttributeRandomizationResult,
  type OtherAttributeAnswer,
  type ParticipantAttributeOrder,
  type RandomizationContext
} from "./schemas";

export function buildAttributeRandomization(input: {
  attributes: AttributeDefinition[];
  selectedAttributeIds?: string[];
  contexts: RandomizationContext[];
  config: AttributeRandomizationConfig;
  seed: string;
  savedOrders?: ParticipantAttributeOrder[];
}): AttributeRandomizationResult {
  const attributes = input.attributes.map((attribute) => attributeDefinitionSchema.parse(attribute));
  const contexts = input.contexts.map((context) => randomizationContextSchema.parse(context));
  const config = attributeRandomizationConfigSchema.parse(input.config);
  const savedOrders = (input.savedOrders ?? []).map((order) =>
    participantAttributeOrderSchema.parse(order)
  );
  const selectedAttributes = selectAttributes(attributes, input.selectedAttributeIds);
  const ordersByKey: Record<string, ParticipantAttributeOrder> = {};
  const contextOrderKeys: Record<string, string> = {};
  const groupsByContextKey: Record<string, AttributeGroup[]> = {};

  for (const context of contexts) {
    const contextKey = getContextKey(context);
    const orderKey = config.shareOrderAcrossProducts ? "shared" : contextKey;
    const order =
      ordersByKey[orderKey] ??
      findSavedOrder(savedOrders, orderKey) ??
      createOrder(orderKey, context, selectedAttributes, config, input.seed);

    ordersByKey[orderKey] = order;
    contextOrderKeys[contextKey] = orderKey;
    groupsByContextKey[contextKey] = groupAttributes(order.orderedAttributeIds, config);
  }

  return {
    ordersByKey,
    contextOrderKeys,
    groupsByContextKey,
    finalQuestion: {
      text: config.finalQuestionText,
      responseOptions: ["yes", "no"],
      requiresTextWhen: "yes"
    }
  };
}

export function validateOtherAttributeAnswer(answer: OtherAttributeAnswer) {
  return otherAttributeAnswerSchema.safeParse(answer);
}

export function getContextKey(context: RandomizationContext): string {
  return `${context.type}:${context.id}`;
}

function selectAttributes(
  attributes: AttributeDefinition[],
  selectedAttributeIds: string[] | undefined
): AttributeDefinition[] {
  if (!selectedAttributeIds) {
    return attributes;
  }

  const byId = new Map(attributes.map((attribute) => [attribute.id, attribute]));
  return selectedAttributeIds.map((id) => {
    const attribute = byId.get(id);

    if (!attribute) {
      throw new Error(`Selected attribute "${id}" is not present in the attribute library.`);
    }

    return attribute;
  });
}

function findSavedOrder(
  savedOrders: ParticipantAttributeOrder[],
  orderKey: string
): ParticipantAttributeOrder | undefined {
  return savedOrders.find((order) => order.orderKey === orderKey);
}

function createOrder(
  orderKey: string,
  context: RandomizationContext,
  attributes: AttributeDefinition[],
  config: AttributeRandomizationConfig,
  seed: string
): ParticipantAttributeOrder {
  const orderedAttributeIds = shuffle(
    attributes.map((attribute) => attribute.id),
    `${seed}:${config.questionnaireVersionId}:${config.blockInstanceKey}:${orderKey}`
  );

  return {
    orderKey,
    contextType: config.shareOrderAcrossProducts ? "shared" : context.type,
    contextId: config.shareOrderAcrossProducts ? undefined : context.id,
    seed,
    questionnaireVersionId: config.questionnaireVersionId,
    blockInstanceKey: config.blockInstanceKey,
    orderedAttributeIds
  };
}

function groupAttributes(
  orderedAttributeIds: string[],
  config: AttributeRandomizationConfig
): AttributeGroup[] {
  const groups: AttributeGroup[] = [];

  for (let index = 0; index < orderedAttributeIds.length; index += config.groupSize) {
    groups.push({
      instructionText: config.instructionText,
      attributeIds: orderedAttributeIds.slice(index, index + config.groupSize)
    });
  }

  return groups;
}

function shuffle(values: string[], seed: string): string[] {
  const random = createSeededRandom(seed);
  const result = [...values];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const currentValue = result[index];
    result[index] = result[swapIndex];
    result[swapIndex] = currentValue;
  }

  return result;
}

function createSeededRandom(seed: string): () => number {
  let state = hashString(seed);

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function hashString(value: string): number {
  let hash = 2_166_136_261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }

  return hash >>> 0;
}
