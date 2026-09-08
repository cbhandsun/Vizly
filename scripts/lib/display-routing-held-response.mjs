/** Browser-only fault injection. Keep one real response in-page until an
 * explicit release; no payload or request identifier is exposed by state(). */
export const installHeldRoutingResponse = () => {
  const prototype = window.Worker.prototype;
  const original = prototype.postMessage;
  let worker;
  let requestId;
  let response;
  let matched = false;
  let held = false;
  let released = false;
  let overflow = false;
  let disposed = false;
  const restore = () => {
    if (prototype.postMessage === intercept) prototype.postMessage = original;
  };
  const detach = () => worker?.removeEventListener('message', listener, true);
  const listener = event => {
    const value = event.data;
    if (value?.requestId !== requestId || !Array.isArray(value?.routingPatches) || value.hardClean !== true) return;
    event.stopImmediatePropagation();
    if (held) { overflow = true; return; }
    response = value;
    held = true;
  };
  const dispose = () => {
    restore(); detach(); response = undefined; worker = undefined; requestId = undefined; disposed = true;
  };
  function intercept(message, ...rest) {
    if (message?.operation === 'incremental-route' && typeof message.requestId === 'string'
      && message.requestId.length > 0 && message.requestId.length <= 512) {
      matched = true; worker = this; requestId = message.requestId;
      restore();
      worker.addEventListener('message', listener, true);
    }
    try { return Reflect.apply(original, this, [message, ...rest]); }
    catch (error) { dispose(); throw error; }
  }
  prototype.postMessage = intercept;
  return {
    state: () => ({ matched, held, released, overflow, disposed }),
    release: () => {
      if (!held || released || disposed || overflow) throw new Error('Invalid held routing response release');
      detach(); released = true;
      try { worker.dispatchEvent(new MessageEvent('message', { data: response })); }
      finally { response = undefined; worker = undefined; requestId = undefined; }
    },
    dispose,
  };
};
