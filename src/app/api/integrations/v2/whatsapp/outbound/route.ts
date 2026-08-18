import { timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { mirrorV2OutboundMessage } from "@/modules/oneui-whatsapp";

export const runtime = "nodejs";

type V2OutboundPayload = {
  eventType: string | null;
  externalMessageId: string;
  messageId: string;
  mode: string | null;
  occurredAt: string;
  participant: {
    folio: string;
    name: string;
    phone: string;
  };
  source: string;
  templateName: string;
  type: string;
};

export async function POST(request: NextRequest) {
  const secret = process.env.V2_ONEUI_INBOX_SYNC_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ message: "Integración V2 no configurada." }, { status: 503 });
  }
  if (!isAuthorized(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  }

  const payload = parsePayload(await request.json().catch(() => null));
  if (!payload) {
    return NextResponse.json({ message: "Carga de mensaje V2 inválida." }, { status: 400 });
  }

  try {
    const message = await mirrorV2OutboundMessage({
      ...payload,
      occurredAt: new Date(payload.occurredAt)
    });
    return NextResponse.json({ id: message.id, ok: true });
  } catch {
    console.error("No fue posible reflejar un mensaje saliente de V2 en Oneui.", {
      messageId: payload.messageId
    });
    return NextResponse.json({ message: "No fue posible registrar el mensaje." }, { status: 500 });
  }
}

function isAuthorized(value: string | null, secret: string) {
  const expected = `Bearer ${secret}`;
  if (!value) return false;
  const left = Buffer.from(value);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function parsePayload(value: unknown): V2OutboundPayload | null {
  const record = asRecord(value);
  const participant = asRecord(record?.participant);
  const occurredAt = stringValue(record?.occurredAt);
  if (!record || !participant || !occurredAt || Number.isNaN(new Date(occurredAt).getTime())) return null;

  const fields = {
    eventType: nullableString(record.eventType),
    externalMessageId: stringValue(record.externalMessageId),
    messageId: stringValue(record.messageId),
    mode: nullableString(record.mode),
    occurredAt,
    participant: {
      folio: stringValue(participant.folio),
      name: stringValue(participant.name),
      phone: stringValue(participant.phone)
    },
    source: stringValue(record.source),
    templateName: stringValue(record.templateName),
    type: stringValue(record.type)
  };

  return Object.values(fields.participant).every(Boolean) &&
    fields.externalMessageId && fields.messageId && fields.source && fields.templateName && fields.type
    ? fields as V2OutboundPayload
    : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function nullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
