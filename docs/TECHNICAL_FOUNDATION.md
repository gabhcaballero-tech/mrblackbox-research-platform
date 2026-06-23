# Technical Foundation

## Decisiones tecnicas aplicadas

- Next.js con App Router como base web.
- React para UI declarativa.
- TypeScript estricto desde `tsconfig.json`.
- Tailwind CSS configurado mediante PostCSS.
- Zod como capa inicial de validacion compartida.
- Vitest para pruebas unitarias de validacion y componentes.
- Playwright configurado para pruebas end-to-end futuras sin descargar navegadores ni agregar flujos complejos.
- Estructura modular inicial bajo `src/modules/` para separar dominios futuros.
- Componentes UI reutilizables bajo `src/shared/ui/`.
- Fases posteriores agregaron Prisma para persistencia preparada y Supabase Auth SSR para acceso interno. Ver `docs/PERSISTENCE_FOUNDATION.md` y `docs/AUTHORIZATION_FOUNDATION.md`.

## Comandos ejecutados

Comandos de inspeccion local ejecutados antes de modificar archivos:

```powershell
Get-ChildItem -Force
if (Test-Path package.json) { Get-Content package.json -Raw }
if (Get-Command rg -ErrorAction SilentlyContinue) { rg --files } else { Get-ChildItem -Recurse -File | ForEach-Object { $_.FullName } }
Get-Content README.md -Raw
node --version
npm --version
npm.cmd --version
```

`npm --version` fallo por la politica local de PowerShell para `npm.ps1`; se uso `npm.cmd --version` para comprobar npm sin cambiar configuracion del sistema.

Comandos ejecutados con aprobacion para instalar dependencias:

```powershell
npm.cmd install --save-exact next react react-dom zod
npm.cmd install --save-dev --save-exact typescript @types/node @types/react @types/react-dom eslint @eslint/eslintrc eslint-config-next tailwindcss @tailwindcss/postcss postcss vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom
npm.cmd install --save-dev --save-exact --ignore-scripts @playwright/test
```

Comandos de verificacion ejecutados:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
npm.cmd run test:e2e -- --list
```

Resultados:

- `npm.cmd run lint`: paso despues de ajustar `eslint.config.mjs` al formato flat config compatible con Next 16 y ESLint 9.
- `npm.cmd run typecheck`: paso despues de retirar `baseUrl`, que TypeScript 6 marca como obsoleto.
- `npm.cmd run test`: paso con 3 archivos de prueba y 4 pruebas.
- `npm.cmd run build`: paso; Next ajusto `tsconfig.json` a `jsx: react-jsx` y agrego `.next/dev/types/**/*.ts` al `include`.
- `npm.cmd run test:e2e -- --list`: paso y listo 0 pruebas en 0 archivos, sin ejecutar navegadores.

## Dependencias instaladas

Dependencias runtime:

- `next@16.2.9`
- `react@19.2.7`
- `react-dom@19.2.7`
- `zod@4.4.3`

Dependencias de desarrollo:

- `@eslint/eslintrc@3.3.5`
- `@playwright/test@1.61.0`
- `@tailwindcss/postcss@4.3.1`
- `@testing-library/jest-dom@6.9.1`
- `@testing-library/react@16.3.2`
- `@types/node@26.0.0`
- `@types/react@19.2.17`
- `@types/react-dom@19.2.3`
- `@vitejs/plugin-react@6.0.2`
- `eslint@9.39.4`
- `eslint-config-next@16.2.9`
- `jsdom@29.1.1`
- `postcss@8.5.15`
- `tailwindcss@4.3.1`
- `typescript@6.0.3`
- `vitest@4.1.9`

## Archivos relevantes creados

- `package.json`
- `package-lock.json`
- `.gitignore`
- `.env.example`
- `tsconfig.json`
- `next-env.d.ts`
- `next.config.ts`
- `eslint.config.mjs`
- `postcss.config.mjs`
- `vitest.config.ts`
- `vitest.setup.ts`
- `playwright.config.ts`
- `src/app/layout.tsx`
- `src/app/globals.css`
- `src/app/page.tsx`
- `src/app/admin/page.tsx`
- `src/app/field/page.tsx`
- `src/app/p/[token]/page.tsx`
- `src/app/api/health/route.ts`
- `src/shared/ui/*`
- `src/shared/validation/*`
- `src/shared/errors/*`
- `src/shared/types/*`
- `src/shared/utils/*`
- `src/modules/*/index.ts`
- `prisma/schema.prisma`
- `src/shared/auth/*`
- `proxy.ts`
- `docs/AUTHORIZATION_FOUNDATION.md`
- `docs/FIRST_ADMIN_RUNBOOK.md`

## Fuera de esta etapa

- Conexion activa a una base de datos remota, migraciones aplicadas o seeds.
- Registro publico, administracion real de usuarios o privilegios automaticos.
- Formularios de cuestionarios.
- Filtros, NSE, cuotas, rotaciones o sesiones funcionales.
- Servicios externos, correo, SMS, WhatsApp, almacenamiento de video o despliegue.
- Tabs anidados.
- Descarga de navegadores de Playwright.
