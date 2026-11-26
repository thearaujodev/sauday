/* Sauday 1.0 | Núcleo usado em todas as páginas.
   - hora oficial (Brasília) e formatação de datas;
   - comunicação com a API e sincronização, inclusive com a aba em segundo plano;
   - disparo de cada lembrete no minuto exato e notificações do navegador;
   - janelas: formulário de compromisso, confirmação, ajuda e gaveta de avisos;
   - mensagens rápidas. */
(() => {
  "use strict";

  const CONFIG = window.SAUDAY || {};
  const S = (window.Sauday = {});

  const SEGUNDO = 1000;
  const MINUTO = 60 * SEGUNDO;
  const HORA = 60 * MINUTO;
  const DIA = 24 * HORA;
  const INTERVALO_SINCRONIA_MS = 30 * SEGUNDO;  // vale também com a aba em segundo plano
  const NOVA_TENTATIVA_MS = 4 * SEGUNDO;        // lembrete vencido que o servidor ainda não registrou
  const MAIOR_ESPERA_MS = 6 * HORA;
  const ATRASO_INDICADOR_MS = 250;              // só mostra "carregando" se a operação demorar
  const RELEVANTE_ATE_MS = 15 * MINUTO;         // após o início, o aviso já não vira notificação
  const CHAVE_ENTREGUES = "sauday.avisosNotificados";
  const FUSO = "America/Sao_Paulo";
  const SVG_NS = "http://www.w3.org/2000/svg";

  const CATEGORIAS = {
    consulta: { nome: "Consulta", plural: "Consultas", icone: "consulta", retorno: "Agendar retorno" },
    exame: { nome: "Exame", plural: "Exames", icone: "exame", retorno: "Repetir exame" },
    vacina: { nome: "Vacina", plural: "Vacinas", icone: "vacina", retorno: "Agendar próxima dose" },
    outro: { nome: "Outro", plural: "Outros", icone: "outro", retorno: "Agendar de novo" }
  };

  const categoria = (tipo) =>
    CATEGORIAS[tipo] || { nome: tipo, plural: tipo, icone: "outro", retorno: "Agendar de novo" };
  const tipoDoFiltro = (tipo) => (CATEGORIAS[tipo] ? tipo : "outro");

  /* ------------------------------------------------------------------ */
  /* Utilidades de interface                                             */
  /* ------------------------------------------------------------------ */

  const $ = (id) => document.getElementById(id);

  function criar(tag, classe, texto) {
    const no = document.createElement(tag);
    if (classe) no.className = classe;
    if (texto !== undefined && texto !== null) no.textContent = texto;
    return no;
  }

  function icone(nome, classe) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", classe ? `icone ${classe}` : "icone");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    const uso = document.createElementNS(SVG_NS, "use");
    uso.setAttribute("href", `#i-${nome}`);
    svg.append(uso);
    return svg;
  }

  // "rotulo" vira o nome acessível e sempre começa pelo texto visível.
  function botao(classe, texto, { icone: nomeIcone, rotulo, foco, aoClicar } = {}) {
    const b = criar("button", classe);
    b.type = "button";
    if (nomeIcone) b.append(icone(nomeIcone));
    if (texto) b.append(criar("span", "rotulo", texto));
    if (rotulo) b.setAttribute("aria-label", rotulo);
    if (foco) b.dataset.foco = foco;
    if (aoClicar) b.addEventListener("click", aoClicar);
    return b;
  }

  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const maiuscula = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
  const semAcentos = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const movimentoReduzido = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Redesenha um trecho da página sem perder o foco do teclado: o elemento
  // focado é reencontrado pelo atributo data-foco depois do redesenho.
  function renderizarPreservandoFoco(container, desenhar) {
    const ativo = document.activeElement;
    const chave = ativo && container.contains(ativo) ? ativo.dataset.foco : null;
    desenhar();
    if (!chave) return;
    const novo = container.querySelector(`[data-foco="${CSS.escape(chave)}"]`);
    if (novo) novo.focus({ preventScroll: true });
  }

  /* ------------------------------------------------------------------ */
  /* Hora oficial: Brasília                                              */
  /* ------------------------------------------------------------------ */

  // Diferença entre o relógio do servidor e o deste aparelho. Os lembretes
  // seguem o servidor, então um relógio de aparelho atrasado não atrapalha.
  let desvioMs = 0;

  const formatoPartes = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });

  function partes(momento) {
    const p = {};
    formatoPartes.formatToParts(momento).forEach(({ type, value }) => { p[type] = Number(value); });
    return { ano: p.year, mes: p.month, dia: p.day, hora: p.hour % 24, minuto: p.minute, segundo: p.second };
  }

  const dois = (n) => String(n).padStart(2, "0");
  const agora = () => new Date(Date.now() + desvioMs);

  function hojeISO(momento = agora()) {
    const p = partes(momento);
    return `${p.ano}-${dois(p.mes)}-${dois(p.dia)}`;
  }

  function horaAtual(momento = agora()) {
    const p = partes(momento);
    return `${dois(p.hora)}:${dois(p.minuto)}`;
  }

  // Instante absoluto de uma data e hora "de parede" de Brasília.
  function instante(data, hora = "00:00") {
    const [a, m, d] = data.split("-").map(Number);
    const [h, mi] = hora.split(":").map(Number);
    const palpite = Date.UTC(a, m - 1, d, h, mi);
    const p = partes(new Date(palpite));
    const deslocamento = Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo) - palpite;
    return new Date(palpite - deslocamento);
  }

  // "2026-11-25 21:56:47", como o servidor registra (em Brasília).
  const instanteRegistro = (texto) => instante(texto.slice(0, 10), texto.slice(11, 16));
  const inicioDe = (c) => instante(c.date, c.time).getTime();

  function diasAte(data) {
    const [a, m, d] = data.split("-").map(Number);
    const [ha, hm, hd] = hojeISO().split("-").map(Number);
    return Math.round((Date.UTC(a, m - 1, d) - Date.UTC(ha, hm - 1, hd)) / DIA);
  }

  function somarDias(data, n) {
    const [a, m, d] = data.split("-").map(Number);
    const x = new Date(Date.UTC(a, m - 1, d + n));
    return `${x.getUTCFullYear()}-${dois(x.getUTCMonth() + 1)}-${dois(x.getUTCDate())}`;
  }

  // Datas sem hora são formatadas ao meio-dia UTC: nenhum fuso muda o dia.
  function formato(opcoes, limpar = false) {
    const f = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", ...opcoes });
    return (data) => {
      const [a, m, d] = data.split("-").map(Number);
      const texto = f.format(new Date(Date.UTC(a, m - 1, d, 12)));
      return limpar ? texto.replace(".", "") : texto;
    };
  }

  const formatar = {
    semanaCurta: formato({ weekday: "short" }, true),
    mesCurto: formato({ month: "short" }, true),
    mesAno: formato({ month: "long", year: "numeric" }),
    completa: formato({ weekday: "long", day: "numeric", month: "long" }),
    completaAno: formato({ weekday: "long", day: "numeric", month: "long", year: "numeric" })
  };

  const dataCurta = (data) => `${data.slice(8, 10)}/${data.slice(5, 7)}`;

  function diaPorExtenso(data) {
    const dias = diasAte(data);
    if (dias === 0) return "hoje";
    if (dias === 1) return "amanhã";
    if (dias === -1) return "ontem";
    return data.slice(0, 4) === hojeISO().slice(0, 4) ? formatar.completa(data) : formatar.completaAno(data);
  }

  const quandoPorExtenso = (data, hora) => maiuscula(`${diaPorExtenso(data)}, às ${hora}`);

  // "hoje às 10:00", "amanhã às 09:30", "sex, 27/11 às 14:00"
  function momentoCurto(momento) {
    const data = hojeISO(momento);
    const hora = horaAtual(momento);
    const dias = diasAte(data);
    if (dias === 0) return `hoje às ${hora}`;
    if (dias === 1) return `amanhã às ${hora}`;
    if (dias === -1) return `ontem às ${hora}`;
    return `${formatar.semanaCurta(data)}, ${dataCurta(data)} às ${hora}`;
  }

  // "em 25 min", "em 3 h 05 min", "amanhã", "em 6 dias"
  function faltaPara(data, hora) {
    const ms = instante(data, hora).getTime() - agora().getTime();
    if (ms <= 0) return "agora";
    const minutos = Math.ceil(ms / MINUTO);
    if (minutos < 60) return `em ${minutos} min`;
    if (minutos < 24 * 60) {
      const h = Math.floor(minutos / 60);
      const m = minutos % 60;
      return m ? `em ${h} h ${dois(m)} min` : `em ${h} h`;
    }
    const dias = diasAte(data);
    return dias === 1 ? "amanhã" : `em ${dias} dias`;
  }

  function antecedenciaPorExtenso(minutos) {
    if (minutos === 0) return "na hora";
    if (minutos % 10080 === 0) return minutos === 10080 ? "1 semana" : `${minutos / 10080} semanas`;
    if (minutos % 1440 === 0) return minutos === 1440 ? "1 dia" : `${minutos / 1440} dias`;
    if (minutos % 60 === 0) return minutos === 60 ? "1 hora" : `${minutos / 60} horas`;
    return `${minutos} minutos`;
  }

  // O aparelho está em outro fuso? (ex.: viagem). Os horários seguem Brasília.
  function aparelhoEmOutroFuso() {
    const local = new Date();
    const p = partes(local);
    return local.getHours() !== p.hora || local.getMinutes() !== p.minuto;
  }

  function ajustarRelogio(resposta, enviadoEm, recebidoEm) {
    if (!resposta || typeof resposta.agora_ms !== "number") return;
    const desvio = resposta.agora_ms - (enviadoEm + recebidoEm) / 2;
    desvioMs = Math.abs(desvio) < 1500 ? 0 : desvio;
  }

  /* ------------------------------------------------------------------ */
  /* Comunicação com a API                                               */
  /* ------------------------------------------------------------------ */

  async function requisitar(url, opcoes = {}) {
    let resposta;
    try {
      resposta = await fetch(url, {
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        ...opcoes
      });
    } catch {
      throw new Error("Não foi possível falar com o servidor do Sauday. Verifique se ele está em execução e tente novamente.");
    }

    const corpo = await resposta.json().catch(() => ({}));

    if (!resposta.ok) {
      throw new Error(corpo.error || `O servidor respondeu com erro (${resposta.status}). Tente novamente.`);
    }

    return corpo;
  }

  const enviar = (metodo, dados) => ({ method: metodo, body: dados === undefined ? undefined : JSON.stringify(dados) });

  const api = {
    listar: () => requisitar("/api/appointments"),
    criar: (dados) => requisitar("/api/appointments", enviar("POST", dados)),
    atualizar: (id, dados) => requisitar(`/api/appointments/${id}`, enviar("PUT", dados)),
    alterar: (id, parcial) => requisitar(`/api/appointments/${id}`, enviar("PATCH", parcial)),
    excluir: (id) => requisitar(`/api/appointments/${id}`, enviar("DELETE")),
    processar: () => requisitar("/api/reminders/process", enviar("POST")),
    avisos: () => requisitar("/api/notifications"),
    lerAviso: (id) => requisitar(`/api/notifications/${id}/read`, enviar("POST")),
    lerTodos: () => requisitar("/api/notifications/read-all", enviar("POST"))
  };

  const urlCalendario = (c) => `/api/appointments/${c.id}/calendar.ics`;

  /* ------------------------------------------------------------------ */
  /* Estado e sincronização                                              */
  /* ------------------------------------------------------------------ */

  const estado = { compromissos: [], avisos: [], naoLidos: 0, carregou: false, erro: null };
  const ouvintes = new Set();
  const ouvintesMinuto = new Set();
  const ouvintesSalvar = new Set();

  function aoAtualizar(fn) {
    ouvintes.add(fn);
    if (estado.carregou || estado.erro) fn(estado);
  }

  function avisarOuvintes() {
    ouvintes.forEach((fn) => {
      try { fn(estado); } catch (erro) { console.error(erro); }
    });
  }

  async function executarSincronia() {
    const estavaOk = estado.carregou && !estado.erro;
    const estavaSemConexao = estado.carregou && Boolean(estado.erro);
    try {
      // O site também verifica os lembretes: os avisos saem mesmo que o
      // verificador do servidor esteja parado.
      const enviadoEm = Date.now();
      const processado = await api.processar();
      ajustarRelogio(processado, enviadoEm, Date.now());

      const [compromissos, avisos] = await Promise.all([api.listar(), api.avisos()]);
      estado.compromissos = compromissos;
      estado.avisos = avisos.notifications;
      estado.naoLidos = avisos.unread;
      estado.carregou = true;
      estado.erro = null;
    } catch (erro) {
      estado.erro = erro;
    }

    avisarOuvintes();
    atualizarContadores();
    if ($("gaveta-avisos").open) renderizarAvisos();

    if (estado.erro) {
      if (estavaOk) mostrarMensagem("Sem conexão com o servidor do Sauday. Tentando de novo…", { tipo: "erro" });
      clearTimeout(temporizadorLembrete);
      temporizadorLembrete = setTimeout(sincronizar, NOVA_TENTATIVA_MS * 2);
      return false;
    }

    if (estavaSemConexao) {
      document.querySelectorAll(".mensagem-erro").forEach((m) => m.remove());
      mostrarMensagem("Conexão com o servidor restabelecida.");
    }

    entregarAvisosNovos();
    agendarProximoLembrete();
    return true;
  }

  // Uma sincronia por vez; pedidos feitos durante uma sincronia viram uma
  // única nova rodada logo em seguida (com os dados mais recentes). Um erro
  // inesperado numa rodada não impede as próximas.
  let fila = Promise.resolve();
  let proximaRodada = null;

  function rodada() {
    proximaRodada = null;
    return executarSincronia().catch((erro) => {
      console.error(erro);
      return false;
    });
  }

  function sincronizar() {
    if (proximaRodada) return proximaRodada;
    proximaRodada = fila.then(rodada, rodada);
    fila = proximaRodada;
    return proximaRodada;
  }

  // Avisa as outras abas abertas do Sauday que algo mudou.
  const canal = "BroadcastChannel" in window ? new BroadcastChannel("sauday") : null;
  const transmitir = () => { if (canal) canal.postMessage({ tipo: "mudou" }); };
  if (canal) canal.addEventListener("message", () => sincronizar());

  /* ------------------------------------------------------------------ */
  /* Lembretes no minuto exato                                           */
  /* ------------------------------------------------------------------ */

  // Em vez de esperar a próxima verificação periódica, o site agenda um
  // despertador para o momento exato do próximo lembrete. Ao tocar, ele pede
  // ao servidor para registrar o aviso e mostra a notificação.
  let temporizadorLembrete = null;

  function momentoDoProximoLembrete() {
    const t = agora().getTime();
    let proximo = Infinity;

    estado.compromissos.forEach((c) => {
      if (!c.notify || c.reminded_at) return;
      const inicio = inicioDe(c);
      const disparo = inicio - c.reminder_minutes * MINUTO;
      const fimDaJanela = Math.max(inicio, disparo + MINUTO);
      if (fimDaJanela <= t) return;
      proximo = Math.min(proximo, disparo);
    });

    return proximo;
  }

  function agendarProximoLembrete() {
    clearTimeout(temporizadorLembrete);
    const proximo = momentoDoProximoLembrete();
    if (proximo === Infinity) return;

    const espera = proximo - agora().getTime();
    const atraso = espera <= 0 ? NOVA_TENTATIVA_MS : Math.min(espera + 300, MAIOR_ESPERA_MS);
    temporizadorLembrete = setTimeout(sincronizar, atraso);
  }

  /* ------------------------------------------------------------------ */
  /* Notificações do navegador                                           */
  /* ------------------------------------------------------------------ */

  function permissao() {
    if (!("Notification" in window)) return "sem-suporte";
    if (!window.isSecureContext) return "inseguro";
    return Notification.permission;
  }

  let ultimaPermissao = permissao();
  let pedidoEmAndamento = null;

  function aoMudarPermissao() {
    ultimaPermissao = permissao();
    renderizarEstadoNotificacoes();
    if ($("janela-compromisso").open) atualizarDicaPermissao();
    entregarAvisosNovos();
  }

  function conferirPermissao() {
    if (permissao() !== ultimaPermissao) aoMudarPermissao();
  }

  // Precisa ser chamado durante um clique: o navegador exige um gesto da pessoa.
  function pedirPermissao() {
    if (permissao() !== "default") return Promise.resolve(permissao());
    if (pedidoEmAndamento) return pedidoEmAndamento;

    pedidoEmAndamento = (async () => {
      try {
        await Notification.requestPermission();
      } catch {
        /* navegadores antigos: o resultado é lido abaixo */
      }
      pedidoEmAndamento = null;
      aoMudarPermissao();
      return permissao();
    })();

    return pedidoEmAndamento;
  }

  if (navigator.permissions && navigator.permissions.query) {
    navigator.permissions.query({ name: "notifications" })
      .then((situacao) => { situacao.onchange = aoMudarPermissao; })
      .catch(() => {});
  }

  // O service worker mostra as notificações: funciona com a aba em segundo
  // plano, no celular, e o clique na notificação abre o Sauday.
  const prontoSW = (async () => {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return null;
    try {
      await navigator.serviceWorker.register("/sw.js");
      return await navigator.serviceWorker.ready;
    } catch (erro) {
      console.warn("Sauday: service worker indisponível; usando notificações simples.", erro);
      return null;
    }
  })();

  const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

  async function exibirNotificacao(aviso) {
    const cat = categoria(aviso.type);
    const titulo = `${cat.nome}: ${aviso.title}`;
    const opcoes = {
      body: `${quandoPorExtenso(aviso.date, aviso.time)}${aviso.location ? ` · ${aviso.location}` : ""}`,
      icon: CONFIG.icone,
      badge: CONFIG.selo,
      tag: `sauday-aviso-${aviso.id}`,
      lang: "pt-BR",
      requireInteraction: true,
      data: { avisoId: aviso.id, compromissoId: aviso.appointment_id, url: `/?compromisso=${aviso.appointment_id}` }
    };

    try {
      const registro = await Promise.race([prontoSW, esperar(3000).then(() => null)]);
      if (registro) {
        await registro.showNotification(titulo, {
          ...opcoes,
          actions: [{ action: "lido", title: "Marcar como lido" }]
        });
        return true;
      }
    } catch {
      /* segue para a notificação simples */
    }

    try {
      const n = new Notification(titulo, opcoes);
      n.addEventListener("click", () => {
        window.focus();
        n.close();
        abrirCompromisso(aviso.appointment_id, { marcarLido: aviso });
      });
      return true;
    } catch {
      return false;
    }
  }

  function lerEntregues() {
    try {
      return new Set(JSON.parse(localStorage.getItem(CHAVE_ENTREGUES) || "[]"));
    } catch {
      return new Set();
    }
  }

  const entregues = lerEntregues();

  function salvarEntregues() {
    try {
      localStorage.setItem(CHAVE_ENTREGUES, JSON.stringify(Array.from(entregues).slice(-200)));
    } catch {
      /* armazenamento indisponível: o controle fica só nesta aba */
    }
  }

  // Mostra cada aviso novo uma única vez neste navegador: como notificação do
  // sistema (se permitido) e como mensagem na página (se ela estiver à vista).
  function entregarAvisosNovos() {
    if (pedidoEmAndamento) return; // espera a resposta da pessoa ao pedido de permissão

    lerEntregues().forEach((id) => entregues.add(id)); // outras abas podem ter entregue
    const t = agora().getTime();
    const novos = estado.avisos.filter((a) =>
      !a.read_at && !entregues.has(a.id) && inicioDe(a) + RELEVANTE_ATE_MS > t
    );
    if (!novos.length) return;

    const podeNotificar = permissao() === "granted";
    const visivel = document.visibilityState === "visible";
    if (!podeNotificar && !visivel) return; // entrega quando a pessoa voltar à aba

    novos.forEach((aviso, i) => {
      if (i < 3) {
        if (podeNotificar) exibirNotificacao(aviso);
        if (visivel) {
          mostrarMensagem(`Lembrete: ${aviso.title}, ${diaPorExtenso(aviso.date)} às ${aviso.time}.`, {
            tipo: "lembrete",
            duracao: 12 * SEGUNDO,
            acao: { texto: "Ver", aoClicar: () => abrirCompromisso(aviso.appointment_id, { marcarLido: aviso }) }
          });
        }
      }
      entregues.add(aviso.id);
    });

    salvarEntregues();
  }

  function descreverNotificacoes() {
    switch (permissao()) {
      case "granted":
        return { classe: "ok", icone: "check-circulo", texto: "Notificações ativas neste navegador", acao: "Como funciona" };
      case "denied":
        return { classe: "alerta", icone: "alerta", texto: "Notificações bloqueadas neste navegador", acao: "Como liberar" };
      case "inseguro":
        return { classe: "alerta", icone: "cadeado", texto: "Notificações indisponíveis neste endereço", acao: "Por quê?" };
      case "sem-suporte":
        return { classe: "neutro", icone: "sino-desligado", texto: "Este navegador não mostra notificações", acao: "Saiba mais" };
      default:
        return { classe: "pendente", icone: "sino", texto: "Permita as notificações para ser avisado na hora", acao: "Permitir" };
    }
  }

  function renderizarEstadoNotificacoes() {
    const d = descreverNotificacoes();

    document.querySelectorAll("[data-estado-notificacoes]").forEach((alvo) => {
      if (alvo.dataset.desenhado === d.classe + d.texto) return;
      alvo.dataset.desenhado = d.classe + d.texto;
      const pilula = criar("div", `pilula-estado ${d.classe}`);
      pilula.append(icone(d.icone), criar("span", "pilula-texto", d.texto));

      const acao = d.classe === "pendente"
        ? botao("btn btn-primario btn-pequeno", d.acao, { aoClicar: () => pedirPermissao() })
        : botao("btn-texto btn-pequeno", d.acao, { aoClicar: abrirAjuda });
      acao.setAttribute("aria-haspopup", d.classe === "pendente" ? "false" : "dialog");
      pilula.append(acao);

      alvo.replaceChildren(pilula);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Mensagens rápidas                                                   */
  /* ------------------------------------------------------------------ */

  const ICONES_MENSAGEM = { sucesso: "check-circulo", erro: "alerta", alerta: "alerta", lembrete: "sino" };

  function mostrarMensagem(texto, { tipo = "sucesso", acao = null, duracao } = {}) {
    const pilha = $(tipo === "erro" ? "mensagens-alerta" : "mensagens-status");
    const mensagem = criar("div", `mensagem mensagem-${tipo}`);
    mensagem.append(icone(ICONES_MENSAGEM[tipo] || "check-circulo"), criar("p", "mensagem-texto", texto));

    let temporizador = null;
    const remover = () => {
      clearTimeout(temporizador);
      const tinhaFoco = mensagem.contains(document.activeElement);
      mensagem.remove();
      if (tinhaFoco) focarConteudo(); // o foco do teclado não fica perdido
    };

    if (acao) {
      mensagem.append(botao("mensagem-acao", acao.texto, {
        aoClicar: () => { remover(); acao.aoClicar(); }
      }));
    }

    mensagem.append(botao("mensagem-fechar", null, { icone: "fechar", rotulo: "Fechar mensagem", aoClicar: remover }));

    // Some sozinha (menos erros), mas pausa enquanto o mouse ou o foco estão nela.
    const tempo = duracao || (acao ? 10 : 6) * SEGUNDO;
    const iniciar = () => {
      clearTimeout(temporizador);
      if (tipo !== "erro") temporizador = setTimeout(remover, tempo);
    };
    mensagem.addEventListener("mouseenter", () => clearTimeout(temporizador));
    mensagem.addEventListener("focusin", () => clearTimeout(temporizador));
    mensagem.addEventListener("mouseleave", () => {
      if (!mensagem.contains(document.activeElement)) iniciar();
    });
    mensagem.addEventListener("focusout", (evento) => {
      if (!mensagem.contains(evento.relatedTarget) && !mensagem.matches(":hover")) iniciar();
    });

    pilha.append(mensagem);
    while (pilha.children.length > 3) pilha.firstElementChild.remove();
    iniciar();
  }

  /* ------------------------------------------------------------------ */
  /* Botões com estado de carregamento                                   */
  /* ------------------------------------------------------------------ */

  // Desabilita o botão na hora (evita envio duplicado) e só troca o rótulo
  // por "carregando" se a operação passar de ATRASO_INDICADOR_MS.
  async function comCarregamento(alvo, textoCarregando, acao) {
    if (alvo.disabled) return undefined;

    const original = Array.from(alvo.childNodes);
    alvo.disabled = true;
    alvo.setAttribute("aria-busy", "true");

    const temporizador = setTimeout(() => {
      const simbolo = criar("img", "carregando-simbolo");
      simbolo.src = CONFIG.simbolo;
      simbolo.alt = "";
      alvo.replaceChildren(simbolo, document.createTextNode(textoCarregando));
    }, ATRASO_INDICADOR_MS);

    try {
      return await acao();
    } finally {
      clearTimeout(temporizador);
      if (alvo.isConnected) {
        if (alvo.dataset.rotulo) alvo.textContent = alvo.dataset.rotulo;
        else alvo.replaceChildren(...original);
        alvo.disabled = false;
        alvo.removeAttribute("aria-busy");
      }
    }
  }

  function definirRotulo(alvo, texto) {
    alvo.dataset.rotulo = texto;
    if (!alvo.disabled) alvo.textContent = texto;
  }

  /* ------------------------------------------------------------------ */
  /* Peças visuais compartilhadas pela agenda e pelo histórico           */
  /* ------------------------------------------------------------------ */

  function blocoData(data, { ano = false } = {}) {
    const bloco = criar("div", "cartao-data");
    bloco.setAttribute("aria-hidden", "true");
    bloco.append(
      criar("span", "data-semana", formatar.semanaCurta(data)),
      criar("span", "data-dia", String(Number(data.slice(8, 10)))),
      criar("span", "data-mes", ano ? `${formatar.mesCurto(data)} ${data.slice(2, 4)}` : formatar.mesCurto(data))
    );
    return bloco;
  }

  function seloCategoria(tipo) {
    const cat = categoria(tipo);
    const selo = criar("span", "selo-categoria");
    selo.append(icone(cat.icone), criar("span", null, cat.nome));
    return selo;
  }

  function linha(nomeIcone, texto, classe) {
    const p = criar("p", `cartao-linha${classe ? ` ${classe}` : ""}`);
    p.append(icone(nomeIcone), criar("span", null, texto));
    return p;
  }

  function vazio({ titulo, texto, acoes = [] }) {
    const caixa = criar("div", "vazio");
    const simbolo = criar("img", "vazio-simbolo");
    simbolo.src = CONFIG.simbolo;
    simbolo.alt = "";
    caixa.append(simbolo, criar("h3", null, titulo), criar("p", null, texto));
    if (acoes.length) {
      const barra = criar("div", "vazio-acoes");
      barra.append(...acoes);
      caixa.append(barra);
    }
    return caixa;
  }

  function statusDoLembrete(c) {
    if (!c.notify) return { classe: "desligado", icone: "sino-desligado", texto: "Notificação desligada" };

    if (c.reminded_at) {
      return { classe: "enviado", icone: "check-circulo", texto: `Aviso enviado ${momentoCurto(instanteRegistro(c.reminded_at))}` };
    }

    const inicio = inicioDe(c);
    const t = agora().getTime();
    if (inicio <= t) return { classe: "desligado", icone: "sino", texto: "Nenhum aviso enviado" };

    const disparo = inicio - c.reminder_minutes * MINUTO;
    if (disparo <= t) return { classe: "janela", icone: "sino", texto: "Enviando o aviso…" };

    return {
      classe: "agendado",
      icone: "sino",
      texto: `Aviso ${momentoCurto(new Date(disparo))}`,
      antecedencia: `${antecedenciaPorExtenso(c.reminder_minutes)} antes`
    };
  }

  /* ------------------------------------------------------------------ */
  /* Ações sobre compromissos                                            */
  /* ------------------------------------------------------------------ */

  function confirmar({ titulo, texto, rotulo = "Excluir" }) {
    const janela = $("janela-confirmar");
    $("confirmar-titulo").textContent = titulo;
    $("confirmar-texto").textContent = texto;
    $("confirmar-ok").textContent = rotulo;
    janela.returnValue = "";

    return new Promise((resolver) => {
      janela.addEventListener("close", () => resolver(janela.returnValue === "confirmar"), { once: true });
      janela.showModal();
    });
  }

  async function excluirCompromisso(c) {
    const ok = await confirmar({
      titulo: "Excluir compromisso?",
      texto: `“${c.title}” (${diaPorExtenso(c.date)}, às ${c.time}) será removido, junto com os avisos dele. Não é possível desfazer.`
    });
    if (!ok) return false;

    try {
      await api.excluir(c.id);
      await sincronizar();
      transmitir();
      mostrarMensagem("Compromisso excluído.");
      return true;
    } catch (erro) {
      mostrarMensagem(erro.message, { tipo: "erro" });
      return false;
    }
  }

  async function alternarNotificacao(c, ligar) {
    // O pedido de permissão sai no próprio clique, antes de qualquer espera.
    const pedido = ligar && permissao() === "default" ? pedirPermissao() : null;
    const anterior = c.notify;
    c.notify = ligar;
    avisarOuvintes();

    try {
      await api.alterar(c.id, { notify: ligar });
      await sincronizar();
      transmitir();
    } catch (erro) {
      c.notify = anterior;
      avisarOuvintes();
      mostrarMensagem(erro.message, { tipo: "erro" });
      return;
    }

    if (!ligar) {
      mostrarMensagem(`Notificação desligada para “${c.title}”.`);
      return;
    }

    const atual = estado.compromissos.find((x) => x.id === c.id) || c;
    const st = statusDoLembrete(atual);
    mostrarMensagem(`Notificação ligada. ${st.classe === "agendado" ? `${st.texto}.` : "O aviso já foi enviado."}`);

    const resposta = pedido ? await pedido : permissao();
    if (resposta === "denied") avisarBloqueio();
  }

  function avisarBloqueio() {
    mostrarMensagem("O navegador bloqueou as notificações. Os avisos continuam no sino do Sauday.", {
      tipo: "alerta",
      acao: { texto: "Como liberar", aoClicar: abrirAjuda }
    });
  }

  // Leva até o compromisso: na agenda (se ainda vai acontecer) ou no histórico.
  async function abrirCompromisso(id, { marcarLido } = {}) {
    const gaveta = $("gaveta-avisos");
    if (gaveta.open) gaveta.close();

    if (marcarLido && !marcarLido.read_at) {
      api.lerAviso(marcarLido.id).then(() => { sincronizar(); transmitir(); }).catch(() => {});
    }

    const c = estado.compromissos.find((x) => x.id === id);
    const destino = c && inicioDe(c) <= agora().getTime() ? "/historico" : "/";

    if (location.pathname === destino && S.destacar && S.destacar(id)) return;
    location.href = `${destino}?compromisso=${id}`;
  }

  /* ------------------------------------------------------------------ */
  /* Formulário de compromisso (janela)                                  */
  /* ------------------------------------------------------------------ */

  const form = {
    janela: $("janela-compromisso"),
    el: $("form-compromisso"),
    titulo: $("titulo-form"),
    sobretitulo: $("form-sobretitulo"),
    salvar: $("btn-salvar"),
    erro: $("form-erro"),
    erroTexto: $("form-erro-texto"),
    notaHistorico: $("form-nota-historico"),
    secaoLembrete: $("secao-lembrete"),
    atalhos: $("atalhos-data"),
    dicaQuando: $("dica-quando-texto"),
    campoAntecedencia: $("campo-antecedencia"),
    previa: $("previa-lembrete"),
    dicaPermissao: $("dica-permissao"),
    categorias: $("categorias-opcoes"),
    modo: "novo",
    compromisso: null,
    abertoPor: null
  };

  const campos = () => form.el.elements;

  function marcarErro(campo, texto) {
    const entrada = campos()[campo];
    const saida = $(`erro-${campo}`);
    entrada.setAttribute("aria-invalid", texto ? "true" : "false");
    saida.replaceChildren();
    if (texto) saida.append(icone("alerta"), criar("span", null, texto));
    saida.hidden = !texto;
  }

  function limparErros() {
    ["title", "date", "time"].forEach((campo) => marcarErro(campo, ""));
    form.erro.hidden = true;
  }

  function mostrarErroDoFormulario(texto) {
    form.erroTexto.textContent = texto;
    form.erro.hidden = false;
    form.erro.scrollIntoView({ block: "nearest" });
  }

  const proximoMinuto = () => horaAtual(new Date(agora().getTime() + MINUTO));

  // A data e o horário do compromisso não mudaram (edição): vale o original.
  function quandoInalterado() {
    const c = form.compromisso;
    const f = campos();
    return form.modo === "editar" && c && f.date.value === c.date && f.time.value === c.time;
  }

  function validarQuando(data, hora) {
    const erros = { date: "", time: "" };
    const hoje = hojeISO();

    if (!data) erros.date = "Escolha a data.";
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) erros.date = "Data inválida.";
    else if (data < hoje) erros.date = `A data já passou. Escolha a partir de hoje (${dataCurta(hoje)}).`;

    if (!hora) erros.time = "Escolha o horário.";
    else if (!erros.date && data === hoje && instante(data, hora) <= agora()) {
      erros.time = `Esse horário já passou. Escolha depois das ${horaAtual()} (Brasília).`;
    }

    return erros;
  }

  function validarFormulario() {
    const f = campos();
    const erros = { title: f.title.value.trim() ? "" : "Informe um título para o compromisso.", date: "", time: "" };

    if (form.modo !== "historico" && !quandoInalterado()) {
      Object.assign(erros, validarQuando(f.date.value, f.time.value));
    }

    Object.entries(erros).forEach(([campo, texto]) => marcarErro(campo, texto));

    const primeiro = ["title", "date", "time"].find((campo) => erros[campo]);
    if (primeiro) f[primeiro].focus();
    return !primeiro;
  }

  // Validação enquanto a pessoa preenche (sem mover o foco).
  function validarQuandoAoVivo() {
    const f = campos();
    if (form.modo === "historico" || quandoInalterado()) return;
    const erros = validarQuando(f.date.value, f.time.value);
    if (f.date.value) marcarErro("date", erros.date);
    if (f.time.value && f.date.value) marcarErro("time", erros.time);
  }

  function atualizarLimites() {
    const f = campos();
    const hoje = hojeISO();

    if (form.modo === "historico") {
      f.date.removeAttribute("min");
      f.time.removeAttribute("min");
      return;
    }

    f.date.min = hoje;
    if (f.date.value === hoje) f.time.min = proximoMinuto();
    else f.time.removeAttribute("min");

    form.dicaQuando.textContent = `Horário de Brasília (agora são ${horaAtual()}). Dá para marcar de hoje em diante, a partir do próximo minuto.`;
  }

  function atualizarPrevia() {
    const f = campos();
    const notificar = f.notify.checked;
    form.campoAntecedencia.hidden = !notificar;
    form.previa.replaceChildren();

    let texto;
    let classe = "";

    if (!notificar) {
      texto = "Sem notificação para este compromisso. Dá para ligar depois, direto na agenda.";
      classe = "desligada";
    } else if (!f.date.value || !f.time.value) {
      texto = "Escolha a data e o horário para ver quando o aviso chega.";
    } else {
      const inicio = instante(f.date.value, f.time.value).getTime();
      const disparo = inicio - Number(f.reminder_minutes.value) * MINUTO;
      const t = agora().getTime();
      if (inicio <= t) {
        texto = "";
      } else if (disparo <= t) {
        texto = "Como o compromisso está próximo, o aviso sai assim que você salvar.";
      } else {
        texto = `Você será avisado ${momentoCurto(new Date(disparo))}.`;
      }
    }

    if (texto) form.previa.append(icone(notificar ? "sino" : "sino-desligado"), criar("span", null, texto));
    form.previa.className = `previa-lembrete ${classe}`.trim();
    atualizarDicaPermissao();
  }

  function atualizarDicaPermissao() {
    const p = permissao();
    const dica = form.dicaPermissao;
    dica.replaceChildren();

    let texto = "";
    if (campos().notify.checked) {
      if (p === "default") texto = "Ao salvar, o navegador vai pedir permissão para mostrar notificações. Escolha “Permitir”.";
      else if (p === "denied") texto = "O navegador está bloqueando as notificações. O aviso fica guardado no sino do Sauday.";
      else if (p === "inseguro" || p === "sem-suporte") texto = "Neste acesso o navegador não mostra notificações. O aviso fica guardado no sino do Sauday.";
    }

    if (texto) {
      dica.append(icone(p === "default" ? "sobre" : "alerta"), criar("span", null, texto));
      if (p !== "default") {
        const ajuda = botao("btn-texto btn-pequeno", "Como resolver", { aoClicar: abrirAjuda });
        ajuda.setAttribute("aria-haspopup", "dialog");
        dica.append(ajuda);
      }
    }
    dica.hidden = !texto;
  }

  function removerOpcoesExtras() {
    form.el.querySelectorAll("[data-extra]").forEach((no) => no.remove());
  }

  function garantirCategoria(tipo) {
    if (CATEGORIAS[tipo]) return;
    const rotulo = criar("label", "categoria-opcao");
    rotulo.dataset.extra = "true";
    const entrada = criar("input");
    entrada.type = "radio";
    entrada.name = "type";
    entrada.value = tipo;
    rotulo.append(entrada, icone("outro"), criar("span", null, tipo));
    form.categorias.append(rotulo);
  }

  function garantirAntecedencia(minutos) {
    const seletor = campos().reminder_minutes;
    const valor = String(minutos);
    if (!Array.from(seletor.options).some((o) => o.value === valor)) {
      const opcao = new Option(antecedenciaPorExtenso(minutos), valor);
      opcao.dataset.extra = "true";
      seletor.add(opcao);
    }
    seletor.value = valor;
  }

  // modo: "novo" | "editar" | "historico" (já passou) | "retorno" (a partir do histórico)
  function abrirFormulario({ modo = "novo", compromisso = null, data = null } = {}) {
    const f = campos();
    const c = compromisso;

    form.modo = modo;
    form.compromisso = c;
    if (!form.janela.open) form.abertoPor = document.activeElement;
    form.el.reset();
    removerOpcoesExtras();
    limparErros();

    if (c) {
      f.title.value = c.title;
      garantirCategoria(c.type);
      f.type.value = c.type;
      f.location.value = c.location || "";
      f.time.value = c.time;
      garantirAntecedencia(c.reminder_minutes);
      if (modo === "retorno") {
        f.notify.checked = true;
      } else {
        f.date.value = c.date;
        f.notes.value = c.notes || "";
        f.notify.checked = Boolean(c.notify);
      }
    }
    if (data) f.date.value = data;

    const textos = {
      novo: ["Agenda de saúde", "Novo compromisso", "Salvar compromisso"],
      editar: ["Agenda de saúde", "Editar compromisso", "Salvar alterações"],
      historico: ["Histórico", "Editar registro", "Salvar alterações"],
      retorno: ["A partir do histórico", c ? categoria(c.type).retorno : "Agendar de novo", "Agendar"]
    }[modo];

    form.sobretitulo.textContent = textos[0];
    form.titulo.textContent = textos[1];
    definirRotulo(form.salvar, textos[2]);

    const passado = modo === "historico";
    form.notaHistorico.hidden = !passado;
    f.date.disabled = passado;
    f.time.disabled = passado;
    form.atalhos.hidden = passado;
    form.secaoLembrete.hidden = passado;

    atualizarLimites();
    atualizarPrevia();

    if (!form.janela.open) form.janela.showModal();
    form.janela.querySelector(".janela-corpo").scrollTop = 0;
    (modo === "retorno" ? f.date : f.title).focus();
  }

  function dadosDoFormulario() {
    const f = campos();
    const c = form.compromisso;
    const passado = form.modo === "historico";
    return {
      title: f.title.value.trim(),
      type: f.type.value,
      date: passado ? c.date : f.date.value,
      time: passado ? c.time : f.time.value,
      location: f.location.value.trim() || null,
      notes: f.notes.value.trim() || null,
      reminder_minutes: passado ? c.reminder_minutes : Number(f.reminder_minutes.value),
      notify: passado ? c.notify : f.notify.checked
    };
  }

  async function mensagemDeSalvo(c, editando, pedido) {
    let texto = editando ? "Alterações salvas." : "Compromisso salvo.";

    if (c && inicioDe(c) > agora().getTime()) {
      const st = statusDoLembrete(c);
      if (st.classe === "agendado") texto += ` ${st.texto}.`;
      else if (st.classe === "enviado" || st.classe === "janela") texto += " O aviso já foi enviado.";
      else if (st.classe === "desligado") texto += " Sem notificação.";
    }

    const naAgenda = document.body.dataset.pagina === "inicio";
    const futuro = c && inicioDe(c) > agora().getTime();
    mostrarMensagem(texto, {
      acao: c && futuro && !naAgenda ? { texto: "Ver na agenda", aoClicar: () => abrirCompromisso(c.id) } : null
    });

    if (pedido) {
      const resposta = await pedido;
      if (resposta === "denied") avisarBloqueio();
    }
  }

  form.el.addEventListener("submit", (evento) => {
    evento.preventDefault();
    form.erro.hidden = true;
    if (!validarFormulario()) return;

    const dados = dadosDoFormulario();
    const { modo, compromisso } = form;
    const editando = modo === "editar" || modo === "historico";
    // O pedido de permissão sai no próprio clique em "Salvar" (gesto da pessoa).
    const pedido = dados.notify && permissao() === "default" ? pedirPermissao() : null;

    comCarregamento(form.salvar, "Salvando…", async () => {
      try {
        const resposta = editando ? await api.atualizar(compromisso.id, dados) : await api.criar(dados);
        const id = editando ? compromisso.id : resposta.id;
        form.janela.close();
        await sincronizar();
        transmitir();
        const salvo = estado.compromissos.find((c) => c.id === id);
        ouvintesSalvar.forEach((fn) => fn(id));
        mensagemDeSalvo(salvo, editando, pedido);
      } catch (erro) {
        mostrarErroDoFormulario(erro.message);
      }
    });
  });

  form.el.addEventListener("input", (evento) => {
    const alvo = evento.target;
    if (alvo.name === "title" && alvo.value.trim()) marcarErro("title", "");
    if (["date", "time", "reminder_minutes", "notify"].includes(alvo.name)) {
      atualizarLimites();
      atualizarPrevia();
    }
  });

  form.el.addEventListener("change", (evento) => {
    if (["date", "time"].includes(evento.target.name)) validarQuandoAoVivo();
  });

  form.atalhos.addEventListener("click", (evento) => {
    const chip = evento.target.closest("[data-atalho-dias]");
    if (!chip) return;
    const f = campos();
    f.date.value = somarDias(hojeISO(), Number(chip.dataset.atalhoDias));
    atualizarLimites();
    atualizarPrevia();
    validarQuandoAoVivo();
    f.time.focus();
  });

  form.janela.addEventListener("close", () => {
    const origem = form.abertoPor;
    form.abertoPor = null;
    if (origem && origem.isConnected && origem !== document.body) origem.focus({ preventScroll: true });
    else focarConteudo();
  });

  // Destino do foco quando o elemento de origem deixou de existir.
  function focarConteudo() {
    const alvo = document.querySelector("main [tabindex='-1']:not(.cartao)") || $("conteudo");
    alvo.focus({ preventScroll: true });
  }

  /* ------------------------------------------------------------------ */
  /* Ajuda sobre notificações                                            */
  /* ------------------------------------------------------------------ */

  function abrirAjuda() {
    const janela = $("janela-notificacoes");
    const p = permissao();
    janela.querySelectorAll("[data-ajuda]").forEach((bloco) => { bloco.hidden = bloco.dataset.ajuda !== p; });
    if (!janela.open) janela.showModal();
  }

  /* ------------------------------------------------------------------ */
  /* Gaveta de avisos (sino)                                             */
  /* ------------------------------------------------------------------ */

  const gaveta = {
    janela: $("gaveta-avisos"),
    lista: $("lista-avisos"),
    resumo: $("resumo-avisos"),
    lerTodos: $("btn-ler-todos")
  };

  async function lerAviso(aviso, alvo) {
    await comCarregamento(alvo, "Salvando…", async () => {
      try {
        await api.lerAviso(aviso.id);
        await sincronizar();
        transmitir();
      } catch (erro) {
        mostrarMensagem(erro.message, { tipo: "erro" });
      }
    });
  }

  function itemAviso(aviso) {
    const lido = Boolean(aviso.read_at);
    const cat = categoria(aviso.type);
    const item = criar("li", `aviso ${lido ? "lido" : "nao-lido"}`);

    const marca = criar("span", "aviso-icone");
    marca.append(icone(cat.icone));

    const titulo = criar("p", "aviso-titulo", aviso.title);
    if (!lido) titulo.append(criar("span", "selo-novo", "Novo"));

    const detalhe = criar("p", "aviso-detalhe",
      `${cat.nome} · ${quandoPorExtenso(aviso.date, aviso.time)}${aviso.location ? ` · ${aviso.location}` : ""}`);
    const registro = criar("p", "aviso-registro", `Recebido ${momentoCurto(instanteRegistro(aviso.created_at))}`);

    const acoes = criar("div", "aviso-acoes");
    acoes.append(botao("btn-texto btn-pequeno", "Ver compromisso", {
      icone: "seta",
      rotulo: `Ver compromisso ${aviso.title}`,
      foco: `ver-aviso-${aviso.id}`,
      aoClicar: () => abrirCompromisso(aviso.appointment_id, { marcarLido: aviso })
    }));

    if (!lido) {
      acoes.append(botao("btn-texto btn-pequeno", "Marcar como lido", {
        icone: "check",
        rotulo: `Marcar como lido o aviso de ${aviso.title}`,
        foco: `ler-aviso-${aviso.id}`,
        aoClicar: (evento) => lerAviso(aviso, evento.currentTarget)
      }));
    }

    item.append(marca, titulo, detalhe, registro, acoes);
    return item;
  }

  function renderizarAvisos() {
    renderizarPreservandoFoco(gaveta.janela, () => {
      gaveta.lista.setAttribute("aria-busy", String(!estado.carregou));

      if (!estado.carregou) {
        if (estado.erro) gaveta.lista.replaceChildren(criar("li", "falha", estado.erro.message));
        return;
      }

      if (!estado.avisos.length) {
        const item = criar("li", "avisos-vazio");
        item.append(
          icone("sino"),
          criar("p", null, "Nenhum aviso por enquanto. Quando um compromisso com notificação estiver chegando, o aviso aparece aqui.")
        );
        gaveta.lista.replaceChildren(item);
      } else {
        gaveta.lista.replaceChildren(...estado.avisos.map(itemAviso));
      }

      const n = estado.naoLidos;
      gaveta.resumo.textContent = n ? `${plural(n, "aviso novo", "avisos novos")}` : "Nenhum aviso novo";
      gaveta.lerTodos.hidden = n === 0;
    });
  }

  function abrirGaveta() {
    renderizarAvisos();
    if (!gaveta.janela.open) gaveta.janela.showModal();
  }

  // Clique no fundo escurecido fecha a gaveta.
  gaveta.janela.addEventListener("click", (evento) => {
    if (evento.target === gaveta.janela) gaveta.janela.close();
  });

  gaveta.lerTodos.addEventListener("click", () =>
    comCarregamento(gaveta.lerTodos, "Salvando…", async () => {
      try {
        await api.lerTodos();
        await sincronizar();
        transmitir();
        mostrarMensagem("Todos os avisos foram marcados como lidos.");
        gaveta.janela.querySelector("[data-fechar]").focus();
      } catch (erro) {
        mostrarMensagem(erro.message, { tipo: "erro" });
      }
    })
  );

  function atualizarContadores() {
    const n = estado.naoLidos;
    document.querySelectorAll("[data-contador-avisos]").forEach((contador) => {
      contador.hidden = n === 0;
      contador.textContent = n > 99 ? "99+" : String(n);
    });
    document.querySelectorAll("[data-abrir-avisos]").forEach((b) => {
      b.setAttribute("aria-label", n ? `Avisos, ${plural(n, "não lido", "não lidos")}` : "Avisos");
    });
    document.title = (n > 0 ? `(${n}) ` : "") + document.title.replace(/^\(\d+\)\s/, "");
  }

  /* ------------------------------------------------------------------ */
  /* Relógio da página                                                   */
  /* ------------------------------------------------------------------ */

  function avisarMinuto() {
    ouvintesMinuto.forEach((fn) => {
      try { fn(); } catch (erro) { console.error(erro); }
    });
    if (form.janela.open) {
      atualizarLimites();
      atualizarPrevia();
    }
  }

  function agendarMinuto() {
    const t = agora().getTime();
    setTimeout(() => {
      avisarMinuto();
      agendarMinuto();
    }, MINUTO - (t % MINUTO) + 50);
  }

  /* ------------------------------------------------------------------ */
  /* Início                                                              */
  /* ------------------------------------------------------------------ */

  function tratarEndereco() {
    const url = new URL(location.href);
    const id = Number(url.searchParams.get("compromisso")) || null;
    const novo = url.hash === "#novo" || url.searchParams.has("novo");

    if (id || novo) {
      url.searchParams.delete("compromisso");
      url.searchParams.delete("novo");
      history.replaceState(null, "", url.pathname + url.search);
    }

    S.idParaDestacar = id;
    if (novo) abrirFormulario();
  }

  document.addEventListener("click", (evento) => {
    const alvo = evento.target.closest("[data-novo-compromisso], [data-abrir-avisos], [data-fechar]");
    if (!alvo) return;
    if (alvo.matches("[data-novo-compromisso]")) abrirFormulario({ data: alvo.dataset.data || null });
    else if (alvo.matches("[data-abrir-avisos]")) abrirGaveta();
    else alvo.closest("dialog")?.close();
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (evento) => {
      const msg = evento.data || {};
      if (msg.tipo === "aviso-lido") sincronizar();
      if (msg.tipo === "abrir-compromisso" && msg.compromissoId) abrirCompromisso(msg.compromissoId);
    });
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    conferirPermissao();
    avisarMinuto();
    sincronizar();
  });
  window.addEventListener("focus", conferirPermissao);
  window.addEventListener("online", () => sincronizar());

  // A verificação periódica continua mesmo com a aba em segundo plano.
  setInterval(sincronizar, INTERVALO_SINCRONIA_MS);

  Object.assign(S, {
    CATEGORIAS,
    categoria,
    tipoDoFiltro,
    criar,
    icone,
    botao,
    plural,
    maiuscula,
    semAcentos,
    movimentoReduzido,
    renderizarPreservandoFoco,
    tempo: {
      agora,
      partes,
      hojeISO,
      horaAtual,
      instante,
      inicioDe,
      diasAte,
      somarDias,
      formatar,
      dataCurta,
      diaPorExtenso,
      quandoPorExtenso,
      momentoCurto,
      faltaPara,
      antecedenciaPorExtenso,
      aparelhoEmOutroFuso
    },
    estado,
    aoAtualizar,
    aoMinuto: (fn) => ouvintesMinuto.add(fn),
    aoSalvar: (fn) => ouvintesSalvar.add(fn),
    sincronizar,
    urlCalendario,
    statusDoLembrete,
    blocoData,
    seloCategoria,
    linha,
    vazio,
    abrirFormulario,
    excluirCompromisso,
    alternarNotificacao,
    abrirCompromisso,
    abrirAjuda,
    focarConteudo,
    mostrarMensagem,
    comCarregamento
  });

  tratarEndereco();
  renderizarEstadoNotificacoes();
  agendarMinuto();
  sincronizar();
})();
