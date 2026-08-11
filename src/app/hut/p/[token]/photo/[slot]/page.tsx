import { notFound } from "next/navigation";
import {
  buildHutPhotoTimeline,
  createHutRepository,
  formatHutPhotoTimelineSlotTitle,
  type HutPhotoTimelineSlot,
  type HutPhotoTimelineSlotId
} from "@/modules/hut";
import { HutApplicationPhotoUploadForm } from "../../HutApplicationPhotoUploadForm";

export const dynamic = "force-dynamic";

type HutPhotoSlotPageProps = {
  params: Promise<{
    slot: string;
    token: string;
  }>;
};

export default async function HutPhotoSlotPage({ params }: HutPhotoSlotPageProps) {
  const { slot, token } = await params;
  const repository = createHutRepository();
  const result = await repository.getPortalView(token);

  if (!result.ok || result.data.protocolVersion !== "APPLICATION_PHOTO") {
    notFound();
  }

  const view = result.data;
  const timeline = buildHutPhotoTimeline({
    applicationEvidence: view.applicationEvidence,
    availableSlotId: view.availableApplicationPhoto?.slotId ?? null,
    dailyEntries: view.applicationPhotoEntries,
    legacyMirroredPlacementPhoto: view.legacyMirroredPlacementPhoto,
    product2GateOpen: view.product2GateOpen,
    rotation: {
      eva1: view.rotation.firstFragranceLeftArm,
      eva2: view.rotation.secondFragranceRightArm
    },
    testMode: view.testMode
  });
  const selectedSlot = timeline.find((candidate) => candidate.id === slot) ?? null;

  if (!selectedSlot?.participantTask) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <header className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">{view.folio ?? "HUT"}</p>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-950">{formatHutPhotoTimelineSlotTitle(selectedSlot)}</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Producto: {selectedSlot.productCode ?? "No asignado"}. Esta pantalla es solo para capturar la fotografia indicada.
          </p>
        </header>

        {selectedSlot.evidence ? (
          <PhotoSlotMessage
            href={`/hut/p/${encodeURIComponent(token)}`}
            message="Esta fotografia ya fue registrada. Puedes volver al seguimiento."
            title="Foto completada"
          />
        ) : selectedSlot.status !== "AVAILABLE" ? (
          <PhotoSlotMessage
            href={`/hut/p/${encodeURIComponent(token)}`}
            message={blockedSlotMessage(selectedSlot)}
            title="Foto no disponible"
          />
        ) : (
          <HutApplicationPhotoUploadForm
            instructions={photoInstructions(selectedSlot)}
            phase={selectedSlot.sourcePhase ?? (selectedSlot.id.startsWith("PRODUCT_2") ? "REGRESO_2" : "COLOCACION")}
            productCode={selectedSlot.productCode}
            slotId={selectedSlot.id as HutPhotoTimelineSlotId}
            title={formatHutPhotoTimelineSlotTitle(selectedSlot)}
            token={token}
          />
        )}
      </div>
    </main>
  );
}

function PhotoSlotMessage({
  href,
  message,
  title
}: {
  href: string;
  message: string;
  title: string;
}) {
  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 shadow-sm">
      <h2 className="text-xl font-semibold text-amber-950">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-amber-900">{message}</p>
      <a className="mt-4 inline-flex min-h-11 items-center rounded-md bg-amber-700 px-4 py-2 text-sm font-semibold text-white" href={href}>
        Volver al seguimiento
      </a>
    </section>
  );
}

function blockedSlotMessage(slot: HutPhotoTimelineSlot): string {
  if (slot.status === "BLOCKED") {
    return "Completa primero las fotografias anteriores del cronograma.";
  }
  return slot.availableDate
    ? `Esta actividad estara disponible a partir de ${slot.availableDate}.`
    : "Esta actividad todavia no esta programada para captura.";
}

function photoInstructions(slot: HutPhotoTimelineSlot): string {
  if (slot.id === "DELIVERY") {
    return "Toma una fotografia clara de la recepcion del producto.";
  }
  if (slot.id === "PRODUCT_1_DAY_1") {
    return "Toma una fotografia clara de la colocacion o aplicacion inicial del Producto 1.";
  }
  if (slot.id === "PRODUCT_2_DAY_1") {
    return "Toma una fotografia clara de la aplicacion inicial del Producto 2.";
  }

  return "Toma una fotografia clara del seguimiento del producto indicado.";
}
