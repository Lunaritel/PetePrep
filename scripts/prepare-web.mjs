import { copyFileSync, mkdirSync } from 'node:fs';

const publicDir = 'src/renderer/public';
mkdirSync(publicDir, { recursive: true });
copyFileSync('LICENSE', `${publicDir}/LICENSE`);
copyFileSync('THIRD_PARTY_NOTICES.txt', `${publicDir}/THIRD_PARTY_NOTICES.txt`);
console.log('Prepared web license and third-party notice files.');
