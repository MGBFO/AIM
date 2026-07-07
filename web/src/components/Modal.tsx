import { useEffect, type ReactNode } from 'react';

interface ModalProps {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  foot?: ReactNode;
  wide?: boolean;
  xwide?: boolean;
}

/** Overlay modal — closes on Escape or backdrop mousedown. Ported from spec. */
export function Modal({ title, onClose, children, foot, wide, xwide }: ModalProps) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={'modal' + (xwide ? ' xwide' : wide ? ' wide' : '')} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>{title}</span>
          <button className="x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {foot && <div className="modal-foot">{foot}</div>}
      </div>
    </div>
  );
}
