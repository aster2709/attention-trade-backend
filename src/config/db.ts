import mongoose from "mongoose";

export const connectDB = async () => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is not defined in the .env file.");
    }
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB Connected...");
  } catch (err: any) {
    console.error(`MongoDB Connection Error: ${err.message}`);
    // Exit process with failure
    process.exit(1);
  }
};
