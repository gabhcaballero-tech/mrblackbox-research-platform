# First Admin Runbook

## Objetivo

Crear el primer acceso interno sin automatizar privilegios ni permitir que el primer usuario autenticado se convierta en administrador por accidente.

## Principio de seguridad

La aplicacion solo concede acceso interno cuando existen dos condiciones:

1. Un usuario existe en Supabase Auth.
2. Un registro `InternalUser` activo existe con `authUserId` igual al UUID de ese usuario Auth.

Sin ese registro vinculado, la aplicacion debe mostrar `/unauthorized`.

## Pasos manuales

1. Crear el usuario en Supabase Auth desde el panel de Supabase o un proceso administrativo aprobado.
2. Copiar solo el UUID del usuario Auth.
3. Crear o actualizar manualmente el registro correspondiente en `internal_users`.
4. Establecer:
   - `authUserId` con el UUID de Supabase Auth;
   - `role` como `ADMIN`;
   - `status` como `ACTIVE`;
   - `email` igual al correo operativo esperado.
5. Verificar que no exista otro `InternalUser` con el mismo `authUserId`.
6. Iniciar sesion en `/login`.
7. Confirmar acceso a `/admin`.

## Reglas

- No usar `service_role` en cliente ni navegador.
- No crear admins automaticamente desde la aplicacion.
- No publicar contrasenas, URLs privadas ni claves en documentos o commits.
- No reutilizar `authUserId` entre usuarios internos.
- Desactivar usuarios internos cambiando `status` a `INACTIVE`, no borrando auditoria historica.

## Pendiente para fases futuras

- Flujo administrativo controlado para altas y bajas de usuarios internos.
- Auditoria de cambios de rol y estado.
- Politicas RLS si se decide exponer acceso directo a Supabase.
- Procedimiento formal de recuperacion de acceso de emergencia.
