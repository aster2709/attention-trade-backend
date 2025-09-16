import axios from "axios";
import { Request, Response } from "express";

export const getTokenLeaderboard = async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const response = await axios.get(
      `https://v3.fnfscan.xyz/api/leaderboard/token/${token}`
    );
    return res.status(200).json(response.data);
  } catch (error) {
    console.error("Error fetching hall of fame:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
