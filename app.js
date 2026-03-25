const pickBtn = document.getElementById('pickBtn');
const clearBtn = document.getElementById('clearBtn');
const installBtn = document.getElementById('installBtn');
const fileInput = document.getElementById('fileInput');
const statusEl = document.getElementById('status');
const readerEl = document.getElementById('reader');

let installPrompt = null;
let parseWorker = null;

function setStatus(text) {
  statusEl.textContent = text || '';
}

function escapeHtml(s) {
  return s
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');
}

function renderLines(lines, fileName) {
  let html = '<div class="meta">' + escapeHtml(fileName) + ' · ' + lines.length.toLocaleString() + '줄</div>';

  for (let i = 0; i < lines.length; i++) {
    html += '<p class="line">' + escapeHtml(lines[i]) + '</p>';
    if (i > 0 && i % 400 === 0) {
      readerEl.innerHTML = html;
    }
  }

  requestAnimationFrame(() => {
    readerEl.innerHTML = html;
  });
}

function getWorker() {
  if (!parseWorker) {
    parseWorker = new Worker('./worker.js');
  }
  return parseWorker;
}

function parseFileWithWorker(file) {
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
        resolve(data.lines || []);
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

async function parseFileFallback(file) {
  setStatus(file.size > 1024 * 1024 ? '큰 파일 읽는 중...' : '불러오는 중...');
  const text = await file.text();
  await new Promise(resolve => setTimeout(resolve, 0));
  setStatus('줄 나누는 중...');
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  return lines;
}

async function openFile(file) {
  try {
    pickBtn.disabled = true;
    readerEl.innerHTML = '<div class="empty">파일을 읽는 중이에요...</div>';

    let lines;
    try {
      lines = await parseFileWithWorker(file);
    } catch (workerError) {
      console.warn('worker fallback', workerError);
      lines = await parseFileFallback(file);
    }

    setStatus('본문 그리는 중...');
    await new Promise(resolve => setTimeout(resolve, 0));
    renderLines(lines, file.name);
    setStatus('완료 · ' + (file.size / 1024 / 1024).toFixed(2) + 'MB');
  } catch (error) {
    console.error(error);
    setStatus('불러오기에 실패했어요.');
    readerEl.innerHTML = '<div class="empty">파일을 읽는 중 오류가 났어요. 다시 시도해 주세요.</div>';
  } finally {
    pickBtn.disabled = false;
    fileInput.value = '';
  }
}

pickBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (file) openFile(file);
});

clearBtn.addEventListener('click', () => {
  setStatus('');
  readerEl.innerHTML = '<div class="empty">TXT 파일을 선택하면 여기에 본문이 보여요.</div>';
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

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  setStatus('앱 설치가 가능해요.');
});

window.addEventListener('appinstalled', () => {
  setStatus('앱 설치 완료');
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
