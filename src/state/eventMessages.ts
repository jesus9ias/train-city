import type { SimEvent } from '../core/sim/step';
import type { Notice } from './editorStore';
import type { ReadySession } from './gameStore';

const money = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

/** Player-facing toast for a simulation event; null for events shown elsewhere (results). */
export function describeEvent(
  event: SimEvent,
  session: ReadySession,
): Pick<Notice, 'text' | 'tone'> | null {
  const { catalogs } = session.ctx;
  const trainName = (id: string) => {
    const train = session.game.trains.find((t) => t.id === id);
    return `${catalogs.locomotives[train?.locomotive ?? '']?.name ?? 'Train'} ${id}`;
  };
  switch (event.type) {
    case 'train_blocked':
      return { text: `${trainName(event.trainId)} stopped: the track ends here`, tone: 'info' };
    case 'train_derailed':
      return { text: `${trainName(event.trainId)} derailed`, tone: 'error' };
    case 'train_out_of_fuel':
      return { text: `${trainName(event.trainId)} ran out of fuel`, tone: 'error' };
    case 'cargo_delivered': {
      const station = session.game.world.stations.find((s) => s.id === event.stationId);
      return {
        text: `+$${money.format(event.revenue)} delivered at ${station?.name ?? event.stationId}`,
        tone: 'info',
      };
    }
    case 'level_completed':
    case 'level_failed':
      return null;
  }
}
