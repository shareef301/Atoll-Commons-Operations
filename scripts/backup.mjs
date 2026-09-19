import { createBackup } from '../server/backups.mjs';
if (!process.env.DATA_DIR || !process.argv[2]) {
  console.error('Usage: DATA_DIR=/data npm run backup -- /path/to/new-backup-directory');
  process.exit(1);
}
try {console.log(JSON.stringify(await createBackup(process.env.DATA_DIR,process.argv[2])))}
catch(error){console.error('Backup failed:',error.message);process.exit(1)}
