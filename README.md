# MR Black Box Research Platform

Base tecnica inicial para una plataforma web de investigacion de mercados. Esta etapa prepara la estructura para futuros modulos de administracion, campo y participante sin implementar todavia la logica real de estudios.

## Proposito

El repositorio contiene una aplicacion Next.js con App Router, React, TypeScript estricto, Tailwind CSS, Zod, Vitest, Playwright configurado, Prisma preparado para PostgreSQL y fundacion de autenticacion interna con Supabase Auth. La base esta pensada para crecer por modulos sin activar aun cuestionarios, filtros, cuotas, rotaciones, videos ni servicios externos.

## Requisitos locales

- Node.js 20 o superior.
- npm 10 o superior.

En Windows con PowerShell, si `npm` esta bloqueado por la politica de ejecucion local, usa `npm.cmd`.

## Instalacion

```bash
npm install
```

## Ejecucion

```bash
npm run dev
```

La aplicacion queda disponible normalmente en `http://localhost:3000`.

## Verificaciones

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

`test:e2e` deja Playwright configurado y permite pasar sin pruebas end-to-end todavia. No se descargan navegadores en esta etapa.

## Estructura principal

```text
src/
  app/
    page.tsx
    admin/
    field/
    p/[token]/
    api/health/
  modules/
    studies/
    questionnaire-engine/
    screening/
    quotas/
    participants/
    activities/
    randomization/
    exports/
    audit/
    media-evidence/
  shared/
    auth/
    ui/
    validation/
    errors/
    types/
    utils/
```

## Autenticacion interna

La fundacion de autenticacion usa Supabase Auth para identidad y cookies SSR, mientras `InternalUser` conserva rol, estado y permisos de aplicacion. `/p/[token]` permanece publico. El primer Admin debe crearse manualmente siguiendo `docs/FIRST_ADMIN_RUNBOOK.md`.

## Fuera de esta etapa

La aplicacion aun no implementa cuestionarios, filtros, NSE, cuotas, rotaciones funcionales, evidencia de video, servicios externos ni flujos administrativos finales. Las migraciones y el alta real de usuarios internos deben ejecutarse de forma controlada en fases posteriores.
