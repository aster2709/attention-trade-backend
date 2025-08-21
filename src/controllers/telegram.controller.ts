import { Request, Response } from "express";
import { UserModel } from "../models/user.model";
import { ZONE_CRITERIA } from "../config/zones";

export const linkTelegramAccount = async (req: Request, res: Response) => {
  const { walletAddress, linkCode } = req.body;

  if (!walletAddress || !linkCode) {
    return res
      .status(400)
      .json({ message: "Wallet address and link code are required." });
  }

  try {
    const userWithCode = await UserModel.findOne({
      "telegram.linkCode": linkCode,
      "telegram.linkCodeExpires": { $gt: new Date() },
    });

    if (!userWithCode || !userWithCode.telegram) {
      return res.status(404).json({ message: "Invalid or expired code." });
    }

    const loggedInUser = await UserModel.findOne({ walletAddress });

    if (!loggedInUser) {
      return res
        .status(404)
        .json({ message: "User not found. Please connect your wallet first." });
    }

    // 1. Copy the telegram info to the logged-in user's document
    loggedInUser.telegram = userWithCode.telegram;
    if (loggedInUser.telegram) {
      loggedInUser.telegram.linkCode = undefined;
      loggedInUser.telegram.linkCodeExpires = undefined;
      loggedInUser.telegram.alertSettings = {}; // Clear any previous
      for (const zoneName in ZONE_CRITERIA) {
        loggedInUser.telegram.alertSettings[zoneName] = true;
      }
    }

    // --- THIS IS THE FIX ---
    // 2. Delete the temporary document that holds the unique chatId first.
    // This only runs if the user documents are different.
    if (loggedInUser._id.toString() !== userWithCode._id.toString()) {
      await UserModel.deleteOne({ _id: userWithCode._id });
    }

    // 3. NOW it is safe to save the main user document.
    await loggedInUser.save();

    const finalUser = await UserModel.findById(loggedInUser._id).lean();
    res.status(200).json({
      message: "Telegram account linked successfully.",
      user: finalUser,
    });
  } catch (error) {
    console.error("Error linking Telegram account:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
