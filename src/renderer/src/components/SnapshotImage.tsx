import { useEffect, useState } from 'react';

interface Props {
  blob: Blob | undefined;
  alt: string;
  className?: string;
}

/** Shows a stored question screenshot (PNG blob) and frees the object URL when it goes away. */
export function SnapshotImage({ blob, alt, className }: Props) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);

  if (!url) return null;
  return <img src={url} alt={alt} className={className ?? 'w-full rounded-lg border border-line bg-surface'} />;
}
