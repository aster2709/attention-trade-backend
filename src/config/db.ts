import mongoose from "mongoose";
import { config } from "./env";

export const connectDB = async () => {
  try {
    // No need to check for existence here, it's already validated
    await mongoose.connect(config.MONGO_URI);
    console.log("MongoDB Connected...");
  } catch (err: any) {
    console.error(`MongoDB Connection Error: ${err.message}`);
    process.exit(1);
  }
};
