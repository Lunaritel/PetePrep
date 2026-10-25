// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installStreamIteration } from './streamIteration';

type IterableProto = Record<PropertyKey, unknown>;
const proto = ReadableStream.prototype as unknown as IterableProto;
const native = { values: proto.values, asyncIterator: proto[Symbol.asyncIterator] };

function streamOf<T>(items: T[]): ReadableStream<T> {
  return new ReadableStream<T>({
    start(controller) {
      for (const item of items) controller.enqueue(item);
      controller.close();
    },
  });
}

describe('installStreamIteration', () => {
  beforeEach(() => {
    // Simulate Safari before 26, which has no async iterator on ReadableStream.
    delete proto.values;
    delete proto[Symbol.asyncIterator];
  });
  afterEach(() => {
    proto.values = native.values;
    proto[Symbol.asyncIterator] = native.asyncIterator;
  });

  it('lets for await read every chunk of a ReadableStream', async () => {
    installStreamIteration();
    const seen: number[] = [];
    for await (const value of streamOf([1, 2, 3]) as unknown as AsyncIterable<number>) seen.push(value);
    expect(seen).toEqual([1, 2, 3]);
  });

  it('releases the stream when the loop stops early', async () => {
    installStreamIteration();
    const stream = streamOf(['a', 'b']);
    for await (const value of stream as unknown as AsyncIterable<string>) {
      expect(value).toBe('a');
      break;
    }
    expect(stream.locked).toBe(false);
  });

  it('leaves a browser that already supports it unchanged', () => {
    const existing = function existing() {};
    proto[Symbol.asyncIterator] = existing;
    installStreamIteration();
    expect(proto[Symbol.asyncIterator]).toBe(existing);
  });
});
