const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PUBLIC_DIR = path.join(__dirname, 'public');
const CONTENT_DIR = path.join(__dirname, '..', 'website', 'public');

function sendJSON(res, code, obj){
  res.writeHead(code, {'Content-Type':'application/json'});
  res.end(JSON.stringify(obj));
}

function safeName(name){
  if(!name || typeof name !== 'string') return null;
  if(name.includes('/') || name.includes('..')) return null;
  if(!name.endsWith('.json')) return null;
  return name;
}

const server = http.createServer((req, res)=>{
  const parsed = url.parse(req.url, true);
  if(req.method === 'GET' && parsed.pathname === '/api/files'){
    fs.readdir(CONTENT_DIR, (err, files)=>{
      if(err) return sendJSON(res, 500, {error: String(err)});
      const json = files.filter(f=>f.endsWith('.json'));
      sendJSON(res, 200, json);
    });
    return;
  }
  if(req.method === 'GET' && parsed.pathname === '/api/file'){
    const name = safeName(parsed.query.name);
    if(!name) return sendJSON(res, 400, {error: 'Invalid name'});
    const p = path.join(CONTENT_DIR, name);
    fs.readFile(p, 'utf8', (err, data)=>{
      if(err) return sendJSON(res, 500, {error: String(err)});
      sendJSON(res, 200, {name, content: data});
    });
    return;
  }
  if(req.method === 'POST' && parsed.pathname === '/api/file'){
    let body = '';
    req.on('data', chunk=>{ body += chunk; });
    req.on('end', ()=>{
      try{
        const { name, content } = JSON.parse(body);
        const safe = safeName(name);
        if(!safe) return sendJSON(res, 400, {error: 'Invalid name'});
        JSON.parse(content); // validate
        const p = path.join(CONTENT_DIR, safe);
        fs.writeFile(p, content, 'utf8', (err)=>{
          if(err) return sendJSON(res, 500, {error: String(err)});
          sendJSON(res, 200, {ok: true});
        });
      }catch(e){ sendJSON(res, 400, {error: e.message}); }
    });
    return;
  }

  // serve static files from website-editor/public
  let pathname = parsed.pathname;
  if(pathname === '/') pathname = '/index.html';
  const filePath = path.join(PUBLIC_DIR, pathname.replace(/^\//,''));
  fs.stat(filePath, (err, stat)=>{
    if(err || !stat.isFile()){
      res.writeHead(404); res.end('Not found'); return;
    }
    const stream = fs.createReadStream(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const map = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css'};
    res.writeHead(200, {'Content-Type': map[ext] || 'application/octet-stream'});
    stream.pipe(res);
  });
});

const port = process.env.PORT || 5174;
server.listen(port, ()=> console.log('Editor server running at http://localhost:'+port));
