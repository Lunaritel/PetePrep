import type { ParsedExam, SnapshotSegment } from '../../../../core/pdf/types';
import type { PageRenderer } from '../../pdf/pageRenderer';

export interface PickedPdf {
  name: string;
  data: Uint8Array;
}

/** Everything the wizard needs from the outside world, injectable so tests need no PDF engine. */
export interface ImportServices {
  /** Native "open PDF" dialog, or null when running outside Electron (the file input is used instead). */
  pickPdf: (() => Promise<PickedPdf | null>) | null;
  hash(data: Uint8Array): Promise<string>;
  parse(data: Uint8Array): Promise<ParsedExam>;
  renderSnapshot(data: Uint8Array, segments: SnapshotSegment[]): Promise<Blob>;
  createPageRenderer(data: Uint8Array): Promise<PageRenderer>;
}

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data.slice());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Real implementations. PDF code is imported lazily so a screen that never imports a file stays light. */
export function createDefaultServices(): ImportServices {
  return {
    pickPdf: window.deca ? () => window.deca!.openPdf() : null,
    hash: sha256Hex,
    async parse(data) {
      const [{ ensurePdfWorker }, { parseExamPdf }] = await Promise.all([
        import('../../pdf/pdfjsSetup'),
        import('../../../../core/pdf'),
      ]);
      ensurePdfWorker();
      return parseExamPdf(data.slice());
    },
    async renderSnapshot(data, segments) {
      const { renderSnapshotBlob } = await import('../../pdf/domSnapshot');
      return renderSnapshotBlob(data, segments);
    },
    async createPageRenderer(data) {
      const { createPageRenderer } = await import('../../pdf/pageRenderer');
      return createPageRenderer(data);
    },
  };
}
