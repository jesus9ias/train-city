import { useRef, useState } from 'react';
import { useStore } from 'zustand';
import type { Issue } from '../data/validate';
import type { GameFileActions } from '../persistence';
import type { SaveStatusStore } from '../state/saveStatusStore';
import { Dialog } from './Dialog';

type Props = { actions: GameFileActions; saveStatus: SaveStatusStore };

const time = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' });

function SaveIndicator({ saveStatus }: { saveStatus: SaveStatusStore }) {
  const status = useStore(saveStatus, (s) => s.status);
  const text =
    status.kind === 'pending'
      ? 'Saving…'
      : status.kind === 'saved'
        ? `Saved ✓ ${time.format(status.at)}`
        : status.kind === 'error'
          ? `✕ Not saved: ${status.message}`
          : '';
  return (
    <span
      className={`save-indicator save-indicator--${status.kind}`}
      data-testid="save-status"
      aria-live="polite"
    >
      {text}
    </span>
  );
}

export function GameMenu({ actions, saveStatus }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [importIssues, setImportIssues] = useState<readonly Issue[] | null>(null);
  const [confirmRestart, setConfirmRestart] = useState(false);

  return (
    <div className="game-menu">
      <SaveIndicator saveStatus={saveStatus} />
      <button type="button" className="tool-button" onClick={actions.exportGame}>
        Download game
      </button>
      <button
        type="button"
        className="tool-button"
        onClick={() => {
          fileInput.current?.click();
        }}
      >
        Import game
      </button>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        hidden
        data-testid="import-input"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          void actions.importFile(file).then((result) => {
            if (!result.ok) setImportIssues(result.issues);
          });
        }}
      />
      <button
        type="button"
        className="tool-button"
        onClick={() => {
          setConfirmRestart(true);
        }}
      >
        Restart level
      </button>

      {importIssues && (
        <Dialog
          title="Could not import this file"
          tone="error"
          onClose={() => {
            setImportIssues(null);
          }}
          actions={
            <button
              type="button"
              className="tool-button"
              onClick={() => {
                setImportIssues(null);
              }}
            >
              Close
            </button>
          }
        >
          <p>Your current game was not changed.</p>
          <ul className="issue-list" data-testid="import-issues">
            {importIssues.map((issue, i) => (
              <li key={i}>
                {issue.path && <code>{issue.path}</code>} {issue.message}
              </li>
            ))}
          </ul>
        </Dialog>
      )}

      {confirmRestart && (
        <Dialog
          title="Restart level?"
          onClose={() => {
            setConfirmRestart(false);
          }}
          actions={
            <>
              <button
                type="button"
                className="tool-button"
                onClick={() => {
                  setConfirmRestart(false);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="tool-button tool-button--danger"
                onClick={() => {
                  setConfirmRestart(false);
                  actions.restart();
                }}
              >
                Restart
              </button>
            </>
          }
        >
          <p>Everything you built in this level will be lost, including its saved game.</p>
        </Dialog>
      )}
    </div>
  );
}
