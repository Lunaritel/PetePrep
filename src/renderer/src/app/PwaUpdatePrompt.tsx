import { useEffect, useState } from 'react';

export function PwaUpdatePrompt() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof __WEB_BUILD__ === 'undefined' || !__WEB_BUILD__ || !('serviceWorker' in navigator)) return;
    let active = true;
    const cleanups: (() => void)[] = [];
    void navigator.serviceWorker.ready.then((reg) => {
      if (!active) return;
      setRegistration(reg);
      if (reg.waiting) setReady(true);
      const watchInstalling = () => {
        const worker = reg.installing;
        if (!worker) return;
        const onStateChange = () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) setReady(true);
        };
        worker.addEventListener('statechange', onStateChange);
        cleanups.push(() => worker.removeEventListener('statechange', onStateChange));
      };
      reg.addEventListener('updatefound', watchInstalling);
      cleanups.push(() => reg.removeEventListener('updatefound', watchInstalling));
    }).catch(() => undefined);
    return () => { active = false; cleanups.forEach((cleanup) => cleanup()); };
  }, []);

  if (!ready) return null;
  return (
    <div role="status" className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-xl items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4 text-ink shadow-lg">
      <p className="text-sm font-medium">An update is ready. Reload PetePrep to use it.</p>
      <button type="button" className="min-h-11 shrink-0 rounded-lg bg-accent px-4 font-semibold text-on-accent" onClick={() => {
        const waiting = registration?.waiting;
        if (!waiting) { window.location.reload(); return; }
        navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
        waiting.postMessage({ type: 'SKIP_WAITING' });
      }}>Reload</button>
    </div>
  );
}
