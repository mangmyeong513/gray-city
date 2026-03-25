self.onmessage = async (event) => {
  const { type, file } = event.data || {};
  if (type !== 'parseFile' || !file) return;

  try {
    const text = await file.text();

    const lines = text.split('\n');
    const blocks = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (!line.trim()) continue;

      // 제목
      if (line.startsWith('### ')) {
        blocks.push({ kind: 'h3', raw: line.slice(4) });
      } else if (line.startsWith('## ')) {
        blocks.push({ kind: 'h2', raw: line.slice(3) });
      } else if (line.startsWith('# ')) {
        blocks.push({ kind: 'h1', raw: line.slice(2) });
      }
      // 인용
      else if (line.startsWith('> ')) {
        blocks.push({ kind: 'quote', raw: line.slice(2) });
      }
      // 일반
      else {
        blocks.push({ kind: 'paragraph', raw: line });
      }

      // 쉬어주기 (렉 방지)
      if (i % 500 === 0) {
        await new Promise(r => setTimeout(r, 0));
      }
    }

    self.postMessage({ type: 'done', blocks });

  } catch (e) {
    self.postMessage({ type: 'error', message: e.message });
  }
};
