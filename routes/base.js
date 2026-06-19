import express from "express";
import { readSheetRange } from "../config/google.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const data = await readSheetRange("'База'!A1:Z1000");
    res.json({ ok: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
