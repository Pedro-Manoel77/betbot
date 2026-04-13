const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "AIzaSyBMMm3W-TbEjLzf4-kLh1YnE0DiRAd0EOk";
const FOOTBALL_API_KEY  = "183b5b9e068285c38162478d9829fe29";
const JWT_SECRET        = "betbot_secret_2026";
const PRECO_MENSAL      = "R$ 60,00";
const SEU_PIX           = "32991843008";
const ADMIN_EMAIL       = process.env.ADMIN_EMAIL || "ztxautomacaoeprojetos@gmail.com";
const ADMIN_SENHA       = process.env.ADMIN_SENHA || "Morreuztx7txy";
const MONGODB_URI       = process.env.MONGODB_URI || "mongodb+srv://pedromanoel7799_db_user:Betbot2026@cluster0.pt6bfhu.mongodb.net/betbot?retryWrites=true&w=majority&appName=Cluster0";
const PORT              = process.env.PORT || 3000;

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  ativo: { type: Boolean, default: false },
  admin: { type: Boolean, default: false },
  comprovante: { type: String, default: "" },
  expira_em: { type: Date, default: null },
  criado_em: { type: Date, default: Date.now }
});
const User = mongoose.model("User", userSchema);

mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log("✅ MongoDB conectado!");
    await User.deleteOne({ email: ADMIN_EMAIL });
    await User.create({
      name: "Admin", email: ADMIN_EMAIL,
      password: bcrypt.hashSync(ADMIN_SENHA, 10),
      ativo: true, admin: true
    });
    console.log("✅ Admin recriado:", ADMIN_EMAIL);
  })
  .catch(e => console.error("❌ Erro MongoDB:", e.message));

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
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Length": Buffer.byteLength(postData)
      },
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
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>BetBot</title>
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
  <div class="logo">&#x26BD;</div>
  <h1>BetBot Analytics</h1>
  <p class="sub">Analises esportivas por IA</p>
  <div class="tabs">
    <div class="tab active" id="tabLogin" onclick="showTab('login')">Entrar</div>
    <div class="tab" id="tabCad" onclick="showTab('cad')">Cadastrar</div>
  </div>
  <div id="formLogin">
    <label>E-mail</label><input id="lEmail" type="email" placeholder="seu@email.com"/>
    <label>Senha</label><input id="lSenha" type="password" placeholder="********"/>
    <button onclick="login()">Entrar</button>
  </div>
  <div id="formCad" style="display:none">
    <label>Nome</label><input id="cNome" placeholder="Seu nome"/>
    <label>E-mail</label><input id="cEmail" type="email" placeholder="seu@email.com"/>
    <label>Senha</label><input id="cSenha" type="password" placeholder="Minimo 6 caracteres"/>
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
  var res=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email,senha:senha})});
  var data=await res.json();
  if(data.token){
    localStorage.setItem('token',data.token);
    localStorage.setItem('admin',String(data.admin));
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
  var res=await fetch('/api/cadastro',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nome:nome,email:email,senha:senha})});
  var data=await res.json();
  if(data.ok) msg('Conta criada! Agora faca login.','ok');
  else msg(data.error||'Erro ao cadastrar','err');
}
</script></body></html>`;
}

function pagePagamento() {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>BetBot - Pagamento</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',sans-serif;background:#060f1e;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.card{background:#0d1f35;border-radius:16px;padding:32px 28px;width:100%;max-width:400px;border:0.5px solid #1a2f47;text-align:center}
.logo{width:48px;height:48px;background:#00e676;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:24px;margin:0 auto 16px}
h1{color:#fff;font-size:20px;margin-bottom:6px}p.sub{color:#8899aa;font-size:13px;margin-bottom:20px}
.preco{font-size:40px;font-weight:700;color:#00e676;margin:12px 0 2px}.preco-sub{color:#8899aa;font-size:12px;margin-bottom:20px}
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
  <div class="logo">&#x26BD;</div>
  <h1>Ativar Acesso</h1>
  <p class="sub">Faca o pagamento para liberar seu acesso ao BetBot.</p>
  <div class="preco">${PRECO_MENSAL}</div>
  <div class="preco-sub">por mes - acesso renovavel mensalmente</div>
  <div class="pix-box">
    <div class="pix-label">Chave PIX</div>
    <div class="pix-key" id="pixkey">${SEU_PIX}</div>
    <button class="copy-btn" onclick="document.getElementById('pixkey').textContent;navigator.clipboard.writeText('${SEU_PIX}');this.textContent='Copiado!'">Copiar chave</button>
  </div>
  <div class="steps">
    <div class="step"><div class="step-num">1</div><span>Faca o PIX de <strong style="color:#00e676">${PRECO_MENSAL}</strong> para a chave acima</span></div>
    <div class="step"><div class="step-num">2</div><span>Cole o comprovante abaixo</span></div>
    <div class="step"><div class="step-num">3</div><span>Liberado em ate 1 hora - acesso valido por 30 dias</span></div>
  </div>
  <textarea id="comp" rows="3" placeholder="Cole aqui o comprovante ou numero da transacao PIX..."></textarea>
  <button class="main" onclick="enviar()">Enviei o comprovante</button>
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
  if(data.ok) msg('Comprovante enviado! Aguarde a liberacao.','ok');
  else msg(data.error||'Erro','err');
}
</script></body></html>`;
}

function pageAdmin() {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>BetBot - Admin</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',sans-serif;background:#060f1e;min-height:100vh;padding:20px}
.header{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px}
h1{color:#fff;font-size:20px}
.logout{color:#8899aa;cursor:pointer;background:transparent;border:0.5px solid #1a2f47;padding:7px 14px;border-radius:8px;font-size:13px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin-bottom:24px}
.stat{background:#0d1f35;border-radius:10px;padding:14px;text-align:center;border:0.5px solid #1a2f47}
.stat-val{color:#00e676;font-size:22px;font-weight:600}
.stat-lbl{color:#556677;font-size:11px;margin-top:3px}
.tbl{width:100%;border-collapse:collapse;background:#0d1f35;border-radius:10px;border:0.5px solid #1a2f47}
th{background:#0a1628;color:#8899aa;font-size:11px;text-transform:uppercase;padding:10px 14px;text-align:left}
td{padding:10px 14px;border-top:0.5px solid #1a2f47;color:#ddeeff;font-size:12px}
.badge{display:inline-block;padding:3px 9px;border-radius:20px;font-size:10px}
.b-ok{background:rgba(0,230,118,.15);color:#00e676}
.b-exp{background:rgba(255,72,72,.15);color:#ff4848}
.b-pend{background:rgba(255,215,64,.15);color:#ffd740}
.b-no{background:rgba(100,100,100,.2);color:#8899aa}
.btn-lib{background:#00e676;border:none;padding:5px 10px;border-radius:6px;color:#060f1e;font-size:11px;font-weight:600;cursor:pointer;margin-right:4px}
.btn-ren{background:#1a2f47;border:0.5px solid #00e676;padding:5px 10px;border-radius:6px;color:#00e676;font-size:11px;cursor:pointer;margin-right:4px}
.btn-blk{background:transparent;border:0.5px solid #ff4848;padding:5px 10px;border-radius:6px;color:#ff4848;font-size:11px;cursor:pointer}
.comp{color:#8899aa;font-size:11px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
</style>
</head><body>
<div class="header"><h1>BetBot - Painel Admin</h1><button class="logout" onclick="localStorage.clear();window.location='/'">Sair</button></div>
<div class="stats" id="stats">Carregando...</div>
<table class="tbl"><thead><tr><th>Nome</th><th>E-mail</th><th>Status</th><th>Expira em</th><th>Comprovante</th><th>Acoes</th></tr></thead>
<tbody id="tbody"><tr><td colspan="6" style="text-align:center;color:#556677;padding:20px">Carregando usuarios...</td></tr></tbody></table>
<script>
var token = localStorage.getItem('token');
var isAdmin = localStorage.getItem('admin');
if(!token || isAdmin !== 'true') { window.location='/'; }

function dr(exp){
  if(!exp) return null;
  return Math.ceil((new Date(exp)-new Date())/(1000*60*60*24));
}

async function load(){
  try {
    var res = await fetch('/api/admin/users', {headers:{'Authorization':'Bearer '+token}});
    var data = await res.json();
    if(data.error){ document.getElementById('tbody').innerHTML='<tr><td colspan="6" style="color:#ff4848;text-align:center;padding:20px">Erro: '+data.error+'</td></tr>'; return; }
    var clientes = data.filter(function(u){return !u.admin;});
    var ativos = clientes.filter(function(u){return u.ativo && u.expira_em && new Date(u.expira_em)>new Date();}).length;
    var pend = clientes.filter(function(u){return !u.ativo && u.comprovante;}).length;
    document.getElementById('stats').innerHTML =
      '<div class="stat"><div class="stat-val">'+clientes.length+'</div><div class="stat-lbl">Total</div></div>'+
      '<div class="stat"><div class="stat-val" style="color:#00e676">'+ativos+'</div><div class="stat-lbl">Ativos</div></div>'+
      '<div class="stat"><div class="stat-val" style="color:#ffd740">'+pend+'</div><div class="stat-lbl">Aguardando</div></div>';
    if(clientes.length === 0){
      document.getElementById('tbody').innerHTML='<tr><td colspan="6" style="text-align:center;color:#556677;padding:20px">Nenhum usuario cadastrado ainda.</td></tr>';
      return;
    }
    var rows = '';
    for(var i=0;i<clientes.length;i++){
      var u = clientes[i];
      var expirou = u.expira_em && new Date(u.expira_em) < new Date();
      var dias = dr(u.expira_em);
      var badge = expirou ? '<span class="badge b-exp">Expirado</span>' : u.ativo ? '<span class="badge b-ok">Ativo</span>' : u.comprovante ? '<span class="badge b-pend">Aguardando</span>' : '<span class="badge b-no">Pendente</span>';
      var expStr = u.expira_em ? new Date(u.expira_em).toLocaleDateString('pt-BR')+(dias&&!expirou?' ('+dias+'d)':'') : '-';
      var id = String(u._id);
      var btns = '';
      if(!u.ativo || expirou) btns += '<button class="btn-lib" onclick="liberar(this)" data-id="'+id+'">Liberar</button>';
      if(u.ativo && !expirou) btns += '<button class="btn-ren" onclick="renovar(this)" data-id="'+id+'">+30 dias</button>';
      if(u.ativo) btns += '<button class="btn-blk" onclick="bloquear(this)" data-id="'+id+'">Bloquear</button>';
      rows += '<tr><td>'+u.name+'</td><td>'+u.email+'</td><td>'+badge+'</td><td>'+expStr+'</td><td><span class="comp">'+(u.comprovante||'-')+'</span></td><td>'+btns+'</td></tr>';
    }
    document.getElementById('tbody').innerHTML = rows;
  } catch(e) {
    document.getElementById('tbody').innerHTML='<tr><td colspan="6" style="color:#ff4848;text-align:center;padding:20px">Erro ao carregar: '+e.message+'</td></tr>';
  }
}

async function liberar(el){
  var id = el.getAttribute('data-id');
  await fetch('/api/admin/liberar',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({id:id})});
  load();
}
async function renovar(el){
  var id = el.getAttribute('data-id');
  await fetch('/api/admin/renovar',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({id:id})});
  load();
}
async function bloquear(el){
  var id = el.getAttribute('data-id');
  await fetch('/api/admin/bloquear',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({id:id})});
  load();
}

load();
setInterval(load, 15000);
</script></body></html>`;
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  const url = req.url.split("?")[0];

  if (req.method === "GET" && url === "/") return sendHTML(res, pageLogin());
  if (req.method === "GET" && url === "/admin") return sendHTML(res, pageAdmin());
  if (req.method === "GET" && url === "/pagamento") return sendHTML(res, pagePagamento());

  if (req.method === "GET" && url === "/app") {
    const filePath = path.join(__dirname, "index.html");
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end("index.html nao encontrado"); return; }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(data);
    });
    return;
  }

  if (req.method === "POST" && url === "/api/cadastro") {
    const body = await getBody(req);
    if (!body.nome || !body.email || !body.senha) return sendJSON(res, 400, { error: "Preencha todos os campos" });
    const exists = await User.findOne({ email: body.email });
    if (exists) return sendJSON(res, 400, { error: "E-mail ja cadastrado" });
    await User.create({ name: body.nome, email: body.email, password: bcrypt.hashSync(body.senha, 10) });
    return sendJSON(res, 200, { ok: true });
  }

  if (req.method === "POST" && url === "/api/login") {
    const body = await getBody(req);
    const user = await User.findOne({ email: body.email });
    if (!user || !bcrypt.compareSync(body.senha, user.password)) return sendJSON(res, 401, { error: "E-mail ou senha incorretos" });
    const ativo_agora = isAtivo(user);
    const token = jwt.sign({ id: user._id, email: user.email, admin: user.admin }, JWT_SECRET, { expiresIn: "7d" });
    return sendJSON(res, 200, { token, admin: user.admin, ativo_agora });
  }

  if (req.method === "GET" && url === "/api/me") {
    const decoded = verifyToken(req);
    if (!decoded) return sendJSON(res, 401, { error: "Nao autenticado" });
    const user = await User.findById(decoded.id);
    if (!user) return sendJSON(res, 401, { error: "Usuario nao encontrado" });
    return sendJSON(res, 200, { id: user._id, name: user.name, email: user.email, ativo: isAtivo(user), admin: user.admin, expira_em: user.expira_em, dias_restantes: diasRestantes(user) });
  }

  if (req.method === "POST" && url === "/api/comprovante") {
    const decoded = verifyToken(req);
    if (!decoded) return sendJSON(res, 401, { error: "Nao autenticado" });
    const body = await getBody(req);
    await User.findByIdAndUpdate(decoded.id, { comprovante: body.comprovante || "" });
    return sendJSON(res, 200, { ok: true });
  }

  if (req.method === "GET" && url === "/api/admin/users") {
    const decoded = verifyToken(req);
    if (!decoded || !decoded.admin) return sendJSON(res, 403, { error: "Sem permissao" });
    const users = await User.find().sort({ criado_em: -1 });
    return sendJSON(res, 200, users);
  }

  if (req.method === "POST" && url === "/api/admin/liberar") {
    const decoded = verifyToken(req);
    if (!decoded || !decoded.admin) return sendJSON(res, 403, { error: "Sem permissao" });
    const body = await getBody(req);
    const expira = new Date();
    expira.setDate(expira.getDate() + 30);
    await User.findByIdAndUpdate(body.id, { ativo: true, expira_em: expira, comprovante: "" });
    return sendJSON(res, 200, { ok: true });
  }

  if (req.method === "POST" && url === "/api/admin/renovar") {
    const decoded = verifyToken(req);
    if (!decoded || !decoded.admin) return sendJSON(res, 403, { error: "Sem permissao" });
    const body = await getBody(req);
    const user = await User.findById(body.id);
    const base = user.expira_em && new Date(user.expira_em) > new Date() ? new Date(user.expira_em) : new Date();
    base.setDate(base.getDate() + 30);
    await User.findByIdAndUpdate(body.id, { ativo: true, expira_em: base, comprovante: "" });
    return sendJSON(res, 200, { ok: true });
  }

  if (req.method === "POST" && url === "/api/admin/bloquear") {
    const decoded = verifyToken(req);
    if (!decoded || !decoded.admin) return sendJSON(res, 403, { error: "Sem permissao" });
    const body = await getBody(req);
    await User.findByIdAndUpdate(body.id, { ativo: false });
    return sendJSON(res, 200, { ok: true });
  }

  if (req.method === "GET" && url === "/api/fixtures") {
    const decoded = verifyToken(req);
    if (!decoded) return sendJSON(res, 401, { error: "Nao autenticado" });
    try {
      const fixtures = await getFixturesToday();
      const result = fixtures.sort((a, b) => a.fixture.timestamp - b.fixture.timestamp).slice(0, 15);
      return sendJSON(res, 200, result);
    } catch (e) { return sendJSON(res, 500, { error: e.message }); }
  }

  if (req.method === "POST" && url === "/api/chat") {
    const decoded = verifyToken(req);
    if (!decoded) return sendJSON(res, 401, { error: "Nao autenticado" });
    const body = await getBody(req);
    try {
      const result = await callAnthropic(body);
      res.writeHead(result.status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(result.body);
    } catch (e) { return sendJSON(res, 500, { error: e.message }); }
    return;
  }

  res.writeHead(404); res.end("Nao encontrado");
});

server.listen(PORT, () => {
  console.log("");
  console.log("╔══════════════════════════════════════╗");
  console.log("║   ⚽  BetBot Analytics rodando!      ║");
  console.log(`║   Acesse: http://localhost:${PORT}       ║`);
  console.log("╚══════════════════════════════════════╝");
  console.log("");
  console.log("💰 PIX:", SEU_PIX);
  console.log("💵 Preco:", PRECO_MENSAL, "/ mes");
  console.log("");
  if (ANTHROPIC_API_KEY === "SUA_CHAVE_AQUI") console.log("⚠️  Configure ANTHROPIC_API_KEY");
  else console.log("✅ Anthropic configurada");
  console.log("✅ API-Football configurada");
});