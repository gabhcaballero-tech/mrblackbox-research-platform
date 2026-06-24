# Participant Portal Foundation

## Alcance implementado

El Bloque 1 preparo la base tecnica del portal autoaplicable de participante sin implementar UI, OTP real, Storage real, WhatsApp API ni conexiones externas.

Se agregaron:

- Esquema Prisma para participante publico, configuracion del portal, consentimiento, evidencias, revision, confirmacion, codigos de referencia y logs de OTP hasheados.
- Migracion offline no aplicada: `20260623204421_add_participant_portal_foundation`.
- Contratos TypeScript y validaciones Zod en `src/modules/participant-portal`.
- Pruebas unitarias de dominio sin conexion a Supabase.

## Bloque 2: acceso publico por OTP

Se agrego la entrada publica:

- `/participar/[studyCode]`
- `/participar/[studyCode]/verificar`
- `/participar/[studyCode]/inicio`

El portal carga el estudio por `code` y solo permite avanzar si:

- el estudio esta `ACTIVE`;
- existe una version de screener `ACTIVE`;
- existe `ParticipantPortalStudyConfig`;
- `ParticipantPortalStudyConfig.enabled = true`.

Si algo falta, siempre se muestra el mismo mensaje publico: `El portal de participación no está disponible en este momento.`

El OTP del participante usa Supabase Auth con `shouldCreateUser: true` y `captchaToken`. No crea `InternalUser`, `ParticipantProfile` ni `StudyParticipant` en este bloque.

El login interno conserva `shouldCreateUser: false`, incluso si Supabase permite signup para participantes.

## Turnstile y rate limiting

- El frontend usa `NEXT_PUBLIC_TURNSTILE_SITE_KEY` y el script oficial de Cloudflare Turnstile.
- El boton `Enviar código` queda deshabilitado hasta tener token.
- El token se envia como `captchaToken` a Supabase Auth.
- No se usa `TURNSTILE_SECRET_KEY` en Vercel ni en el navegador.
- La capa propia de rate limiting usa `ParticipantPortalOtpRequestLog`.
- Correo e IP se guardan como HMAC-SHA-256 con `PARTICIPANT_PORTAL_HASH_SECRET`.
- No se guarda correo ni IP en texto plano.
- Se respeta `otpCooldownSeconds`.
- Los fallos de verificacion se registran como `OTP_VERIFY_FAILED` y se bloquean al llegar a `maxOtpAttempts`.

Variables requeridas:

- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
- `PARTICIPANT_PORTAL_HASH_SECRET`

## Decisiones de modelo

- `ParticipantProfile.participantAuthUserId` vincula al usuario participante de Supabase Auth sin crear `InternalUser`.
- `ParticipantProfile.createdByUserId`, `StudyParticipant.createdByUserId` y `ScreeningAttempt.fieldUserId` son nullable para permitir altas publicas.
- `ScreeningAttempt.source` distingue `FIELD` de `PARTICIPANT_PORTAL`.
- El portal solo debe operar cuando el estudio este `ACTIVE`, tenga screener publicado `ACTIVE` y `ParticipantPortalStudyConfig.enabled = true`.
- `ParticipantConsent` conserva version, hash y texto exacto del aviso aceptado.
- `ParticipantEvidence` es independiente de `MediaEvidencePlaceholder`; video futuro permanece intacto.
- La base guarda bucket y storage key privada, nunca URL publica persistente.
- `ParticipantScreeningReview` representa la revision humana posterior a un pase preliminar.
- `ParticipantConfirmation` guarda folio y estado de mensaje manual; los tres codigos viven en `ParticipantReferenceCode`.
- `ParticipantPortalStudyConfig` controla `folioPrefix`, `nextFolioSequence` y `folioMaxSequence` para generar folios como `NAV-001` a `NAV-999`.
- `ParticipantPortalOtpRequestLog` guarda `emailHash` e `ipHash`, no correo ni IP en texto plano.

## Flujo previsto

1. Participante entra al portal publico.
2. Captura identidad minima, correo OTP, celular E.164 y CAPTCHA.
3. Acepta aviso de privacidad; se conserva snapshot exacto.
4. Contesta screener publicado.
5. Si termina o NSE no es elegible, se muestra mensaje publico generico y no se solicitan fotos.
6. Si pasa preliminarmente reglas y NSE, se solicitan selfie y fotos de perfumes.
7. Se crea revision `PENDING`; el participante ve: `Tus respuestas y evidencias estan en revision.`
8. Admin/Supervisor revisa evidencias en una fase posterior.
9. Al aprobar, una transaccion futura incrementara `nextFolioSequence`, creara folio unico y exactamente tres codigos unicos.
10. El mensaje de WhatsApp sera manual: generar texto, copiarlo, abrir WhatsApp y marcar como enviado.

## Evidencias

Reglas preparadas:

- Exactamente una `SELFIE_IDENTIFICATION` por intento.
- Entre `minPerfumePhotos` y `maxPerfumePhotos` fotos `PERFUME_PHOTO`, por defecto 1 a 5.
- Fotos de perfumes pueden asociarse a `F6` u otra pregunta mediante `relatedQuestionId`.
- `maxImageBytes` queda configurable por estudio.
- `reviewStatus` permite `PENDING`, `APPROVED` y `REJECTED`.

La migracion agrega un indice unico parcial para impedir mas de una selfie por intento.

## Bloque 5: evidencias, revision interna y confirmacion

Se implemento el flujo publico de evidencias posterior al pase preliminar del screener:

- Ruta publica: `/participar/[studyCode]/evidencias`.
- Requiere sesion de participante, portal habilitado, consentimiento vigente, `StudyParticipant` y un intento de portal en `PENDING_REVIEW`.
- Solicita exactamente una selfie y entre una y cinco fotos de perfumes, segun configuracion del estudio.
- En la UI publica el participante solo puede capturar con camara; no se muestra selector de biblioteca/archivo.
- La carga usa `createSignedUploadUrl` en servidor y `uploadToSignedUrl` en cliente contra Storage privado.
- Las fotos de perfumes se registran con `relatedQuestionId = F6_MARCAS_UTILIZA`.
- Al completar evidencias, se asegura una `ParticipantScreeningReview` en estado `PENDING`.
- El resultado publico no expone razones internas, NSE, codigos de terminacion ni notas de revision.

La pantalla publica de resultado ahora distingue:

- Filtro terminado o evidencia rechazada: mensaje generico sin razon interna.
- Evidencia pendiente: enlace para continuar con evidencias.
- Revision pendiente: mensaje de seguimiento.
- Confirmacion aprobada: nombre, folio, tres codigos y boton para copiar datos.

## Storage privado

Se implemento la preparacion de Storage privado con URLs firmadas:

- Bucket esperado: `participant-evidence`.
- El servidor valida tipo, extension, tamano y cantidad antes de generar URL firmada.
- El navegador sube directamente al bucket privado con la URL firmada.
- Despues de subir, el cliente confirma la carga y el servidor crea `ParticipantEvidence`.
- La base guarda `storageBucket` y `privateStorageKey`; nunca guarda URL publica persistente.
- La revision interna usa URLs firmadas temporales de lectura.
- La clave `SUPABASE_SECRET_KEY` es server-only y no debe exponerse al navegador.

Configuracion manual requerida en Supabase Storage:

1. Crear bucket privado `participant-evidence`.
2. Mantener desactivado el acceso publico.
3. Verificar que el proyecto permita URLs firmadas de carga y lectura.
4. Configurar en Vercel la variable server-only `SUPABASE_SECRET_KEY`.
5. No usar service role ni secret key en componentes cliente.

## Revision interna

La revision de evidencias se integra al detalle de intento de supervision para ADMIN y SUPERVISOR:

- Muestra participante, telefono, correo, intento y marcas declaradas en F6.
- Muestra selfie y fotos de perfumes mediante URLs firmadas temporales.
- Permite aprobar o rechazar solo si la revision esta pendiente.
- INTERVIEWER no tiene permiso para revisar evidencias.

Correccion manual V1:

- ADMIN y SUPERVISOR pueden reemplazar la selfie o agregar/reemplazar fotos de perfume desde supervision.
- La correccion exige motivo interno obligatorio.
- La carga usa Storage privado con URL firmada de subida y no publica el bucket.
- Si la revision no estaba aprobada, la correccion la deja en `PENDING`.
- Sin migracion adicional no existe historial completo de reemplazos; se conserva la nota interna y la evidencia apunta al objeto privado vigente.

Al aprobar:

- La operacion corre en una transaccion.
- Es idempotente si ya existe `ParticipantConfirmation`.
- Exige evidencia completa y revision `PENDING`.
- Genera folio con `folioPrefix` y `nextFolioSequence`.
- Respeta `folioMaxSequence`; si se agota, bloquea con el mensaje configurado.
- Genera exactamente tres codigos globalmente unicos, sin PII.
- Marca revision y evidencias como `APPROVED`.
- Crea `ParticipantConfirmation` y tres `ParticipantReferenceCode` en slots 1, 2 y 3.

Al rechazar:

- Requiere motivo interno.
- Marca revision y evidencias como `REJECTED`.
- No crea folio, codigos ni confirmacion.
- El participante solo ve mensaje publico generico.

## WhatsApp manual

No se implemento API de WhatsApp ni envio automatico.

Despues de aprobar, supervision muestra:

- Mensaje listo para copiar.
- Boton `Copiar mensaje`.
- Boton `Abrir en WhatsApp` con `https://wa.me/<telefono_sin_+>?text=<mensaje_codificado>`.
- Boton `Marcar mensaje como enviado`.

El estado manual se guarda en `ParticipantConfirmation.manualMessageStatus`, con usuario y fecha de marcado.

Variables requeridas adicionales:

- `SUPABASE_SECRET_KEY`

## Checklist movil del portal

Pruebas manuales recomendadas:

### iPhone Safari

- Iniciar sesion con OTP del portal.
- Completar registro.
- Abrir camara frontal para selfie.
- Confirmar fallback si Safari niega permisos.
- Entrar al filtro.
- Llegar a F6 y abrir camara trasera.
- Tomar al menos una foto de perfume.
- Confirmar que no permita continuar en F6 sin foto.
- Revisar `/resultado` y `/evidencias` sin desbordes en 360 px.

### Android Chrome

- Iniciar sesion con OTP del portal.
- Completar registro y selfie.
- Verificar `capture="user"` como respaldo si falla `getUserMedia`.
- En F6 tomar varias fotos de perfume una por una.
- Confirmar contador visible y limite maximo de 5.
- Revisar mensajes de error de Storage sin exponer rutas ni tokens.

### Desktop Chrome

- Validar flujo con webcam para selfie.
- Validar flujo con webcam o selector de archivo como respaldo.
- Confirmar que `/evidencias` funciona como resumen o recuperacion y no como paso principal.
- Confirmar que el resultado elegible solo pase a revision cuando selfie y fotos ya existan.

## Migracion

Migracion creada:

- `prisma/migrations/20260623204421_add_participant_portal_foundation/migration.sql`

Estado:

- Generada/preparada offline.
- No aplicada a Supabase ni a ninguna base de datos.
- No modifica migraciones anteriores.
- No altera `MediaEvidenceType` ni `MediaEvidencePlaceholder`.

Resumen SQL:

- Crea 5 enums.
- Relaja 3 columnas existentes para permitir flujo publico.
- Agrega `ScreeningAttempt.source`.
- Crea 7 tablas nuevas.
- Agrega indices, llaves foraneas y checks para configuracion positiva, secuencia de folios y slots 1/2/3.
- Agrega unicidad para consentimiento por participante/version y para `privateStorageKey`.
- Agrega indice unico parcial para una selfie por intento.

## Fuera de alcance

- API de WhatsApp.
- Aplicacion de migraciones.
- Cambios a versiones publicadas o respuestas reales.
- Conexiones a Supabase.
- Envio automatico de WhatsApp.
- Edicion de evidencias despues de revision.
- Exposicion publica de URLs de Storage.
