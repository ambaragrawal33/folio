import { Schema } from 'mongoose';
import type { Connection, InferSchemaType, Model } from 'mongoose';
import type { JobStats } from '@folio/shared';
import { JobRun, JobName, JobState } from '@folio/shared';
const stats = {
  requested: 0,
  accepted: 0,
  missing: 0,
  stale: 0,
  reused: 0,
  durationMs: 0,
  providerMs: 0,
  lockWaitMs: 0,
  cleaned: 0,
};
export const emptyStats = (): JobStats => ({ ...stats });
const runSchema = new Schema(
  {
    _id: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, default: null, index: true },
    portfolioId: { type: Schema.Types.ObjectId, default: null },
    name: { type: String, enum: JobName.options, required: true },
    state: { type: String, enum: JobState.options, default: 'queued', required: true },
    attempts: { type: Number, default: 0, required: true },
    generation: { type: Number, default: 0, required: true },
    leaseUntil: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    error: { type: String, default: null },
    stats: { type: Schema.Types.Mixed, default: emptyStats, required: true },
  },
  { strict: 'throw', timestamps: true },
);
runSchema.index({ userId: 1, portfolioId: 1, createdAt: -1, _id: 1 });
runSchema.index({ state: 1, leaseUntil: 1, createdAt: 1 });
runSchema.index({ finishedAt: 1 });
const quoteSchema = new Schema(
  {
    _id: { type: String, required: true },
    currency: { type: String, required: true },
    price: { type: Schema.Types.Decimal128, required: true },
    referencePrice: { type: Schema.Types.Decimal128, default: null },
    referencePeriod: { type: String, required: true },
    source: { type: String, required: true },
    asOf: { type: Date, required: true },
    observedAt: { type: Date, required: true },
    status: { type: String, required: true },
    fixture: { type: Boolean, required: true },
  },
  { strict: 'throw' },
);
const closeSchema = new Schema(
  {
    instrumentId: { type: String, required: true },
    date: { type: String, required: true },
    close: { type: Schema.Types.Decimal128, required: true },
    currency: { type: String, required: true },
    source: { type: String, required: true },
    observedAt: { type: Date, required: true },
    basis: { type: String, enum: ['observed-split-adjusted', 'synthetic-fixture'], required: true },
    fixture: { type: Boolean, required: true },
  },
  { strict: 'throw' },
);
closeSchema.index({ instrumentId: 1, date: 1 }, { unique: true });
export function jobModels(connection: Connection) {
  return {
    Run: connection.models['JobRun'] ?? connection.model('JobRun', runSchema, 'job_runs'),
    Observation:
      connection.models['MarketObservation'] ??
      connection.model('MarketObservation', quoteSchema, 'market_observations'),
    Close:
      connection.models['CloseObservation'] ??
      connection.model('CloseObservation', closeSchema, 'price_history'),
  } as {
    Run: Model<InferSchemaType<typeof runSchema>>;
    Observation: Model<InferSchemaType<typeof quoteSchema>>;
    Close: Model<InferSchemaType<typeof closeSchema>>;
  };
}
export const publicRun = (doc: {
  _id: string;
  name: string;
  state: string;
  attempts: number;
  createdAt: Date;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  error?: string | null;
  stats: unknown;
}) =>
  JobRun.parse({
    id: doc._id,
    name: doc.name,
    state: doc.state,
    attempts: doc.attempts,
    createdAt: doc.createdAt.toISOString(),
    startedAt: doc.startedAt?.toISOString() ?? null,
    finishedAt: doc.finishedAt?.toISOString() ?? null,
    error: doc.error ?? null,
    stats: doc.stats,
  });
