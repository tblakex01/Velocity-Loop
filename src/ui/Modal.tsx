import { useEffect, useRef } from "react";
import { Icon } from "./Icons";
export function Modal({
  title,
  subtitle,
  onClose,
  children,
  closeDisabled = false,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  closeDisabled?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={(event) => {
        event.preventDefault();
        if (!closeDisabled) onClose();
      }}
      aria-labelledby="modal-title"
    >
      <header>
        <div>
          <span className="eyebrow">{subtitle ?? "VELOCITY LOOP"}</span>
          <h2 id="modal-title">{title}</h2>
        </div>
        <button
          onClick={onClose}
          disabled={closeDisabled}
          aria-label="Close dialog"
        >
          <Icon name="close" />
        </button>
      </header>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}
