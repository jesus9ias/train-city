import { Fragment } from 'react';
import { useStore } from 'zustand';
import { objectAt, stationAt, terrainAt, trackAt } from '../core/world/world';
import type { ReadySession } from '../state/gameStore';
import { networkReport } from '../state/selectors';
import type { AppStores } from '../state/stores';
import { ObjectivesPanel } from './ObjectivesPanel';
import { TrainPanel } from './TrainPanel';

type Props = { stores: AppStores; session: ReadySession };

export function Inspector({ stores, session }: Props) {
  const inspected = useStore(stores.editor, (s) => s.inspected);
  const hoverCell = useStore(stores.view, (s) => s.hoverCell);
  const showNetwork = useStore(stores.editor, (s) => s.showNetwork);
  const selectedTrain = useStore(stores.editor, (s) => s.selectedTrain);
  const train = session.game.trains.find((t) => t.id === selectedTrain);
  const { toggleNetwork } = stores.editor.getState();
  const { catalogs } = session.ctx;
  const { world } = session.game;
  const cell = inspected ?? hoverCell;

  const terrain = cell && catalogs.terrains[terrainAt(world, cell) ?? ''];
  const object = cell && objectAt(world, catalogs, cell);
  const track = cell && trackAt(world, cell);
  const station = cell && stationAt(world, cell);
  const report = showNetwork ? networkReport(world, catalogs) : null;
  const stationName = (id: string) => world.stations.find((s) => s.id === id)?.name ?? id;

  return (
    <aside className="side-panel inspector" aria-label="Inspector">
      <ObjectivesPanel session={session} />
      {train && <TrainPanel stores={stores} session={session} train={train} />}
      <section>
        <h2>{inspected ? 'Inspected cell' : 'Cell under cursor'}</h2>
        {cell ? (
          <dl className="inspector__facts" data-testid="inspector-cell">
            <dt>Cell</dt>
            <dd>
              {cell.x}, {cell.y}
            </dd>
            {terrain && (
              <>
                <dt>Terrain</dt>
                <dd>
                  {terrain.name}
                  {!terrain.buildable && ' (not buildable)'}
                </dd>
                {terrain.buildable && (
                  <>
                    <dt>Track cost</dt>
                    <dd>×{terrain.trackCostMultiplier}</dd>
                  </>
                )}
              </>
            )}
            {object && (
              <>
                <dt>Object</dt>
                <dd>
                  {catalogs.objects[object.type]?.name ?? object.type}
                  {object.locked && ' 🔒'}
                </dd>
              </>
            )}
            {track && (
              <>
                <dt>Track</dt>
                <dd>
                  {catalogs.pieces[track.piece]?.name ?? track.piece} · {track.rotation}°
                  {track.locked && ' 🔒'}
                </dd>
              </>
            )}
            {station && (
              <>
                <dt>Station</dt>
                <dd>{station.name}</dd>
                {station.supplies.map((supply) => (
                  <Fragment key={`s-${supply.cargo}`}>
                    <dt>Supplies</dt>
                    <dd data-testid={`supply-${supply.cargo}`}>
                      {Math.floor(session.game.run.inventories[station.id]?.[supply.cargo] ?? 0)}/
                      {supply.capacity} {catalogs.cargoTypes[supply.cargo]?.name.toLowerCase()}
                      {supply.ratePerMinute > 0 && ` (+${supply.ratePerMinute}/min)`}
                    </dd>
                  </Fragment>
                ))}
                {station.demands.map((demand) => (
                  <Fragment key={`d-${demand.cargo}`}>
                    <dt>Wants</dt>
                    <dd>
                      {catalogs.cargoTypes[demand.cargo]?.name ?? demand.cargo} · delivered{' '}
                      {session.game.run.delivered[station.id]?.[demand.cargo] ?? 0}
                    </dd>
                  </Fragment>
                ))}
                {station.services.includes('fuel') && (
                  <>
                    <dt>Services</dt>
                    <dd>Fuel</dd>
                  </>
                )}
              </>
            )}
          </dl>
        ) : (
          <p className="muted">Hover the map, or use Inspect and click a cell.</p>
        )}
      </section>

      <section>
        <h2>Network</h2>
        <button
          type="button"
          className="tool-button"
          aria-pressed={showNetwork}
          onClick={toggleNetwork}
        >
          {showNetwork ? 'Hide check' : 'Check network'}
        </button>
        {report && (
          <ul className="network-report" data-testid="network-report">
            <li>
              <span className="swatch swatch--loose" /> Loose ends: {report.looseEnds.length}
            </li>
            <li>
              <span className="swatch swatch--dead" /> Buffer stops: {report.deadEnds.length}
            </li>
            <li>
              <span className="swatch swatch--unused" /> Track not reaching a station:{' '}
              {report.unusedTracks.length}
            </li>
            <li>
              <span className="swatch swatch--isolated" /> Isolated stations:{' '}
              {report.isolatedStations.length
                ? report.isolatedStations.map(stationName).join(', ')
                : 'none'}
            </li>
            <li>Track groups: {report.groups}</li>
          </ul>
        )}
      </section>
    </aside>
  );
}
