import { getPool, isDatabaseConfigured } from '../db/pool.js';
import * as repo from '../repositories/instrumentPassportRepository.js';
import { buildPassportJob, passportFailureRetryable } from './instrumentPassportService.js';

let timer;
let running = false;
export async function processNextPassportJob() {
  const candidates = await repo.duePassportJobs();
  for (const candidate of candidates) {
    const client = await getPool().connect();
    const lockKey = `passport:${candidate.payload.passportId}`;
    let locked = false;
    try {
      locked = (await client.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked',[lockKey])).rows[0].locked;
      if (!locked) continue;
      const job = await repo.claimPassportJob(candidate.id,client);
      if (!job) continue;
      try {
        const folderLock = async fn => {
          const key = `passport-folders:${job.payload.rootFolderId}`;
          await client.query('SELECT pg_advisory_lock(hashtextextended($1,0))',[key]);
          try {return await fn();} finally {await client.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',[key]);}
        };
        await buildPassportJob(job,{folderLock});
      } catch(error) {
        console.error('[passport-worker-job]', JSON.stringify({
          jobId: job.id,
          errorCode: /^[A-Z][A-Z0-9_]{0,79}$/.test(String(error.code || '')) ? error.code : 'PASSPORT_MERGE_FAILED',
          driveRequestId: error.driveRequestId || '',
          driveRequestAction: error.driveRequestAction || '',
        }));
        await repo.failPassportJob(job,error,passportFailureRetryable(error));
      }
      return true;
    } finally {
      if (locked) await client.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',[lockKey]).catch(()=>{});
      client.release();
    }
  }
  return false;
}
export function startInstrumentPassportWorker() {
  if (timer || !isDatabaseConfigured()) return false;
  if (process.env.PASSPORT_WORKER_ENABLED === 'false') return false;
  timer = setInterval(async () => {
    if (running) return;
    running = true;
    try { while (await processNextPassportJob()) { /* Drain due jobs; other job types are untouched. */ } }
    catch(error) {console.error('[passport-worker]',{code:error.code,message:error.message});}
    finally {running=false;}
  },5000);
  timer.unref?.();
  return true;
}
