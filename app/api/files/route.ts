import {boundedRequest} from '@/server/http';
import {canDiscardEvidence} from '@/server/evidence-cleanup.mjs';
import {session,save,visible,bucket,checkOrigin,responseError,AppError,projectAccess,canCollection,fileAccess} from '@/db/store';
import {uid,now} from '@/lib/model';
export const dynamic='force-dynamic';
export async function POST(request:Request){let key:string|undefined;try{checkOrigin(request);const s=await session();const form=await (await boundedRequest(request,11*1024*1024)).formData();const f=form.get('file');const projectId=String(form.get('projectId')||'');const scope=String(form.get('scope')||'organization');
 if(!(f instanceof File)||!f.size)throw new AppError('Choose a file to upload.');if(f.size>10*1024*1024)throw new AppError('Choose a file smaller than 10 MB.');
 if(!fileAccess(s,{projectId,scope:s.access.role==='Treasurer'?'finance':scope},true))throw new AppError('You cannot add evidence to this scope.',403);
 const allowed=/\.(pdf|docx|xlsx|csv|txt|md|png|jpe?g|webp|zip)$/i;if(!allowed.test(f.name))throw new AppError('Use PDF, DOCX, XLSX, CSV, text, PNG, JPEG, WebP or ZIP.');
 const bytes=await f.arrayBuffer();const checksum=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');const id=uid();key=s.workspaceId+'/'+id;
 await bucket().put(key,bytes,{httpMetadata:{contentType:f.type||'application/octet-stream'}});
 s.data.files.push({id,title:f.name.replace(/[\r\n]/g,'').slice(0,200),status:'Retained',projectId,scope:s.access.role==='Treasurer'?'finance':scope,size:f.size,mime:f.type,sha256:checksum,createdAt:now(),owner:s.user.email,key});s.data.audit.unshift({id:uid(),at:now(),actor:s.user.email,action:'Evidence retained',detail:f.name,recordId:id});await save(s,uid());return Response.json({...visible(s),fileId:id,message:'Evidence saved securely.'});
 }catch(e){if(key&&canDiscardEvidence(e))await bucket().delete(key).catch(()=>{});return responseError(e)}}
