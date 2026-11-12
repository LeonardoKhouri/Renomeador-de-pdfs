<div align="center">

<h1>📄 Renomeador de PDFs</h1>

<p>Uma forma mais prática de organizar seus documentos.</p>

<p>
  <img src="https://img.shields.io/badge/HTML5-18181B?style=for-the-badge&amp;logo=html5&amp;logoColor=E34F26" alt="HTML5">
  <img src="https://img.shields.io/badge/CSS3-18181B?style=for-the-badge&amp;logo=css&amp;logoColor=663399" alt="CSS3">
  <img src="https://img.shields.io/badge/JavaScript-18181B?style=for-the-badge&amp;logo=javascript&amp;logoColor=F7DF1E" alt="JavaScript">
  <img src="https://img.shields.io/badge/OCR-em_portugu%C3%AAs-8B5CF6?style=for-the-badge" alt="OCR em português">
</p>

<p>
  <a href="#sobre">Sobre</a> ·
  <a href="#recursos">Recursos</a> ·
  <a href="#comecar">Como usar</a> ·
  <a href="#codigo">Código</a> ·
  <a href="#limites">Limitações</a>
</p>

</div>

---

<a id="sobre"></a>

## Sobre o projeto

Criei este projeto para ajudar na rotina do meu trabalho atual, automatizando a organização e a renomeação de PDFs. A ideia é reduzir o trabalho de abrir cada documento para identificar o conteúdo e mudar o nome manualmente, principalmente quando há vários arquivos com nomes como `scan001.pdf` ou `documento (2).pdf`.

Você adiciona os arquivos, o programa procura o tipo do documento e a data e sugere um nome. Também dá para incluir a cidade ou o setor/departamento. Depois, é só conferir os resultados, corrigir o que precisar e baixar.

| Antes | Depois |
| :--- | :--- |
| `scan001.pdf` | `Memorando - 29-10-2026 - Departamento de TI.pdf` |

> O aplicativo gera cópias com novos nomes e mantém o conteúdo dos PDFs. Todo o processamento dos documentos acontece no navegador.

<a id="recursos"></a>

## O que dá para fazer

| Recurso | Como ajuda |
| :--- | :--- |
| **Leitura de PDFs e OCR** | Extrai texto dos PDFs digitais e reconhece texto em documentos escaneados, em português. |
| **Vários arquivos de uma vez** | Aceita PDFs, seleção de pasta e arquivos arrastados para a página. Mostra o progresso e permite pausar e continuar a fila. |
| **Detecção personalizada** | Permite editar os tipos de documento procurados e importar ou exportar os termos em JSON. |
| **Nomes do seu jeito** | Dá para mudar a ordem, adicionar um prefixo e incluir cidade ou setor/departamento. |
| **Revisão antes de baixar** | Mostra a primeira página, permite corrigir os campos e filtra os documentos que precisam de atenção. |
| **Arquivos organizados** | Oferece download individual, ZIP com pastas por tipo e salvamento em uma pasta. No ZIP e na pasta, diferencia nomes repetidos com `(1)`, `(2)` etc. |

As configurações abrem e fecham para deixar a tela mais limpa. O layout também se adapta a telas menores.

<a id="comecar"></a>

## Como começar

1. Baixe o projeto. Se estiver em ZIP, extraia a pasta inteira.
2. Mantenha `index.html`, `css/` e `js/` juntos na pasta do projeto.
3. Abra `index.html` no navegador.

**Não precisa instalar pacotes.** É necessário ter internet para carregar as bibliotecas, as fontes e os recursos do OCR.

<details>
<summary><strong>O HTML não abriu corretamente? Use um servidor local</strong></summary>

Com Python instalado, abra o terminal na pasta do projeto e execute:

```bash
python -m http.server 8000 --bind 127.0.0.1
```

No Windows, caso o comando disponível seja `py`:

```powershell
py -m http.server 8000 --bind 127.0.0.1
```

Acesse [localhost:8000](http://localhost:8000) e deixe o terminal aberto durante o uso. Pressione `Ctrl+C` para encerrar. O Python só serve os arquivos da página; a leitura dos PDFs continua no navegador.

</details>

### Usando o renomeador

1. Abra **Formato dos nomes** se quiser mudar a ordem, colocar um prefixo ou incluir cidade ou setor. Clique em **Salvar formato**.
2. Para mudar os tipos de documento procurados, abra **Detecção de documentos / OCR**, escreva um termo por linha e clique em **Salvar termos**.
3. Adicione os PDFs e espere a leitura terminar. Se precisar pausar, clique em **Interromper**. O arquivo atual termina de ser lido e os próximos ficam esperando até você clicar em **Continuar**.
4. Confira os resultados. O filtro **Precisa revisar** ajuda a encontrar campos ausentes, dúvidas na detecção e datas inválidas. Você pode editar os campos manualmente.
5. Baixe os arquivos separados, em ZIP ou salve na pasta escolhida.

A opção de salvar direto em uma pasta depende do navegador e pede permissão de acesso. Se ela não estiver disponível, use o ZIP.

Alguns exemplos de nomes:

```text
Memorando - 29-10-2026.pdf
Memorando - 29-10-2026 - Ferraz de Vasconcelos.pdf
Prefeitura - 29-10-2026 - Memorando - Departamento de TI.pdf
```

O programa remove acentos e caracteres incompatíveis dos nomes. No ZIP, os arquivos ficam separados em pastas pelo tipo de documento.

<a id="codigo"></a>

## Por dentro do projeto

| Arquivo | Para que serve |
| --- | --- |
| `index.html` | Monta a página com os textos, botões e campos. Também carrega os outros arquivos. |
| `css/style.css` | Cuida das cores, fontes, tamanhos, espaçamentos e ajustes para telas menores. |
| `js/app.js` | Faz a leitura dos PDFs, a detecção, as correções e os downloads. |
| `README.md` | É esta apresentação, com as instruções de uso. |
| `docs/GUIA-DO-CODIGO.md` | Explica o funcionamento e as principais funções do código. |
| `.gitignore` | Indica quais arquivos locais e temporários não devem entrar no Git. |

Para entender melhor a parte de programação, deixei um [guia do código](docs/GUIA-DO-CODIGO.md).

### Tecnologias

Além de HTML, CSS e JavaScript, o projeto usa algumas bibliotecas para as partes mais específicas:

| Biblioteca | Uso no projeto |
| --- | --- |
| PDF.js `3.11.174` | Abre os PDFs, extrai o texto e transforma páginas em imagens. |
| Tesseract.js `@5` | Faz o OCR, reconhecendo texto nas imagens em português. |
| JSZip `3.10.1` | Junta os documentos em um arquivo ZIP. |
| Google Fonts | Carrega as fontes Source Serif 4, IBM Plex Sans e JetBrains Mono. |

As bibliotecas são carregadas por links no código, sem npm ou `package.json`. A referência `@5` do Tesseract fixa a versão principal, mas não uma atualização específica.

## O que fica salvo

Os termos e o formato dos nomes ficam salvos no navegador usando `localStorage`. Os PDFs, o texto extraído e as correções de cada documento ficam só na sessão: se você atualizar ou fechar a página, precisará adicionar os arquivos novamente.

O código do aplicativo não envia os PDFs para um servidor. As conexões externas servem para carregar as bibliotecas, as fontes e os recursos do OCR.

<details>
<summary><strong>Como levar meus termos para outro computador?</strong></summary>

Use **Exportar termos** e leve o JSON para o outro computador. Depois, clique em **Importar termos** e em **Salvar termos**.

Esse arquivo contém só a lista de termos, não o formato dos nomes. As preferências salvas podem variar conforme o navegador, o endereço ou o caminho usado para abrir o projeto.

</details>

<a id="limites"></a>

## Limitações

A detecção pode errar, então vale conferir os resultados antes de baixar. Alguns pontos desta versão:

- A leitura de texto considera até as duas primeiras páginas e pode parar antes se já encontrar bastante texto. O OCR começa pela primeira e só tenta a segunda se o retorno for muito curto.
- Documentos pouco nítidos, escritos à mão ou com formatos diferentes podem precisar de correção manual.
- Cidade e setor são encontrados por pistas no texto, como cabeçalhos e palavras como “Departamento”. Alguns documentos podem não seguir esses padrões.
- A validação aceita anos de 1990 a 2099. Se houver várias datas no documento, o programa pode escolher uma diferente da que você queria.
- O filtro **Precisa revisar** mostra os problemas que o programa conseguiu identificar. Um documento sem aviso ainda pode ter informações incorretas, e documentos com aviso também podem ser exportados.
- O OCR ajuda a sugerir o nome, mas não adiciona texto pesquisável ao PDF original.
- Muitos arquivos de uma vez, principalmente com OCR, podem deixar o processamento mais lento e consumir bastante memória.

<details>
<summary><strong>Vai mexer no código? Alguns testes úteis</strong></summary>

- Experimente um PDF com texto e outro escaneado.
- Confira a troca entre cidade e setor e a correção manual dos campos.
- Pause a fila e retome o processamento.
- Baixe o ZIP e confira os arquivos.
- Use dois documentos que gerem o mesmo nome para verificar os sufixos.

</details>

## Apoio de IA

Usei o ChatGPT como apoio no desenvolvimento do projeto, incluindo a implementação de partes do código, a revisão e a organização da documentação.

---

<div align="center">
  <p><strong>Leonardo Khouri</strong><br>Estudante de Análise e Desenvolvimento de Sistemas</p>
</div>
