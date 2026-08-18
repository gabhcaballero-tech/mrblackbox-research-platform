import Link from "next/link";
import { V1_FIELD_SCREENING_BLOCK_MESSAGE, V1_FIELD_SCREENING_BLOCK_TITLE } from "@/modules/field/v1-screening-block";

type V1ScreeningBlockedNoticeProps = {
  showFieldLinks?: boolean;
};

export function V1ScreeningBlockedNotice({ showFieldLinks = true }: V1ScreeningBlockedNoticeProps) {
  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50 p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-wide text-amber-800">Campo V1 cerrado</p>
      <h1 className="mt-2 text-2xl font-semibold text-zinc-950">{V1_FIELD_SCREENING_BLOCK_TITLE}</h1>
      <p className="mt-3 whitespace-pre-line text-sm leading-6 text-zinc-800">{V1_FIELD_SCREENING_BLOCK_MESSAGE}</p>
      {showFieldLinks ? (
        <div className="mt-5 flex flex-wrap gap-3">
          <Link className={secondaryButtonClass} href="/field/dashboard">
            Seguimiento participantes
          </Link>
          <Link className={secondaryButtonClass} href="/field/hut">
            Captura HUT
          </Link>
        </div>
      ) : null}
    </section>
  );
}

const secondaryButtonClass =
  "inline-flex w-fit rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50";
