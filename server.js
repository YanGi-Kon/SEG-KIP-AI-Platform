import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import http from "http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";

import healthRouter from "./routes/health.js";
import chatRouter from "./routes/chat.js";
import projectRouter from "./routes/project.js";
import baseRouter from "./routes/base.js";
import workbookRouter from "./routes/workbook.js";
import menuRouter from "./routes/menu.js";
import actsRouter from "./routes/acts.js";
import ulchovRouter from "./routes/ulchov.js";
import signaturesRouter from "./routes/signatures.js";
import authRouter from "./routes/auth.js";
import workspacesRouter from "./routes/workspaces.js";
import { createKudukRouter, initKudukRealtime } from "./routes/kuduk.js";
import { isDatabaseConfigured } from "./db/pool.js";
import { runMigrations } from "./db/migrate.js";

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
const PORT = process.env.PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const publicDir = join(__dirname, "public");
const publicAssetsDir = join(publicDir, "assets");
const indexHtmlPath = join(publicDir, "index.html");

const staticNoCacheOptions = {
  etag: false,
  maxAge: 0,
  setHeaders(res, filePath) {
    if (filePath.endsWith(".html") || filePath.endsWith(".js")) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
    }
  },
};

const authBootGuard = `
<style id="sanegAuthBootStyle">
  html.saneg-auth-boot,
  html.saneg-auth-boot body {
    background: #020817 !important;
  }

  html.saneg-auth-boot body > *:not(#sanegLoginGate) {
    visibility: hidden !important;
  }

  html.saneg-auth-boot #sanegLoginGate,
  html.saneg-auth-boot #sanegLoginGate * {
    visibility: visible !important;
  }
</style>
<script id="sanegAuthBootScript">
  document.documentElement.classList.add('saneg-auth-boot');
  window.setTimeout(function(){
    if (!document.getElementById('sanegLoginGate')) {
      document.documentElement.classList.remove('saneg-auth-boot');
      document.getElementById('sanegAuthBootStyle')?.remove();
    }
  }, 8000);
</script>`;

app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors());
app.use(express.json({ limit: "30mb" }));
app.use(express.urlencoded({ extended: false, limit: "2mb" }));

app.use((req, res, next) => {
  if (req.path === "/" || req.path.endsWith(".html") || req.path.endsWith(".js")) {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
  }
  next();
});

app.get("/", (_req, res, next) => {
  try {
    const html = readFileSync(indexHtmlPath, "utf8");
    const loginGateScript = '<script id="sanegLoginGateRootScript" src="/js/saneg-login-gate.js?v=root1d" defer></script>';
    const htmlWithAuthBoot = html.includes("sanegAuthBootScript")
      ? html
      : html.replace("</head>", `${authBootGuard}\n</head>`);
    const safeHtml = htmlWithAuthBoot.includes("sanegLoginGateRootScript")
      ? htmlWithAuthBoot
      : htmlWithAuthBoot.replace("</body>", `${loginGateScript}\n</body>`);
    res.type("html").send(safeHtml);
  } catch (error) {
    next(error);
  }
});

// Public asset URL mapping:
// public/assets/login/slides/slide-1.webp -> /assets/login/slides/slide-1.webp
// express.static requires filesystem path strings, not URL objects.
app.use("/assets", express.static(publicAssetsDir, staticNoCacheOptions));
app.use(express.static(publicDir, staticNoCacheOptions));

app.use("/api/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/workspaces", workspacesRouter);
app.use("/api/chat", chatRouter);
app.use("/api/project", projectRouter);
app.use("/api/base", baseRouter);
app.use("/api/workbook", workbookRouter);
app.use("/api/menu", menuRouter);
app.use("/api/acts", actsRouter);
app.use("/api/ulchov", ulchovRouter);
app.use("/api", signaturesRouter);
app.use("/api/kuduk", createKudukRouter(io));

initKudukRealtime(io);

async function startServer() {
  if (isDatabaseConfigured() && String(process.env.DB_AUTO_MIGRATE ?? "true") !== "false") {
    const report = await runMigrations();
    if (report.applied.length) {
      console.log(`[database] migrations applied: ${report.applied.join(", ")}`);
    } else {
      console.log("[database] migrations up to date");
    }
  }

  server.listen(PORT, () => {
    const aiReady = Boolean(process.env.OPENAI_API_KEY);
    console.log(`Sanegplatform integrated: http://localhost:${PORT}`);
    console.log(aiReady ? "AI rejim: ulangan" : "AI rejim: demo");
  });
}

startServer().catch((error) => {
  console.error("[startup]", error.message);
  process.exit(1);
});
