import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const src = path.resolve(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm');
const destDir = path.resolve(process.cwd(), 'public/wasm');
const dest = path.join(destDir, 'sql-wasm.wasm');

await mkdir(destDir, { recursive: true });
await copyFile(src, dest);
console.log('Copied sql-wasm.wasm to public/wasm/sql-wasm.wasm');
