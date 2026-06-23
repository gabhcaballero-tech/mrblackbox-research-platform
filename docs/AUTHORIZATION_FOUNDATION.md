# Authorization Foundation

## Alcance

Esta fase agrega la base tecnica para autenticacion interna con Supabase Auth y autorizacion de aplicacion con `InternalUser`.

No agrega registro publico, recuperacion de contrasena, magic links, OAuth, invitaciones, administracion de usuarios, RLS, servicios externos ni acceso de participante autenticado.

## Dependencias instaladas

Instaladas con aprobacion:

- `@supabase/ssr@0.12.0`
- `@supabase/supabase-js@2.108.2`

## Variables de entorno

`.env.example` documenta solo placeholders publicos de Supabase:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

No se agrega `service_role`. La contrasena, `DATABASE_URL`, service role key y cualquier secreto deben mantenerse en variables privadas y nunca en cliente.

## Archivos relevantes

- `proxy.ts`: refresca la sesion SSR por cookies y redirige rutas internas sin sesion hacia `/login`.
- `src/shared/auth/supabase/server.ts`: crea cliente SSR por request con cookies.
- `src/shared/auth/supabase/browser.ts`: prepara cliente browser solo con variables publicas.
- `src/shared/auth/session.ts`: resuelve identidad Supabase y usuario interno activo vinculado.
- `src/shared/auth/permissions.ts`: matriz V1 de roles y capacidades.
- `src/shared/auth/routes.ts`: rutas publicas, rutas internas y sanitizacion de `next`.
- `src/app/login/page.tsx`: formulario V1 de email/password.
- `src/app/login/actions.ts`: accion server-side de inicio de sesion.
- `src/app/logout/route.ts`: cierre de sesion.
- `src/app/unauthorized/page.tsx`: denegacion por usuario interno ausente, inactivo o sin permiso.

## Modelo de identidad y permisos

Supabase Auth es la fuente de identidad y sesion. La tabla `InternalUser` es la fuente de rol, estado y permisos internos.

`InternalUser.authUserId` vincula el usuario interno con el UUID de Supabase Auth. Es nullable para permitir preparar usuarios internos antes de vincularlos y unico para impedir que un usuario Auth controle mas de una identidad interna.

La identidad se valida server-side. La capa intenta usar `getClaims()` si el cliente instalado lo expone y usa `auth.getUser()` como equivalente seguro cuando no esta disponible.

La aplicacion deniega acceso interno si:

- no hay sesion de Supabase;
- no existe `InternalUser.authUserId` correspondiente;
- el usuario interno esta inactivo;
- el rol no tiene la capacidad requerida.

## Matriz V1

- `ADMIN`: acceso completo.
- `SUPERVISOR`: acceso de campo, seguimiento operativo, PII operativa, correcciones y reapertura con auditoria; no ve claves reales de producto.
- `INTERVIEWER`: acceso de campo, screening, alta operativa y captura de hora de aplicacion; no administra estudios, cuotas, exportaciones ni claves reales.
- `ANALYST`: exportaciones anonimizadas; no PII.

## Rutas

- `/admin`: requiere `admin:access`, por ahora solo `ADMIN`.
- `/field`: requiere `field:access`, permitido para `ADMIN`, `SUPERVISOR` e `INTERVIEWER`.
- `/p/[token]`: permanece publico y no requiere login.
- `/login`, `/unauthorized` y `/api/health`: publicas.

El proxy solo comprueba sesion y no consulta Prisma. Las decisiones detalladas de rol se hacen en servidor con `requireCapability`.

## Seguridad aplicada

- No se usa service role key.
- No se usa Supabase Data API para tablas de negocio.
- No hay Prisma ni `DATABASE_URL` en cliente.
- `next` se sanitiza para permitir solo rutas internas relativas conocidas.
- El acceso participante publico no expone credenciales internas, claves reales de producto ni PII innecesaria.

## Migracion

Migracion creada y no aplicada:

- `20260622220438_add_internal_user_auth_user_id`

Resumen:

- agrega `internal_users.authUserId` como `UUID` nullable;
- crea indice unico `internal_users_authUserId_key`.

Esta migracion no se aplico a Supabase. Queda pendiente de revision y despliegue controlado.

## Pruebas

Se agregaron pruebas unitarias para:

- matriz rol/capacidad;
- redireccion de rutas internas sin sesion;
- ruta participante publica;
- sanitizacion de `next`;
- sesion sin `InternalUser`;
- usuario interno inactivo;
- `ADMIN` permitido en admin;
- `INTERVIEWER` permitido en campo y denegado en admin;
- `ANALYST` sin PII;
- `SUPERVISOR` sin claves reales de producto.

## Fuera de esta fase

- Crear usuarios en Supabase automaticamente.
- Convertir el primer usuario autenticado en admin.
- Leer o escribir secretos desde el navegador.
- Aplicar migraciones.
- Conectar a Supabase durante pruebas locales.
- RLS y politicas SQL.
- Dashboards funcionales, filtros, cuestionarios, videos o exportaciones reales.
