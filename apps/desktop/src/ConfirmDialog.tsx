interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  // Omitting onCancel renders a single acknowledgement button instead of a
  // confirm/cancel pair - used for the "you have an open shift" blocking
  // notices, which aren't a yes/no choice, just information to act on.
  onCancel?: () => void;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  if (!open) return null;
  return (
    <div className="drawer-overlay confirm-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()} role="alertdialog" aria-label={title}>
        <h2>{title}</h2>
        <p>{message}</p>
        <div className="confirm-actions">
          {onCancel && (
            <button className="btn btn-secondary" onClick={onCancel}>
              {cancelLabel}
            </button>
          )}
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
