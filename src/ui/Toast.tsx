import { useEffect } from 'react';
import { useStore } from 'zustand';
import type { EditorStore } from '../state/editorStore';

const TOAST_MS = 2500;

export function Toast({ editor }: { editor: EditorStore }) {
  const notice = useStore(editor, (s) => s.notice);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => {
      editor.getState().dismissNotice(notice.id);
    }, TOAST_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [editor, notice]);

  if (!notice) return null;
  return (
    <div className={`toast toast--${notice.tone}`} role="alert" data-testid="toast">
      {notice.tone === 'error' && <span aria-hidden="true">✕ </span>}
      {notice.text}
    </div>
  );
}
