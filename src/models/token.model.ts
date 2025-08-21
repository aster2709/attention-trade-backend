import { getModelForClass, prop, modelOptions } from "@typegoose/typegoose";

// Keep ZoneState as a plain class with only @prop decorators
// This helps Typegoose understand it's a nested shape, not a model.
class ZoneState {
  @prop({ required: true })
  public entryMcap!: number;

  @prop({ required: true })
  public athMcapSinceEntry!: number;

  // --- ADD THIS LINE ---
  @prop({ required: true })
  public entryTimestamp!: Date;
}

// All model options are defined here
@modelOptions({
  schemaOptions: {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
})
export class Token {
  @prop({ required: true, unique: true, index: true })
  public mintAddress!: string;

  @prop({ required: true })
  public name!: string;

  @prop({ required: true })
  public symbol!: string;

  @prop({ default: 0 })
  public currentMarketCap!: number;

  @prop({ type: () => [String], default: [] })
  public activeZones!: string[];

  @prop({ type: () => Object, default: {} })
  public zoneState!: Record<string, ZoneState>;

  @prop({ default: 0 })
  public rickViews?: number;

  @prop({ default: 0 })
  public xPostCount!: number;

  @prop({ default: 0 })
  public xPostViews!: number;

  @prop()
  public latestTweetId?: string;

  @prop()
  public logoURI?: string;

  @prop()
  public creationTimestamp?: Date;

  @prop()
  public launchpad?: string;

  @prop()
  public metaLaunchpad?: string;

  @prop()
  public partnerConfig?: string;

  @prop({ default: 0 })
  public attentionScore!: number;

  // --- NEW FIELDS FOR AGGREGATED STATS ---
  @prop({ default: 0 })
  public scanCount!: number; // All-time total scan count

  @prop({ type: () => [String], default: [] })
  public scannedInGroups!: string[]; // Array of unique group IDs

  public get groupCount(): number {
    return this.scannedInGroups.length;
  }
}

export const TokenModel = getModelForClass(Token);
