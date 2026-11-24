import { DEFAULT_QUANTITY, SESSION_ID } from './lib/config';
import { telemetry } from './lib/telemetry';
import { OrderStore } from './orders/OrderStore';
import { SyncEngine } from './sync/SyncEngine';
import { connectStream, fetchSnapshot } from './sync/streamClient';

/** App-wide singletons. Plain classes, so the sync logic is testable without React. */
export const engine = new SyncEngine(fetchSnapshot, telemetry);
export const orders = new OrderStore(SESSION_ID, DEFAULT_QUANTITY, telemetry);

connectStream(engine, telemetry);
