// Простые страницы для ссылок из писем. Токен подтверждается кнопкой (POST), а не открытием ссылки:
// так почтовые сканеры, которые «переходят» по ссылкам, не погасят одноразовый токен.
const base = (title, body, script) => `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><meta name="referrer" content="no-referrer"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0a1a;color:#ece8ff;font:16px/1.5 system-ui,sans-serif;padding:16px}
main{max-width:380px;width:100%;background:#15132b;border:1px solid #2c2850;border-radius:16px;padding:24px}h1{font-size:22px;margin:0 0 12px}
input,button{width:100%;box-sizing:border-box;padding:12px;border-radius:10px;border:1px solid #3a3566;background:#0f0d22;color:inherit;font:inherit;margin-top:10px}
button{background:#c9a24d;color:#1a1530;border:0;font-weight:600;cursor:pointer}#msg{margin-top:12px}.err{color:#ff9b9b}.ok{color:#9be3b0}a{color:#c9a24d}</style></head>
<body><main>${body}<p id="msg" role="status"></p></main><script>${script}</script></body></html>`;

const tokenFromUrl = `const token=new URLSearchParams(location.search).get("token")||"";history.replaceState(null,"",location.pathname);
const msg=document.getElementById("msg");const post=(u,b)=>fetch(u,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)}).then(async r=>({ok:r.ok,j:await r.json().catch(()=>({}))}));`;

export const confirmPage = () => base("Подтверждение почты",
  `<h1>Подтверждение почты</h1><p>Нажмите кнопку, чтобы подтвердить адрес.</p><button id="go">Подтвердить</button>`,
  `${tokenFromUrl}document.getElementById("go").onclick=async()=>{const r=await post("/api/auth/verify",{token});
msg.className=r.ok?"ok":"err";msg.textContent=r.ok?"Почта подтверждена. Теперь можно войти.":"Ссылка недействительна или устарела. Запросите новое письмо.";if(r.ok)document.getElementById("go").remove();};`);

export const resetPage = () => base("Новый пароль",
  `<h1>Новый пароль</h1><input id="pw" type="password" autocomplete="new-password" placeholder="Новый пароль (от 10 знаков)"><button id="go">Сохранить</button>`,
  `${tokenFromUrl}const T={password_short:"Пароль короче 10 знаков.",password_weak:"Слишком простой пароль.",password_long:"Пароль слишком длинный.",invalid_token:"Ссылка недействительна или устарела."};
document.getElementById("go").onclick=async()=>{const r=await post("/api/auth/reset",{token,password:document.getElementById("pw").value});
msg.className=r.ok?"ok":"err";msg.textContent=r.ok?"Пароль изменён. Теперь можно войти.":(T[r.j.error]||"Не удалось сохранить.");};`);
