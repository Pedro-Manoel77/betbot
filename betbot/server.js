const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const low = require("lowdb");
const FileSync = require("lowdb/adapters/FileSync");
const ANTHROPIC_API_KEY = "AIzaSyBMMm3W-TbEjLzf4-kLh1YnE0DiRAd0EOk";
const FOOTBALL_API_KEY  = "183b5b9e068285c38162478d9829fe29";
const JWT_SECRET        = "betbot_secret_2026";
const PRECO_MENSAL      = "R$ 60,00";
const SEU_PIX           = "32991843088";
const ADMIN_EMAIL       = "ztxautomacaoeprojetos@gmail.com";
const ADMIN_SENHA       = "Morreuztx7txy";
const PORT              = process.env.PORT || 3000;
const adapter = new FileSync(process.env.DATABASE_PATH || "db.json");
const db = low(adapter);
db.defaults({ users: [] }).write();

if (!db.get("users").find({ email: ADMIN_EMAIL }).value()) {
  db.get("users").push({
    id: 1, name: "Admin", email: ADMIN_EMAIL,
    password: bcrypt.hashSync(ADMIN_SENHA, 10),
    ativo: true, admin: true, comprovante: "",
    expira_em: null, criado_em: new Date().toISOString()
  }).write();
  console.log("✅ Admin criado:", ADMIN_EMAIL);
}

function isAtivo(user) {
  if (!user.ativo) return false;
  if (user.admin) return true;
  if (!user.expira_em) return false;
  return new Date(user.expira_em) > new Date();
}


function diasRestantes(user) {
  if (!user.expira_em) return 0;
  const diff = new Date(user.expira_em) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function sendJSON(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(data));
}
function sendHTML(res, html) {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}
function verifyToken(req) {
  const auth = req.headers["authorization"] || "";
  const token = auth.replace("Bearer ", "");
  try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
}
function getBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", () => { try { resolve(JSON.parse(body)); } catch { resolve({}); } });
  });
}
function nextId() {
  const users = db.get("users").value();
  return users.length > 0 ? Math.max(...users.map(u => u.id)) + 1 : 1;
}

function getFixturesToday() {
  return new Promise((resolve, reject) => {
    const now = new Date();
    const spDate = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const y = spDate.getFullYear();
    const m = String(spDate.getMonth() + 1).padStart(2, "0");
    const d = String(spDate.getDate()).padStart(2, "0");
    const today = `${y}-${m}-${d}`;
    console.log("📅 Buscando jogos:", today);
    const options = {
      hostname: "v3.football.api-sports.io",
      path: `/fixtures?date=${today}&timezone=America/Sao_Paulo`,
      method: "GET",
      headers: { "x-apisports-key": FOOTBALL_API_KEY },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => { try { resolve(JSON.parse(data).response || []); } catch (e) { reject(e); } });
    });
    req.on("error", reject);
    req.end();
  });
}

function callAnthropic(body) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const options = {
      hostname: "api.anthropic.com", path: "/v1/messages", method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "Content-Length": Buffer.byteLength(postData) },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    });
    req.on("error", reject);
    req.write(postData);
    req.end();
  });
}


function pageLogin() {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>BetBot — Login</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',sans-serif;background:#060f1e;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.card{background:#0d1f35;border-radius:16px;padding:32px 28px;width:100%;max-width:380px;border:0.5px solid #1a2f47}
.logo{width:48px;height:48px;background:#00e676;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:24px;margin:0 auto 16px}
h1{color:#fff;font-size:20px;text-align:center;margin-bottom:4px}p.sub{color:#8899aa;font-size:13px;text-align:center;margin-bottom:24px}
.tabs{display:flex;background:#0a1628;border-radius:8px;padding:4px;margin-bottom:20px}
.tab{flex:1;padding:8px;text-align:center;color:#556677;font-size:13px;cursor:pointer;border-radius:6px;transition:all .2s}
.tab.active{background:#00e676;color:#060f1e;font-weight:600}
label{display:block;color:#8899aa;font-size:12px;margin-bottom:5px}
input{width:100%;padding:11px 14px;background:#0a1628;border:0.5px solid #1a2f47;border-radius:8px;color:#fff;font-size:13px;margin-bottom:14px;outline:none}
input:focus{border-color:#00e676}
button{width:100%;padding:13px;background:#00e676;border:none;border-radius:8px;color:#060f1e;font-size:14px;font-weight:600;cursor:pointer;margin-top:4px}
.msg{font-size:12px;text-align:center;margin-top:12px;min-height:18px}.msg.err{color:#ff4848}.msg.ok{color:#00e676}
</style></head><body>
<div class="card">
  <div class="logo">⚽</div>
  <h1>BetBot Analytics</h1>
  <p class="sub">Análises esportivas por IA</p>
  <div class="tabs">
    <div class="tab active" id="tabLogin" onclick="showTab('login')">Entrar</div>
    <div class="tab" id="tabCad" onclick="showTab('cad')">Cadastrar</div>
  </div>
  <div id="formLogin">
    <label>E-mail</label><input id="lEmail" type="email" placeholder="seu@email.com"/>
    <label>Senha</label><input id="lSenha" type="password" placeholder="••••••••"/>
    <button onclick="login()">Entrar</button>
  </div>
  <div id="formCad" style="display:none">
    <label>Nome</label><input id="cNome" placeholder="Seu nome"/>
    <label>E-mail</label><input id="cEmail" type="email" placeholder="seu@email.com"/>
    <label>Senha</label><input id="cSenha" type="password" placeholder="Mínimo 6 caracteres"/>
    <button onclick="cadastrar()">Criar conta</button>
  </div>
  <div class="msg" id="msg"></div>
</div>
<script>
function showTab(t){
  document.getElementById('tabLogin').classList.toggle('active',t==='login');
  document.getElementById('tabCad').classList.toggle('active',t==='cad');
  document.getElementById('formLogin').style.display=t==='login'?'block':'none';
  document.getElementById('formCad').style.display=t==='cad'?'block':'none';
  document.getElementById('msg').textContent='';
}
function msg(text,type){var el=document.getElementById('msg');el.textContent=text;el.className='msg '+(type||'');}
async function login(){
  var email=document.getElementById('lEmail').value.trim();
  var senha=document.getElementById('lSenha').value;
  if(!email||!senha){msg('Preencha todos os campos','err');return;}
  var res=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,senha})});
  var data=await res.json();
  if(data.token){
    localStorage.setItem('token',data.token);
    localStorage.setItem('admin',data.admin);
    if(data.admin) window.location='/admin';
    else if(data.ativo_agora) window.location='/app';
    else window.location='/pagamento';
  } else msg(data.error||'Erro ao entrar','err');
}
async function cadastrar(){
  var nome=document.getElementById('cNome').value.trim();
  var email=document.getElementById('cEmail').value.trim();
  var senha=document.getElementById('cSenha').value;
  if(!nome||!email||!senha){msg('Preencha todos os campos','err');return;}
  if(senha.length<6){msg('Senha muito curta','err');return;}
  var res=await fetch('/api/cadastro',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nome,email,senha})});
  var data=await res.json();
  if(data.ok) msg('Conta criada! Agora faça login.','ok');
  else msg(data.error||'Erro ao cadastrar','err');
}
</script></body></html>`;
}

function pagePagamento(user) {
  const expirou = user.expira_em && new Date(user.expira_em) < new Date();
  const titulo = expirou ? "Renovar Assinatura" : "Ativar Acesso";
  const subtitulo = expirou
    ? `Sua assinatura expirou em ${new Date(user.expira_em).toLocaleDateString('pt-BR')}. Renove para continuar.`
    : `Olá, ${user.name}! Assine para ter acesso completo ao BetBot.`;

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>BetBot — Pagamento</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',sans-serif;background:#060f1e;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.card{background:#0d1f35;border-radius:16px;padding:32px 28px;width:100%;max-width:400px;border:0.5px solid #1a2f47;text-align:center}
.logo{width:48px;height:48px;background:#00e676;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:24px;margin:0 auto 16px}
h1{color:#fff;font-size:20px;margin-bottom:6px}p.sub{color:#8899aa;font-size:13px;margin-bottom:20px}
.badge-exp{background:rgba(255,72,72,.15);color:#ff4848;font-size:12px;padding:6px 14px;border-radius:8px;margin-bottom:16px;display:inline-block}
.preco{font-size:40px;font-weight:700;color:#00e676;margin:12px 0 2px}
.preco-sub{color:#8899aa;font-size:12px;margin-bottom:20px}
.pix-box{background:#0a1628;border-radius:10px;padding:16px;margin-bottom:16px;border:0.5px solid #1a2f47}
.pix-label{color:#8899aa;font-size:11px;margin-bottom:6px}.pix-key{color:#00e676;font-size:16px;font-weight:600;word-break:break-all}
.copy-btn{background:transparent;border:0.5px solid #00e676;color:#00e676;padding:7px 16px;border-radius:8px;font-size:12px;cursor:pointer;margin-top:10px;width:auto}
.steps{text-align:left;margin-bottom:20px}
.step{display:flex;gap:10px;align-items:flex-start;margin-bottom:10px;font-size:13px;color:#aabbcc}
.step-num{width:22px;height:22px;background:#1a2f47;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;color:#00e676;flex-shrink:0;margin-top:1px}
textarea{width:100%;padding:10px;background:#0a1628;border:0.5px solid #1a2f47;border-radius:8px;color:#fff;font-size:12px;resize:vertical;outline:none;margin-bottom:10px}
button.main{width:100%;padding:13px;background:#00e676;border:none;border-radius:8px;color:#060f1e;font-size:14px;font-weight:600;cursor:pointer}
.msg{font-size:12px;margin-top:10px;min-height:16px}.msg.err{color:#ff4848}.msg.ok{color:#00e676}
.logout{color:#556677;font-size:11px;cursor:pointer;margin-top:16px;display:block}
</style></head><body>
<div class="card">
  <div class="logo">⚽</div>
  <h1>${titulo}</h1>
  ${expirou ? '<div class="badge-exp">⚠️ Assinatura expirada</div>' : ''}
  <p class="sub">${subtitulo}</p>
  <div class="preco">${PRECO_MENSAL}</div>
  <div class="preco-sub">por mês — acesso renovável mensalmente</div>
  <div class="pix-box">
    <div class="pix-label">Chave PIX</div>
    <div class="pix-key">${SEU_PIX}</div>
    <button class="copy-btn" onclick="navigator.clipboard.writeText('${SEU_PIX}');this.textContent='✅ Copiado!'">📋 Copiar chave</button>
  </div>
  <div class="steps">
    <div class="step"><div class="step-num">1</div><span>Faça o PIX de <strong style="color:#00e676">${PRECO_MENSAL}</strong> para a chave acima</span></div>
    <div class="step"><div class="step-num">2</div><span>Cole o comprovante abaixo</span></div>
    <div class="step"><div class="step-num">3</div><span>Liberado em até 1 hora — acesso válido por 30 dias</span></div>
  </div>
  <textarea id="comp" rows="3" placeholder="Cole aqui o comprovante ou número da transação PIX..."></textarea>
  <button class="main" onclick="enviar()">✅ Enviei o comprovante</button>
  <div class="msg" id="msg"></div>
  <span class="logout" onclick="localStorage.clear();window.location='/'">Sair da conta</span>
</div>
<script>
var token=localStorage.getItem('token');
if(!token) window.location='/';
function msg(t,c){var el=document.getElementById('msg');el.textContent=t;el.className='msg '+(c||'');}
async function enviar(){
  var comp=document.getElementById('comp').value.trim();
  if(!comp){msg('Cole o comprovante antes de enviar','err');return;}
  var res=await fetch('/api/comprovante',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({comprovante:comp})});
  var data=await res.json();
  if(data.ok) msg('Comprovante enviado! Aguarde a liberação.','ok');
  else msg(data.error||'Erro','err');
}
</script></body></html>`;
}

function pageAdmin() {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>BetBot — Admin</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',sans-serif;background:#060f1e;min-height:100vh;padding:20px}
.header{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px}
h1{color:#fff;font-size:20px}.logout{color:#8899aa;cursor:pointer;background:transparent;border:0.5px solid #1a2f47;padding:7px 14px;border-radius:8px;font-size:13px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin-bottom:24px}
.stat{background:#0d1f35;border-radius:10px;padding:14px;text-align:center;border:0.5px solid #1a2f47}
.stat-val{color:#00e676;font-size:22px;font-weight:600}.stat-lbl{color:#556677;font-size:11px;margin-top:3px}
table{width:100%;border-collapse:collapse;background:#0d1f35;border-radius:10px;overflow:hidden;border:0.5px solid #1a2f47}
th{background:#0a1628;color:#8899aa;font-size:11px;text-transform:uppercase;padding:10px 14px;text-align:left}
td{padding:10px 14px;border-top:0.5px solid #1a2f47;color:#ddeeff;font-size:12px}
.badge{display:inline-block;padding:3px 9px;border-radius:20px;font-size:10px}
.badge-ok{background:rgba(0,230,118,.15);color:#00e676}
.badge-exp{background:rgba(255,72,72,.15);color:#ff4848}
.badge-pend{background:rgba(255,215,64,.15);color:#ffd740}
.badge-no{background:rgba(100,100,100,.2);color:#8899aa}
.btn-lib{background:#00e676;border:none;padding:5px 10px;border-radius:6px;color:#060f1e;font-size:11px;font-weight:600;cursor:pointer;margin-right:4px}
.btn-ren{background:#1a2f47;border:0.5px solid #00e676;padding:5px 10px;border-radius:6px;color:#00e676;font-size:11px;cursor:pointer;margin-right:4px}
.btn-blk{background:transparent;border:0.5px solid #ff4848;padding:5px 10px;border-radius:6px;color:#ff4848;font-size:11px;cursor:pointer}
.comp{color:#8899aa;font-size:11px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.expira{font-size:11px}
.expira.ok{color:#00e676}.expira.warn{color:#ffd740}.expira.exp{color:#ff4848}
</style></head><body>
<div class="header"><h1>⚽ BetBot — Painel Admin</h1><button class="logout" onclick="localStorage.clear();window.location='/'">Sair</button></div>
<div class="stats" id="stats"></div>
<table><thead><tr><th>Nome</th><th>E-mail</th><th>Status</th><th>Expira em</th><th>Comprovante</th><th>Ações</th></tr></thead>
<tbody id="tbody"></tbody></table>
<script>
var token=localStorage.getItem('token');
if(!token||localStorage.getItem('admin')!=='true') window.location='/';
function diasRestantes(exp){
  if(!exp) return null;
  var diff=new Date(exp)-new Date();
  return Math.ceil(diff/(1000*60*60*24));
}
async function load(){
  var res=await fetch('/api/admin/users',{headers:{'Authorization':'Bearer '+token}});
  var data=await res.json();
  var total=data.filter(u=>!u.admin).length;
  var ativos=data.filter(u=>!u.admin&&u.ativo&&u.expira_em&&new Date(u.expira_em)>new Date()).length;
  var pend=data.filter(u=>!u.admin&&!u.ativo&&u.comprovante).length;
  var expirando=data.filter(u=>!u.admin&&u.ativo&&u.expira_em&&diasRestantes(u.expira_em)<=5&&diasRestantes(u.expira_em)>0).length;
  document.getElementById('stats').innerHTML=
    '<div class="stat"><div class="stat-val">'+total+'</div><div class="stat-lbl">Assinantes</div></div>'+
    '<div class="stat"><div class="stat-val" style="color:#00e676">'+ativos+'</div><div class="stat-lbl">Ativos</div></div>'+
    '<div class="stat"><div class="stat-val" style="color:#ffd740">'+pend+'</div><div class="stat-lbl">Aguardando</div></div>'+
    '<div class="stat"><div class="stat-val" style="color:#ff7043">'+expirando+'</div><div class="stat-lbl">Expirando</div></div>';
  document.getElementById('tbody').innerHTML=data.filter(u=>!u.admin).map(function(u){
    var dias=diasRestantes(u.expira_em);
    var expirou=u.expira_em&&new Date(u.expira_em)<new Date();
    var badge=expirou?'<span class="badge badge-exp">Expirado</span>':u.ativo?'<span class="badge badge-ok">Ativo</span>':u.comprovante?'<span class="badge badge-pend">Aguardando</span>':'<span class="badge badge-no">Pendente</span>';
    var expiraStr='—';
    if(u.expira_em){
      var cls=expirou?'exp':dias<=5?'warn':'ok';
      expiraStr='<span class="expira '+cls+'">'+(expirou?'Expirou ':'')+new Date(u.expira_em).toLocaleDateString('pt-BR')+((!expirou&&dias)?(' ('+dias+'d)'):'')+'</span>';
    }
    var btns='';
    if(!u.ativo||expirou) btns+='<button class="btn-lib" onclick="acao('+u.id+',\'liberar\')">Liberar</button>';
    if(u.ativo&&!expirou) btns+='<button class="btn-ren" onclick="acao('+u.id+',\'renovar\')">+30 dias</button>';
    if(u.ativo) btns+='<button class="btn-blk" onclick="acao('+u.id+',\'bloquear\')">Bloquear</button>';
    return '<tr><td>'+u.name+'</td><td>'+u.email+'</td><td>'+badge+'</td><td>'+expiraStr+'</td><td><span class="comp" title="'+(u.comprovante||'')+'">'+(u.comprovante||'—')+'</span></td><td>'+btns+'</td></tr>';
  }).join('');
}
async function acao(id,tipo){
  await fetch('/api/admin/'+tipo,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({id})});
  load();
}
load();setInterval(load,30000);
</script></body></html>`;
}

// ======================================================
// SERVIDOR
// ======================================================
const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  const url = req.url.split("?")[0];

  if (req.method === "GET" && url === "/") return sendHTML(res, pageLogin());
  if (req.method === "GET" && url === "/admin") return sendHTML(res, pageAdmin());

  if (req.method === "GET" && url === "/pagamento") {
    const decoded = verifyToken(req);
    const user = decoded ? db.get("users").find({ id: decoded.id }).value() : null;
    if (!user) { res.writeHead(302, { Location: "/" }); res.end(); return; }
    return sendHTML(res, pagePagamento(user));
  }

  if (req.method === "GET" && url === "/app") {
    const filePath = path.join(__dirname, "index.html");
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end("index.html não encontrado"); return; }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(data);
    });
    return;
  }

  // Cadastro
  if (req.method === "POST" && url === "/api/cadastro") {
    const body = await getBody(req);
    if (!body.nome || !body.email || !body.senha) return sendJSON(res, 400, { error: "Preencha todos os campos" });
    if (db.get("users").find({ email: body.email }).value()) return sendJSON(res, 400, { error: "E-mail já cadastrado" });
    db.get("users").push({
      id: nextId(), name: body.nome, email: body.email,
      password: bcrypt.hashSync(body.senha, 10),
      ativo: false, admin: false, comprovante: "",
      expira_em: null, criado_em: new Date().toISOString()
    }).write();
    return sendJSON(res, 200, { ok: true });
  }

  // Login
  if (req.method === "POST" && url === "/api/login") {
    const body = await getBody(req);
    const user = db.get("users").find({ email: body.email }).value();
    if (!user || !bcrypt.compareSync(body.senha, user.password)) return sendJSON(res, 401, { error: "E-mail ou senha incorretos" });
    const ativo_agora = isAtivo(user);
    const token = jwt.sign({ id: user.id, email: user.email, admin: user.admin }, JWT_SECRET, { expiresIn: "7d" });
    return sendJSON(res, 200, { token, admin: user.admin, ativo_agora });
  }

  // Me
  if (req.method === "GET" && url === "/api/me") {
    const decoded = verifyToken(req);
    if (!decoded) return sendJSON(res, 401, { error: "Não autenticado" });
    const user = db.get("users").find({ id: decoded.id }).value();
    const ativo_agora = isAtivo(user);
    const dias = diasRestantes(user);
    return sendJSON(res, 200, { id: user.id, name: user.name, email: user.email, ativo: ativo_agora, admin: user.admin, expira_em: user.expira_em, dias_restantes: dias });
  }

  // Comprovante
  if (req.method === "POST" && url === "/api/comprovante") {
    const decoded = verifyToken(req);
    if (!decoded) return sendJSON(res, 401, { error: "Não autenticado" });
    const body = await getBody(req);
    db.get("users").find({ id: decoded.id }).assign({ comprovante: body.comprovante || "" }).write();
    return sendJSON(res, 200, { ok: true });
  }

  // Admin: listar
  if (req.method === "GET" && url === "/api/admin/users") {
    const decoded = verifyToken(req);
    if (!decoded || !decoded.admin) return sendJSON(res, 403, { error: "Sem permissão" });
    const users = db.get("users").value().map(u => ({
      id: u.id, name: u.name, email: u.email, ativo: u.ativo,
      admin: u.admin, comprovante: u.comprovante, expira_em: u.expira_em, criado_em: u.criado_em
    }));
    return sendJSON(res, 200, users);
  }

  // Admin: liberar (30 dias a partir de hoje)
  if (req.method === "POST" && url === "/api/admin/liberar") {
    const decoded = verifyToken(req);
    if (!decoded || !decoded.admin) return sendJSON(res, 403, { error: "Sem permissão" });
    const body = await getBody(req);
    const expira = new Date();
    expira.setDate(expira.getDate() + 30);
    db.get("users").find({ id: body.id }).assign({ ativo: true, expira_em: expira.toISOString(), comprovante: "" }).write();
    return sendJSON(res, 200, { ok: true });
  }

  // Admin: renovar (+30 dias a partir da data atual de expiração)
  if (req.method === "POST" && url === "/api/admin/renovar") {
    const decoded = verifyToken(req);
    if (!decoded || !decoded.admin) return sendJSON(res, 403, { error: "Sem permissão" });
    const body = await getBody(req);
    const user = db.get("users").find({ id: body.id }).value();
    const base = user.expira_em && new Date(user.expira_em) > new Date() ? new Date(user.expira_em) : new Date();
    base.setDate(base.getDate() + 30);
    db.get("users").find({ id: body.id }).assign({ ativo: true, expira_em: base.toISOString(), comprovante: "" }).write();
    return sendJSON(res, 200, { ok: true });
  }

  // Admin: bloquear
  if (req.method === "POST" && url === "/api/admin/bloquear") {
    const decoded = verifyToken(req);
    if (!decoded || !decoded.admin) return sendJSON(res, 403, { error: "Sem permissão" });
    const body = await getBody(req);
    db.get("users").find({ id: body.id }).assign({ ativo: false }).write();
    return sendJSON(res, 200, { ok: true });
  }

  // Fixtures
  if (req.method === "GET" && url === "/api/fixtures") {
    const decoded = verifyToken(req);
    if (!decoded) return sendJSON(res, 401, { error: "Não autenticado" });
    try {
      const fixtures = await getFixturesToday();
      const result = fixtures.sort((a, b) => a.fixture.timestamp - b.fixture.timestamp).slice(0, 15);
      return sendJSON(res, 200, result);
    } catch (e) { return sendJSON(res, 500, { error: e.message }); }
  }

  // Chat IA
  if (req.method === "POST" && url === "/api/chat") {
    const decoded = verifyToken(req);
    if (!decoded) return sendJSON(res, 401, { error: "Não autenticado" });
    const body = await getBody(req);
    try {
      const result = await callAnthropic(body);
      res.writeHead(result.status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(result.body);
    } catch (e) { return sendJSON(res, 500, { error: e.message }); }
    return;
  }

  res.writeHead(404); res.end("Não encontrado");
});

server.listen(PORT, () => {
  console.log("");
  console.log("╔══════════════════════════════════════╗");
  console.log("║   ⚽  BetBot Analytics rodando!      ║");
  console.log(`║   Acesse: http://localhost:${PORT}       ║`);
  console.log("╚══════════════════════════════════════╝");
  console.log("");
  console.log("👤 Admin:", ADMIN_EMAIL);
  console.log("🔑 Senha:", ADMIN_SENHA);
  console.log("💰 PIX:", SEU_PIX);
  console.log("💵 Preço:", PRECO_MENSAL, "/ mês");
  console.log("");
  if (ANTHROPIC_API_KEY === "SUA_CHAVE_ANTHROPIC_AQUI") console.log("⚠️  Configure ANTHROPIC_API_KEY no server.js");
  else console.log("✅ Anthropic configurada");
  console.log("✅ API-Football configurada");
});