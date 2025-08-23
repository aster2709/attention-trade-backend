import {
  getModelForClass,
  prop,
  Ref,
  modelOptions,
} from "@typegoose/typegoose";
import { User } from "./user.model";
import { Token } from "./token.model";

@modelOptions({
  schemaOptions: { timestamps: true },
})
export class TelegramAlert {
  @prop({ ref: () => User, required: true })
  public user!: Ref<User>;

  @prop({ ref: () => Token, required: true, index: true })
  public token!: Ref<Token>;

  @prop({ required: true })
  public zoneName!: string;

  @prop({ required: true })
  public chatId!: number;

  @prop({ required: true })
  public messageId!: number; // For replying to this message

  @prop({ required: true })
  public entryMcap!: number;

  @prop({ type: () => [Number], default: [] })
  public checkpointsHit!: number[]; // e.g., [3, 10] for already notified multiples
}

export const TelegramAlertModel = getModelForClass(TelegramAlert);
