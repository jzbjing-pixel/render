export interface Binding { tableId: string; viewId?: string }
export interface BookRecord { id: string; sourceId: string; name: string; path: string; size: number; modified: number }
export interface ReaderState { binding?: Binding; fontSize?: number; theme?: string }
export interface Position { chapter: string; ratio: number; modified: number; size: number }
let port: MessagePort;
let sequence = 0;
const pending = new Map<number, {resolve: (value: any) => void; reject: (reason: Error) => void; timer: ReturnType<typeof setTimeout>}>();
export const ready = new Promise<void>(resolve => {
  const initialize = (event: MessageEvent) => {
    if (event.source !== parent || event.data?.type !== 'rill:init' || !event.ports[0] || port) return;
    port = event.ports[0];
    window.removeEventListener('message', initialize);
    port.onmessage = event => {
      const reply = event.data, task = pending.get(reply?.id);
      if (!task) return;
      clearTimeout(task.timer); pending.delete(reply.id);
      reply.error ? task.reject(new Error(reply.error)) : task.resolve(reply.result);
    };
    resolve();
  };
  window.addEventListener('message', initialize);
});
export async function call<T>(action: string, request: unknown = {}): Promise<T> {
  await ready;
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {pending.delete(id); reject(new Error('宿主响应超时，请重试'));}, 45000);
    pending.set(id, {resolve, reject, timer});
    port.postMessage({id, action, request});
  });
}
