import { ExFileUploadError } from './errors';
import type { UploadRequestHandle, UploadTransportResult } from './upload-request';

export const DEFAULT_UPLOAD_CONCURRENCY = 3;

interface ScheduledUpload {
  create: () => UploadRequestHandle;
  onStart?: () => void;
  handle?: UploadRequestHandle;
  phase: 'queued' | 'starting' | 'running' | 'finished';
  settle: (result: UploadTransportResult) => void;
}

/** 文件级并发独立于协议；单个 tus 文件仍按服务器确认的偏移顺序上传。 */
export function createUploadScheduler(getConcurrency: () => number | undefined) {
  const queue = new Set<ScheduledUpload>();
  let active = 0;
  let scheduled = false;
  const capacity = () => {
    const value = getConcurrency();
    return value === Number.POSITIVE_INFINITY || (Number.isSafeInteger(value) && value! > 0)
      ? value!
      : DEFAULT_UPLOAD_CONCURRENCY;
  };
  const errorResult = (cause: unknown): UploadTransportResult => ({
    outcome: 'error',
    error:
      cause instanceof ExFileUploadError
        ? cause
        : new ExFileUploadError('无法启动上传任务', { code: 'request-error', cause }),
  });
  const finish = (task: ScheduledUpload, result: UploadTransportResult) => {
    if (task.phase === 'finished') return;
    if (task.phase === 'queued') queue.delete(task);
    else active -= 1;
    task.phase = 'finished';
    task.settle(result);
    update();
  };
  const finished = (task: ScheduledUpload) => task.phase === 'finished';
  const update = () => {
    if (scheduled) return;
    scheduled = true;
    void Promise.resolve().then(() => {
      scheduled = false;
      for (const task of queue) {
        if (active >= capacity()) break;
        queue.delete(task);
        task.phase = 'starting';
        active += 1;
        try {
          task.onStart?.();
          if (finished(task)) continue;
          task.handle = task.create();
          void task.handle.promise.then(
            result => finish(task, result),
            cause => finish(task, errorResult(cause))
          );
          // 工厂也可能同步调用取消，迟到的句柄不能继续拥有传输。
          if (finished(task)) task.handle.abort();
          else task.phase = 'running';
        } catch (cause) {
          finish(task, errorResult(cause));
        }
      }
    });
  };
  const enqueue = (
    create: () => UploadRequestHandle,
    onStart?: () => void
  ): UploadRequestHandle => {
    let settle!: (result: UploadTransportResult) => void;
    const promise = new Promise<UploadTransportResult>(resolve => {
      settle = resolve;
    });
    const task: ScheduledUpload = { create, settle, onStart, phase: 'queued' };
    queue.add(task);
    update();
    return {
      promise,
      get pending() {
        return !finished(task) && (!task.handle || task.handle.pending);
      },
      abort() {
        if (finished(task)) return false;
        if (task.handle) return task.handle.abort();
        finish(task, { outcome: 'aborted' });
        return true;
      },
    };
  };
  return { enqueue, update };
}
