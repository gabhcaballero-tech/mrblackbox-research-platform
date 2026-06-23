# Domain Foundation

## Modulos creados o ampliados

- `studies`: administracion inicial de estudios en borrador, validacion de nombre/codigo/zona horaria y reglas de edicion DRAFT.
- `participants`: contratos y validaciones para separar `ParticipantProfile` de `StudyParticipant`.
- `screening`: definiciones de filtros, reglas de continuar o terminar, puntajes y clasificacion por rangos.
- `screener`: constructor administrativo de filtros, definicion `screening.v1`, versiones inmutables y evaluador puro de reglas/NSE.
- `quotas`: definicion y evaluacion de cuotas por criterios y etapa de conteo.
- `comparative-rotation`: validacion y configuracion administrativa de productos, brazos y rotaciones manuales de dos brazos para V1.
- `activities`: calculo de actividades programadas desde `applicationStartedAt` y reglas de correccion de hora.
- `randomization`: aleatorizacion determinista de atributos por semilla, contexto y configuracion de orden compartido o independiente.
- `questionnaire-engine`: esquema minimo de snapshot publicado e inmutable.
- `responses`: construccion determinista de `responseKey` para guardados parciales o autosave sin duplicados.
- `testing`: fixtures genericos para pruebas unitarias de dominio.

## Decisiones de diseno

- Las reglas se implementaron como funciones puras, sin base de datos, repositorios ni servicios externos.
- La administracion V1 de estudios agrega repositorio Prisma server-only, pero conserva reglas de validacion y servicio probables sin conexion real en pruebas.
- `ParticipantProfile` contiene datos personales y no acepta `studyId`.
- `StudyParticipant` representa la participacion operativa en un estudio especifico.
- Los filtros devuelven resultados estructurados con estado `passed`, `terminated` o `incomplete`.
- El screener builder V1 usa `screening.v1`, editor guiado y versiones publicadas inmutables.
- El evaluador nuevo de screener devuelve estados persistibles `PASSED`, `TERMINATED`, `INCOMPLETE` o `PENDING_REVIEW`.
- El calculo NSE se modela como una configuracion generica de puntajes y rangos, no como una regla fija de un cliente.
- Las cuotas generan advertencias, pero nunca bloquean la entrevista en V1.
- La rotacion V1 acepta solo `manual_cover_code`; la asignacion automatica queda fuera.
- Las etiquetas visibles para participante se validan separadas de las claves reales de producto.
- La configuracion comparativa V1 usa productos sensibles, brazos canonicos `left`/`right` y planes manuales `MANUAL`.
- Las actividades usan offsets y ventanas configurables; los offsets de prueba cubren 15, 120, 240 y 480 minutos.
- Las actividades recurrentes usan `occurrenceKey` para permitir varias instancias del mismo schedule.
- La correccion de hora siempre devuelve una decision explicita e indica si requiere auditoria.
- La aleatorizacion de atributos usa semilla inyectable y permite reutilizar ordenes guardadas al retomar.
- La pregunta final de atributos queda fija y fuera de los grupos aleatorizados.
- El snapshot de cuestionario publicado se valida con Zod y se congela recursivamente en memoria.

## Reglas implementadas

- Filtro aprobado cuando todas las respuestas obligatorias existen y ninguna regla de terminacion coincide.
- Screener V1 valida IDs estables, referencias de reglas, opciones, destinos de datos y bindings permitidos de perfil.
- Publicar screener crea hash canonico SHA-256, version consecutiva y retira la version activa previa.
- `evaluationJson` queda preparado para guardar resultado seguro sin PII crudo.
- Terminacion por regla directa o por seleccion incluida en respuesta multiple.
- Puntaje configurable por respuesta y clasificacion por rangos inclusivos.
- Cuota llena con `warningShown: true` y `blocksInterview: false`.
- Rotacion manual con brazo izquierdo y derecho, orden 1 y 2, productos reales distintos y etiquetas ciegas.
- Actividades calculadas desde la hora de aplicacion con ventanas de disponibilidad configurables.
- Supervisor puede corregir `applicationStartedAt` solo si ninguna actividad inicio.
- Admin puede corregir despues de actividades iniciadas, con auditoria requerida.
- Orden de atributos estable al retomar cuando se entregan ordenes guardadas.
- Orden compartido o independiente entre fragancias segun configuracion.
- Texto obligatorio cuando la pregunta final de atributos se responde con `yes`.
- Snapshot publicado con tipos V1: respuesta unica, multiple, texto, numero, si/no, escala, matriz, opcion Otro condicional y bloque de atributos.
- Estudios V1 se crean siempre en `DRAFT`, con `code` normalizado y unico, y solo pueden editar `name`, `code` y `timeZoneIana` mientras sigan en borrador.
- Productos, brazos y rotaciones solo pueden configurarse mientras el estudio siga en `DRAFT`.
- El participante solo recibe etiquetas generadas por servidor: `Primera fragancia` y `Segunda fragancia`.
- Actividades recurrentes de video pueden materializar `DAY_1`, `DAY_2` y `DAY_3`.
- `responseKey` se construye desde pregunta, bloque y contexto; no debe incluir PII.
- La consistencia de rotacion valida que plan, participante, brazos y productos pertenezcan al mismo estudio antes de persistir.

## Pruebas ejecutadas

- `npm.cmd run lint`
  - Resultado: paso.
- `npm.cmd run typecheck`
  - Resultado: paso despues de ajustar tipado numerico en el acumulador de puntaje y completar defaults tipados de opciones en fixtures.
- `npm.cmd run test`
  - Resultado: paso con 11 archivos de prueba y 26 pruebas.
- `npm.cmd run build`
  - Resultado: paso con Next.js 16.2.9.

## No implementado todavia

- Cambio de estado de estudios.
- Participantes, cuotas, cuestionarios y exportaciones conectados a estudios.
- Servicios externos, correo, WhatsApp, SMS, video, carga de archivos o despliegue.
- Formularios finales, dashboards o editor visual libre.
- Asignacion automatica de rotacion.
- Motor visual de cuestionarios o renderizador final.
- Exportaciones CSV/XLSX funcionales.
