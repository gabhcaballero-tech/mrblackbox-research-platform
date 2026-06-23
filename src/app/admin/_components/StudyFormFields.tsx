import type { StudyActionState } from "@/modules/studies/action-state";
import { DEFAULT_STUDY_TIME_ZONE } from "@/modules/studies/validation";

type StudyFormFieldsProps = {
  state: StudyActionState;
  defaults?: {
    code?: string;
    name?: string;
    timeZoneIana?: string;
  };
};

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) {
    return null;
  }

  return <p className="mt-1 text-xs font-medium text-red-700">{errors[0]}</p>;
}

export function StudyFormFields({ defaults, state }: StudyFormFieldsProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_12rem_14rem]">
      <label className="block">
        <span className="text-sm font-medium text-zinc-800">Nombre</span>
        <input
          className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
          defaultValue={defaults?.name}
          maxLength={120}
          name="name"
          required
        />
        <FieldError errors={state.fieldErrors?.name} />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-zinc-800">Codigo</span>
        <input
          className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm uppercase text-zinc-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
          defaultValue={defaults?.code}
          maxLength={32}
          name="code"
          required
        />
        <FieldError errors={state.fieldErrors?.code} />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-zinc-800">Zona horaria</span>
        <input
          className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
          defaultValue={defaults?.timeZoneIana ?? DEFAULT_STUDY_TIME_ZONE}
          name="timeZoneIana"
          required
        />
        <FieldError errors={state.fieldErrors?.timeZoneIana} />
      </label>
    </div>
  );
}
