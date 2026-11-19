import { requireAdmin } from "../shared/session.js?v=roles";
import { initNav } from "../shared/nav.js?v=account";
import { loadPage } from "../shared/data.js?v=hidden-score";
import { el, renderList } from "../shared/dom.js";

async function run() {
  const data = await loadPage("page-hidden-rules");
  const rules = Array.isArray(data.rules) ? data.rules : [];
  const list = document.querySelector("#rule-list");
  const empty = document.querySelector("#rule-empty");
  empty.hidden = rules.length > 0;
  list.hidden = rules.length === 0;
  renderList(list, rules, (rule) => {
    const item = el("li");
    item.append(el("p", "version-name", rule.title), el("p", "version-message", rule.text));
    return item;
  });
}

if (requireAdmin()) {
  initNav("hidden-rules");
  run().catch((err) => {
    const le = document.querySelector("#load-error");
    if (le) { le.hidden = false; le.textContent = err.message || "Could not open hidden rules."; }
  });
}
