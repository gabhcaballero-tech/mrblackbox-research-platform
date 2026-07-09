import { redirect } from "next/navigation";
import { getOneuiWhatsAppInbox, ONEUI_WHATSAPP_SOURCE_LABELS } from "@/modules/oneui-whatsapp";
import type {
  OneuiWhatsAppConversationDetail,
  OneuiWhatsAppConversationSummary,
  OneuiWhatsAppMessageRecord
} from "@/modules/oneui-whatsapp";
import { requireInternalUser } from "@/shared/auth/session";
import { AppShell } from "@/shared/ui/AppShell";
import { PageHeader } from "@/shared/ui/PageHeader";
import { StatusBadge } from "@/shared/ui/StatusBadge";

export const dynamic = "force-dynamic";

type OneuiWhatsAppPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function OneuiWhatsAppPage({ searchParams }: OneuiWhatsAppPageProps) {
  const search = (await searchParams) ?? {};
  const selectedConversationId = firstParam(search.conversationId) ?? null;
  const actor = await requireInternalUser();

  if (actor.role !== "ADMIN" && actor.role !== "SUPERVISOR") {
    redirect("/unauthorized");
  }

  const inbox = await getOneuiWhatsAppInbox({
    actor,
    conversationId: selectedConversationId
  });

  if (!inbox.ok) {
    redirect("/unauthorized");
  }

  const { conversations, selectedConversation } = inbox.data;

  return (
    <AppShell>
      <PageHeader
        actions={<StatusBadge status="ready">Admin / Supervisor</StatusBadge>}
        description="Bandeja general del número corporativo de ONEUI Research."
        eyebrow="ONEUI Research"
        title="ONEUI Research WhatsApp"
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(280px,0.42fr)_minmax(0,1fr)]">
        <ConversationList
          conversations={conversations}
          selectedConversationId={selectedConversation?.id ?? selectedConversationId}
        />
        <ConversationDetail conversation={selectedConversation} />
      </div>
    </AppShell>
  );
}

function ConversationList({
  conversations,
  selectedConversationId
}: {
  conversations: OneuiWhatsAppConversationSummary[];
  selectedConversationId: string | null;
}) {
  return (
    <section className="min-h-[28rem] rounded-lg border border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 px-4 py-3">
        <h2 className="text-base font-semibold text-zinc-950">Conversaciones</h2>
      </div>
      {conversations.length === 0 ? (
        <p className="px-4 py-6 text-sm text-zinc-600">Todavía no hay mensajes de WhatsApp.</p>
      ) : (
        <div className="divide-y divide-zinc-100">
          {conversations.map((conversation) => {
            const latestMessage = conversation.messages[0] ?? null;
            const selected = conversation.id === selectedConversationId;

            return (
              <a
                className={`block px-4 py-4 transition hover:bg-zinc-50 ${
                  selected ? "bg-teal-50" : "bg-white"
                }`}
                href={`/admin/oneui/whatsapp?conversationId=${conversation.id}`}
                key={conversation.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-zinc-950">
                      {conversation.profileName ?? conversation.phoneNumber}
                    </p>
                    <p className="mt-1 truncate text-xs text-zinc-500">
                      {conversation.phoneNumber} / {conversation.waId}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-zinc-500">
                    {formatDate(conversation.lastMessageAt ?? latestMessage?.timestamp ?? conversation.updatedAt)}
                  </span>
                </div>
                <p className="mt-3 line-clamp-2 text-sm text-zinc-700">
                  {latestMessage?.bodyText ?? latestMessage?.messageType ?? "Sin texto"}
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-md bg-zinc-100 px-2 py-1 font-medium text-zinc-700">
                    {ONEUI_WHATSAPP_SOURCE_LABELS[conversation.sourceModule]}
                  </span>
                  {latestMessage?.status ? (
                    <span className="rounded-md bg-zinc-100 px-2 py-1 font-medium text-zinc-700">
                      {latestMessage.status}
                    </span>
                  ) : null}
                </div>
              </a>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ConversationDetail({ conversation }: { conversation: OneuiWhatsAppConversationDetail | null }) {
  if (!conversation) {
    return (
      <section className="rounded-lg border border-zinc-200 bg-white px-5 py-10 text-center">
        <h2 className="text-lg font-semibold text-zinc-950">Sin conversación seleccionada</h2>
        <p className="mt-2 text-sm text-zinc-600">Cuando llegue un mensaje, aparecerá aquí el historial.</p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 px-5 py-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-950">
              {conversation.profileName ?? conversation.phoneNumber}
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              {conversation.phoneNumber} / {conversation.waId}
            </p>
          </div>
          <span className="w-fit rounded-md bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700">
            {ONEUI_WHATSAPP_SOURCE_LABELS[conversation.sourceModule]}
          </span>
        </div>
      </div>

      <div className="space-y-4 px-4 py-5">
        {conversation.messages.length === 0 ? (
          <p className="text-sm text-zinc-600">No hay mensajes guardados para esta conversación.</p>
        ) : (
          conversation.messages.map((message) => <MessageBubble key={message.id} message={message} />)
        )}
      </div>
    </section>
  );
}

function MessageBubble({ message }: { message: OneuiWhatsAppMessageRecord }) {
  const inbound = message.direction === "INBOUND";

  return (
    <article className={`flex ${inbound ? "justify-start" : "justify-end"}`}>
      <div
        className={`w-full max-w-2xl rounded-lg border px-4 py-3 ${
          inbound ? "border-zinc-200 bg-zinc-50" : "border-teal-200 bg-teal-50"
        }`}
      >
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-zinc-600">
          <span>{inbound ? "Entrante" : "Saliente"}</span>
          <span>{message.messageType}</span>
          {message.status ? <span>{message.status}</span> : null}
          <span>{formatDate(message.timestamp ?? message.createdAt)}</span>
        </div>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-950">
          {message.bodyText ?? "Sin texto"}
        </p>
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-semibold text-zinc-600">
            Raw payload
          </summary>
          <pre className="mt-2 max-h-80 overflow-auto rounded-md bg-zinc-950 p-3 text-xs leading-5 text-zinc-100">
            {JSON.stringify(message.rawPayload, null, 2)}
          </pre>
        </details>
      </div>
    </article>
  );
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function formatDate(value: Date | null | undefined): string {
  if (!value) {
    return "Sin fecha";
  }

  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Mexico_City"
  }).format(value);
}
