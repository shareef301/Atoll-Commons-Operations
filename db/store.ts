import {database,files} from '@/server/storage.mjs';
import {runtimeConfig} from '@/server/config.mjs';
import {sameOrigin} from '@/server/sessions.mjs';
import {getUser} from '@/app/auth';
import {membership,workspace,members,bootstrap,saveWorkspace} from '@/server/records.mjs';
import {seedData,uid,now,normalizeWorkspace,type WorkspaceData} from '@/lib/model';
import {mailConfigured} from '@/server/mail-config.mjs';
export type Access={id:string;workspace_id:string;email:string;name:string;role:string;projects:string;governance:number;authority_ref:string};
export type Session={workspaceId:string;revision:number;data:WorkspaceData;access:Access;user:{userId:string;displayName:string;email:string};members:Access[]};
export class AppError extends Error{constructor(message:string,public status=400){super(message);this.name='AppError'}}
export function db(){return database()}
export function bucket(){return files()}
export async function session():Promise<Session>{
 const user=await getUser();if(!user)throw new AppError('Sign in to open your workspace.',401);
 const email=user.email.toLowerCase();let access=await membership(email) as Access|null;
 if(!access){if(email!==runtimeConfig().ownerEmail)throw new AppError('Your account has no workspace access.',403);await bootstrap(user,seedData());access=await membership(email) as Access|null;}
 if(!access)throw new AppError('Your workspace could not be opened.',503);
 if(access.role==='Disabled')throw new AppError('Your workspace access has been disabled.',403);
 const row=await workspace(access.workspace_id);if(!row)throw new AppError('Workspace not found.',404);
 const accessMembers=await members(access.workspace_id) as Access[];
 return {workspaceId:access.workspace_id,revision:row.revision,data:normalizeWorkspace(JSON.parse(row.data)),access,user,members:accessMembers};
}
export {fullAccess,projectAccess,canCollection,fileAccess,governanceAccess} from '@/lib/access';
import {projectWorkspace} from '@/lib/access';
export function visible(s:Session){const result=projectWorkspace(s);result.permissions.mailConfigured=mailConfigured();return result;}
export async function save(s:Session,operationId:string){const seen=(s.data as any).operations||[];(s.data as any).operations=[...seen.slice(-199),operationId];const saved=await saveWorkspace(s.workspaceId,s.revision,s.data);if(!saved)throw new AppError('Another change was saved first. Your view has been refreshed; please try the action again.',409);s.revision++}
export function checkOrigin(request:Request){if(!sameOrigin(request))throw new AppError('This request must come from your workspace.',403)}
export function responseError(e:unknown){if(e instanceof AppError)return Response.json({error:e.message},{status:e.status});console.error('Workspace request failed',e);return Response.json({error:'The change could not be saved. Please try again.'},{status:500})}
