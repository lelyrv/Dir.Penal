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
| `articles.json`, `search-index.json`, `sw.js` | **Gerados** por `tools/build.py` (manifesto, busca de texto integral, modo offline). Não edite. |
| `study-tracker.js`, `study-bar.css` | Cronômetro de estudo, sessões, backup (JS) e visual da barra (CSS), compartilhados por todas as páginas. |
| `article-nav.js`, `article-tools.js` | Menu de atalhos adaptável, anterior/próximo, selo de conferência, copiar com fonte, modo audiência, PDF por seção. |
| `search.js`, `vm-data.js`, `session-banner.js`, `dashboard.js`, `em-breve.js`, `pwa.js` | Busca (Ctrl+K), dados compartilhados, aviso de sessão, extras da home, itens "em breve", registro do offline. |
| `fonts/`, `fonts.css`, `vendor/`, `icons/`, `manifest.webmanifest` | Fontes e gráfico locais (sem depender de servidor externo) e dados do app instalável. |
| `tools/` | `build.py` (gerador), `fetch_fonts.py`, `sw.template.js`, `icon.html`. |
| `tests/` | Testes automáticos (veja abaixo). |
| `arquivo/` | Material antigo guardado. |

## Como publicar um artigo novo

1. Crie o arquivo `XX-ART-N.html` copiando a estrutura do último artigo da mesma matéria (a barra de estudo, os `data-*` do
   `#vm-study-bar`, o cabeçalho com a data de conferência e a seção de pontos recorrentes são lidos pelas ferramentas).
2. Se o artigo ainda não está no menu, acrescente-o em `catalog.json` (grupo, rótulo e posição).
3. Rode `python tools/build.py`. Ele atualiza menus, manifesto, busca, versões dos scripts e o modo offline.
4. Rode `node tests/run.mjs` (ou só `node tests/run.mjs static`). Faça o commit e o push.

Artigos listados no catálogo mas sem arquivo aparecem como **"em breve"** (sem link, sem erro 404). Uma página só com o aviso
`id="em-elaboracao"` também aparece como "em breve".

> A data de "última conferência" exibida e usada nos alertas vem do cabeçalho ou do rodapé da página
> (ex.: "Atualização conferida em 12/11/2026"). Ao reconferir um artigo, atualize esse texto.

## Testes

Precisam de Python 3, Node 22+ e um Chrome ou Edge (detectado sozinho; ou defina `BROWSER` com o caminho do executável).

```
python tools/build.py --check     # gerador em dia? (não grava nada)
node tests/run.mjs                # todas as suítes
node tests/run.mjs timer a11y     # só algumas: static timer layout a11y pages features offline
```

O GitHub roda isso a cada push (`.github/workflows/tests.yml`).

## Recursos

- **Busca**: `Ctrl+K` (ou `/`) em qualquer página; texto integral, ignora acentos e maiúsculas.
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
trocar de aparelho apaga tudo. Use **Backup (JSON)** no painel da home e **Restaurar backup** no outro aparelho
(*Somar* junta aos dados existentes; *Substituir* troca tudo). Não há sincronização automática: seria preciso um servidor.

## Privacidade

Todas as páginas têm `noindex, nofollow`, o que pede aos buscadores que não as listem. Isso **não torna o site privado**:
quem tiver o endereço consegue abri-lo. Para restringir o acesso é preciso um repositório privado com Pages num plano que
permita, ou outro serviço com senha.
