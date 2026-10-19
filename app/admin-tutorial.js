import { requireAdmin } from "../shared/session.js";
import { initNav } from "../shared/nav.js";
import { bindToastClose } from "../shared/toast.js";

if (requireAdmin()) {
  initNav("tutorial");
  bindToastClose();
}