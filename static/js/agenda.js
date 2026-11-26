/* Sauday 1.0 | Página Agenda: saudação com o relógio de Brasília, próximo
   compromisso, faixa de dias, filtros e a lista de próximos compromissos,
   cada um com a sua notificação. */
(() => {
  "use strict";

  const S = window.Sauday;
  if (!S || document.body.dataset.pagina !== "inicio") return;

  const { criar, icone, botao, tempo, categoria, CATEGORIAS, plural, maiuscula } = S;
  const $ = (id) => document.getElementById(id);

  const DIAS_NA_FAIXA = 14;

  const el = {
    saudacao: $("hero-saudacao"),
    data: $("hero-data"),
    hora: $("hero-hora"),
    resumo: $("hero-resumo"),
    fuso: $("hero-fuso"),
    destaque: $("destaque"),
    destaqueConteudo: $("destaque-conteudo"),
    secao: document.querySelector(".secao-lista"),
    titulo: $("titulo-agenda"),
    subtitulo: $("subtitulo-agenda"),
    faixa: $("faixa-dias"),
    filtros: $("filtros"),
    lista: $("lista-agenda")
  };

  const filtro = { categoria: "todos", dia: null };
  let assinatura = "";
  let destacouDoEndereco = false;

  /* ------------------------------------------------------------------ */
  /* Dados                                                               */
  /* ------------------------------------------------------------------ */

  function proximos() {
    const t = tempo.agora().getTime();
    return S.estado.compromissos
      .filter((c) => tempo.inicioDe(c) > t)
      .sort((a, b) => tempo.inicioDe(a) - tempo.inicioDe(b) || a.id - b.id);
  }

  const daCategoria = (lista) =>
    filtro.categoria === "todos" ? lista : lista.filter((c) => S.tipoDoFiltro(c.type) === filtro.categoria);
  const doDia = (lista) => (filtro.dia ? lista.filter((c) => c.date === filtro.dia) : lista);

  /* ------------------------------------------------------------------ */
  /* Abertura: saudação, relógio e resumo                                */
  /* ------------------------------------------------------------------ */

  function renderizarRelogio() {
    const hora = tempo.partes(tempo.agora()).hora;
    el.saudacao.textContent = hora >= 5 && hora < 12 ? "Bom dia!" : hora >= 12 && hora < 18 ? "Boa tarde!" : "Boa noite!";
    el.data.textContent = maiuscula(tempo.formatar.completa(tempo.hojeISO()));
    el.hora.textContent = tempo.horaAtual();
    el.hora.dateTime = `${tempo.hojeISO()}T${tempo.horaAtual()}-03:00`;

    const outroFuso = tempo.aparelhoEmOutroFuso();
    el.fuso.hidden = !outroFuso;
    if (outroFuso) {
      el.fuso.textContent = "Seu aparelho está em outro fuso horário. No Sauday, todos os horários seguem Brasília.";
    }
  }

  function renderizarResumo(lista) {
    if (!S.estado.carregou) {
      el.resumo.textContent = S.estado.erro ? "Não foi possível carregar seus compromissos." : "Carregando seus compromissos…";
      return;
    }

    const hoje = lista.filter((c) => tempo.diasAte(c.date) === 0).length;
    const semana = lista.filter((c) => tempo.diasAte(c.date) < 7).length;

    if (!lista.length) {
      el.resumo.textContent = "Nenhum compromisso pela frente. Que tal agendar o próximo cuidado?";
    } else if (hoje) {
      const resto = semana - hoje;
      el.resumo.textContent = `Você tem ${plural(hoje, "compromisso", "compromissos")} hoje${resto ? ` e mais ${resto} nos próximos 7 dias` : ""}.`;
    } else if (semana) {
      el.resumo.textContent = `Você tem ${plural(semana, "compromisso", "compromissos")} nos próximos 7 dias.`;
    } else {
      el.resumo.textContent = `Semana livre. O próximo compromisso é ${tempo.faltaPara(lista[0].date, lista[0].time)}.`;
    }
  }

  function renderizarDestaque(lista) {
    el.destaque.setAttribute("aria-busy", String(!S.estado.carregou));
    if (!S.estado.carregou) return;

    const c = lista[0];

    if (!c) {
      const novo = botao("btn btn-primario", "Novo compromisso", { icone: "mais" });
      novo.dataset.novoCompromisso = "";
      novo.setAttribute("aria-haspopup", "dialog");
      const caixa = criar("div", "destaque-vazio");
      caixa.append(
        criar("p", "destaque-titulo", "Agenda livre"),
        criar("p", "destaque-texto", "Cadastre a próxima consulta, exame ou vacina e deixe o lembrete com o Sauday."),
        novo
      );
      el.destaqueConteudo.replaceChildren(caixa);
      return;
    }

    const cabecalho = criar("div", "destaque-cabecalho");
    const contagem = criar("span", "destaque-contagem");
    contagem.dataset.ateData = c.date;
    contagem.dataset.ateHora = c.time;
    contagem.append(icone("ampulheta"), criar("span", "contagem-texto", maiuscula(tempo.faltaPara(c.date, c.time))));
    cabecalho.append(S.seloCategoria(c.type), contagem);

    const conteudo = [
      cabecalho,
      criar("p", "destaque-titulo", c.title),
      S.linha("relogio", tempo.quandoPorExtenso(c.date, c.time), "destaque-quando")
    ];
    if (c.location) conteudo.push(S.linha("local", c.location));

    const st = S.statusDoLembrete(c);
    conteudo.push(S.linha(st.icone, st.texto, `lembrete-status ${st.classe}`));

    const acoes = criar("div", "destaque-acoes");
    acoes.append(botao("btn btn-secundario btn-pequeno", "Ver na lista", {
      icone: "seta",
      rotulo: `Ver na lista: ${c.title}`,
      foco: "destaque-ver",
      aoClicar: () => destacar(c.id)
    }));
    const calendario = criar("a", "btn-texto btn-pequeno");
    calendario.href = S.urlCalendario(c);
    calendario.setAttribute("download", "");
    calendario.append(icone("calendario-mais"), criar("span", "rotulo", "Calendário"));
    calendario.setAttribute("aria-label", `Calendário: adicionar ${c.title} à agenda do celular ou do computador`);
    acoes.append(calendario);
    conteudo.push(acoes);

    S.renderizarPreservandoFoco(el.destaque, () => el.destaqueConteudo.replaceChildren(...conteudo));
  }

  /* ------------------------------------------------------------------ */
  /* Faixa de dias e filtros                                             */
  /* ------------------------------------------------------------------ */

  function renderizarFaixa(lista) {
    const hoje = tempo.hojeISO();
    const porDia = new Map();
    daCategoria(lista).forEach((c) => porDia.set(c.date, (porDia.get(c.date) || 0) + 1));

    const dias = [];
    for (let i = 0; i < DIAS_NA_FAIXA; i += 1) {
      const data = tempo.somarDias(hoje, i);
      const n = porDia.get(data) || 0;
      const dia = criar("button", `dia${i === 0 ? " hoje" : ""}${n ? "" : " livre"}`);
      dia.type = "button";
      dia.dataset.foco = `dia-${data}`;
      dia.setAttribute("aria-pressed", String(filtro.dia === data));
      dia.setAttribute("aria-label",
        `${i === 0 ? "Hoje, " : ""}${tempo.formatar.completa(data)}: ${n ? plural(n, "compromisso", "compromissos") : "nenhum compromisso"}`);

      const marcas = criar("span", "dia-marcas");
      marcas.setAttribute("aria-hidden", "true");
      for (let j = 0; j < Math.min(n, 3); j += 1) marcas.append(criar("span"));

      dia.append(
        criar("span", "dia-semana", i === 0 ? "hoje" : tempo.formatar.semanaCurta(data)),
        criar("span", "dia-numero", String(Number(data.slice(8, 10)))),
        marcas
      );
      dia.addEventListener("click", () => {
        filtro.dia = filtro.dia === data ? null : data;
        renderizar({ forcar: true });
      });
      dias.push(dia);
    }

    el.faixa.replaceChildren(...dias);
  }

  function chip(valor, texto, quantidade, nomeIcone) {
    const b = botao("chip", null, { foco: `filtro-${valor}` });
    if (nomeIcone) b.append(icone(nomeIcone));
    b.append(criar("span", null, texto), criar("span", "chip-contagem", String(quantidade)));
    b.setAttribute("aria-pressed", String(filtro.categoria === valor));
    b.addEventListener("click", () => {
      filtro.categoria = valor;
      renderizar({ forcar: true });
    });
    return b;
  }

  function renderizarFiltros(lista) {
    const base = doDia(lista);
    const contagem = { todos: base.length };
    base.forEach((c) => {
      const tipo = S.tipoDoFiltro(c.type);
      contagem[tipo] = (contagem[tipo] || 0) + 1;
    });

    const chips = [chip("todos", "Todos", contagem.todos)];
    Object.entries(CATEGORIAS).forEach(([valor, cat]) => {
      if (contagem[valor] || filtro.categoria === valor) chips.push(chip(valor, cat.plural, contagem[valor] || 0, cat.icone));
    });

    if (filtro.dia) {
      const limpar = botao("chip chip-dia", null, {
        icone: "fechar",
        foco: "filtro-dia",
        rotulo: `Remover filtro do dia ${tempo.dataCurta(filtro.dia)}`,
        aoClicar: () => {
          filtro.dia = null;
          renderizar({ forcar: true });
          el.titulo.focus();
        }
      });
      limpar.prepend(criar("span", null, `${maiuscula(tempo.formatar.semanaCurta(filtro.dia))}, ${tempo.dataCurta(filtro.dia)}`));
      chips.push(limpar);
    }

    el.filtros.replaceChildren(...chips);
  }

  /* ------------------------------------------------------------------ */
  /* Lista                                                               */
  /* ------------------------------------------------------------------ */

  function grupoDe(c) {
    const dias = tempo.diasAte(c.date);
    if (dias === 0) return ["hoje", "Hoje"];
    if (dias === 1) return ["amanha", "Amanhã"];
    if (dias < 7) return ["semana", "Nos próximos 7 dias"];
    return [c.date.slice(0, 7), maiuscula(tempo.formatar.mesAno(c.date))];
  }

  function cartao(c) {
    const dias = tempo.diasAte(c.date);
    const minutosParaComecar = (tempo.inicioDe(c) - tempo.agora().getTime()) / 60000;

    const item = criar("li", "cartao");
    item.id = `compromisso-${c.id}`;
    item.tabIndex = -1;
    item.setAttribute("aria-labelledby", `titulo-${c.id}`);
    if (dias === 0) item.classList.add("hoje");

    const titulo = criar("h4", "cartao-titulo", c.title);
    titulo.id = `titulo-${c.id}`;
    const cabecalho = criar("div", "cartao-cabecalho");
    cabecalho.append(titulo, S.seloCategoria(c.type));

    const quando = S.linha("relogio", tempo.quandoPorExtenso(c.date, c.time), "cartao-quando");
    const falta = criar("span", `contagem${minutosParaComecar <= 120 ? " urgente" : ""}`, tempo.faltaPara(c.date, c.time));
    falta.dataset.ateData = c.date;
    falta.dataset.ateHora = c.time;
    quando.lastElementChild.append(" ", falta); // dentro do texto: quebra de linha natural

    const corpo = criar("div", "cartao-corpo");
    corpo.append(cabecalho, quando);
    if (c.location) corpo.append(S.linha("local", c.location));
    if (c.notes) corpo.append(S.linha("nota", c.notes, "cartao-notas"));

    // Notificação junto do compromisso: liga e desliga ali mesmo.
    const st = S.statusDoLembrete(c);
    const alternar = criar("button", "alternar");
    alternar.type = "button";
    alternar.setAttribute("role", "switch");
    alternar.setAttribute("aria-checked", String(Boolean(c.notify)));
    alternar.setAttribute("aria-label", `Notificar ${c.title}`);
    alternar.setAttribute("aria-describedby", `status-${c.id}`);
    alternar.dataset.foco = `notificar-${c.id}`;
    const trilho = criar("span", "alternar-trilho");
    trilho.setAttribute("aria-hidden", "true");
    alternar.append(trilho, criar("span", "alternar-texto", "Notificar"));
    alternar.addEventListener("click", () => S.alternarNotificacao(c, !c.notify));

    // O status do aviso fica no corpo; o rodapé guarda só o interruptor e as ações.
    const status = criar("p", `cartao-linha lembrete-status ${st.classe}`);
    status.id = `status-${c.id}`;
    const statusTexto = criar("span", null, st.texto);
    if (st.antecedencia) statusTexto.append(criar("span", "lembrete-antecedencia", ` · ${st.antecedencia}`));
    status.append(icone(st.icone), statusTexto);
    corpo.append(status);

    const calendario = criar("a", "btn-texto btn-pequeno");
    calendario.href = S.urlCalendario(c);
    calendario.setAttribute("download", "");
    calendario.dataset.foco = `calendario-${c.id}`;
    calendario.setAttribute("aria-label", `Calendário: adicionar ${c.title} à agenda do celular ou do computador`);
    calendario.title = "Adicionar à agenda do celular ou do computador";
    calendario.append(icone("calendario-mais"), criar("span", "rotulo", "Calendário"));

    const acoes = criar("div", "cartao-acoes");
    acoes.append(
      calendario,
      botao("btn-texto btn-pequeno", "Editar", {
        icone: "editar",
        rotulo: `Editar ${c.title}`,
        foco: `editar-${c.id}`,
        aoClicar: () => S.abrirFormulario({ modo: "editar", compromisso: c })
      }),
      botao("btn-texto btn-pequeno perigo", "Excluir", {
        icone: "excluir",
        rotulo: `Excluir ${c.title}`,
        foco: `excluir-${c.id}`,
        aoClicar: async () => {
          if (await S.excluirCompromisso(c)) el.titulo.focus();
        }
      })
    );

    const rodape = criar("div", "cartao-rodape");
    rodape.append(alternar, acoes);

    item.append(S.blocoData(c.date), corpo, rodape);
    return item;
  }

  function grupos(lista) {
    const secoes = [];
    let atual = null;

    lista.forEach((c) => {
      const [chave, titulo] = grupoDe(c);
      if (!atual || atual.chave !== chave) {
        const secao = criar("section", "grupo");
        const cabecalho = criar("h3", "grupo-titulo");
        cabecalho.id = `grupo-${chave}`;
        secao.setAttribute("aria-labelledby", cabecalho.id);
        const quantidade = criar("span", "grupo-contagem");
        cabecalho.append(criar("span", null, titulo), quantidade);
        const ul = criar("ul", "cartoes");
        secao.append(cabecalho, ul);
        atual = { chave, ul, quantidade, n: 0 };
        secoes.push(secao);
      }
      atual.ul.append(cartao(c));
      atual.n += 1;
      atual.quantidade.replaceChildren(String(atual.n), criar("span", "sr-only", atual.n === 1 ? " compromisso" : " compromissos"));
    });

    return secoes;
  }

  function limparFiltros() {
    filtro.categoria = "todos";
    filtro.dia = null;
    renderizar({ forcar: true });
    el.titulo.focus();
  }

  function renderizarLista(lista) {
    el.lista.setAttribute("aria-busy", "false");

    if (!S.estado.carregou) {
      const tentar = botao("btn btn-secundario btn-pequeno", "Tentar novamente", {
        aoClicar: (evento) => S.comCarregamento(evento.currentTarget, "Carregando…", S.sincronizar)
      });
      const falha = criar("div", "falha");
      falha.append(criar("p", null, S.estado.erro.message), tentar);
      el.lista.replaceChildren(falha);
      return;
    }

    const novo = (texto, data) => {
      const b = botao("btn btn-primario", texto, { icone: "mais" });
      b.dataset.novoCompromisso = "";
      b.setAttribute("aria-haspopup", "dialog");
      if (data) b.dataset.data = data;
      return b;
    };

    const filtrados = doDia(daCategoria(lista));

    if (!S.estado.compromissos.length) {
      el.lista.replaceChildren(S.vazio({
        titulo: "Sua agenda está livre",
        texto: "Cadastre a primeira consulta, exame ou vacina. O Sauday avisa você antes de cada uma.",
        acoes: [novo("Novo compromisso")]
      }));
    } else if (!lista.length) {
      const historico = criar("a", "btn btn-secundario", "Ver histórico");
      historico.href = "/historico";
      el.lista.replaceChildren(S.vazio({
        titulo: "Nenhum compromisso pela frente",
        texto: "Os que já passaram estão guardados no histórico. Que tal agendar o próximo cuidado?",
        acoes: [novo("Novo compromisso"), historico]
      }));
    } else if (!filtrados.length) {
      const limpar = botao("btn btn-secundario", "Limpar filtros", { aoClicar: limparFiltros });
      const nome = filtro.categoria === "todos" ? "compromisso" : CATEGORIAS[filtro.categoria].nome.toLowerCase();
      el.lista.replaceChildren(filtro.dia
        ? S.vazio({
          titulo: `Nada marcado para ${tempo.diaPorExtenso(filtro.dia)}`,
          texto: filtro.categoria === "todos" ? "Este dia está livre na sua agenda." : `Nenhum(a) ${nome} neste dia.`,
          acoes: [novo("Agendar para este dia", filtro.dia), limpar]
        })
        : S.vazio({
          titulo: "Nenhum resultado",
          texto: `Não há ${nome} entre os próximos compromissos.`,
          acoes: [limpar]
        }));
    } else {
      el.lista.replaceChildren(...grupos(filtrados));
    }
  }

  function renderizarCabecalhoDaLista(lista) {
    const temFiltro = filtro.dia || filtro.categoria !== "todos";
    el.faixa.hidden = !lista.length;
    el.filtros.hidden = !lista.length;

    if (filtro.dia) {
      el.subtitulo.textContent = `Mostrando ${tempo.diaPorExtenso(filtro.dia)}. Toque no dia de novo para ver todos.`;
    } else if (temFiltro) {
      el.subtitulo.textContent = `Mostrando só ${CATEGORIAS[filtro.categoria].plural.toLowerCase()}.`;
    } else {
      el.subtitulo.textContent = lista.length
        ? `${plural(lista.length, "compromisso marcado", "compromissos marcados")}, do mais próximo ao mais distante.`
        : "Organizados por dia, do mais próximo ao mais distante.";
    }
  }

  /* ------------------------------------------------------------------ */
  /* Desenho geral                                                       */
  /* ------------------------------------------------------------------ */

  function renderizar({ forcar = false } = {}) {
    renderizarRelogio();

    const lista = proximos();
    const t = tempo.agora().getTime();
    const urgentes = lista.filter((c) => tempo.inicioDe(c) - t <= 2 * 60 * 60 * 1000).length;
    const novaAssinatura = JSON.stringify([
      S.estado.carregou, S.estado.compromissos, filtro, tempo.hojeISO(), lista.map((c) => c.id), urgentes
    ]);

    // Só redesenha tudo quando algo mudou; senão, atualiza as contagens.
    if (!forcar && novaAssinatura === assinatura) {
      atualizarContagens();
      return;
    }
    assinatura = novaAssinatura;

    if (filtro.categoria !== "todos" && !lista.some((c) => S.tipoDoFiltro(c.type) === filtro.categoria)) {
      filtro.categoria = "todos";
    }

    renderizarResumo(lista);
    renderizarDestaque(lista);

    if (!S.estado.carregou && !S.estado.erro) return;

    S.renderizarPreservandoFoco(el.secao, () => {
      renderizarCabecalhoDaLista(lista);
      renderizarFaixa(lista);
      renderizarFiltros(lista);
      renderizarLista(lista);
    });

    if (!destacouDoEndereco && S.estado.carregou && S.idParaDestacar) {
      destacouDoEndereco = true;
      destacar(S.idParaDestacar);
    }
  }

  function atualizarContagens() {
    document.querySelectorAll("[data-ate-data]").forEach((no) => {
      const texto = tempo.faltaPara(no.dataset.ateData, no.dataset.ateHora);
      const alvo = no.querySelector(".contagem-texto") || no;
      alvo.textContent = no.classList.contains("destaque-contagem") ? maiuscula(texto) : texto;
    });
  }

  // Rola até o compromisso e chama a atenção para ele por alguns segundos.
  function destacar(id) {
    let alvo = $(`compromisso-${id}`);

    if (!alvo && (filtro.dia || filtro.categoria !== "todos")) {
      filtro.categoria = "todos";
      filtro.dia = null;
      renderizar({ forcar: true });
      alvo = $(`compromisso-${id}`);
    }
    if (!alvo) return false;

    alvo.scrollIntoView({ behavior: S.movimentoReduzido() ? "auto" : "smooth", block: "center" });
    alvo.focus({ preventScroll: true });
    alvo.classList.remove("destacado");
    void alvo.offsetWidth; // reinicia a animação
    alvo.classList.add("destacado");
    return true;
  }

  S.destacar = destacar;
  S.aoAtualizar(() => renderizar());
  S.aoMinuto(() => renderizar());
  S.aoSalvar((id) => {
    const c = S.estado.compromissos.find((x) => x.id === id);
    if (c && tempo.inicioDe(c) > tempo.agora().getTime()) destacar(id);
  });

  renderizarRelogio();
})();
