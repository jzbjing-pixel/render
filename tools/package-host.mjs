// Package only the reader changes; reconstruct the pre-change files for a reviewable patch.
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root=path.resolve(process.env.RILL_HOST_SOURCE||'../rill');
const paths=['src/modules/ExternalPlugin.tsx','src/domain.ts','src/host.ts','src/modules/builtin-plugins.ts','src/App.tsx','tests/module-catalog.test.tsx','src-tauri/src/plugin_protocol.rs','src-tauri/src/commands.rs','src-tauri/src/lib.rs','src-tauri/tauri.conf.json','src-tauri/crates/rill-core/src/media.rs','src-tauri/crates/rill-core/src/packages.rs','src-tauri/crates/rill-core/src/lib.rs','src-tauri/crates/rill-core/src/reader.rs','src-tauri/crates/rill-core/src/updates.rs','src-tauri/crates/rill-core/tests/reader.rs','src-tauri/crates/rill-core/examples/install_reader.rs'];
const added=new Set(['src/modules/ExternalPlugin.tsx','src-tauri/src/plugin_protocol.rs','src-tauri/crates/rill-core/src/reader.rs','src-tauri/crates/rill-core/tests/reader.rs','src-tauri/crates/rill-core/examples/install_reader.rs']);
const base='.private/host-base',next='.private/host-next';
for(const name of paths){
 const text=(await fs.readFile(path.join(root,name),'utf8')).replace(/\r\n/g,'\n');
 await fs.mkdir(path.dirname(path.join(next,name)),{recursive:true});await fs.writeFile(path.join(next,name),text);
 if(added.has(name))continue;
 let original=text;
 if(name==='src/domain.ts')original=original.replace(/  externalPluginBundle\?[^\n]*\n  readerRpc\?[^\n]*\n/,'');
 if(name==='src/host.ts')original=original.replace(/  externalPluginBundle=[^\n]*\n  readerRpc=[^\n]*\n/,'');
 if(name==='src/modules/builtin-plugins.ts')original=original.replace('  { id: "rill.ledger", name: "记账", version, installedAt: 0, enabled: true },','  { id: "rill.ledger", name: "记账", version, installedAt: 0, enabled: true },\n  { id: "rill.reader", name: "阅读器", version, installedAt: 0, enabled: true },').replace('{ id: "rill.reader", description: "阅读多维表中的 EPUB，保存阅读进度", status: "ready" }','{ id: "rill.reader", description: "留一处安静的阅读空间", status: "planned" }').replace('const plugin = entries.find((item) => item.id === module.id) ?? installed.find(item=>item.id===module.id);\n        if(!plugin)return undefined;','const plugin = entries.find((item) => item.id === module.id)!;').replace('      .filter((plugin):plugin is PluginEntry=>!!plugin)\n','');
 if(name==='src/App.tsx')original=original.replace(/const ExternalPlugin =[^\n]*\n/,'').replace("activePlugin.installedAt > 0 ? <ExternalPlugin key={`${activePlugin.id}:${activePlugin.version}`} plugin={activePlugin} onDirtyChange={value=>{dataDirty.current=value;}} /> : <PluginWorkspace",'<PluginWorkspace').replace("setToast(repository.asset.endsWith('.git.zip') ? (await host.checkUpdates()).message : \"发布仓库已添加\");",'setToast("发布仓库已添加");').replace('  const [gitSource,setGitSource]=useState(true);\n','').replace('asset: gitSource ? "rill-plugin.git.zip" : "rill-plugin.zip",','asset: "rill-plugin.zip",').replace(/        <label className="field"><span><input type="checkbox" checked=\{gitSource\}[^\n]*\n/,'');
 if(name==='tests/module-catalog.test.tsx')original=original.replace('it("lists installed EPUB reader as usable and keeps the ledger placeholder", async () => {','it("lists the approved five icons in order, retaining real modules and distinguishing placeholders", async () => {').replace("const plugins = availablePlugins([{id:'rill.reader',name:'EPUB 阅读器',version:'0.1.0',installedAt:1,enabled:true}]);",'const plugins = availablePlugins([]);').replace('    "EPUB 阅读器",','    "阅读器",').replace(').toEqual(["记账"]);',').toEqual(["记账", "阅读器"]);').replace('["可用", "开发中", "可用", "可用", "可用"]','["可用", "开发中", "可用", "可用", "开发中"]').replace('toHaveLength(1);\n  expect(plugins.some(p=>p.id===\'rill.reader\')).toBe(false);','toHaveLength(2);');
 if(name==='src-tauri/src/commands.rs')original=original.replace(/\n#\[tauri::command\]\npub async fn external_plugin_bundle[\s\S]*?(?=\n#\[tauri::command\]\npub async fn read_table_audio)/,'');
 if(name==='src-tauri/src/lib.rs')original=original.replace('mod plugin_protocol;\n','').replace('        .register_uri_scheme_protocol("rill-plugin",|context,request|plugin_protocol::serve(context.app_handle(),request.uri().path()))\n','').replace('commands::external_plugin_bundle,commands::reader_rpc,','');
 if(name==='src-tauri/tauri.conf.json')original=original.replace("img-src 'self' blob: data:","img-src 'self' data:").replace('frame-src http://rill-plugin.localhost rill-plugin:;',"frame-src 'none';");
 if(name==='src-tauri/crates/rill-core/src/media.rs')original=original.replace('pub fn authorize_record(config:&Value,table_id:&str,view_id:Option<&str>,root:&Root,note:&NoteEntry)->Result<()>{','pub fn authorize_audio(config:&Value,table_id:&str,view_id:Option<&str>,root:&Root,note:&NoteEntry)->Result<&\'static str>{').replace('    let table=config["tables"]','    let mime=audio_mime(&note.path).ok_or("此记录不是支持的音频文件")?;\n    let table=config["tables"]').replace(/    Ok\(\(\)\)\n}\npub fn authorize_audio[\s\S]*$/,'    Ok(mime)\n}\n');
 if(name==='src-tauri/crates/rill-core/src/packages.rs')original=original.replace(', "tables.epub.read", "reader.state.write"','');
 if(name==='src-tauri/crates/rill-core/src/lib.rs')original=original.replace('pub mod reader;\n','');
 if(name==='src-tauri/crates/rill-core/src/updates.rs')original=original.replace('    if repository.asset.ends_with(".git.zip") {return download_git(repository)}\n','').replace(/\/\/\/ Fetch a Git-backed package[\s\S]*$/,'');
 if(original===text)throw Error(`No change reconstructed for ${name}`);
 await fs.mkdir(path.dirname(path.join(base,name)),{recursive:true});await fs.writeFile(path.join(base,name),original);
}
const diff=spawnSync('git',['diff','--no-index','--src-prefix=a/','--dst-prefix=b/',base,next],{encoding:'utf8',maxBuffer:4*1024*1024});
if(diff.status!==1)throw Error(diff.stderr||'Expected a nonempty host diff');
const patch=diff.stdout.replaceAll(`a/${base}/`,'a/').replaceAll(`b/${next}/`,'b/').replaceAll(`a/${next}/`,'a/').replaceAll(`b/${base}/`,'b/');
await fs.writeFile('host-integration.patch',patch);console.log(`Host patch: ${paths.length} files, ${patch.length} characters`);
