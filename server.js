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
import toRouter from "./routes/to.js";
import toPeriodSheetBridgeRouter from "./routes/toPeriodSheetBridge.js";
import hisobotPeriodRouter from "./routes/hisobotPeriod.js";
import ulchovRouter from "./routes/ulchov.js";
import signaturesRouter from "./routes/signatures.js";
import authRouter from "./routes/auth.js";
import usersRouter from "./routes/users.js";
import workspacesRouter from "./routes/workspaces.js";
import backupRouter from "./routes/backup.js";
import webhookRouter from "./routes/webhook.js";
import { createKudukRouter, initKudukRealtime } from "./routes/kuduk.js";
import { isDatabaseConfigured } from "./db/pool.js";
import { runMigrations } from "./db/migrate.js";
import { startFinalPdfExportWorker } from "./services/finalPdfExportWorker.js";
import { initBackupWorker } from "./services/backupService.js";

dotenv.config();

function disableKudukBackgroundWorkerTimer() {
  const originalSetInterval = global.setInterval;
  if (originalSetInterval.__kudukBackgroundGuard) return;

  const guardedSetInterval = (handler, timeout, ...args) => {
    const handlerSource = typeof handler === "function" ? Function.prototype.toString.call(handler) : String(handler || "");
    if (handlerSource.includes('\"background-worker\"') || handlerSource.includes("'background-worker'")) {
      console.log("[KUDUK] Background-worker o‘chirildi. Sync faqat server start/config yoki manual sync orqali bajariladi.");
      return null;
    }
    return originalSetInterval(handler, timeout, ...args);
  };

  guardedSetInterval.__kudukBackgroundGuard = true;
  global.setInterval = guardedSetInterval;
}

disableKudukBackgroundWorkerTimer();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
const PORT = process.env.PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const publicDir = join(__dirname, "public");
const publicAssetsDir = join(publicDir, "assets");
const indexHtmlPath = join(publicDir, "index.html");
const toHtmlPath = join(publicDir, "modules", "to.html");
const kudukJournalHtmlPath = join(publicDir, "modules", "kuduk-journal.html");
const faviconPngPath = join(publicAssetsDir, "images", "saneg-favicon.png");

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
  if (req.path === "/" || req.path.endsWith(".html") || req.path.endsWith(".js") || req.path.endsWith(".css") || req.path.includes("favicon")) {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
  }
  next();
});

app.get("/favicon.ico", (_req, res) => {
  res.type("image/png");
  res.sendFile(faviconPngPath);
});

app.get("/", (_req, res, next) => {
  try {
    const html = readFileSync(indexHtmlPath, "utf8");
    const faviconLinks = [
      '<link id="sanegFavicon" rel="icon" type="image/png" href="/assets/images/saneg-favicon.png?v=saneg3">',
      '<link rel="shortcut icon" href="/favicon.ico?v=saneg3">',
    ].join("\n");
    const settingsScript = '<script id="segSettingsPersistenceScript" src="/js/settings-persistence.js?v=settings2" defer></script>';
    const loginGateScript = '<script id="sanegLoginGateRootScript" src="/js/saneg-login-gate.js?v=root1e" defer></script>';
    const htmlWithAuthBoot = html.includes("sanegAuthBootScript")
      ? html
      : html.replace("</head>", `${authBootGuard}\n</head>`);
    const htmlWithFavicon = htmlWithAuthBoot.includes("sanegFavicon")
      ? htmlWithAuthBoot
      : htmlWithAuthBoot.replace("</head>", `${faviconLinks}\n</head>`);
    const htmlWithSettings = htmlWithFavicon.includes("segSettingsPersistenceScript")
      ? htmlWithFavicon
      : htmlWithFavicon.replace("</body>", `${settingsScript}\n</body>`);
    const safeHtml = htmlWithSettings.includes("sanegLoginGateRootScript")
      ? htmlWithSettings
      : htmlWithSettings.replace("</body>", `${loginGateScript}\n</body>`);
    res.type("html").send(safeHtml);
  } catch (error) {
    next(error);
  }
});

app.get("/modules/to.html", (_req, res, next) => {
  try {
    const html = readFileSync(toHtmlPath, "utf8");
    const bridgeScript = '<script id="toPeriodSheetBridgeScript" src="/js/to-period-sheet-bridge.js?v=to-period-bridge2-full-signing"></script>';
    const safeHtml = html.includes("toPeriodSheetBridgeScript")
      ? html
      : html.replace("</body>", `${bridgeScript}\n</body>`);
    res.type("html").send(safeHtml);
  } catch (error) {
    next(error);
  }
});

app.get("/modules/kuduk-journal.html", (_req, res, next) => {
  try {
    const html = readFileSync(kudukJournalHtmlPath, "utf8");
    const bridgeScript = '<script id="hisobotPeriodBridgeScript" src="/js/hisobot-period-bridge.js?v=hisobot-period4-sync-cache"></script>';
    const htmlWithoutLegacySelector = html.replace(/<select id="routeSelect"[^>]*><\/select>/, "");
    const safeHtml = htmlWithoutLegacySelector.includes("hisobotPeriodBridgeScript")
      ? htmlWithoutLegacySelector
      : htmlWithoutLegacySelector.replace("</body>", `${bridgeScript}\n</body>`);
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
app.use("/api/users", usersRouter);
app.use("/api/workspaces", workspacesRouter);
app.use("/api/chat", chatRouter);
app.use("/api/project", projectRouter);
app.use("/api/base", baseRouter);
app.use("/api/workbook", workbookRouter);
app.use("/api/menu", menuRouter);
app.use("/api/acts", actsRouter);
app.use("/api/to-period-bridge", toPeriodSheetBridgeRouter);
app.use("/api/hisobot-period", hisobotPeriodRouter);
app.use("/api/to", toRouter);
app.use("/api/ulchov", ulchovRouter);
app.use("/api/kuduk", createKudukRouter(io));
app.use("/api/backup", backupRouter);
app.use("/api/webhook", webhookRouter);
app.use("/api", signaturesRouter);

app.use("/api", (_req, res) => {
  res.status(404).json({
    error: "API route not found",
    code: "API_ROUTE_NOT_FOUND",
  });
});

app.use((error, req, res, next) => {
  if (!req.path.startsWith("/api")) {
    return next(error);
  }

  console.error("[api-error]", {
    path: req.path,
    method: req.method,
    message: error?.message,
    code: error?.code,
    detail: error?.detail,
    constraint: error?.constraint,
    stack: error?.stack,
  });

  if (res.headersSent) return next(error);

  const statusCode = Number(error?.statusCode) || 500;
  return res.status(statusCode).json({
    error: error?.message || "Internal Server Error",
    code: error?.code || "INTERNAL_ERROR",
  });
});

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

  startFinalPdfExportWorker();
  initBackupWorker();

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
