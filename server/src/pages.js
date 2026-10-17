// Простые страницы для ссылок из писем. Токен подтверждается кнопкой (POST), а не открытием ссылки:
// так почтовые сканеры, которые «переходят» по ссылкам, не погасят одноразовый токен.
const base = (title, body, script) => `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><meta name="referrer" content="no-referrer"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0a1a;color:#ece8ff;font:16px/1.5 system-ui,sans-serif;padding:16px}
main{max-width:380px;width:100%;background:#15132b;border:1px solid #2c2850;border-radius:16px;padding:24px}h1{font-size:22px;margin:0 0 12px}
input,button{width:100%;box-sizing:border-box;padding:12px;border-radius:10px;border:1px solid #3a3566;background:#0f0d22;color:inherit;font:inherit;margin-top:10px}
button{background:#c9a24d;color:#1a1530;border:0;font-weight:600;cursor:pointer}#msg{margin-top:12px}.err{color:#ff9b9b}.ok{color:#9be3b0}a{color:#c9a24d}</style></head>
<body><main>${body}<p id="msg" role="status"></p></main><script>${script}</script></body></html>`;

const I18N = `const L={ru:{c_t:"Подтверждение почты",c_p:"Нажмите кнопку, чтобы подтвердить адрес.",c_b:"Подтвердить",c_ok:"Почта подтверждена. Теперь можно войти.",c_bad:"Ссылка недействительна или устарела. Запросите новое письмо на странице входа.",r_t:"Новый пароль",r_ph:"Новый пароль (от 10 знаков)",r_b:"Сохранить",r_ok:"Пароль изменён. Теперь можно войти.",password_short:"Пароль короче 10 знаков.",password_weak:"Слишком простой пароль.",password_long:"Пароль слишком длинный.",invalid_token:"Ссылка недействительна или устарела.",r_bad:"Не удалось сохранить.",go:"Перейти ко входу"},
en:{c_t:"Confirm your email",c_p:"Press the button to confirm your address.",c_b:"Confirm",c_ok:"Email confirmed. You can sign in now.",c_bad:"The link is invalid or expired. Request a new email on the sign-in page.",r_t:"New password",r_ph:"New password (10+ characters)",r_b:"Save",r_ok:"Password changed. You can sign in now.",password_short:"Password is shorter than 10 characters.",password_weak:"Password is too simple.",password_long:"Password is too long.",invalid_token:"The link is invalid or expired.",r_bad:"Could not save.",go:"Go to sign in"},
es:{c_t:"Confirmar correo",c_p:"Pulsa el botón para confirmar tu dirección.",c_b:"Confirmar",c_ok:"Correo confirmado. Ya puedes entrar.",c_bad:"El enlace no es válido o caducó. Pide un correo nuevo en la página de acceso.",r_t:"Contraseña nueva",r_ph:"Contraseña nueva (mín. 10 caracteres)",r_b:"Guardar",r_ok:"Contraseña cambiada. Ya puedes entrar.",password_short:"La contraseña tiene menos de 10 caracteres.",password_weak:"La contraseña es demasiado simple.",password_long:"La contraseña es demasiado larga.",invalid_token:"El enlace no es válido o caducó.",r_bad:"No se pudo guardar.",go:"Ir a iniciar sesión"}};
let lg=(localStorage.getItem("tarot_ui_lang")||navigator.language||"en").slice(0,2).toLowerCase();if(!L[lg])lg="en";const X=L[lg];document.documentElement.lang=lg;
const done=ok=>{const a=document.createElement("p");a.innerHTML='<a href="/">'+X.go+'</a>';if(ok)document.querySelector("main").appendChild(a);};`;

const tokenFromUrl = `const token=new URLSearchParams(location.search).get("token")||"";history.replaceState(null,"",location.pathname);
const msg=document.getElementById("msg");const post=(u,b)=>fetch(u,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)}).then(async r=>({ok:r.ok,j:await r.json().catch(()=>({}))}));`;

export const confirmPage = () => base("Kosmalis",
  `<h1 id="t"></h1><p id="p"></p><button id="go"></button>`,
  `${I18N}${tokenFromUrl}document.title="Kosmalis";document.getElementById("t").textContent=X.c_t;document.getElementById("p").textContent=X.c_p;document.getElementById("go").textContent=X.c_b;
document.getElementById("go").onclick=async()=>{const r=await post("/api/auth/verify",{token});
msg.className=r.ok?"ok":"err";msg.textContent=r.ok?X.c_ok:X.c_bad;if(r.ok)document.getElementById("go").remove();done(r.ok);};`);

export const resetPage = () => base("Kosmalis",
  `<h1 id="t"></h1><input id="pw" type="password" autocomplete="new-password"><button id="go"></button>`,
  `${I18N}${tokenFromUrl}document.getElementById("t").textContent=X.r_t;document.getElementById("pw").placeholder=X.r_ph;document.getElementById("go").textContent=X.r_b;
document.getElementById("go").onclick=async()=>{const r=await post("/api/auth/reset",{token,password:document.getElementById("pw").value});
msg.className=r.ok?"ok":"err";msg.textContent=r.ok?X.r_ok:(X[r.j.error]||X.r_bad);if(r.ok){document.getElementById("go").remove();document.getElementById("pw").remove();}done(r.ok);};`);
