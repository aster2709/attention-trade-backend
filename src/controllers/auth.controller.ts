import { Request, Response } from "express";
import nacl from "tweetnacl";
import { UserModel } from "../models/user.model";
import { PublicKey } from "@solana/web3.js";

const LOGIN_MESSAGE = "Sign in to attention.trade to verify your wallet.";

export const login = async (req: Request, res: Response) => {
  try {
    const { walletAddress, signature } = req.body;

    if (!walletAddress || !signature) {
      return res
        .status(400)
        .json({ message: "Missing walletAddress or signature." });
    }

    // 1. Prepare data for verification
    const messageBytes = new TextEncoder().encode(LOGIN_MESSAGE);
    const signatureBytes = new Uint8Array(signature);
    const publicKeyBytes = new PublicKey(walletAddress).toBytes();

    // 2. Verify the signature
    const isVerified = nacl.sign.detached.verify(
      messageBytes,
      signatureBytes,
      publicKeyBytes
    );

    if (!isVerified) {
      return res
        .status(401)
        .json({ message: "Signature verification failed." });
    }

    // 3. Find or create the user record
    const user = await UserModel.findOneAndUpdate(
      { walletAddress },
      { $inc: { loginCount: 1 }, $set: { lastLoginAt: new Date() } },
      { upsert: true, new: true } // Create if doesn't exist, return the new doc
    );

    res.status(200).json({ message: "Authentication successful", user });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
