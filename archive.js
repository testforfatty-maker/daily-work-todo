const STORAGE_KEY = "daily-work-todo-v1";

const archiveGroups = document.querySelector("#archiveGroups");
const archiveEmptyState = document.querySelector("#archiveEmptyState");
const archiveExportButton = document.querySelector("#archiveExportButton");

const state = loadState();

renderArchive();

archiveExportButton.addEventListener("click", () => {
  const markdown = buildArchiveMarkdown(state.archive);
  downloadMarkdown(markdown, `completed-tasks-${currentDateKey()}.md`);
});

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      archive: Array.isArray(parsed.archive) ? parsed.archive : [],
    };
  } catch {
    return { archive: [] };
  }
}

function renderArchive() {
  archiveGroups.innerHTML = "";

  if (state.archive.length === 0) {
    archiveEmptyState.hidden = false;
    return;
  }

  archiveEmptyState.hidden = true;

  const groups = groupByWeekStamp(state.archive);

  groups.forEach(({ stamp, items }) => {
    const section = document.createElement("section");
    section.className = "archive-group";

    const title = document.createElement("h3");
    title.className = "archive-group__title";
    title.textContent = stamp;

    const list = document.createElement("ul");
    list.className = "archive-list";

    items.forEach((item) => {
      const li = document.createElement("li");
      li.className = "archive-list__item";

      const top = document.createElement("div");
      top.className = "archive-list__top";

      const titleInput = document.createElement("textarea");
      titleInput.className = "archive-list__title-input";
      titleInput.rows = 1;
      titleInput.maxLength = 120;
      titleInput.value = item.title || "";
      syncTextareaHeight(titleInput);

      const actions = document.createElement("div");
      actions.className = "archive-list__actions";

      const prioritySelect = document.createElement("select");
      prioritySelect.className = "archive-list__priority";
      prioritySelect.innerHTML = `
        <option value="high">高优先级</option>
        <option value="medium">中优先级</option>
        <option value="low">低优先级</option>
      `;
      prioritySelect.value = item.priority || "low";

      const deleteButton = document.createElement("button");
      deleteButton.className = "archive-list__delete";
      deleteButton.type = "button";
      deleteButton.textContent = "删除";

      actions.append(prioritySelect, deleteButton);
      top.append(titleInput, actions);

      const meta = document.createElement("p");
      meta.textContent = [
        item.priority ? `优先级 ${priorityLabel(item.priority)}` : "",
        item.category || "",
        item.archivedAt ? formatDateTime(item.archivedAt) : "",
      ].filter(Boolean).join(" · ");

      const detailInput = document.createElement("textarea");
      detailInput.className = "archive-list__detail-input";
      detailInput.rows = 4;
      detailInput.maxLength = 500;
      detailInput.value = item.detail || "";

      li.append(top, meta, detailInput);

      titleInput.addEventListener("input", () => {
        syncTextareaHeight(titleInput);
      });

      titleInput.addEventListener("blur", () => {
        updateArchiveItem(item.id, {
          title: titleInput.value.trim() || item.title,
        });
      });

      prioritySelect.addEventListener("change", () => {
        updateArchiveItem(item.id, {
          priority: prioritySelect.value,
        });
      });

      detailInput.addEventListener("blur", () => {
        updateArchiveItem(item.id, {
          detail: detailInput.value.trim(),
        });
      });

      deleteButton.addEventListener("click", () => {
        deleteArchiveItem(item.id);
      });

      list.append(li);
    });

    section.append(title, list);
    archiveGroups.append(section);
  });
}

function updateArchiveItem(id, changes) {
  state.archive = state.archive.map((item) =>
    item.id === id ? { ...item, ...changes } : item
  );
  persistState();
  renderArchive();
}

function deleteArchiveItem(id) {
  state.archive = state.archive.filter((item) => item.id !== id);
  persistState();
  renderArchive();
}

function persistState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  const parsed = raw ? JSON.parse(raw) : {};
  parsed.archive = state.archive;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
}

function groupByWeekStamp(items) {
  const grouped = new Map();

  items.forEach((item) => {
    const stamp = formatWeekStamp(item.archivedAt || item.createdAt || new Date().toISOString());
    if (!grouped.has(stamp)) {
      grouped.set(stamp, []);
    }
    grouped.get(stamp).push(item);
  });

  return [...grouped.entries()].map(([stamp, groupedItems]) => ({
    stamp,
    items: groupedItems,
  }));
}

function buildArchiveMarkdown(items) {
  if (items.length === 0) {
    return "# Completed Tasks Archive\n\n暂无归档记录。\n";
  }

  let output = "# Completed Tasks Archive\n\n";
  groupByWeekStamp(items).forEach(({ stamp, items: groupedItems }) => {
    output += `## ${stamp}\n\n`;
    groupedItems.forEach((item) => {
      const parts = [`- ${item.title}`];
      if (item.priority) parts.push(`优先级: ${priorityLabel(item.priority)}`);
      if (item.category) parts.push(`分类: ${item.category}`);
      if (item.archivedAt) parts.push(`完成时间: ${formatDateTime(item.archivedAt)}`);
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

function formatDateTime(value) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function priorityLabel(priority) {
  return priority === "high" ? "高" : priority === "medium" ? "中" : "低";
}

function currentDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function syncTextareaHeight(element) {
  element.style.height = "0px";
  element.style.height = `${element.scrollHeight}px`;
}
