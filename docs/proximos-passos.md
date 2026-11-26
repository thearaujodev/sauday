# Próximos passos (trabalho em andamento)

> Nota de trabalho das correções pedidas pelo professor para a versão 1.0.
> **Apagar este arquivo antes da entrega final.**

## O que já está pronto nesta branch

Pedidos do professor:

| Pedido | Situação |
|--------|----------|
| Compromissos anteriores viram um **histórico** | Pronto: página `/historico` com busca, filtro por categoria, agrupamento por mês, "Anotar" (edita sem mudar data/hora) e "Agendar retorno / próxima dose" |
| Ativar a notificação **junto aos compromissos**, sem a seção inteira de avisos | Pronto: interruptor "Notificar" em cada cartão e no formulário; a antiga seção de avisos virou uma gaveta aberta pelo sino do cabeçalho |
| **Bloquear datas passadas**, no horário de Brasília | Pronto no backend (`validar_dados_agendamento`) e no formulário (mensagens claras, `min` nos campos). Usa `America/Sao_Paulo` em vez do relógio da máquina |
| Interface menos compacta, **mais janelas** | Pronto: formulário em diálogo, confirmação de exclusão, gaveta de avisos, ajuda sobre notificações, mensagens rápidas, faixa de 14 dias, filtros e navegação inferior no celular |
| Notificação **confiável**, sem precisar recarregar | Implementado: o site agenda um despertador para o minuto exato de cada lembrete, sincroniza a cada 30 s mesmo com a aba em segundo plano (antes só sincronizava com a aba visível), mostra a notificação pelo service worker (`/sw.js`) e pede a permissão no clique de ativar. O servidor também tem um verificador embutido (não precisa mais do segundo terminal) |

Bugs corrigidos pelo caminho:

- Caminho do banco dependia da pasta onde o comando era executado (`cd backend && python app.py` quebrava).
- Lembrete com antecedência 0 nunca disparava (janela vazia).
- `reminder_minutes` gigante gerava `OverflowError` e derrubava todo o processamento.
- Datas e horários fora do padrão (`9:5`) eram aceitos.

Extras: exportação `.ics` com alarme ("Calendário" em cada cartão), `PATCH /api/appointments/<id>`, `GET /api/status`, versão `1.0`.

Testes: `python -m unittest discover -s backend -p "test_*.py"` → 31 testes passando.

## Falta fazer

1. **Rodapé do cartão em uma linha:** mover o status do lembrete ("Aviso amanhã às 05:30 · 2 horas antes") de `.cartao-rodape` para o corpo do cartão (`static/js/agenda.js`, função `cartao`), deixando no rodapé só o interruptor e as ações. Hoje ele quebra em duas linhas na grade de duas colunas.
2. **Testar a notificação de ponta a ponta no navegador:** criar um compromisso com aviso vencendo em cerca de 1 minuto, deixar a página em segundo plano e conferir `registration.getNotifications()`. Também testar a notificação imediata ao salvar.
   - Atenção: o Chromium "headless shell" (padrão do Playwright) informa `Notification.permission = "denied"` mesmo com permissão concedida. Usar `chromium.launch({ channel: 'chromium' })`, que informa `"granted"` corretamente.
   - Um `<dialog>` fechado nunca fica "visível" no Playwright: esperar com `waitForFunction(() => !dialog.open)`.
3. **Conferir os prints que faltam:** agenda e formulário no celular, gaveta de avisos, histórico (desktop e celular) e Sobre. Os prints ficam no scratchpad da sessão e precisam ser refeitos se o container for reiniciado.
4. **`requirements.txt`:** adicionar `tzdata` (o Windows não traz a base de fusos; hoje o código cai para UTC-3 fixo, que funciona, mas o certo é ter a base).
5. **Remover `static/js/app.js`**, que nenhuma página usa mais (foi substituído por `nucleo.js`, `agenda.js` e `historico.js`).
6. Opcional: horário de Brasília também nos registros do terminal (`logging.Formatter.converter`).
7. **Atualizar o README:** versão 1.0, como as notificações funcionam agora (e o limite: precisa de uma aba do Sauday aberta, mesmo minimizada; com o navegador fechado, só pelo `.ics`), rotas novas da API, página Histórico, `reminders.py` agora opcional, execução de qualquer pasta.
8. Revisão final do código (`/code-review`), rodar os testes, apagar este arquivo, commit e push.
