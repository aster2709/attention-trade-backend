import { Request, Response } from "express";
import { UserModel } from "../models/user.model";

export const getMe = async (req: Request, res: Response) => {
  try {
    // Get wallet address from query parameter instead of req.user
    const { walletAddress } = req.query;

    if (!walletAddress || typeof walletAddress !== "string") {
      return res
        .status(400)
        .json({ message: "walletAddress query parameter is required." });
    }

    const user = await UserModel.findOne({
      walletAddress: walletAddress,
    }).select("-__v");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// New function to handle the update
export const updateTelegramAlerts = async (req: Request, res: Response) => {
  const { walletAddress, zone, enabled } = req.body;

  if (!walletAddress || !zone || typeof enabled !== "boolean") {
    return res.status(400).json({ message: "Missing required fields." });
  }

  try {
    const user = await UserModel.findOne({ walletAddress });
    if (!user || !user.telegram) {
      return res
        .status(404)
        .json({ message: "User or linked Telegram account not found." });
    }

    user.telegram.alertSettings[zone] = enabled;
    // Mongoose needs to be told the nested object has changed
    user.markModified("telegram.alertSettings");
    await user.save();

    res.status(200).json(user.telegram.alertSettings);
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error" });
  }
};
