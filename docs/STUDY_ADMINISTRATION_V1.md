# Study Administration V1

## Alcance

Esta fase convierte `/admin` en una administracion funcional inicial para estudios en borrador.

Incluye:

- listado de estudios;
- creacion de estudios en estado `DRAFT`;
- edicion compacta de `name`, `code` y `timeZoneIana` solo mientras el estudio siga en `DRAFT`;
- autorizacion server-side para `ADMIN`;
- validacion compartida con Zod;
- repositorio Prisma server-only;
- pruebas unitarias sin conexion real a Supabase.

No incluye productos, brazos, rotaciones, cuotas, cuestionarios, participantes, filtros, exportaciones, cambio de estado, eliminacion ni administracion de usuarios.

## Modelo y migracion

Se agrego `Study.code`:

```prisma
code String @unique
```

Migracion nueva, manual, aditiva y no aplicada:

- `20260622230824_add_study_code`

SQL:

```sql
ALTER TABLE "studies" ADD COLUMN "code" TEXT NOT NULL;

CREATE UNIQUE INDEX "studies_code_key" ON "studies"("code");
```

Antes de aplicar esta migracion se debe verificar manualmente que la tabla `studies` no tenga registros previos. Si existieran registros, haria falta una estrategia de backfill antes de imponer `NOT NULL`.

## Seguridad

- `/admin` llama `requireCapability("admin:access")`.
- Las Server Actions vuelven a exigir `requireCapability("admin:access")`.
- El rol, creador y estado no se aceptan desde formularios.
- La creacion registra `createdByUserId` desde el ADMIN autenticado.
- Prisma se usa solo del lado servidor.
- No se usa Supabase Data API para tablas de negocio.
- No se exponen `DATABASE_URL`, Prisma ni datos internos al navegador.

## Validaciones

`name`:

- obligatorio;
- recorta extremos;
- colapsa espacios internos repetidos;
- exige al menos un caracter visible;
- maximo 120 caracteres.

`code`:

- obligatorio;
- normaliza a mayusculas;
- convierte espacios y `_` a `-`;
- colapsa guiones repetidos;
- elimina guiones iniciales y finales;
- exige `^[A-Z0-9]+(?:-[A-Z0-9]+)*$`;
- longitud entre 2 y 32 caracteres;
- unico globalmente por restriccion de base de datos.

`timeZoneIana`:

- obligatorio;
- valida con `Intl.supportedValuesOf("timeZone")` cuando esta disponible;
- valida tambien con `Intl.DateTimeFormat`;
- la UI precarga `America/Mexico_City`.

`status`:

- creacion siempre `DRAFT`;
- no se acepta desde formulario;
- la edicion solo funciona con condicion atomica `id + status = DRAFT`.

## Flujo de `/admin`

1. Server Component valida `ADMIN`.
2. Consulta estudios con campos minimos: `id`, `name`, `code`, `status`, `timeZoneIana`, `createdAt`, `updatedAt`.
3. Ordena por `createdAt` descendente.
4. Muestra formulario de creacion.
5. Muestra estado vacio con boton "Crear estudio" cuando no hay registros.
6. Muestra lista de estudios.
7. Para `DRAFT`, muestra formulario compacto de edicion.
8. Para no `DRAFT`, muestra modo solo lectura.

## Archivos principales

- `src/modules/studies/validation.ts`
- `src/modules/studies/repository.ts`
- `src/modules/studies/service.ts`
- `src/modules/studies/actions.ts`
- `src/app/admin/page.tsx`
- `src/app/admin/_components/StudyCreateForm.tsx`
- `src/app/admin/_components/StudyEditForm.tsx`
- `src/app/admin/_components/StudyList.tsx`
- `src/app/admin/_components/StudyEmptyState.tsx`

## Pruebas

Se agregaron pruebas para:

- normalizacion y validacion de nombre, codigo y zona horaria;
- codigo duplicado;
- creacion valida en estado `DRAFT`;
- registro correcto del creador;
- `ADMIN` autorizado;
- no sesion o no `ADMIN` denegados;
- edicion de `DRAFT` permitida;
- edicion de estudio no `DRAFT` rechazada;
- estado vacio;
- orden descendente por creacion.

## Pendiente

- Aplicar migracion en entorno controlado despues de verificar que `studies` este vacia.
- Crear datos reales solo cuando el ADMIN inicial este vinculado.
- Agregar cambio de estado de estudio en una fase posterior.
- Agregar productos, brazos, rotaciones, cuotas y cuestionarios en fases separadas.
