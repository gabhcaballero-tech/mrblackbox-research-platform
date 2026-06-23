# Domain Foundation

## Modulos creados o ampliados

- `participants`: contratos y validaciones para separar `ParticipantProfile` de `StudyParticipant`.
- `screening`: definiciones de filtros, reglas de continuar o terminar, puntajes y clasificacion por rangos.
- `quotas`: definicion y evaluacion de cuotas por criterios y etapa de conteo.
- `comparative-rotation`: validacion de rotacion manual de dos brazos para V1.
- `activities`: calculo de actividades programadas desde `applicationStartedAt` y reglas de correccion de hora.
- `randomization`: aleatorizacion determinista de atributos por semilla, contexto y configuracion de orden compartido o independiente.
- `questionnaire-engine`: esquema minimo de snapshot publicado e inmutable.
- `testing`: fixtures genericos para pruebas unitarias de dominio.

## Decisiones de diseno

- Las reglas se implementaron como funciones puras, sin base de datos, repositorios ni servicios externos.
- `ParticipantProfile` contiene datos personales y no acepta `studyId`.
- `StudyParticipant` representa la participacion operativa en un estudio especifico.
- Los filtros devuelven resultados estructurados con estado `passed`, `terminated` o `incomplete`.
- El calculo NSE se modela como una configuracion generica de puntajes y rangos, no como una regla fija de un cliente.
- Las cuotas generan advertencias, pero nunca bloquean la entrevista en V1.
- La rotacion V1 acepta solo `manual_cover_code`; la asignacion automatica queda fuera.
- Las etiquetas visibles para participante se validan separadas de las claves reales de producto.
- Las actividades usan offsets y ventanas configurables; los offsets de prueba cubren 15, 120, 240 y 480 minutos.
- La correccion de hora siempre devuelve una decision explicita e indica si requiere auditoria.
- La aleatorizacion de atributos usa semilla inyectable y permite reutilizar ordenes guardadas al retomar.
- La pregunta final de atributos queda fija y fuera de los grupos aleatorizados.
- El snapshot de cuestionario publicado se valida con Zod y se congela recursivamente en memoria.

## Reglas implementadas

- Filtro aprobado cuando todas las respuestas obligatorias existen y ninguna regla de terminacion coincide.
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

## Pruebas ejecutadas

- `npm.cmd run lint`
  - Resultado: paso.
- `npm.cmd run typecheck`
  - Resultado: paso despues de ajustar tipado numerico en el acumulador de puntaje y completar defaults tipados de opciones en fixtures.
- `npm.cmd run test`
  - Resultado: paso con 10 archivos de prueba y 19 pruebas.
- `npm.cmd run build`
  - Resultado: paso con Next.js 16.2.9.

## No implementado todavia

- Persistencia, PostgreSQL, Prisma o migraciones.
- Autenticacion, usuarios reales o permisos conectados a rutas.
- Servicios externos, correo, WhatsApp, SMS, video, carga de archivos o despliegue.
- Formularios finales, dashboards o editor visual libre.
- Asignacion automatica de rotacion.
- Motor visual de cuestionarios o renderizador final.
- Exportaciones CSV/XLSX funcionales.
