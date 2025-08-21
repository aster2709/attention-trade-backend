import { getModelForClass, prop, modelOptions } from "@typegoose/typegoose";

class TelegramInfo {
  @prop({ required: true, unique: true, sparse: true })
  public chatId!: number;

  @prop()
  public username?: string;

  @prop()
  public firstName?: string;

  @prop({ type: () => Object, default: {} })
  public alertSettings!: Record<string, boolean>;

  // These fields are only used during the linking process
  @prop()
  public linkCode?: string;

  @prop()
  public linkCodeExpires?: Date;
}

@modelOptions({
  schemaOptions: { timestamps: true },
})
export class User {
  @prop({ required: true, unique: true, index: true })
  public walletAddress!: string;

  @prop({ default: 0 })
  public loginCount!: number;

  @prop()
  public lastLoginAt?: Date;

  @prop({ _id: false, type: () => TelegramInfo })
  public telegram?: TelegramInfo;
}

export const UserModel = getModelForClass(User);
