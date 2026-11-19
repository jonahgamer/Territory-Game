import { requireAdmin } from "../shared/session.js?v=roles";
import { initNav } from "../shared/nav.js?v=roles";
import { bindToastClose } from "../shared/toast.js";

if (requireAdmin()) {
  initNav("tutorial");
  bindToastClose();
}