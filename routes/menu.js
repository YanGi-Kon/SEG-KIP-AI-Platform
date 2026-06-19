import express from "express";
import { readSheetRange } from "../config/google.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const menu = await readSheetRange("'Меню'!A9:N19");
    res.json({ ok: true, menu });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
