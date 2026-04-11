import "./styles.css";
import { renderIDE } from "./modules/ui.js";

const root = document.getElementById("root");

if (root) {
  renderIDE(root);
}
