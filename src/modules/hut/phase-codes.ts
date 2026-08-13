import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";

const HUT_PHASE_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ2346789";

export const HUT_PHASES_BY_SLOT = {
  1: "COLOCACION",
  2: "REGRESO_1",
  3: "REGRESO_2"
} as const;

export type HutPhase = (typeof HUT_PHASES_BY_SLOT)[keyof typeof HUT_PHASES_BY_SLOT];
export type HutPhaseCodeStatus = "EXPIRED" | "GENERATED" | "REVOKED" | "SENT" | "USED" | "VALIDATED";
export type HutPhaseCodeSlot = keyof typeof HUT_PHASES_BY_SLOT;

export const HUT_MASTER_REFERENCE_SLOT_BY_PHASE = {
  COLOCACION: 2,
  REGRESO_1: 3,
  REGRESO_2: null
} as const satisfies Record<HutPhase, 2 | 3 | null>;

export type HutOperationalReferenceCode = {
  code: string;
  slot: number;
};

export type HutOperationalPhaseCode = {
  codeHash?: string;
  encryptedCode?: string;
  id?: string;
  phase: HutPhase;
  slot: number;
  status: HutPhaseCodeStatus;
};

export type HutOperationalCodeParticipant = {
  phaseCodes?: HutOperationalPhaseCode[] | null;
  studyParticipant?: {
    participantConfirmation?: {
      referenceCodes?: HutOperationalReferenceCode[] | null;
    } | null;
  } | null;
};

export type HutOperationalCodeResolution =
  | {
      code: string;
      phase: HutPhase;
      slot: 2 | 3;
      source: "MASTER_REFERENCE_CODE";
    }
  | {
      encryptedCode?: string;
      legacyPhaseCode: HutOperationalPhaseCode;
      phase: HutPhase;
      source: "LEGACY_PHASE_CODE";
    }
  | {
      phase: HutPhase;
      reason: "NO_CODE_FOR_PHASE" | "MISSING_MASTER_REFERENCE_CODE";
      slot: 2 | 3 | null;
      source: "NO_OPERATIONAL_CODE";
    };

export function hutPhaseForSlot(slot: number): HutPhase | null {
  return HUT_PHASES_BY_SLOT[slot as HutPhaseCodeSlot] ?? null;
}

export function hutSlotForPhase(phase: HutPhase): HutPhaseCodeSlot {
  const entry = Object.entries(HUT_PHASES_BY_SLOT).find(([, value]) => value === phase);
  return Number(entry?.[0] ?? 1) as HutPhaseCodeSlot;
}

export function masterReferenceSlotForHutPhase(phase: HutPhase): 2 | 3 | null {
  return HUT_MASTER_REFERENCE_SLOT_BY_PHASE[phase];
}

export function resolveHutOperationalCode(
  participant: HutOperationalCodeParticipant,
  phase: HutPhase
): HutOperationalCodeResolution {
  const legacyCode = participant.phaseCodes?.find(
    (code) => code.phase === phase && (code.status === "USED" || code.status === "VALIDATED")
  );

  if (legacyCode) {
    return {
      encryptedCode: legacyCode.encryptedCode,
      legacyPhaseCode: legacyCode,
      phase,
      source: "LEGACY_PHASE_CODE"
    };
  }

  const slot = masterReferenceSlotForHutPhase(phase);
  if (!slot) {
    return {
      phase,
      reason: "NO_CODE_FOR_PHASE",
      slot,
      source: "NO_OPERATIONAL_CODE"
    };
  }

  const referenceCode = participant.studyParticipant?.participantConfirmation?.referenceCodes?.find(
    (code) => code.slot === slot
  );

  if (!referenceCode?.code) {
    return {
      phase,
      reason: "MISSING_MASTER_REFERENCE_CODE",
      slot,
      source: "NO_OPERATIONAL_CODE"
    };
  }

  return {
    code: referenceCode.code,
    phase,
    slot,
    source: "MASTER_REFERENCE_CODE"
  };
}

export function generateHutPhaseCode(): string {
  let code = "";
  const bytes = randomBytes(4);

  for (const byte of bytes) {
    code += HUT_PHASE_CODE_ALPHABET[byte % HUT_PHASE_CODE_ALPHABET.length];
  }

  return code;
}

export function normalizeHutPhaseCode(value: unknown): string {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();
}

export function hashHutPhaseCode(code: unknown, secret: string): string {
  return createHmac("sha256", secret)
    .update(`hut-phase-code:${normalizeHutPhaseCode(code)}`)
    .digest("hex");
}

export function encryptHutPhaseCode(code: unknown, secret: string): string {
  const key = createHash("sha256").update(secret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(normalizeHutPhaseCode(code), "utf8"),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url")
  ].join(":");
}

export function decryptHutPhaseCode(encryptedCode: string, secret: string): string {
  const [version, ivValue, tagValue, encryptedValue] = encryptedCode.split(":");

  if (version !== "v1" || !ivValue || !tagValue || !encryptedValue) {
    throw new Error("El codigo HUT cifrado no tiene un formato valido.");
  }

  const key = createHash("sha256").update(secret).digest();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

export function resolveHutPhaseCodeSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const candidate = env.HUT_PHASE_CODE_SECRET ?? env.PARTICIPANT_PORTAL_HASH_SECRET;
  const trimmed = candidate?.trim();

  return trimmed && trimmed.length >= 16 ? trimmed : null;
}
