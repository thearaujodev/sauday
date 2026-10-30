/* Sauday | Alpha 0.1: agenda, avisos e lembretes da página inicial. */
(() => {
  "use strict";

  const API = {
    compromissos: "/api/appointments",
    processar: "/api/reminders/process",
    avisos: "/api/notifications"
  };

  const CATEGORIAS = { consulta: "Consulta", exame: "Exame", vacina: "Vacina", outro: "Outro" };
  const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const INTERVALO_SINCRONIA_MS = 60 * 1000;
  const ATRASO_INDICADOR_MS = 250;     // só mostra "carregando" se a operação demorar
  const AVISOS_VISIVEIS = 5;
  const CHAVE_NOTIFICADOS = "sauday.avisosNotificados";

  const $ = (id) => document.getElementById(id);
  const el = {
    mensagem: $("mensagem"),
    mensagemTexto: $("mensagem-texto"),
    mensagemFechar: $("mensagem-fechar"),
    form: $("form-compromisso"),
    blocoForm: $("novo"),
    tituloForm: $("titulo-form"),
    salvar: $("btn-salvar"),
    cancelar: $("btn-cancelar"),
    lembreteSelect: $("reminder_minutes"),
    avisos: $("lista-avisos"),
    blocoAvisos: $("avisos"),
    lerTodos: $("btn-ler-todos"),
    maisAvisos: $("btn-mais-avisos"),
    contador: $("contador-avisos"),
    notificacoes: $("notificacoes"),
    notificacoesTexto: $("notificacoes-texto"),
    btnNotificacoes: $("btn-notificacoes"),
    proximos: $("lista-proximos"),
    passados: $("passados"),
    resumoPassados: $("resumo-passados"),
    listaPassados: $("lista-passados")
  };

  const estado = {
    compromissos: [],
    avisos: [],
    naoLidos: 0,
    idEmEdicao: null,
    mostrarTodosAvisos: false,
    sincronizando: false,
    carregou: false
  };

  let temporizadorMensagem = null;

  /* ------------------------------------------------------------------ */
  /* Utilidades                                                          */
  /* ------------------------------------------------------------------ */

  function criar(tag, classe, texto) {
    const no = document.createElement(tag);
    if (classe) no.className = classe;
    if (texto !== undefined && texto !== null) no.textContent = texto;
    return no;
  }

  function paraData(data, hora = "00:00") {
    const [ano, mes, dia] = data.split("-").map(Number);
    const [h, m] = hora.split(":").map(Number);
    return new Date(ano, mes - 1, dia, h, m);
  }

  function inicioDoDia(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function diasAte(d) {
    return Math.round((inicioDoDia(d) - inicioDoDia(new Date())) / 86400000);
  }

  function dataCurta(d) {
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  function horaCurta(d) {
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  function diaRelativo(d) {
    const dias = diasAte(d);
    if (dias === 0) return "Hoje";
    if (dias === 1) return "Amanhã";
    if (dias === -1) return "Ontem";
    return dataCurta(d);
  }

  function quandoPorExtenso(data, hora) {
    const d = paraData(data, hora);
    return `${diaRelativo(d)}, às ${hora}`;
  }

  function antecedenciaPorExtenso(minutos) {
    if (minutos % 10080 === 0) return minutos === 10080 ? "1 semana" : `${minutos / 10080} semanas`;
    if (minutos % 1440 === 0) return minutos === 1440 ? "1 dia" : `${minutos / 1440} dias`;
    if (minutos % 60 === 0) return minutos === 60 ? "1 hora" : `${minutos / 60} horas`;
    return `${minutos} minutos`;
  }

  /* ------------------------------------------------------------------ */
  /* Comunicação com a API                                               */
  /* ------------------------------------------------------------------ */

  async function requisitar(url, opcoes = {}) {
    let resposta;
    try {
      resposta = await fetch(url, {
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

  /* ------------------------------------------------------------------ */
  /* Feedback: mensagens e estados de carregamento                       */
  /* ------------------------------------------------------------------ */

  function mostrarMensagem(texto, tipo = "sucesso") {
    clearTimeout(temporizadorMensagem);
    el.mensagemTexto.textContent = texto;
    el.mensagem.classList.toggle("erro", tipo === "erro");
    el.mensagem.setAttribute("role", tipo === "erro" ? "alert" : "status");
    el.mensagem.hidden = false;

    if (tipo !== "erro") {
      temporizadorMensagem = setTimeout(esconderMensagem, 6000);
    }
  }

  function esconderMensagem() {
    clearTimeout(temporizadorMensagem);
    el.mensagem.hidden = true;
  }

  function indicadorCarregando() {
    const img = criar("img", "carregando-simbolo");
    img.src = window.SAUDAY.simbolo;
    img.alt = "";
    return img;
  }

  // Desabilita o botão na hora (evita envio duplicado) e só troca o rótulo
  // por "carregando" se a operação passar de ATRASO_INDICADOR_MS.
  async function comCarregamento(botao, textoCarregando, acao) {
    if (botao.disabled) return undefined;

    // O rótulo fica em data-rotulo para que a ação possa trocá-lo (ex.: sair
    // do modo de edição) sem o finally devolver o texto antigo.
    if (botao.dataset.rotulo === undefined) botao.dataset.rotulo = botao.textContent.trim();
    botao.disabled = true;
    botao.setAttribute("aria-busy", "true");

    const temporizador = setTimeout(() => {
      botao.replaceChildren(indicadorCarregando(), document.createTextNode(textoCarregando));
    }, ATRASO_INDICADOR_MS);

    try {
      return await acao();
    } finally {
      clearTimeout(temporizador);
      if (botao.isConnected) {
        botao.textContent = botao.dataset.rotulo;
        botao.disabled = false;
        botao.removeAttribute("aria-busy");
      }
    }
  }

  function definirRotulo(botao, texto) {
    botao.dataset.rotulo = texto;
    if (!botao.disabled) botao.textContent = texto;
  }

  function mostrarFalha(lista, texto) {
    lista.setAttribute("aria-busy", "false");
    const item = criar("li", "falha");
    item.append(criar("p", null, texto));
    const tentar = criar("button", "btn btn-secundario btn-pequeno", "Tentar novamente");
    tentar.type = "button";
    tentar.addEventListener("click", () => comCarregamento(tentar, "Carregando…", () => sincronizar({ manual: true })));
    item.append(tentar);
    lista.replaceChildren(item);
  }

  /* ------------------------------------------------------------------ */
  /* Agenda                                                              */
  /* ------------------------------------------------------------------ */

  function statusDoLembrete(c) {
    const quando = paraData(c.date, c.time);
    const agora = new Date();

    if (quando <= agora) return { classe: "passado", texto: "Data já passou" };
    if (c.reminded_at) return { classe: "enviado", texto: "Lembrete enviado" };

    const momento = new Date(quando.getTime() - c.reminder_minutes * 60000);
    if (momento <= agora) return { classe: "janela", texto: "Lembrete sendo preparado" };

    return {
      classe: "agendado",
      texto: `Lembrete ${diaRelativo(momento).toLowerCase().replace(/^(\d)/, "em $1")} às ${horaCurta(momento)}`
    };
  }

  function itemCompromisso(c) {
    const quando = paraData(c.date, c.time);
    const item = criar("li", "compromisso");
    if (diasAte(quando) === 0) item.classList.add("hoje");

    const data = criar("div", "data");
    data.setAttribute("aria-hidden", "true");
    data.append(criar("span", "data-dia", String(quando.getDate())), criar("span", "data-mes", MESES[quando.getMonth()]));

    const cabecalho = criar("div", "compromisso-cabecalho");
    cabecalho.append(
      criar("span", "compromisso-titulo", c.title),
      criar("span", "categoria", CATEGORIAS[c.type] || c.type)
    );

    const quandoTexto = criar("p", "compromisso-quando");
    const dias = diasAte(quando);
    const rotulo = dias === 0 ? "Hoje" : dias === 1 ? "Amanhã" : quando.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
    quandoTexto.textContent = `${rotulo.charAt(0).toUpperCase() + rotulo.slice(1)}, às ${c.time}`;

    const corpo = criar("div", "compromisso-corpo");
    corpo.append(cabecalho, quandoTexto);

    if (c.location) corpo.append(criar("p", "compromisso-local", c.location));
    if (c.notes) corpo.append(criar("p", "compromisso-notas", c.notes));

    const status = statusDoLembrete(c);
    const lembrete = criar("p", `lembrete ${status.classe}`, status.texto);
    if (status.classe === "agendado") lembrete.title = `Antecedência: ${antecedenciaPorExtenso(c.reminder_minutes)}`;
    corpo.append(lembrete);

    const acoes = criar("div", "compromisso-acoes");
    const editar = criar("button", "btn-texto", "Editar");
    editar.type = "button";
    editar.setAttribute("aria-label", `Editar ${c.title}`);
    editar.addEventListener("click", () => iniciarEdicao(c));

    const excluir = criar("button", "btn-texto btn-perigo", "Excluir");
    excluir.type = "button";
    excluir.setAttribute("aria-label", `Excluir ${c.title}`);
    excluir.addEventListener("click", () => excluirCompromisso(c, excluir));

    acoes.append(editar, excluir);
    corpo.append(acoes);
    item.append(data, corpo);

    return item;
  }

  function renderizarAgenda() {
    const agora = new Date();
    const ordenar = (a, b) => paraData(a.date, a.time) - paraData(b.date, b.time);

    const proximos = estado.compromissos.filter((c) => paraData(c.date, c.time) > agora).sort(ordenar);
    const passados = estado.compromissos.filter((c) => paraData(c.date, c.time) <= agora).sort((a, b) => ordenar(b, a));

    el.proximos.setAttribute("aria-busy", "false");

    if (proximos.length === 0) {
      const vazio = criar("li", "vazio",
        estado.compromissos.length === 0
          ? "Você ainda não tem compromissos. Cadastre o primeiro no formulário."
          : "Nenhum compromisso futuro. Cadastre o próximo no formulário.");
      el.proximos.replaceChildren(vazio);
    } else {
      el.proximos.replaceChildren(...proximos.map(itemCompromisso));
    }

    el.passados.hidden = passados.length === 0;
    el.resumoPassados.textContent = passados.length === 1 ? "1 compromisso anterior" : `${passados.length} compromissos anteriores`;
    el.listaPassados.replaceChildren(...passados.map(itemCompromisso));
  }

  /* ------------------------------------------------------------------ */
  /* Avisos                                                              */
  /* ------------------------------------------------------------------ */

  function itemAviso(a) {
    const lido = Boolean(a.read_at);
    const item = criar("li", `aviso ${lido ? "lido" : "nao-lido"}`);

    const titulo = criar("p", "aviso-titulo", `${CATEGORIAS[a.type] || a.type}: ${a.title}`);
    if (!lido) titulo.append(criar("span", "selo-novo", "Novo"));

    const detalhe = criar("p", "aviso-detalhe", quandoPorExtenso(a.date, a.time) + (a.location ? `, em ${a.location}` : ""));
    const gerado = paraData(a.created_at.slice(0, 10), a.created_at.slice(11, 16));
    const registro = criar("p", "aviso-registro", `Aviso gerado ${diaRelativo(gerado).toLowerCase().replace(/^(\d)/, "em $1")} às ${horaCurta(gerado)}`);

    item.append(titulo, detalhe, registro);

    if (!lido) {
      const ler = criar("button", "btn-texto aviso-acao", "Marcar como lido");
      ler.type = "button";
      ler.setAttribute("aria-label", `Marcar como lido o aviso de ${a.title}`);
      ler.addEventListener("click", () =>
        comCarregamento(ler, "Salvando…", async () => {
          try {
            await requisitar(`${API.avisos}/${a.id}/read`, { method: "POST" });
            await carregarAvisos();
          } catch (erro) {
            mostrarMensagem(erro.message, "erro");
          }
        })
      );
      item.append(ler);
    }

    return item;
  }

  function renderizarAvisos() {
    el.avisos.setAttribute("aria-busy", "false");

    if (estado.avisos.length === 0) {
      el.avisos.replaceChildren(criar("li", "vazio", "Nenhum aviso por enquanto. Quando um compromisso estiver chegando, o aviso aparece aqui."));
    } else {
      const visiveis = estado.mostrarTodosAvisos ? estado.avisos : estado.avisos.slice(0, AVISOS_VISIVEIS);
      el.avisos.replaceChildren(...visiveis.map(itemAviso));
    }

    const ocultos = estado.avisos.length - AVISOS_VISIVEIS;
    el.maisAvisos.hidden = ocultos <= 0;
    el.maisAvisos.textContent = estado.mostrarTodosAvisos ? "Mostrar menos" : `Mostrar todos os avisos (${estado.avisos.length})`;

    el.lerTodos.hidden = estado.naoLidos === 0;

    el.contador.hidden = estado.naoLidos === 0;
    el.contador.textContent = String(estado.naoLidos);
    el.contador.setAttribute("aria-label", estado.naoLidos === 1 ? "1 aviso não lido" : `${estado.naoLidos} avisos não lidos`);

    document.title = (estado.naoLidos > 0 ? `(${estado.naoLidos}) ` : "") + document.title.replace(/^\(\d+\)\s/, "");
  }

  async function carregarAvisos() {
    const dados = await requisitar(API.avisos);
    estado.avisos = dados.notifications;
    estado.naoLidos = dados.unread;
    renderizarAvisos();
    notificarNoNavegador();
  }

  /* ------------------------------------------------------------------ */
  /* Notificações do navegador (enquanto a página estiver aberta)       */
  /* ------------------------------------------------------------------ */

  function suportaNotificacoes() {
    return "Notification" in window && window.isSecureContext;
  }

  function lerNotificados() {
    try {
      return new Set(JSON.parse(localStorage.getItem(CHAVE_NOTIFICADOS) || "[]"));
    } catch {
      return new Set();
    }
  }

  const notificadosNestaSessao = lerNotificados();

  function salvarNotificados() {
    try {
      localStorage.setItem(CHAVE_NOTIFICADOS, JSON.stringify(Array.from(notificadosNestaSessao).slice(-200)));
    } catch {
      /* Armazenamento indisponível: o controle continua só nesta aba. */
    }
  }

  function notificarNoNavegador() {
    if (!suportaNotificacoes() || Notification.permission !== "granted") return;

    const pendentes = estado.avisos.filter((a) => !a.read_at && !notificadosNestaSessao.has(a.id)).slice(0, 3);

    pendentes.forEach((a) => {
      try {
        const n = new Notification(`Lembrete: ${a.title}`, {
          body: quandoPorExtenso(a.date, a.time) + (a.location ? `, em ${a.location}` : ""),
          icon: window.SAUDAY.icone,
          tag: `sauday-aviso-${a.id}`
        });
        n.addEventListener("click", () => {
          window.focus();
          el.blocoAvisos.scrollIntoView();
          el.blocoAvisos.focus({ preventScroll: true });
          n.close();
        });
      } catch {
        /* Alguns navegadores móveis só permitem notificações via service worker. */
      }
      notificadosNestaSessao.add(a.id);
    });

    if (pendentes.length) salvarNotificados();
  }

  function atualizarPainelNotificacoes() {
    el.notificacoes.hidden = false;
    el.btnNotificacoes.hidden = true;

    if (!("Notification" in window)) {
      el.notificacoesTexto.textContent = "Este navegador não oferece notificações. Os avisos continuam aparecendo aqui.";
      return;
    }
    if (!window.isSecureContext) {
      el.notificacoesTexto.textContent = "Notificações do navegador só funcionam em conexão segura (https) ou acessando pelo endereço 127.0.0.1. Os avisos continuam aparecendo aqui.";
      return;
    }

    switch (Notification.permission) {
      case "granted":
        el.notificacoesTexto.textContent = "Notificações do navegador ativadas. Elas aparecem enquanto o Sauday estiver aberto em uma aba.";
        break;
      case "denied":
        el.notificacoesTexto.textContent = "As notificações estão bloqueadas para este site. Para ativar, libere-as nas configurações do navegador.";
        break;
      default:
        el.notificacoesTexto.textContent = "Receba os avisos também como notificação do navegador enquanto o Sauday estiver aberto.";
        el.btnNotificacoes.hidden = false;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Sincronização: verifica lembretes e recarrega os dados             */
  /* ------------------------------------------------------------------ */

  async function sincronizar({ manual = false } = {}) {
    if (estado.sincronizando && !manual) return;
    estado.sincronizando = true;

    try {
      // O site também verifica os lembretes, então os avisos aparecem mesmo
      // sem o serviço em segundo plano rodando.
      await requisitar(API.processar, { method: "POST" });

      const [compromissos] = await Promise.all([requisitar(API.compromissos), carregarAvisos()]);
      estado.compromissos = compromissos;
      renderizarAgenda();
      estado.carregou = true;
    } catch (erro) {
      if (!estado.carregou) {
        mostrarFalha(el.proximos, erro.message);
        mostrarFalha(el.avisos, "Não foi possível carregar os avisos.");
      } else if (manual) {
        mostrarMensagem(erro.message, "erro");
      }
    } finally {
      estado.sincronizando = false;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Formulário: cadastro e edição                                       */
  /* ------------------------------------------------------------------ */

  function marcarErro(campo, texto) {
    const entrada = el.form.elements[campo];
    const saida = $(`erro-${campo}`);
    entrada.setAttribute("aria-invalid", texto ? "true" : "false");
    if (saida) {
      saida.textContent = texto || "";
      saida.hidden = !texto;
    }
  }

  function validarFormulario() {
    const f = el.form.elements;
    const erros = {
      title: f.title.value.trim() ? "" : "Informe um título para o compromisso.",
      date: f.date.value ? "" : "Escolha a data.",
      time: f.time.value ? "" : "Escolha o horário."
    };

    Object.entries(erros).forEach(([campo, texto]) => marcarErro(campo, texto));

    const primeiro = Object.keys(erros).find((campo) => erros[campo]);
    if (primeiro) f[primeiro].focus();
    return !primeiro;
  }

  function dadosDoFormulario() {
    const f = el.form.elements;
    return {
      title: f.title.value.trim(),
      type: f.type.value,
      date: f.date.value,
      time: f.time.value,
      location: f.location.value.trim() || null,
      notes: f.notes.value.trim() || null,
      reminder_minutes: Number(f.reminder_minutes.value)
    };
  }

  function garantirOpcaoDeLembrete(minutos) {
    const valor = String(minutos);
    if (!Array.from(el.lembreteSelect.options).some((o) => o.value === valor)) {
      const opcao = new Option(antecedenciaPorExtenso(minutos), valor);
      opcao.dataset.extra = "true";
      el.lembreteSelect.add(opcao);
    }
    el.lembreteSelect.value = valor;
  }

  function iniciarEdicao(c) {
    estado.idEmEdicao = c.id;
    const f = el.form.elements;
    f.title.value = c.title;
    if (!CATEGORIAS[c.type]) f.type.add(new Option(c.type, c.type));
    f.type.value = c.type;
    f.date.value = c.date;
    f.time.value = c.time;
    f.location.value = c.location || "";
    f.notes.value = c.notes || "";
    garantirOpcaoDeLembrete(c.reminder_minutes);
    ["title", "date", "time"].forEach((campo) => marcarErro(campo, ""));

    el.tituloForm.textContent = "Editar compromisso";
    definirRotulo(el.salvar, "Salvar alterações");
    el.cancelar.hidden = false;
    el.blocoForm.classList.add("editando");
    el.blocoForm.scrollIntoView({ block: "start" });
    f.title.focus({ preventScroll: true });
  }

  function sairDaEdicao() {
    estado.idEmEdicao = null;
    el.form.reset();
    Array.from(el.lembreteSelect.options).filter((o) => o.dataset.extra).forEach((o) => o.remove());
    Array.from(el.form.elements.type.options).filter((o) => !CATEGORIAS[o.value]).forEach((o) => o.remove());
    ["title", "date", "time"].forEach((campo) => marcarErro(campo, ""));
    el.tituloForm.textContent = "Novo compromisso";
    definirRotulo(el.salvar, "Salvar compromisso");
    el.cancelar.hidden = true;
    el.blocoForm.classList.remove("editando");
  }

  el.form.addEventListener("submit", (evento) => {
    evento.preventDefault();
    if (!validarFormulario()) return;

    const editando = estado.idEmEdicao !== null;
    const corpo = dadosDoFormulario();

    comCarregamento(el.salvar, editando ? "Salvando alterações…" : "Salvando…", async () => {
      try {
        await requisitar(editando ? `${API.compromissos}/${estado.idEmEdicao}` : API.compromissos, {
          method: editando ? "PUT" : "POST",
          body: JSON.stringify(corpo)
        });
        sairDaEdicao();
        await sincronizar({ manual: true });
        mostrarMensagem(editando ? "Alterações salvas." : "Compromisso salvo. Você será avisado com a antecedência escolhida.");
      } catch (erro) {
        mostrarMensagem(erro.message, "erro");
      }
    });
  });

  el.cancelar.addEventListener("click", () => {
    sairDaEdicao();
    el.form.elements.title.focus();
  });

  async function excluirCompromisso(c, botao) {
    if (!window.confirm(`Excluir "${c.title}"? Os avisos desse compromisso também serão removidos.`)) return;

    await comCarregamento(botao, "Excluindo…", async () => {
      try {
        await requisitar(`${API.compromissos}/${c.id}`, { method: "DELETE" });
        if (estado.idEmEdicao === c.id) sairDaEdicao();
        await sincronizar({ manual: true });
        mostrarMensagem("Compromisso excluído.");
        $("titulo-agenda").focus();
      } catch (erro) {
        mostrarMensagem(erro.message, "erro");
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Demais eventos                                                      */
  /* ------------------------------------------------------------------ */

  el.mensagemFechar.addEventListener("click", esconderMensagem);

  el.lerTodos.addEventListener("click", () =>
    comCarregamento(el.lerTodos, "Salvando…", async () => {
      try {
        await requisitar(`${API.avisos}/read-all`, { method: "POST" });
        await carregarAvisos();
        mostrarMensagem("Todos os avisos foram marcados como lidos.");
      } catch (erro) {
        mostrarMensagem(erro.message, "erro");
      }
    })
  );

  el.maisAvisos.addEventListener("click", () => {
    estado.mostrarTodosAvisos = !estado.mostrarTodosAvisos;
    renderizarAvisos();
  });

  el.btnNotificacoes.addEventListener("click", async () => {
    try {
      await Notification.requestPermission();
    } catch {
      /* Navegadores antigos usam callback; o estado é relido abaixo. */
    }
    atualizarPainelNotificacoes();
    notificarNoNavegador();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") sincronizar();
  });

  setInterval(() => {
    if (document.visibilityState === "visible") sincronizar();
  }, INTERVALO_SINCRONIA_MS);

  atualizarPainelNotificacoes();
  sincronizar();
})();
