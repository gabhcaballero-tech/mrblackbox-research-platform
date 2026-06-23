import Link from "next/link";
import { ErrorState } from "@/shared/ui/ErrorState";

export default function UnauthorizedPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-4 py-10">
      <ErrorState
        action={
          <div className="flex flex-wrap gap-3">
            <Link
              className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
              href="/login"
            >
              Volver a iniciar sesion
            </Link>
            <Link
              className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 transition hover:border-teal-600 hover:text-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
              href="/p/demo-token"
            >
              Ir a participante publico
            </Link>
          </div>
        }
        message="La sesion existe, pero no hay un usuario interno activo con permisos suficientes para esta area."
        title="Acceso interno no autorizado"
      />
    </main>
  );
}
