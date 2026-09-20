import {getUser} from '@/app/auth';
import {runtimeConfig} from '@/server/config.mjs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const params=new URL(request.url).searchParams,kind=params.get('kind'),id=params.get('id')||'';
 if(!['decisions','communications'].includes(kind||'')||!/^[a-zA-Z0-9-]{1,80}$/.test(id))return new Response('Link not found',{status:404});
 const path='/#'+kind+'?id='+id,config=runtimeConfig();
 const headers=new Headers({'Cache-Control':'no-store',Location:config.origin+(await getUser()?path:'/signin')});
 headers.append('Set-Cookie','ops_return_to='+encodeURIComponent(path)+'; Path=/; HttpOnly; SameSite=Lax; Max-Age=1800'+(config.secure?'; Secure':''));
 return new Response(null,{status:303,headers});
}
