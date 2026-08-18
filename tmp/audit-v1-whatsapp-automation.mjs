import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const repoRequire = createRequire(pathToFileURL(path.join(repoRoot, "package.json")));
const { config: loadDotenv } = repoRequire("dotenv");
const { Pool } = repoRequire("pg");

loadDotenv({ path: path.join(repoRoot, ".env") });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL no esta configurado.");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

async function query(text, values = []) {
  const result = await pool.query(text, values);
  return result.rows;
}

try {
  const [
    outboundByStatus,
    pendingOutboundByTemplate,
    reminderLogsByStatus,
    plannedReminderLogs,
    recentOperationalTemplates,
    hutReminderAudit,
    navigoReminderLogs
  ] = await Promise.all([
    query(`
      select
        coalesce(status, 'NULL') as status,
        "messageType" as message_type,
        count(*)::int as count
      from oneui_whatsapp_messages
      where direction = 'OUTBOUND'
      group by coalesce(status, 'NULL'), "messageType"
      order by count desc, status asc
    `),
    query(`
      select
        coalesce(
          "rawPayload" #>> '{request,template,name}',
          "rawPayload" #>> '{template,name}',
          'UNKNOWN'
        ) as template_name,
        count(*)::int as count
      from oneui_whatsapp_messages
      where direction = 'OUTBOUND'
        and coalesce(status, '') = 'pending'
      group by template_name
      order by count desc, template_name asc
    `),
    query(`
      select
        status,
        channel,
        coalesce("metadataJson"->>'reminderType', "metadataJson"->>'source', 'UNKNOWN') as reminder_type,
        coalesce("metadataJson"->>'templateName', 'UNKNOWN') as template_name,
        count(*)::int as count
      from reminder_logs
      group by status, channel, reminder_type, template_name
      order by count desc, status asc
    `),
    query(`
      select
        rl.id,
        rl.status,
        rl.channel,
        rl."scheduledFor",
        rl."sentAt",
        rl."metadataJson"->>'activityCode' as activity_code,
        rl."metadataJson"->>'reminderType' as reminder_type,
        rl."metadataJson"->>'source' as source,
        rl."metadataJson"->>'templateName' as template_name,
        pc.folio as nav_folio
      from reminder_logs rl
      join participant_activities pa on pa.id = rl."participantActivityId"
      join study_participants sp on sp.id = pa."studyParticipantId"
      left join participant_confirmations pc on pc."studyParticipantId" = sp.id
      where rl.status = 'PLANNED'
      order by rl."scheduledFor" asc nulls last
      limit 50
    `),
    query(`
      select
        coalesce(
          m."rawPayload" #>> '{request,template,name}',
          m."rawPayload" #>> '{template,name}',
          'TEXT_OR_UNKNOWN'
        ) as template_name,
        c."sourceModule" as source_module,
        m.status,
        count(*)::int as count
      from oneui_whatsapp_messages m
      join oneui_whatsapp_conversations c on c.id = m."conversationId"
      where m.direction = 'OUTBOUND'
        and m."createdAt" >= now() - interval '14 days'
      group by template_name, c."sourceModule", m.status
      order by count desc, template_name asc
    `),
    query(`
      select
        coalesce("afterJson"->>'templateName', 'UNKNOWN') as template_name,
        coalesce("afterJson"->>'origin', "afterJson"->>'source', 'UNKNOWN') as origin,
        coalesce("afterJson"->>'reminderType', 'UNKNOWN') as reminder_type,
        coalesce("afterJson"->>'whatsappStatus', "afterJson"->>'status', 'UNKNOWN') as status,
        count(*)::int as count
      from audit_logs
      where "afterJson"->>'reminderType' = 'HUT_PHOTO_REMINDER'
         or "afterJson"->>'templateName' = 'hut_photo_reminder'
      group by template_name, origin, reminder_type, status
      order by count desc
    `),
    query(`
      select
        coalesce("metadataJson"->>'source', 'UNKNOWN') as source,
        coalesce("metadataJson"->>'templateName', 'UNKNOWN') as template_name,
        status,
        count(*)::int as count
      from reminder_logs
      where "metadataJson"->>'reminderType' = 'NAVIGO_WHATSAPP_EVALUATION_REMINDER'
         or "metadataJson"->>'templateName' = 'navigo_recordatorio_evaluacion'
      group by source, template_name, status
      order by count desc
    `)
  ]);

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    readOnly: true,
    outboundByStatus,
    pendingOutboundByTemplate,
    reminderLogsByStatus,
    plannedReminderLogsSample: plannedReminderLogs,
    recentOperationalTemplates,
    hutReminderAudit,
    navigoReminderLogs
  }, null, 2));
} finally {
  await pool.end();
}
