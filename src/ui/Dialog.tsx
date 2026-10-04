import { useEffect, useRef, type ReactNode } from 'react';

type Props = {
  title: string;
  children: ReactNode;
  actions: ReactNode;
  onClose: () => void;
  tone?: 'default' | 'error';
};

/** Minimal modal dialog: focus moves inside, Escape closes. */
export function Dialog({ title, children, actions, onClose, tone = 'default' }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('button')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
    };
  }, [onClose]);

  return (
    <div className="dialog-backdrop">
      <div
        ref={ref}
        className={`dialog dialog--${tone}`}
        role={tone === 'error' ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        <h2 id="dialog-title">{title}</h2>
        <div className="dialog__body">{children}</div>
        <div className="dialog__actions">{actions}</div>
      </div>
    </div>
  );
}
