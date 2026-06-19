import express from "express";
import dotenv from "dotenv";

import healthRouter from "./routes/health.js";
import chatRouter from "./routes/chat.js";
import baseRouter from "./routes/base.js";
import workbookRouter from "./routes/workbook.js";
import menuRouter from "./routes/menu.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "10mb" }));
app.use(express.static("public"));

app.use("/api/health", healthRouter);
app.use("/api/chat", chatRouter);
app.use("/api/base", baseRouter);
app.use("/api/workbook", workbookRouter);
app.use("/api/menu", menuRouter);

app.listen(PORT, () => {
  const hasApiKey = Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith("sk-"));
  console.log(`SEG KIP AI Platform: http://localhost:${PORT}`);
  console.log(hasApiKey ? "AI rejim: ulangan" : "AI rejim: demo, API key yo‘q");
});
