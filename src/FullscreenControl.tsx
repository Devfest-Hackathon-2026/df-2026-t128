import { useEffect, useState } from 'react';
import { ControlIcon } from './ControlIcon';

export function FullscreenControl() {
  const [active, setActive] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const sync = () => setActive(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  if (!document.fullscreenEnabled || failed) return null;
  const label = active ? '全画面を解除' : '全画面で表示';
  return <button type="button" data-tip={label} aria-label={label} aria-pressed={active} onClick={async e => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await e.currentTarget.closest('main')?.requestFullscreen();
    } catch { setFailed(true); }
  }}><ControlIcon name={active ? 'collapse' : 'expand'} /></button>;
}
