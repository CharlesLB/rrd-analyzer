importScripts('wasm_exec.js');

const RUNTIME_FILE = 'rrd-analyzer.wasm';
const RUNTIME_GLOBAL = 'rrdAnalyzer';
const RUNTIME_DID_NOT_START = 'the analyzer did not start';

const MESSAGE_KINDS = {
  SERVE: 'serve',
  CANCEL: 'cancel',
  KEEP: 'keep',
  ANSWERED: 'answered',
  KEPT: 'kept',
  FAILED: 'failed',
};

const startRuntime = async () => {
  const go = new Go();
  const { instance } = await WebAssembly.instantiateStreaming(fetch(RUNTIME_FILE), go.importObject);

  go.run(instance);

  const runtime = globalThis[RUNTIME_GLOBAL];

  if (runtime === undefined || runtime.failure !== undefined) {
    throw new Error(runtime?.failure ?? RUNTIME_DID_NOT_START);
  }

  return runtime;
};

const runtimeStarted = startRuntime();

const serve = async (runtime, message) => {
  const answer = await runtime.serve(message.requestId, message.method, message.path, message.body);

  postMessage({ kind: MESSAGE_KINDS.ANSWERED, requestId: message.requestId, status: answer.status, body: answer.body });
};

const cancel = (runtime, message) => {
  runtime.cancel(message.requestId);
};

const keep = (runtime, message) => {
  const path = runtime.keep(message.name, new Uint8Array(message.content));

  postMessage({ kind: MESSAGE_KINDS.KEPT, requestId: message.requestId, path });
};

const HANDLERS = {
  [MESSAGE_KINDS.SERVE]: serve,
  [MESSAGE_KINDS.CANCEL]: cancel,
  [MESSAGE_KINDS.KEEP]: keep,
};

const handleMessage = async (event) => {
  const message = event.data;

  try {
    await HANDLERS[message.kind](await runtimeStarted, message);
  } catch (error) {
    postMessage({ kind: MESSAGE_KINDS.FAILED, requestId: message.requestId, reason: error instanceof Error ? error.message : RUNTIME_DID_NOT_START });
  }
};

self.addEventListener('message', handleMessage);
