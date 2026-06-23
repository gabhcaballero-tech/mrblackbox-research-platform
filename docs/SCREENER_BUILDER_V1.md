# Screener Builder V1

## Alcance

Esta fase agrega administracion reutilizable de cuestionarios de filtro por estudio.

Incluye:

- borrador editable `SCREENER` por estudio;
- editor guiado de preguntas, opciones, reglas y NSE;
- biblioteca reutilizable de preguntas y bloques desde el builder;
- validacion de definicion `screening.v1`;
- publicacion de versiones inmutables con hash SHA-256;
- retiro automatico de version activa previa al publicar;
- historial de versiones;
- evaluador puro de reglas y NSE.

No incluye pantalla de Campo, participantes reales, intentos de filtro reales, respuestas persistidas desde UI de Campo ni datos reales creados por scripts o seeds.

## Migracion Nueva

Migracion creada y no aplicada:

- `20260623003740_add_screener_pending_review_evaluation`

Contenido:

```sql
ALTER TYPE "ScreeningStatus" ADD VALUE 'PENDING_REVIEW';

ALTER TABLE "screening_attempts" ADD COLUMN "evaluationJson" JSONB;
```

No se aplico contra Supabase ni contra ninguna base remota.

## Contrato `screening.v1`

La definicion se valida con Zod y contiene:

- `schemaVersion: "screening.v1"`;
- `purpose: "SCREENER"`;
- `title` y `description`;
- preguntas ordenadas;
- opciones ordenadas;
- acciones por opcion;
- reglas sin JavaScript ni expresiones arbitrarias;
- bloque opcional `nse` de tipo `score_table`;
- destino de datos por pregunta.

Tipos de pregunta V1:

- `CONSENT_YES_NO`
- `SINGLE_CHOICE`
- `MULTIPLE_CHOICE`
- `INTEGER`
- `SHORT_TEXT`
- `LONG_TEXT`
- `INTERVIEWER_CHECKLIST`

Destinos de datos:

- `SCREENING`
- `PARTICIPANT_PROFILE`
- `OPERATIONAL_INTERNAL`

`PARTICIPANT_PROFILE` solo permite bindings explicitos de perfil. No se aceptan nombres arbitrarios de columnas.

## Evaluacion

El evaluador puro respeta esta prioridad:

1. faltantes obligatorios -> `INCOMPLETE`;
2. terminaciones -> `TERMINATED`;
3. NSE y rangos elegibles;
4. banderas con revision -> `PENDING_REVIEW`;
5. resultado valido restante -> `PASSED`.

La salida preparada para `ScreeningAttempt.evaluationJson` incluye:

- resultado;
- estado persistible;
- banderas;
- razones;
- preguntas faltantes;
- NSE;
- explicacion segura.

No incluye PII crudo.

## Administracion

Ruta agregada:

- `/admin/studies/[studyId]/screener`

Solo `ADMIN` puede crear, editar, publicar o retirar. Si el estudio no esta en `DRAFT`, la pantalla queda en solo lectura y las mutaciones se bloquean tambien en servicio.

La pantalla incluye:

- resumen del estudio;
- estado del borrador;
- editor de preguntas;
- gestion de opciones;
- reglas y terminaciones;
- calculo NSE;
- publicacion;
- historial de versiones;
- vista tecnica solo lectura de versiones publicadas.
- acceso para guardar preguntas o bloques en biblioteca;
- panel para insertar copias desde biblioteca.

La biblioteca no crea dependencias vivas: insertar contenido copia preguntas, reglas y NSE al borrador, remapea IDs cuando hay colisiones y registra trazabilidad historica.

## Publicacion

Publicar:

- valida toda la definicion;
- genera JSON canonico;
- calcula hash SHA-256 con `node:crypto`;
- crea `QuestionnaireVersion`;
- asigna `versionNumber` consecutivo;
- retira la version activa previa de screener en la misma transaccion;
- registra auditoria de publicacion y retiro cuando corresponde.

Los formularios no aceptan version, hash, usuario publicador, estado ni timestamps.

## Pruebas

Se agregaron pruebas para:

- IDs duplicados;
- referencias invalidas de reglas y opciones;
- opcion Otro con texto requerido;
- tipos de pregunta V1;
- reglas `ANY`, `ALL`, igualdad y rango;
- terminacion;
- pendiente de revision;
- incompleto;
- NSE configurable;
- hash canonico estable;
- version consecutiva;
- retiro automatico de version activa previa;
- proyecciones readonly;
- autorizacion ADMIN;
- rechazo de no ADMIN;
- proyeccion ANALYST sin PII de perfil;
- bloqueo de mutaciones en estudio no `DRAFT`.

## Pendiente

- Aplicar la migracion en entorno controlado.
- Conectar Campo para crear `ScreeningAttempt` y `ScreeningAnswer`.
- Persistir respuestas reales y resultados de evaluacion desde la fase Campo.
- Definir el screener real desde la interfaz, sin codificar reglas de cliente en el producto.
