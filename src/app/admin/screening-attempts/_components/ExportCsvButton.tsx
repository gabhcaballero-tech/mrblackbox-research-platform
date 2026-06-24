export function ExportCsvButton({
  disabled = false,
  href
}: {
  disabled?: boolean;
  href: string;
}) {
  const className = `inline-flex w-fit rounded-md px-4 py-2 text-sm font-semibold transition ${
    disabled
      ? "cursor-not-allowed border border-zinc-200 bg-zinc-100 text-zinc-400"
      : "border border-teal-200 bg-teal-50 text-teal-700 hover:border-teal-300 hover:bg-teal-100"
  }`;

  if (disabled) {
    return (
      <span aria-disabled="true" className={className}>
        Exportar Excel (TSV)
      </span>
    );
  }

  return (
    <a className={className} href={href}>
      Exportar Excel (TSV)
    </a>
  );
}
