self.onmessage = async (event) => {
  const { type, file } = event.data || {};
  if (type !== 'parseFile' || !file) return;

  try {
    const blocks = await buildBookContentAsync(file);
    self.postMessage({ type: 'done', blocks });
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error && error.message ? error.message : String(error)
    });
  }
};

function sleepTick() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function parseInline(text) {
  const regex = /\*\*(.+?)\*\*|\*(.+?)\*|"([^"]+)"|'([^']+)'/g;
  const segments = [];
  const markers = new Set();
  let last = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) {
      segments.push({ type: 'plain', text: text.slice(last, match.index) });
    }
    if (match[1] != null) {
      segments.push({ type: 'bold', text: match[1] });
      markers.add('bold');
    } else if (match[2] != null) {
      segments.push({ type: 'star', text: match[2] });
      markers.add('star');
    } else if (match[3] != null) {
      segments.push({ type: 'double', text: match[3] });
      markers.add('double');
    } else if (match[4] != null) {
      segments.push({ type: 'single', text: match[4] });
      markers.add('single');
    }
    last = regex.lastIndex;
  }

  if (last < text.length) {
    segments.push({ type: 'plain', text: text.slice(last) });
  }

  return { segments, markers: Array.from(markers) };
}

function parseTextToBlocks(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }

    const detailsOpen = line.match(/^\[details:\s*(.+?)\s*\]$/i);
    if (detailsOpen) {
      const summary = detailsOpen[1];
      i++;
      const body = [];
      while (i < lines.length && !/^\[\/details\]\s*$/i.test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      blocks.push({
        kind: 'details',
        summary,
        bodyBlocks: parseTextToBlocks(body.join('\n'))
      });
      continue;
    }

    if (/^###\s+/.test(line)) {
      const raw = line.replace(/^###\s+/, '');
      const parsed = parseInline(raw);
      blocks.push({ kind: 'h3', raw, segments: parsed.segments, markers: parsed.markers });
      i++;
      continue;
    }

    if (/^##\s+/.test(line)) {
      const raw = line.replace(/^##\s+/, '');
      const parsed = parseInline(raw);
      blocks.push({ kind: 'h2', raw, segments: parsed.segments, markers: parsed.markers });
      i++;
      continue;
    }

    if (/^#\s+/.test(line)) {
      const raw = line.replace(/^#\s+/, '');
      const parsed = parseInline(raw);
      blocks.push({ kind: 'h1', raw, segments: parsed.segments, markers: parsed.markers });
      i++;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      const raw = quote.join('\n');
      const parsed = parseInline(raw);
      blocks.push({ kind: 'quote', raw, segments: parsed.segments, markers: parsed.markers });
      continue;
    }

    const para = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^\[details:\s*(.+?)\s*\]$/i.test(lines[i]) &&
      !/^#/.test(lines[i]) &&
      !/^>\s?/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }

    const raw = para.join('\n');
    const parsed = parseInline(raw);
    blocks.push({ kind: 'paragraph', raw, segments: parsed.segments, markers: parsed.markers });
  }

  return blocks;
}

async function buildBookContentAsync(file) {
  const chunkSize = 256 * 1024;
  let offset = 0;
  let carry = '';
  const blocks = [];
  let lineCount = 0;

  let paragraphLines = [];
  let quoteLines = [];
  let detailsBuffer = null;
  let detailsDepth = 0;

  function flushParagraph() {
    if (!paragraphLines.length) return;
    const raw = paragraphLines.join('\n');
    const parsed = parseInline(raw);
    blocks.push({ kind: 'paragraph', raw, segments: parsed.segments, markers: parsed.markers });
    paragraphLines = [];
  }

  function flushQuote() {
    if (!quoteLines.length) return;
    const raw = quoteLines.join('\n');
    const parsed = parseInline(raw);
    blocks.push({ kind: 'quote', raw, segments: parsed.segments, markers: parsed.markers });
    quoteLines = [];
  }

  function processLine(line) {
    if (detailsBuffer !== null) {
      const open = line.match(/^\[details:\s*(.+?)\s*\]$/i);
      const close = /^\[\/details\]\s*$/i.test(line);

      if (open) detailsDepth++;
      if (close) {
        detailsDepth--;
        if (detailsDepth <= 0) {
          const bodyBlocks = parseTextToBlocks(detailsBuffer.join('\n'));
          blocks.push({ kind: 'details', summary: detailsBuffer.summary, bodyBlocks });
          detailsBuffer = null;
          detailsDepth = 0;
          return;
        }
      }

      detailsBuffer.push(line);
      return;
    }

    const detailsOpen = line.match(/^\[details:\s*(.+?)\s*\]$/i);
    if (detailsOpen) {
      flushParagraph();
      flushQuote();
      detailsBuffer = [];
      detailsBuffer.summary = detailsOpen[1];
      detailsDepth = 1;
      return;
    }

    if (!line.trim()) {
      flushParagraph();
      flushQuote();
      return;
    }

    if (/^>\s?/.test(line)) {
      flushParagraph();
      quoteLines.push(line.replace(/^>\s?/, ''));
      return;
    }

    flushQuote();

    if (/^###\s+/.test(line)) {
      flushParagraph();
      const raw = line.replace(/^###\s+/, '');
      const parsed = parseInline(raw);
      blocks.push({ kind: 'h3', raw, segments: parsed.segments, markers: parsed.markers });
      return;
    }

    if (/^##\s+/.test(line)) {
      flushParagraph();
      const raw = line.replace(/^##\s+/, '');
      const parsed = parseInline(raw);
      blocks.push({ kind: 'h2', raw, segments: parsed.segments, markers: parsed.markers });
      return;
    }

    if (/^#\s+/.test(line)) {
      flushParagraph();
      const raw = line.replace(/^#\s+/, '');
      const parsed = parseInline(raw);
      blocks.push({ kind: 'h1', raw, segments: parsed.segments, markers: parsed.markers });
      return;
    }

    paragraphLines.push(line);
  }

  while (offset < file.size) {
    const blob = file.slice(offset, offset + chunkSize);
    let text = await blob.text();
    offset += chunkSize;

    text = carry + text;
    const parts = text.split('\n');
    carry = parts.pop() ?? '';

    for (const line of parts) {
      processLine(line);
      lineCount++;
      if (lineCount % 400 === 0) {
        self.postMessage({ type: 'progress', value: offset / file.size });
        await sleepTick();
      }
    }
  }

  if (carry.length) processLine(carry);
  flushParagraph();
  flushQuote();

  if (detailsBuffer !== null) {
    const bodyBlocks = parseTextToBlocks(detailsBuffer.join('\n'));
    blocks.push({ kind: 'details', summary: detailsBuffer.summary, bodyBlocks });
  }

  return blocks;
            }
