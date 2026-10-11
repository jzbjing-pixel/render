import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const local = process.env.RILL_DEPENDENCIES;
const esbuild = local ? require(path.join(local,'esbuild')) : require('esbuild');
const JSZip = process.env.RILL_ZIP_DEPENDENCIES ? require(path.join(process.env.RILL_ZIP_DEPENDENCIES,'jszip')) : require('jszip');
await fs.mkdir('dist',{recursive:true});
await esbuild.build({entryPoints:['src/main.ts'],bundle:true,format:'iife',target:'es2022',minify:true,outfile:'dist/main.js',loader:{'.css':'text'},nodePaths:process.env.RILL_ZIP_DEPENDENCIES?[process.env.RILL_ZIP_DEPENDENCIES]:[]});
const main=await fs.readFile('dist/main.js');
const notices=await fs.readFile('THIRD_PARTY_NOTICES.md');
const manifest={format:1,id:'rill.reader',name:'EPUB 阅读器',version:'0.1.0',minHostApi:1,entry:'main.js',capabilities:['ui.render','tables.epub.read','reader.state.write'],files:[{path:'main.js',bytes:main.length,sha256:crypto.createHash('sha256').update(main).digest('hex')},{path:'THIRD_PARTY_NOTICES.md',bytes:notices.length,sha256:crypto.createHash('sha256').update(notices).digest('hex')}]};
const keyPath=process.env.RILL_SIGNING_KEY || '.private/publisher.pem';
let key;
try{key=crypto.createPrivateKey(await fs.readFile(keyPath));}
catch(error){if(error.code!=='ENOENT')throw error;await fs.mkdir(path.dirname(keyPath),{recursive:true});key=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'}).privateKey;await fs.writeFile(keyPath,key.export({format:'pem',type:'pkcs8'}),{mode:0o600});}
const bytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n');
const signature=crypto.sign('sha256',bytes,key).toString('base64');
const publicKey=crypto.createPublicKey(key).export({format:'der',type:'spki'}).toString('base64');
await fs.writeFile('dist/manifest.json',bytes);await fs.writeFile('dist/manifest.sig',signature);
await fs.writeFile('publisher.json',JSON.stringify({owner:'jzbjing-pixel',repo:'render',publicKey,asset:'rill-plugin.git.zip'},null,2)+'\n');
await fs.writeFile('dist/THIRD_PARTY_NOTICES.md',notices);
const zip=new JSZip();zip.file('manifest.json',bytes);zip.file('manifest.sig',signature);zip.file('main.js',main);zip.file('THIRD_PARTY_NOTICES.md',notices);
await fs.writeFile('dist/rill-plugin.git.zip',await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));
console.log(`Built and signed rill.reader 0.1.0 (${main.length} bytes)`);
