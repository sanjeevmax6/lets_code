import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { runCode } from '../lib/runner';

await test('runner ignores forged readiness, enforces deadline, and removes sandbox', async () => {
  let removed = false;
  const scheduled: { fn: () => void; ms: number }[] = [];
  class Port {
    peer!: Port;
    onmessage: ((e: { data: unknown }) => void) | null = null;
    postMessage(data: unknown) {
      queueMicrotask(() => this.peer.onmessage?.({ data }));
    }
    close() {}
  }
  class Channel {
    port1 = new Port();
    port2 = new Port();
    constructor() {
      this.port1.peer = this.port2;
      this.port2.peer = this.port1;
    }
  }
  let workerPort: Port;
  const frame = {
    sandbox: { add: (value: string) => assert.equal(value, 'allow-scripts') },
    hidden: false,
    src: '',
    title: '',
    onload: () => {},
    remove: () => {
      removed = true;
    },
    contentWindow: {
      postMessage: (_data: unknown, origin: string, ports: Port[]) => {
        assert.equal(origin, '*');
        workerPort = ports[0];
        workerPort.onmessage = ({ data }) => {
          const m = data as { type: string };
          if (m.type === 'init') workerPort.postMessage({ type: 'ready' });
          if (m.type === 'run') workerPort.postMessage({ type: 'ready' });
        };
        workerPort.postMessage({ type: 'connected' });
      },
    },
  };
  const oldDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const oldChannel = Object.getOwnPropertyDescriptor(
    globalThis,
    'MessageChannel',
  );
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: () => frame,
      body: { appendChild: () => queueMicrotask(() => frame.onload()) },
    },
  });
  Object.defineProperty(globalThis, 'MessageChannel', {
    configurable: true,
    value: Channel,
  });
  mock.method(globalThis, 'fetch', async () => new Response('worker source'));
  mock.method(globalThis, 'setTimeout', (fn: () => void, ms: number) => {
    scheduled.push({ fn, ms });
    return scheduled.length;
  });
  mock.method(globalThis, 'clearTimeout', () => {});
  try {
    const pending = runCode(
      'function solve(){return 0}',
      'javascript',
      [{ args: [], expected: 0, label: 'case' }],
      'exact',
    );
    const rejected = assert.rejects(pending, /Time limit exceeded/);
    for (let i = 0; i < 30; i++) await Promise.resolve();
    assert.deepEqual(
      scheduled.map((t) => t.ms),
      [60000, 5000],
      'duplicate ready must not reset the runtime budget',
    );
    scheduled[1].fn();
    await rejected;
    assert.equal(removed, true);
  } finally {
    mock.restoreAll();
    if (oldDocument) Object.defineProperty(globalThis, 'document', oldDocument);
    else Reflect.deleteProperty(globalThis, 'document');
    if (oldChannel)
      Object.defineProperty(globalThis, 'MessageChannel', oldChannel);
  }
});
