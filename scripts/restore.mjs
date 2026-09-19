import { restoreBackup } from '../server/backups.mjs';
if (!process.env.DATA_DIR || !process.argv[2]) {
  console.error('Stop the app first. Usage: DATA_DIR=/empty/data npm run restore -- /path/to/backup');
  process.exit(1);
}
try {console.log(JSON.stringify(await restoreBackup(process.argv[2],process.env.DATA_DIR)))}
catch(error){console.error('Restore failed:',error.message);process.exit(1)}
