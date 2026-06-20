import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../");

const SAFE_TEXT_EXTENSIONS = new Set([
  ".js", ".json", ".html", ".css", ".md", ".txt", ".mjs", ".cjs", ".yml", ".yaml"
]);

const BLOCKED_DIRS = new Set([
  "node_modules", ".git", ".railway", ".vscode", "dist", "build", "coverage", ".cache"
]);

const BLOCKED_FILES = new Set([
  ".env", "service-account.json", "credentials.json", "client_secret.json"
]);

const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{12,}/g,
  /"private_key"\s*:\s*"[^"]+"/gi,
  /OPENAI_API_KEY\s*=\s*[^\n\r]+/gi,
  /GOOGLE_SERVICE_ACCOUNT_JSON\s*=\s*[^\n\r]+/gi,
  /AIza[0-9A-Za-z_-]{20,}/g
];

function isBlocked(relativePath) {
  const normalized = relativePath.split(path.sep).join("/");
  const parts = normalized.split("/");
  if (parts.some((part) => BLOCKED_DIRS.has(part))) return true;
  const base = parts[parts.length - 1];
  if (BLOCKED_FILES.has(base)) return true;
  if (base.endsWith(".zip") || base.endsWith(".rar") || base.endsWith(".7z")) return true;
  return false;
}

function redactSecrets(text) {
  let output = String(text || "");
  for (const pattern of SECRET_PATTERNS) {
    output = output.replace(pattern, "[REDACTED_SECRET]");
  }
  return output;
}

async function walk(dir, files = []) {
  let entries = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (_) {
    return files;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(repoRoot, fullPath);
    if (isBlocked(relativePath)) continue;

    if (entry.isDirectory()) {
      await walk(fullPath, files);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (SAFE_TEXT_EXTENSIONS.has(ext)) files.push(fullPath);
    }
  }
  return files;
}

function classifyFile(relativePath) {
  const normalized = relativePath.split(path.sep).join("/");
  if (normalized === "server.js") return "server-entry";
  if (normalized === "package.json") return "node-package";
  if (normalized.startsWith("routes/")) return "backend-route";
  if (normalized.startsWith("services/")) return "backend-service";
  if (normalized.startsWith("config/")) return "backend-config";
  if (normalized.startsWith("public/js/")) return "frontend-script";
  if (normalized.startsWith("public/modules/")) return "frontend-module";
  if (normalized.startsWith("public/")) return "frontend-public";
  if (normalized.startsWith("docs/")) return "documentation";
  if (normalized.startsWith("data/")) return "data-file";
  return "project-file";
}

export async function listSafeProjectFiles() {
  const filePaths = await walk(repoRoot);
  const result = [];
  for (const filePath of filePaths) {
    try {
      const stat = await fs.stat(filePath);
      const relativePath = path.relative(repoRoot, filePath).split(path.sep).join("/");
      result.push({
        path: relativePath,
        type: classifyFile(relativePath),
        bytes: stat.size,
      });
    } catch (_) {}
  }
  return result.sort((a, b) => a.path.localeCompare(b.path));
}

export async function readSafeFile(relativePath, maxChars = 6000) {
  const normalized = String(relativePath || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || isBlocked(normalized)) {
    throw new Error("Bu fayl xavfsizlik sababli o‘qilmaydi.");
  }

  const targetPath = path.resolve(repoRoot, normalized);
  if (!targetPath.startsWith(repoRoot)) {
    throw new Error("Noto‘g‘ri fayl yo‘li.");
  }

  const ext = path.extname(targetPath).toLowerCase();
  if (!SAFE_TEXT_EXTENSIONS.has(ext)) {
    throw new Error("Faqat xavfsiz matn fayllari o‘qiladi.");
  }

  const text = await fs.readFile(targetPath, "utf8");
  return redactSecrets(text).slice(0, maxChars);
}

export async function buildProjectContext(options = {}) {
  const maxFiles = Number(options.maxFiles || 24);
  const maxCharsPerFile = Number(options.maxCharsPerFile || 1800);
  const files = await listSafeProjectFiles();

  const priority = (file) => {
    if (["server.js", "package.json"].includes(file.path)) return 0;
    if (file.path.startsWith("routes/")) return 1;
    if (file.path.startsWith("services/")) return 2;
    if (file.path.startsWith("config/")) return 3;
    if (file.path.startsWith("public/js/")) return 4;
    if (file.path.startsWith("public/modules/")) return 5;
    if (file.path.startsWith("docs/")) return 6;
    return 9;
  };

  const selected = [...files]
    .sort((a, b) => priority(a) - priority(b) || a.path.localeCompare(b.path))
    .slice(0, maxFiles);

  const snippets = [];
  for (const file of selected) {
    try {
      const content = await readSafeFile(file.path, maxCharsPerFile);
      snippets.push({ ...file, content });
    } catch (error) {
      snippets.push({ ...file, error: error.message });
    }
  }

  const summary = [
    `Loyiha root: ${path.basename(repoRoot)}`,
    `Xavfsiz o‘qiladigan fayllar soni: ${files.length}`,
    `Tanlangan kontekst fayllari: ${selected.map((f) => f.path).join(", ")}`,
    `Maxfiy fayllar va papkalar o‘qilmaydi: .env, service-account.json, node_modules, .git.`
  ].join("\n");

  const contextText = summary + "\n\n" + snippets.map((file) => {
    if (file.error) return `### ${file.path} (${file.type})\nERROR: ${file.error}`;
    return `### ${file.path} (${file.type})\n${file.content}`;
  }).join("\n\n");

  return {
    ok: true,
    root: path.basename(repoRoot),
    totalFiles: files.length,
    files,
    snippets,
    summary,
    contextText,
  };
}
