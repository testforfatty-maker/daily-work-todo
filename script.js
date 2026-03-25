const STORAGE_KEY = "daily-work-todo-v1";

const priorityMap = {
  high: "高优先级",
  medium: "中优先级",
  low: "低优先级",
};

const form = document.querySelector("#todoForm");
const taskInput = document.querySelector("#taskInput");
const priorityInput = document.querySelector("#priorityInput");
const categoryInput = document.querySelector("#categoryInput");
const noteInput = document.querySelector("#noteInput");
const todoList = document.querySelector("#todoList");
const emptyState = document.querySelector("#emptyState");
const emptyStateTitle = document.querySelector("#emptyStateTitle");
const emptyStateText = document.querySelector("#emptyStateText");
const template = document.querySelector("#todoItemTemplate");
const filters = [...document.querySelectorAll(".filter")];
const todayLabel = document.querySelector("#todayLabel");
const weekdayLabel = document.querySelector("#weekdayLabel");
const totalCount = document.querySelector("#totalCount");
const doneCount = document.querySelector("#doneCount");
const highCount = document.querySelector("#highCount");
const progressText = document.querySelector("#progressText");
const progressFill = document.querySelector("#progressFill");
const clearDoneButton = document.querySelector("#clearDoneButton");
const exportMarkdownButton = document.querySelector("#exportMarkdownButton");
const resetButton = document.querySelector("#resetButton");
const ownerInput = document.querySelector("#ownerInput");
const fileInput = document.querySelector("#fileInput");
const importButton = document.querySelector("#importButton");
const importStatus = document.querySelector("#importStatus");

let state = loadState();
let activeFilter = "all";

setTodayHeader();
render();

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const title = taskInput.value.trim();
  const category = categoryInput.value.trim();
  const note = noteInput.value.trim();

  if (!title) {
    taskInput.focus();
    return;
  }

  state.todos.unshift({
    id: createId(),
    title,
    priority: priorityInput.value,
    category,
    note: "",
    detail: note,
    expanded: false,
    done: false,
    createdAt: new Date().toISOString(),
  });

  saveState();
  form.reset();
  priorityInput.value = "medium";
  taskInput.focus();
  render();
});

filters.forEach((button) => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    filters.forEach((item) => item.classList.toggle("is-active", item === button));
    render();
  });
});

clearDoneButton.addEventListener("click", () => {
  const completedTodos = state.todos.filter((todo) => todo.done);

  if (completedTodos.length === 0) {
    return;
  }

  const archivedTodos = completedTodos.map((todo) => ({
    ...todo,
    archivedAt: new Date().toISOString(),
  }));

  state.archive = [...archivedTodos, ...state.archive];
  state.todos = state.todos.filter((todo) => !todo.done);
  saveState();
  render();
});

exportMarkdownButton.addEventListener("click", () => {
  const markdown = buildArchiveMarkdown(state.archive);
  downloadMarkdown(markdown, `completed-tasks-${currentDayKey()}.md`);
});

resetButton.addEventListener("click", () => {
  const confirmed = window.confirm("确定要清空当前全部任务吗？");

  if (!confirmed) {
    return;
  }

  state = createInitialState(state.archive);
  saveState();
  render();
});

importButton.addEventListener("click", async () => {
  const file = fileInput.files?.[0];
  const owner = ownerInput.value.trim() || "Bill Wang";

  if (!file) {
    setImportStatus("请先选择一个会议纪要文件。", "error");
    return;
  }

  setImportStatus(`正在分析 ${file.name} ...`, "");
  importButton.disabled = true;

  try {
    const source = await extractTextFromFile(file);
    const tasks = extractTasksForOwner(source, owner);

    if (tasks.length === 0) {
      setImportStatus(`没有在 ${file.name} 里识别到 ${owner} 的待办段落。你可以换个名字写法再试一次。`, "error");
      return;
    }

    const addedCount = addImportedTodos(tasks, file.name, owner);
    const skippedCount = tasks.length - addedCount;

    if (addedCount === 0) {
      setImportStatus(`识别到 ${tasks.length} 条，但都和现有待办重复，所以没有新增。`, "error");
      return;
    }

    const summary = skippedCount > 0
      ? `已从 ${file.name} 导入 ${addedCount} 条待办，跳过 ${skippedCount} 条重复项。`
      : `已从 ${file.name} 导入 ${addedCount} 条待办。`;

    setImportStatus(summary, "success");
    render();
  } catch (error) {
    setImportStatus(error.message || "文件解析失败，请换一个文件再试。", "error");
  } finally {
    importButton.disabled = false;
  }
});

function createInitialState(existingArchive = []) {
  return {
    day: currentDayKey(),
    todos: [],
    archive: existingArchive,
  };
}

function currentDayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return createInitialState();
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      day: currentDayKey(),
      todos: migrateTodos(Array.isArray(parsed.todos) ? parsed.todos : []),
      archive: migrateTodos(Array.isArray(parsed.archive) ? parsed.archive : []),
    };
  } catch {
    return createInitialState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function render() {
  const visibleTodos = state.todos.filter((todo) => {
    if (activeFilter === "todo") return !todo.done;
    if (activeFilter === "done") return todo.done;
    return true;
  });

  todoList.innerHTML = "";

  visibleTodos.forEach((todo) => {
    const fragment = template.content.cloneNode(true);
    const item = fragment.querySelector(".todo-item");
    const checkbox = fragment.querySelector(".todo-item__checkbox");
    const titleInput = fragment.querySelector(".todo-item__title-input");
    const prioritySelect = fragment.querySelector(".todo-item__priority");
    const meta = fragment.querySelector(".todo-item__meta");
    const note = fragment.querySelector(".todo-item__note");
    const details = fragment.querySelector(".todo-item__details");
    const toggleButton = fragment.querySelector(".todo-item__toggle");
    const detailInput = fragment.querySelector(".todo-item__detail-input");
    const deleteButton = fragment.querySelector(".todo-item__delete");

    item.classList.toggle("is-done", todo.done);
    checkbox.checked = todo.done;
    titleInput.value = todo.title;
    syncTitleHeight(titleInput);
    prioritySelect.value = todo.priority;
    prioritySelect.dataset.priority = todo.priority;

    const createdTime = new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(todo.createdAt));

    meta.textContent = [todo.category || "未分类", `创建于 ${createdTime}`].join(" · ");
    note.hidden = !todo.note;
    note.textContent = todo.note || "";

    if (todo.detail) {
      details.hidden = false;
      detailInput.hidden = !todo.expanded;
      detailInput.value = todo.detail;
      toggleButton.textContent = todo.expanded ? "隐藏详情" : "展开详情";
      toggleButton.addEventListener("click", () => {
        toggleDetails(todo.id);
      });
    } else {
      details.hidden = false;
      detailInput.hidden = !todo.expanded;
      detailInput.value = "";
      toggleButton.textContent = todo.expanded ? "隐藏详情" : "展开详情";
      toggleButton.addEventListener("click", () => {
        toggleDetails(todo.id);
      });
    }

    checkbox.addEventListener("change", () => {
      toggleTodo(todo.id);
    });

    titleInput.addEventListener("change", () => {
      updateTodoContent(todo.id, {
        title: titleInput.value.trim() || todo.title,
      });
      syncTitleHeight(titleInput);
    });

    titleInput.addEventListener("blur", () => {
      titleInput.value = titleInput.value.trim() || todo.title;
      updateTodoContent(todo.id, {
        title: titleInput.value,
      });
      syncTitleHeight(titleInput);
    });

    titleInput.addEventListener("input", () => {
      syncTitleHeight(titleInput);
    });

    prioritySelect.addEventListener("change", () => {
      updatePriority(todo.id, prioritySelect.value);
    });

    detailInput.addEventListener("change", () => {
      updateTodoContent(todo.id, {
        detail: detailInput.value.trim(),
      });
    });

    detailInput.addEventListener("blur", () => {
      updateTodoContent(todo.id, {
        detail: detailInput.value.trim(),
      });
    });

    deleteButton.addEventListener("click", () => {
      deleteTodo(todo.id);
    });

    todoList.append(fragment);
  });

  const total = state.todos.length;
  const completed = state.todos.filter((todo) => todo.done).length;
  const high = state.todos.filter((todo) => todo.priority === "high").length;
  const progress = total === 0 ? 0 : Math.round((completed / total) * 100);

  totalCount.textContent = String(total);
  doneCount.textContent = String(completed);
  highCount.textContent = String(high);
  progressText.textContent = `${progress}%`;
  progressFill.style.width = `${progress}%`;
  emptyState.hidden = visibleTodos.length > 0;

  if (activeFilter === "done") {
    emptyStateTitle.textContent = "还没有已完成任务";
    emptyStateText.textContent = "做完一项就勾选它，这里会显示你的完成项。";
  } else if (activeFilter === "todo" && total > 0) {
    emptyStateTitle.textContent = "当前没有未完成任务";
    emptyStateText.textContent = "今天的任务已经清完了，可以安心收工或者补充新任务。";
  } else {
    emptyStateTitle.textContent = "今天还没有任务";
    emptyStateText.textContent = "先添加 1 到 3 个最重要的工作项，开始推进。";
  }
}

async function extractTextFromFile(file) {
  const extension = file.name.split(".").pop()?.toLowerCase() || "";

  if (extension === "txt" || extension === "md") {
    const text = await file.text();
    return createSourcePayload(text, extension);
  }

  if (extension === "docx") {
    return extractTextFromDocx(file);
  }

  if (extension === "pdf") {
    const text = await extractTextFromPdf(file);
    return createSourcePayload(text, extension);
  }

  throw new Error("暂时只支持 DOCX、PDF、TXT、Markdown 文件。");
}

async function extractTextFromPdf(file) {
  const pdfjsLib = await getPdfJs();
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  let text = "";

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    text += `${pageText}\n`;
  }

  return text;
}

async function getPdfJs() {
  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs";
    return window.pdfjsLib;
  }

  if (!window.__pdfjsPromise) {
    window.__pdfjsPromise = import("https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs")
      .then((module) => {
        module.GlobalWorkerOptions.workerSrc =
          "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs";
        window.pdfjsLib = module;
        return module;
      })
      .catch(() => {
        throw new Error("PDF 解析库加载失败。请确认当前网络可访问 jsDelivr，或先导出 TXT 后再导入。");
      });
  }

  return window.__pdfjsPromise;
}

async function getJsZip() {
  if (!window.__jszipPromise) {
    window.__jszipPromise = import("https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm")
      .then((module) => module.default || module)
      .catch(() => {
        throw new Error("Word 解析库加载失败。请确认当前网络可访问 jsDelivr，或先导出 TXT 后再导入。");
      });
  }

  return window.__jszipPromise;
}

async function extractTextFromDocx(file) {
  const JSZip = await getJsZip();
  const buffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);
  const xmlFile = zip.file("word/document.xml");

  if (!xmlFile) {
    throw new Error("这个 Word 文件没有找到正文内容。");
  }

  const xmlText = await xmlFile.async("text");
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlText, "application/xml");
  const paragraphs = [...xml.getElementsByTagName("w:p")]
    .map((paragraph) =>
      [...paragraph.getElementsByTagName("w:t")]
        .map((node) => node.textContent || "")
        .join("")
        .trim()
    )
    .filter(Boolean);

  return {
    type: "docx",
    text: paragraphs.join("\n"),
    paragraphs,
  };
}

function createSourcePayload(text, type) {
  const normalized = normalizeText(text);
  return {
    type,
    text: normalized,
    paragraphs: normalized.split("\n").map((line) => line.trim()).filter(Boolean),
  };
}

function extractTasksForOwner(source, owner) {
  if (source.type === "docx") {
    return extractTasksFromDocxParagraphs(source.paragraphs, owner);
  }

  const lines = source.paragraphs;

  const ownerTokens = buildOwnerTokens(owner);
  const collected = [];

  lines.forEach((line, index) => {
    if (!lineMentionsOwner(line, ownerTokens)) {
      return;
    }

    const inlineTasks = extractInlineTasks(line, ownerTokens);
    inlineTasks.forEach((task) => collected.push(task));

    for (let offset = 1; offset <= 4; offset += 1) {
      const nextLine = lines[index + offset];
      if (!nextLine) {
        break;
      }

      if (lineMentionsOwner(nextLine, ownerTokens) && offset > 1) {
        break;
      }

      if (looksLikeTaskLine(nextLine)) {
        const cleaned = cleanupTaskText(nextLine);
        if (cleaned) {
          collected.push(cleaned);
        }
      }
    }
  });

  if (collected.length === 0) {
    lines.forEach((line) => {
      if (looksLikeTaskLine(line) && lineMentionsOwner(line, ownerTokens)) {
        const cleaned = cleanupTaskText(removeOwnerMentions(line, ownerTokens));
        if (cleaned) {
          collected.push(cleaned);
        }
      }
    });
  }

  return dedupeImportedTasks(
    collected
      .map(cleanupTaskText)
      .filter(Boolean)
      .map((task) => createImportedTask(task))
  );
}

function extractTasksFromDocxParagraphs(paragraphs, owner) {
  const ownerTokens = buildOwnerTokens(owner);
  const collected = [];
  let insideTodoSection = false;
  let ownerSectionActive = false;

  paragraphs.forEach((paragraph) => {
    const line = normalizeText(paragraph).trim();
    if (!line) {
      return;
    }

    if (isTodoHeading(line)) {
      insideTodoSection = true;
      ownerSectionActive = false;
      return;
    }

    if (insideTodoSection && isStrongHeading(line) && !isTodoHeading(line)) {
      insideTodoSection = false;
      ownerSectionActive = false;
    }

    if (!insideTodoSection) {
      return;
    }

    if (lineMentionsOwner(line, ownerTokens)) {
      ownerSectionActive = true;
      extractInlineTasks(line, ownerTokens)
        .map((task) => createImportedTask(task))
        .forEach((task) => collected.push(task));
      return;
    }

    if (ownerSectionActive && looksLikeTaskLine(line)) {
      collected.push(createImportedTask(cleanupTaskText(line)));
      return;
    }

    if (ownerSectionActive && isStrongHeading(line)) {
      ownerSectionActive = false;
    }
  });

  if (collected.length === 0) {
    paragraphs.forEach((paragraph) => {
      const line = normalizeText(paragraph).trim();
      if (lineMentionsOwner(line, ownerTokens)) {
        extractInlineTasks(line, ownerTokens)
          .map((task) => createImportedTask(task))
          .forEach((task) => collected.push(task));
      }
    });
  }

  return dedupeImportedTasks(collected);
}

function normalizeText(text) {
  return text
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n");
}

function buildOwnerTokens(owner) {
  const base = owner.trim();
  const parts = base.split(/\s+/).filter(Boolean);
  const tokens = new Set([base, ...parts]);

  if (/bill/i.test(base)) {
    tokens.add("Bill");
  }

  if (/wang/i.test(base)) {
    tokens.add("Wang");
  }

  return [...tokens].filter(Boolean);
}

function lineMentionsOwner(line, ownerTokens) {
  const lower = line.toLowerCase();
  return ownerTokens.some((token) => lower.includes(token.toLowerCase()));
}

function extractInlineTasks(line, ownerTokens) {
  const withoutOwner = removeOwnerMentions(line, ownerTokens);
  const separators = ["待办", "TODO", "todo", "Action Item", "action item", "负责人", "owner"];
  let target = withoutOwner;

  separators.forEach((separator) => {
    const index = target.indexOf(separator);
    if (index >= 0) {
      target = target.slice(index + separator.length);
    }
  });

  return target
    .split(/[;；]/)
    .map(cleanupTaskText)
    .filter((item) => item && item.length >= 4);
}

function removeOwnerMentions(line, ownerTokens) {
  let result = line;

  ownerTokens.forEach((token) => {
    const escaped = escapeRegExp(token);
    result = result.replace(new RegExp(escaped, "ig"), " ");
  });

  return result;
}

function looksLikeTaskLine(line) {
  return /^([-*•·]|[0-9]+[.)、]|待办|TODO|todo|行动项|跟进|落实|推进)/.test(line);
}

function isTodoHeading(line) {
  return /(待办|待跟进|行动项|Action Items|TODO)/i.test(line) && line.length <= 24;
}

function isStrongHeading(line) {
  return /^[一二三四五六七八九十0-9]+[、.)）]/.test(line) || /^#{1,3}\s*/.test(line);
}

function cleanupTaskText(text) {
  return text
    .replace(/^[\s\-*•·]+/, "")
    .replace(/^[0-9]+[.)、]\s*/, "")
    .replace(/^(待办|TODO|todo|行动项|负责人|owner|Bill Wang|Bill|Wang)[:：\s-]*/gi, "")
    .replace(/[（(]Bill Wang[)）]/gi, "")
    .replace(/[（(]Bill[)）]/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function condenseTaskText(text) {
  return text
    .replace(/^(需要|负责|协助|跟进|推进|落实|完成|安排|确认|同步)/, "")
    .replace(/^(请|需|将|继续)/, "")
    .replace(/(Bill Wang|Bill|Wang)\s*(负责|跟进|推进|落实)?/gi, "")
    .replace(/[：:]\s*/g, " ")
    .replace(/\s+/g, " ")
    .replace(/(同时|并且)/g, "、")
    .replace(/，/g, "、")
    .replace(/。/g, "")
    .replace(/；/g, "、")
    .replace(/、+/g, "、")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function addImportedTodos(tasks, fileName, owner) {
  const existingTitles = new Set(state.todos.map((todo) => normalizeTodoTitle(todo.title)));
  let addedCount = 0;

  tasks.forEach((task) => {
    const normalizedTitle = normalizeTodoTitle(task.title);
    if (!normalizedTitle || existingTitles.has(normalizedTitle)) {
      return;
    }

    state.todos.unshift({
      id: createId(),
      title: task.title,
      priority: inferPriority(task.title),
      category: "会议纪要",
      note: shortenSourceLabel(fileName),
      detail: task.detail,
      expanded: false,
      done: false,
      createdAt: new Date().toISOString(),
    });

    existingTitles.add(normalizedTitle);
    addedCount += 1;
  });

  saveState();
  return addedCount;
}

function normalizeTodoTitle(title) {
  return title.replace(/\s+/g, "").toLowerCase();
}

function inferPriority(task) {
  if (/(紧急|尽快|立即|今天|本周|马上)/.test(task)) {
    return "high";
  }

  if (/(跟进|确认|同步|整理)/.test(task)) {
    return "medium";
  }

  return "low";
}

function setImportStatus(message, tone) {
  importStatus.textContent = message;
  importStatus.classList.remove("is-success", "is-error");

  if (tone === "success") {
    importStatus.classList.add("is-success");
  }

  if (tone === "error") {
    importStatus.classList.add("is-error");
  }
}

function toggleDetails(id) {
  state.todos = state.todos.map((todo) =>
    todo.id === id ? { ...todo, expanded: !todo.expanded } : todo
  );
  saveState();
  render();
}

function toggleTodo(id) {
  state.todos = state.todos.map((todo) =>
    todo.id === id ? { ...todo, done: !todo.done } : todo
  );
  saveState();
  render();
}

function updatePriority(id, priority) {
  state.todos = state.todos.map((todo) =>
    todo.id === id ? { ...todo, priority } : todo
  );
  saveState();
  render();
}

function updateTodoContent(id, changes) {
  state.todos = state.todos.map((todo) =>
    todo.id === id ? { ...todo, ...changes } : todo
  );
  saveState();
}

function syncTitleHeight(element) {
  element.style.height = "0px";
  element.style.height = `${element.scrollHeight}px`;
}

function deleteTodo(id) {
  state.todos = state.todos.filter((todo) => todo.id !== id);
  saveState();
  render();
}

function setTodayHeader() {
  const now = new Date();
  todayLabel.textContent = new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
  }).format(now);
  weekdayLabel.textContent = new Intl.DateTimeFormat("zh-CN", {
    weekday: "long",
  }).format(now);
}

function createId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createImportedTask(rawTask) {
  const detail = cleanupTaskText(rawTask);
  const title = buildTaskTitle(detail);

  return {
    title,
    detail,
  };
}

function buildTaskTitle(detail) {
  return detail
    .replace(/：/g, " ")
    .replace(/，/g, "、")
    .replace(/。/g, "")
    .split("、")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join("、");
}

function dedupeImportedTasks(tasks) {
  const seen = new Set();
  return tasks.filter((task) => {
    if (!task?.title) {
      return false;
    }

    const key = normalizeTodoTitle(task.title);
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function shortenSourceLabel(fileName) {
  const baseName = fileName.replace(/\.[^.]+$/, "");
  if (baseName.includes("运营周会")) {
    return "来自运营周会";
  }

  return `来自 ${baseName.slice(0, 12)}`;
}

function migrateTodos(items) {
  return items.map((item) => {
    const note = typeof item.note === "string" ? item.note.trim() : "";
    const detail = typeof item.detail === "string" ? item.detail.trim() : "";
    const isSourceNote = note.startsWith("来自");

    if (note && !detail && !isSourceNote) {
      return {
        ...item,
        note: "",
        detail: note,
      };
    }

    return {
      ...item,
      note,
      detail,
    };
  });
}

function buildArchiveMarkdown(items) {
  if (items.length === 0) {
    return "# Completed Tasks Archive\n\n暂无归档记录。\n";
  }

  const groups = new Map();

  items.forEach((item) => {
    const stamp = formatWeekStamp(item.archivedAt || item.createdAt || new Date().toISOString());
    if (!groups.has(stamp)) {
      groups.set(stamp, []);
    }
    groups.get(stamp).push(item);
  });

  let output = "# Completed Tasks Archive\n\n";

  groups.forEach((groupItems, stamp) => {
    output += `## ${stamp}\n\n`;
    groupItems.forEach((item) => {
      const parts = [`- ${item.title}`];
      if (item.priority) {
        parts.push(`优先级: ${priorityMap[item.priority]}`);
      }
      if (item.category) {
        parts.push(`分类: ${item.category}`);
      }
      if (item.archivedAt) {
        parts.push(`完成时间: ${formatArchiveDateTime(item.archivedAt)}`);
      }
      output += `${parts.join(" | ")}\n`;
      if (item.detail) {
        output += `  详情: ${item.detail}\n`;
      }
    });
    output += "\n";
  });

  return output;
}

function downloadMarkdown(content, fileName) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatWeekStamp(value) {
  const date = new Date(value);
  const month = new Intl.DateTimeFormat("en-US", { month: "long" }).format(date);
  return `${month} W${Math.ceil(date.getDate() / 7)}`;
}

function formatArchiveDateTime(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
