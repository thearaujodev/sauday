<p align="center">
  <img src="static/img/logo-completa.png" alt="Sauday: sua saúde, no seu dia" width="360">
</p>

# Sauday

Plataforma web para organizar consultas, exames e vacinas, com lembretes automáticos antes de cada compromisso de saúde.

> Projeto do **FMU Tech Inovação 2026.2**, eixo Saúde e Bem-Estar, alinhado ao **ODS 3 (Saúde e Bem-Estar)**.
> Versão atual: **Sauday | Alpha 0.1**, com API, interface e central de avisos funcionando.
> O projeto também aparece como *HealthReminder* no nome do banco de dados e em versões anteriores.

---

## 1. O problema

**Título do projeto:** Sauday

Cuidar da saúde depende de lembrar de datas: consulta de retorno, exame de rotina, dose de vacina. Quando o compromisso é esquecido, o paciente perde a continuidade do cuidado e a vaga fica ociosa para quem esperava na fila.

Esse efeito aparece nos números do absenteísmo, a falta sem aviso a consultas e exames agendados:

- A literatura brasileira cita uma taxa média mundial de cerca de **23%** das consultas agendadas, e algo em torno de **25%** no SUS ([artigo UNIJUÍ, citando revisão sistemática](https://publicacoeseventos.unijui.edu.br/index.php/conintsau/article/download/23176/21917/58432)).
- Em Campo Largo (PR), no primeiro semestre de 2026, **26,85%** dos atendimentos especializados agendados no SUS tiveram falta, o equivalente a **7.172 vagas** ociosas ([Band B](https://www.bandab.com.br/regiao-metropolitana-de-curitiba/pacientes-faltam-consultas-exames-sus-grande-curitiba-campo-largo/)).
- Entre os motivos relatados para as faltas está o simples esquecimento ([Bem Paraná](https://www.bemparana.com.br/noticia/com-informatizacao-e-metodologia-e-possivel-reduzir-o-indice-de-faltosos-no-sus)).

**Público e contexto:** pessoas que organizam a própria rotina de saúde ou a de familiares, principalmente quem tem vários compromissos ao longo do ano (consultas de acompanhamento, exames periódicos, vacinas). O contexto é o uso cotidiano, no celular ou no computador.

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

O Sauday ataca o esquecimento diretamente: o usuário cadastra o compromisso uma vez, escolhe com quanta antecedência quer ser avisado, e o sistema verifica periodicamente o que está na janela de envio e registra um aviso, sem nunca duplicá-lo.

**Fluxo principal**
1. O usuário cadastra um compromisso (título, categoria, data, horário, local, observações e antecedência do lembrete).
2. A API valida e guarda o registro no banco.
3. A verificação de lembretes roda em dois lugares: no serviço `reminders.py` (a cada 30 segundos) e no próprio site (ao abrir a página e a cada minuto, enquanto ela estiver aberta).
4. Quando um compromisso entra na janela, o aviso é gravado na **central de avisos**, com o compromisso, a data e o horário. Uma atualização atômica no banco garante um único aviso por lembrete, mesmo com o serviço e o site verificando ao mesmo tempo. Se o compromisso for remarcado, o lembrete é rearmado.
5. Com a permissão do usuário, o aviso também aparece como **notificação do navegador**, enquanto o Sauday estiver aberto em uma aba.

**O que funciona e o que depende de infraestrutura (Alpha 0.1)**

| Mecanismo | Situação |
|-----------|----------|
| Registro dos avisos no banco, sem duplicidade | Funcionando |
| Central de avisos no site, com novos e lidos | Funcionando |
| Notificação do navegador com a página aberta | Funcionando (exige permissão; em `localhost`/`127.0.0.1` ou HTTPS) |
| Aviso com o site fechado (Web Push ou e-mail) | Não implementado: exige service worker, servidor de push ou serviço de e-mail |
| Acesso de outros aparelhos | Não implementado: o sistema roda localmente e ainda não tem contas de usuário |

**Próximas evoluções:** avisos com o site fechado (e-mail ou push), contas de usuário, integração com agendas digitais e sugestão de estabelecimentos via CNES.

**Privacidade:** dados de saúde são sensíveis (LGPD). Nesta fase o banco é local, **não é versionado** (`database/*.db` está no `.gitignore`) e o projeto não usa dados reais de pacientes.

### Tecnologias e justificativas

| Camada | Tecnologia | Por que |
|--------|------------|---------|
| Backend / API | Python + Flask | Leve, adequado a uma API REST e dominado pela equipe. Permite entregar rápido no semestre |
| Banco de dados | SQLite | Sem instalação nem servidor, suficiente para o protótipo. A estrutura permite migrar para um banco servidor depois |
| Serviço de lembretes | Processo Python separado | Roda independente do servidor web e é simples de testar. O site faz a mesma verificação, e o banco garante que não haja aviso duplicado |
| Interface | HTML, CSS e JavaScript (templates Jinja do Flask) | Sem framework: curva de aprendizado baixa e fácil divisão com a equipe de UI/UX |
| Notificações | Notification API do navegador | Disponível nos navegadores modernos, sem dependências, respeitando a permissão do usuário |
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
| Símbolo | [`static/img/simbolo.png`](static/img/simbolo.png) | Indicador de carregamento |
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

Pré-requisito: Python 3.10 ou superior. Execute **sempre a partir da raiz do projeto**, pois o caminho do banco é relativo a ela.

```bash
git clone <url-do-repositorio>
cd sauday

python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # Linux / macOS

pip install -r requirements.txt

python backend/app.py           # servidor em http://127.0.0.1:5000
```

Abra http://127.0.0.1:5000. Com a página aberta, o próprio site verifica os lembretes. Para que os avisos sejam gerados mesmo com o navegador fechado, inicie também o serviço de lembretes em um **segundo terminal** (com o ambiente virtual ativo):

```bash
python backend/reminders.py                 # verifica a cada 30 s
python backend/reminders.py --intervalo 5   # para demonstrações
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
| POST | `/api/appointments` | Cria um compromisso |
| GET / PUT / DELETE | `/api/appointments/<id>` | Consulta, atualiza ou exclui |
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
│   ├── app.py              # API Flask e páginas
│   ├── database.py         # acesso ao SQLite (compromissos e avisos)
│   ├── reminders.py        # regra e serviço automático de lembretes
│   ├── test_reminders.py   # testes de lembretes e avisos
│   ├── test_api.py         # testes das rotas da API e das páginas
│   └── templates/          # base, início, sobre e 404
├── static/                 # css/, js/ e img/ (logo oficial e favicons)
├── database/               # banco local (não versionado)
├── docs/                   # requisitos, diagramas e decisões técnicas
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

## 8. Roadmap

- [x] **Checkpoint 1:** problema, solução, identidade visual, pitch, API e interface iniciais
- [x] **Alpha 0.1:** logo oficial aplicada, página Sobre, edição de compromissos, central de avisos, notificações do navegador e estados de carregamento
- [ ] **Checkpoint 2:** protótipo com fluxo principal navegável, README com prints e vídeo de demonstração
- [ ] **Apresentação final:** pitch de 5 minutos, projeto funcionando e repositório completo
