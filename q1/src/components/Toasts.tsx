import { useSyncExternalStore } from 'react';
import { toasts } from '../lib/toastBus';

export function Toasts() {
  const list = useSyncExternalStore(toasts.subscribe, toasts.getSnapshot);
  return (
    <div className="toasts">
      {list.map((t) => (
        <div key={t.id} className="toast" data-testid="validation-toast" role="alert">
          <strong>{t.title}</strong>
          <span>{t.message}</span>
          <button type="button" aria-label="Dismiss" onClick={() => toasts.dismiss(t.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
