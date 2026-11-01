# Painel da Gincana – EAC Barbacena

Painel em HTML (arquivo único, sem instalação) que mostra o placar da gincana do EAC Barbacena (Encontro de Adolescentes com Cristo),
a composição das equipes e o **detalhamento de cada ponto** de cada missão.
Tudo é alimentado por arquivos CSV na pasta `dados/`.

> Passo a passo completo e ilustrado: abra o arquivo **`GUIA.html`** (ou `GUIA.pdf`).

## Como abrir

**Opção 1 – direto no navegador (sem internet nem servidor)**
1. Dê dois cliques em `index.html`.
2. Clique em **Carregar CSVs** e selecione os 6 arquivos da pasta `dados/` (ou arraste-os).
3. Sempre que alterar um CSV, carregue-o de novo (pode carregar só o arquivo alterado).

**Opção 2 – com servidor local (atualiza sozinho a cada 30 s, ideal para o telão)**
```bash
cd EACPainel
python3 -m http.server 8000
```
Abra `http://localhost:8000`. Basta salvar o CSV e o painel se atualiza.
> Se você tiver carregado CSVs manualmente antes, clique em **Limpar CSVs** para voltar a ler a pasta `dados/`.

**Opção 3 – online pelo GitHub Pages**
Endereço: https://roncalli.github.io/EACPainel/
Edite o CSV direto no GitHub (abra o arquivo em `dados/` → ícone de lápis → *Commit changes*).
Em 1 a 2 minutos o site é republicado e o painel aberto se atualiza sozinho (relê os dados a cada 30 s).

Os CSVs podem ser editados no Excel/LibreOffice/Google Planilhas. O separador pode ser
`;` ou `,` e números aceitam vírgula decimal. **Não renomeie os arquivos.**

## Arquivos de dados (`dados/`)

| Arquivo | Para que serve | Colunas |
|---|---|---|
| `equipes.csv` | Identidade de cada equipe | `id; nome; cor; cor_hex; logo; grito_de_guerra` |
| `integrantes.csv` | Líder e equipe | `equipe; nome; funcao` (`Líder` ou `Membro`) |
| `missoes.csv` | Missões e regra de pontos | `id; nome; descricao; tipo; pontos_1; pontos_2; julgamento` |
| `alimentos.csv` | Valor de cada tipo de alimento | `alimento; unidade; pontos_por_unidade` |
| `arrecadacao.csv` | Lançamentos da Missão 1 | `equipe; alimento; quantidade; observacao` |
| `resultados.csv` | Colocações das demais missões | `missao; equipe; colocacao; observacao` |

### Identidade visual (Missão 2)
Depois da Missão 2, coloque a imagem da equipe em `dados/logos/` (ex.: `dados/logos/azul.png`),
preencha a coluna `logo` com esse caminho, ajuste `nome`, `cor_hex` e `grito_de_guerra`
em `equipes.csv`. O nome, a cor e o logo passam a identificar a equipe no painel todo.

### Missão 1 – Arrecadação de alimentos
- Cada linha de `arrecadacao.csv` é uma entrega (várias linhas do mesmo alimento são somadas).
- Pontos = quantidade × `pontos_por_unidade` do alimento em `alimentos.csv`.
- O painel mostra, por equipe, quantidade, pontos por unidade e subtotal de cada alimento, o total e a equipe vencedora da etapa.
- Opcional: `pontos_1` da missão 1 em `missoes.csv` vira um bônus para a equipe vencedora da arrecadação (está 0).
- O nome do alimento precisa ser igual ao de `alimentos.csv` (maiúsculas e acentos não importam). Se não for, o painel mostra um aviso.

### Missões 2 a 7 – Colocação
Lance em `resultados.csv` a colocação (1 ou 2) de cada equipe. Os pontos vêm de `pontos_1`/`pontos_2`
de `missoes.csv`:

| Missão | 1º lugar | 2º lugar |
|---|---|---|
| 2 – Identidade Visual e Grito de Guerra (jurados) | 100 | 50 |
| 3 – Representatividade da cor (jurados) | 100 | 50 * |
| 4 – Grito de Guerra (jurados) | 100 | 50 |
| 5 – Queimada | 100 | 50 |
| 6 – Circuito | 500 | 0 |
| 7 – Dinâmica (jurados) | 100 | 50 |

\* A pontuação da Missão 3 não foi definida; ajuste em `missoes.csv` se necessário.

Missão sem lançamento aparece como **pendente**. Em caso de empate, lance as duas equipes com colocação 1.

## Transparência
- **Pontuação por missão**: quadro resumo com os pontos de cada equipe por missão.
- **Detalhamento das missões**: regra de pontuação + lançamentos de cada missão.
- **Extrato de pontos**: cada lançamento que compõe o placar, com o total de cada equipe.
- **Avisos**: equipes ou alimentos digitados errado aparecem em destaque no topo.

Os dados de exemplo (nomes e quantidades) são fictícios — substitua pelos reais.

## Resultado Final
No fim do painel há o botão **Resultado Final**. Ele só fica habilitado quando **todas as missões**
têm resultado lançado (a Missão 1 precisa de alimentos registrados e as demais de colocações em
`resultados.csv`). Ao clicar, abre a página de encerramento com a mensagem aos adolescentes:
quem venceu foi a solidariedade (com o total de alimentos arrecadados), todos os participantes
e Cristo, além das passagens bíblicas (1Tm 4,12; Mt 25,40; Mt 5,16; Mt 18,20). O placar oficial
aparece discretamente para registro, e o botão **Voltar ao painel** retorna ao placar.

Os textos da mensagem ficam na função `paginaFinal` do `index.html`. Confira a redação dos
versículos com a edição da Bíblia usada pelo grupo.

Para testar a página antes do evento, carregue `dados/exemplos/resultados.csv` (todas as missões concluídas)
pelo botão **Carregar CSVs**; depois clique em **Limpar CSVs** para voltar.
