import { createBackup } from '../server/backups.mjs';
import {createSupabaseBackup} from '../server/supabase-backups.mjs';
if ((!process.env.DATA_DIR && process.env.STORAGE_BACKEND!=='supabase') || !process.argv[2]) {
  console.error('Usage: DATA_DIR=/data npm run backup -- /path/to/new-backup-directory');
  process.exit(1);
}
try {console.log(JSON.stringify(process.env.STORAGE_BACKEND==='supabase'?await createSupabaseBackup(process.argv[2]):await createBackup(process.env.DATA_DIR,process.argv[2])))}
catch(error){console.error('Backup failed:',error.message);process.exit(1)}
