const reader = document.getElementById('reader');
const input = document.getElementById('txtInput');

input.addEventListener('change', (e)=>{
  const file = e.target.files[0];
  if(!file) return;

  const worker = new Worker('./worker.js');
  worker.postMessage({file});

  worker.onmessage = (e)=>{
    if(e.data.type==='progress'){
      reader.innerHTML = '불러오는 중... ' + e.data.percent + '%';
    }

    if(e.data.type==='done'){
      render(e.data.lines);
    }
  };
});

function render(lines){
  let html = '';

  for(let i=0;i<lines.length;i++){
    html += `<div class="page-line">${escape(lines[i])}</div>`;

    if(i % 300 === 0){
      reader.innerHTML = html;
    }
  }

  requestAnimationFrame(()=>{
    reader.innerHTML = html;
  });
}

function escape(s){
  return s.replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
