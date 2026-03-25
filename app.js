const reader = document.getElementById('reader');
const input = document.getElementById('txtInput');

input.addEventListener('change', async (e)=>{
  const file = e.target.files[0];
  if(!file) return;

  reader.innerHTML = '불러오는 중...';

  const text = await file.text();
  const lines = text.split('\\n');

  render(lines);
});

function render(lines){
  let html = '';

  for(let i=0;i<lines.length;i++){
    html += `<div class="page-line">${escape(lines[i])}</div>`;

    if(i % 300 === 0){
      reader.innerHTML = html;
    }
  }

  reader.innerHTML = html;
}

function escape(s){
  return s.replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
