self.onmessage = async (event) => {
  const { type, file } = event.data || {};
  if (type !== 'parseFile' || !file) return;

  try {
    const chunkSize = 256 * 1024;
    let offset = 0;
    let carry = '';
    const lines = [];
    let processed = 0;

    while (offset < file.size) {
      const blob = file.slice(offset, offset + chunkSize);
      let text = await blob.text();
      offset += chunkSize;

      text = carry + text;
      const parts = text.split('\n');
      carry = parts.pop() ?? '';

      for (const line of parts) {
        lines.push(line);
        processed++;
        if (processed % 500 === 0) {
          self.postMessage({ type: 'progress', value: offset / file.size });
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
    }

    if (carry.length || file.size === 0) {
      lines.push(carry);
    }

    self.postMessage({ type: 'done', lines });
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error && error.message ? error.message : String(error)
    });
  }
};
