# Product Scope

## Objetivo

`mrblackbox-research-platform` será una plataforma web responsive para administrar, ejecutar y responder estudios de investigación de mercados desde una sola base de código. La arquitectura esperada es un monolito modular: una aplicación, un dominio compartido y módulos internos bien separados.

Esta fase sigue siendo de análisis, arquitectura y documentación. No se implementan pantallas finales, autenticación real, despliegue, integraciones externas ni almacenamiento de video.

## Áreas Del Producto

### Administración

El área administrativa permitirá crear y administrar estudios, cuestionarios configurables, bibliotecas reutilizables y reportes operativos.

Alcance previsto:

- Crear, editar, publicar y archivar estudios.
- Definir zona horaria IANA por estudio.
- Crear cuestionarios configurables y versionados.
- Mantener bibliotecas reutilizables versionadas de preguntas, atributos, opciones, escalas y plantillas.
- Configurar filtros, reglas de continuar o terminar, puntajes, cuotas y rotaciones.
- Configurar actividades programadas para mediciones, video futuro y seguimiento interno.
- Crear perfiles de participantes y participaciones por estudio.
- Ver avance por estudio, participación, encuestador y actividad.
- Exportar filtros, seguimiento, cuotas, respuestas, rotaciones y metadatos operativos.
- Auditar cambios relevantes.
- En V1, Admin y Supervisor pueden generar exportaciones con PII cuando corresponda; Analista solo exporta información anonimizada.

### Campo / Encuestadores

El área de campo será usada por encuestadores autenticados para aplicar filtros, registrar datos iniciales y aprobar participaciones.

Alcance previsto:

- Acceso con usuario y contraseña.
- Aplicar filtros internos.
- Registrar o actualizar datos del participante según permisos.
- Ejecutar reglas de terminación automática.
- Calcular NSE mediante respuestas y puntajes configurables.
- Mostrar aviso cuando una cuota esté llena sin bloquear la entrevista.
- Registrar fecha, hora, encuestador y estatus del filtro.
- Registrar la hora de aplicación `applicationStartedAt`, desde la que se calculan mediciones.
- Permitir corrección de hora de aplicación con auditoría.
- Registrar rotación manual por carátula o código de rotación.
- Al aprobar una participación, generar un enlace único sin contraseña.

### Participante

El participante accederá mediante un enlace único seguro, sin contraseña, asociado a su participación específica en un estudio.

Alcance previsto:

- Acceso por token opaco, revocable y sin datos personales en la URL.
- Enlace válido hasta 7 días después de la última actividad programada.
- Acceso permitido desde más de un dispositivo.
- Ver actividades disponibles, pendientes, incompletas, completadas o vencidas.
- Guardar avances para salir y retomar sin perder respuestas.
- Responder cuestionarios versionados.
- Mantener orden aleatorizado estable para baterías de atributos por participación, versión, bloque y contexto.
- Contemplar evidencia de video futura como actividad programada, sin implementar carga ni almacenamiento todavía.

## Separación Participante / Estudio

Una persona puede existir en más de un estudio. Por eso:

- El perfil personal no pertenece directamente a un estudio.
- Cada participación en un estudio tiene estado operativo propio.
- Tokens, screening, cuotas, rotaciones, actividades, respuestas y exportaciones se relacionan con la participación específica.
- Las respuestas de investigación no se guardan dentro del perfil personal.

## Capacidades Funcionales Clave

### Motor De Cuestionarios

Debe soportar:

- Respuesta única.
- Respuesta múltiple.
- Texto abierto.
- Número.
- Opción "Otro" con texto condicional obligatorio o configurable.
- Escalas Likert.
- Escalas numéricas.
- Matrices.
- Sí / No.
- Texto dinámico que inserte respuestas anteriores.
- Lógica condicional.
- Reglas de terminar.
- Cálculos.
- Bloques repetibles por producto, brazo o actividad.
- Cuestionarios versionados e inmutables una vez publicados.

Modificar una pregunta, escala, atributo o plantilla de biblioteca nunca debe alterar un cuestionario ya publicado.

### Filtros Y Cuotas

Debe permitir configurar reglas como:

- Continuar o terminar según respuesta.
- Terminar según una opción elegida en una pregunta de respuesta múltiple.
- Calcular puntajes por suma de valores asociados a respuestas.
- Clasificar participantes mediante rangos de puntaje.
- Mostrar advertencias de cuota sin bloquear.
- Definir cuotas por ciudad, edad, NSE u otras variables configurables.
- Definir qué etapa cuenta para cada cuota.

Etapas de conteo iniciales:

- Screening aprobado.
- Participante asignado.
- Primera medición completada.
- Estudio completo.

### Estudios Comparativos

La primera implementación debe resolver comparativas de dos productos o fragancias y dos brazos.

Debe soportar:

- Código de rotación.
- Brazo izquierdo y brazo derecho.
- Producto o fragancia asignada a cada brazo.
- Orden de aplicación.
- Etiqueta visible para participante, por ejemplo "Primera fragancia" y "Segunda fragancia".
- Clave real visible solo para roles autorizados.
- Modo de asignación manual mediante carátula/código para V1.
- Asignación automática preparada en arquitectura y modelo, sin implementarse todavía.
- Exportaciones que conserven producto real según permisos, orden de rotación, brazo y versión de cuestionario.

El modelo debe poder extenderse después a más productos o brazos.

### Actividades Programadas

Debe soportar actividades configurables a partir de `applicationStartedAt`, registrado por el encuestador:

- Cuestionario o medición.
- Evidencia de video futura.
- Recordatorio o seguimiento interno.

Las ventanas permitidas serán configurables por estudio y no estarán codificadas de forma fija. Las tolerancias exactas se definirán posteriormente por estudio.

Las mediciones iniciales serán cuestionarios a:

- 15 minutos.
- 2 horas.
- 4 horas.
- 8 horas.

Cada actividad debe tener:

- Hora programada.
- Ventana permitida.
- Estado: pendiente, disponible, iniciada, incompleta, completada, vencida o reabierta.
- Hora real de inicio y finalización.
- Registro de recordatorios y seguimiento.

La evidencia futura consistirá en videos de aplicación una vez al día durante tres días. Por ahora solo debe quedar contemplada en el modelo, permisos, consentimiento, revisión futura y retención futura.

### Batería De Atributos Aleatorizables

Debe existir un bloque reutilizable con estas reglas:

- El administrador mantiene una biblioteca versionada de N atributos.
- Cada cuestionario selecciona qué atributos usar.
- El orden se aleatoriza una sola vez y se guarda por participación, versión de cuestionario, instancia de bloque y contexto comparativo.
- El orden puede ser compartido entre ambas fragancias o independiente por fragancia.
- Recomendación inicial: usar el mismo orden para ambas fragancias de un mismo participante.
- Si el participante sale y vuelve, conserva exactamente el mismo orden.
- Los atributos se muestran en grupos configurables, por ejemplo 5 por bloque.
- Antes de cada bloque se repite una instrucción o recordatorio sin generar respuesta.
- La pregunta final queda fija y fuera de la aleatorización: "¿Hay algún otro atributo que describa esta fragancia?"
- La respuesta final es Sí / No.
- Si responde Sí, se muestra obligatoriamente un campo abierto.
- La pregunta final no cuenta dentro de los grupos de atributos.

## Exportaciones Iniciales

Entregables iniciales:

- Base de filtros y resultado de screening.
- Seguimiento de participantes y actividades.
- Cuotas y alertas.
- Respuestas.
- Respuestas en formato ancho.
- Respuestas en formato largo.
- Metadatos de rotación, brazo, producto real según permisos y versión de cuestionario.
- Formatos CSV y XLSX.
- Exportaciones con PII para Admin y Supervisor cuando corresponda.
- Exportaciones anonimizadas para Analista.

## Auditoría Obligatoria

Debe auditarse:

- Publicación o retiro de cuestionarios.
- Corrección de hora de aplicación.
- Modificación de participante.
- Regeneración o revocación de enlace.
- Reapertura manual de actividad vencida, incluida una medición vencida.
- Cambios de rotación.
- Cambios de cuotas.

## Permisos V1 Aprobados

- Admin publica o retira cuestionarios, modifica cuotas y rotaciones, ve claves reales y PII, corrige hora de aplicación incluso si ya existen actividades iniciadas o respondidas, y reabre actividades vencidas con auditoría.
- Supervisor revisa filtros y avance, corrige datos operativos, regenera enlaces, reabre actividades con auditoría y corrige hora de aplicación solo cuando ninguna actividad del participante haya sido iniciada.
- Encuestador aplica filtros, registra participantes, registra hora de aplicación, consulta estatus operativo y registra rotación manual. No puede publicar cuestionarios, modificar cuotas ni alterar rotaciones.
- Analista exporta información anonimizada. No puede ver teléfono, correo, dirección ni otros datos personales identificables.

## Requisitos De Calidad

- TypeScript estricto.
- Validación de formularios en cliente y servidor.
- Manejo explícito de errores, carga y estados vacíos por ruta.
- Evitar tabs anidados que puedan compartir estado accidentalmente.
- No permitir errores silenciosos ni pantallas en blanco.
- Pruebas unitarias para filtros, NSE, cuotas, aleatorización y lógica condicional.
- Pruebas end-to-end para flujos principales.
- Auditoría de cambios relevantes.
- Separación clara entre datos personales y respuestas de investigación.
- Videos futuros privados, sin URLs públicas.

## Fuera De Alcance En Esta Primera Tarea

- Implementar la aplicación.
- Crear pantallas finales.
- Crear autenticación real.
- Conectar servicios externos.
- Configurar despliegue.
- Instalar dependencias.
- Crear o enlazar repositorios remotos.
- Implementar editor visual completamente libre.
- Implementar drag and drop complejo.
- Implementar scripting arbitrario.
- Enviar mensajes automáticos.
- Integrar WhatsApp, correo o SMS.
- Implementar cámara.
- Implementar carga, reproducción, procesamiento o almacenamiento de video.
- Implementar asignación automática de rotación.
