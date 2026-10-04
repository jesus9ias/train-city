import { useState, type ReactNode } from 'react';
import { useStore } from 'zustand';
import type { ReadySession } from '../state/gameStore';
import { sameTool, type Tool } from '../state/editorStore';
import type { AppStores } from '../state/stores';
import { formatMoney } from './format';
import { ObjectIcon, TerrainIcon, TrackIcon } from './icons';
import { TrainBuilder } from './TrainBuilder';

type Tab = 'tracks' | 'trains' | 'objects' | 'terrain';

type Props = { stores: AppStores; session: ReadySession };

type Item = { tool: Tool; name: string; price: string; icon: ReactNode };

export function Palette({ stores, session }: Props) {
  const tool = useStore(stores.editor, (s) => s.tool);
  const rotation = useStore(stores.editor, (s) => s.rotation);
  const canUndo = session.past.length > 0;
  const canRedo = session.future.length > 0;
  const { catalogs, rules } = session.ctx;
  const { selectTool } = stores.editor.getState();
  const { undo, redo } = stores.game.getState();

  const tabs: { id: Tab; label: string }[] = [
    { id: 'tracks', label: 'Tracks' },
    { id: 'trains', label: 'Trains' },
    ...(rules.allowObjectEdit ? [{ id: 'objects' as const, label: 'Objects' }] : []),
    ...(rules.allowTerrainEdit ? [{ id: 'terrain' as const, label: 'Terrain' }] : []),
  ];
  const [tab, setTab] = useState<Tab>('tracks');
  const activeTab = tabs.some((t) => t.id === tab) ? tab : 'tracks';

  const items: Item[] =
    activeTab === 'trains'
      ? []
      : activeTab === 'tracks'
        ? Object.values(catalogs.pieces)
            .filter((p) => rules.allowedPieces?.includes(p.id) ?? true)
            .map((piece) => ({
              tool: { kind: 'track', piece: piece.id },
              name: piece.name,
              price: formatMoney(piece.cost),
              icon: <TrackIcon piece={piece} rotation={rotation} />,
            }))
        : activeTab === 'objects'
          ? Object.values(catalogs.objects).map((object) => ({
              tool: { kind: 'object', object: object.id },
              name: object.name,
              price: 'Free',
              icon: <ObjectIcon object={object} />,
            }))
          : Object.values(catalogs.terrains).map((terrain) => ({
              tool: { kind: 'terrain', terrain: terrain.id },
              name: terrain.name,
              price: 'Free',
              icon: <TerrainIcon terrain={terrain} />,
            }));

  const toolButton = (label: string, next: Tool, shortcut: string) => (
    <button
      type="button"
      className="tool-button"
      aria-pressed={sameTool(tool, next)}
      title={`${label} (${shortcut})`}
      onClick={() => {
        selectTool(sameTool(tool, next) ? null : next);
      }}
    >
      {label}
    </button>
  );

  return (
    <aside className="side-panel palette" aria-label="Build palette">
      <div className="palette__tools">
        {toolButton('Erase', { kind: 'erase' }, 'Del')}
        {toolButton('Rotate', { kind: 'rotate' }, 'click a track')}
        {toolButton('Inspect', { kind: 'inspect' }, 'I')}
        <button
          type="button"
          className="tool-button"
          disabled={!canUndo}
          onClick={undo}
          title="Undo (Ctrl+Z)"
        >
          Undo
        </button>
        <button
          type="button"
          className="tool-button"
          disabled={!canRedo}
          onClick={redo}
          title="Redo (Ctrl+Y)"
        >
          Redo
        </button>
      </div>

      <div className="palette__tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id === activeTab}
            onClick={() => {
              setTab(t.id);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'trains' ? (
        <div role="tabpanel" aria-label="trains">
          <TrainBuilder stores={stores} session={session} />
        </div>
      ) : (
        <ul className="palette__items" role="tabpanel" aria-label={activeTab}>
          {items.map((item) => (
            <li key={item.name}>
              <button
                type="button"
                className="palette__item"
                aria-pressed={sameTool(tool, item.tool)}
                onClick={() => {
                  selectTool(sameTool(tool, item.tool) ? null : item.tool);
                }}
              >
                {item.icon}
                <span className="palette__name">{item.name}</span>
                <span className="palette__price">{item.price}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {activeTab === 'tracks' && (
        <p className="palette__hint palette__rotation">
          Rotation {rotation}° — press R or{' '}
          <button
            type="button"
            className="tool-button"
            aria-label="Rotate piece"
            onClick={() => {
              stores.editor.getState().rotate();
            }}
          >
            ↻
          </button>
        </p>
      )}
    </aside>
  );
}
