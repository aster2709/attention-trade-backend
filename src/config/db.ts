import mongoose from "mongoose";
import { config } from "./env";
import { UserModel } from "../models/user.model";

export const connectDB = async () => {
  try {
    // No need to check for existence here, it's already validated
    await mongoose.connect(config.MONGO_URI);
	await UserModel.syncIndexes();
    console.log("MongoDB Connected...");
  } catch (err: any) {
    console.error(`MongoDB Connection Error: ${err.message}`);
    process.exit(1);
  }
};
