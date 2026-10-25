import { useRef, useState } from 'react';
import type { PickedPdf } from './services';
import { platform } from '../../platform';

interface Props {
  error: string | null;
  canUseNativePicker: boolean;
  onNativePick: () => void;
  onFile: (file: PickedPdf) => void;
}

function readBytes(file: File): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer().then((b) => new Uint8Array(b));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

const MAX_PDF_BYTES = 25 * 1024 * 1024;

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

export function ChooseStep({ error, canUseNativePicker, onNativePick, onFile }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function take(file: File | undefined): Promise<void> {
    if (!file) return;
    if (!isPdf(file)) {
      setLocalError('That file is not a PDF. Choose the exam PDF you downloaded from DECA.');
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setLocalError('This PDF is larger than 25 MB. Try a smaller copy to avoid running out of memory on your phone.');
      return;
    }
    setLocalError(null);
    void platform.requestPersistentStorage();
    onFile({ name: file.name, data: await readBytes(file) });
  }

  const message = localError ?? error;

  return (
    <section aria-labelledby="choose-heading">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void take(e.dataTransfer.files[0]);
        }}
        className={`rounded-2xl border-2 border-dashed px-8 py-14 text-center transition-colors ${
          over ? 'border-accent bg-accent/5' : 'border-line bg-surface'
        }`}
      >
        <h2 id="choose-heading" className="text-xl font-semibold text-ink">
          Choose your DECA exam PDF
        </h2>
        <p className="mx-auto mt-2 max-w-md text-muted">
          Pick the exam file with the questions and the answer key. {platform.isDesktop ? 'The app reads it on this computer.' : 'This browser reads it on this device.'} Nothing is uploaded.
        </p>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          Only import exams you are allowed to use. PetePrep does not include or share any exam content.
        </p>
        <div className="mt-6 flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={() => (canUseNativePicker ? onNativePick() : inputRef.current?.click())}
            className="rounded-lg bg-accent px-6 py-3 text-base font-semibold text-on-accent hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Choose PDF…
          </button>
          <span className="text-sm text-muted">or drag a PDF onto this box</span>
        </div>
        <input
          ref={inputRef}
          data-testid="pdf-input"
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          tabIndex={-1}
          aria-label="PDF file"
          onChange={(e) => {
            void take(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
      {message && (
        <p role="alert" className="mt-4 rounded-lg border border-wrong/30 bg-wrong-bg px-4 py-3 text-wrong">
          {message}
        </p>
      )}
    </section>
  );
}
