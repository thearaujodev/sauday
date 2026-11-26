/* Sauday 1.0 | Página Histórico: os compromissos que já passaram, com busca,
   filtro por categoria, anotações e atalho para agendar o retorno. */
(() => {
  "use strict";

  const S = window.Sauday;
  if (!S || document.body.dataset.pagina !== "historico") return;

  const { criar, icone, botao, tempo, categoria, CATEGORIAS, plural, maiuscula, semAcentos } = S;
  const $ = (id) => document.getElementById(id);

  const el = {
    resumo: $("resumo-historico"),
    numeros: $("numeros-historico"),
    secao: document.querySelector(".secao-lista"),
    titulo: $("titulo-linha-do-tempo"),
    busca: $("busca-historico"),
    filtros: $("filtros-historico"),
    lista: $("lista-historico"),
    resultado: $("resultado-busca")
  };

  const filtro = { categoria: "todos", busca: "" };
  let assinatura = "";
  let destacouDoEndereco = false;

  function passados() {
    const t = tempo.agora().getTime();
    return S.estado.compromissos
      .filter((c) => tempo.inicioDe(c) <= t)
      .sort((a, b) => tempo.inicioDe(b) - tempo.inicioDe(a) || b.id - a.id);
  }

  function combinaComBusca(c) {
    if (!filtro.busca) return true;
    const texto = semAcentos([c.title, c.location, c.notes, categoria(c.type).nome].filter(Boolean).join(" "));
    return semAcentos(filtro.busca).split(/\s+/).every((termo) => texto.includes(termo));
  }

  /* ------------------------------------------------------------------ */
  /* Abertura: resumo e números                                          */
  /* ------------------------------------------------------------------ */

  function renderizarResumo(lista) {
    el.numeros.setAttribute("aria-busy", String(!S.estado.carregou));
    if (!S.estado.carregou) {
      el.resumo.textContent = S.estado.erro ? "Não foi possível carregar o histórico." : "Carregando seu histórico…";
      return;
    }

    if (!lista.length) {
      el.resumo.textContent = "Seu histórico ainda está vazio.";
    } else {
      const primeiro = lista[lista.length - 1];
      const desde = tempo.formatar.mesAno(primeiro.date);
      el.resumo.textContent = `${plural(lista.length, "cuidado registrado", "cuidados registrados")} desde ${desde}.`;
    }

    // Números soltos (não é gráfico): rótulo, ícone e valor em cor de texto.
    const contagem = {};
    lista.forEach((c) => {
      const tipo = S.tipoDoFiltro(c.type);
      contagem[tipo] = (contagem[tipo] || 0) + 1;
    });

    const blocos = Object.entries(CATEGORIAS).map(([tipo, cat]) => {
      const bloco = criar("div", "numero");
      const rotulo = criar("dt");
      rotulo.append(icone(cat.icone), criar("span", null, cat.plural));
      bloco.append(rotulo, criar("dd", null, String(contagem[tipo] || 0)));
      return bloco;
    });
    el.numeros.replaceChildren(...blocos);
  }

  /* ------------------------------------------------------------------ */
  /* Filtros e lista                                                     */
  /* ------------------------------------------------------------------ */

  function chip(valor, texto, quantidade, nomeIcone) {
    const b = botao("chip", null, { foco: `filtro-${valor}` });
    if (nomeIcone) b.append(icone(nomeIcone));
    b.append(criar("span", null, texto), criar("span", "chip-contagem", String(quantidade)));
    b.setAttribute("aria-pressed", String(filtro.categoria === valor));
    b.addEventListener("click", () => {
      filtro.categoria = valor;
      renderizar({ forcar: true });
      anunciarResultado();
    });
    return b;
  }

  function renderizarFiltros(lista) {
    const base = lista.filter(combinaComBusca);
    const contagem = { todos: base.length };
    base.forEach((c) => {
      const tipo = S.tipoDoFiltro(c.type);
      contagem[tipo] = (contagem[tipo] || 0) + 1;
    });

    const chips = [chip("todos", "Todos", contagem.todos)];
    Object.entries(CATEGORIAS).forEach(([valor, cat]) => {
      if (contagem[valor] || filtro.categoria === valor) chips.push(chip(valor, cat.plural, contagem[valor] || 0, cat.icone));
    });
    el.filtros.replaceChildren(...chips);
  }

  function filtrados(lista) {
    return lista
      .filter(combinaComBusca)
      .filter((c) => filtro.categoria === "todos" || S.tipoDoFiltro(c.type) === filtro.categoria);
  }

  function cartao(c) {
    const cat = categoria(c.type);
    const outroAno = c.date.slice(0, 4) !== tempo.hojeISO().slice(0, 4);

    const item = criar("li", "cartao cartao-passado");
    item.id = `compromisso-${c.id}`;
    item.tabIndex = -1;
    item.setAttribute("aria-labelledby", `titulo-${c.id}`);

    const titulo = criar("h4", "cartao-titulo", c.title);
    titulo.id = `titulo-${c.id}`;
    const cabecalho = criar("div", "cartao-cabecalho");
    cabecalho.append(titulo, S.seloCategoria(c.type));

    const corpo = criar("div", "cartao-corpo");
    corpo.append(cabecalho, S.linha("relogio", tempo.quandoPorExtenso(c.date, c.time), "cartao-quando"));
    if (c.location) corpo.append(S.linha("local", c.location));
    if (c.notes) corpo.append(S.linha("nota", c.notes, "cartao-notas"));

    const st = S.statusDoLembrete(c);
    corpo.append(S.linha(st.icone, st.texto, `lembrete-status ${st.classe}`));

    const acoes = criar("div", "cartao-acoes");
    acoes.append(
      botao("btn btn-secundario btn-pequeno", cat.retorno, {
        icone: "retorno",
        rotulo: `${cat.retorno}: ${c.title}`,
        foco: `retorno-${c.id}`,
        aoClicar: () => S.abrirFormulario({ modo: "retorno", compromisso: c })
      }),
      botao("btn-texto btn-pequeno", "Anotar", {
        icone: "editar",
        rotulo: `Anotar ou corrigir ${c.title}`,
        foco: `editar-${c.id}`,
        aoClicar: () => S.abrirFormulario({ modo: "historico", compromisso: c })
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
    rodape.append(acoes);

    item.append(S.blocoData(c.date, { ano: outroAno }), corpo, rodape);
    return item;
  }

  function grupos(lista) {
    const secoes = [];
    let atual = null;

    lista.forEach((c) => {
      const chave = c.date.slice(0, 7);
      if (!atual || atual.chave !== chave) {
        const secao = criar("section", "grupo");
        const cabecalho = criar("h3", "grupo-titulo");
        cabecalho.id = `grupo-${chave}`;
        secao.setAttribute("aria-labelledby", cabecalho.id);
        const quantidade = criar("span", "grupo-contagem");
        cabecalho.append(criar("span", null, maiuscula(tempo.formatar.mesAno(c.date))), quantidade);
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

    const visiveis = filtrados(lista);

    if (!lista.length) {
      const agenda = criar("a", "btn btn-primario", "Ir para a agenda");
      agenda.href = "/";
      el.lista.replaceChildren(S.vazio({
        titulo: "Nada por aqui ainda",
        texto: "Quando a data de um compromisso passar, ele aparece aqui, com as anotações que você fizer.",
        acoes: [agenda]
      }));
    } else if (!visiveis.length) {
      const limpar = botao("btn btn-secundario", "Limpar busca e filtros", {
        aoClicar: () => {
          filtro.categoria = "todos";
          filtro.busca = "";
          el.busca.value = "";
          renderizar({ forcar: true });
          el.busca.focus();
        }
      });
      el.lista.replaceChildren(S.vazio({
        titulo: filtro.busca ? `Nada encontrado para “${filtro.busca}”` : "Nenhum resultado",
        texto: "Tente outro termo ou mostre todas as categorias.",
        acoes: [limpar]
      }));
    } else {
      el.lista.replaceChildren(...grupos(visiveis));
    }
  }

  function anunciarResultado() {
    const n = filtrados(passados()).length;
    el.resultado.textContent = n ? plural(n, "resultado", "resultados") : "Nenhum resultado";
  }

  /* ------------------------------------------------------------------ */
  /* Desenho geral                                                       */
  /* ------------------------------------------------------------------ */

  function renderizar({ forcar = false } = {}) {
    const lista = passados();
    const novaAssinatura = JSON.stringify([
      S.estado.carregou, S.estado.compromissos, filtro, tempo.hojeISO(), lista.map((c) => c.id)
    ]);
    if (!forcar && novaAssinatura === assinatura) return;
    assinatura = novaAssinatura;

    if (filtro.categoria !== "todos" && !lista.some((c) => S.tipoDoFiltro(c.type) === filtro.categoria)) {
      filtro.categoria = "todos";
    }

    renderizarResumo(lista);
    if (!S.estado.carregou && !S.estado.erro) return;

    S.renderizarPreservandoFoco(el.secao, () => {
      el.filtros.hidden = !lista.length;
      el.busca.closest(".busca").hidden = !lista.length;
      renderizarFiltros(lista);
      renderizarLista(lista);
    });

    if (!destacouDoEndereco && S.estado.carregou && S.idParaDestacar) {
      destacouDoEndereco = true;
      destacar(S.idParaDestacar);
    }
  }

  function destacar(id) {
    let alvo = $(`compromisso-${id}`);

    if (!alvo && (filtro.busca || filtro.categoria !== "todos")) {
      filtro.categoria = "todos";
      filtro.busca = "";
      el.busca.value = "";
      renderizar({ forcar: true });
      alvo = $(`compromisso-${id}`);
    }
    if (!alvo) return false;

    alvo.scrollIntoView({ behavior: S.movimentoReduzido() ? "auto" : "smooth", block: "center" });
    alvo.focus({ preventScroll: true });
    alvo.classList.remove("destacado");
    void alvo.offsetWidth;
    alvo.classList.add("destacado");
    return true;
  }

  let temporizadorBusca = null;
  el.busca.addEventListener("input", () => {
    clearTimeout(temporizadorBusca);
    temporizadorBusca = setTimeout(() => {
      filtro.busca = el.busca.value.trim();
      renderizar({ forcar: true });
      anunciarResultado();
    }, 200);
  });

  S.destacar = destacar;
  S.aoAtualizar(() => renderizar());
  S.aoMinuto(() => renderizar());
  S.aoSalvar((id) => {
    const c = S.estado.compromissos.find((x) => x.id === id);
    if (c && tempo.inicioDe(c) <= tempo.agora().getTime()) destacar(id);
  });
})();
