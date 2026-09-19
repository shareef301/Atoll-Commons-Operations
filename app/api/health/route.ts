import { storageReady } from '@/server/storage.mjs';
import { validateDeployment } from '@/server/config.mjs';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    validateDeployment();
    await storageReady();
    return Response.json({status:'ok'},{headers:{'Cache-Control':'no-store'}});
  } catch { return Response.json({status:'unavailable'},{status:503,headers:{'Cache-Control':'no-store'}}); }
}
