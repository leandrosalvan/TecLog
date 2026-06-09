// TecLog+ — Backoffice: dashboard (navegação por cards)

document.querySelectorAll(".menu-card").forEach((card) => {
  card.addEventListener("click", () => (window.location.href = card.dataset.href));
});

document.getElementById("btn-sair").addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  window.location.href = "/";
});
