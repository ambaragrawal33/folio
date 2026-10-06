import { Schema } from 'mongoose';
import type { Connection, InferSchemaType } from 'mongoose';

const portfolioSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    key: { type: String, required: true, default: 'default' },
    name: { type: String, required: true, default: 'My Portfolio' },
    baseCurrency: { type: String, required: true, default: 'INR' },
    costBasis: { type: String, required: true, enum: ['FIFO'], default: 'FIFO' },
    currencyLockedAt: { type: Date, default: null },
    revision: { type: Number, required: true, default: 0 },
    managementVersion: { type: Number, required: true, default: 0 },
    nextSequence: { type: Number, required: true, default: 0 },
    projectionVersion: { type: Number, required: true, default: 1 },
    dirtyFrom: { type: Date, default: null },
  },
  { strict: 'throw', timestamps: true },
);
portfolioSchema.index({ userId: 1, key: 1 }, { unique: true });
const instrumentSchema = new Schema(
  {
    _id: { type: String, required: true },
    symbol: { type: String, required: true },
    name: { type: String, required: true },
    exchange: { type: String, enum: ['NSE', 'BSE', 'US', 'CRYPTO'], required: true },
    currency: { type: String, required: true },
    assetClass: { type: String, enum: ['equity', 'etf', 'crypto'], required: true },
    sector: { type: String, required: true },
    provider: { type: String, enum: ['yahoo', 'coingecko'], required: true },
    providerId: { type: String, required: true },
    metadataSource: { type: String, required: true },
    aliases: { type: [String], default: undefined },
  },
  { strict: 'throw', versionKey: false },
);
instrumentSchema.index({ provider: 1, providerId: 1 }, { unique: true });
const fxSchema = new Schema(
  {
    rate: { type: Schema.Types.Decimal128, required: true },
    rateDate: { type: String, required: true },
    source: {
      type: String,
      enum: ['identity', 'Frankfurter/ECB', 'manual', 'demo-fixture', 'local-fixture'],
      required: true,
    },
    reference: { type: String, required: true },
  },
  { _id: false, strict: 'throw', versionKey: false },
);
const economicSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true, immutable: true },
    portfolioId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    instrumentId: { type: String, required: true, immutable: true },
    sequence: { type: Number, required: true, immutable: true },
    idempotencyKey: { type: String, required: true, immutable: true },
    requestHash: { type: String, required: true, immutable: true },
    type: {
      type: String,
      enum: ['BUY', 'SELL', 'DIVIDEND', 'SPLIT'],
      required: true,
      immutable: true,
    },
    effectiveAt: { type: Date, required: true, immutable: true },
    tradingDate: { type: String, required: true, immutable: true },
    currency: { type: String, required: true, immutable: true },
    baseCurrency: { type: String, required: true, immutable: true },
    fx: { type: fxSchema, required: true, immutable: true },
    quantity: { type: Schema.Types.Decimal128, immutable: true },
    price: { type: Schema.Types.Decimal128, immutable: true },
    fees: { type: Schema.Types.Decimal128, immutable: true },
    grossAmount: { type: Schema.Types.Decimal128, immutable: true },
    numerator: { type: Schema.Types.Decimal128, immutable: true },
    denominator: { type: Schema.Types.Decimal128, immutable: true },
    recordedAt: { type: Date, required: true, immutable: true },
  },
  { strict: 'throw', versionKey: false },
);
economicSchema.index({ portfolioId: 1, idempotencyKey: 1 }, { unique: true });
economicSchema.index({ portfolioId: 1, sequence: 1 }, { unique: true });
economicSchema.index({ userId: 1, portfolioId: 1, effectiveAt: 1, sequence: 1 });
const voidSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true, immutable: true },
    portfolioId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    transactionId: { type: Schema.Types.ObjectId, required: true, unique: true, immutable: true },
    reason: { type: String, required: true, immutable: true },
    recordedAt: { type: Date, required: true, immutable: true },
  },
  { strict: 'throw', versionKey: false },
);
voidSchema.index({ portfolioId: 1 });
function immutable(schema: Schema) {
  schema.pre(
    [
      'updateOne',
      'updateMany',
      'findOneAndUpdate',
      'replaceOne',
      'findOneAndReplace',
      'deleteOne',
      'deleteMany',
      'findOneAndDelete',
    ],
    function () {
      throw new Error('Economic records and void events are append-only.');
    },
  );
  schema.pre('save', function () {
    if (!this.isNew && this.isModified())
      throw new Error('Economic records and void events are append-only.');
  });
}
immutable(economicSchema);
immutable(voidSchema);
const projectionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    portfolioId: { type: Schema.Types.ObjectId, required: true },
    instrumentId: { type: String, required: true },
    quantity: { type: Schema.Types.Decimal128, required: true },
    revision: { type: Number, required: true },
    projectionVersion: { type: Number, required: true, default: 1 },
  },
  { strict: 'throw', versionKey: false },
);
projectionSchema.index({ portfolioId: 1, instrumentId: 1 }, { unique: true });
export type EconomicDocument = InferSchemaType<typeof economicSchema>;
export type VoidDocument = InferSchemaType<typeof voidSchema>;
export type PortfolioDocument = InferSchemaType<typeof portfolioSchema>;
const deletionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    portfolioId: { type: Schema.Types.ObjectId, required: true, immutable: true, unique: true },
    idempotencyKey: { type: String, required: true, immutable: true },
    requestHash: { type: String, required: true, immutable: true },
    deletedAt: { type: Date, required: true, immutable: true },
  },
  { strict: 'throw', versionKey: false },
);
deletionSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });
immutable(deletionSchema);
export function domainModels(connection: Connection) {
  return {
    Portfolio: connection.model('Portfolio', portfolioSchema, 'portfolios'),
    Instrument: connection.model('Instrument', instrumentSchema, 'instruments'),
    Economic: connection.model('EconomicRecord', economicSchema, 'economic_records'),
    Void: connection.model('VoidEvent', voidSchema, 'void_events'),
    Projection: connection.model('PositionProjection', projectionSchema, 'position_projections'),
    Deletion: connection.model('PortfolioDeletion', deletionSchema, 'portfolio_deletions'),
  };
}
