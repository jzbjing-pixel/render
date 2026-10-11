import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import http from 'node:http';
const require=createRequire(import.meta.url);
const hostRoot=process.env.RILL_HOST_SOURCE||path.resolve('../rill');
const esbuild=require(path.join(process.env.RILL_DEPENDENCIES||path.join(hostRoot,'node_modules'),'esbuild'));
const JSZip=require(path.join(process.env.RILL_ZIP_DEPENDENCIES||path.resolve('node_modules'),'jszip'));
const {findBrowser,runBrowserProbe}=await import(pathToFileURL(path.join(hostRoot,'tools/browser-probe.mjs')).href);
await fs.mkdir('tests/output',{recursive:true});
const fixture=async(version=3)=>{
 const zip=new JSZip();zip.file('mimetype','application/epub+zip');zip.file('META-INF/container.xml','<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/book.opf"/></rootfiles></container>');
 zip.file('OEBPS/book.opf',`<package xmlns="http://www.idpf.org/2007/opf" version="${version}.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>阅读器验收书</dc:title><dc:creator>Rill</dc:creator></metadata><manifest><item id="one" href="one.xhtml" media-type="application/xhtml+xml"/><item id="two" href="two.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="${version===3?'nav.xhtml':'toc.ncx'}" media-type="${version===3?'application/xhtml+xml':'application/x-dtbncx+xml'}" ${version===3?'properties="nav"':''}/></manifest><spine><itemref idref="one"/><itemref idref="two"/></spine></package>`);
 zip.file('OEBPS/nav.xhtml','<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol><li><a href="one.xhtml">第一章 · 开始阅读</a></li><li><a href="two.xhtml#end">第二章 · 星河</a></li></ol></nav></body></html>');
 zip.file('OEBPS/toc.ncx','<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd"><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/"><navMap><navPoint><navLabel><text>第一章 · 开始阅读</text></navLabel><content src="one.xhtml"/></navPoint><navPoint><navLabel><text>第二章 · 星河</text></navLabel><content src="two.xhtml#end"/></navPoint></navMap></ncx>');
 zip.file('OEBPS/one.xhtml',`<html><body><h1>第一章 · 开始阅读</h1><script>window.PWNED=true</script><img src="https://evil.invalid/tracker" onerror="window.PWNED=true"><iframe src="https://evil.invalid"></iframe><p><a href="javascript:alert(1)">不可执行的链接</a></p>${Array.from({length:30},(_,i)=>`<p>第 ${i+1} 段。阅读，是在日常生活中留下一段安静的时间。中文正文、长段落与不同屏幕都应当自然舒展。</p>`).join('')}</body></html>`);
 zip.file('OEBPS/two.xhtml','<html><body><h1 id="end">第二章 · 星河</h1><p>夜色渐深，书页里的星河依然明亮。</p></body></html>');
 return zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
};
const fixture2=await fixture(2),fixture3=await fixture(3);await fs.writeFile('tests/sample.epub',fixture3);
const bomb=new JSZip();bomb.file('huge','0'.repeat(9*1024*1024));const bombData=await bomb.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
const entry=`import {Epub,resolvePath} from '../../src/epub';
const assert=(v:any,m:string)=>{if(!v)throw Error(m)};
export async function parserTests(){
for(const encoded of ${JSON.stringify([fixture2.toString('base64'),fixture3.toString('base64')])}){const book=await Epub.open(Uint8Array.from(atob(encoded),c=>c.charCodeAt(0)));assert(book.chapters.length===2,'EPUB spine');assert(book.toc.length===2,'EPUB 2/3 TOC');const content=await book.render(book.chapters[0]!.path);const holder=document.createElement('div');holder.append(content);assert(!holder.querySelector('script,iframe,[onerror],[href^="javascript"],img[src^="http"]'),'active content sanitized');assert(holder.textContent?.includes('第 30 段'),'Chinese body');book.dispose();}
for(const bytes of [new Uint8Array([1,2,3]),Uint8Array.from(atob(${JSON.stringify(bombData.toString('base64'))}),c=>c.charCodeAt(0))]){let rejected=false;try{await Epub.open(bytes)}catch{rejected=true}assert(rejected,'invalid and oversized ZIP rejected');}
assert(resolvePath('OEBPS/text/one.xhtml','../two.xhtml#end')==='OEBPS/two.xhtml','relative resource');let escaped=false;try{resolvePath('one.xhtml','../../secret')}catch{escaped=true}assert(escaped,'path escape rejected');return 8;
}
`;
await fs.writeFile('tests/output/parser.ts',entry);await esbuild.build({entryPoints:['tests/output/parser.ts'],bundle:true,format:'iife',globalName:'parser',outfile:'tests/output/parser.js',nodePaths:[process.env.RILL_ZIP_DEPENDENCIES||path.resolve('node_modules')]});
const manifest=await fs.readFile('dist/manifest.json'),meta=JSON.parse(manifest),main=await fs.readFile('dist/main.js','utf8'),signature=(await fs.readFile('dist/manifest.sig','utf8')).trim();
const publisher=JSON.parse(await fs.readFile('publisher.json','utf8'));
if(!crypto.verify('sha256',manifest,crypto.createPublicKey({key:Buffer.from(publisher.publicKey,'base64'),format:'der',type:'spki'}),Buffer.from(signature,'base64')))throw Error('Invalid package signature');
if(crypto.createHash('sha256').update(main).digest('hex')!==meta.files[0].sha256)throw Error('Invalid package hash');
const probe=`(async()=>{
const wait=ms=>new Promise(r=>setTimeout(r,ms)),assert=(v,m)=>{if(!v)throw Error(m)},until=async(fn)=>{for(let i=0;i<300;i++){if(fn())return;await wait(20)}throw Error('UI timeout')};
await until(()=>document.querySelector('#books .empty'));document.querySelector('#settings').click();await until(()=>document.querySelector('#binding-dialog').open);document.querySelector('#table').value='library';document.querySelector('#table').dispatchEvent(new Event('change'));document.querySelector('#view').value='view';document.querySelector('#theme').value=new URLSearchParams(parent.location?.search||'').get('theme')||'paper';
document.querySelector('#apply').click();await until(()=>document.querySelector('.book'));document.querySelector('.book').click();await until(()=>document.querySelector('#page h1'));await wait(100);assert(!window.PWNED,'book executed script');assert(!document.querySelector('#page iframe, #page script, #page [onerror]'),'unsafe markup');assert(document.querySelector('#page').scrollHeight>document.querySelector('#page').clientHeight,'reader scroll');
document.querySelector('#page').scrollTop=400;await wait(800);document.querySelector('#back').click();await until(()=>!document.querySelector('#library').hidden);document.querySelector('.book').click();await until(()=>!document.querySelector('#reading').hidden&&document.querySelector('#page h1'));await wait(150);assert(document.querySelector('#page').scrollTop>100,'progress restored');
document.querySelector('#contents').click();assert(document.querySelector('#toc-dialog').open,'TOC dialog');document.querySelectorAll('#toc button')[1].click();await until(()=>document.querySelector('#page h1')?.textContent.includes('星河'));assert(document.querySelector('#chapter').textContent.includes('星河'),'chapter jump');document.querySelector('#previous').click();await until(()=>document.querySelector('#page h1')?.textContent.includes('开始阅读'));
const r=document.querySelector('#page').getBoundingClientRect();assert(r.top>=0&&r.bottom<=innerHeight,'reader fits viewport');assert(document.documentElement.scrollWidth<=innerWidth,'no horizontal overflow');parent.postMessage({probe:{width:innerWidth,theme:document.body.dataset.theme,restored:true,toc:true,safe:true,pageFits:true}},'*');
})().catch(error=>parent.postMessage({probe:{error:error.message}},'*'));`;
// A sandboxed test probe cannot access the parent location; inject the selected theme as text.
const body=`<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; frame-src 'self'; img-src 'self' blob: data:"><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%;display:block}#report{display:none}</style></head><body><iframe sandbox="allow-scripts" id="frame"></iframe><pre id="report"></pre><script src="parser.js"></script><script>
(async()=>{window.testStage='parser';setTimeout(()=>{if(!document.querySelector('#report').textContent)document.querySelector('#report').textContent=JSON.stringify({error:'Timeout at '+window.testStage})},12000);const checks=await parser.parserTests();window.testStage='frame';const theme=new URLSearchParams(location.search).get('theme')||'paper';
const frame=document.querySelector('#frame');const html='/plugin.html?theme='+encodeURIComponent(theme);
let state={},saved=null,saves=0;frame.onload=()=>{const channel=new MessageChannel();channel.port1.onmessage=event=>{const {id,action,request}=event.data;let result=null;try{if(action==='state')result=state;else if(action==='tables')result=[{id:'library',name:'验收书库',views:[{id:'view',name:'EPUB 视图'}]}];else if(action==='saveState')state=request;else if(action==='query')result=[{id:'sample',sourceId:'books',path:'sample.epub',name:'阅读器验收书.epub',modified:1,size:${fixture3.length}}];else if(action==='open')result={data:${JSON.stringify(fixture3.toString('base64'))},position:saved};else if(action==='savePosition'){saved=request.position;++saves;}channel.port1.postMessage({id,result});}catch(error){channel.port1.postMessage({id,error:error.message})}};frame.contentWindow.postMessage({type:'rill:init'},'*',[channel.port2]);};window.addEventListener('message',event=>{if(event.source===frame.contentWindow&&event.data?.probe)document.querySelector('#report').textContent=JSON.stringify({...event.data.probe,checks,saves});});frame.src=html;})().catch(error=>document.querySelector('#report').textContent=JSON.stringify({error:error.message}));
</script></body></html>`;
await fs.writeFile('tests/output/test.html',body);
const server=http.createServer(async(request,response)=>{try{
 const url=new URL(request.url,'http://'+request.headers.host),origin=url.origin;
 if(url.pathname==='/plugin.html'){response.setHeader('Content-Type','text/html');response.setHeader('Content-Security-Policy',`default-src 'none';script-src ${origin};style-src 'unsafe-inline';img-src blob: data:;connect-src 'none';frame-src 'none';base-uri 'none';form-action 'none'`);response.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><script src="${origin}/plugin.js?theme=${encodeURIComponent(url.searchParams.get('theme')||'paper')}"></script></body></html>`);return;}
 if(url.pathname==='/plugin.js'){response.setHeader('Content-Type','text/javascript');response.end(main+'\n'+probe.replace("new URLSearchParams(parent.location?.search||'').get('theme')||'paper'",JSON.stringify(url.searchParams.get('theme')||'paper')));return;}
 const filename=url.pathname==='/parser.js'?'parser.js':'test.html';response.setHeader('Content-Type',filename.endsWith('.js')?'text/javascript':'text/html');response.end(await fs.readFile(`tests/output/${filename}`));
 }catch{response.statusCode=500;response.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const address=server.address();
const reports=[];
try{
for(const [width,height,theme] of [[1280,900,'paper'],[390,844,'sepia'],[320,568,'night']]){
 const result=await runBrowserProbe({browser:findBrowser(),page:path.resolve('tests/output/test.html'),navigationUrl:`http://127.0.0.1:${address.port}/`,width,height,urlSuffix:`?theme=${theme}`,screenshotPath:path.resolve(`tests/output/reader-${width}.png`)});
 const report=JSON.parse(result.report);reports.push(report);console.log(JSON.stringify(report));if(report.error||!report.restored||report.saves<1)throw Error('Reader browser test failed');
}
await fs.writeFile('tests/output/results.json',JSON.stringify(reports,null,2));console.log('Signature, EPUB 2/3, sanitization, progress and three layouts passed');
}finally{server.close();}
