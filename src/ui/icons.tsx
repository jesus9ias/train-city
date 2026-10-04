import { routePoint, routeShape } from '../core/track/geometry';
import { activeRouteIndex, pieceRoutes } from '../core/track/routes';
import type { ObjectDef, TerrainDef, TrackPieceDef } from '../data/schemas/catalogs';
import { SpriteIcon } from './SpriteIcon';

const SIZE = 24;

/** Small vector preview of a track piece, drawn from the same geometry the game uses. */
function TrackVector({ piece, rotation = 0 }: { piece: TrackPieceDef; rotation?: number }) {
  const active = activeRouteIndex(piece, piece.defaultState);
  return (
    <svg width={SIZE} height={SIZE} viewBox="-0.1 -0.1 1.2 1.2" aria-hidden="true">
      <rect x="0" y="0" width="1" height="1" className="icon__cell" />
      {pieceRoutes(piece, rotation).map(([from, to], i) => {
        const shape = routeShape(from, to);
        const points = Array.from({ length: 13 }, (_, k) => routePoint(shape, k / 12));
        return (
          <g key={i}>
            <polyline
              points={points.map((p) => `${p.x},${p.y}`).join(' ')}
              className={
                piece.stateful && i !== active ? 'icon__rail icon__rail--inactive' : 'icon__rail'
              }
            />
            {to === null && points.at(-1) && (
              <circle
                cx={points.at(-1)?.x}
                cy={points.at(-1)?.y}
                r="0.12"
                className="icon__bumper"
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}

function ObjectVector({ object }: { object: ObjectDef }) {
  return (
    <svg width={SIZE} height={SIZE} viewBox="0 0 1 1" aria-hidden="true">
      {object.render.shape === 'circle' ? (
        <circle cx="0.5" cy="0.5" r="0.4" fill={object.render.color} />
      ) : (
        <rect x="0.15" y="0.15" width="0.7" height="0.7" fill={object.render.color} />
      )}
    </svg>
  );
}

function TerrainVector({ terrain }: { terrain: TerrainDef }) {
  return (
    <svg width={SIZE} height={SIZE} viewBox="0 0 1 1" aria-hidden="true">
      <rect x="0.05" y="0.05" width="0.9" height="0.9" fill={terrain.color} />
    </svg>
  );
}

/** Palette icons: the atlas sprite when available (spec.md §4.14), else a vector preview. */
export function TrackIcon({ piece, rotation = 0 }: { piece: TrackPieceDef; rotation?: number }) {
  const fallback = <TrackVector piece={piece} rotation={rotation} />;
  if (!piece.sprite?.prefix) return fallback;
  return (
    <SpriteIcon
      atlas={piece.sprite.atlas}
      frame={`${piece.sprite.prefix}_${piece.defaultState ?? 0}`}
      rotation={rotation}
      fallback={fallback}
    />
  );
}

export function ObjectIcon({ object }: { object: ObjectDef }) {
  const fallback = <ObjectVector object={object} />;
  const frame = object.sprite?.frames?.[0];
  if (!object.sprite || !frame) return fallback;
  return <SpriteIcon atlas={object.sprite.atlas} frame={frame} fallback={fallback} />;
}

export function TerrainIcon({ terrain }: { terrain: TerrainDef }) {
  const fallback = <TerrainVector terrain={terrain} />;
  const frame = terrain.sprite?.frames?.[0];
  if (!terrain.sprite || !frame) return fallback;
  return <SpriteIcon atlas={terrain.sprite.atlas} frame={frame} fallback={fallback} />;
}
