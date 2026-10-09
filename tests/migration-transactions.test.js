import test from 'node:test';
import assert from 'node:assert/strict';
import { runMigrations } from '../db/migrate.js';
function setup({applied=[],failSql=''}={}){
 const calls=[];let active=false,released=false;
 const client={query:async(sql,args)=>{calls.push({sql,args});if(sql==='BEGIN')active=true;if(sql==='COMMIT'||sql==='ROLLBACK')active=false;if(sql.includes('pg_advisory_xact_lock'))assert.equal(active,true);if(sql===failSql)throw new Error('simulated SQL failure');return{rows:sql.includes('SELECT filename, checksum')?applied:[]};},release:()=>{assert.equal(active,false);released=true;}};
 return {pool:{connect:async()=>client},calls,released:()=>released};
}
const migration={filename:'001_test.sql',checksum:'checksum',sql:'CREATE TABLE example(id integer)'};
test('startup verifies applied migrations inside one transaction and releases its lock at commit',async()=>{
 const h=setup({applied:[{filename:migration.filename,checksum:migration.checksum}]});const result=await runMigrations({pool:h.pool,loadFiles:async()=>[migration]});assert.deepEqual(result.skipped,[migration.filename]);assert.equal(h.calls[0].sql,'BEGIN');assert.equal(h.calls.at(-1).sql,'COMMIT');assert.equal(h.calls.some(c=>c.sql===migration.sql),false);assert.equal(h.released(),true);assert.ok(h.calls.some(c=>c.sql.includes('set_config')&&c.sql.includes('true')));
});
test('new schema changes and their checksum commit atomically',async()=>{
 const h=setup();const result=await runMigrations({pool:h.pool,loadFiles:async()=>[migration]});assert.deepEqual(result.applied,[migration.filename]);assert.ok(h.calls.some(c=>c.sql===migration.sql));assert.ok(h.calls.some(c=>c.sql.includes('INSERT INTO schema_migrations')));assert.equal(h.calls.at(-1).sql,'COMMIT');
});
test('SQL failure rolls back and releases the connection without session locks',async()=>{
 const h=setup({failSql:migration.sql});await assert.rejects(runMigrations({pool:h.pool,loadFiles:async()=>[migration]}),/Migration failed/);assert.equal(h.calls.at(-1).sql,'ROLLBACK');assert.equal(h.released(),true);assert.equal(h.calls.some(c=>c.sql.includes('pg_advisory_lock(')),false);
});
test('dry run and checksum mismatch cannot execute a pending schema change',async()=>{
 const h=setup();const result=await runMigrations({pool:h.pool,loadFiles:async()=>[migration],dryRun:true});assert.deepEqual(result.pending,[migration.filename]);assert.equal(h.calls.some(c=>c.sql===migration.sql),false);
 const bad=setup({applied:[{filename:migration.filename,checksum:'different'}]});await assert.rejects(runMigrations({pool:bad.pool,loadFiles:async()=>[migration]}),/checksum mismatch/);assert.equal(bad.calls.at(-1).sql,'ROLLBACK');
});
