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

## Storage futuro

No se implemento Storage en este bloque.

Arquitectura prevista:

- Usar variable server-only `SUPABASE_SECRET_KEY` con clave `sb_secret_...`.
- Nunca exponer esa clave al navegador.
- Crear URL firmada de carga en servidor.
- Subir archivos directamente desde el navegador a Supabase Storage privado.
- No enviar imagenes a traves de Vercel Functions.
- Usar bucket privado `participant-evidence`.
- Usar URLs firmadas temporales para revision interna.

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

- UI del portal participante.
- OTP real con Supabase Auth.
- Supabase Storage y URLs firmadas reales.
- API de WhatsApp.
- Revision visual de evidencias.
- Aplicacion de migraciones.
- Cambios a versiones publicadas o respuestas reales.
- Conexiones a Supabase.
