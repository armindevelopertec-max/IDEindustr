const defaults = [
  { name: "START", address: "0.00" },
  { name: "SENSOR", address: "0.01" },
  { name: "MOTOR", address: "100.00" },
  { name: "CYLINDER", address: "100.01" },
];

export function renderVariables(targetId, variables = null) {
  const target = document.getElementById(targetId);
  if (!target) return;

  const data = variables
    ? Object.entries(variables).map(([name, address]) => ({ name, address }))
    : defaults;

  const table = document.createElement("table");
  table.className = "variables-table";

  const header = document.createElement("tr");
  header.innerHTML = "<th>Variable</th><th>Dirección</th>";
  table.appendChild(header);

  data.forEach((item) => {
    const row = document.createElement("tr");
    row.innerHTML = `<td>${item.name}</td><td>${item.address}</td>`;
    table.appendChild(row);
  });

  target.innerHTML = "";
  target.appendChild(table);
}
