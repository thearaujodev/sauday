/* Sauday 1.0 | Service worker.
   Mostra as notificações dos lembretes (mais confiável que a notificação
   simples: funciona com a aba em segundo plano e no celular) e cuida do
   clique nelas. Não guarda nada em cache: o site sempre vem do servidor. */

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (evento) => {
  evento.waitUntil(self.clients.claim());
});

self.addEventListener("notificationclick", (evento) => {
  const notificacao = evento.notification;
  const dados = notificacao.data || {};
  notificacao.close();

  evento.waitUntil((async () => {
    const janelas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });

    // Primeiro traz o Sauday para a frente (o navegador só permite isso logo
    // após o clique); depois marca o aviso como lido.
    if (evento.action !== "lido") {
      const aberta = janelas.find((janela) => new URL(janela.url).origin === self.location.origin);
      if (aberta) {
        await aberta.focus();
        aberta.postMessage({ tipo: "abrir-compromisso", compromissoId: dados.compromissoId });
      } else {
        await self.clients.openWindow(dados.url || "/");
      }
    }

    if (dados.avisoId) {
      try {
        await fetch(`/api/notifications/${dados.avisoId}/read`, { method: "POST" });
      } catch (erro) {
        /* sem conexão: o aviso continua como não lido no sino */
      }
    }

    janelas.forEach((janela) => janela.postMessage({ tipo: "aviso-lido", avisoId: dados.avisoId }));
  })());
});
