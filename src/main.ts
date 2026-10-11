import {call, ready, type BookRecord, type Binding, type Position, type ReaderState} from './bridge';
import {Epub} from './epub';
import css from './reader.css';
const style = document.createElement('style'); style.textContent = css; document.head.append(style);
document.body.innerHTML = `<main class="reader"><header><div class="brand">阅读<span>EPUB</span></div><button id="settings">书库设置</button></header><section id="library"><div class="library-head"><h1>我的书库</h1><input id="search" type="search" aria-label="搜索电子书" placeholder="搜索书名"></div><p id="scope"></p><div id="books" class="books"></div></section><section id="reading" hidden><div class="reading-bar"><button id="back">← 书库</button><strong id="book-title"></strong><button id="contents">目录</button></div><div id="page" tabindex="0" aria-label="电子书正文"></div><footer><button id="previous" aria-label="上一页">←</button><span id="chapter"></span><span id="progress"></span><button id="next" aria-label="下一页">→</button></footer></section><p id="status" role="status" aria-live="polite"></p><dialog id="binding-dialog"><form method="dialog"><h2>书库设置</h2><p>选择多维表中的 EPUB 文件。</p><label>数据表<select id="table"></select></label><label>视图<select id="view"></select></label><label>字号<input id="font" type="range" min="14" max="30" step="1"></label><label>纸张<select id="theme"><option value="paper">白纸</option><option value="sepia">暖纸</option><option value="night">夜读</option></select></label><div class="dialog-actions"><button value="cancel">取消</button><button id="apply" type="button">保存</button></div></form></dialog><dialog id="toc-dialog"><h2>目录</h2><div id="toc"></div><button id="close-toc">关闭</button></dialog></main>`;
const element = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const button = (id: string, handler: () => void | Promise<void>) => {element(id).onclick = () => {Promise.resolve(handler()).catch(error => message(error.message));};};
const page = element('page');
let state: ReaderState = {}, tables: {id:string;name:string;views:{id:string;name:string}[]}[] = [], records: BookRecord[] = [];
let book: Epub | undefined, record: BookRecord | undefined, index = 0, position: Position | undefined;
let operation = 0, saveTimer: ReturnType<typeof setTimeout> | undefined;
let saveQueue = Promise.resolve(), saveError = '';
let positionRevision=0;
const message = (text: string) => {element('status').textContent = text;};
function appearance() {document.body.dataset.theme = ['paper','sepia','night'].includes(state.theme || '') ? state.theme : 'paper'; page.style.fontSize = `${state.fontSize || 18}px`;}
function updateProgress() {
  if (!book) return;
  const ratio = page.scrollTop / Math.max(1, page.scrollHeight - page.clientHeight);
  element('progress').textContent = `${Math.round((index + ratio) / book.chapters.length * 100)}%`;
  element('chapter').textContent = book.chapters[index]!.title;
  (element('previous') as HTMLButtonElement).disabled = index === 0 && page.scrollTop < 1;
  (element('next') as HTMLButtonElement).disabled = index === book.chapters.length - 1 && page.scrollTop >= page.scrollHeight - page.clientHeight - 2;
}
function savePosition() {
  if (!book || !record) return saveQueue;
  const currentRecord = record, currentBinding = state.binding, currentPosition: Position = {chapter:book.chapters[index]!.path, ratio:page.scrollTop / Math.max(1,page.scrollHeight-page.clientHeight), modified:record.modified, size:record.size};
  const revision=positionRevision;
  position = currentPosition;
  saveQueue = saveQueue.then(async () => {
    try {await call('savePosition', {binding:currentBinding, record:currentRecord, position:currentPosition}); if(revision===positionRevision)await call('dirty',{dirty:false}); if (saveError) message('阅读进度已保存'); saveError = '';}
    catch (error) {saveError = (error as Error).message; message(`进度未保存：${saveError}`); throw error;}
  }).catch(() => {});
  return saveQueue;
}
page.onscroll = () => {updateProgress(); ++positionRevision; void call('dirty',{dirty:true}); clearTimeout(saveTimer); saveTimer = setTimeout(() => void savePosition(), 600);};
async function chapter(next: number, anchor?: string, ratio = 0) {
  if (!book || next < 0 || next >= book.chapters.length) return;
  clearTimeout(saveTimer);
  const activeBook = book, ticket = ++operation;
  message('正在排版…');
  const fragment = await activeBook.render(activeBook.chapters[next]!.path);
  if (ticket !== operation) return;
  index = next; page.replaceChildren(fragment);
  await Promise.all([...page.querySelectorAll('img')].map(image => image.decode().catch(() => {})));
  if (ticket !== operation) return;
  page.scrollTop = ratio * Math.max(0, page.scrollHeight - page.clientHeight);
  if (anchor) {const target = [...page.querySelectorAll('[id]')].find(node => node.id === decodeURIComponent(anchor)); target?.scrollIntoView({block:'start'});}
  updateProgress(); message(saveError ? `进度未保存：${saveError}` : '');
  page.focus({preventScroll:true});
}
async function turn(direction: number) {
  if (!book) return;
  const bottom = Math.max(0, page.scrollHeight - page.clientHeight);
  if (direction > 0 && page.scrollTop < bottom - 2 || direction < 0 && page.scrollTop > 2) page.scrollTop += direction * page.clientHeight * .9;
  else {await savePosition(); await chapter(index + direction, undefined, direction < 0 ? 1 : 0); void savePosition();}
}
async function open(item: BookRecord) {
  const ticket = ++operation; message('正在打开电子书…');
  const data = await call<{data:string;position?:Position}>('open', {binding:state.binding, record:item});
  const bytes = Uint8Array.from(atob(data.data), character => character.charCodeAt(0));
  const loaded = await Epub.open(bytes);
  if (ticket !== operation) {loaded.dispose(); return;}
  book?.dispose(); book = loaded; record = item; position = data.position;
  element('library').hidden = true; element('reading').hidden = false;
  element('book-title').textContent = book.title;
  element('toc').replaceChildren();
  for (const entry of book.toc.length ? book.toc : book.chapters.map(c=>({path:c.path,label:c.title}))) {
    const node = document.createElement('button'); node.textContent = entry.label;
    node.onclick = () => {element<HTMLDialogElement>('toc-dialog').close(); void jump(entry.path).catch(error=>message(error.message));}; element('toc').append(node);
  }
  const saved = position && position.modified === item.modified && position.size === item.size ? position : undefined;
  const next = saved ? book.chapters.findIndex(c => c.path === saved.chapter) : 0;
  await chapter(Math.max(0,next), undefined, saved?.ratio || 0);
}
async function jump(path: string) {
  if (!book) return;
  const [href, anchor] = path.split('#'), next = book.chapters.findIndex(c=>c.path===href);
  if (next < 0) {message('此链接不在正文目录中'); return;}
  await savePosition(); await chapter(next, anchor); void savePosition();
}
page.onclick = event => {const anchor = (event.target as Element).closest<HTMLElement>('[data-target]'); if (anchor?.dataset.target) {event.preventDefault(); void jump(anchor.dataset.target).catch(error=>message(error.message));}};
page.onkeydown = event => {if (['ArrowRight','PageDown','ArrowLeft','PageUp'].includes(event.key)) {event.preventDefault(); void turn(['ArrowRight','PageDown'].includes(event.key)?1:-1).catch(error=>message(error.message));}};
function renderBooks() {
  const needle = element<HTMLInputElement>('search').value.trim().toLowerCase();
  const list = records.filter(item=>item.name.toLowerCase().includes(needle));
  element('books').replaceChildren();
  if (!list.length) {const empty = document.createElement('p'); empty.className='empty'; empty.textContent = !state.binding ? '先在书库设置中选择数据表与视图。' : records.length ? '没有找到这本书。' : '当前范围内没有 EPUB，请在多维表中连接电子书文件夹。'; element('books').append(empty);}
  for (const item of list) {const card = document.createElement('button'); card.className='book'; const cover=document.createElement('span'); cover.className='cover'; cover.textContent=item.name.slice(0,1); const title=document.createElement('strong'); title.textContent=item.name.replace(/\.epub$/i,''); const detail=document.createElement('small'); detail.textContent=`EPUB · ${(item.size/1024/1024).toFixed(1)} MiB`; card.append(cover,title,detail); card.onclick=()=>void open(item).catch(error=>message(error.message)); element('books').append(card);}
}
async function refresh() {
  records = state.binding ? await call<BookRecord[]>('query', {binding:state.binding}) : [];
  const table = tables.find(t=>t.id===state.binding?.tableId), view=table?.views.find(v=>v.id===state.binding?.viewId);
  element('scope').textContent=table ? `${table.name} · ${view?.name || '全表'} · ${records.length} 本` : '书库使用多维表中的文件'; renderBooks();
}
function options(select: HTMLSelectElement, values:{id:string;name:string}[], all?: string) {
  select.replaceChildren(); if(all) select.add(new Option(all,'')); for(const value of values)select.add(new Option(value.name,value.id));
}
const updateViews=()=>options(element<HTMLSelectElement>('view'),tables.find(t=>t.id===element<HTMLSelectElement>('table').value)?.views||[],'全表');
button('settings', async()=>{tables=await call('tables'); options(element('table'),tables,'请选择数据表'); element<HTMLSelectElement>('table').value=state.binding?.tableId||''; updateViews(); element<HTMLSelectElement>('view').value=state.binding?.viewId||''; element<HTMLInputElement>('font').value=String(state.fontSize||18); element<HTMLSelectElement>('theme').value=state.theme||'paper'; element<HTMLDialogElement>('binding-dialog').showModal();});
element<HTMLSelectElement>('table').onchange=updateViews;
button('apply',async()=>{
  const tableId=element<HTMLSelectElement>('table').value; if(!tableId)throw Error('请选择数据表');
  const binding:Binding={tableId,viewId:element<HTMLSelectElement>('view').value||undefined};
  const next={binding,fontSize:Number(element<HTMLInputElement>('font').value),theme:element<HTMLSelectElement>('theme').value};
  await savePosition(); await call('saveState',next); state=next; appearance();
  book?.dispose(); book=undefined; record=undefined; ++operation; page.replaceChildren(); element('reading').hidden=true; element('library').hidden=false;
  element<HTMLDialogElement>('binding-dialog').close(); await refresh(); message('');
});
button('back',async()=>{clearTimeout(saveTimer); await savePosition(); if(saveError)throw Error(`进度未保存：${saveError}`); ++operation; book?.dispose();book=undefined;record=undefined;page.replaceChildren();element('reading').hidden=true;element('library').hidden=false;await refresh();});
button('previous',()=>turn(-1)); button('next',()=>turn(1)); button('contents',()=>element<HTMLDialogElement>('toc-dialog').showModal()); button('close-toc',()=>element<HTMLDialogElement>('toc-dialog').close());
element<HTMLInputElement>('search').oninput=renderBooks;
document.addEventListener('visibilitychange',()=>{if(document.hidden)void savePosition();});
window.addEventListener('pagehide',()=>{void savePosition(); book?.dispose();});
new ResizeObserver(()=>{if(book){page.scrollTop=(position?.ratio||0)*Math.max(0,page.scrollHeight-page.clientHeight);updateProgress();}}).observe(page);
void ready.then(async()=>{state=await call('state');tables=await call('tables');appearance();await refresh();}).catch(error=>message(error.message));
