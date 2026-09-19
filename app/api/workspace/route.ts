import {membership,workspace,switchWorkspace,assignAccess} from '@/server/records.mjs';
import {readCommand} from '@/server/http';
import {session,save,visible,checkOrigin,responseError,AppError,db,fullAccess,fileAccess} from '@/db/store';
import {applyCommand,type Actor} from '@/lib/domain';
import {uid,now,seedData,addDays,type WorkspaceData} from '@/lib/model';
export const dynamic='force-dynamic';
export async function GET(){try{const s=await session();return Response.json(visible(s),{headers:{'Cache-Control':'no-store'}})}catch(e){return responseError(e)}}
export async function POST(request:Request){try{checkOrigin(request);const s=await session();const c=await readCommand(request) as any;
 if(JSON.stringify(c).length>100000)throw new AppError('This record is too large. Upload long documents as files.');
 if(typeof c.operationId!=='string'||c.operationId.length>100)throw new AppError('Missing operation reference.');
 if((s.data as any).operations?.includes(c.operationId))return Response.json({...visible(s),message:'This change is already saved.'});
 if(c.revision!==s.revision)throw new AppError('Your records have changed in another session. Refresh and try again.',409);
 if(c.type==='mode_switch'){
  if(s.access.role!=='System owner')throw new AppError('Only the system owner can switch workspaces.',403);
  if(!['sample','live'].includes(c.mode)||c.mode===s.data.mode)throw new AppError('Choose the other workspace.');
  const prior=await workspace(s.workspaceId+'::'+c.mode);
  let next:WorkspaceData;
  if(prior)next=JSON.parse(prior.data);else{next=seedData();next.mode='live';for(const k of Object.keys(next)){if(Array.isArray((next as any)[k])&&!['rules','obligations'].includes(k))(next as any)[k]=[]}next.obligations=next.obligations.filter(o=>o.id==='o1');next.obligations[0].checklist.forEach((x:any)=>x.done=false);next.obligations[0].due=addDays(next.organization.registeredAt,90)}
  next.audit.unshift({id:uid(),at:now(),actor:s.user.email,action:'Workspace opened',detail:c.mode==='sample'?'Sample workspace opened':'Organization records opened'});
  const saved=await switchWorkspace(s.workspaceId,s.revision,next);
  if(!saved)throw new AppError('Another change was saved first. Refresh and try again.',409);
  return Response.json({...visible(await session()),message:c.mode==='sample'?'Sample workspace opened. Organization records are preserved.':'Organization records opened. Your sample workspace is preserved.'});
 }
 if(c.type==='member_access'){
  if(s.access.role!=='System owner')throw new AppError('Only the system owner can manage access.',403);
  const p=c.values||{};const email=String(p.email||'').trim().toLowerCase();const roles=['System owner','Compliance secretary','Treasurer','Project lead','Project participant','Project sponsor','Continuity deputy','Approver','Auditor','Observer'];
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!roles.includes(p.role))throw new AppError('Enter a valid email and role.');
  if(email===s.access.email&&p.role!=='System owner')throw new AppError('You cannot remove your own system owner access.');
  const existing=await membership(email);if(existing&&existing.workspace_id!==s.workspaceId)throw new AppError('This account already belongs to another workspace.');
  const governance=p.governance===true?1:0;const ref=String(p.authorityRef||'').trim();if(governance&&ref.length<10)throw new AppError('Record the formal governance appointment or delegation reference.');
  const projects=Array.isArray(p.projects)?p.projects.filter((id:string)=>[...s.data.projects,...s.data.reports].some(x=>x.id===id)):[];
  const audit={id:uid(),at:now(),actor:s.user.email,action:'Access assignment recorded',detail:email+' · '+p.role+(governance?' · governance authority: '+ref:'')};s.data.audit.unshift(audit);
  const saved=await assignAccess(s.workspaceId,s.revision,s.data,{email,name:String(p.name||email),role:p.role,projects,governance,authority_ref:ref});
  if(!saved)throw new AppError('Another change was saved first. Refresh and try again.',409);
  return Response.json({...visible(await session()),message:'Access assigned. This person can now sign in with the assigned email; no invitation was sent.'});
 }
 const evidenceId=c.fileId||c.values?.fileId;if(evidenceId){const evidence=s.data.files.find(f=>f.id===evidenceId);if(!evidence||!fileAccess(s,evidence))throw new AppError('Evidence is outside your authorized scope.',403);}
 const actor:Actor={name:s.user.displayName,email:s.user.email,role:s.access.role,governance:!!s.access.governance,projects:JSON.parse(s.access.projects)};
 let result;try{result=applyCommand(s.data,c,actor)}catch(e){throw new AppError(e instanceof Error?e.message:'This action is invalid.')}
 await save(s,c.operationId);return Response.json({...visible(s),...result});
 }catch(e){return responseError(e)}}
