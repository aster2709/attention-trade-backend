import {
  getModelForClass,
  prop,
  Ref,
  modelOptions,
} from "@typegoose/typegoose";
import { Token } from "./token.model";

@modelOptions({
  schemaOptions: {
    timestamps: { createdAt: true, updatedAt: false },
  },
})
export class Scan {
  @prop({ ref: () => Token, required: true, index: true })
  public token!: Ref<Token>;

  @prop({ required: true })
  public source!: "discord" | "telegram";

  @prop({ required: true, index: true })
  public groupId!: string;

  @prop()
  public groupName?: string;

  // REMOVED: Not currently used by the alert aggregation logic
  // public scannedAtMarketCap?: number;
}

export const ScanModel = getModelForClass(Scan);
