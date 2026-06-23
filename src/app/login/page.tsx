import Link from "next/link";
import { sanitizeInternalNextPath } from "@/shared/auth/routes";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { signInWithPasswordAction } from "./actions";

type LoginPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = (await searchParams) ?? {};
  const nextPath = sanitizeInternalNextPath(params.next);
  const hasError = params.error === "credentials";

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-10">
      <section className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="space-y-3">
          <StatusBadge status="planned">Acceso interno V1</StatusBadge>
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">
              MR Black Box
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-zinc-950">Iniciar sesion</h1>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              Acceso solo para usuarios internos creados en Supabase Auth y vinculados a
              InternalUser.
            </p>
          </div>
        </div>

        {hasError ? (
          <div className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            No se pudo iniciar sesion con esas credenciales.
          </div>
        ) : null}

        <form action={signInWithPasswordAction} className="mt-6 space-y-4">
          <input name="next" type="hidden" value={nextPath} />

          <label className="block">
            <span className="text-sm font-medium text-zinc-800">Correo</span>
            <input
              autoComplete="email"
              className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
              name="email"
              required
              type="email"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-zinc-800">Contrasena</span>
            <input
              autoComplete="current-password"
              className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
              name="password"
              required
              type="password"
            />
          </label>

          <button
            className="w-full rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
            type="submit"
          >
            Entrar
          </button>
        </form>

        <p className="mt-6 text-center text-xs leading-5 text-zinc-500">
          No hay registro publico ni recuperacion de contrasena en esta etapa.{" "}
          <Link className="font-medium text-teal-700 hover:text-teal-800" href="/p/demo-token">
            Ruta participante publica
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
