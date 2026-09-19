import {createServerClient} from '@supabase/ssr';
import {NextResponse,type NextRequest} from 'next/server';

export async function proxy(request:NextRequest) {
  if(process.env.AUTH_MODE!=='supabase')return NextResponse.next();
  let response=NextResponse.next({request});
  const client=createServerClient(process.env.SUPABASE_URL!,process.env.SUPABASE_PUBLISHABLE_KEY!,{
    cookieOptions:{httpOnly:true,secure:process.env.APP_URL?.startsWith('https:'),sameSite:'lax',path:'/'},
    cookies:{getAll:()=>request.cookies.getAll(),setAll:(values,headers)=>{
      for(const {name,value} of values)request.cookies.set(name,value);
      response=NextResponse.next({request});
      for(const {name,value,options} of values)response.cookies.set(name,value,options);
      for(const [name,value] of Object.entries(headers))response.headers.set(name,value);
    }},
  });
  await client.auth.getClaims();
  response.headers.set('Cache-Control','private, no-store');
  return response;
}
export const config={matcher:['/','/signin','/api/workspace','/api/files/:path*','/api/export/:path*','/auth/:path*']};
