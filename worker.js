self.onmessage = async (event) => {
  const { type, file } = event.data || {};
  if (type !== 'parseFile' || !file) return;

  try {
    const text = await file.text();
    const blocks = parseBlocks(text);
    self.postMessage({ type: 'done', blocks });
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error && error.message ? error.message : String(error)
    });
  }
};

function parseBlocks(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let i = 0;
  let processed = 0;

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
        processed++;
        if (processed % 500 === 0) self.postMessage({ type: 'progress', value: i / lines.length });
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
      processed++;
      if (processed % 500 === 0) self.postMessage({ type: 'progress', value: i / lines.length });
    }
    blocks.push({ kind: 'paragraph', text: para.join('\n') });
  }

  return blocks;
}
