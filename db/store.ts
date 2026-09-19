import {database,files} from '@/server/storage.mjs';
import {runtimeConfig} from '@/server/config.mjs';
import {sameOrigin} from '@/server/sessions.mjs';
import {getUser} from '@/app/auth';
import {seedData,uid,now,type WorkspaceData} from '@/lib/model';
export type Access={id:string;workspace_id:string;email:string;name:string;role:string;projects:string;governance:number;authority_ref:string};
export type Session={workspaceId:string;revision:number;data:WorkspaceData;access:Access;user:{userId:string;displayName:string;email:string};members:Access[]};
export class AppError extends Error{constructor(message:string,public status=400){super(message)}}
export function db(){return database()}
export function bucket(){return files()}
export async function session():Promise<Session>{
 const user=await getUser();if(!user)throw new AppError('Sign in to open your workspace.',401);
 const email=user.email.toLowerCase();let access=await db().prepare('SELECT * FROM memberships WHERE email = ?').bind(email).first<Access>();
 if(!access){if(email!==runtimeConfig().ownerEmail)throw new AppError('Your account has no workspace access.',403);const id=user.userId;const data=seedData();const membershipId=uid();await db().batch([db().prepare('INSERT OR IGNORE INTO workspaces (id,owner_email,data,revision,created_at) VALUES (?,?,?,0,?)').bind(id,email,JSON.stringify(data),now()),db().prepare('INSERT OR IGNORE INTO memberships (id,workspace_id,email,name,role,projects,governance,authority_ref) VALUES (?,?,?,?,?,?,0,?)').bind(membershipId,id,email,user.displayName,'System owner','[]','')]);access=await db().prepare('SELECT * FROM memberships WHERE email = ?').bind(email).first<Access>()}
 if(!access)throw new AppError('Your workspace could not be opened.',503);
 const row=await db().prepare('SELECT * FROM workspaces WHERE id = ?').bind(access.workspace_id).first<{data:string;revision:number}>();if(!row)throw new AppError('Workspace not found.',404);
 const members=await db().prepare('SELECT * FROM memberships WHERE workspace_id = ? ORDER BY role,email').bind(access.workspace_id).all<Access>();
 return {workspaceId:access.workspace_id,revision:row.revision,data:JSON.parse(row.data),access,user,members:members.results};
}
export const fullAccess=(s:Session)=>s.access.role==='System owner'||s.access.role==='Compliance secretary';
export const projectAccess=(s:Session,id:string)=>fullAccess(s)||JSON.parse(s.access.projects).includes(id);
export function canCollection(s:Session,c:string,write=false){if(fullAccess(s))return true;if(['Project lead','Project participant','Project sponsor','Continuity deputy'].includes(s.access.role))return ['projects','milestones','activities','cases','files'].includes(c);if(s.access.role==='Treasurer')return ['transactions','donations','assets','reports','files'].includes(c);if(['Auditor','Approver','Observer'].includes(s.access.role))return !write&&['projects','milestones','activities','reports','files','obligations'].includes(c);return false}
export function fileAccess(s:Session,f:any,write=false){if(fullAccess(s))return true;if(f.projectId)return projectAccess(s,f.projectId)&&(!write||['Project lead','Project participant','Project sponsor','Continuity deputy'].includes(s.access.role));if(s.access.role==='Treasurer'&&f.scope==='finance')return true;const scope=JSON.parse(s.access.projects);if(f.scope?.startsWith('report:')&&scope.includes(f.scope.slice(7)))return !write||s.access.role==='Approver';if(!write&&['Approver','Auditor','Observer'].includes(s.access.role))return s.data.reports.some(r=>scope.includes(r.id)&&(r.exportId===f.id||r.approvals?.some((a:any)=>a.fileId===f.id)||r.versions?.some((v:any)=>v.exportId===f.id||v.snapshot.approvals?.some((a:any)=>a.fileId===f.id)||v.snapshot.acceptedResults?.some((m:any)=>m.fileId===f.id)||v.snapshot.transactions?.some((t:any)=>t.fileId===f.id))));return false}
export function visible(s:Session){const d=structuredClone(s.data);if(!fullAccess(s)){for(const key of Object.keys(d)){if(Array.isArray(d[key as keyof WorkspaceData])&&!canCollection(s,key)){(d as any)[key]=[]}}
 d.projects=d.projects.filter(p=>projectAccess(s,p.id));d.milestones=d.milestones.filter(m=>projectAccess(s,m.projectId));d.activities=d.activities.filter(a=>projectAccess(s,a.projectId));d.cases=d.cases.filter(c=>projectAccess(s,c.projectId));d.files=d.files.filter(f=>fileAccess(s,f));d.audit=[];if(['Auditor','Approver','Observer'].includes(s.access.role)){d.reports=d.reports.filter(r=>JSON.parse(s.access.projects).includes(r.id));d.obligations=[];}
 }
 return {data:d,revision:s.revision,user:{name:s.user.displayName,email:s.user.email,role:s.access.role,governance:!!s.access.governance},members:fullAccess(s)?s.members:[],permissions:{full:fullAccess(s),finance:fullAccess(s)||s.access.role==='Treasurer'}};
}
export async function save(s:Session,operationId:string){const seen=(s.data as any).operations||[];(s.data as any).operations=[...seen.slice(-199),operationId];const result=await db().prepare('UPDATE workspaces SET data = ?, revision = revision + 1 WHERE id = ? AND revision = ?').bind(JSON.stringify(s.data),s.workspaceId,s.revision).run();if(!result.meta.changes)throw new AppError('Another change was saved first. Your view has been refreshed; please try the action again.',409);s.revision++}
export function checkOrigin(request:Request){if(!sameOrigin(request))throw new AppError('This request must come from your workspace.',403)}
export function responseError(e:unknown){if(e instanceof AppError)return Response.json({error:e.message},{status:e.status});console.error('Workspace request failed',e);return Response.json({error:'The change could not be saved. Please try again.'},{status:500})}
