import { query as defaultQuery, withTransaction as defaultTransaction } from '../db/pool.js';
import { MAX_PASSPORT_TOTAL_BYTES, MAX_PASSPORT_PAGES, passportError } from '../domain/instrumentPassport.js';

export function publicPassport(row) {
  if (!row) return null;
  return {
    id: row.id, instrumentKey: row.instrument_key, version: row.source_version,
    publishedVersion: row.published_version, pageCount: row.page_count,
    fileId: row.current_file_id, url: row.current_file_url,
    status: row.source_version <= row.published_version ? 'completed' : row.job_status || 'pending',
    error: row.last_error || '', errorCode: row.last_error_code || '',
    updatedAt: row.updated_at,
  };
}
export function createInstrumentPassportRepository({query = defaultQuery, withTransaction = defaultTransaction} = {}) {
async function passportSummaries(workspaceId, keys) {
  if (!keys.length) return new Map();
  const result = await query(`SELECT p.*, j.status AS job_status FROM instrument_passports p
    LEFT JOIN LATERAL (SELECT status FROM outbox_jobs WHERE workspace_id=p.workspace_id
      AND job_type='passport_merge' AND payload->>'passportId'=p.id::text
      ORDER BY (payload->>'version')::int DESC,created_at DESC LIMIT 1) j ON true
    WHERE p.workspace_id=$1 AND p.instrument_key=ANY($2::text[])`, [workspaceId, keys]);
  return new Map(result.rows.map(row => [row.instrument_key, publicPassport(row)]));
}
async function getPassport(workspaceId, key) {
  const result = await query('SELECT * FROM instrument_passports WHERE workspace_id=$1 AND instrument_key=$2', [workspaceId, key]);
  return result.rows[0] || null;
}
async function passportDetails(workspaceId, key) {
  const summary = (await passportSummaries(workspaceId, [key])).get(key);
  if (!summary) return { passport: null, documents: [] };
  const result = await query(`SELECT id,sequence,filename,page_count,byte_count,drive_file_id,created_at
    FROM instrument_passport_documents WHERE passport_id=$1 ORDER BY sequence`, [summary.id]);
  return { passport: summary, documents: result.rows };
}
async function savePassportDocument({ workspaceId, key, sheetName, instrument, filename, parsed, userId, rootFolderId }) {
  return withTransaction(async client => {
    await client.query(`INSERT INTO instrument_passports(workspace_id,instrument_key,sheet_name,instrument)
      VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(workspace_id,instrument_key) DO NOTHING`,
    [workspaceId, key, sheetName, JSON.stringify(instrument)]);
    const locked = await client.query('SELECT * FROM instrument_passports WHERE workspace_id=$1 AND instrument_key=$2 FOR UPDATE', [workspaceId, key]);
    const passport = locked.rows[0];
    const existing = await client.query('SELECT id FROM instrument_passport_documents WHERE passport_id=$1 AND checksum=$2', [passport.id, parsed.checksum]);
    if (existing.rows.length) return { duplicate: true, documentId: existing.rows[0].id, passport: publicPassport(passport) };
    const totals = await client.query('SELECT COALESCE(SUM(byte_count),0) AS bytes,COALESCE(SUM(page_count),0) AS pages FROM instrument_passport_documents WHERE passport_id=$1', [passport.id]);
    if (Number(totals.rows[0].bytes) + parsed.bytes.length > MAX_PASSPORT_TOTAL_BYTES || Number(totals.rows[0].pages) + parsed.pageCount > MAX_PASSPORT_PAGES) {
      throw passportError('Asbob pasporti 60 MB yoki 500 sahifa chegarasidan oshadi.', 'PASSPORT_TOTAL_SIZE_LIMIT', 413);
    }
    const version = passport.source_version + 1;
    const doc = await client.query(`INSERT INTO instrument_passport_documents(passport_id,sequence,filename,checksum,pdf,byte_count,page_count,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, [passport.id, version, filename, parsed.checksum, parsed.bytes, parsed.bytes.length, parsed.pageCount, userId]);
    const updated = await client.query(`UPDATE instrument_passports SET source_version=$2,instrument=$3::jsonb,last_error='',last_error_code='',updated_at=NOW() WHERE id=$1 RETURNING *`, [passport.id, version, JSON.stringify(instrument)]);
    const job = await client.query(`INSERT INTO outbox_jobs(workspace_id,job_type,idempotency_key,payload,max_attempts)
      VALUES($1,'passport_merge',$2,$3::jsonb,6) RETURNING id`, [workspaceId, `passport:${passport.id}:${version}`, JSON.stringify({passportId:passport.id,version,rootFolderId})]);
    return { duplicate: false, documentId: doc.rows[0].id, jobId: job.rows[0].id, passport: publicPassport(updated.rows[0]) };
  });
}
async function duePassportJobs() {
  return (await query(`SELECT * FROM outbox_jobs WHERE job_type='passport_merge'
    AND (status IN ('pending','failed_retryable') AND next_attempt_at<=NOW()
      OR status='processing' AND locked_at<NOW()-INTERVAL '15 minutes') ORDER BY created_at LIMIT 20`)).rows;
}
async function claimPassportJob(id, client) {
  return (await client.query(`UPDATE outbox_jobs SET status='processing',attempts=attempts+1,locked_at=NOW(),locked_by=$2
    WHERE id=$1 AND job_type='passport_merge' AND (status IN ('pending','failed_retryable')
      OR status='processing' AND locked_at<NOW()-INTERVAL '15 minutes') RETURNING *`, [id, `passport-${process.pid}`])).rows[0];
}
async function loadPassportBuild(job) {
  const passport = (await query('SELECT * FROM instrument_passports WHERE id=$1 AND workspace_id=$2', [job.payload.passportId, job.workspace_id])).rows[0];
  if (!passport) throw passportError('Pasport topilmadi.', 'PASSPORT_NOT_FOUND', 404);
  const documents = (await query('SELECT * FROM instrument_passport_documents WHERE passport_id=$1 AND sequence<=$2 ORDER BY sequence', [passport.id, job.payload.version])).rows;
  return {passport, documents};
}
async function completePassportJob(job, result) {
  return withTransaction(async client => {
    if (!result.obsolete) {
      await client.query(`UPDATE instrument_passports SET published_version=$2,current_file_id=$3,current_file_url=$4,
        output_folder_id=$5,output_root_id=$6,merged_pdf=$7,page_count=$8,last_error='',last_error_code='',updated_at=NOW()
        WHERE id=$1 AND published_version<$2`, [job.payload.passportId, job.payload.version, result.fileId, result.url, result.folderId, job.payload.rootFolderId, result.bytes, result.pageCount]);
    }
    await client.query(`UPDATE outbox_jobs SET status='completed',completed_at=NOW(),locked_at=NULL,last_error=NULL,last_error_code=NULL,
      result=$2::jsonb WHERE id=$1`, [job.id, JSON.stringify({fileId:result.fileId || '',pageCount:result.pageCount || 0,obsolete:Boolean(result.obsolete)})]);
  });
}
async function recordPassportOriginal(documentId, fileId) {
  await query('UPDATE instrument_passport_documents SET drive_file_id=$2 WHERE id=$1', [documentId, fileId]);
}
async function failPassportJob(job, error, retryable) {
  const retry = retryable && job.attempts < job.max_attempts;
  return withTransaction(async client => {
    await client.query(`UPDATE outbox_jobs SET status=$2,last_error=$3,last_error_code=$4,locked_at=NULL,
      next_attempt_at=NOW()+($5*INTERVAL '1 second') WHERE id=$1`, [job.id,retry?'failed_retryable':'failed_permanent',String(error.message).slice(0,1000),error.code || 'PASSPORT_MERGE_FAILED',Math.min(900,15*2**job.attempts)]);
    await client.query(`UPDATE instrument_passports SET last_error=$2,last_error_code=$3,updated_at=NOW()
      WHERE id=$1 AND published_version<$4`, [job.payload.passportId,String(error.message).slice(0,1000),error.code || 'PASSPORT_MERGE_FAILED',job.payload.version]);
  });
}
async function retryPassport(workspaceId, key, rootFolderId = '') {
  return (await query(`UPDATE outbox_jobs SET status='pending',attempts=0,next_attempt_at=NOW(),last_error=NULL,last_error_code=NULL,
    payload=CASE WHEN $3<>'' THEN jsonb_set(payload,'{rootFolderId}',to_jsonb($3::text)) ELSE payload END
    WHERE id=(SELECT j.id FROM outbox_jobs j JOIN instrument_passports p ON p.id::text=j.payload->>'passportId'
      WHERE p.workspace_id=$1 AND p.instrument_key=$2 AND j.job_type='passport_merge'
      AND j.status IN ('failed_permanent','failed_retryable') AND (j.payload->>'version')::int>p.published_version
      ORDER BY (j.payload->>'version')::int DESC,j.created_at DESC LIMIT 1) RETURNING id`, [workspaceId,key,rootFolderId])).rows[0] || null;
}
async function saveUlchovFolder(workspaceId, folderId) {
  await query(`UPDATE workspaces SET module_settings=jsonb_set(COALESCE(module_settings,'{}'::jsonb),'{ulchov_final_documents_folder_id}',to_jsonb($2::text)),updated_at=NOW() WHERE id=$1`, [workspaceId,folderId]);
}

return {passportSummaries,getPassport,passportDetails,savePassportDocument,duePassportJobs,claimPassportJob,loadPassportBuild,completePassportJob,recordPassportOriginal,failPassportJob,retryPassport,saveUlchovFolder};
}
export const {passportSummaries,getPassport,passportDetails,savePassportDocument,duePassportJobs,claimPassportJob,loadPassportBuild,completePassportJob,recordPassportOriginal,failPassportJob,retryPassport,saveUlchovFolder} = createInstrumentPassportRepository();
