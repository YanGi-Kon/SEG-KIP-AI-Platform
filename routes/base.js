import express from "express";
import { readSheetRange } from "../config/google.js";
import { requireAccessToken, requirePlatformRole } from "../middleware/auth.js";

const router = express.Router();
router.use(requireAccessToken, requirePlatformRole('admin', 'super_admin'));

router.get("/", async (req, res) => {
  try {
    const data = await readSheetRange("'База'!A1:Z1000");
    res.json({ ok: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
