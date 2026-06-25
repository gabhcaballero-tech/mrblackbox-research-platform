# Persistence Foundation

## Dependencias propuestas e instaladas

Instaladas con aprobacion:

- `@prisma/client@7.8.0`
- `@prisma/adapter-pg@7.8.0`
- `pg@8.22.0`
- `dotenv@17.4.2`
- `prisma@7.8.0`
- `@types/pg@8.20.0`

Instaladas posteriormente para la fundacion de autenticacion interna:

- `@supabase/ssr@0.12.0`
- `@supabase/supabase-js@2.108.2`

## Archivos creados o modificados

- `prisma/schema.prisma`
- `prisma.config.ts`
- `prisma/migrations/20260622213013_initial_persistence_foundation/migration.sql`
- `prisma/migrations/20260622220438_add_internal_user_auth_user_id/migration.sql`
- `prisma/migrations/20260622230824_add_study_code/migration.sql`
- `prisma/migrations/20260623003740_add_screener_pending_review_evaluation/migration.sql`
- `prisma/migrations/20260623082108_add_screener_question_library/migration.sql`
- `prisma/migrations/migration_lock.toml`
- `prisma/migrations/20260625144216_add_navigo_app_foundation/migration.sql`
- `src/shared/db/client.ts`
- `src/shared/db/index.ts`
- `.env.example`
- `docs/PERSISTENCE_FOUNDATION.md`
- `package.json`
- `package-lock.json`

## Entidades y relaciones

El esquema prepara PostgreSQL con Prisma para:

- Usuarios internos: `InternalUser` con roles V1 `ADMIN`, `SUPERVISOR`, `INTERVIEWER` y `ANALYST`, mas `authUserId` nullable/unico para vincular Supabase Auth.
- Estudios: `Study` con codigo unico, zona horaria IANA, estado y relacion con productos, brazos, cuestionarios, cuotas, actividades y exportaciones.
- Productos y brazos: `StudyProduct` guarda clave interna, etiqueta visible y nombre real; `StudyArm` permite brazo izquierdo, derecho y extension futura.
- Rotacion: `RotationPlan` y `RotationPlanArm` definen codigos manuales; `ParticipantRotationAssignment` y `ParticipantArmAssignment` guardan la asignacion explicita por participacion.
- Participantes: `ParticipantProfile` guarda PII y no contiene `studyId`; `StudyParticipant` une persona y estudio con estados operativos.
- Acceso participante: `ParticipantAccessToken` guarda hash, expiracion, revocacion y reemplazo de tokens.
- Cuestionarios: `QuestionnaireDraft` conserva borradores editables; `QuestionnaireVersion` conserva snapshots publicados e inmutables por version/hash.
- Biblioteca: `LibraryItem`, `LibraryItemRevision` y `QuestionnaireAttributeSet` preservan revisiones usadas por cuestionarios publicados.
- Biblioteca de screener V1: `LibraryItem` agrega metadatos buscables y alcance; `LibraryItemRevision` agrega estado, hash y retiro lógico; `QuestionnaireDraftLibraryUse` conserva trazabilidad histórica de inserciones sin dependencia viva.
- Screening: `ScreeningAttempt` y `ScreeningAnswer` vinculan filtros y respuestas a la participacion, no al perfil personal.
- Screening V1 agrega `PENDING_REVIEW` y `ScreeningAttempt.evaluationJson` para guardar resultado seguro de evaluacion, banderas, razones, faltantes y NSE sin PII crudo.
- Cuotas: `QuotaDefinition` guarda criterios flexibles y etapa; `QuotaEvaluation` registra match, conteo, cuota llena y aviso sin bloqueo.
- Hora de aplicacion: `ApplicationTimeEvent` registra alta y correccion de `applicationStartedAt` con usuario, motivo y estado de actividades.
- Actividades: `ActivitySchedule` define mediciones, video futuro y seguimiento; `ParticipantActivity` instancia horarios, ventanas, ocurrencia y estados por participacion.
- Evidencia por actividad: `ParticipantActivityEvidence` guarda selfies u otras evidencias ligadas a una medicion concreta, sin mezclarla con el screener.
- Respuestas: `ResearchResponse` guarda respuestas por actividad, `responseKey`, version de cuestionario, pregunta, bloque y contexto de producto o brazo.
- Aleatorizacion: `AttributeRandomizationConfig` y `ParticipantAttributeOrder` guardan configuracion y orden persistente por participacion, version, bloque y contexto.
- Seguimientos: `ReminderLog` registra seguimiento interno sin integrar correo, SMS o WhatsApp.
- Video futuro: `MediaEvidencePlaceholder` guarda solo metadatos privados, consentimiento, revision y retencion futura.
- Exportaciones: `ExportJob` prepara solicitudes CSV/XLSX y modo de privacidad.
- Auditoria: `AuditLog` cubre eventos definidos en V1, como publicacion/retiro, correccion de hora, tokens, actividad reabierta, rotacion y cuotas.

## Decisiones de modelado

- Prisma 7 usa `prisma.config.ts` para la URL del datasource; `schema.prisma` declara solo `provider = "postgresql"`.
- `prisma.config.ts` usa `env("DATABASE_URL")` desde `prisma/config` sin fallback ni URL ficticia. Debe fallar claramente si falta `DATABASE_URL`.
- `.env.example` incluye solo un placeholder de `DATABASE_URL`; no se uso ni se leyo ningun `.env` real.
- El cliente en `src/shared/db/client.ts` se preparo como fabrica lazy para no requerir `prisma generate` durante esta etapa.
- La rotacion de dos brazos se modela con asignaciones por brazo, no con un unico `assignedArmId`.
- El producto real se mantiene en `StudyProduct.realName`; la etiqueta ciega para participante se guarda separada en `participantVisibleLabel`.
- JSON se usa para definiciones flexibles, respuestas y metadatos, pero las relaciones principales son tablas con llaves foraneas.
- `QuotaEvaluation.blocksInterview` existe y queda por defecto en `false`, reflejando la regla V1 de aviso no bloqueante.
- El orden de atributos tiene `orderKey` para evitar duplicados por participacion, version, bloque y contexto, incluyendo orden compartido.
- `ActivitySchedule.recurrenceJson` puede describir recurrencia futura, pero cada instancia generada debe persistirse como `ParticipantActivity` con `occurrenceKey` propio.
- `ActivitySchedule.code` queda nullable para no forzar backfill peligroso, pero la fundacion de Navigo exige `code` en servicio para `T0_SALON`, `T2_HORAS`, `T4_HORAS` y `T8_HORAS`.
- Las mediciones no recurrentes deben usar una ocurrencia estandar, como `DEFAULT`.
- `ResearchResponse.responseKey` debe construirse deterministamente con pregunta, bloque y contexto; no debe contener PII.
- La consistencia de estudio para rotacion manual queda como regla obligatoria de aplicacion antes de persistir, no como trigger ni SQL manual.
- `Study.code` es unico globalmente y se normaliza en la aplicacion antes de persistir.
- La configuracion comparativa V1 no agrega migracion nueva; usa `StudyProduct`, `StudyArm`, `RotationPlan` y `RotationPlanArm` existentes.

## Restricciones e indices relevantes

- `ParticipantProfile` no tiene `studyId`.
- `StudyParticipant` tiene `@@unique([participantProfileId, studyId])` para evitar duplicados directos de una persona en un estudio.
- `Study.code` es unico mediante `@unique`.
- `StudyProduct` tiene `@@unique([studyId, internalCode])`.
- `StudyArm` tiene `@@unique([studyId, code])` y `@@unique([studyId, sortOrder])`.
- `RotationPlan` tiene `@@unique([studyId, rotationCode])`.
- `RotationPlanArm` evita duplicar brazo u orden dentro de un plan.
- `ParticipantRotationAssignment` tiene una asignacion por participacion.
- `ParticipantArmAssignment` evita duplicar brazo u orden dentro de la rotacion.
- `QuestionnaireVersion` tiene version unica por draft y hash unico por estudio.
- `LibraryItemRevision` tiene revision unica por item.
- `ScreeningAnswer` evita duplicar respuesta por intento y pregunta.
- `QuotaDefinition` evita nombres duplicados por estudio.
- `ParticipantActivity` evita duplicar schedule y ocurrencia por participacion mediante `@@unique([studyParticipantId, activityScheduleId, occurrenceKey])`.
- `ActivitySchedule` agrega `@@unique([studyId, code])`, permitiendo multiples `NULL` en PostgreSQL.
- `ParticipantActivityEvidence` evita duplicar el mismo tipo de evidencia en una actividad con `@@unique([participantActivityId, type])`.
- `ResearchResponse` evita duplicar respuesta por actividad mediante `@@unique([participantActivityId, responseKey])`.
- `ParticipantAttributeOrder` evita duplicados por participacion, version, bloque y `orderKey`.
- `ParticipantAccessToken.tokenHash` es unico.
- Indices adicionales cubren estados, fechas, roles operativos, contexto de respuestas y auditoria.

## Migracion SQL inicial offline

Migracion creada:

- `20260622213013_initial_persistence_foundation`

Fue generada localmente desde `prisma/schema.prisma` con `prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`, usando salida a archivo. La migracion todavia no se aplico a Supabase ni a ninguna base PostgreSQL.

Revision estatica inicial:

- Enums aproximados: 40.
- Tablas aproximadas: 30.
- Indices aproximados: 74.
- Llaves foraneas aproximadas: 65.
- No se encontraron comandos `DROP`, `DELETE`, `TRUNCATE`, `ALTER DATABASE` ni `REVOKE`.

Estado:

- Pendiente de revision humana.
- Pendiente de `prisma generate` en una fase aprobada.
- Pendiente de despliegue controlado contra una base aprobada.

## Migracion aditiva de autenticacion interna

Migracion creada y no aplicada:

- `20260622220438_add_internal_user_auth_user_id`

Resumen:

- agrega `internal_users.authUserId` como `UUID` nullable;
- crea indice unico `internal_users_authUserId_key`;
- permite vincular manualmente `InternalUser` con Supabase Auth sin crear privilegios automaticos.

No se aplico a Supabase ni a ninguna base de datos.

## Migracion aditiva de administracion de estudios

Migracion creada y no aplicada:

- `20260622230824_add_study_code`

Resumen:

- agrega `studies.code` como `TEXT NOT NULL`;
- crea indice unico `studies_code_key`;
- queda pendiente verificar manualmente que `studies` este vacia antes de aplicarla.

No se aplico a Supabase ni a ninguna base de datos.

## Configuracion comparativa V1

No se creo migracion nueva para productos, brazos y rotaciones manuales.

Se usan restricciones existentes:

- `StudyProduct` mantiene `@@unique([studyId, internalCode])`.
- `StudyArm` mantiene `@@unique([studyId, code])` y `@@unique([studyId, sortOrder])`.
- `RotationPlan` mantiene `@@unique([studyId, rotationCode])`.
- `RotationPlanArm` mantiene unicidad por brazo y orden dentro de un plan.

El retiro de rotaciones usa `RotationPlan.status = INACTIVE`; productos y brazos solo se eliminan fisicamente en `DRAFT` si no tienen referencias.

## Screener Builder V1

Migracion creada y no aplicada:

- `20260623003740_add_screener_pending_review_evaluation`

Resumen:

- agrega `PENDING_REVIEW` al enum PostgreSQL `"ScreeningStatus"`;
- agrega `screening_attempts.evaluationJson` como `JSONB` nullable;
- no agrega indices, llaves foraneas ni columnas adicionales.

La administracion de screener usa los modelos existentes `QuestionnaireDraft` y `QuestionnaireVersion`. Publicar crea versiones inmutables y retira la version activa previa de screener dentro de una transaccion de aplicacion.

## Biblioteca reutilizable de screener V1

Migracion creada y no aplicada:

- `20260623082108_add_screener_question_library`

Resumen:

- crea los enums `LibraryItemScope` y `LibraryItemRevisionStatus`;
- agrega `description`, `category`, `tags` y `scope` a `library_items`;
- agrega `contentHash`, `status`, `retiredByUserId` y `retiredAt` a `library_item_revisions`;
- crea `questionnaire_draft_library_uses` para registrar inserciones desde biblioteca;
- agrega indices por borrador, revision y usuario que inserta;
- agrega llaves foraneas necesarias.

No se aplico a Supabase ni a ninguna base de datos. Queda pendiente revisar y aplicar en entorno controlado.

## Portal autoaplicable de participante - Bloque 1

Migracion creada y no aplicada:

- `20260623204421_add_participant_portal_foundation`

Resumen:

- agrega enums propios del portal para origen de intento, evidencias, revision y estado de mensaje manual;
- agrega `participant_profiles.participantAuthUserId` unico y permite `createdByUserId` nullable para perfiles y participaciones publicas;
- permite `screening_attempts.fieldUserId` nullable y agrega `source` con default `FIELD`;
- crea `participant_portal_study_configs`;
- crea `participant_consents` para preservar version, hash y texto exacto del aviso aceptado;
- crea `participant_evidence` independiente de `MediaEvidencePlaceholder`, sin URL publica persistida;
- crea `participant_screening_reviews`;
- crea `participant_confirmations` y `participant_reference_codes`;
- crea `participant_portal_otp_request_logs` con correo/IP hasheados;
- agrega check para slots 1/2/3 y un indice unico parcial para una sola selfie por intento.
- agrega `folioMaxSequence` con default 999 y valida `nextFolioSequence <= folioMaxSequence + 1`;
- usa `maxPerfumePhotos` default 5;
- agrega unicidad por `ParticipantConsent(studyParticipantId, noticeVersion)`;
- agrega unicidad para `ParticipantEvidence.privateStorageKey`.

No se aplico a Supabase ni a ninguna base de datos. El detalle de decisiones queda en `docs/PARTICIPANT_PORTAL_FOUNDATION.md`.

## Fundacion tecnica App Navigo - Fase 1

Migracion creada y no aplicada:

- `20260625144216_add_navigo_app_foundation`

Resumen:

- agrega `activity_schedules.code` nullable para codigos estables de slot;
- crea `participant_activity_evidence` para evidencias por medicion;
- reutiliza enums existentes `ParticipantEvidenceType` y `ParticipantEvidenceReviewStatus`;
- mantiene intacto `participant_evidence` para el screener/portal ya operativo;
- prepara la base de `T0_SALON`, `T2_HORAS`, `T4_HORAS` y `T8_HORAS` sin abrir todavia una experiencia productiva al participante.

No se aplico a Supabase ni a ninguna base de datos.

## Validaciones ejecutadas

- `npm.cmd exec prisma validate`:
  - Resultado: paso.
  - No contacto base de datos ni leyo `.env`; uso el placeholder no real de `prisma.config.ts`.
- `npm.cmd run lint`:
  - Resultado: paso.
- `npm.cmd run typecheck`:
  - Resultado: paso.
- `npm.cmd run test`:
  - Resultado: paso con 11 archivos de prueba y 26 pruebas.
- `npm.cmd run build`:
  - Resultado: paso.

## Comandos pendientes para migrar

Pendientes y no ejecutados:

```powershell
npm.cmd exec prisma generate
npm.cmd exec prisma migrate dev -- --name initial_persistence_foundation
npm.cmd exec prisma migrate deploy
```

Tambien quedan pendientes `prisma db push`, `prisma db pull` y seeds; no se ejecutaron.

## Falta antes de usar Supabase

- Definir y aprobar la URL real de PostgreSQL fuera del repositorio.
- Decidir politica de migraciones iniciales y nombre final de la primera migracion.
- Ejecutar `prisma generate` cuando se apruebe generar cliente.
- Ejecutar migraciones contra un entorno controlado.
- Revisar reglas de acceso, RLS o permisos si se usa Supabase en fases posteriores.
- Definir estrategia de backups, entornos y rotacion de secretos.
- Agregar pruebas de integracion con una base local o ephemeral cuando se apruebe.

## Fuera de esta etapa

- Supabase Auth, Supabase Storage, Data API o SDKs de Supabase.
- Migraciones, db push, introspeccion, seeds o conexion remota.
- Autenticacion real.
- Servicios externos, correo, SMS, WhatsApp, video, carga de archivos o despliegue.
- UI funcional de administracion, campo o participante.
