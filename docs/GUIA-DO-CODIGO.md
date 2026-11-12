# Guia do código

Estas anotações explicam o caminho de um PDF dentro do projeto e onde mexer em cada parte.

## Arquivos principais

| Arquivo | O que faz |
| --- | --- |
| `index.html` | Monta a tela com os botões, campos e configurações. |
| `css/style.css` | Define cores, fontes, espaçamentos e ajustes para celular. |
| `js/app.js` | Lê os arquivos, procura as informações e prepara os downloads. |
| `README.md` | Apresenta o projeto e explica como usar. |
| `.gitignore` | Deixa temporários e a pasta `documentos-pessoais/` fora do Git. Não remove arquivos já adicionados ao histórico. |

O JavaScript encontra os elementos pelo `id`. Por exemplo, `saveNamingBtn` é o botão que salva o formato dos nomes. Os cartões dos documentos são criados por `render()`, por isso parte dos textos da tela está em `app.js`.

As configurações usam `<details>` e `<summary>` para abrir e fechar. No CSS, as cores principais ficam em `:root`, e os blocos `@media` ajustam o layout para telas menores.

As bibliotecas são carregadas no final do HTML, antes de `app.js`. Para usar o projeto, abra `index.html`: esse JavaScript depende do navegador e não roda sozinho com Node.

## Da seleção ao download

1. `handleFiles()` recebe os PDFs e cria um registro para cada arquivo.
2. `runQueue()` processa um documento por vez. Ao pausar, o arquivo atual termina e os próximos aguardam.
3. `processFile()` abre o PDF com PDF.js e tenta ler o texto.
4. Se necessário, `ocrPage()` transforma a página em imagem e usa Tesseract para reconhecer o texto.
5. As funções de detecção procuram tipo, data, cidade e setor.
6. `buildName()` monta o nome, e `getReviewIssues()` aponta as pendências.
7. `render()` mostra os resultados e permite corrigir os campos antes de baixar.

## Dados dos documentos

`items` guarda os documentos carregados. `queue` guarda os que ainda esperam pela leitura. Cada documento tem um objeto com informações como estas:

```javascript
const documento = {
  originalName: 'scan001.pdf',
  tipo: 'MEMORANDO',
  data: '29-10-2026',
  cidade: 'Ferraz de Vasconcelos',
  setor: 'Departamento de TI',
  status: 'ok',
  method: 'texto',
  newName: 'Memorando - 29-10-2026.pdf'
};
```

Esse exemplo está resumido. O objeto real também guarda o arquivo original em `file`, o texto extraído, a prévia e os erros de leitura.

| Estado | Significado |
| --- | --- |
| `queued` | Esperando na fila. |
| `processing` | Sendo lido. |
| `ok` | Nenhuma pendência encontrada pelas regras. |
| `warn` | Precisa de revisão. |

Quando um campo é corrigido, ele recebe uma marca como `tipoEdited` ou `cidadeEdited`. Assim, reaplicar as configurações não apaga a correção. O estado `ok` não garante que a informação encontrada esteja certa.

## Leitura e OCR

`processFile()` tenta extrair texto de até duas páginas e pode parar quando passa de 4.000 caracteres. `extractTextWithLines()` mantém as quebras de linha para ajudar a separar os cabeçalhos.

Se houver menos de 40 caracteres úteis, o programa tenta OCR na primeira página. A segunda só entra se a primeira retornar menos de 20 caracteres e houver outra página. Quando há texto, mas falta tipo, data ou a informação extra escolhida, há uma tentativa complementar de OCR na primeira página.

`getOcrWorker()` prepara e reutiliza o Tesseract em português. Antes da leitura, `boostContrastForOcr()` aumenta o contraste da imagem. As mensagens do Tesseract alimentam o indicador de progresso.

O OCR transforma imagem em texto. Depois, as regras do aplicativo procuram os campos nesse texto. O conteúdo original do PDF não é alterado.

## Regras de detecção

**Tipo:** `TIPOS_PADRAO` é a lista inicial. `normalizeDetectionText()` trata espaços, pontuação, acentos e maiúsculas. `buildDetectionRules()` prioriza termos longos, como `MEMORANDO CIRCULAR`, antes dos mais curtos. `detectarTipo()` procura termos completos, sem confundir `ATA` com uma parte de `DATA`. Editar a lista muda a busca, sem treinar o OCR.

**Data:** `detectarData()` usa expressões regulares para reconhecer datas numéricas e por extenso. `MESES` relaciona nomes e abreviações aos números. `isValidDate()` confere o calendário, incluindo anos bissextos. `parseUserDate()` valida o que foi digitado. O nome usa `DD-MM-AAAA`, e os anos aceitos vão de 1990 a 2099. Se houver várias datas, a regra pode escolher uma diferente da desejada.

**Cidade e setor:** `detectLocation()` procura pistas como `Prefeitura Municipal de`, `Cidade:` e `Departamento de`. `cleanLocationCandidate()` limpa os trechos encontrados. `chooseLocationCandidate()` compara as opções de maior prioridade; se houver valores diferentes empatados, deixa o campo para revisão. `detectLocationFields()` calcula cidade e setor separadamente e respeita as correções manuais. Trocar a opção do nome reaproveita o texto já lido, sem iniciar outro OCR só por essa troca.

## Nomes e preferências

`namingOptions` guarda a ordem, o prefixo e a escolha entre cidade, setor ou nenhum. `buildName()` junta essas partes. `sanitize()` e `safeSegment()` removem caracteres incompatíveis, limitam tamanhos e tratam nomes reservados.

| Chave no `localStorage` | O que guarda |
| --- | --- |
| `renomeadorPdf.detectionTerms.v1` | Lista de termos. |
| `renomeadorPdf.naming.v1` | Ordem, prefixo e cidade/setor. |

Os PDFs e as correções por documento ficam só na memória. Ao recarregar a página, é preciso selecionar os arquivos novamente. Se o navegador bloquear o salvamento das preferências, elas valem apenas durante aquela sessão.

`readImportedTerms()` confere o JSON importado. Importar termos ou restaurar os padrões preenche o editor; é preciso clicar em **Salvar termos** para aplicar.

## Revisão e downloads

`getReviewIssues()` procura campos ausentes, datas inválidas, informações ambíguas e falhas de leitura. `refreshItemStatus()` atualiza o estado, e `paintRowReview()` atualiza os avisos enquanto você digita.

| Função | O que faz |
| --- | --- |
| `downloadSingle()` | Baixa uma cópia com o nome sugerido. |
| `downloadAllZip()` | Monta o ZIP com pastas por tipo de documento. |
| `saveAllToFolder()` | Pede uma pasta e grava as cópias nela. |
| `claimUniqueName()` | Acrescenta `(1)`, `(2)` etc. quando o nome está ocupado. |
| `getOutputFolder()` | Encontra ou cria a subpasta de cada tipo. |
| `createUnusedFile()` | Confere se o nome está livre antes de criar o arquivo. |

`exportSnapshot()` separa os documentos processados e os nomes usados na exportação. O filtro da tela não limita o download: **Baixar todos** inclui os processados, mesmo os que precisam de revisão. Arquivos ainda na fila ficam de fora.

Ao salvar em pasta, o programa consulta os nomes que existem naquele momento. No download individual, o próprio navegador controla a gravação.

## Onde mexer primeiro

| Para mudar… | Procure… |
| --- | --- |
| Textos fixos e botões | `index.html` |
| Cores e espaçamentos | `css/style.css` |
| Tipos iniciais | `TIPOS_PADRAO` |
| Regras de datas | `detectarData()` e `isValidDate()` |
| Cidade e setor | `detectLocation()` e `cleanLocationCandidate()` |
| Formato do nome | `buildName()` |
| Cartões dos documentos | `render()` e eventos de `list` |
| Fila e pausa | `runQueue()` e `processFile()` |
| Organização dos downloads | `downloadAllZip()`, `getFolderName()` e `saveAllToFolder()` |

Para começar com uma alteração pequena, troque o separador de `join(' - ')` dentro de `buildName()` e confira como fica o nome sugerido.
