import type { DecaApi } from '../../../preload';

export interface PickedTextFile {
  name: string;
  text: string;
}

export interface PickedPdfFile {
  name: string;
  data: Uint8Array;
}

function bridge(): DecaApi | undefined {
  return typeof window === 'undefined' ? undefined : window.deca;
}

function isWebBuild(): boolean {
  return typeof __WEB_BUILD__ !== 'undefined' && __WEB_BUILD__;
}

export const platform = {
  get canPickNatively(): boolean { return !isWebBuild() && Boolean(bridge()); },
  get isDesktop(): boolean { return !isWebBuild(); },
  get appVersion(): string { return bridge()?.version ?? (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'); },
  async pickPdf(): Promise<PickedPdfFile | null> {
    const deca = bridge();
    return deca ? deca.openPdf() : null;
  },
  async requestPersistentStorage(): Promise<boolean> {
    if (!isWebBuild() || typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
    try {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    } catch {
      // Storage persistence is best-effort; importing an exam must still work.
      return false;
    }
  },
  async downloadFile(name: string, text: string): Promise<string | null> {
    const deca = bridge();
    if (deca) return deca.saveTextFile(name, text);
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = name; anchor.hidden = true;
    document.body.append(anchor); anchor.click(); anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return name;
  },
  async pickTextFile(): Promise<PickedTextFile | null> {
    const deca = bridge();
    if (deca) return deca.openTextFile();
    return new Promise((resolve, reject) => {
      const input = document.createElement('input'); let settled = false;
      const finish = (value: PickedTextFile | null, error?: unknown) => { if (settled) return; settled = true; input.remove(); if (error) reject(error); else resolve(value); };
      input.type = 'file'; input.accept = 'application/json,.json'; input.hidden = true;
      input.addEventListener('change', () => { const file = input.files?.[0]; if (!file) { finish(null); return; } void file.text().then(text => finish({ name: file.name, text }), error => finish(null, error)); }, { once: true });
      input.addEventListener('cancel', () => finish(null), { once: true });
      document.body.append(input); input.click();
    });
  },
};
