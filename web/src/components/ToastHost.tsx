import { useEffect, useState } from 'react';
import { registerToastSink, type ToastInput } from '../lib/toast';
import { uid } from '../lib/util';

interface ToastItem extends ToastInput {
  id: string;
}

/** Renders transient toasts. Mount once, high in the tree. */
export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    registerToastSink((t) => {
      const id = uid('t');
      setItems((p) => [...p, { ...t, id }]);
      // Errors linger so they're readable (and screenshot-able); others are brief.
      const ttl = t.type === 'error' ? 15000 : t.undo ? 7000 : 3800;
      setTimeout(() => setItems((p) => p.filter((x) => x.id !== id)), ttl);
    });
    return () => registerToastSink(null);
  }, []);

  const dismiss = (id: string) => setItems((p) => p.filter((x) => x.id !== id));

  return (
    <div className="toasts">
      {items.map((t) => (
        <div key={t.id} className={'toast ' + t.type}>
          <span style={{ flex: 1 }}>{t.message}</span>
          {t.undo && (
            <button
              className="undo"
              onClick={() => {
                try {
                  t.undo!();
                } catch (e) {
                  console.error(e);
                }
                dismiss(t.id);
              }}
            >
              Undo
            </button>
          )}
          <button
            onClick={() => dismiss(t.id)}
            style={{ background: 'transparent', border: 'none', color: '#9aa7b3', fontSize: '16px' }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
