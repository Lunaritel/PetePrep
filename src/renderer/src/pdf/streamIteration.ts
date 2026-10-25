/**
 * pdf.js reads page text with `for await (... of readableStream)`. Safari before 26 has no async iterator on
 * ReadableStream, so importing failed on iPhones with "undefined is not a function". Adds the standard
 * `values()` / `Symbol.asyncIterator` methods when the browser lacks them.
 */
export function installStreamIteration(): void {
  if (typeof ReadableStream === 'undefined') return;
  const proto = ReadableStream.prototype as ReadableStream & { values?: unknown; [Symbol.asyncIterator]?: unknown };
  if (typeof proto[Symbol.asyncIterator] === 'function') return;

  function values<R>(this: ReadableStream<R>, options?: { preventCancel?: boolean }): AsyncIterableIterator<R> {
    const reader = this.getReader();
    const preventCancel = options?.preventCancel === true;
    return {
      async next() {
        const result = await reader.read();
        if (result.done) reader.releaseLock();
        return result.done ? { done: true, value: undefined } : { done: false, value: result.value };
      },
      async return(value?: unknown) {
        if (!preventCancel) await reader.cancel(value);
        reader.releaseLock();
        return { done: true, value: undefined };
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    };
  }

  Object.defineProperty(proto, 'values', { value: values, writable: true, configurable: true });
  Object.defineProperty(proto, Symbol.asyncIterator, { value: values, writable: true, configurable: true });
}
