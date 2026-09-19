import { randomUUID } from 'node:crypto';
import { database } from './storage.mjs';
import { rest,rpc } from './supabase-admin.mjs';

export const usesSupabase=()=>process.env.STORAGE_BACKEND==='supabase';
const queryValue=value=>encodeURIComponent(String(value));
const memberRow=row=>row?{...row,projects:JSON.stringify(row.projects)}:null;
const workspaceRow=row=>row?{...row,data:JSON.stringify(row.data)}:null;

export async function membership(email) {
  if(!usesSupabase())return database().prepare('SELECT * FROM memberships WHERE email = ?').bind(email).first();
  return memberRow((await rest('ops_memberships?select=*&email=eq.'+queryValue(email)))[0]);
}
export async function workspace(id) {
  if(!usesSupabase())return database().prepare('SELECT * FROM workspaces WHERE id = ?').bind(id).first();
  return workspaceRow((await rest('ops_workspaces?select=*&id=eq.'+queryValue(id)))[0]);
}
export async function members(id) {
  if(!usesSupabase())return (await database().prepare('SELECT * FROM memberships WHERE workspace_id = ? ORDER BY role,email').bind(id).all()).results;
  return (await rest('ops_memberships?select=*&workspace_id=eq.'+queryValue(id)+'&order=role,email')).map(memberRow);
}
export async function bootstrap(user,data) {
  if(usesSupabase())return rpc('ops_bootstrap',{p_id:user.userId,p_email:user.email,p_name:user.displayName,p_data:data});
  const db=database();
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO workspaces (id,owner_email,data,revision,created_at) VALUES (?,?,?,0,?)').bind(user.userId,user.email,JSON.stringify(data),new Date().toISOString()),
    db.prepare('INSERT OR IGNORE INTO memberships (id,workspace_id,email,name,role,projects,governance,authority_ref) VALUES (?,?,?,?,?,?,0,?)').bind(randomUUID(),user.userId,user.email,user.displayName,'System owner','[]',''),
  ]);
}
export async function saveWorkspace(id,revision,data) {
  if(usesSupabase())return rpc('ops_save_workspace',{p_id:id,p_revision:revision,p_data:data});
  return !!(await database().prepare('UPDATE workspaces SET data = ?, revision = revision + 1 WHERE id = ? AND revision = ?').bind(JSON.stringify(data),id,revision).run()).meta.changes;
}
export async function switchWorkspace(id,revision,next) {
  if(usesSupabase())return rpc('ops_switch_workspace',{p_id:id,p_revision:revision,p_data:next});
  const sql=database().connection;
  sql.exec('BEGIN IMMEDIATE');
  try {
    const prior=sql.prepare('SELECT * FROM workspaces WHERE id = ?').get(id);
    if(!prior||prior.revision!==revision){sql.exec('ROLLBACK');return false;}
    const mode=JSON.parse(prior.data).mode;
    sql.prepare('INSERT INTO workspaces (id,owner_email,data,revision,created_at) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,revision=excluded.revision').run(id+'::'+mode,prior.owner_email,prior.data,prior.revision,prior.created_at);
    sql.prepare('UPDATE workspaces SET data=?,revision=revision+1 WHERE id=?').run(JSON.stringify(next),id);
    sql.exec('COMMIT');return true;
  }catch(error){sql.exec('ROLLBACK');throw error;}
}
export async function assignAccess(id,revision,data,member) {
  if(usesSupabase())return rpc('ops_assign_access',{p_id:id,p_revision:revision,p_data:data,p_member:member});
  const sql=database().connection;
  sql.exec('BEGIN IMMEDIATE');
  try {
    if(!sql.prepare('UPDATE workspaces SET data=?,revision=revision+1 WHERE id=? AND revision=?').run(JSON.stringify(data),id,revision).changes){sql.exec('ROLLBACK');return false;}
    const old=sql.prepare('SELECT workspace_id FROM memberships WHERE email=?').get(member.email);
    if(old&&old.workspace_id!==id)throw new Error('Account belongs to another workspace.');
    sql.prepare('INSERT INTO memberships (id,workspace_id,email,name,role,projects,governance,authority_ref) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET name=excluded.name,role=excluded.role,projects=excluded.projects,governance=excluded.governance,authority_ref=excluded.authority_ref').run(randomUUID(),id,member.email,member.name,member.role,JSON.stringify(member.projects),member.governance,member.authority_ref);
    sql.exec('COMMIT');return true;
  }catch(error){sql.exec('ROLLBACK');throw error;}
}
