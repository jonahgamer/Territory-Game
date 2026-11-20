import { requireAdmin } from "../shared/session.js?v=roles";
import { initNav } from "../shared/nav.js?v=account";
import { loadPage } from "../shared/data.js?v=hidden-score";
import { api } from "../shared/api.js?v=rule-text";
import { el } from "../shared/dom.js";

const NUMBERED = new Set(["cell-steal", "map-multiplier", "solve-burst"]);

function paint(rules) {
  const list = document.querySelector("#rule-list");
  const empty = document.querySelector("#rule-empty");
  const rows = Array.isArray(rules) ? rules : [];
  empty.hidden = rows.length > 0;
  list.hidden = rows.length === 0;
  list.replaceChildren();
  for (const rule of rows) {
    const item = el("li");
    const title = el("p", "version-name", rule.title);
    const box = document.createElement("textarea");
    box.className = "rule-description";
    box.maxLength = 4000;
    box.rows = 5;
    box.value = rule.text || "";
    box.setAttribute("aria-label", `${rule.title} description`);
    const actions = el("div", "hidden-rule-actions");
    const save = el("button", "account-action", "Save description");
    save.type = "button";
    const restore = el("button", "account-action", "Restore written description");
    restore.type = "button";
    restore.hidden = rule.custom !== true;
    const status = el("p", "field-note", "");
    status.hidden = true;
    save.addEventListener("click", () => store(rule.id, box.value, status, save));
    restore.addEventListener("click", () => store(rule.id, "", status, restore));
    actions.append(save, restore);
    item.append(title, box);
    if (NUMBERED.has(rule.id)) {
      item.append(el("p", "field-note", "Until a description is saved here, each contest fills its own numbers into the sentence contestants read. A saved description is shown as written. The numbers on the contest still control the rule."));
    }
    item.append(actions, status);
    list.append(item);
  }
}

async function store(id, text, status, button) {
  button.disabled = true;
  status.hidden = true;
  try {
    const data = await api.saveRuleDescription(id, text);
    paint(data.rules);
  } catch (err) {
    status.hidden = false;
    status.textContent = err.message || "The description could not be saved.";
    button.disabled = false;
  }
}

async function run() {
  const data = await loadPage("page-hidden-rules");
  paint(data.rules);
}

if (requireAdmin()) {
  initNav("hidden-rules");
  run().catch((err) => {
    const le = document.querySelector("#load-error");
    if (le) { le.hidden = false; le.textContent = err.message || "Could not open hidden rules."; }
  });
}
