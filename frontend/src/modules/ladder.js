export function renderLadderPanel(targetId, ladder = []) {
  const list = document.getElementById(targetId);
  if (!list) return;

  list.innerHTML = "";
  if (!ladder.length) {
    const helper = document.createElement("li");
    helper.textContent = "Presiona 'Generar GRAFCET' para llenar el ladder.";
    helper.style.opacity = "0.7";
    list.appendChild(helper);
    return;
  }

  ladder.forEach((row) => {
    const item = document.createElement("li");
    item.textContent = row;
    list.appendChild(item);
  });
}
