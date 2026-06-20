import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";

import healthRouter from "./routes/health.js";
import chatRouter from "./routes/chat.js";
import analysisRouter from "./routes/analysis.js";
import projectRouter from "./routes/project.js";
import baseRouter from "./routes/base.js";
import workbookRouter from "./routes/workbook.js";
import menuRouter from "./routes/menu.js";
import actsRouter from "./routes/acts.js";
import { createKudukRouter, initKudukRealtime } from "./routes/kuduk.js";

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "30mb" }));
app.use(express.static("public"));

app.use("/api/health", healthRouter);
app.use("/api/chat", chatRouter);
app.use("/api/analysis", analysisRouter);
app.use("/api/project", projectRouter);
app.use("/api/base", baseRouter);
app.use("/api/workbook", workbookRouter);
app.use("/api/menu", menuRouter);
app.use("/api/acts", actsRouter);
app.use("/api/kuduk", createKudukRouter(io));

initKudukRealtime(io);

server.listen(PORT, () => {
  const aiReady = Boolean(process.env.OPENAI_API_KEY);
  console.log(`SEG KIP AI Platform integrated: http://localhost:${PORT}`);
  console.log(aiReady ? "AI rejim: ulangan" : "AI rejim: demo");
});
