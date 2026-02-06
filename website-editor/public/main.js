// Markdown-first editor: load JSON, convert to Markdown for editing, compile to JSON on save.
let dirHandle = null;
let fileHandles = {};
let currentFile = null;

const pickBtn = document.getElementById('pick');
const refreshBtn = document.getElementById('refresh');
const filesEl = document.getElementById('files');
const contentEl = document.getElementById('content');
const saveBtn = document.getElementById('save');
const statusEl = document.getElementById('status');
const currentEl = document.getElementById('current');

function setStatus(msg, ok=true){
  statusEl.textContent = msg;
  statusEl.style.color = ok ? '#86efac' : '#fca5a5';
  setTimeout(()=>{ if(statusEl.textContent===msg) statusEl.textContent=''; }, 3000);
}

function jsonToMarkdown(obj){
  if(obj && obj.items && Array.isArray(obj.items)){
    let md = `# ${obj.title || ''}\n\n`;
    for(const it of obj.items){
      md += `## ${it.title || it.id || ''}\n`;
      if(it.id) md += `id: ${it.id}\n`;
      if(it.image) md += `image: ${it.image}\n`;
      if(it.code) md += `code:\n\n\`\`\`\n${it.code}\n\`\`\`\n`;
      if(it.content) md += it.content + '\n\n';
      md += '\n';
    }
    return md;
  }
  return '```json\n' + JSON.stringify(obj, null, 2) + '\n```';
}

function markdownToJson(md, original){
  const lines = md.split(/\r?\n/);
  const out = {};
  let i = 0;
  if(lines[i] && lines[i].startsWith('# ')){
    out.title = lines[i].slice(2).trim(); i++;
  }
  out.items = [];
  while(i < lines.length){
    const line = lines[i];
    if(line.startsWith('## ')){
      const item = {};
      item.title = line.slice(3).trim();
      i++;
      while(i < lines.length && lines[i].trim() !== '' && !lines[i].startsWith('## ')){
        const l = lines[i];
        const m = l.match(/^id:\s*(.+)$/i);
        const im = l.match(/^image:\s*(.+)$/i);
        const cm = l.match(/^code:$/i);
        if(m){ item.id = m[1].trim(); i++; continue; }
        if(im){ item.image = im[1].trim(); i++; continue; }
        if(cm){ i++; let codeLines = []; while(i < lines.length && !lines[i].startsWith('```')){ codeLines.push(lines[i]); i++; } item.code = codeLines.join('\n'); if(i < lines.length && lines[i].startsWith('```')) i++; continue; }
        break;
      }
      let contentLines = [];
      while(i < lines.length && !lines[i].startsWith('## ')){
        contentLines.push(lines[i]); i++;
      }
      while(contentLines.length && contentLines[0].trim() === '') contentLines.shift();
      while(contentLines.length && contentLines[contentLines.length-1].trim() === '') contentLines.pop();
      item.content = contentLines.join('\n');
      out.items.push(item);
    } else {
      i++;
    }
  }
  if(original){
    for(const k of Object.keys(original)){
      if(k !== 'title' && k !== 'items') out[k] = original[k];
    }
  }
  return out;
}

async function pickFolder(){
  setStatus('Using server mode — no folder pick needed', true);
  await refreshList();
}

async function refreshList(){
  try{
    const res = await fetch('/api/files');
    const files = await res.json();
    fileHandles = {};
    filesEl.innerHTML = '';
    for(const name of files){
      fileHandles[name] = true;
      const li = document.createElement('li'); li.textContent = name;
      li.onclick = ()=> loadFile(name);
      filesEl.appendChild(li);
    }
    setStatus('Files refreshed', true);
  }catch(e){ console.error(e); setStatus('Refresh failed', false); }
}

let originalJson = null;
async function loadFile(name){
  try{
    const res = await fetch('/api/file?name=' + encodeURIComponent(name));
    if(!res.ok) throw new Error('Load failed');
    const json = await res.json();
    try{ originalJson = JSON.parse(json.content); }catch(e){ originalJson = null; }
    contentEl.value = jsonToMarkdown(originalJson || {});
    currentFile = json.name;
    Array.from(filesEl.children).forEach(li=>li.classList.toggle('active', li.textContent===name));
    currentEl.textContent = name + ' (editing as Markdown)';
    setStatus('Loaded '+name, true);
  }catch(e){ console.error(e); setStatus('Load error', false); }
}

async function save(){
  if(!currentFile) return setStatus('No file loaded', false);
  try{
    const md = contentEl.value;
    const compiled = markdownToJson(md, originalJson);
    const content = JSON.stringify(compiled, null, 2);
    const res = await fetch('/api/file', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name: currentFile, content }) });
    const j = await res.json();
    if(!res.ok) throw new Error(j.error || 'Save failed');
    originalJson = compiled;
    setStatus('Saved '+currentFile, true);
  }catch(e){ console.error(e); setStatus('Save failed: '+e.message, false); }
}

pickBtn.onclick = pickFolder;
refreshBtn.onclick = refreshList;
saveBtn.onclick = save;

// no file system warning needed when using server
