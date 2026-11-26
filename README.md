<p align="center">
  <img src="static/img/logo-completa.png" alt="Sauday: sua saúde, no seu dia" width="360">
</p>

# Sauday

Plataforma web para organizar consultas, exames e vacinas, com lembretes automáticos antes de cada compromisso de saúde.

> Projeto do **FMU Tech Inovação 2026.2**, eixo Saúde e Bem-Estar, alinhado ao **ODS 3 (Saúde e Bem-Estar)**.
> Versão atual: **Sauday | 1.0**, com agenda, histórico de cuidados, notificação por compromisso e horários de Brasília.
> O projeto também aparece como *HealthReminder* no nome do banco de dados e em versões anteriores.

---

## 1. O problema

**Título do projeto:** Sauday

Cuidar da saúde depende de lembrar de datas: consulta de retorno, exame de rotina, dose de vacina. Quando o compromisso é esquecido, o paciente perde a continuidade do cuidado e a vaga fica ociosa para quem esperava na fila.

Esse efeito aparece nos números do absenteísmo, a falta sem aviso a consultas e exames agendados:

- A literatura brasileira cita uma taxa média mundial de cerca de **23%** das consultas agendadas, e algo em torno de **25%** no SUS ([artigo UNIJUÍ, citando revisão sistemática](https://publicacoeseventos.unijui.edu.br/index.php/conintsau/article/download/23176/21917/58432)).
- Em Campo Largo (PR), no primeiro semestre de 2026, **26,85%** dos atendimentos especializados agendados no SUS tiveram falta, o equivalente a **7.172 vagas** ociosas ([Band B](https://www.bandab.com.br/regiao-metropolitana-de-curitiba/pacientes-faltam-consultas-exames-sus-grande-curitiba-campo-largo/)).
- Entre os motivos relatados para as faltas está o simples esquecimento ([Bem Paraná](https://www.bemparana.com.br/noticia/com-informatizacao-e-metodologia-e-possivel-reduzir-o-indice-de-faltosos-no-sus)).

### Público-alvo

Adultos que organizam a própria rotina de saúde, ou a de familiares, e têm vários compromissos ao longo do ano. O uso é cotidiano, no celular ou no computador, por usuários do SUS ou de planos de saúde.

| Perfil | O que precisa |
|--------|---------------|
| Paciente em acompanhamento, como quem tem hipertensão ou diabetes | Não perder retornos marcados com meses de distância |
| Pessoa em esquema vacinal, como as doses da hepatite B | Lembrar da próxima dose na data certa |
| Cuidador ou cuidadora de filhos ou de pais idosos | Ver tudo num só lugar e ser avisado por eles |
| Pessoa com rotina corrida | Ser avisada sem precisar lembrar de abrir nada |

**Delimitação:** o Sauday **não** é clínica, hospital, laboratório nem plano de saúde. A primeira versão trata de uma única coisa: **agendamentos e lembretes**.

### Bases de dados públicas

| Base | Responsável | Uso no projeto |
|------|-------------|----------------|
| [CNES, Cadastro Nacional de Estabelecimentos de Saúde](http://cnes.datasus.gov.br/) | Ministério da Saúde / DATASUS | Sugerir estabelecimentos reais no campo "local" do compromisso (planejado) |
| [OpenDataSUS](https://opendatasus.saude.gov.br/) | Ministério da Saúde | Catálogo de dados abertos para localizar conjuntos complementares, como dados de vacinação (a definir) |
| [Portal Brasileiro de Dados Abertos](https://dados.gov.br/) | Governo Federal | Fonte alternativa dos mesmos conjuntos |

Os indicadores de absenteísmo acima vêm de estudos e levantamentos municipais, citados nas fontes. A integração efetiva com o CNES está prevista para o Checkpoint 2.

---

## 2. Proposta de solução

O Sauday ataca o esquecimento diretamente: o usuário cadastra o compromisso uma vez, escolhe com quanta antecedência quer ser avisado, e o sistema confere, no minuto certo, o que está na janela de envio e registra um aviso, sem nunca duplicá-lo.

### Objetivos

**Objetivo geral:** auxiliar pessoas que cuidam da própria saúde, ou da de familiares, a não perder consultas, exames e vacinas, por meio de uma agenda web que avisa cada compromisso na hora certa.

**Objetivos específicos:**

1. Registrar compromissos de saúde por categoria, com data, horário, local e observações.
2. Impedir o agendamento em datas e horários que já passaram, sempre no horário de Brasília.
3. Avisar o usuário com a antecedência que ele escolher, por notificação do navegador e por aviso guardado no site.
4. Garantir um único aviso por lembrete, mesmo quando o servidor e o site verificam ao mesmo tempo.
5. Permitir ligar e desligar a notificação de cada compromisso, separadamente.
6. Manter um histórico de cuidados, com busca, anotações e atalho para agendar o retorno.
7. Exportar compromissos para a agenda do celular ou do computador, já com o alarme.
8. Oferecer uma interface acessível e responsiva, do celular ao computador.

### Requisitos funcionais

| ID | Requisito |
|----|-----------|
| RF01 | Cadastrar compromisso com título, categoria, data, horário, local, observações, notificação e antecedência |
| RF02 | Editar e excluir compromissos, com confirmação antes de excluir |
| RF03 | Listar os próximos compromissos por dia, com filtros por categoria e pelos próximos 14 dias |
| RF04 | Recusar compromissos em data ou horário que já passou, no horário de Brasília |
| RF05 | Ligar e desligar a notificação de cada compromisso |
| RF06 | Gerar o aviso quando o compromisso entra na janela de antecedência |
| RF07 | Mostrar a notificação do navegador no minuto do aviso, também com a aba em segundo plano |
| RF08 | Listar os avisos no sino e marcá-los como lidos, um a um ou todos |
| RF09 | Mover os compromissos passados para o histórico, com busca, filtros e anotações |
| RF10 | Agendar o retorno a partir do histórico, com o formulário já preenchido |
| RF11 | Exportar o compromisso como arquivo de calendário, com alarme |
| RF12 | Exibir a página Sobre, com o projeto, a equipe e o contato |

Os requisitos não funcionais, as regras de negócio, as histórias de usuário, os diagramas UML, a modelagem do banco de dados e os fluxogramas estão na **[documentação teórica (PDF, nas normas da ABNT)](docs/sauday-documentacao-teorica.pdf)**, também disponível em [Word](docs/sauday-documentacao-teorica.docx).

**Fluxo principal**
1. O usuário cadastra um compromisso: título, categoria, data e horário, local, observações, se quer ser notificado e com quanta antecedência. Só é possível marcar de agora em diante, sempre no **horário de Brasília**.
2. A API valida e guarda o registro no banco. Datas e horários que já passaram são recusados.
3. A verificação de lembretes acontece em dois lugares ao mesmo tempo:
   - no **próprio servidor do site**, que acorda na hora exata de cada lembrete, sem precisar de um segundo terminal;
   - no **site**, que agenda um despertador para o minuto exato do próximo lembrete e confere o servidor a cada 30 segundos, também com a aba em segundo plano.
4. Quando um compromisso entra na janela, o aviso é gravado e aparece no **sino** do cabeçalho. Uma atualização atômica no banco garante um único aviso por lembrete, mesmo com várias verificações simultâneas. Se o compromisso for remarcado, o lembrete é rearmado.
5. Com a permissão do usuário, pedida no momento em que ele liga a notificação, o aviso também aparece como **notificação do navegador**, exibida pelo service worker.
6. Depois da data, o compromisso vai para o **Histórico**, onde dá para anotar como foi e agendar o retorno.

**O que funciona e o que depende de infraestrutura (versão 1.0)**

| Mecanismo | Situação |
|-----------|----------|
| Registro dos avisos no banco, sem duplicidade | Funcionando |
| Avisos no sino, com novos e lidos | Funcionando |
| Notificação do navegador no minuto exato | Funcionando com uma aba do Sauday aberta, mesmo minimizada ou em segundo plano. Exige permissão e `localhost`, `127.0.0.1` ou HTTPS |
| Lembrete com o navegador fechado | Pelo botão **Calendário**: o compromisso vai para a agenda do celular ou do computador já com alarme. Web Push e e-mail não estão implementados |
| Acesso de outros aparelhos | Não implementado: o sistema roda localmente e ainda não tem contas de usuário |

**Próximas evoluções:** avisos com o navegador fechado (e-mail ou push), contas de usuário, sincronização automática com agendas digitais e sugestão de estabelecimentos via CNES.

**Privacidade:** dados de saúde são sensíveis (LGPD). Nesta fase o banco é local, **não é versionado** (`database/*.db` está no `.gitignore`) e o projeto não usa dados reais de pacientes.

### Versão 1.0: o que mudou a partir da avaliação

| Ponto levantado | O que foi feito |
|-----------------|-----------------|
| O site aceitava datas anteriores | Compromissos só podem ser marcados de agora em diante, no horário de Brasília. A regra vale na API e no formulário, com mensagens claras. Os que já passaram ficam guardados num **Histórico de cuidados** |
| Uma seção inteira só para avisos | A notificação agora é ligada e desligada **em cada compromisso**. Os avisos ficam no sino do cabeçalho |
| Interface compacta demais | Agenda com saudação e relógio, próximo compromisso em destaque, faixa dos próximos 14 dias e filtros. Formulário, confirmações e avisos abrem em **janelas próprias**. No celular há navegação inferior |
| Notificação demorava e só aparecia ao recarregar | A página só verificava os lembretes com a aba visível e a cada minuto. Agora o disparo é agendado para o **minuto exato**, a verificação continua em segundo plano, a notificação sai pelo service worker e o servidor gera os avisos sozinho |

Também foram corrigidos: o caminho do banco, que dependia da pasta de execução; o lembrete com antecedência zero, que nunca disparava; antecedências enormes, que travavam a verificação; e horários fora do padrão, que eram aceitos.

### Tecnologias e justificativas

| Camada | Tecnologia | Por que |
|--------|------------|---------|
| Backend / API | Python + Flask | Leve, adequado a uma API REST e dominado pela equipe. Permite entregar rápido no semestre |
| Banco de dados | SQLite | Sem instalação nem servidor, suficiente para o protótipo. A estrutura permite migrar para um banco servidor depois |
| Serviço de lembretes | Verificador dentro do próprio servidor (thread) e serviço avulso opcional | Os avisos saem na hora certa sem abrir outro terminal. O site faz a mesma verificação, e o banco garante que não haja aviso duplicado |
| Interface | HTML, CSS e JavaScript (templates Jinja do Flask) | Sem framework: curva de aprendizado baixa e fácil divisão com a equipe de UI/UX |
| Notificações | Notification API e service worker | Disponíveis nos navegadores modernos, sem dependências. O service worker mostra a notificação com a aba em segundo plano e abre o Sauday no clique |
| Fuso horário | `zoneinfo` (Python) e `Intl` (navegador), com o pacote `tzdata` | Todos os horários seguem Brasília (`America/Sao_Paulo`), não importa o fuso do servidor ou do aparelho |
| Calendário | Arquivo iCalendar (`.ics`) | Formato aberto, aceito por Google Agenda, Calendário do iPhone e Outlook, com alarme incluso |
| Colaboração | Git e GitHub | Histórico, revisão e entrega por repositório público |

---

## 3. Identidade visual

**Logo oficial:** coração com um check integrado, que representa cuidado com a saúde e compromisso cumprido. O nome é escrito com "Sau" e "day" em tons diferentes de verde.

**Slogan oficial:** *sua saúde, no seu dia*

As versões abaixo foram recortadas do arquivo oficial, com fundo transparente, sem redesenho nem troca de cores. Use a logo sempre sobre fundos claros: sobre verde escuro, a palavra "Sau" desaparece.

| Versão | Arquivo | Onde é usada |
|--------|---------|--------------|
| Completa (símbolo, nome e slogan) | [`static/img/logo-completa.png`](static/img/logo-completa.png) | Página Sobre e este README |
| Horizontal (símbolo e nome) | [`static/img/logo-horizontal.png`](static/img/logo-horizontal.png) | Cabeçalho do site, onde o slogan ficaria pequeno demais para ler |
| Símbolo | [`static/img/simbolo.png`](static/img/simbolo.png) | Indicador de carregamento, rodapé e listas vazias |
| Favicons | `favicon-32.png`, `favicon-64.png`, `apple-touch-icon.png` | Aba do navegador e atalho no celular |

**Paleta de cores** (extraída da logo oficial)

| Cor | Hex | Uso |
|-----|-----|-----|
| Verde Sauday | `#10604C` | "Sau" na logo, títulos, botões, links e foco (contraste 7,5:1 sobre branco) |
| Verde Escuro | `#0B4A3A` | Botões ao passar o mouse |
| Verde Dia | `#44B860` | "day" na logo. Só para sinalização (avisos novos, marcadores), nunca para texto |
| Folha | `#F3F8F5` | Fundo das páginas |
| Folha Forte | `#E3F3E8` | Destaques suaves e mensagens de sucesso |
| Branco | `#FFFFFF` | Áreas de leitura e formulários |
| Tinta | `#1F2937` | Texto principal |
| Cinza | `#5B6470` | Texto secundário (contraste AA) |

**Tipografia:** **Poppins** (600 e 700) para títulos e para a marca, e **Inter** (400 a 600) para o texto. Ambas são gratuitas, do Google Fonts, com fontes do sistema como alternativa.

A identidade está aplicada em todas as páginas por meio de [`backend/templates/base.html`](backend/templates/base.html) e [`static/css/style.css`](static/css/style.css).

---

## 4. Pitch inicial

Esquecer uma consulta parece pouco, mas, somado, vira vaga ociosa no sistema de saúde e cuidado interrompido para o paciente. O Sauday resolve isso de forma simples: você registra o compromisso uma vez e ele avisa na hora certa.

**Diferencial:** foco único em agendamentos de saúde, lembrete configurável por compromisso, avisos registrados que nunca se duplicam e uma interface leve e acolhedora, sem a complexidade de um sistema hospitalar.

---

## 5. Como executar

Pré-requisito: Python 3.10 ou superior. O banco fica sempre em `database/`, de qualquer pasta que você execute.

```bash
git clone <url-do-repositorio>
cd sauday

python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # Linux / macOS

pip install -r requirements.txt

python backend/app.py           # servidor em http://127.0.0.1:5000
```

Abra http://127.0.0.1:5000. O servidor já verifica os lembretes sozinho, na hora exata de cada um. Para receber as notificações do navegador, ligue a notificação de um compromisso e permita quando o navegador perguntar.

> Para demonstrar: crie um compromisso para daqui a 6 minutos com aviso de **5 minutos** antes. A notificação aparece no minuto seguinte, sem recarregar a página. Com uma antecedência maior que o tempo restante, ela aparece assim que você salva.

O serviço avulso de lembretes continua disponível, para gerar os avisos sem o site no ar:

```bash
python backend/reminders.py
```

> No Windows, se o PowerShell bloquear a ativação do ambiente virtual, rode `Set-ExecutionPolicy -Scope Process Bypass` e ative de novo com `.\.venv\Scripts\Activate.ps1`.

Testes automatizados:

```bash
python -m unittest discover -s backend -p "test_*.py" -v
```

### API

| Método | Rota | Função |
|--------|------|--------|
| GET | `/api/appointments` | Lista os compromissos |
| POST | `/api/appointments` | Cria um compromisso (data e horário de agora em diante, em Brasília) |
| GET / PUT / DELETE | `/api/appointments/<id>` | Consulta, atualiza ou exclui |
| PATCH | `/api/appointments/<id>` | Altera só os campos enviados. Ex.: `{"notify": false}` desliga a notificação |
| GET | `/api/appointments/<id>/calendar.ics` | Arquivo de calendário com o compromisso e o alarme |
| GET | `/api/status` | Versão e hora oficial do servidor (Brasília) |
| GET | `/api/reminders` | Lembretes na janela de envio que ainda não geraram aviso |
| POST | `/api/reminders/process` | Verifica os lembretes e registra os avisos (usado pelo site) |
| GET | `/api/notifications` | Lista os avisos e a quantidade de não lidos |
| POST | `/api/notifications/<id>/read` | Marca um aviso como lido |
| POST | `/api/notifications/read-all` | Marca todos os avisos como lidos |

---

## 6. Estrutura do repositório

```
sauday/
├── backend/
│   ├── app.py              # API Flask, páginas e validações
│   ├── database.py         # acesso ao SQLite (compromissos e avisos)
│   ├── reminders.py        # regra, verificador embutido e serviço avulso de lembretes
│   ├── tempo.py            # horário de Brasília
│   ├── calendario.py       # exportação para calendário (.ics)
│   ├── test_reminders.py   # testes de lembretes, avisos e fuso
│   ├── test_api.py         # testes das rotas da API e das páginas
│   └── templates/          # agenda, histórico, sobre, 404 e as janelas compartilhadas
├── static/
│   ├── css/                # estilos
│   ├── js/                 # nucleo.js (todas as páginas), agenda.js, historico.js e sw.js
│   └── img/                # logo oficial e favicons
├── database/               # banco local (não versionado)
├── docs/                   # documentação teórica na ABNT, em PDF e Word (requisitos, diagramas, banco de dados)
├── requirements.txt
└── README.md
```

## 7. Equipe

| Integrante | Matrícula | Responsabilidade |
|------------|-----------|------------------|
| Miguel Araújo dos Santos | 2026110137 | Desenvolvimento |
| Gustavo Opata de Jesus Silva | 2026114788 | UI/UX Design |
| Francisco Rodrigues Borges | 2026109596 | QA/Tester |
| Gabriel Rodrigues Ramos | 2026112915 | Documentação |
| Guilherme Gregatti Silva | 2026110136 | Engenharia de Software |

## 8. Entregas

| Entrega | O que contém | Situação |
|---------|--------------|----------|
| Checkpoint 1 | Problema, proposta de solução, identidade visual, pitch inicial, API e interface iniciais | Concluída |
| Alpha 0.1 | Logo oficial, página Sobre, edição de compromissos, central de avisos, notificações do navegador e estados de carregamento | Concluída |
| Versão 1.0 | Histórico de cuidados, notificação por compromisso, datas só de agora em diante no horário de Brasília, notificações no minuto exato, nova interface com janelas e exportação para calendário | Concluída |
| Documentação teórica | Público-alvo, objetivos, requisitos, engenharia de software, banco de dados, fluxogramas e UI/UX, nas normas da ABNT: [PDF](docs/sauday-documentacao-teorica.pdf) e [Word](docs/sauday-documentacao-teorica.docx) | Concluída |
| Checkpoint 2 | Protótipo com fluxo principal navegável, README com prints e vídeo de demonstração | Pendente |
| Apresentação final | Pitch de 5 minutos, projeto funcionando e repositório completo | Pendente |
