// Giao diện đồ hoạ cho tool: một trang web chỉ chạy nội bộ trên máy (127.0.0.1), tự mở trong trình duyệt.
// Có mã bảo vệ ngẫu nhiên trong đường dẫn để trang web khác không gọi được vào tool.
import http from "node:http";
import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";

export async function startGui(api) {
  const { tool, isWin } = api;
  const token = randomBytes(16).toString("hex");
  let lastSeen = Date.now();
  let job = { running: false, lines: [], result: null };

  function openBrowser(url) {
    if (process.env.LTFARM_NO_BROWSER) return;
    const [cmd, args] = isWin ? ["cmd", ["/c", "start", '""', url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
    execFile(cmd, args, { windowsHide: true }, () => {});
  }

  async function runJob(dry) {
    job = { running: true, lines: [], result: null, dry };
    const orig = console.log;
    console.log = (...a) => { const s = a.map(String).join(" ").replace(/\x1b\[[0-9;]*m/g, ""); job.lines.push(s); if (!isWin) orig(s); };
    try { job.result = await api.farm({ dry }); }
    catch (e) { job.result = { ok: false, error: String(e.message || e) }; }
    finally { console.log = orig; job.running = false; }
  }

  const send = (res, code, body, type = "application/json; charset=utf-8") => {
    res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    res.end(typeof body === "string" ? body : JSON.stringify(body));
  };
  const readBody = (req) => new Promise((r) => { let b = ""; req.on("data", (c) => { b += c; if (b.length > 1e5) req.destroy(); }); req.on("end", () => { try { r(JSON.parse(b || "{}")); } catch { r({}); } }); });

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://x");
      const host = (req.headers.host || "").split(":")[0];
      if (host !== "127.0.0.1" && host !== "localhost") return send(res, 403, { error: "forbidden" });
      if (url.pathname === "/" ) {
        if (url.searchParams.get("t") !== token) return send(res, 403, "Mở tool lại để có đường dẫn mới.", "text/plain; charset=utf-8");
        return send(res, 200, page(tool, token), "text/html; charset=utf-8");
      }
      if (req.headers["x-token"] !== token) return send(res, 403, { error: "forbidden" });
      lastSeen = Date.now();
      const p = url.pathname;
      if (p === "/api/info") return send(res, 200, api.info());
      if (p === "/api/status") return send(res, 200, await api.status());
      if (p === "/api/key" && req.method === "POST") { const b = await readBody(req); return send(res, 200, api.setKey(b.privateKey || "")); }
      if (p === "/api/farm" && req.method === "POST") {
        if (job.running) return send(res, 409, { error: "Đang chạy rồi" });
        const b = await readBody(req); runJob(!!b.dry); return send(res, 200, { ok: true });
      }
      if (p === "/api/log") { const from = Number(url.searchParams.get("from") || 0); return send(res, 200, { running: job.running, lines: job.lines.slice(from), total: job.lines.length, result: job.result }); }
      if (p === "/api/schedule" && req.method === "POST") { const b = await readBody(req); return send(res, 200, api.schedule(!!b.on)); }
      if (p === "/api/telegram" && req.method === "POST") { const b = await readBody(req); return send(res, 200, await api.setTelegram(b.token || "", b.chat || "")); }
      if (p === "/api/settings" && req.method === "POST") { const b = await readBody(req); return send(res, 200, api.setSettings(b)); }
      if (p === "/api/quit" && req.method === "POST") { send(res, 200, { ok: true }); setTimeout(() => process.exit(0), 300); return; }
      return send(res, 404, { error: "not found" });
    } catch (e) { return send(res, 500, { error: String(e.message || e) }); }
  });

  const port = Number(process.env.LTFARM_PORT || 0);
  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}/?t=${token}`;
  if (!isWin) console.log(`Giao diện: ${url}\n(Đóng cửa sổ trình duyệt rồi bấm "Thoát" trong giao diện để tắt tool.)`);
  if (process.env.LTFARM_PRINT_URL) console.log("LTFARM_URL=" + url);
  openBrowser(url);
  // Tự tắt khi không còn ai mở giao diện 20 phút (và không đang farm)
  setInterval(() => { if (!job.running && Date.now() - lastSeen > 20 * 60e3) process.exit(0); }, 60e3).unref?.();
  await new Promise(() => {});
}

function page(tool, token) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  return `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(tool.name)}</title>
<style>
:root{--bg:#0c0f14;--panel:#131820;--p2:#1a2029;--line:#252d38;--t:#e6eaf0;--m:#8a95a5;--a:#7cf0b4;--b:#5ab8ff;--w:#ffc35a;--r:#ff6b7a}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--t);font:15px/1.55 system-ui,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:780px;margin:0 auto;padding:28px 18px 60px}
h1{margin:0;font-size:24px}h1 span{color:var(--a)}.sub{color:var(--m);font-size:13px}
.top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:20px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;margin-bottom:14px}
.card h2{margin:0 0 4px;font-size:17px;display:flex;align-items:center;gap:10px}
.num{width:28px;height:28px;border-radius:50%;background:var(--p2);border:1px solid var(--line);display:inline-flex;align-items:center;justify-content:center;font-size:14px;color:var(--b);font-weight:700;flex:none}
.done .num{background:var(--a);color:#06240f;border-color:var(--a)}
.hint{color:var(--m);font-size:13px;margin:4px 0 12px}
input{width:100%;background:var(--p2);border:1px solid var(--line);color:var(--t);border-radius:10px;padding:11px 12px;font:inherit}
input:focus{outline:none;border-color:var(--b)}
button,.btn{font:inherit;font-weight:600;cursor:pointer;border-radius:10px;border:1px solid var(--line);background:var(--p2);color:var(--t);padding:10px 16px;text-decoration:none;display:inline-block}
button:hover,.btn:hover{border-color:var(--b)}button:disabled{opacity:.5;cursor:default}
.pri{background:var(--a);color:#06240f;border-color:var(--a)}.big{font-size:16px;padding:13px 22px}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-top:6px}
.st{background:var(--p2);border-radius:10px;padding:10px 12px}.st b{display:block;font-size:20px}.st span{color:var(--m);font-size:12px}
.ok{color:var(--a)}.err{color:var(--r)}.warn{background:#2a1f12;border:1px solid #5a4a2a;color:var(--w);border-radius:10px;padding:10px 12px;font-size:13px;margin:10px 0}
.addr{font-family:ui-monospace,Consolas,monospace;font-size:13px;background:var(--p2);padding:8px 10px;border-radius:8px;word-break:break-all}
.log{background:#05070a;border:1px solid var(--line);border-radius:10px;padding:10px 12px;font:12px/1.6 ui-monospace,Consolas,monospace;max-height:220px;overflow:auto;white-space:pre-wrap;display:none;margin-top:12px}
.switch{display:flex;align-items:center;gap:12px}
.pill{font-size:12px;padding:3px 10px;border-radius:20px;border:1px solid var(--line)}.pill.on{border-color:#2f5a44;color:var(--a)}
details summary{cursor:pointer;color:var(--b);font-weight:600}
.toast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:var(--a);color:#06240f;padding:9px 18px;border-radius:20px;font-weight:600;display:none}
</style></head><body><div class="wrap">
<div class="top"><div><h1>🪂 ${esc(tool.name)}</h1><div class="sub">v${esc(tool.version)} · chạy trên máy bạn · <span id="plat"></span></div></div>
<button id="quit" title="Tắt tool (lịch tự chạy vẫn hoạt động)">Thoát</button></div>

<div class="card" id="c1"><h2><span class="num">1</span>Cài ví farm</h2>
<div class="hint">Dán <b>private key của ví farm riêng</b> (không dùng ví chính). Key chỉ lưu trên máy này, không gửi đi đâu.</div>
<div id="keyView" style="display:none"><div class="addr" id="addr"></div><div class="row" style="margin-top:10px"><button id="copyAddr">Copy địa chỉ</button><button id="changeKey">Đổi ví</button></div></div>
<div id="keyEdit"><div class="row"><input id="pk" type="password" placeholder="0x… (64 ký tự)" autocomplete="off" style="flex:1;min-width:240px"><button class="pri" id="saveKey">Lưu</button></div>
<div class="hint" style="margin-top:8px">MetaMask: bấm ⋮ → Account details → Show private key.</div></div></div>

<div class="card" id="c2"><h2><span class="num">2</span>Xin gas miễn phí &amp; kiểm tra</h2>
<div class="hint">Mở faucet, dán địa chỉ ví ở bước 1, nhận ${esc(tool.chain.nativeSymbol)} testnet. Xong bấm “Làm mới”.</div>
<div class="row"><a class="btn" id="faucet" target="_blank" rel="noopener">Mở faucet ↗</a><button id="refresh">↻ Làm mới</button><a class="btn" id="explorer" target="_blank" rel="noopener">Xem ví trên explorer ↗</a></div>
<div class="stats" id="stats"></div><div id="statusMsg"></div></div>

<div class="card" id="c3"><h2><span class="num">3</span>Farm thử 1 lần</h2>
<div class="hint">Tool làm vài giao dịch nhỏ, có nghỉ ngẫu nhiên giữa chừng nên có thể mất vài phút. “Chạy thử” chỉ xem kế hoạch, không gửi giao dịch.</div>
<div class="row"><button class="pri big" id="farm">▶ Farm ngay</button><button id="dry">Chạy thử</button><span id="farmMsg"></span></div>
<div class="log" id="log"></div></div>

<div class="card" id="c4"><h2><span class="num">4</span>Tự chạy mỗi ngày</h2>
<div class="hint">Bật lên là mỗi ngày tool tự farm 1 lần vào giờ ngẫu nhiên 8h–20h (máy cần bật, không cần mở giao diện này). Khoảng 10% số ngày tool tự nghỉ cho giống người thật.</div>
<div class="switch"><button class="pri" id="schedOn">Bật tự chạy</button><button id="schedOff">Tắt</button><span class="pill" id="schedPill">…</span></div>
<div id="schedMsg" class="hint" style="margin-top:10px"></div></div>

<div class="card"><details><summary>⚙️ Tuỳ chọn: báo kết quả qua Telegram</summary>
<div class="hint" style="margin-top:10px">Tạo bot: chat với @BotFather → /newbot → lấy token. Nhắn 1 tin cho bot, rồi mở https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates để lấy chat id. Để trống cả hai để tắt.</div>
<div class="row"><input id="tgToken" placeholder="Bot token" style="flex:2;min-width:200px"><input id="tgChat" placeholder="Chat id" style="flex:1;min-width:120px"><button id="tgSave">Lưu &amp; gửi thử</button></div></details></div>
<div class="sub" id="dataDir"></div>
</div><div class="toast" id="toast"></div>
<script>
const T=${JSON.stringify(token)};const $=id=>document.getElementById(id);
async function api(p,body){const r=await fetch(p,{method:body?"POST":"GET",headers:{"x-token":T,"content-type":"application/json"},body:body?JSON.stringify(body):undefined});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||r.status);return j}
let tt;function toast(s){const e=$("toast");e.textContent=s;e.style.display="block";clearTimeout(tt);tt=setTimeout(()=>e.style.display="none",2200)}
const esc=s=>String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
let info=null;
async function loadInfo(){info=await api("/api/info");$("plat").textContent=info.platform;$("faucet").href=info.faucet;$("dataDir").textContent="Dữ liệu tool: "+info.dir;
  if(info.address){$("keyView").style.display="";$("keyEdit").style.display="none";$("addr").textContent=info.address;$("c1").classList.add("done");$("explorer").href=info.explorer+"/address/"+info.address;$("explorer").style.display=""}
  else{$("keyView").style.display="none";$("keyEdit").style.display="";$("c1").classList.remove("done");$("explorer").style.display="none"}
  $("schedPill").textContent=info.schedule.on?"✅ Đang bật":"Đang tắt";$("schedPill").className="pill"+(info.schedule.on?" on":"");$("c4").classList.toggle("done",info.schedule.on);
  $("schedMsg").textContent=info.schedule.text||"";
  ["farm","dry","schedOn","refresh"].forEach(id=>$(id).disabled=!info.address);
}
async function loadStatus(){
  if(!info||!info.address){$("stats").innerHTML="";$("statusMsg").innerHTML='<div class="hint">Cài ví ở bước 1 trước.</div>';return}
  $("statusMsg").innerHTML='<div class="hint">Đang đọc số liệu…</div>';
  try{const s=await api("/api/status");
    const cells=[[s.balance+" "+s.symbol,"số dư"],[s.nonce,"giao dịch đã gửi"],[s.days,"ngày đã farm"],...(s.extra||[]).map(x=>[x.value,x.label])];
    $("stats").innerHTML=cells.map(c=>'<div class="st"><b>'+esc(c[0])+'</b><span>'+esc(c[1])+'</span></div>').join("");
    let m="";if(s.low)m+='<div class="warn">⚠️ Số dư thấp — bấm “Mở faucet” xin thêm '+esc(s.symbol)+' rồi “Làm mới”.</div>';
    if(s.last)m+='<div class="hint">Lần farm gần nhất: '+new Date(s.last.at).toLocaleString("vi-VN")+' — '+(s.last.skipped?"nghỉ":s.last.ok?'<span class="ok">✅ '+s.last.txCount+' giao dịch</span>':'<span class="err">❌ '+esc(s.last.error||"lỗi")+'</span>')+'</div>';
    $("statusMsg").innerHTML=m;$("c2").classList.toggle("done",!s.low&&s.balance>0);$("c3").classList.toggle("done",!!(s.last&&s.last.ok&&s.last.txCount>0));
  }catch(e){$("statusMsg").innerHTML='<div class="warn">Không đọc được số liệu từ mạng: '+esc(e.message)+'</div>'}
}
$("saveKey").onclick=async()=>{try{const r=await api("/api/key",{privateKey:$("pk").value});if(r.error)return toast(r.error);$("pk").value="";toast("Đã lưu ví farm");await loadInfo();loadStatus()}catch(e){toast(e.message)}};
$("changeKey").onclick=()=>{$("keyView").style.display="none";$("keyEdit").style.display=""};
$("copyAddr").onclick=async()=>{try{await navigator.clipboard.writeText(info.address);toast("Đã copy địa chỉ")}catch(e){toast("Bôi đen địa chỉ rồi Ctrl+C")}};
$("refresh").onclick=loadStatus;
async function farm(dry){$("farm").disabled=$("dry").disabled=true;$("log").style.display="block";$("log").textContent=dry?"Chạy thử…\\n":"Bắt đầu farm…\\n";$("farmMsg").textContent="⏳ đang chạy…";
  try{await api("/api/farm",{dry})}catch(e){toast(e.message)}
  let from=0;const t=setInterval(async()=>{try{const r=await api("/api/log?from="+from);if(r.lines.length){$("log").textContent+=r.lines.join("\\n")+"\\n";$("log").scrollTop=1e9;from=r.total}
    if(!r.running){clearInterval(t);$("farm").disabled=$("dry").disabled=false;const x=r.result||{};$("farmMsg").innerHTML=x.ok?'<span class="ok">✅ Xong'+(dry?"":": "+x.txCount+" giao dịch")+'</span>':'<span class="err">❌ '+esc(x.error||"lỗi")+'</span>';if(!dry)loadStatus()}}catch(e){}},1500)}
$("farm").onclick=()=>farm(false);$("dry").onclick=()=>farm(true);
$("schedOn").onclick=async()=>{try{const r=await api("/api/schedule",{on:true});toast(r.ok?"Đã bật tự chạy":"Lỗi: "+r.error);await loadInfo();if(r.text)$("schedMsg").textContent=r.text}catch(e){toast(e.message)}};
$("schedOff").onclick=async()=>{try{await api("/api/schedule",{on:false});toast("Đã tắt tự chạy");loadInfo()}catch(e){toast(e.message)}};
$("tgSave").onclick=async()=>{try{const r=await api("/api/telegram",{token:$("tgToken").value.trim(),chat:$("tgChat").value.trim()});toast(r.message||"Đã lưu")}catch(e){toast(e.message)}};
$("quit").onclick=async()=>{try{await api("/api/quit",{})}catch(e){}document.body.innerHTML='<div class="wrap"><h1>👋 Đã tắt tool</h1><p class="sub">Lịch tự chạy (nếu đã bật) vẫn hoạt động. Mở lại tool bất cứ lúc nào.</p></div>'};
setInterval(()=>api("/api/info").catch(()=>{}),60000);
loadInfo().then(loadStatus);
</script></body></html>`;
}
