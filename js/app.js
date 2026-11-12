if (typeof pdfjsLib !== 'undefined') pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
let ocrWorkerPromise = null;
let ocrContext = null;
function getOcrWorker() {
  if (!ocrWorkerPromise) {
    if (typeof Tesseract === 'undefined') throw new Error('ocr-library-unavailable');
    ocrWorkerPromise = Tesseract.createWorker('por', 1, {
      logger: message => {
        if (!ocrContext || !items.includes(ocrContext.item)) return;
        const { item, page } = ocrContext;
        if (message.status === 'recognizing text') {
          const percent = Math.round(Math.max(0, Math.min(1, Number(message.progress) || 0)) * 100);
          item.statusText = `OCR da página ${page}: ${percent}%`;
        } else item.statusText = `Preparando OCR da página ${page}…`;
        updateCurrentProgress();
      }
    }).catch(error => { ocrWorkerPromise = null; throw error; });
  }
  return ocrWorkerPromise;
}
async function renderPageToCanvas(pdf, pageNum, scale) {
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

function boostContrastForOcr(canvas) {
  // Aumenta o contraste para tentar melhorar a leitura de textos fracos.
  const ctx = canvas.getContext('2d');
  const { width: w, height: h } = canvas;
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;
  const factor = 1.6;
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const v = Math.min(255, Math.max(0, (gray - 128) * factor + 128));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

async function ocrPage(pdf, pageNum, item) {
  if (item && !items.includes(item)) return '';
  let canvas;
  ocrContext = item ? { item, page: pageNum } : null;
  if (item) { item.statusText = `Preparando OCR da página ${pageNum}…`; updateCurrentProgress(); }
  try {
    canvas = await renderPageToCanvas(pdf, pageNum, 3.8);
    boostContrastForOcr(canvas);
    const worker = await getOcrWorker();
    if (item && !items.includes(item)) return '';
    const { data } = await worker.recognize(canvas);
    return data.text || '';
  } finally {
    ocrContext = null;
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}
async function loadPreview(item) {
  let pdf;
  item.previewLoading = true;
  try {
    pdf = await pdfjsLib.getDocument({ data: await item.file.arrayBuffer() }).promise;
    const canvas = await renderPageToCanvas(pdf, 1, 1.4);
    item.previewDataUrl = canvas.toDataURL('image/png');
    canvas.width = 0; canvas.height = 0;
    item.previewError = false;
  } catch (err) { item.previewError = true; }
  finally {
    item.previewLoading = false;
    if (pdf && pdf.destroy) { try { await pdf.destroy(); } catch (err) {} }
  }
  if (items.includes(item)) render();
}
const TIPOS_PADRAO = [
  "TERMO DE RETIRADA DE MATERIAIS",
  "TERMO DE UTILIZAÇÃO DE WI-FI",
  "TERMO DE UTILIZACAO DE WI-FI",
  "TERMO DE UTILIZAÇÃO DE WIFI",
  "TERMO DE UTILIZACAO DE WIFI",
  "TERMO DE UTILIZAÇÃO DE INTERNET",
  "TERMO DE UTILIZACAO DE INTERNET",
  "TERMO DE LAUDO TÉCNICO",
  "TERMO DE LAUDO TECNICO",
  "LAUDO TÉCNICO",
  "LAUDO TECNICO",
  "TERMO DE DOAÇÃO",
  "TERMO DE DOACAO",
  "TERMO DE RETIRADA",
  "TERMO DE DEVOLUÇÃO",
  "TERMO DE DEVOLUCAO",
  "TERMO DE ENTREGA",
  "TERMO DE RESPONSABILIDADE",
  "TERMO DE POSSE",
  "TERMO DE ABERTURA",
  "TERMO DE ENCERRAMENTO",
  "MEMORANDO CIRCULAR",
  "MEMORANDO",
  "OFÍCIO CIRCULAR",
  "OFICIO CIRCULAR",
  "OFÍCIO",
  "OFICIO",
  "ATA DE REUNIÃO",
  "ATA DE REUNIAO",
  "ATA",
  "CONTRATO",
  "ADITIVO CONTRATUAL",
  "RELATÓRIO",
  "RELATORIO",
  "REQUERIMENTO",
  "DECLARAÇÃO",
  "DECLARACAO",
  "COMUNICADO",
  "PARECER",
  "CIRCULAR",
  "PORTARIA",
  "EDITAL",
  "NOTIFICAÇÃO",
  "NOTIFICACAO",
  "PROCURAÇÃO",
  "PROCURACAO",
  "ATESTADO",
  "CERTIDÃO",
  "CERTIDAO",
  "AUTO DE INFRAÇÃO",
  "AUTO DE INFRACAO"
].sort((a,b) => b.length - a.length);

const DETECTION_TERMS_KEY = 'renomeadorPdf.detectionTerms.v1';
let termsStorageNotice = '';
let detectionTerms = loadDetectionTerms();
let detectionRules = buildDetectionRules(detectionTerms);

function normalizeDetectionText(text) {
  return stripAccents(text).toUpperCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function parseDetectionTerms(value) {
  const seen = new Set();
  return value.split(/\r?\n/).map(line => normalizeWhitespace(line).toUpperCase()).filter(term => {
    const key = normalizeDetectionText(term);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildDetectionRules(terms) {
  return terms.map(label => ({ label, key: normalizeDetectionText(label) }))
    .sort((a, b) => b.key.length - a.key.length);
}

function loadDetectionTerms() {
  try {
    const stored = localStorage.getItem(DETECTION_TERMS_KEY);
    if (stored !== null) {
      const terms = JSON.parse(stored);
      if (!Array.isArray(terms) || !terms.every(term => typeof term === 'string')) throw new Error('Lista inválida');
      const parsed = parseDetectionTerms(terms.join('\n'));
      if (!parsed.length) throw new Error('Lista vazia');
      return parsed;
    }
  } catch (err) {
    termsStorageNotice = 'Não foi possível recuperar os termos salvos. Os padrões foram carregados; você pode editar e usar a lista nesta sessão.';
  }
  return parseDetectionTerms(TIPOS_PADRAO.join('\n'));
}

const MESES = {
  "janeiro":"01","jan":"01",
  "fevereiro":"02","fev":"02",
  "março":"03","marco":"03","mar":"03",
  "abril":"04","abr":"04",
  "maio":"05","mai":"05",
  "junho":"06","jun":"06",
  "julho":"07","jul":"07",
  "agosto":"08","ago":"08",
  "setembro":"09","set":"09",
  "outubro":"10","out":"10",
  "novembro":"11","nov":"11",
  "dezembro":"12","dez":"12"
};


let items = [];
let idCounter = 0;
let queue = [];
let queueRunning = false;
let queuePaused = false;
let activeItem = null;
let viewFilter = 'all';
let exportBusy = false;
let importSequence = 0;
const isInIframe = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();
const NAMING_KEY = 'renomeadorPdf.naming.v1';
let namingNotice = '';
let namingOptions = loadNamingOptions();
const byId = id => document.getElementById(id);
const dropzone = byId('dropzone');
const fileInput = byId('fileInput');
const folderInput = byId('folderInput');
const filesBtn = byId('filesBtn');
const list = byId('list');
const toolbar = byId('toolbar');
const emptyMsg = byId('emptyMsg');
const countEl = byId('count');
const iframeWarning = byId('iframeWarning');
const detectionTermsInput = byId('detectionTerms');
const detectionCount = byId('detectionCount');
const detectionStatus = byId('detectionStatus');

function notifyUser(message, state = 'success') {
  const el = byId('appNotice');
  el.textContent = message;
  el.dataset.state = state;
  el.hidden = !message;
}
function setDetectionStatus(message, state = '') {
  detectionStatus.textContent = message;
  detectionStatus.dataset.state = state;
}
function updateDetectionEditor() {
  detectionTermsInput.value = detectionTerms.join('\n');
  detectionCount.textContent = `${detectionTerms.length} termo${detectionTerms.length === 1 ? '' : 's'} ativo${detectionTerms.length === 1 ? '' : 's'}`;
}
function applyDetectionTermsToItems() {
  let updated = 0;
  for (const item of items) {
    if (isPending(item) || item.tipoEdited || typeof item.detectedText !== 'string') continue;
    const tipo = detectarTipo(item.detectedText);
    if (tipo === item.tipo) continue;
    item.tipo = tipo;
    refreshItemStatus(item);
    updateNewName(item);
    updated++;
  }
  render();
  return updated;
}
byId('saveDetectionBtn').addEventListener('click', () => {
  const terms = parseDetectionTerms(detectionTermsInput.value);
  if (!terms.length) {
    setDetectionStatus('Digite pelo menos um termo. A lista anterior continua ativa.', 'error');
    detectionTermsInput.focus();
    return;
  }
  detectionTerms = terms;
  detectionRules = buildDetectionRules(terms);
  updateDetectionEditor();
  const updated = applyDetectionTermsToItems();
  const result = updated ? ` ${updated} documento${updated === 1 ? '' : 's'} atualizado${updated === 1 ? '' : 's'}.` : '';
  try {
    localStorage.setItem(DETECTION_TERMS_KEY, JSON.stringify(terms));
    setDetectionStatus('Termos salvos neste navegador e aplicados à detecção.' + result, 'success');
  } catch (err) {
    setDetectionStatus('Termos aplicados nesta sessão. O navegador não permitiu guardá-los para a próxima vez.' + result, 'error');
  }
});
byId('resetDetectionBtn').addEventListener('click', () => {
  detectionTermsInput.value = parseDetectionTerms(TIPOS_PADRAO.join('\n')).join('\n');
  setDetectionStatus('Padrões carregados no campo. Clique em Salvar termos para aplicar.');
});
detectionTermsInput.addEventListener('input', () => setDetectionStatus('Alterações ainda não salvas. Clique em Salvar termos para aplicar.'));
byId('exportTermsBtn').addEventListener('click', () => {
  const content = JSON.stringify({ app: 'renomeador-pdfs', version: 1, terms: detectionTerms }, null, 2);
  triggerDownload(new Blob([content], { type: 'application/json;charset=utf-8' }), 'termos-renomeador-pdfs.json');
  setDetectionStatus('Lista salva exportada. Use Importar termos no outro computador.', 'success');
});
byId('importTermsBtn').addEventListener('click', () => byId('importTermsInput').click());
function readImportedTerms(text) {
  const payload = JSON.parse(text);
  const values = Array.isArray(payload) ? payload :
    payload && payload.app === 'renomeador-pdfs' && payload.version === 1 ? payload.terms : null;
  if (!Array.isArray(values) || !values.length || values.length > 2000 ||
      !values.every(value => typeof value === 'string' && value.length <= 500)) {
    throw new Error('Lista de termos inválida');
  }
  const terms = parseDetectionTerms(values.join('\n'));
  if (!terms.length) throw new Error('Lista vazia');
  return terms;
}
byId('importTermsInput').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const sequence = ++importSequence;
  try {
    if (file.size > 1024 * 1024) throw new Error('Arquivo muito grande');
    const terms = readImportedTerms(await file.text());
    if (sequence !== importSequence) return;
    detectionTermsInput.value = terms.join('\n');
    setDetectionStatus(`${terms.length} termos importados no campo. Confira a lista e clique em Salvar termos para aplicar.`);
    detectionTermsInput.focus();
  } catch (err) {
    if (sequence === importSequence) setDetectionStatus('Não foi possível importar. Escolha um arquivo JSON de termos exportado pelo app, com até 1 MB. Sua lista foi mantida.', 'error');
  }
});

function loadNamingOptions() {
  const fallback = { order: 'type-date', prefix: '', location: 'none' };
  try {
    const raw = localStorage.getItem(NAMING_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!parsed || !['type-date', 'date-type'].includes(parsed.order) || typeof parsed.prefix !== 'string') throw new Error('Formato inválido');
    return { order: parsed.order, prefix: sanitize(parsed.prefix).slice(0, 60), location: getLocationMode(parsed) };
  } catch (err) {
    namingNotice = 'Formato padrão carregado. Você pode editar e usar as opções nesta sessão.';
    return fallback;
  }
}
function namingDraft() {
  return { order: byId('nameOrder').value === 'date-type' ? 'date-type' : 'type-date', prefix: sanitize(byId('namePrefix').value).slice(0, 60), location: getLocationMode({ location: byId('nameLocation').value }) };
}
function setNamingStatus(message, state = '') {
  byId('namingStatus').textContent = message;
  byId('namingStatus').dataset.state = state;
}
function updateNamingExample() {
  byId('nameExample').textContent = buildName({ tipo: 'MEMORANDO', data: '29-10-2026', cidade: 'Ferraz de Vasconcelos', setor: 'Departamento de TI' }, namingDraft());
}
function updateNamingEditor() {
  byId('nameOrder').value = namingOptions.order;
  byId('namePrefix').value = namingOptions.prefix;
  byId('nameLocation').value = getLocationMode();
  byId('namingSummary').textContent = (namingOptions.order === 'date-type' ? 'Data - Tipo' : 'Tipo - Data') + (namingOptions.prefix ? ' · com prefixo' : '') + (getLocationMode() === 'none' ? '' : ' · ' + getLocationMode());
  updateNamingExample();
}
for (const id of ['nameOrder', 'namePrefix', 'nameLocation']) byId(id).addEventListener('input', () => {
  updateNamingExample();
  setNamingStatus('Clique em Salvar formato para aplicar.');
});
byId('saveNamingBtn').addEventListener('click', () => {
  namingOptions = namingDraft();
  updateNamingEditor();
  items.forEach(item => {
    detectLocationFields(item);
    refreshItemStatus(item);
    updateNewName(item);
  });
  render();
  try {
    localStorage.setItem(NAMING_KEY, JSON.stringify(namingOptions));
    setNamingStatus('Formato salvo e aplicado aos nomes dos documentos.', 'success');
  } catch (err) {
    setNamingStatus('Formato aplicado nesta sessão. O navegador não permitiu guardá-lo para a próxima vez.', 'error');
  }
});
byId('resetNamingBtn').addEventListener('click', () => {
  byId('nameOrder').value = 'type-date';
  byId('namePrefix').value = '';
  byId('nameLocation').value = 'none';
  updateNamingExample();
  setNamingStatus('Padrão carregado. Clique em Salvar formato para aplicar.');
});
updateDetectionEditor();
setDetectionStatus(termsStorageNotice || 'Os termos salvos ficam disponíveis ao reabrir este arquivo no mesmo navegador.', termsStorageNotice ? 'error' : '');
updateNamingEditor();
setNamingStatus(namingNotice || 'O formato salvo vale para os PDFs atuais e os próximos.', namingNotice ? 'error' : '');

if (isInIframe) iframeWarning.style.display = 'block';
dropzone.addEventListener('click', e => {
  if (e.target === filesBtn || e.target === folderInput || e.target === fileInput) return;
  if (isInIframe) {
    notifyUser('Para usar pastas, baixe este HTML e abra no Chrome ou Edge. Nesta prévia, use Selecionar arquivos.');
    return;
  }
  folderInput.click();
});
filesBtn.addEventListener('click', e => { e.stopPropagation(); fileInput.click(); });
dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag'));
dropzone.addEventListener('drop', async e => {
  e.preventDefault();
  dropzone.classList.remove('drag');
  try {
    const entries = e.dataTransfer.items;
    handleFiles(entries && entries.length && entries[0].webkitGetAsEntry ? await collectFilesFromDataTransfer(entries) : e.dataTransfer.files);
  } catch (err) {
    notifyUser('Não foi possível abrir essa pasta. Tente o botão Selecionar arquivos.', 'error');
  }
});
fileInput.addEventListener('change', e => { handleFiles(e.target.files); fileInput.value = ''; });
folderInput.addEventListener('change', e => { handleFiles(e.target.files); folderInput.value = ''; });
byId('clearBtn').addEventListener('click', () => {
  if (exportBusy) return;
  items = []; queue = []; queuePaused = false; viewFilter = 'all';
  notifyUser(''); render();
});
byId('downloadAllBtn').addEventListener('click', downloadAllZip);
byId('saveToFolderBtn').addEventListener('click', saveAllToFolder);
byId('pauseBtn').addEventListener('click', () => {
  if (queuePaused) { queuePaused = false; runQueue(); }
  else queuePaused = true;
  renderSummary();
});
byId('filterAllBtn').addEventListener('click', () => { viewFilter = 'all'; render(); });
byId('filterReviewBtn').addEventListener('click', () => { viewFilter = 'review'; render(); });

list.addEventListener('input', e => {
  const input = e.target;
  if (!input.matches('input[data-key]')) return;
  const item = items.find(value => value.id === Number(input.dataset.id));
  if (!item || isPending(item)) return;
  const key = input.dataset.key;
  if (!['tipo', 'data', 'cidade', 'setor'].includes(key)) return;
  item[key] = input.value;
  item[key + 'Edited'] = true;
  if (key === 'cidade' || key === 'setor') item[key + 'Ambiguous'] = false;
  if (sanitize(item.tipo) && parseUserDate(item.data)) item.readError = '';
  refreshItemStatus(item);
  updateNewName(item);
  paintRowReview(input.closest('.row'), item);
  renderSummary();
});
list.addEventListener('change', e => {
  const input = e.target;
  if (!input.matches('input[data-key="data"]')) return;
  const item = items.find(value => value.id === Number(input.dataset.id));
  if (!item || isPending(item)) return;
  const normalized = parseUserDate(item.data);
  if (normalized) { item.data = normalized; input.value = normalized; }
});
list.addEventListener('focusout', e => {
  if (viewFilter !== 'review') return;
  const row = e.target.closest('.row');
  setTimeout(() => {
    if (viewFilter === 'review' && row && row.isConnected && !row.contains(document.activeElement)) render();
  }, 0);
});
list.addEventListener('click', async e => {
  const button = e.target.closest('button[data-action]');
  if (!button || button.disabled) return;
  const item = items.find(value => value.id === Number(button.dataset.id));
  if (!item) return;
  if (button.dataset.action === 'toggle-preview') {
    item.previewOpen = !item.previewOpen;
    render();
    if (item.previewOpen && !item.previewDataUrl && !item.previewLoading) loadPreview(item);
  } else if (button.dataset.action === 'download') {
    downloadSingle(item);
  } else if (button.dataset.action === 'remove' && !exportBusy) {
    items = items.filter(value => value !== item);
    queue = queue.filter(value => value !== item);
    if (!items.some(isPending)) queuePaused = false;
    render();
  }
});

async function collectFilesFromDataTransfer(dtItems) {
  const entries = Array.from(dtItems).map(value => value.webkitGetAsEntry()).filter(Boolean);
  const files = [];
  async function walk(entry) {
    if (entry.isFile) {
      files.push(await new Promise((resolve, reject) => entry.file(resolve, reject)));
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      while (true) {
        const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
        if (!batch.length) break;
        for (const child of batch) await walk(child);
      }
    }
  }
  for (const entry of entries) await walk(entry);
  return files;
}
function isPending(item) { return item.status === 'queued' || item.status === 'processing'; }
function handleFiles(fileList) {
  const files = Array.from(fileList).filter(file => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'));
  if (!files.length) { notifyUser('Nenhum PDF encontrado. Selecione arquivos com a extensão .pdf.', 'error'); return; }
  notifyUser('');
  for (const file of files) {
    const item = { id: ++idCounter, file, originalName: file.name, tipo: '', data: '', cidade: '', setor: '', status: 'queued', statusText: '', method: '', stamped: false, readError: '' };
    updateNewName(item);
    items.push(item); queue.push(item);
  }
  render();
  runQueue();
}
async function runQueue() {
  if (queueRunning || queuePaused) return;
  queueRunning = true;
  try {
    while (queue.length && !queuePaused) {
      const item = queue.shift();
      if (!items.includes(item)) continue;
      activeItem = item;
      item.status = 'processing';
      await processFile(item);
      activeItem = null;
    }
  } finally {
    activeItem = null;
    queueRunning = false;
    if (!queue.length) queuePaused = false;
    render();
  }
}
async function processFile(item) {
  let pdf;
  item.readError = '';
  try {
    item.statusText = 'Lendo texto do PDF…';
    render();
    if (typeof pdfjsLib === 'undefined') throw new Error('pdf-library-unavailable');
    const buf = await item.file.arrayBuffer();
    if (!items.includes(item)) return;
    pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    let text = '';
    for (let pageNum = 1; pageNum <= Math.min(2, pdf.numPages); pageNum++) {
      if (!items.includes(item)) return;
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      text += extractTextWithLines(content.items) + '\n';
      if (text.length > 4000) break;
    }
    item.method = 'texto';
    item.detectedText = text;
    if (text.trim().length < 40) {
      item.method = 'ocr';
      const scannedText = await ocrPage(pdf, 1, item);
      item.detectedText += '\n' + scannedText;
      if (scannedText.trim().length < 20 && pdf.numPages > 1 && items.includes(item)) item.detectedText += '\n' + await ocrPage(pdf, 2, item);
    }
    if (!items.includes(item)) return;
    if (!item.tipoEdited) item.tipo = detectarTipo(item.detectedText);
    if (!item.dataEdited) item.data = detectarData(item.detectedText);
    detectLocationFields(item);
    const selectedLocation = getLocationMode();
    if (item.method === 'texto' && (!item.tipo || !item.data || (selectedLocation !== 'none' && !item[selectedLocation] && !item[selectedLocation + 'Edited']))) {
      item.detectedText += '\n' + await ocrPage(pdf, 1, item);
      item.method = 'texto + ocr';
    }
    // Reaplica os termos, caso a lista tenha mudado durante o OCR.
    if (!item.tipoEdited) item.tipo = detectarTipo(item.detectedText);
    if (!item.dataEdited) item.data = detectarData(item.detectedText);
    detectLocationFields(item);
  } catch (err) {
    item.readError = err && err.name === 'PasswordException' ? 'PDF protegido por senha.' :
      'Não foi possível concluir a leitura. Confira o documento e preencha os campos.';
    if (typeof item.detectedText === 'string') {
      if (!item.tipoEdited) item.tipo = detectarTipo(item.detectedText);
      if (!item.dataEdited) item.data = detectarData(item.detectedText);
      detectLocationFields(item);
    }
    item.method = item.method || 'erro';
  } finally {
    if (pdf && pdf.destroy) { try { await pdf.destroy(); } catch (err) {} }
  }
  if (!items.includes(item)) return;
  item.statusText = '';
  item.status = 'warn';
  refreshItemStatus(item);
  updateNewName(item);
  render();
}
function getLocationMode(options = namingOptions) {
  return options && ['cidade', 'setor'].includes(options.location) ? options.location : 'none';
}
function getLocationLabel(mode) { return mode === 'cidade' ? 'Cidade' : 'Setor/departamento'; }
function extractTextWithLines(textItems) {
  let result = '';
  let previousY = null;
  for (const part of textItems) {
    if (typeof part.str !== 'string') continue;
    const y = Array.isArray(part.transform) ? part.transform[5] : null;
    if (part.str && Number.isFinite(y) && Number.isFinite(previousY) && Math.abs(y - previousY) > Math.max(3, Math.abs(part.height || 0) * 0.5) && !result.endsWith('\n')) result += '\n';
    if (part.str) result += part.str + ' ';
    if (part.hasEOL && !result.endsWith('\n')) result = result.trimEnd() + '\n';
    if (part.str && Number.isFinite(y)) previousY = y;
  }
  return result.trim();
}
function locationLines(text) {
  return String(text || '').normalize('NFC').replace(/\r\n?/g, '\n').replace(/[\u200b-\u200d\ufeff]/g, '').split(/[\n|]/)
    .flatMap(line => {
      // Separa cidade e setor quando o PDF junta os dois na mesma linha.
      if (/^\s*(?:prefeitura|municipio|camara municipal)\b/i.test(stripAccents(line))) {
        return line.split(/\s+(?=(?:secretaria|departamento|setor|diretoria|divis[aã]o)\b)/i);
      }
      return [line];
    }).map(line => normalizeWhitespace(line).replace(/^[•*\-–—]+\s*/, '')).filter(Boolean);
}
function formatLocationLabel(value) {
  if (value !== value.toUpperCase()) return value;
  const smallWords = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E']);
  const acronyms = new Set(['TI', 'RH', 'DP', 'SUS', 'UBS', 'CRAS', 'CREAS']);
  return value.split(' ').map(word => smallWords.has(word) ? word.toLowerCase() : acronyms.has(word) ? word : word.charAt(0) + word.slice(1).toLowerCase()).join(' ');
}
function cleanLocationCandidate(value, mode) {
  let result = normalizeWhitespace(value).replace(/^[:\-–—\s]+/, '');
  const stop = mode === 'cidade' ?
    /(?:\s+|[,;])(?=(?:secretaria|departamento|setor|diretoria|divisao|prefeitura|municipio|estado|cnpj|cep|telefone|fone|tel\b|memorando|oficio|termo|data\b|assunto|endereco|rua|avenida|av\b|em\s+\d)\b)/i :
    /(?:\s+|[,;])(?=(?:secretaria|departamento|setor|diretoria|divisao|prefeitura|cnpj|cep|telefone|fone|tel\b|memorando|oficio|termo|data\b|assunto|endereco|para\s*:|destinatario|responsavel\s*:|matricula)\b)/i;
  const stopIndex = stripAccents(result).search(stop);
  if (stopIndex >= 0) result = result.slice(0, stopIndex);
  result = result.split(/[;|]/)[0].trim();
  if (mode === 'cidade') {
    result = result.split(',')[0].replace(/\s+\d.*$/, '').trim();
    result = result.replace(/\s*(?:[-–—/]\s*|\(\s*|\s+)(?:AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\s*\)?\s*$/i, '').trim();
    if (!/^[\p{L}][\p{L}\s.'’\-]{1,79}$/u.test(result)) return '';
    if (/\b(?:cidade|municipio|estado|prefeitura|secretaria|departamento|data|brasil|republica|assinatura|documento)\b/i.test(stripAccents(result))) return '';
    if (result.split(/\s+/).length > 10) return '';
  } else {
    if (!/[\p{L}]/u.test(result) || result.length > 120 || /[@<>]|https?:|www\./i.test(result)) return '';
    if (/^(?:de|da|do|das|dos|setor|departamento|secretaria|diretoria|nao informado|nao identificado)$/i.test(stripAccents(result))) return '';
  }
  result = result.replace(/[\s,;:.\-–—]+$/, '');
  return formatLocationLabel(result);
}
function chooseLocationCandidate(candidates) {
  if (!candidates.length) return { value: '', ambiguous: false };
  const bestRank = Math.min(...candidates.map(candidate => candidate.rank));
  const distinct = new Map();
  for (const candidate of candidates.filter(candidate => candidate.rank === bestRank)) {
    const key = normalizeDetectionText(candidate.value);
    if (!distinct.has(key)) distinct.set(key, candidate.value);
  }
  return distinct.size === 1 ? { value: distinct.values().next().value, ambiguous: false } : { value: '', ambiguous: true };
}
function detectLocation(text, mode) {
  const lines = locationLines(text);
  const candidates = [];
  const patterns = mode === 'cidade' ? [
    { rank: 0, re: /\b(?:prefeitura(?:\s+municipal)?|camara\s+municipal)(?:\s+da\s+estancia\s+(?:turistica|hidromineral))?\s+(?:de|do|da)\s+(.+)$/i },
    { rank: 1, re: /^(?:cidade|municipio|localidade)(?:\s+de\s+(?:origem|emissao))?\s*[:\-–—]\s*(.+)$/i },
    { rank: 1, re: /^municipio\s+de\s+(.+)$/i }
  ] : [
    { rank: 0, re: /^(?:setor|departamento|unidade)\s+(?:de\s+)?origem\s*[:\-–—]\s*(.+)$/i },
    { rank: 0, re: /^(?:de|origem|emitente)\s*[:\-–—]\s*((?:setor|departamento|secretaria|diretoria|divisao|gerencia|coordenadoria|coordenacao|gabinete)\b.+)$/i },
    { rank: 1, re: /^setor(?:\s+responsavel)?\s*[:\-–—]\s*(.+)$/i },
    { rank: 1, re: /^(setor\s+(?:de|da|do|das|dos)\s+.+)$/i },
    { rank: 1, re: /^(setor\s+(?:administrativo|financeiro|juridico|tecnico|pessoal|contabil|comercial|operacional|tributario|patrimonial|TI|RH))\s*$/i },
    { rank: 2, re: /^departamento\s*[:\-–—]\s*(.+)$/i },
    { rank: 2, re: /^(departamento(?:\s+municipal)?\s+(?:de|da|do|das|dos)\s+.+)$/i },
    { rank: 2, re: /^(departamento\s+(?:administrativo|financeiro|juridico|tecnico|pessoal|contabil|comercial|operacional|tributario|patrimonial|TI|RH))\s*$/i },
    { rank: 3, re: /^(?:diretoria|divisao|gerencia|coordenadoria|coordenacao|unidade)\s*[:\-–—]\s*(.+)$/i },
    { rank: 3, re: /^((?:diretoria|divisao|gerencia|coordenadoria|coordenacao)(?:\s+municipal)?\s+(?:de|da|do|das|dos)\s+.+)$/i },
    { rank: 4, re: /^secretaria(?:\s+municipal)?\s*[:\-–—]\s*(.+)$/i },
    { rank: 4, re: /^(secretaria(?:\s+municipal)?\s+(?:de|da|do|das|dos)\s+.+)$/i },
    { rank: 5, re: /^(gabinete\s+(?:de|da|do)\s+.+)$/i }
  ];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const folded = stripAccents(line);
    // Ignora o destinatário para não confundir com a origem do documento.
    if (/^(?:para|destino|destinatario|ao|aos|a|as)\s*[:\-–—]?\s+(?:secretaria|departamento|setor|prefeitura)\b/i.test(folded)) continue;
    for (const { rank, re } of patterns) {
      const match = re.exec(folded);
      if (!match) continue;
      const offset = match.index + match[0].length - match[1].length;
      const value = cleanLocationCandidate(line.slice(offset, offset + match[1].length), mode);
      if (value) candidates.push({ value, rank });
    }
    // O valor de campos como "Setor:" pode estar na linha seguinte.
    const label = mode === 'cidade' ? /^(cidade|municipio|localidade)\s*:?$/i : /^(setor|departamento|secretaria|diretoria|divisao)\s*:?$/i;
    const labelMatch = label.exec(folded);
    if (labelMatch && lines[index + 1]) {
      const next = lines[index + 1];
      if (!/^(?:data|memorando|oficio|termo|prefeitura|secretaria|departamento|setor)\b/i.test(stripAccents(next))) {
        const value = cleanLocationCandidate(next, mode);
        const ranks = { setor: 1, departamento: 2, diretoria: 3, divisao: 3, secretaria: 4 };
        if (value) candidates.push({ value, rank: mode === 'cidade' ? 1 : ranks[labelMatch[1].toLowerCase()] });
      }
    }
    if (mode === 'cidade') {
      const dateLine = /^(.{2,90}?),\s*(\d.*)$/.exec(line);
      if (dateLine && detectarData(dateLine[2])) {
        const value = cleanLocationCandidate(dateLine[1], mode);
        if (value) candidates.push({ value, rank: 2 });
      }
    }
  }
  return chooseLocationCandidate(candidates);
}
function detectLocationFields(item) {
  if (typeof item.detectedText !== 'string') return;
  for (const mode of ['cidade', 'setor']) {
    if (item[mode + 'Edited']) continue;
    const result = detectLocation(item.detectedText, mode);
    item[mode] = result.value;
    item[mode + 'Ambiguous'] = result.ambiguous;
  }
}

function parseUserDate(value) {
  const text = String(value || '').trim();
  let match = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2}|\d{4})$/);
  if (match && isValidDate(match[1], match[2], match[3])) return formatDate(match[1], match[2], match[3]);
  match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match && isValidDate(match[3], match[2], match[1])) return formatDate(match[3], match[2], match[1]);
  return '';
}
function getReviewIssues(item) {
  const issues = [];
  if (!sanitize(item.tipo || '')) issues.push('Tipo não identificado');
  if (!String(item.data || '').trim()) issues.push('Data não identificada');
  else if (!parseUserDate(item.data)) issues.push('Data inválida — use uma data real no formato dd-mm-aaaa');
  const mode = getLocationMode();
  if (mode !== 'none' && !sanitize(item[mode])) {
    issues.push(item[mode + 'Ambiguous'] ? 'Mais de uma opção encontrada para ' + getLocationLabel(mode).toLowerCase() + '. Preencha o campo para confirmar.' : getLocationLabel(mode) + (mode === 'cidade' ? ' não identificada' : ' não identificado'));
  }
  if (item.readError) issues.push(item.readError);
  return issues;
}
function refreshItemStatus(item) {
  if (!isPending(item)) item.status = getReviewIssues(item).length ? 'warn' : 'ok';
}

function normalizeWhitespace(text) {
  return text.replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim();
}

function detectarTipo(text) {
  const normalized = ' ' + normalizeDetectionText(text) + ' ';
  for (const rule of detectionRules) {
    if (normalized.includes(' ' + rule.key + ' ')) return rule.label;
  }
  return '';
}

function stripAccents(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function isValidDate(d, mo, y) {
  if (!/^\d{1,2}$/.test(String(d)) || !/^\d{1,2}$/.test(String(mo)) || !/^(\d{2}|\d{4})$/.test(String(y))) return false;
  const day = Number(d), month = Number(mo);
  const year = String(y).length === 2 ? 2000 + Number(y) : Number(y);
  if (year < 1990 || year > 2099 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function formatDate(d, mo, y) {
  if (String(y).length === 2) y = '20' + y;
  return `${String(d).padStart(2, '0')}-${String(mo).padStart(2, '0')}-${y}`;
}

function detectarData(rawText) {
  const text = normalizeWhitespace(rawText);
  const MONTH_RE = '([a-zA-ZÀ-ÿ]{3,12})';

  // Testa ano-mês-dia primeiro para não confundir com dia-mês-ano.
  let re = /\b(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\b/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (isValidDate(m[3], m[2], m[1])) return formatDate(m[3], m[2], m[1]);
  }

  // Data depois do local, como "Suzano, 15 de julho de 2026". O OCR pode omitir "de".
  re = new RegExp(',\\s*(\\d{1,2})\\s*(?:de)?\\s+' + MONTH_RE + '\\s*(?:de)?\\s+(\\d{4})', 'gi');
  while ((m = re.exec(text)) !== null) {
    const mes = MESES[stripAccents(m[2].toLowerCase())];
    if (mes && isValidDate(m[1], mes, m[3])) return formatDate(m[1], mes, m[3]);
  }

  // Data por extenso em qualquer parte do texto.
  re = new RegExp('\\b(\\d{1,2})\\s*(?:de)?\\s+' + MONTH_RE + '\\s*(?:de)?\\s+(\\d{4})\\b', 'gi');
  while ((m = re.exec(text)) !== null) {
    const mes = MESES[stripAccents(m[2].toLowerCase())];
    if (mes && isValidDate(m[1], mes, m[3])) return formatDate(m[1], mes, m[3]);
  }

  // Aceita mês abreviado, como "24/AGO/2026".
  re = new RegExp('\\b(\\d{1,2})[\\/\\-\\s]\\s*' + MONTH_RE + '[\\/\\-\\s]\\s*(\\d{2,4})\\b', 'gi');
  while ((m = re.exec(text)) !== null) {
    const mes = MESES[stripAccents(m[2].toLowerCase())];
    if (mes && isValidDate(m[1], mes, m[3])) return formatDate(m[1], mes, m[3]);
  }

  // Aceita alguns caracteres extras que o OCR pode inserir depois de "Data:".
  re = /data[:\s]{0,3}[^\d\n]{0,12}?(\d{1,2})[\/\-.\s](\d{1,2})[\/\-.\s](\d{2,4})/gi;
  while ((m = re.exec(text)) !== null) {
    if (isValidDate(m[1], m[2], m[3])) return formatDate(m[1], m[2], m[3]);
  }

  // Se os outros formatos não aparecerem, usa a primeira data numérica válida.
  re = /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/g;
  while ((m = re.exec(text)) !== null) {
    if (isValidDate(m[1], m[2], m[3])) return formatDate(m[1], m[2], m[3]);
  }

  return '';
}



function sanitize(str) {
  return String(str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '').trim().replace(/[. ]+$/g, '');
}
function safeSegment(str, fallback) {
  let result = sanitize(str).slice(0, 120).replace(/[. ]+$/g, '') || fallback;
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(result)) result = '_' + result;
  return result;
}
function toTitleCase(str) {
  return normalizeWhitespace(str).split(' ').map(word => word.length > 2 ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : word.toLowerCase()).join(' ');
}
function buildName(item, options = namingOptions) {
  let type = safeSegment(toTitleCase(item.tipo || ''), 'Documento');
  const date = parseUserDate(item.data);
  const mode = getLocationMode(options);
  const extra = mode === 'none' ? '' : safeSegment(item[mode] || '', '').slice(0, 80).replace(/[. ]+$/g, '');
  const prefix = sanitize(options.prefix).slice(0, 60);
  // Encurta o tipo quando o nome inclui prefixo, data e cidade ou setor.
  if (extra) type = type.slice(0, Math.max(24, 230 - prefix.length - date.length - extra.length - 9)).replace(/[. ]+$/g, '');
  const parts = options.order === 'date-type' ? [date, type] : [type, date];
  if (prefix) parts.unshift(prefix);
  if (extra) parts.push(extra);
  return parts.filter(Boolean).join(' - ') + '.pdf';
}
function updateNewName(item) {
  const next = buildName(item);
  if (item.newName && item.newName !== next) { item.stamped = false; item.lastSavedName = ''; }
  item.newName = next;
}
function getFolderName(item) { return safeSegment(toTitleCase(item.tipo || ''), 'Nao identificado'); }
function renderSummary() {
  const pending = items.filter(isPending).length;
  const done = items.length - pending;
  const review = items.filter(item => item.status === 'warn').length;
  toolbar.style.display = items.length ? 'flex' : 'none';
  countEl.textContent = `${items.length} arquivo${items.length === 1 ? '' : 's'} · ${review} para revisar`;
  byId('listFilters').hidden = !items.length;
  byId('allCount').textContent = items.length;
  byId('reviewCount').textContent = review;
  byId('filterAllBtn').setAttribute('aria-pressed', String(viewFilter === 'all'));
  byId('filterReviewBtn').setAttribute('aria-pressed', String(viewFilter === 'review'));
  byId('progressPanel').hidden = !items.length;
  byId('progressLabel').textContent = `${done} de ${items.length} arquivo${items.length === 1 ? '' : 's'} processado${items.length === 1 ? '' : 's'}`;
  byId('batchProgress').max = Math.max(1, items.length);
  byId('batchProgress').value = done;
  const active = activeItem && items.includes(activeItem) && isPending(activeItem);
  const pause = byId('pauseBtn');
  pause.hidden = !pending;
  pause.disabled = queuePaused && Boolean(active);
  pause.textContent = queuePaused ? (active ? 'Interrompendo…' : 'Continuar') : 'Interromper';
  byId('progressDetail').textContent = pending ?
    (queuePaused ? (active ? 'A fila será pausada após concluir o arquivo atual.' : `${pending} na fila. Clique em Continuar para retomar.`) : 'Você pode interromper a fila; o arquivo em leitura será concluído.') :
    (review ? `${review} documento${review === 1 ? '' : 's'} precisa${review === 1 ? '' : 'm'} de revisão. Use o filtro acima da lista.` : 'Leitura concluída. Confira os nomes e escolha como salvar.');
  updateCurrentProgress();
  byId('downloadAllBtn').disabled = exportBusy || !done;
  byId('saveToFolderBtn').disabled = exportBusy || !done;
  byId('clearBtn').disabled = exportBusy;
  byId('downloadAllBtn').textContent = pending ? `Baixar processados (${done}) .zip` : 'Baixar todos (.zip)';
  byId('saveToFolderBtn').textContent = pending ? 'Salvar processados numa pasta' : 'Salvar direto numa pasta';
}
function updateCurrentProgress() {
  const item = activeItem && items.includes(activeItem) && isPending(activeItem) ? activeItem : null;
  byId('currentFileProgress').hidden = !item;
  byId('currentFileProgress').textContent = item ? `${item.originalName} — ${item.statusText || 'Lendo…'}` : '';
}
function paintRowReview(row, item) {
  if (!row) return;
  const issues = getReviewIssues(item);
  const note = row.querySelector('.review-note');
  note.textContent = issues.join(' · ');
  note.hidden = !issues.length;
  row.querySelector('[data-key="tipo"]').setAttribute('aria-invalid', String(!sanitize(item.tipo)));
  row.querySelector('[data-key="data"]').setAttribute('aria-invalid', String(!parseUserDate(item.data)));
  const mode = getLocationMode();
  const extraInput = mode === 'none' ? null : row.querySelector(`[data-key="${mode}"]`);
  if (extraInput) extraInput.setAttribute('aria-invalid', String(!sanitize(item[mode])));
  row.querySelector('.name').textContent = item.newName;
  const badge = row.querySelector('.status-tag');
  badge.textContent = item.status === 'ok' ? 'reconhecido' : 'revisar';
  badge.className = 'status-tag ' + (item.status === 'ok' ? 'status-ok' : 'status-warn');
  row.querySelector('.stamp-mark').classList.toggle('show', Boolean(item.stamped));
  row.querySelector('.saved-note').hidden = !item.lastSavedName || item.lastSavedName === item.newName;
}
function render() {
  const focused = document.activeElement;
  const focusInfo = focused && list.contains(focused) && focused.matches('input[data-key]') ?
    { id: focused.dataset.id, key: focused.dataset.key, start: focused.selectionStart, end: focused.selectionEnd } : null;
  renderSummary();
  const visible = items.filter(item => viewFilter === 'all' || item.status === 'warn' || (focusInfo && String(item.id) === focusInfo.id));
  emptyMsg.style.display = visible.length ? 'none' : 'block';
  emptyMsg.textContent = !items.length ? 'Nenhum arquivo carregado ainda.' : 'Nenhum documento precisa de revisão no momento.';
  list.innerHTML = visible.map(item => {
    const pending = isPending(item);
    const locationMode = getLocationMode();
    const issues = pending ? [] : getReviewIssues(item);
    const method = { ocr: 'via OCR', texto: 'texto do PDF', 'texto + ocr': 'texto + OCR' }[item.method] || '';
    const statusText = item.status === 'queued' ? 'na fila' : item.status === 'processing' ? 'lendo…' : item.status === 'ok' ? 'reconhecido' : 'revisar';
    const statusClass = item.status === 'ok' ? 'status-ok' : pending ? '' : 'status-warn';
    return `<div class="row${pending ? ' processing' : ''}" data-row-id="${item.id}">
      <div class="orig"><span>${escapeHtml(item.originalName)}</span>${method ? `<span class="method-tag">${method}</span>` : ''}</div>
      <div class="fields">
        <div class="field"><label for="type-${item.id}">Tipo de documento</label><input id="type-${item.id}" type="text" data-id="${item.id}" data-key="tipo" value="${escapeAttr(item.tipo)}" placeholder="${pending ? 'aguardando leitura…' : 'não identificado'}" aria-invalid="${!pending && !sanitize(item.tipo)}" aria-describedby="review-${item.id}" ${pending ? 'disabled' : ''}></div>
        <div class="field"><label for="date-${item.id}">Data</label><input id="date-${item.id}" type="text" inputmode="numeric" data-id="${item.id}" data-key="data" value="${escapeAttr(item.data)}" placeholder="dd-mm-aaaa" aria-invalid="${!pending && !parseUserDate(item.data)}" aria-describedby="review-${item.id}" ${pending ? 'disabled' : ''}></div>
        ${locationMode === 'none' ? '' : `<div class="field extra-field"><label for="location-${item.id}">${getLocationLabel(locationMode)}</label><input id="location-${item.id}" type="text" maxlength="120" data-id="${item.id}" data-key="${locationMode}" value="${escapeAttr(item[locationMode])}" placeholder="${pending ? 'aguardando leitura…' : 'Não identificado — digite aqui'}" aria-invalid="${!pending && !sanitize(item[locationMode])}" aria-describedby="review-${item.id}" ${pending ? 'disabled' : ''}></div>`}
      </div>
      <p class="review-note" id="review-${item.id}" ${issues.length ? '' : 'hidden'}>${escapeHtml(issues.join(' · '))}</p>
      <div class="newname"><span class="name">${escapeHtml(item.newName)}</span><span class="status-tag ${statusClass}">${statusText}</span>
        <div class="row-actions"><button type="button" class="preview-toggle ${item.previewOpen ? 'open' : ''}" data-action="toggle-preview" data-id="${item.id}" aria-label="Ver documento" aria-expanded="${Boolean(item.previewOpen)}" title="Ver documento"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg></button><button type="button" class="small secondary" data-action="download" data-id="${item.id}" ${pending || exportBusy ? 'disabled' : ''}>Baixar</button><button type="button" class="small secondary" data-action="remove" data-id="${item.id}" ${exportBusy ? 'disabled' : ''}>Remover</button></div>
      </div>
      <p class="saved-note" ${item.lastSavedName && item.lastSavedName !== item.newName ? '' : 'hidden'}>Salvo como: ${escapeHtml(item.lastSavedName || '')}</p>
      ${item.previewOpen ? `<div class="preview-panel">${item.previewDataUrl ? `<img src="${item.previewDataUrl}" alt="Prévia de ${escapeAttr(item.originalName)}">` : `<div class="loading">${item.previewError ? 'Não foi possível carregar a prévia.' : 'Carregando prévia…'}</div>`}</div>` : ''}
      <div class="stamp-mark ${item.stamped ? 'show' : ''}">RENOMEADO</div>
    </div>`;
  }).join('');
  if (focusInfo) {
    const input = list.querySelector(`input[data-id="${focusInfo.id}"][data-key="${focusInfo.key}"]`);
    if (input && !input.disabled) { input.focus({ preventScroll: true }); input.setSelectionRange(focusInfo.start, focusInfo.end); }
  }
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename;
  document.body.appendChild(link);
  link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function downloadSingle(item) {
  if (isPending(item) || exportBusy) return;
  triggerDownload(item.file, item.newName);
  item.stamped = true;
  item.lastSavedName = item.newName;
  render();
}
function nameKey(name) { return name.normalize('NFC').toLowerCase(); }
function claimUniqueName(base, occupied) {
  const extension = /\.pdf$/i.test(base) ? base.slice(-4) : '';
  const stem = extension ? base.slice(0, -4) : base;
  let candidate = base;
  let index = 1;
  while (occupied.has(nameKey(candidate))) candidate = `${stem} (${index++})${extension}`;
  occupied.add(nameKey(candidate));
  return candidate;
}
function exportSnapshot() {
  return items.filter(item => !isPending(item)).map(item => ({ item, file: item.file, name: item.newName, folder: getFolderName(item) }));
}
function markExported(entry, actualName) {
  if (items.includes(entry.item) && entry.item.newName === entry.name) {
    entry.item.stamped = true;
    entry.item.lastSavedName = actualName;
  }
}
function exportResultMessage(count, renamed, pending, location) {
  return `${count} PDF${count === 1 ? '' : 's'} ${location}.` +
    (renamed ? ` ${renamed} nome${renamed === 1 ? '' : 's'} ajustado${renamed === 1 ? '' : 's'} para evitar duplicatas.` : '') +
    (pending ? ` ${pending} arquivo${pending === 1 ? '' : 's'} ainda na fila não ${pending === 1 ? 'foi incluído' : 'foram incluídos'}.` : '');
}
async function downloadAllZip() {
  if (exportBusy) return;
  const snapshot = exportSnapshot();
  if (!snapshot.length) return;
  const pending = items.filter(isPending).length;
  exportBusy = true;
  render();
  notifyUser('Preparando o arquivo ZIP…');
  try {
    if (typeof JSZip === 'undefined') throw new Error('zip-library-unavailable');
    const zip = new JSZip();
    const folders = new Map();
    const saved = [];
    let renamed = 0;
    for (const entry of snapshot) {
      const key = nameKey(entry.folder);
      if (!folders.has(key)) folders.set(key, { name: entry.folder, occupied: new Set() });
      const folder = folders.get(key);
      const filename = claimUniqueName(entry.name, folder.occupied);
      if (filename !== entry.name) renamed++;
      zip.folder(folder.name).file(filename, await entry.file.arrayBuffer());
      saved.push([entry, filename]);
    }
    triggerDownload(await zip.generateAsync({ type: 'blob' }), 'documentos-renomeados.zip');
    for (const [entry, filename] of saved) markExported(entry, filename);
    notifyUser(exportResultMessage(snapshot.length, renamed, pending, 'incluído' + (snapshot.length === 1 ? '' : 's') + ' no ZIP'));
  } catch (err) {
    notifyUser('Não foi possível gerar o ZIP. Seus documentos continuam na lista; tente novamente.', 'error');
  } finally {
    exportBusy = false;
    render();
  }
}
async function getOutputFolder(root, requested, cache) {
  const key = nameKey(requested);
  if (cache.has(key)) return cache.get(key);
  const existing = new Map();
  for await (const [name, handle] of root.entries()) existing.set(nameKey(name), { name, handle });
  let candidate = requested;
  let index = 1;
  while (existing.has(nameKey(candidate)) && existing.get(nameKey(candidate)).handle.kind !== 'directory') candidate = `${requested} (${index++})`;
  const found = existing.get(nameKey(candidate));
  const handle = found ? found.handle : await root.getDirectoryHandle(candidate, { create: true });
  const name = found ? found.name : candidate;
  const occupied = new Set();
  for await (const [child] of handle.entries()) occupied.add(nameKey(child));
  const result = { handle, name, occupied, renamed: name !== requested };
  cache.set(key, result);
  return result;
}
async function createUnusedFile(folder, requested) {
  let candidate = claimUniqueName(requested, folder.occupied);
  // Confere de novo: outro arquivo pode ter sido criado na pasta.
  while (true) {
    let exists;
    try { await folder.handle.getFileHandle(candidate); exists = true; }
    catch (err) {
      if (err.name === 'NotFoundError') exists = false;
      else if (err.name === 'TypeMismatchError') exists = true;
      else throw err;
    }
    if (!exists) break;
    candidate = claimUniqueName(requested, folder.occupied);
  }
  return { name: candidate, handle: await folder.handle.getFileHandle(candidate, { create: true }) };
}
async function saveAllToFolder() {
  if (exportBusy) return;
  const snapshot = exportSnapshot();
  if (!snapshot.length) return;
  if (isInIframe || !window.showDirectoryPicker) {
    notifyUser('Para salvar numa pasta, abra este HTML no Chrome ou Edge. Você também pode usar Baixar todos (.zip).');
    return;
  }
  const pending = items.filter(isPending).length;
  let saved = 0;
  let renamed = 0;
  exportBusy = true;
  render();
  try {
    const root = await window.showDirectoryPicker({ mode: 'readwrite' });
    const folders = new Map();
    for (const entry of snapshot) {
      notifyUser(`Salvando ${saved + 1} de ${snapshot.length} PDFs. Nomes já existentes receberão um sufixo.`);
      const folder = await getOutputFolder(root, entry.folder, folders);
      const file = await createUnusedFile(folder, entry.name);
      const writable = await file.handle.createWritable();
      try {
        await writable.write(await entry.file.arrayBuffer());
        await writable.close();
      } catch (err) {
        try { if (writable.abort) await writable.abort(); } catch (abortError) {}
        throw err;
      }
      saved++;
      if (file.name !== entry.name || folder.renamed) renamed++;
      markExported(entry, file.name);
    }
    notifyUser(exportResultMessage(saved, renamed, pending, 'salvo' + (saved === 1 ? '' : 's') + ' na pasta') + ' Os arquivos que já existiam foram preservados.');
  } catch (err) {
    if (err.name === 'AbortError' && !saved) notifyUser('Seleção de pasta cancelada. Seus documentos continuam na lista.');
    else notifyUser(`Não foi possível concluir o salvamento. ${saved} de ${snapshot.length} PDFs salvos. Confira a permissão e o espaço da pasta antes de tentar novamente.`, 'error');
  } finally {
    exportBusy = false;
    render();
  }
}
function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}
function escapeAttr(str) { return escapeHtml(str); }
render();
