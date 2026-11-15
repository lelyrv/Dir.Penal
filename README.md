# Vade Mecum — fluxogramas por artigo

Site estático (HTML, CSS e JavaScript puros, sem servidor) com um fluxograma completo por artigo: texto legal,
doutrina, jurisprudência (STF/STJ), roteiro de atendimento e os pontos que mais aparecem em audiência.
Publicado pelo GitHub Pages. Funciona offline depois da primeira visita (veja "Modo offline").

## Estrutura

| Arquivo / pasta | Para que serve |
|---|---|
| `index.html` | Home: matérias, painel de estudos (horas, backup, meta diária, conferência a renovar), "continuar de onde parou". |
| `index-penal.html`, `index-civil.html`, `index-clt.html`, `index-jecrim.html` | Um por matéria: menu lateral + quadro que mostra o artigo. |
| `XX-ART-N.html` | Um artigo (DP = Cód. Penal, CC = Cód. Civil, CLT, L9099 = Lei 9.099/95). |
| `catalog.json` | **Única coisa editada à mão para os menus**: matérias, grupos, rótulos e ordem dos artigos. |
| `articles.json`, `sw.js` | **Gerados** por `tools/build.py` (manifesto, busca de texto integral, modo offline). Não edite. |
| `study-tracker.js`, `study-bar.css` | Cronômetro de estudo, sessões, backup (JS) e visual da barra (CSS), compartilhados por todas as páginas. |
| `article-nav.js`, `article-tools.js` | Menu de atalhos adaptável, anterior/próximo, selo de conferência, copiar com fonte, modo audiência, PDF por seção. |
| `search.js`, `vm-data.js`, `session-banner.js`, `dashboard.js`, `em-breve.js`, `pwa.js` | Busca (Ctrl+K), dados compartilhados, aviso de sessão, extras da home, itens "em breve", registro do offline. |
| `fonts/`, `fonts.css`, `vendor/`, `icons/`, `manifest.webmanifest` | Fontes e gráfico locais (sem depender de servidor externo) e dados do app instalável. |
| `search-index-CP.json` (e CC, CLT, L9099) | **Gerados**: um índice de busca por matéria, carregado sob demanda. |
| `citations.json`, `training.json`, `queue.json` | **Gerados**: súmulas/teses citadas e onde aparecem, cartões de treino, fila de prioridades. |
| `registry/` | Registros editáveis: `precedentes.json` (súmulas/teses; só texto lido de página oficial), `leis.json`, `prioridades.json`, `patterns.json`. |
| `data/laws/` | Retratos do texto das leis (Planalto), base do detector de mudanças, do roteiro e das calculadoras. |
| `data/alteracoes.json` | Marcadores de "lei alterada" gravados pela verificação mensal (`law_watch.py --check --flags`); o site os mostra nos artigos. |
| `treino.html`, `sumulas.html`, `calculadoras.html`, `L9099-ROTEIRO.html` | Treino com revisão espaçada, registro de súmulas, calculadoras de prazo, roteiro geral do procedimento. |
| `tools/` | `build.py` (gerador e verificações), `lint.py` (padrão dos artigos), `new_article.py`, `check_sources.py`, `law_watch.py`, `registry_sync.py`, `gen_roteiro.py`, `test_tools.py`. |
| `tests/` | Testes automáticos (veja abaixo). |
| `docs/TESTES-MANUAIS.md` | O que as máquinas não conseguem testar aqui (Safari/iOS, leitor de tela real, instalação no Android, PDF). |
| `arquivo/` | Material antigo guardado. |

## Como publicar um artigo novo

1. Rode `python tools/new_article.py --subject L9099 --num 66 --title "Citação"`. Ele cria a página a partir do último artigo
   da matéria, já com o texto legal literal (retrato do Planalto), o esqueleto padrão e marcadores `[[...]]` nas partes que
   exigem pesquisa, e inclui o item no `catalog.json`. A página nasce como "em breve" (`id="em-elaboracao"`).
2. Preencha o conteúdo (fontes oficiais; nada sem conferir), apague a linha `em-elaboracao` e ponha a data de conferência.
   `tools/lint.py` (chamado pelo `build.py`) barra a publicação com marcador esquecido, emoji ou seção obrigatória ausente.
3. Rode `python tools/build.py`. Ele atualiza menus, manifesto, buscas, citações, treino, fila, versões dos scripts e o offline.
4. Rode `node tests/run.mjs` (ou só `node tests/run.mjs static`). Faça o commit e o push.

Sem a ferramenta, o caminho manual é copiar o último artigo da matéria e acrescentar o item em `catalog.json`.

## Rotinas automáticas (GitHub Actions)

`.github/workflows/monthly.yml` roda todo mês, abre (ou atualiza) **uma Issue** com o relatório, para o aviso chegar por e-mail, e não
mexe no conteúdo das páginas:
- `python tools/check_sources.py` — verifica os links das seções "Fontes" (distingue erro real de bloqueio do site).
- `python tools/law_watch.py --check --flags data/alteracoes.json` — compara o texto atual do Planalto com os retratos de
  `data/laws/` (Código Penal, Código Civil, CLT, CPP e Lei 9.099); se o Planalto estiver indisponível, relata "indisponível"
  em vez de alarme falso e mantém os marcadores anteriores. O arquivo `data/alteracoes.json` é o único que a rotina grava no
  repositório (commit automático): é ele que faz o site mostrar o aviso **"Lei alterada"** no topo do artigo e na caixa
  "Conferência a renovar" da home. Depois de reconferir, rode `python tools/law_watch.py --update` e faça commit: o retrato
  novo limpa o marcador.
- `python tools/registry_sync.py` — relê os enunciados do STF cadastrados em `registry/precedentes.json`. STJ e TST não são
  verificáveis automaticamente; ficam como "não verificado" e o site mostra "Enunciado não cadastrado".

Artigos listados no catálogo mas sem arquivo aparecem como **"em breve"** (sem link, sem erro 404). Uma página só com o aviso
`id="em-elaboracao"` também aparece como "em breve".

> A data de "última conferência" exibida e usada nos alertas vem do cabeçalho ou do rodapé da página
> (ex.: "Atualização conferida em 12/11/2026"). Ao reconferir um artigo, atualize esse texto.

## Testes

Precisam de Python 3, Node 22+ e um Chrome ou Edge (detectado sozinho; ou defina `BROWSER` com o caminho do executável).

```
python tools/build.py --check     # gerador em dia? (não grava nada)
node tests/run.mjs                # todas as suítes
node tests/run.mjs timer a11y     # só algumas: static calc timer layout a11y pages features tools offline contrast visual
node tests/contrast.test.mjs --update   # aceita o estado atual de contraste (a suíte só falha se uma página PIORAR)
UPDATE_BASELINE=1 node tests/visual.test.mjs   # aceita uma mudança visual proposital
```

As referências de captura de tela ficam em `tests/baseline/<sistema>/` (Windows, Linux e macOS renderizam fontes de modo
diferente): na primeira execução em um sistema novo elas são criadas e o teste passa avisando. Testes que dependem de
aparelhos reais estão em `docs/TESTES-MANUAIS.md`.

O GitHub roda isso a cada push (`.github/workflows/tests.yml`). **Primeira execução no GitHub (Linux):** o teste visual cria as
referências e passa sem comparar. Baixe o arquivo `referencias-visuais-linux` (aba da execução > Artifacts), copie as imagens para
`tests/baseline/linux/` e faça commit: a partir daí a comparação visual vale também lá.

As Actions estão fixadas por SHA (com o número da versão em comentário) e o Dependabot (`.github/dependabot.yml`) abre um pull
request mensal quando sai versão nova: o CI não muda sozinho por mudança externa.

## Recursos

- **Ferramentas** (menu na barra de estudo, nada flutua sobre o texto): buscar, modo audiência, tamanho da letra,
  tema claro/escuro, imprimir/PDF, **ficha de audiência (A4)**, voltar ao topo.
- **Ficha de audiência (A4)**: monta, só com trechos copiados da própria página, o texto legal literal e as perguntas-chave
  (**compacta**: 1 página nos arts. 60 e 62 a 65 da Lei 9.099, 2 páginas no art. 61) ou também os requisitos e os prazos
  (**completa**: 2 a 3 páginas). As seções entram pela marca `data-ficha="requisitos"` ou `data-ficha="prazos"` no `<section>`
  (o `tools/new_article.py` já as põe nos artigos novos).
- **Busca**: `Ctrl+K` (ou `/`) em qualquer página; texto integral, ignora acentos e maiúsculas; carrega só a matéria aberta.
  O resultado abre já na seção e o termo buscado fica destacado (Esc ou clique no destaque remove).
- **Treino** (`treino.html`): cartões a partir dos pontos recorrentes, com revisão espaçada (1, 3, 7, 21 e 60 dias), filtro por
  matéria e por artigo, tabela de **desempenho por artigo** (do menor acerto para o maior) e **exportação para o Anki**
  (arquivo de texto com tabulação; Anki > Arquivo > Importar).
- **Notas e marcas por seção** (botões "Marcar" e "Nota" no título de cada seção); entram no backup. O campo de nota avisa:
  não registre dados que identifiquem clientes (as notas ficam no navegador e vão para o arquivo de backup).
- **Súmulas e teses** (`sumulas.html`): onde cada uma aparece no site; o texto só aparece quando foi lido de fonte oficial.
- **Calculadoras** (`calculadoras.html`): prescrição, suspensão condicional do processo e da pena, infração de menor potencial
  ofensivo, **requisitos da transação penal (art. 76)**, **prazos do procedimento** (apelação, resposta, embargos e testemunhas,
  Lei 9.099 arts. 78, 82 e 83, contados pelo CPP art. 798 ou, se escolher, em dias úteis pelo art. 12-A) e **decadência**
  (CP art. 103; CPP art. 38 e § 2º). Cada uma mostra o texto oficial do Planalto. São apoio ao cálculo: confira no caso concreto;
  o que depende de avaliação aparece como "a verificar" e a ferramenta não decide se o art. 12-A alcança o Juizado Criminal.
- **Roteiro geral** (`L9099-ROTEIRO.html`): arts. 60 a 76 e 92 da Lei 9.099 em sequência, com o texto do Planalto.
- **Anterior / próximo** e **continuar de onde parou** (a posição de leitura fica neste aparelho).
- **Modo audiência**: mostra só os "pontos recorrentes" do artigo. Botões **Copiar** (com a fonte) e **PDF** por seção
  (usa a janela de impressão do navegador; escolha "Salvar como PDF").
- **Cronômetro**: sessões, pausas, nota opcional, meta diária, tempo na aba do navegador, aviso de sessão em outro artigo.
- **Selo de conferência**: cada artigo mostra a data da última conferência e alerta quando passou do prazo (padrão 90 dias).

## Modo offline

Na primeira visita pela internet, o navegador guarda o site inteiro (páginas, fontes, gráfico, busca). Depois funciona sem
sinal. Quando há conexão, as páginas são buscadas da rede primeiro (conteúdo novo); sem sinal ou com sinal ruim (mais de
3,5 s), usa a cópia guardada. Quando uma versão nova é instalada, aparece um aviso para recarregar.
É preciso abrir o site pelo endereço `https://` publicado (ou `localhost`); abrir o arquivo direto do disco não ativa o offline,
a busca nem o manifesto.

## Seus dados de estudo

Sessões, artigos concluídos, metas e a última leitura ficam **no navegador** (`localStorage`), por aparelho. Limpar o cache ou
trocar de aparelho apaga tudo. No Chrome/Edge (desktop) dá para escolher uma pasta para **backup automático**; nos demais
navegadores o painel mostra um lembrete semanal.

**Backup com senha.** "Backup com senha" (painel da home) baixa o arquivo criptografado (AES-GCM de 256 bits; chave derivada da
senha por PBKDF2-SHA256 com 600.000 iterações). A senha não é guardada em lugar nenhum e **não há como recuperá-la**: sem ela o
arquivo não abre. Na pasta do backup automático, "Proteger com senha" grava todos os arquivos criptografados; o navegador guarda
só uma chave derivada **não extraível** (nunca a senha), apagada ao desativar o backup automático. Ao restaurar um arquivo
protegido, a tela pede a senha.

**Sincronizar dois aparelhos sem servidor.** Escolha, nos dois, a mesma pasta de uma nuvem sincronizada (Google Drive, OneDrive...).
Cada aparelho grava só o seu arquivo (`vademecum-backup-latest-<etiqueta>.json`); "Importar da pasta (outros aparelhos)" soma ao
navegador os arquivos dos outros (a soma não duplica nem apaga nada). É manual de propósito: não há sincronização em segundo plano.
Funciona onde há a API de pastas (Chrome/Edge no computador).

Use **Backup (JSON)** no painel da home e **Restaurar backup** no outro aparelho
(*Somar* junta aos dados existentes; *Substituir* troca tudo). Não há sincronização automática: seria preciso um servidor.

## Privacidade

Todas as páginas têm `noindex, nofollow`, o que pede aos buscadores que não as listem. Isso **não torna o site privado**:
quem tiver o endereço consegue abri-lo. Para restringir o acesso é preciso um repositório privado com Pages num plano que
permita, ou outro serviço com senha.
