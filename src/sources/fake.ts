import type { Op } from '../contracts/ops.ts';
import type { OpEvent, OpSource } from '../contracts/op-source.ts';
import { createNdjsonParser } from '../ops/ndjson.ts';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 브라우저용 로더: 픽스처 NDJSON을 fetch로 받아온다. */
export function fixtureLoader(name: string): () => Promise<string> {
  return async () => {
    const res = await fetch(`/fixtures/ops/${name}.ndjson`);
    return res.text();
  };
}

/**
 * 가짜 op 스트림. load()로 NDJSON 텍스트 전체를 받은 뒤,
 * firstDelayMs 후 첫 줄부터 lineDelayMs 간격으로 한 줄씩 T18 파서에 흘려보낸다.
 */
export function createFakeOpSource({
  load,
  lineDelayMs = 150,
  firstDelayMs = 800,
}: {
  load: () => Promise<string>;
  lineDelayMs?: number;
  firstDelayMs?: number;
}): OpSource {
  let cancelled = false;

  function cancel(): void {
    cancelled = true;
  }

  async function* start(): AsyncIterable<OpEvent> {
    let text: string;
    try {
      text = await load();
    } catch {
      if (cancelled) return;
      yield { type: 'error', error: { kind: 'network' } };
      return;
    }
    if (cancelled) return;

    const lines = text.split(/\r\n|\n/).filter((line) => line.trim() !== '');

    let pending: Op | undefined;
    const parser = createNdjsonParser({
      onOp: (op) => {
        pending = op;
      },
      onInvalid: () => {
        // invalid 줄은 이벤트 없이 건너뛴다.
      },
    });

    for (let i = 0; i < lines.length; i += 1) {
      if (cancelled) return;
      await sleep(i === 0 ? firstDelayMs : lineDelayMs);
      if (cancelled) return;

      pending = undefined;
      parser.push(`${lines[i]}\n`);
      if (pending) {
        yield { type: 'op', op: pending };
      }
    }

    if (cancelled) return;
    yield { type: 'done' };
  }

  return { start, cancel };
}
