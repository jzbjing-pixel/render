import JSZip from 'jszip';
export interface Chapter { path: string; title: string }
export interface TocItem { path: string; label: string }
const MAX_FILE = 8 * 1024 * 1024;
function xml(text: string) {
  if (/<!ENTITY|<!DOCTYPE[^>]*\[/i.test(text)) throw Error('电子书包含不支持的 XML 声明');
  const document = new DOMParser().parseFromString(text.replace(/<!DOCTYPE[^>]*>/gi,''), 'application/xml');
  if (document.getElementsByTagName('parsererror').length) throw Error('EPUB 的目录或章节文件已损坏');
  return document;
}
const elements = (document: Document | Element, name: string) => Array.from(document.getElementsByTagNameNS('*', name));
export function resolvePath(base: string, relative: string): string {
  if (/^[a-z][a-z\d+.-]*:|^\/\/|^\//i.test(relative)) throw Error('不支持电子书中的外部资源');
  const segments = base.split('/').slice(0, -1);
  for (const part of decodeURIComponent(relative.split('#')[0]!.split('?')[0]!).split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {if (!segments.length) throw Error('电子书资源路径越界'); segments.pop();}
    else {if (/[\\\x00]/.test(part)) throw Error('电子书资源路径无效'); segments.push(part);}
  }
  return segments.join('/');
}
export class Epub {
  title = '';
  author = '';
  chapters: Chapter[] = [];
  toc: TocItem[] = [];
  private zip!: JSZip;
  private images: string[] = [];
  private async text(path: string): Promise<string> {
    const file = this.zip.file(path);
    if (!file) throw Error(`电子书缺少文件：${path}`);
    return file.async('string');
  }
  static async open(bytes: Uint8Array) {
    if (bytes.length > MAX_FILE) throw Error('第一版支持最大 8 MiB 的 EPUB');
    const book = new Epub();
    book.zip = await JSZip.loadAsync(bytes, {createFolders: false});
    const entries = Object.values(book.zip.files);
    if (entries.length > 4096) throw Error('电子书文件数量超过上限');
    let total = 0;
    for (const entry of entries) {
      const size = (entry as unknown as {_data?: {uncompressedSize?: number}})._data?.uncompressedSize ?? 0;
      total += size;
      if (size > MAX_FILE || total > 64 * 1024 * 1024 || entry.unsafeOriginalName?.includes('..')) throw Error('电子书展开后超过限制或路径不安全');
    }
    if ((await book.text('mimetype')).trim() !== 'application/epub+zip') throw Error('这不是有效的 EPUB 文件');
    const encryption = book.zip.file('META-INF/encryption.xml');
    if (encryption) {
      const algorithms = elements(xml(await encryption.async('string')), 'EncryptionMethod');
      if (algorithms.some(node => !['http://www.idpf.org/2008/embedding', 'http://ns.adobe.com/pdf/enc#RC'].includes(node.getAttribute('Algorithm') ?? ''))) throw Error('此 EPUB 受 DRM 保护，第一版无法阅读');
    }
    const container = xml(await book.text('META-INF/container.xml'));
    const opfPath = elements(container, 'rootfile')[0]?.getAttribute('full-path');
    if (!opfPath) throw Error('EPUB 缺少书籍清单');
    resolvePath('', opfPath);
    const opf = xml(await book.text(opfPath));
    book.title = elements(opf, 'title')[0]?.textContent?.trim() || '未命名电子书';
    book.author = elements(opf, 'creator')[0]?.textContent?.trim() || '';
    const manifest = new Map(elements(opf, 'item').map(node => [node.getAttribute('id'), node]));
    for (const ref of elements(opf, 'itemref')) {
      if (ref.getAttribute('linear') === 'no') continue;
      const item = manifest.get(ref.getAttribute('idref'));
      if (!item) throw Error('EPUB 章节引用已损坏');
      if (!['application/xhtml+xml', 'text/html'].includes(item.getAttribute('media-type') ?? '')) continue;
      book.chapters.push({path: resolvePath(opfPath, item.getAttribute('href')!), title: `第 ${book.chapters.length + 1} 节`});
    }
    if (!book.chapters.length) throw Error('EPUB 没有可阅读的章节');
    const navigation = [...manifest.values()].find(node => node.getAttribute('properties')?.split(/\s+/).includes('nav'));
    const ncx = [...manifest.values()].find(node => node.getAttribute('media-type') === 'application/x-dtbncx+xml');
    const nav = navigation || ncx;
    if (nav) {
      const navPath = resolvePath(opfPath, nav.getAttribute('href')!), document = xml(await book.text(navPath));
      if (navigation) {
        const root = elements(document, 'nav').find(n => n.getAttribute('epub:type')?.split(/\s+/).includes('toc') || n.getAttribute('role') === 'doc-toc') || elements(document, 'nav')[0];
        for (const anchor of root ? elements(root, 'a') : []) {
          try {const href = anchor.getAttribute('href')!; book.toc.push({path: resolvePath(navPath, href) + (href.includes('#') ? '#' + href.split('#')[1] : ''), label: anchor.textContent?.trim() || '章节'});} catch { /* Ignore remote navigation. */ }
        }
      } else {
        for (const point of elements(document, 'navPoint')) {
          const content = elements(point, 'content')[0], label = elements(point, 'text')[0];
          if (content && label) {const src = content.getAttribute('src')!; book.toc.push({path: resolvePath(navPath, src) + (src.includes('#') ? '#' + src.split('#')[1] : ''), label: label.textContent?.trim() || '章节'});}
        }
      }
    }
    for (const chapter of book.chapters) chapter.title = book.toc.find(item => item.path.split('#')[0] === chapter.path)?.label || chapter.title;
    return book;
  }
  dispose() {for (const url of this.images) URL.revokeObjectURL(url); this.images = [];}
  async render(path: string): Promise<DocumentFragment> {
    this.dispose();
    const document = new DOMParser().parseFromString(await this.text(path), 'text/html');
    const fragment = window.document.createDocumentFragment();
    const allowed = new Set('p div section article h1 h2 h3 h4 h5 h6 span strong em b i u s small sub sup br hr blockquote pre code ul ol li dl dt dd table thead tbody tr th td caption figure figcaption a img'.split(' '));
    const blocked = new Set('script style iframe object embed form input button link meta base svg math audio video'.split(' '));
    const walk = async (source: Node, destination: Node) => {
      if (source.nodeType === Node.TEXT_NODE) {destination.appendChild(window.document.createTextNode(source.textContent || '')); return;}
      if (!(source instanceof Element)) return;
      const tag = source.tagName.toLowerCase();
      if (blocked.has(tag)) return;
      const target = allowed.has(tag) ? window.document.createElement(tag) : window.document.createDocumentFragment();
      if (target instanceof HTMLElement) {
        if (source.id) target.id = source.id;
        if (['rtl', 'ltr', 'auto'].includes(source.getAttribute('dir') || '')) target.dir = source.getAttribute('dir')!;
        if (tag === 'a') {try {const href = source.getAttribute('href'); if (href) target.dataset.target = (href.startsWith('#') ? path : resolvePath(path, href)) + (href.includes('#') ? '#' + href.split('#')[1] : '');} catch { /* No external links. */ }}
        if (tag === 'img') {
          const src = source.getAttribute('src');
          try {
            const imagePath = resolvePath(path, src || ''), file = this.zip.file(imagePath);
            const ext = imagePath.split('.').pop()?.toLowerCase();
            const mime = ({png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif', webp:'image/webp', avif:'image/avif'} as Record<string,string>)[ext!];
            if (file && mime) {const url = URL.createObjectURL(new Blob([await file.async('uint8array')], {type:mime})); this.images.push(url); (target as HTMLImageElement).src = url;}
          } catch { /* Missing images do not block text. */ }
          (target as HTMLImageElement).alt = source.getAttribute('alt') || '';
        }
      }
      for (const child of source.childNodes) await walk(child, target);
      destination.appendChild(target);
    };
    for (const node of document.body.childNodes) await walk(node, fragment);
    return fragment;
  }
}
