let timer = null;

export function showPageToast(message, tone = "warn") {
  const pageToast = document.querySelector("#page-toast");
  const msg = document.querySelector("#page-toast-message");
  if (!pageToast || !msg) return;
  clearTimeout(timer);
  pageToast.dataset.tone = tone;
  msg.textContent = message;
  pageToast.hidden = false;
  timer = setTimeout(() => { pageToast.hidden = true; }, 6500);
}

export function hidePageToast() {
  clearTimeout(timer);
  const pageToast = document.querySelector("#page-toast");
  if (pageToast) pageToast.hidden = true;
}

export function bindToastClose() {
  document.querySelector("#page-toast-close")?.addEventListener("click", hidePageToast);
}