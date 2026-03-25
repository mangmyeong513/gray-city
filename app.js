const pickBtn = document.getElementById('pickBtn');
const resumeBtn = document.getElementById('resumeBtn');
const installBtn = document.getElementById('installBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const fileInput = document.getElementById('fileInput');
const statusEl = document.getElementById('status');
const pageEl = document.getElementById('page');
const pageInfoEl = document.getElementById('pageInfo');
const pageRangeEl = document.getElementById('pageRange');
const readerEl = document.getElementById('reader');
const measureBox = document.getElementById('measureBox');

const STORE_KEY = 'txt-reader-paged-state-v1';

let installPrompt = null;
let parseWorker = null;
let state = {
  fileName: '',
  blocks: [],
  pages: [],
  pageIndex: 0
};

function setStatus(text) {
  statusEl.textContent = text || '';
}

function saveState() {
  const save = {
    fileName: state.fileName,
    pageIndex: state.pageIndex,
    pages: state.pages
  };
  localStorage.setItem(STORE_KEY, JSON.stringify(save));
}

function loadSavedState() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
  } catch {
    return null;
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');
}

function renderInline(text) {
  const src = String(text || '');
  const regex = /\*\*([\s\S]+?)\*\*|\*([\s\S]+?)\*|"([\s\S]+?)"/g;
  let result = '';
  let last = 0;
  let match;

  while ((match = regex.exec(src)) !== null) {
    if (match.index > last) {
      result += escapeHtml(src.slice(last, match.index));
    }

    if (match[1] != null) {
      result += '<span class="seg-bold">' + escapeHtml(match[1]) + '</span>';
    } else if (match[2] != null) {
      result += '<span class="seg-star">' + escapeHtml(match[2]) + '</span>';
    } else if (match[3] != null) {
      result += '<span class="seg-double">"' + escapeHtml(match[3]) + '"</span>';
    }

    last = regex.lastIndex;
  }

  if (last < src.length) {
    result += escapeHtml(src.slice(last));
  }

  return result;
}

function blockToHtml(block) {
  if (block.kind === 'details') {
    const bodyParagraphs = String(block.body || '').split(/\n{2,}/).filter(Boolean);
    let bodyHtml = '';
    for (const para of bodyParagraphs) {
      bodyHtml += '<p class="para">' + renderInline(para) + '</p>';
    }
    return '<details class="acc"><summary>' +
      renderInline(block.title) +
      '</summary><div class="acc-body">' +
      bodyHtml +
      '</div></details>';
  }

  return '<p class="para">' + renderInline(block.text) + '</p>';
}

function parseBlocksFallback(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const open = line.match(/^\[details:\s*(.+?)\s*\]$/i);

    if (open) {
      const title = open[1];
      i++;
      const body = [];
      while (i < lines.length && !/^\[\/details\]\s*$/i.test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      blocks.push({ kind: 'details', title, body: body.join('\n') });
      continue;
    }

    if (!line.trim()) {
      i++;
      continue;
    }

    const para = [line];
    i++;
    while (i < lines.length) {
      const current = lines[i];
      if (!current.trim()) break;
      if (/^\[details:\s*(.+?)\s*\]$/i.test(current)) break;
      para.push(current);
      i++;
    }
    blocks.push({ kind: 'paragraph', text: para.join('\n') });
  }

  return blocks;
}

function getWorker() {
  if (!parseWorker) parseWorker = new Worker('./worker.js');
  return parseWorker;
}

function parseWithWorker(file) {
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = getWorker();
    } catch (error) {
      reject(error);
      return;
    }

    const onMessage = (event) => {
      const data = event.data || {};
      if (data.type === 'progress') {
        const percent = Math.max(1, Math.min(99, Math.round((data.value || 0) * 100)));
        setStatus('불러오는 중... ' + percent + '%');
        return;
      }
      if (data.type === 'done') {
        cleanup();
        resolve(data.blocks || []);
      }
      if (data.type === 'error') {
        cleanup();
        reject(new Error(data.message || 'parse failed'));
      }
    };

    const onError = (error) => {
      cleanup();
      reject(error);
    };

    function cleanup() {
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
    }

    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    worker.postMessage({ type: 'parseFile', file });
  });
}

function buildPages(blocks) {
  const pages = [];
  const available = Math.max(180, pageEl.clientHeight);
  const width = Math.max(220, readerEl.clientWidth - 2);
  measureBox.style.width = width + 'px';
  measureBox.innerHTML = '';

  let current = [];
  let currentHtml = '';
  let used = 0;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const piece = blockToHtml(block);

    measureBox.innerHTML = piece;
    const blockHeight = Math.ceil(measureBox.scrollHeight);

    if (!current.length) {
      current.push(i);
      currentHtml = piece;
      used = blockHeight;
      continue;
    }

    if (used + blockHeight <= available) {
      current.push(i);
      currentHtml += piece;
      used += blockHeight;
    } else {
      pages.push(current.slice());
      current = [i];
      currentHtml = piece;
      used = blockHeight;
    }
  }

  if (current.length) pages.push(current.slice());
  return pages;
}

function renderPage() {
  if (!state.blocks.length || !state.pages.length) {
    pageEl.innerHTML = '<div class="empty">TXT 파일을 선택하면 문단 단위 페이지로 보여요.</div>';
    pageInfoEl.textContent = '0 / 0 페이지';
    pageRangeEl.min = 1;
    pageRangeEl.max = 1;
    pageRangeEl.value = 1;
    return;
  }

  const pageIndexes = state.pages[state.pageIndex] || [];
  let html = '<div class="meta">' + escapeHtml(state.fileName) + '</div>';
  for (const idx of pageIndexes) {
    html += blockToHtml(state.blocks[idx]);
  }
  pageEl.innerHTML = html;

  const total = state.pages.length;
  pageInfoEl.textContent = (state.pageIndex + 1) + ' / ' + total + ' 페이지';
  pageRangeEl.min = 1;
  pageRangeEl.max = total;
  pageRangeEl.value = state.pageIndex + 1;
  saveState();
}

async function openFile(file) {
  try {
    pickBtn.disabled = true;
    setStatus(file.size > 1024 * 1024 ? '큰 파일 준비 중...' : '불러오는 중...');
    pageEl.innerHTML = '<div class="empty">파일을 읽는 중이에요...</div>';

    let blocks;
    try {
      blocks = await parseWithWorker(file);
    } catch (error) {
      console.warn('worker fallback', error);
      const text = await file.text();
      blocks = parseBlocksFallback(text);
    }

    setStatus('문단 페이지 나누는 중...');
    await new Promise(resolve => setTimeout(resolve, 0));

    state.fileName = file.name;
    state.blocks = blocks;
    state.pages = buildPages(blocks);
    state.pageIndex = 0;

    renderPage();
    setStatus('완료 · ' + (file.size / 1024 / 1024).toFixed(2) + 'MB');
  } catch (error) {
    console.error(error);
    setStatus('불러오기에 실패했어요.');
    pageEl.innerHTML = '<div class="empty">파일을 읽는 중 오류가 났어요. 다시 시도해 주세요.</div>';
  } finally {
    pickBtn.disabled = false;
    fileInput.value = '';
  }
}

function resumeLast() {
  const saved = loadSavedState();
  if (!saved || !state.blocks.length) {
    setStatus('이어읽을 위치가 없어요.');
    return;
  }
  if (saved.fileName === state.fileName && typeof saved.pageIndex === 'number') {
    state.pageIndex = Math.max(0, Math.min(saved.pageIndex, state.pages.length - 1));
    renderPage();
    setStatus('마지막 읽은 위치로 이동했어요.');
  } else {
    setStatus('현재 파일과 이어읽기 기록이 달라요.');
  }
}

pickBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (file) openFile(file);
});

resumeBtn.addEventListener('click', () => resumeLast());

prevBtn.addEventListener('click', () => {
  if (state.pageIndex > 0) {
    state.pageIndex -= 1;
    renderPage();
  }
});

nextBtn.addEventListener('click', () => {
  if (state.pageIndex < state.pages.length - 1) {
    state.pageIndex += 1;
    renderPage();
  }
});

pageRangeEl.addEventListener('input', () => {
  if (!state.pages.length) return;
  state.pageIndex = Math.max(0, Math.min(Number(pageRangeEl.value) - 1, state.pages.length - 1));
  renderPage();
});

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  setStatus('앱 설치가 가능해요.');
});

installBtn.addEventListener('click', async () => {
  if (!installPrompt) {
    setStatus('설치 버튼이 안 뜨면 브라우저 메뉴의 홈 화면에 추가를 써주세요.');
    return;
  }
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
});

window.addEventListener('appinstalled', () => {
  setStatus('앱 설치 완료');
});

window.addEventListener('resize', () => {
  if (!state.blocks.length) return;
  const currentPage = state.pageIndex;
  const currentStart = state.pages[currentPage] && state.pages[currentPage][0] != null ? state.pages[currentPage][0] : 0;
  state.pages = buildPages(state.blocks);
  let newIndex = 0;
  for (let i = 0; i < state.pages.length; i++) {
    const page = state.pages[i];
    if (page.includes(currentStart) || (page[0] <= currentStart && page[page.length - 1] >= currentStart)) {
      newIndex = i;
      break;
    }
  }
  state.pageIndex = newIndex;
  renderPage();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register('./sw.js', { scope: './' });
    } catch (error) {
      console.warn('sw register failed', error);
    }
  });
}
