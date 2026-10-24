import { getSession, isContestant, logOut, safePfp } from "./session.js?v=roles";

export function initNav(activePage) {
  const session = getSession();
  if (!session?.user) return;

  const contestant = isContestant();
  const home = document.querySelector("#home-button");
  const mobileHome = document.querySelector("#mobile-home");
  const homeHref = contestant ? "/index.html" : "/admin/maps.html";
  if (home) home.href = homeHref;
  if (mobileHome) mobileHome.href = homeHref;

  const items = contestant ? [
    { href: "/index.html", label: "Contests", key: "contests" },
    { href: "/admin/credits.html", label: "Credits", key: "credits" },
    { href: "/settings.html", label: "Settings", key: "settings" },
  ] : [
    { href: "/admin/maps.html", label: "Maps", key: "maps" },
    { href: "/admin/problems.html", label: "Problems", key: "problems" },
    { href: "/admin/contests.html", label: "Contests", key: "contests" },
    { href: "/admin/tutorial.html", label: "Tutorial", key: "tutorial" },
    { href: "/admin/credits.html", label: "Credits", key: "credits" },
    { href: "/admin/accounts.html", label: "Accounts", key: "accounts" },
    { href: "/admin/backups.html", label: "Backups", key: "backups" },
  ];

  const list = document.querySelector("#nav-list");
  if (list) {
    list.replaceChildren();
    for (const item of items) {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = item.href;
      a.textContent = item.label;
      if (item.key === activePage) a.setAttribute("aria-current", "page");
      li.append(a);
      list.append(li);
    }
  }

  const name = document.querySelector("#account-name");
  const role = document.querySelector("#account-role");
  const pfp = document.querySelector("#account-pfp");
  const user = session.user;
  const shownName = user.displayName || user.username;
  const roleLabel = user.role === "root" ? "Root" : user.role === "admin" ? "Admin" : "Student";
  if (name) { name.hidden = false; name.textContent = shownName; }
  if (role) {
    const same = shownName.trim().toLowerCase() === roleLabel.toLowerCase();
    role.hidden = same;
    role.textContent = same ? "" : roleLabel;
  }
  if (pfp) {
    const safe = safePfp(user.pfp);
    pfp.hidden = !safe;
    if (safe) pfp.src = safe;
  }
  document.querySelector("#account-button")?.addEventListener("click", logOut);

  bindMobileMenu();
}

function bindMobileMenu() {
  const menuButton = document.querySelector("#menu-button");
  const backdrop = document.querySelector(".sidebar-backdrop");
  const main = document.querySelector("main");

  const setMenu = (open) => {
    const wasOpen = document.body.classList.contains("menu-open");
    document.body.classList.toggle("menu-open", open);
    if (menuButton) {
      menuButton.setAttribute("aria-expanded", String(open));
      menuButton.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      if (wasOpen && !open) menuButton.focus();
    }
    if (backdrop) backdrop.hidden = !open;
  };

  menuButton?.addEventListener("click", () => {
    setMenu(!document.body.classList.contains("menu-open"));
  });
  backdrop?.addEventListener("click", () => setMenu(false));
  main?.addEventListener("click", () => {
    if (document.body.classList.contains("menu-open")) setMenu(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setMenu(false);
  });
}