# Testes manuais (o que os testes automáticos não cobrem)

Os testes em `tests/` rodam em Chromium (Edge/Chrome) controlado por script. Eles **não** substituem o que está abaixo.
Estes roteiros ainda **não foram executados** por ninguém: são a lista do que falta conferir em aparelhos reais.
Marque a data e o resultado ao fazer cada um.

## 1. Safari / iOS (iPhone e iPad)

Endereço: o site publicado (`https://`), não o arquivo do disco.

- [ ] Home abre sem rolagem horizontal; o menu das matérias funciona.
- [ ] Abrir `L9099-ART-65.html`: a barra do cronômetro fica fixa no topo, sem cortar o menu de seções.
- [ ] Iniciar, pausar e finalizar uma sessão; o tempo continua correto depois de bloquear a tela por 1 minuto.
- [ ] Menu **Mais ▾** (ou "Ferramentas") abre e fecha ao tocar fora; nenhum botão fica flutuando sobre o texto.
- [ ] Tamanho da letra e tema escuro aplicam e permanecem ao recarregar.
- [ ] Buscar (botão no menu Ferramentas): digitar, abrir resultado.
- [ ] Marcar e anotar uma seção; fechar a aba e reabrir: nota e marca continuam.
- [ ] Treino: avaliar três cartões; conferir que a contagem de "para revisar" muda.
- [ ] Compartilhar > "Adicionar à Tela de Início": o ícone e o nome aparecem; abrir o app pelo ícone.
- [ ] Ativar modo avião e reabrir o app: páginas já visitadas carregam (offline).
- [ ] Observação conhecida do Safari: dados do site podem ser apagados após cerca de 7 dias sem uso (política de
      prevenção de rastreamento). Por isso o **Backup (JSON)** é importante nesse navegador.

## 2. Leitor de tela real (NVDA no Windows, VoiceOver no iOS/macOS)

Os testes automáticos conferem rótulos, papéis e foco, mas não a leitura em voz.

- [ ] Home: a ordem de leitura (título, matérias, painel de estudo) faz sentido.
- [ ] Artigo: "Pular para o conteúdo" é anunciado e funciona.
- [ ] Barra de estudo: o cronômetro é anunciado de forma útil e **não** fica falando a cada segundo.
- [ ] Botão **Ferramentas**: anuncia "recolhido/expandido"; Esc fecha e devolve o foco ao botão.
- [ ] Seções: os botões "Marcar" e "Nota" dizem a qual seção pertencem.
- [ ] Modo audiência: entrada e saída anunciadas; "Sair do modo audiência" alcançável pelo teclado.
- [ ] Citações de súmulas/teses: o balão abre por teclado e é lido.
- [ ] Calculadoras: campos com rótulo; o resultado é anunciado ao calcular.
- [ ] Treino: pergunta, resposta e botões de avaliação lidos na ordem certa.

## 3. Android (Chrome) — instalação e offline

- [ ] Menu do Chrome > "Instalar app": o ícone (maskable) não é cortado de forma feia.
- [ ] Abrir instalado, ir ao modo avião, abrir artigos visitados e a busca.
- [ ] Publicar uma versão nova do site: o aviso "nova versão" aparece e o recarregamento atualiza.

## 4. Imprimir / Salvar como PDF

- [ ] Artigo inteiro: a barra do cronômetro, o menu e as ferramentas não aparecem; nenhuma página em branco no final.
- [ ] "PDF" de uma seção: só a seção sai, com a fonte e a data de conferência.
- [ ] Fluxogramas e quadros coloridos mantêm o fundo (ativar "Elementos gráficos de segundo plano").

## 5. Tema escuro

O tema escuro é **experimental**: o teste de contraste mede cerca de 80 pontos abaixo do mínimo WCAG em cada artigo
testado no escuro (o tema claro da Lei 9.099 e das ferramentas está com zero). Conferir visualmente antes de usar em
audiência.

## 6. Quando algo falhar

Anote: aparelho, navegador e versão, endereço da página, o que esperava e o que viu (com captura de tela se possível).
