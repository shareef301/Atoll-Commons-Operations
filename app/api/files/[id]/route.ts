import {session,bucket,responseError,AppError,projectAccess,canCollection,fileAccess} from '@/db/store';
export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){try{const {id}=await params;const s=await session();const f=s.data.files.find(f=>f.id===id);if(!f)throw new AppError('Evidence not found.',404);
 if(!fileAccess(s,f))throw new AppError('This evidence is outside your access scope.',403);
 const object=await bucket().get(f.key);if(!object)throw new AppError('The evidence file is unavailable.',404);return new Response(object.body,{headers:{'Content-Type':f.mime||'application/octet-stream','Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(f.title),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }catch(e){return responseError(e)}}
