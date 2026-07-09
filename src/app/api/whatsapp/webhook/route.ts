import { NextResponse, type NextRequest } from "next/server";
import { processOneuiWhatsAppWebhookPayload } from "@/modules/oneui-whatsapp";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const verifyToken = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (
    mode === "subscribe" &&
    challenge &&
    verifyToken &&
    verifyToken === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN
  ) {
    return new NextResponse(challenge, {
      headers: { "Content-Type": "text/plain" },
      status: 200
    });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(request: NextRequest) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  try {
    await processOneuiWhatsAppWebhookPayload({ payload });
  } catch {
    console.error("Failed to process WhatsApp webhook payload.");
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
