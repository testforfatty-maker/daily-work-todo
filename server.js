const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const ARCHIVE_DIR = path.join(ROOT, "archive");
const ARCHIVE_FILE = path.join(ARCHIVE_DIR, "completed-tasks.md");
const PORT = 3000;

ensureArchiveFile();

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "POST" && req.url === "/api/archive-completed") {
      const body = await readJsonBody(req);
      const tasks = Array.isArray(body?.tasks) ? body.tasks : [];

      if (tasks.length === 0) {
        return sendJson(res, 400, { error: "No tasks to archive." });
      }

      appendArchiveEntries(tasks);
      return sendJson(res, 200, {
        ok: true,
        filePath: ARCHIVE_FILE,
      });
    }

    serveStatic(req, res);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Server error." });
  }
});

server.listen(PORT, () => {
  console.log(`Daily Work Todo is running at http://localhost:${PORT}`);
});

function ensureArchiveFile() {
  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });

  if (!fs.existsSync(ARCHIVE_FILE)) {
    fs.writeFileSync(
      ARCHIVE_FILE,
      "# Completed Tasks Archive\n\n",
      "utf8"
    );
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";

    req.on("data", (chunk) => {
      data += chunk;
    });

    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (error) {
        reject(new Error("Invalid JSON body."));
      }
    });

    req.on("error", reject);
  });
}

function appendArchiveEntries(tasks) {
  const sections = new Map();

  tasks.forEach((task) => {
    const archivedAt = task.archivedAt || new Date().toISOString();
    const stamp = formatWeekStamp(archivedAt);
    const line = renderTaskLine(task, archivedAt);

    if (!sections.has(stamp)) {
      sections.set(stamp, []);
    }

    sections.get(stamp).push(line);
  });

  let output = "";

  sections.forEach((lines, stamp) => {
    output += `## ${stamp}\n\n`;
    output += `${lines.join("\n")}\n\n`;
  });

  fs.appendFileSync(ARCHIVE_FILE, output, "utf8");
}

function renderTaskLine(task, archivedAt) {
  const parts = [`- ${task.title}`];

  if (task.priority) {
    parts.push(`优先级: ${task.priority}`);
  }

  if (task.category) {
    parts.push(`分类: ${task.category}`);
  }

  parts.push(`完成时间: ${formatDateTime(archivedAt)}`);

  let line = parts.join(" | ");

  if (task.detail) {
    line += `\n  详情: ${task.detail}`;
  }

  return line;
}

function formatWeekStamp(value) {
  const date = new Date(value);
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const month = months[date.getMonth()];
  const week = Math.ceil(date.getDate() / 7);
  return `${month} W${week}`;
}

function formatDateTime(value) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function serveStatic(req, res) {
  const urlPath = req.url === "/" ? "/index.html" : req.url;
  const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(ROOT, safePath);

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    res.writeHead(200, { "Content-Type": getContentType(filePath) });
    res.end(content);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".json": "application/json; charset=utf-8",
  };

  return map[ext] || "application/octet-stream";
}
