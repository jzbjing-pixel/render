// Developer smoke test of the already installed reader in a running local Rill WebView.
import fs from 'node:fs/promises';
const port=Number(process.env.RILL_DEBUG_PORT||19320);
const targets=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const target=targets.find(t=>t.type==='page'&&t.url.includes('tauri.localhost'));
if(!target)throw Error('Rill WebView not found');
const socket=new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
let sequence=0;const pending=new Map(),contexts=new Map();
socket.onmessage=event=>{const message=JSON.parse(event.data);if(message.id){const task=pending.get(message.id);pending.delete(message.id);message.error?task.reject(new Error(message.error.message)):task.resolve(message.result);}if(message.method==='Runtime.executionContextCreated')contexts.set(`${message.sessionId||''}:${message.params.context.id}`,{...message.params.context,sessionId:message.sessionId});};
const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params,sessionId}));});
const evaluate=async(expression,contextId,sessionId)=>{const result=await send('Runtime.evaluate',{expression,contextId,awaitPromise:true,returnByValue:true},sessionId);if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const until=async(fn)=>{for(let i=0;i<100;i++){const value=await fn();if(value)return value;await wait(100)}throw Error('Native UI timeout');};
try{
 await send('Runtime.enable');await send('Page.enable');
 const snapshot=await evaluate(`window.__TAURI_INTERNALS__.invoke('shell_snapshot')`);
 if(!snapshot.plugins.some(p=>p.id==='rill.reader'&&p.enabled))throw Error('Reader not installed');
 if(!await evaluate(`!!document.querySelector('.external-plugin-frame')`)){
 await until(()=>evaluate(`!!document.querySelector('.welcome-card')`));
 await evaluate(`document.querySelector('.brand').click()`);
 await until(()=>evaluate(`!![...document.querySelectorAll('.switch-option')].find(b=>b.textContent.includes('EPUB 阅读器'))`));
 await evaluate(`[...document.querySelectorAll('.switch-option')].find(b=>b.textContent.includes('EPUB 阅读器')).click()`);
 }
 await until(()=>evaluate(`document.querySelector('.external-plugin-frame')?.src.includes('rill-plugin.localhost')`));
 const childTarget=await until(async()=>{const list=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();return list.find(t=>t.type==='iframe'&&t.url.includes('rill-plugin.localhost'));});
 const childSession=await send('Target.attachToTarget',{targetId:childTarget.id,flatten:true});await send('Runtime.enable',{},childSession.sessionId);
 const readerContext=await until(async()=>{
   for(const context of contexts.values()){if(!context.auxData?.isDefault)continue;const value=await evaluate(`({reader:!!document.querySelector('#books'),native:!!window.__TAURI_INTERNALS__})`,context.id,context.sessionId).catch(()=>null);if(value?.reader)return {id:context.id,sessionId:context.sessionId,...value};}return null;
 });
 const bridge=await evaluate(`({keys:Object.keys(window.__TAURI_INTERNALS__||{}),invoke:typeof window.__TAURI_INTERNALS__?.invoke,origin:location.origin})`,readerContext.id,readerContext.sessionId);console.log(JSON.stringify({bridge}));
 const unauthorized=await evaluate(`Promise.race([window.__TAURI_INTERNALS__?.invoke?.('shell_snapshot').then(()=>({allowed:true})).catch(error=>({allowed:false,error:String(error)}))||Promise.resolve({allowed:false}),new Promise(resolve=>setTimeout(()=>resolve({allowed:false,error:'blocked or timed out'}),2500))])`,readerContext.id,readerContext.sessionId);console.log(JSON.stringify({unauthorized}));
 if(unauthorized.allowed)throw Error('Native commands leaked into reader sandbox');
 const reader=await until(()=>evaluate(`document.querySelector('#books .empty')?.textContent`,readerContext.id,readerContext.sessionId));
 await evaluate(`document.querySelector('#settings').click()`,readerContext.id,readerContext.sessionId);
 const dialog=await until(()=>evaluate(`document.querySelector('#binding-dialog')?.open`,readerContext.id,readerContext.sessionId));
 const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
 await fs.mkdir('tests/output',{recursive:true});await fs.writeFile('tests/output/native-reader.png',Buffer.from(screenshot.data,'base64'));
 const report={native:true,platform:snapshot.platform,storagePath:snapshot.storagePath,readerInstalled:true,version:snapshot.plugins.find(p=>p.id==='rill.reader').version,nativeInitializationPresent:readerContext.native,directNativeCallAllowed:unauthorized.allowed,emptyState:reader,settingsOpen:dialog};
 await fs.writeFile('tests/output/native-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 await evaluate(`document.querySelector('#binding-dialog').close()`,readerContext.id,readerContext.sessionId);
}finally{socket.close();}
