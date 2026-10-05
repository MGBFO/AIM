import { Modal } from './Modal';

interface ConfirmProps {
  title?: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirm dialog built on Modal. Ported from spec. */
export function Confirm({ title, message, confirmLabel, onConfirm, onCancel }: ConfirmProps) {
  return (
    <Modal
      title={title || 'Please Confirm'}
      onClose={onCancel}
      foot={
        <>
          <button className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn gold" onClick={onConfirm}>
            {confirmLabel || 'Confirm'}
          </button>
        </>
      }
    >
      <p style={{ margin: 0, fontSize: '14.5px' }}>{message}</p>
    </Modal>
  );
}
