self.onmessage = async (e)=>{
  const file = e.data.file;
  const text = await file.text();
  const lines = text.split('\n');

  const result = [];

  for(let i=0;i<lines.length;i++){
    result.push(lines[i]);

    if(i%500===0){
      self.postMessage({type:'progress', percent:Math.floor((i/lines.length)*100)});
      await new Promise(r=>setTimeout(r,0));
    }
  }

  self.postMessage({type:'done', lines:result});
}
