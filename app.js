const SAMPLE_TEXT = `# 큰 제목

## 중간 제목

### 작은 제목

> 이건 인용문입니다.

"이 블록은 자동 줄바꿈이 강하게 적용돼요. 긴 문장이어도 화면 안에서 잘 끊어집니다."

*연한 강조* 와 **강한 강조** 도 함께 보여요.

[details: 접기 예시]
이 안 내용은 summary를 눌렀을 때 보입니다.
여러 줄도 들어갈 수 있어요.
[/details]`;

const DB_NAME = 'txt-reader-line-optimized-db';
const DB_VERSION = 1;
const BOOK_STORE = 'books';
const SETTING_STORE = 'settings';

const state = {
  books: [],
  currentBookId: null,
  currentBook: null,
  page: 0,
  pages: [],
  pageCacheKey: '',
  uiHidden: false,
  installPrompt: null,
  activeTab: 'theme',
  settings: {
    theme: 'sepia',
    fontSize: 17,
    lineHeight: 1.88,
    textColor: '#2e2419',
    wrap: false,
    italic: true,
    markerFilter: 'all',
    customFontName: '',
    customFontData: '',
    customFontFamily: '',
    recentBookId: ''
  }
};

const el = {
  libraryScreen: document.getElementById('libraryScreen'),
  readerScreen: document.getElementById('readerScreen'),
  bookList: document.getElementById('bookList'),
  emptyState: document.getElementById('emptyState'),
  libraryMenuBtn: document.getElementById('libraryMenuBtn'),
  readerMenuBtn: document.getElementById('readerMenuBtn'),
  importTxtBtnTop: document.getElementById('importTxtBtnTop'),
  importTxtBtnSheet: document.getElementById('importTxtBtnSheet'),
  reopenRecentBtnTop: document.getElementById('reopenRecentBtnTop'),
  reopenRecentBtnSheet: document.getElementById('reopenRecentBtnSheet'),
  installBtnTop: document.getElementById('installBtnTop'),
  installBtnSheet: document.getElementById('installBtnSheet'),
  installNote: document.getElementById('installNote'),
  updateAppBtn: document.getElementById('updateAppBtn'),
  updateNote: document.getElementById('updateNote'),
  goLibraryBtn: document.getElementById('goLibraryBtn'),
  txtInput: document.getElementById('txtInput'),
  fontInput: document.getElementById('fontInput'),
  fontUploadBtn: document.getElementById('fontUploadBtn'),
  resetFontBtn: document.getElementById('resetFontBtn'),
  fontStatus: document.getElementById('fontStatus'),
  readerTitle: document.getElementById('readerTitle'),
  readerSubtitle: document.getElementById('readerSubtitle'),
  reader: document.getElementById('reader'),
  pageLabel: document.getElementById('pageLabel'),
  progressLabel: document.getElementById('progressLabel'),
  readerHeader: document.getElementById('readerHeader'),
  bottomBar: document.getElementById('bottomBar'),
  tapLeft: document.getElementById('tapLeft'),
  tapCenter: document.getElementById('tapCenter'),
  tapRight: document.getElementById('tapRight'),
  menuSheet: document.getElementById('menuSheet'),
  sheetBackdrop: document.getElementById('sheetBackdrop'),
  tabBtns: Array.from(document.querySelectorAll('[data-tab]')),
  panels: Array.from(document.querySelectorAll('[data-panel]')),
  themeBtns: Array.from(document.querySelectorAll('[data-theme]')),
  filterBtns: Array.from(document.querySelectorAll('[data-filter]')),
  fontSizeRange: document.getElementById('fontSizeRange'),
  lineHeightRange: document.getElementById('lineHeightRange'),
  textColorInput: document.getElementById('textColorInput'),
  wrapToggleBtn: document.getElementById('wrapToggleBtn'),
  italicToggleBtn: document.getElementById('italicToggleBtn'),
  markerStats: document.getElementById('markerStats'),
  measureLine: document.getElementById('measureLine')
};

let db;
let saveSettingsTimer = null;
let saveProgressTimer = null;
let resizeTimer = null;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const upgradeDb = req.result;
      if (!upgradeDb.objectStoreNames.contains(BOOK_STORE)) {
        const store = upgradeDb.createObjectStore(BOOK_STORE, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt');
      }
      if (!upgradeDb.objectStoreNames.contains(SETTING_STORE)) {
        upgradeDb.createObjectStore(SETTING_STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function tx(store, mode='readonly') { return db.transaction(store, mode).objectStore(store); }
function idbGetAllBooks() {
  return new Promise((resolve, reject) => {
    const req = tx(BOOK_STORE).getAll();
    req.onsuccess = () => resolve((req.result || []).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0)));
    req.onerror = () => reject(req.error);
  });
}
function idbPutBook(book) {
  return new Promise((resolve, reject) => {
    const req = tx(BOOK_STORE, 'readwrite').put(book);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
function idbGetBook(id) {
  return new Promise((resolve, reject) => {
    const req = tx(BOOK_STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}
function idbDeleteBook(id) {
  return new Promise((resolve, reject) => {
    const req = tx(BOOK_STORE, 'readwrite').delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
function idbPutSetting(key, value) {
  return new Promise((resolve, reject) => {
    const req = tx(SETTING_STORE, 'readwrite').put({ key, value });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
function idbGetSetting(key) {
  return new Promise((resolve, reject) => {
    const req = tx(SETTING_STORE).get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : null);
    req.onerror = () => reject(req.error);
  });
}

function press(element, handler) {
  if (!element) return;
  element.addEventListener('pointerup', (e) => {
    e.preventDefault();
    handler(e);
  });
}
function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function parseInline(text) {
  const regex = /\*\*(.+?)\*\*|\*(.+?)\*|"([^"]+)"|'([^']+)'/g;
  const segments = [];
  const markers = new Set();
  let last = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) segments.push({ type:'plain', text:text.slice(last, match.index) });
    if (match[1] != null) { segments.push({ type:'bold', text:match[1] }); markers.add('bold'); }
    else if (match[2] != null) { segments.push({ type:'star', text:match[2] }); markers.add('star'); }
    else if (match[3] != null) { segments.push({ type:'double', text:match[3] }); markers.add('double'); }
    else if (match[4] != null) { segments.push({ type:'single', text:match[4] }); markers.add('single'); }
    last = regex.lastIndex;
  }
  if (last < text.length) segments.push({ type:'plain', text:text.slice(last) });
  return { segments, markers: Array.from(markers) };
}

function splitRawToBlocks(rawText) {
  const normalized = rawText.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    const detailsMatch = line.match(/^\[details:\s*(.+?)\s*\]$/i);
    if (detailsMatch) {
      const summary = detailsMatch[1];
      i++;
      const body = [];
      while (i < lines.length && !/^\[\/details\]\s*$/i.test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      blocks.push({ kind:'details', summary, bodyText: body.join('\n') });
      continue;
    }

    if (/^###\s+/.test(line)) { blocks.push({ kind:'h3', text: line.replace(/^###\s+/, '') }); i++; continue; }
    if (/^##\s+/.test(line)) { blocks.push({ kind:'h2', text: line.replace(/^##\s+/, '') }); i++; continue; }
    if (/^#\s+/.test(line)) { blocks.push({ kind:'h1', text: line.replace(/^#\s+/, '') }); i++; continue; }

    if (/^>\s?/.test(line)) {
      const quoteLines = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      blocks.push({ kind:'quote', text: quoteLines.join('\n') });
      continue;
    }

    const paraLines = [];
    while (i < lines.length && lines[i].trim() && !/^\[details:\s*(.+?)\s*\]$/i.test(lines[i]) && !/^#/.test(lines[i]) && !/^>\s?/.test(lines[i])) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push({ kind:'paragraph', text: paraLines.join('\n') });
  }

  return blocks.map((block, idx) => {
    if (block.kind === 'details') {
      return { id: idx, kind:'details', summary: block.summary, bodyBlocks: splitRawToBlocks(block.bodyText || '') };
    }
    const parsed = parseInline(block.text || '');
    return { id: idx, kind: block.kind, raw: block.text || '', segments: parsed.segments, markers: parsed.markers };
  }).filter(Boolean);
}

function buildBookContent(rawText) { return splitRawToBlocks(rawText); }

function blockToStatMarkers(blocks) {
  const counts = { bold:0, star:0, double:0, single:0 };
  const walk = (items) => {
    items.forEach(item => {
      if (item.kind === 'details') return walk(item.bodyBlocks || []);
      (item.markers || []).forEach(m => { if (counts[m] != null) counts[m] += 1; });
    });
  };
  walk(blocks);
  return counts;
}

function segmentToHTML(seg, italicEnabled) {
  const t = escapeHtml(seg.text);
  if (seg.type === 'bold') return `<span class="seg-bold">${t}</span>`;
  if (seg.type === 'star') return `<span class="seg-star${italicEnabled ? '' : ' no-italic'}">${t}</span>`;
  if (seg.type === 'double') return `<span class="seg-double">${t}</span>`;
  if (seg.type === 'single') return `<span class="seg-single">${t}</span>`;
  return t;
}

function lineToHTML(lineObj) {
  if (lineObj.blank) return '<div class="line-gap"></div>';
  if (lineObj.kind === 'details-summary') return `<div class="details-summary">▸ ${escapeHtml(lineObj.summary)}</div>`;
  if (lineObj.kind === 'details-body-line') {
    const inner = lineObj.segments.map(seg => segmentToHTML(seg, state.settings.italic)).join('');
    return `<div class="details-body"><p class="page-line" style="color:${state.settings.textColor}">${inner}</p></div>`;
  }
  if (lineObj.kind === 'h1' || lineObj.kind === 'h2' || lineObj.kind === 'h3') {
    const cls = lineObj.kind === 'h1' ? 'line-h1' : lineObj.kind === 'h2' ? 'line-h2' : 'line-h3';
    const inner = lineObj.segments.map(seg => segmentToHTML(seg, state.settings.italic)).join('');
    return `<div class="${cls}" style="color:${state.settings.textColor}">${inner}</div>`;
  }
  if (lineObj.kind === 'quote') {
    const inner = lineObj.segments.map(seg => segmentToHTML(seg, state.settings.italic)).join('');
    return `<blockquote class="line-quote">${inner}</blockquote>`;
  }
  const inner = lineObj.segments.map(seg => segmentToHTML(seg, state.settings.italic)).join('');
  return `<p class="page-line" style="color:${state.settings.textColor}">${inner}</p>`;
}

function blocksForCurrentFilter(blocks) {
  if (state.settings.markerFilter === 'all') return blocks;
  const walk = (items) => items.map(item => {
    if (item.kind === 'details') {
      const filteredBody = walk(item.bodyBlocks || []).filter(Boolean);
      return filteredBody.length ? { ...item, bodyBlocks: filteredBody } : null;
    }
    return (item.markers || []).includes(state.settings.markerFilter) ? item : null;
  }).filter(Boolean);
  return walk(blocks);
}

function getAvailableReaderHeight() {
  const style = getComputedStyle(document.documentElement);
  const topInset = parseFloat(style.getPropertyValue('--safe-top')) || 0;
  const bottomInset = parseFloat(style.getPropertyValue('--safe-bottom')) || 0;
  const headerH = parseFloat(style.getPropertyValue('--header-h')) || 58;
  const bottomH = parseFloat(style.getPropertyValue('--bottom-h')) || 146;
  return Math.max(220, window.innerHeight - topInset - bottomInset - headerH - bottomH);
}
function getLineHeightPx() { return state.settings.fontSize * state.settings.lineHeight; }
function getMaxLinesPerPage() {
  const available = getAvailableReaderHeight();
  const usable = available - 6;
  return Math.max(6, Math.floor(usable / getLineHeightPx()));
}
function getPageCacheKey(book) {
  return [
    book.id, book.updatedAt, state.settings.fontSize, state.settings.lineHeight,
    state.settings.wrap ? 1 : 0, state.settings.italic ? 1 : 0,
    state.settings.markerFilter, state.settings.customFontName || '',
    Math.min(window.innerWidth, 430), window.innerHeight
  ].join('|');
}

function applyFont() {
  const family = state.settings.customFontFamily
    ? `"${state.settings.customFontFamily}", system-ui,-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Pretendard",sans-serif`
    : `system-ui,-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Pretendard",sans-serif`;
  document.documentElement.style.setProperty('--reader-font', family);
  el.fontStatus.textContent = state.settings.customFontName || '기본 서체';
}
async function loadCustomFontFromSettings() {
  if (!state.settings.customFontData || !state.settings.customFontFamily) { applyFont(); return; }
  try {
    const face = new FontFace(state.settings.customFontFamily, `url(${state.settings.customFontData})`);
    await face.load();
    document.fonts.add(face);
    applyFont();
  } catch (e) {
    state.settings.customFontData = '';
    state.settings.customFontFamily = '';
    state.settings.customFontName = '';
    applyFont();
  }
}
async function replaceCustomFont(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!['ttf', 'otf', 'woff', 'woff2'].includes(ext)) return;
  const dataUrl = await fileToDataURL(file);
  const family = `uploaded-font-${Date.now()}`;
  state.settings.customFontData = dataUrl;
  state.settings.customFontFamily = family;
  state.settings.customFontName = file.name;
  try {
    const face = new FontFace(family, `url(${dataUrl})`);
    await face.load();
    document.fonts.add(face);
    applyFont();
    state.page = 0;
    state.pageCacheKey = '';
    renderReader();
    scheduleSettingsSave();
    showSheet(false);
  } catch (e) {
    console.log('font load failed', e);
  }
}
function removeCustomFont() {
  state.settings.customFontData = '';
  state.settings.customFontFamily = '';
  state.settings.customFontName = '';
  applyFont();
  state.page = 0;
  state.pageCacheKey = '';
  renderReader();
  scheduleSettingsSave();
  showSheet(false);
}
function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function applyTheme() {
  const themes = {
    sepia: { bg:'#f4efe6', surface:'#fbf8f2', surface2:'#f1eadf', text:'#2e2419', muted:'#8b7764', border:'rgba(46,36,25,.10)', accent:'#20170f' },
    light: { bg:'#f7f7f8', surface:'#ffffff', surface2:'#f0f1f4', text:'#191919', muted:'#737373', border:'rgba(0,0,0,.08)', accent:'#161616' },
    dark:  { bg:'#161515', surface:'#1f1e1d', surface2:'#252321', text:'#efe8dd', muted:'#a79a8a', border:'rgba(255,255,255,.08)', accent:'#efe8dd' }
  };
  const t = themes[state.settings.theme] || themes.sepia;
  const root = document.documentElement.style;
  root.setProperty('--bg', t.bg);
  root.setProperty('--surface', t.surface);
  root.setProperty('--surface-2', t.surface2);
  root.setProperty('--text', t.text);
  root.setProperty('--muted', t.muted);
  root.setProperty('--border', t.border);
  root.setProperty('--accent', t.accent);
  root.setProperty('--reader-size', state.settings.fontSize + 'px');
  root.setProperty('--reader-line', String(state.settings.lineHeight));
  document.querySelector('meta[name="theme-color"]').setAttribute('content', t.bg);
  el.themeBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.theme === state.settings.theme));
  el.filterBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.filter === state.settings.markerFilter));
  el.fontSizeRange.value = String(state.settings.fontSize);
  el.lineHeightRange.value = String(Math.round(state.settings.lineHeight * 100));
  el.textColorInput.value = state.settings.textColor;
  el.wrapToggleBtn.textContent = state.settings.wrap ? '기본 줄바꿈 켜짐' : '기본 줄바꿈 꺼짐';
  el.italicToggleBtn.textContent = state.settings.italic ? '이탤릭 켜짐' : '이탤릭 꺼짐';
  applyFont();
}

function setScreen(name) {
  const reader = name === 'reader';
  el.libraryScreen.classList.toggle('hidden', reader);
  el.readerScreen.classList.toggle('hidden', !reader);
  state.uiHidden = false;
  updateUiVisibility();
}
function updateUiVisibility() {
  el.readerHeader.classList.toggle('hide-ui', state.uiHidden);
  el.bottomBar.classList.toggle('hide-ui', state.uiHidden);
}
function showSheet(show) {
  el.sheetBackdrop.classList.toggle('show', show);
  el.menuSheet.classList.toggle('show', show);
  el.menuSheet.setAttribute('aria-hidden', String(!show));
}

function splitTextToVisualLines(text, forceWrap = false) {
  const width = Math.max(180, el.reader.clientWidth || Math.min(window.innerWidth, 430) - 28);
  const measure = el.measureLine;
  measure.style.width = width + 'px';
  measure.style.fontSize = state.settings.fontSize + 'px';
  measure.style.lineHeight = String(state.settings.lineHeight);
  measure.style.fontFamily = getComputedStyle(document.documentElement).getPropertyValue('--reader-font');
  measure.style.whiteSpace = 'pre-wrap';

  if (!forceWrap && !state.settings.wrap) {
    return text.split('\n').map(v => v.length > 0 ? v : '');
  }

  const chunks = text.split(/(\s+)/).filter(v => v.length > 0);
  const lines = [];
  let current = '';

  for (const chunk of chunks) {
    const test = current + chunk;
    measure.textContent = test;
    if (measure.scrollHeight > parseFloat(getComputedStyle(measure).lineHeight) + 2 && current) {
      lines.push(current.trimEnd());
      current = chunk.trimStart();
      if (!current) current = chunk;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current.trimEnd());
  return lines.length ? lines : [''];
}

function blockToLineObjects(block) {
  if (block.kind === 'details') {
    const lines = [{ kind:'details-summary', summary:block.summary, blank:false }];
    const innerBlocks = block.bodyBlocks || [];
    innerBlocks.forEach(inner => {
      const innerLines = blockToLineObjects(inner).map(line => line.blank ? line : ({ ...line, kind: line.kind === 'quote' ? 'quote' : 'details-body-line' }));
      lines.push(...innerLines);
    });
    lines.push({ blank:true });
    return lines;
  }

  const rawLines = (block.raw || '').split('\n');
  const result = [];
  const forceWrap = (block.markers || []).includes('double');

  rawLines.forEach((rawLine, idx) => {
    const visualLines = splitTextToVisualLines(rawLine, forceWrap);
    visualLines.forEach(vl => {
      const parsed = parseInline(vl);
      result.push({ kind: block.kind, blank: !vl.trim(), raw: vl, segments: parsed.segments, markers: block.markers || [] });
    });
    if (idx < rawLines.length - 1) result.push({ blank:true });
  });
  result.push({ blank:true });
  return result;
}

function paginateBook(book) {
  const cacheKey = getPageCacheKey(book);
  if (cacheKey === state.pageCacheKey && state.pages.length) return;
  state.pageCacheKey = cacheKey;

  const blocks = blocksForCurrentFilter(book.blocks);
  const lines = [];
  blocks.forEach(block => lines.push(...blockToLineObjects(block)));

  const maxLines = getMaxLinesPerPage();
  const pages = [];
  let current = [];
  let count = 0;

  for (const line of lines) {
    const weight = line.blank ? 0.55 : (line.kind === 'h1' ? 1.8 : line.kind === 'h2' ? 1.5 : line.kind === 'h3' ? 1.35 : line.kind === 'details-summary' ? 1.15 : 1);
    if (count + weight > maxLines && current.length > 0) {
      pages.push(current);
      current = [line];
      count = weight;
    } else {
      current.push(line);
      count += weight;
    }
  }

  if (current.length) pages.push(current);
  if (!pages.length) {
    pages.push([{ blank:false, kind:'paragraph', raw:'표식 필터에 맞는 내용이 없어요.', segments:[{type:'plain', text:'표식 필터에 맞는 내용이 없어요.'}], markers:[] }]);
  }
  state.pages = pages;
  if (state.page > state.pages.length - 1) state.page = 0;
}

function renderReader() {
  const book = state.currentBook;
  if (!book) return;
  paginateBook(book);
  const page = state.pages[state.page] || [];
  el.reader.innerHTML = `<div class="page-box">${page.map(lineToHTML).join('')}</div>`;
  const total = state.pages.length || 1;
  const percent = Math.round(((state.page + 1) / total) * 100);
  el.readerTitle.textContent = book.title;
  el.readerSubtitle.textContent = `${state.page + 1} / ${total} 페이지`;
  el.pageLabel.textContent = `${state.page + 1} / ${total} 페이지`;
  el.progressLabel.textContent = `${percent}%`;
  renderMarkerStats();
  scheduleProgressSave();
}
function renderMarkerStats() {
  const book = state.currentBook;
  if (!book) { el.markerStats.innerHTML = ''; return; }
  const counts = blockToStatMarkers(book.blocks || []);
  const labels = { bold:'**', star:'*', double:'"', single:"'" };
  el.markerStats.innerHTML = Object.keys(counts).map(key =>
    `<div class="stat-card"><div class="stat-title">${labels[key]}</div><div class="stat-meta">${counts[key]}개 블록</div></div>`
  ).join('');
}
function renderLibrary() {
  el.emptyState.classList.toggle('hidden', state.books.length > 0);
  el.bookList.innerHTML = state.books.map(book => {
    const title = escapeHtml(book.title || '제목 없음');
    const blockCount = (book.blocks || []).length;
    const meta = `${blockCount}블록 · 마지막 ${Math.min((book.lastPage || 0)+1, Math.max(book.totalPages || 1, 1))}페이지`;
    const recentBadge = state.settings.recentBookId === book.id ? ' · 최근 읽음' : '';
    return `<div class="book-card">
      <div class="book-title">${title}</div>
      <div class="book-meta">${escapeHtml(meta + recentBadge)}</div>
      <div class="book-actions">
        <button class="chip-btn" data-open-book="${book.id}">열기</button>
        <button class="chip-btn" data-delete-book="${book.id}">삭제</button>
      </div>
    </div>`;
  }).join('');
}
function switchTab(tab) {
  state.activeTab = tab;
  el.tabBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
  el.panels.forEach(panel => panel.classList.toggle('active', panel.dataset.panel === tab));
}
async function loadBooks() {
  state.books = await idbGetAllBooks();
  renderLibrary();
}
function extractTitle(text, fallback='제목 없음') {
  const lines = text.replace(/\r\n/g,'\n').split('\n').map(v => v.trim()).filter(Boolean);
  if (!lines.length) return fallback;
  const first = lines[0];
  return first.replace(/^#{1,3}\s+/, '').replace(/^\*\*(.+)\*\*$/, '$1').slice(0, 60) || fallback;
}

async function importTxt(file) {
  const worker = new Worker('./worker.js');

  worker.postMessage({ type: 'parseFile', file });

  worker.onmessage = async (e) => {

    if (e.data.type === 'done') {
      const blocks = e.data.blocks;

      const now = Date.now();

      const book = {
        id: 'book-' + now,
        title: file.name,
        blocks,
        lastPage: 0,
        totalPages: 1,
        createdAt: now,
        updatedAt: now
      };

      await idbPutBook(book);
      await loadBooks();
      await openBook(book.id);
    }

    if (e.data.type === 'error') {
      alert('파일 읽기 실패 😢');
    }
  };
}
async function openBook(id) {
  const book = await idbGetBook(id);
  if (!book) return;
  state.currentBookId = id;
  state.currentBook = book;
  state.page = Math.max(0, book.lastPage || 0);
  state.pageCacheKey = '';
  state.settings.recentBookId = id;
  applyTheme();
  renderReader();
  setScreen('reader');
  scheduleSettingsSave();
  showSheet(false);
}
async function reopenRecentBook() {
  if (!state.settings.recentBookId) return;
  await openBook(state.settings.recentBookId);
}
async function deleteBook(id) {
  await idbDeleteBook(id);
  if (state.settings.recentBookId === id) {
    state.settings.recentBookId = '';
    scheduleSettingsSave();
  }
  if (state.currentBookId === id) {
    state.currentBookId = null;
    state.currentBook = null;
    setScreen('library');
  }
  await loadBooks();
}
function scheduleSettingsSave() {
  clearTimeout(saveSettingsTimer);
  saveSettingsTimer = setTimeout(() => { idbPutSetting('settings', state.settings); }, 260);
}
function scheduleProgressSave() {
  clearTimeout(saveProgressTimer);
  saveProgressTimer = setTimeout(() => {
    if (!state.currentBook) return;
    const book = { ...state.currentBook, lastPage: state.page, totalPages: state.pages.length || 1, updatedAt: Date.now() };
    state.currentBook = book;
    idbPutBook(book);
  }, 220);
}
function goNextPage() {
  if (!state.currentBook) return;
  if (state.page < state.pages.length - 1) {
    state.page += 1;
    renderReader();
  }
}
function goPrevPage() {
  if (!state.currentBook) return;
  if (state.page > 0) {
    state.page -= 1;
    renderReader();
  }
}
async function checkForAppUpdate() {
  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration('./');
      if (registration) await registration.update();
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(key => caches.delete(key)));
    }
    el.updateNote.textContent = '최신 버전 다시 불러오는 중...';
    setTimeout(() => window.location.reload(), 250);
  } catch (err) {
    console.log('update failed', err);
    el.updateNote.textContent = '업데이트 확인에 실패했어요. 다시 시도해 주세요.';
  }
}
function registerSW() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try { await navigator.serviceWorker.register('./sw.js', { scope: './' }); }
      catch (err) { console.log('SW 등록 실패', err); }
    });
  }
}
function bindInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.installPrompt = e;
    el.installNote.textContent = '설치 가능해요. 누르면 홈 화면에 추가돼요.';
  });
  window.addEventListener('appinstalled', () => {
    el.installNote.textContent = '설치 완료! 이제 더 앱처럼 보여요 📚';
  });
}
function makeInstallHandler() {
  return async () => {
    if (!state.installPrompt) {
      el.installNote.textContent = '이 환경에선 자동 설치 버튼이 안 뜰 수 있어요. 브라우저 메뉴의 홈 화면에 추가를 써봐요.';
      return;
    }
    state.installPrompt.prompt();
    await state.installPrompt.userChoice;
    state.installPrompt = null;
  };
}

function bind() {
  press(el.libraryMenuBtn, () => showSheet(true));
  press(el.readerMenuBtn, () => showSheet(true));
  press(el.sheetBackdrop, () => showSheet(false));
  press(el.importTxtBtnTop, () => el.txtInput && el.txtInput.click());
  press(el.importTxtBtnSheet, () => el.txtInput && el.txtInput.click());
  press(el.reopenRecentBtnTop, () => reopenRecentBook());
  press(el.reopenRecentBtnSheet, () => reopenRecentBook());
  press(el.fontUploadBtn, () => el.fontInput && el.fontInput.click());
  press(el.resetFontBtn, () => removeCustomFont());
  press(el.installBtnTop, makeInstallHandler());
  press(el.installBtnSheet, makeInstallHandler());
  press(el.updateAppBtn, () => checkForAppUpdate());
  press(el.goLibraryBtn, () => { showSheet(false); setScreen('library'); });

  el.txtInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) importTxt(file);
    e.target.value = '';
  });
  el.fontInput.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) await replaceCustomFont(file);
    e.target.value = '';
  });

  press(el.tapLeft, () => goPrevPage());
  press(el.tapRight, () => goNextPage());
  press(el.tapCenter, () => { state.uiHidden = !state.uiHidden; updateUiVisibility(); });

  el.tabBtns.forEach(btn => press(btn, () => switchTab(btn.dataset.tab)));
  el.themeBtns.forEach(btn => press(btn, () => {
    state.settings.theme = btn.dataset.theme;
    if (state.settings.theme === 'dark' && state.settings.textColor === '#2e2419') state.settings.textColor = '#efe8dd';
    if (state.settings.theme !== 'dark' && state.settings.textColor === '#efe8dd') state.settings.textColor = '#2e2419';
    applyTheme(); renderReader(); scheduleSettingsSave();
  }));
  el.filterBtns.forEach(btn => press(btn, () => {
    state.settings.markerFilter = btn.dataset.filter;
    state.page = 0; state.pageCacheKey = ''; applyTheme(); renderReader(); scheduleSettingsSave();
  }));
  press(el.wrapToggleBtn, () => {
    state.settings.wrap = !state.settings.wrap;
    state.page = 0; state.pageCacheKey = ''; applyTheme(); renderReader(); scheduleSettingsSave();
  });
  press(el.italicToggleBtn, () => {
    state.settings.italic = !state.settings.italic;
    applyTheme(); renderReader(); scheduleSettingsSave();
  });

  el.fontSizeRange.addEventListener('input', (e) => {
    state.settings.fontSize = Number(e.target.value);
    state.page = 0; state.pageCacheKey = ''; applyTheme(); renderReader(); scheduleSettingsSave();
  });
  el.lineHeightRange.addEventListener('input', (e) => {
    state.settings.lineHeight = Number(e.target.value) / 100;
    state.page = 0; state.pageCacheKey = ''; applyTheme(); renderReader(); scheduleSettingsSave();
  });
  el.textColorInput.addEventListener('input', (e) => {
    state.settings.textColor = e.target.value;
    applyTheme(); renderReader(); scheduleSettingsSave();
  });

  el.bookList.addEventListener('pointerup', (e) => {
    const openId = e.target.closest('[data-open-book]')?.dataset.openBook;
    const deleteId = e.target.closest('[data-delete-book]')?.dataset.deleteBook;
    if (openId) { e.preventDefault(); openBook(openId); }
    if (deleteId) { e.preventDefault(); deleteBook(deleteId); }
  });

  let startX = 0, startY = 0;
  el.reader.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    startX = t.clientX; startY = t.clientY;
  }, { passive:true });
  el.reader.addEventListener('touchend', (e) => {
    const t = e.changedTouches[0];
    const dx = t.clientX - startX;
    const dy = Math.abs(t.clientY - startY);
    if (Math.abs(dx) > 48 && dy < 34) {
      if (dx < 0) goNextPage();
      else goPrevPage();
    }
  }, { passive:true });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'PageDown') goNextPage();
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') goPrevPage();
    if (e.key === 'Escape') showSheet(false);
  });
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!state.currentBook) return;
      state.page = 0; state.pageCacheKey = ''; renderReader();
    }, 120);
  });
}

async function init() {
  db = await openDB();
  const savedSettings = await idbGetSetting('settings');
  if (savedSettings) state.settings = { ...state.settings, ...savedSettings };

  const books = await idbGetAllBooks();
  if (!books.length) {
    const now = Date.now();
    await idbPutBook({
      id: 'sample-book',
      title: '샘플 책',
      rawText: SAMPLE_TEXT,
      blocks: buildBookContent(SAMPLE_TEXT),
      lastPage: 0,
      totalPages: 1,
      createdAt: now,
      updatedAt: now
    });
  }

  await loadBooks();
  await loadCustomFontFromSettings();
  applyTheme();
  bind();
  bindInstall();
  registerSW();
}

init();
