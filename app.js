(() => {
"use strict";
/* ===================== Constantes base (logo, puntos de auditoría, parámetros, librerías de exportación) ===================== */
const LOGO = "data:image/png;base64,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";
const PUNTOS = [
  {k:"etiqueta",   e:"🏷️", l:"Prendas con etiqueta",                 inf:"Prendas sin etiqueta"},
  {k:"estanterias",e:"👕", l:"Estanterías sin ropa detrás",          inf:"Ropa detrás de estanterías"},
  {k:"pedidos",    e:"📦", l:"Pedidos retirados a tiempo",           inf:"Pedidos sin retirar"},
  {k:"aviso",      e:"📢", l:"Palermo avisa pedidos pendientes",     inf:"Pedidos no avisados por Palermo"},
  {k:"limpieza",   e:"🧹", l:"Limpieza",                             inf:"Desorden / limpieza"},
  {k:"deposito",   e:"🏭", l:"Depósito ordenado (todo en su lugar)", inf:"Depósito: cosas fuera de lugar"},
  {k:"otros",      e:"⚠️", l:"Otros",                                inf:"Otros"}
];
const ETIQ = {1:"Muy mal",2:"Mal",3:"Regular",4:"Bien",5:"Excelente"};
const EMO  = {1:"❌",2:"🔴",3:"🟡",4:"🟢",5:"⭐"};
const REMO = {Excelente:"✅",Advertencia:"⚠️",Reclamo:"❌"};
const DEF = { promExc:4.5, promAdv:3, maxInf:3, diasMax:7, mExc:"", mAdv:"", mRec:"" };
const LIBS = {
  xlsx:[["https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js","sha384-Pqp51FUN2/qzfxZxBCtF0stpc9ONI6MYZpVqmo8m20SoaQCzf+arZvACkLkirlPz"]],
  pdf:[["https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js","sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk"],["https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js","sha384-fCAW/rDWORTbQXSiB7mOg0QtQ5c+r0f544y6XoKjuVva0nMBlCpNUjiFeG5iMdS3"]]
};
/* ===== Hey Blackk · Palermo — app v3 =====
   Seguridad: no hay claves en el navegador; cada operación se valida en el servidor con la sesión del usuario.
   Los datos nunca se insertan como HTML: todo el DOM se arma con textContent (función el). */
const $ = id => document.getElementById(id);
const BACKEND = String((window.HB_CONFIG||{}).BACKEND_URL||"").trim();
const BACKEND_OK = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(BACKEND);
const S = { token:null, user:null, perms:[], params:{...DEF}, lista:[], fotoCache:{}, form:null, fotos:[], openRow:null, view:null, nav:0, acciones:[], elevTs:0, resumen:undefined, resumenTs:0,
  politica:{inactividadSeg:1800, maximoSeg:36000}, persistente:false, ultimaAct:0, ultimoApi:0 };
/* Sesión (3.2): la de jefes/administración se guarda en el teléfono (sobrevive a cerrar la app) y vence por inactividad,
   igual que en el servidor, que es quien manda: cada llamada se valida allá. La del personal que ficha es efímera (pestaña). */
const SESSION_KEY = "hb3_t", USER_KEY = "hb3_u", ACT_KEY = "hb3_a";
/* Tope de espera: lecturas 40 s; escrituras 150 s (una auditoría con 12 fotos en 3G puede tardar más de un minuto en subir
   y cortarla antes de tiempo haría que la persona la reenvíe por duplicado). */
const TOPE_MS = { lectura: 40000, escritura: 150000 };
/* Lecturas: si la red falla o el servidor no responde, se reintentan una vez solas (no duplican nada). */
const LECTURAS = new Set(["estado","inicio","yo","miJornada","misIngresos","listarPersonal","listarIngresos","fotoIngreso","getRegistro","getFoto","hojaUrl","listarAcciones","getCierre","getKPIs","listarHistorial","verificarHistorial","listarNovedades","getConfig","getParams","getFeriados","misVacaciones","listarVacaciones","verificarUbicacion","resumenHoras","panelFichajesHoy","listarSucursales","misSolicitudes"]);
/* Operaciones que el servidor exige confirmar con el PIN (vale 5 min): se pide antes de llamar para ahorrar un viaje. */
const SENSIBLES = new Set(["altaEmpleado","bajaEmpleado","reactivarEmpleado","resetPin","cambiarRol","cerrarSesionesDe","resolverCorreccion","exportarIngresos","eliminarAuditoria","vaciarRegistro","setConfig","setParams","agregarExcepcion","quitarExcepcion","guardarSucursal","exportarHoras","corregirFichaje","cargarFichajeJefe"]);
const ELEV_VIGENCIA_MS = 4.5*60*1000;
const espera = ms => new Promise(r=>setTimeout(r,ms));

async function api(fn, ...args){
  if (!BACKEND_OK) throw new Error("La app todavía no está conectada al servidor.");
  const lectura = LECTURAS.has(fn), intentos = lectura ? 2 : 1;
  for (let i=1;; i++){
    const ctl = new AbortController(), tm = setTimeout(()=>ctl.abort(), lectura ? TOPE_MS.lectura : TOPE_MS.escritura);
    let r;
    try{ r = await fetch(BACKEND, {method:"POST", headers:{"Content-Type":"text/plain;charset=utf-8"}, body:JSON.stringify({fn,args}), redirect:"follow", credentials:"omit", cache:"no-store", signal:ctl.signal}); }
    catch(e){ clearTimeout(tm); if (i<intentos){ await espera(700*i); continue; }
      throw new Error(ctl.signal.aborted ? "El servidor tardó demasiado en responder. Probá de nuevo." : "Sin conexión. Revisá internet y probá de nuevo."); }
    clearTimeout(tm);
    let j; try{ j = await r.json(); }catch(e){ if (i<intentos){ await espera(700*i); continue; } throw new Error("El servidor no respondió bien. Probá de nuevo en un momento."); }
    if (!j || !j.ok) throw new Error((j && j.error) || "Error del servidor.");
    redOk();
    return j.data;
  }
}
const esAuth = e => /^AUTH$/.test(e && e.message);
const esPerm = e => /^PERM$/.test(e && e.message);
const msgErr = e => esAuth(e) ? "La sesión venció. Volvé a ingresar." : esPerm(e) ? "No tenés permiso para esta acción." :
  (e && e.message ? e.message.replace(/^Exception:\s*/,"") : "Error inesperado.");
/** Llamada con sesión de staff. Las operaciones sensibles piden el PIN antes (si no se confirmó hace poco); si el servidor igual lo exige, se pide y se reintenta una vez. */
async function apiS(fn, ...args){
  if (SENSIBLES.has(fn) && Date.now()-S.elevTs > ELEV_VIGENCIA_MS) await pedirPin();
  try { const r = await api(fn, S.token, ...args); S.ultimoApi=Date.now(); return r; }
  catch(e){
    if (esAuth(e)) { sesionVencida(); throw e; }
    if (e.message === "ELEV") { S.elevTs=0; await pedirPin(); return await api(fn, S.token, ...args); }
    throw e;
  }
}
/* Aviso de conexión: sin internet o sin respuesta del servidor. */
function redAviso(t){ const b=$("netbar"); if (!b) return; b.textContent=t; b.hidden=false; }
function redOk(){ const b=$("netbar"); if (b && !b.hidden && navigator.onLine!==false) b.hidden=true; }
addEventListener("offline", ()=>redAviso("📵 Sin conexión a internet. Lo que hagas no se va a guardar hasta que vuelva."));
addEventListener("online", ()=>{ const b=$("netbar"); if (b) b.hidden=true; });

function el(tag, attrs, ...kids){
  const e = document.createElement(tag);
  if (attrs) for (const [k,v] of Object.entries(attrs)){
    if (v==null || v===false) continue;
    if (k==="class") e.className=v; else if (k==="text") e.textContent=v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v===true?"":v);
  }
  for (const c of kids.flat()) if (c!=null && c!==false) e.append(c.nodeType?c:document.createTextNode(String(c)));
  return e;
}
const toast = t => { const x=$("toast"); x.textContent=t; x.hidden=false; clearTimeout(toast._t); toast._t=setTimeout(()=>x.hidden=true,3600); };
/* Fechas en hora local del teléfono (nunca UTC, para no correrse un día de noche). */
const fechaLocal = d => { const x=new Date(d); x.setMinutes(x.getMinutes()-x.getTimezoneOffset()); return x.toISOString().slice(0,10); };
const hoy = () => fechaLocal(new Date());
const diasAtras = n => { const d=new Date(); d.setDate(d.getDate()-n); return fechaLocal(d); };
const fmtF = s => s ? String(s).slice(0,10).split("-").reverse().join("/") : "";
const fmt1 = n => (n==null||isNaN(n)) ? "–" : Number(n).toFixed(1).replace(".",",");
const pct = n => (n==null||isNaN(n)) ? "–" : Math.round(n*100)+"%";
const money = n => (n==null||isNaN(n)) ? "–" : "$ " + Math.round(n).toLocaleString("es-AR");
const moneyK = n => (n==null||isNaN(n)) ? "–" : Math.abs(n)>=1e6 ? "$ "+(n/1e6).toFixed(2).replace(".",",")+" M" : money(n);
const sign = n => n==null ? "–" : (n>0?"+":"")+String(n).replace(".",",")+"%";
const horas = m => m==null ? "–" : Math.floor(m/60)+" h "+String(m%60).padStart(2,"0")+" min";
const lsGet = k => { try { return JSON.parse(localStorage.getItem(k)); } catch(e){ return null; } };
const lsSet = (k,v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} };
const ssGet = k => { try { return sessionStorage.getItem(k); } catch(e){ return null; } };
const ssSet = (k,v) => { try { v==null?sessionStorage.removeItem(k):sessionStorage.setItem(k,v); } catch(e){} };
const okImg = src => /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(String(src||""));
function resAud(prom, p=S.params){ if (prom==null) return null; return prom>=p.promExc?"Excelente":prom>=p.promAdv?"Advertencia":"Reclamo"; }
function resChk(tot, p=S.params){ return tot===0?"Excelente":tot<=p.maxInf?"Advertencia":"Reclamo"; }
const cls = r => r==="Excelente"?"ok":r==="Advertencia"?"warn":r==="Reclamo"?"bad":"";
const scChip = v => el("span",{class:"sc",style:v?`background:var(--s${v}bg);color:var(--s${v})`:null,text:v??"–"});
const tiene = p => S.perms.includes(p);
function spinBtn(b, txt){ b.disabled=true; b.dataset.t=b.textContent; b.textContent=""; b.append(el("span",{class:"spin"})," "+(txt||"Procesando…")); }
function unspin(b){ b.disabled=false; if (b.dataset.t) b.textContent=b.dataset.t; }

/* ----- Ventanas modales (PIN de confirmación, foto ampliada, confirmaciones) ----- */
function modal(contenido, {cerrable=true}={}){
  const back = el("div",{class:"modal",role:"dialog","aria-modal":"true"});
  const box = el("div",{class:"modal-box"}, contenido);
  const cerrar = () => { back.remove(); document.removeEventListener("keydown", esc); };
  const esc = e => { if (e.key==="Escape" && cerrable) cerrar(); };
  if (cerrable) back.addEventListener("click", e=>{ if (e.target===back) cerrar(); });
  document.addEventListener("keydown", esc);
  back.append(box); document.body.append(back);
  return { cerrar, box };
}
function verFoto(src, titulo){
  const m = modal(el("div",{class:"lightbox"}, el("img",{src,alt:titulo||"Foto"}), el("div",{class:"row"}, el("span",{class:"lead",style:"margin:0",text:titulo||""}), el("span",{class:"spacer"}), el("button",{class:"btn",type:"button",text:"Cerrar",onclick:()=>m.cerrar()}))));
}
function pedirPin(){
  return new Promise((resolve, reject)=>{
    const inp = el("input",{type:"password",inputmode:"numeric",autocomplete:"current-password",maxlength:"6",placeholder:"Tu PIN","aria-label":"Tu PIN"});
    const err = el("div",{class:"notice bad",hidden:true});
    const ok = el("button",{class:"btn primary",type:"submit",text:"Confirmar"});
    const f = el("form",{class:"grid",onsubmit:async e=>{ e.preventDefault(); err.hidden=true; spinBtn(ok,"Verificando…");
        try{ await api("reauth", S.token, inp.value); S.elevTs=Date.now(); m.cerrar(); resolve(true); }
        catch(x){ unspin(ok); err.textContent=msgErr(x); err.hidden=false; if (esAuth(x)) { m.cerrar(); sesionVencida(); reject(x); } } }},
      el("div",{class:"lockicon",text:"🔐"}), el("h2",{text:"Confirmá con tu PIN"}),
      el("p",{class:"lead",text:"Es una operación sensible: por seguridad volvé a ingresar tu PIN. Vale por 5 minutos."}), inp, err,
      el("div",{class:"row"}, ok, el("button",{class:"btn",type:"button",text:"Cancelar",onclick:()=>{ m.cerrar(); reject(new Error("Operación cancelada.")); }})));
    const m = modal(f,{cerrable:false}); setTimeout(()=>inp.focus(),50);
  });
}
function confirmar(texto, boton="Confirmar", peligro=false){
  return new Promise(res=>{
    const m = modal(el("div",{class:"grid"}, el("p",{style:"margin:0;font-size:16px",text:texto}),
      el("div",{class:"row"}, el("button",{class:"btn "+(peligro?"danger":"primary"),type:"button",text:boton,onclick:()=>{m.cerrar();res(true);}}),
        el("button",{class:"btn",type:"button",text:"Cancelar",onclick:()=>{m.cerrar();res(false);}}))));
  });
}

/* ----- Fotos: compresión en el teléfono antes de enviar ----- */
async function aDataURL(file, max=1280){
  let img=null;
  if (window.createImageBitmap) img = await createImageBitmap(file).catch(()=>null);
  if (!img) img = await new Promise(res=>{ const u=URL.createObjectURL(file), i=new Image(); i.onload=()=>res(i); i.onerror=()=>res(null); i.src=u; });
  if (!img || !img.width) throw new Error("formato");
  const k=Math.min(1,max/Math.max(img.width,img.height));
  const c=document.createElement("canvas"); c.width=Math.round(img.width*k); c.height=Math.round(img.height*k);
  c.getContext("2d").drawImage(img,0,0,c.width,c.height);
  return c.toDataURL("image/jpeg",0.8);
}
/* Abre la cámara (o la galería). Resuelve con la foto comprimida, o null si la persona cancela
   (evento "cancel" del navegador; como respaldo, al volver el foco a la página sin archivo elegido). */
function elegirFoto(camaraFrontal){
  return new Promise((res)=>{
    const i = el("input",{type:"file",accept:"image/*",style:"position:fixed;left:-9999px"});
    if (camaraFrontal) i.setAttribute("capture","user"); else i.setAttribute("capture","environment");
    let elegido=false, listo=false;
    const fin = v => { if (listo) return; listo=true; i.remove(); removeEventListener("focus", alVolver); res(v); };
    const alVolver = () => setTimeout(()=>{ if (!elegido) fin(null); }, 4000);
    i.addEventListener("change", async ()=>{ const f=i.files[0]; if(!f) return fin(null); elegido=true;
      try{ fin(await aDataURL(f)); }catch(x){ toast("No se pudo leer la foto. Probá de nuevo."); fin(null); } });
    i.addEventListener("cancel", ()=>fin(null));
    if (!("oncancel" in i)) addEventListener("focus", alVolver);   // respaldo solo para navegadores sin evento "cancel"
    document.body.append(i); i.click();
  });
}
function ubicacion(){
  return new Promise(res=>{
    if (!navigator.geolocation) return res({error:"no_disponible"});
    let listo=false; const fin=v=>{ if(!listo){ listo=true; res(v); } };
    setTimeout(()=>fin({error:"tiempo_agotado"}), 13000);
    // 3.4: una sola lectura en este momento (sin seguimiento y sin reutilizar una ubicación vieja).
    navigator.geolocation.getCurrentPosition(p=>fin({lat:p.coords.latitude,lng:p.coords.longitude,acc:p.coords.accuracy}),
      e=>fin({error: e.code===1?"sin_permiso":e.code===3?"tiempo_agotado":"no_disponible"}), {enableHighAccuracy:true,timeout:12000,maximumAge:0});
  });
}
/* Miniatura de una foto privada: se pide al servidor con la sesión y se muestra; si falla, se informa. */
function miniFoto(fn, id, titulo){
  const slot = el("button",{class:"foto",type:"button","aria-label":"Ver foto: "+(titulo||""),style:"display:grid;place-items:center;padding:0;cursor:zoom-in"}, el("span",{class:"spin"}));
  const poner = src => { slot.textContent=""; slot.append(el("img",{src,alt:titulo||"Evidencia"})); slot.onclick=()=>verFoto(src,titulo); };
  const k = fn+":"+id;
  if (S.fotoCache[k]) poner(S.fotoCache[k]);
  else apiS(fn, id).then(src=>{ if(!okImg(src)) throw 0; S.fotoCache[k]=src; poner(src); })
    .catch(()=>{ slot.textContent=""; slot.classList.add("foto-err"); slot.append(el("span",{text:"⚠️ No se pudo cargar"})); slot.disabled=true; });
  return slot;
}
/* ===================== Navegación ===================== */
function ir(id){ if (location.hash !== "#/"+id) location.hash = "#/"+id; else route(); }
/* Cambio de pantalla con transición suave (View Transitions, si el navegador la tiene y no se pidió reducir el movimiento). */
const sinMovimiento = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
function route(){
  const id = (location.hash.match(/^#\/([a-z]+)/)||[])[1] || "home";
  const cambio = S.view !== id;
  const pintar = () => pintarVista(id);
  if (cambio && document.startViewTransition && !sinMovimiento()){
    // La pantalla se pinta dentro de la transición; si el navegador la cancela antes de pintar (cambio de tamaño, teclado), se pinta igual.
    const n = ++S.nav; let pintado=false;
    const pintarUna = ()=>{ if (!pintado && S.nav===n){ pintado=true; pintar(); } };
    const foco = ()=>{ pintarUna(); const h=$("main").querySelector("h1"); if (h && !h.hasAttribute("tabindex")) h.setAttribute("tabindex","-1"); if (h) h.focus({preventScroll:true}); };
    try{ const t = document.startViewTransition(pintarUna); t.ready.catch(()=>{}); t.updateCallbackDone.catch(()=>{}); t.finished.then(foco, foco); }
    catch(e){ pintarUna(); }
    setTimeout(pintarUna, 400);
  } else { ++S.nav; pintar(); }
}
function pintarVista(id){
  S.view = id; window.scrollTo(0,0);
  $("nav-home").hidden = id==="home";
  $("btn-salir").hidden = id==="home" || !S.user;   // en el panel, "Cerrar sesión" está en la fila de sesión
  if (id==="home") return renderHome();
  document.body.classList.remove("is-home");
  if (id==="acceso") return vAcceso($("main"));
  const m = modDe(id); if (!m) return ir("home");
  const main=$("main"); main.textContent="";
  main.append(el("div",{class:"modhead",style:`--mc:${m.c}`}, el("span",{class:"mod-ico"}, icono(m.id,24)), el("div",{}, el("h1",{text:m.t}), el("p",{class:"lead",text:m.d}))));
  if (id==="empleados") return vEmpleados(main);
  if (id==="otros") return vOtros(main);
  if (!S.user) return loginCard(main, "Ingresá con tu usuario y PIN para abrir este módulo.");
  if (!puedeVer(m)) return main.append(el("div",{class:"card empty",text:"🔒 Tu usuario no tiene permiso para este módulo. Si lo necesitás, pedíselo a un administrador."}));
  const V = {ingresos:vIngresos, auditoria:vAuditoria, kpi:vKPI, historial:vHistorial, cierre:vCierre, rrhh:vRRHH, config:vConfig, vacaciones:vVacaciones}[id];
  V(main);
}
addEventListener("hashchange", route);
/* Regiones desplazables (tablas y gráficos anchos): accesibles con teclado. */
new MutationObserver(()=>{ document.querySelectorAll("#main .tablewrap:not([tabindex]), #main .hscroll:not([tabindex])").forEach(x=>{ x.tabIndex=0; x.setAttribute("role","region"); if (!x.getAttribute("aria-label")) x.setAttribute("aria-label", x.classList.contains("hscroll") ? "Gráfico desplazable" : "Tabla desplazable"); }); }).observe($("main"),{childList:true,subtree:true});

/* ----- Sesión de staff -----
   Jefes/administración: la sesión queda guardada en el teléfono y se cierra sola tras `politica.inactividadSeg` sin actividad
   (el servidor aplica la misma regla y además un máximo absoluto). Personal que entra a un módulo: sesión efímera de la pestaña. */
const rolTxt = u => u.rol==="admin"?"Administración":u.rol==="responsable"?"Jefe/Responsable":"Empleado";
const limInact = () => (S.politica.inactividadSeg||1800)*1000;
function sesGuardar(t, datos){
  if (S.persistente){ lsSet(SESSION_KEY,t); lsSet(USER_KEY,datos); lsSet(ACT_KEY,Date.now()); ssSet(SESSION_KEY,null); ssSet(USER_KEY,null); }
  else { ssSet(SESSION_KEY,t); ssSet(USER_KEY,JSON.stringify(datos)); sesBorrarLocal(); }
}
function sesBorrarLocal(){ [SESSION_KEY,USER_KEY,ACT_KEY].forEach(k=>{ try{ localStorage.removeItem(k); }catch(e){} }); }
function sesLeer(){
  const lt = lsGet(SESSION_KEY);
  if (lt) return { t:lt, datos:lsGet(USER_KEY), act:Number(lsGet(ACT_KEY))||0, persistente:true };
  const st = ssGet(SESSION_KEY);
  return st ? { t:st, datos:lsParse(ssGet(USER_KEY)), act:Date.now(), persistente:false } : null;
}
function setUser(r){
  S.token=r.token; S.user=r.user; S.perms=r.user.permisos||[]; S.params={...DEF,...(r.params||{})};
  if (r.politica) S.politica=r.politica;
  if (r.elev) S.elevTs=Date.now();
  S.persistente = r.user.rol!=="empleado"; S.ultimoApi=Date.now();
  sesGuardar(r.token, {user:r.user, params:S.params, politica:S.politica});
  $("who").textContent = `${r.user.nombre} · ${rolTxt(r.user)}`;
  $("btn-salir").hidden = S.view==="home"; bumpIdle();
}
function limpiarSesion(){
  S.token=null; S.user=null; S.perms=[]; S.lista=[]; S.fotoCache={}; S.acciones=[]; S.elevTs=0; S.resumen=undefined; S.resumenTs=0; S.persistente=false;
  ssSet(SESSION_KEY,null); ssSet(USER_KEY,null); ssSet(RESUMEN_KEY,null); sesBorrarLocal(); $("who").textContent=""; $("btn-salir").hidden=true; clearTimeout(idleT);
}
function salir(msg){
  if (S.token) api("logout",S.token).catch(()=>{});
  limpiarSesion();
  if (msg) toast(msg); ir("home");
}
/* Sesión vencida: se limpia y se vuelve a pedir usuario y PIN en el mismo módulo (sin mandar al inicio). */
function sesionVencida(){ limpiarSesion(); toast("La sesión venció. Volvé a ingresar."); route(); }
let idleT=null;
/* Actividad: reinicia el vencimiento local, lo persiste (como mucho cada 30 s) y, si hace rato que no hay llamadas,
   avisa al servidor que la sesión sigue en uso (así la renovación es la misma de los dos lados). */
function bumpIdle(){
  if (!S.token) return;
  const ahora=Date.now(); S.ultimaAct=ahora;
  if (S.persistente && ahora-(bumpIdle._g||0) > 30000){ bumpIdle._g=ahora; lsSet(ACT_KEY, ahora); }
  clearTimeout(idleT); idleT=setTimeout(()=>salir("🔒 Sesión cerrada por inactividad"), limInact());
  if (S.perms.length && ahora-S.ultimoApi > 10*60*1000){ S.ultimoApi=ahora; apiS("yo").catch(()=>{}); }
}
["pointerdown","keydown"].forEach(ev=>addEventListener(ev,bumpIdle,{passive:true}));
/* Al volver a la app (el teléfono suspende los temporizadores en segundo plano): si pasó el tiempo de inactividad, se cierra. */
document.addEventListener("visibilitychange", ()=>{ if (document.visibilityState!=="visible" || !S.token) return; if (Date.now()-S.ultimaAct > limInact()) salir("🔒 Sesión cerrada por inactividad"); else bumpIdle(); });

/* Acceso de jefes y administración: usuario y PIN una sola vez; después, el panel y la navegación entre módulos no vuelven a pedirlo. */
function vAcceso(main){
  if (S.user && S.perms.length) return ir("home");
  if (S.user) limpiarSesion();   // una sesión de empleado no sirve para el panel
  main.textContent="";
  main.append(el("div",{class:"modhead",style:"--mc:#334155"}, el("span",{class:"mod-ico"}, icono("acceso",24)), el("div",{}, el("h1",{text:"Jefes y Administración"}), el("p",{class:"lead",text:"Panel de gestión y control"}))));
  const min = Math.round(limInact()/60000);
  loginCard(main, `Ingresá con tu usuario y PIN de 6 números. La sesión queda abierta mientras usás la app y se cierra sola tras ${min} minutos sin actividad.`,
    ()=>{ if (!S.perms.length) toast("Tu usuario no tiene módulos de gestión. Para fichar, usá «Fichar entrada o salida»."); ir("home"); });
}

function loginCard(main, texto, alEntrar){
  const u = el("input",{type:"text",autocomplete:"username",autocapitalize:"none",spellcheck:"false",placeholder:"Usuario",maxlength:"20","aria-label":"Usuario"});
  const p = el("input",{type:"password",inputmode:"numeric",autocomplete:"current-password",maxlength:"6",placeholder:"PIN","aria-label":"PIN"});
  const err = el("div",{class:"notice bad",hidden:true});
  const b = el("button",{class:"btn primary",type:"submit",text:"Ingresar"});
  main.append(el("form",{class:"card lockcard",onsubmit:async e=>{ e.preventDefault(); err.hidden=true; spinBtn(b,"Verificando…");
      try{ const r = await api("login", u.value.trim(), p.value); p.value=""; setUser(r); if (alEntrar) alEntrar(); else route(); }
      catch(x){ unspin(b); err.textContent=msgErr(x); err.hidden=false; p.value=""; p.focus(); } }},
    el("div",{class:"lockicon",text:"🔐"}), el("h2",{text:"Ingresá"}), el("p",{class:"lead",text:texto}),
    el("div",{class:"grid"}, u, p, err, b)));
  setTimeout(()=>u.focus(),60);
}

/* ----- Arranque -----
   La pantalla se dibuja al instante (si había sesión guardada, ya con el usuario) y una sola llamada al servidor
   confirma la instalación y la sesión en segundo plano. Si la sesión venció, se avisa y se vuelve a pedir el PIN. */
function fuente(){ const l=document.createElement("link"); l.rel="stylesheet"; l.href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap"; document.head.append(l); }
function iniciar(){
  $("btn-salir").addEventListener("click",()=>salir("Sesión cerrada"));
  $("nav-home").addEventListener("click",()=>ir("home"));
  fuente();
  if (!BACKEND_OK){ $("main").textContent=""; $("main").append(el("div",{class:"card notice bad",text:"Falta conectar el servidor (config.js)."})); return; }
  const ses = sesLeer(), g = ses && ses.datos;
  if (g && g.user){
    if (g.politica) S.politica=g.politica;
    if (ses.persistente && Date.now()-ses.act > limInact()){ api("logout", ses.t).catch(()=>{}); limpiarSesion(); }   // venció por inactividad con la app cerrada
    else { S.token=ses.t; S.user=g.user; S.perms=g.user.permisos||[]; S.params={...DEF,...(g.params||{})}; S.persistente=ses.persistente; S.ultimoApi=Date.now();
      $("who").textContent = `${S.user.nombre} · ${rolTxt(S.user)}`; $("btn-salir").hidden=false; bumpIdle(); }
  }
  route();
  conectar(S.token);
}
const lsParse = s => { try { return JSON.parse(s); } catch(e){ return null; } };
async function conectar(t){
  let est;
  try{ est = await api("inicio", t||null); }
  catch(e){ redAviso("⚠️ Sin conexión con el servidor: "+msgErr(e)+" "); $("netbar").append(el("button",{class:"btn sm",type:"button",text:"Reintentar",onclick:()=>{ $("netbar").hidden=true; conectar(S.token); }})); return; }
  if (!est || typeof est!=="object"){ redAviso("⚠️ El servidor no respondió bien. "); $("netbar").append(el("button",{class:"btn sm",type:"button",text:"Reintentar",onclick:()=>{ $("netbar").hidden=true; conectar(S.token); }})); return; }
  if (est.politica && !S.user) S.politica=est.politica;
  if (!est.usuarios){ limpiarSesion(); return vBootstrap(est); }
  if (t){
    if (est.sesion) setUser({token:t, user:est.sesion.user, params:est.sesion.params, elev:est.sesion.elev, politica:est.sesion.politica});
    else { const habia = !!S.user; limpiarSesion(); if (habia){ toast("La sesión venció. Volvé a ingresar."); return route(); } }
  }
  if (S.view==="home") renderHome();
}
function vBootstrap(est){
  const main=$("main"); main.textContent="";
  const cred = el("input",{type:"password",autocomplete:"off",placeholder: est.legado ? "Clave de jefes actual" : "Código de instalación","aria-label":"Credencial"});
  const n = el("input",{type:"text",placeholder:"Tu nombre y apellido",maxlength:"60"}), u = el("input",{type:"text",placeholder:"Usuario (ej.: maria)",maxlength:"20",autocapitalize:"none"});
  const p = el("input",{type:"password",inputmode:"numeric",maxlength:"6",placeholder:"PIN de 6 números"}), p2 = el("input",{type:"password",inputmode:"numeric",maxlength:"6",placeholder:"Repetí el PIN"});
  const err = el("div",{class:"notice bad",hidden:true}), b = el("button",{class:"btn primary",type:"submit",text:"Crear administrador"});
  main.append(el("form",{class:"card lockcard",onsubmit:async e=>{ e.preventDefault(); err.hidden=true;
      if (p.value!==p2.value){ err.textContent="Los PIN no coinciden."; err.hidden=false; return; }
      spinBtn(b,"Creando…");
      try{ await api("bootstrapAdmin", cred.value, {nombre:n.value, legajo:u.value, pin:p.value}); const r=await api("login",u.value,p.value); setUser(r); toast("✅ Administrador creado. Las claves compartidas anteriores quedaron retiradas."); location.hash="#/empleados/personal"; }
      catch(x){ unspin(b); err.textContent=msgErr(x); err.hidden=false; } }},
    el("div",{class:"lockicon",text:"🛠️"}), el("h2",{text:"Actualización a usuarios individuales"}),
    el("p",{class:"lead",text: est.legado ? "Desde ahora cada persona entra con su usuario y PIN. Confirmá con la clave de jefes actual y creá tu usuario de administración. Las auditorías existentes se conservan." : "Ingresá el código de instalación y creá el primer usuario de administración."}),
    el("div",{class:"grid"}, cred, n, u, p, p2, err, b)));
}
/* ===================== Panel inicial =====================
   Una tira "Hoy" con datos reales del día, la acción principal (fichar) y las tarjetas de los módulos
   que la persona puede usar, cada una con un dato de estado. Los íconos son trazos SVG (sin emojis).
   El resumen del día llega en segundo plano y actualiza las tarjetas en el lugar (sin redibujar el panel). */
const ICONOS = {
  empleados: '<circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 14c2.2.6 3.5 2.6 3.5 6"/>',
  personal: '<circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 14c2.2.6 3.5 2.6 3.5 6"/>',
  ingresos: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  auditoria: '<rect x="5" y="4" width="14" height="17" rx="2.5"/><path d="M9 4V3h6v2"/><path d="m8.5 13 2.5 2.5 4.5-5"/>',
  kpi: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  historial: '<path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z"/><path d="m9.5 12.5 2 2 3.5-4"/>',
  cierre: '<rect x="3" y="6" width="18" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.6"/><path d="M6.5 9.5h.01M17.5 14.5h.01"/>',
  rrhh: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="12" cy="10" r="2.5"/><path d="M8 17c.8-1.8 2.2-2.7 4-2.7s3.2.9 4 2.7"/>',
  otros: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8"/>',
  config: '<path d="M4 7h10M18 7h2M4 12h2M10 12h10M4 17h8M16 17h4"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="14" cy="17" r="2"/>',
  camara: '<path d="M4 8.5h3l1.5-2h7l1.5 2h3v10H4z"/><circle cx="12" cy="13" r="3"/>',
  flecha: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  acceso: '<rect x="3" y="7.5" width="18" height="12.5" rx="2.5"/><path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5"/><path d="M3 12.5h18"/><path d="M10.5 12.5v2.5h3v-2.5"/>',
  salir: '<path d="M10 4H6.5A2.5 2.5 0 0 0 4 6.5v11A2.5 2.5 0 0 0 6.5 20H10"/><path d="M15 8l4 4-4 4M19 12H9"/>',
  vacaciones: '<path d="M3 20h18"/><path d="M12 20V9"/><path d="M4.5 9.5a7.5 7.5 0 0 1 15 0z"/><path d="M12 2.5V4"/><path d="M12 20c0 0-3 .5-4 2"/>',
  feriado: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 9.5h17"/><path d="M8 3v4M16 3v4"/><path d="m10.5 16 1.5-3 1.5 3M10 15.5h4"/>',
  audio: '<path d="M4 10v4h3l4 3.5v-11L7 10z"/><path d="M15 9.5a3.5 3.5 0 0 1 0 5"/><path d="M17.5 7a7 7 0 0 1 0 10"/>'
};
/* Íconos: trazos fijos definidos arriba (no son datos), por eso se cargan con innerHTML sobre un SVG propio. */
function icono(nombre, tam=22){
  const s = document.createElementNS("http://www.w3.org/2000/svg","svg");
  s.setAttribute("viewBox","0 0 24 24"); s.setAttribute("width",tam); s.setAttribute("height",tam); s.setAttribute("aria-hidden","true");
  s.setAttribute("fill","none"); s.setAttribute("stroke","currentColor"); s.setAttribute("stroke-width","1.8"); s.setAttribute("stroke-linecap","round"); s.setAttribute("stroke-linejoin","round");
  s.innerHTML = ICONOS[nombre] || ICONOS.otros;
  return s;
}
const MODULOS = [
  {id:"empleados", t:"Empleados", d:"Fichá tu entrada y salida.", c:"#2563EB", perm:null},
  {id:"ingresos",  t:"Fichaje y horas", d:"Hoy por sucursal, pendientes, horas y correcciones.", c:"#0D9488", perm:"ingresos"},
  {id:"auditoria", t:"Auditoría", d:"Auditar el local, fotos y acciones.", c:"#16A34A", perm:"auditar|auditoria"},
  {id:"kpi",       t:"KPIs comerciales", d:"Ventas, alertas y decisiones.", c:"#7C3AED", perm:"kpi"},
  {id:"historial", t:"Historial", d:"Actividad protegida contra cambios.", c:"#475569", perm:"historial"},
  {id:"cierre",    t:"Cierre diario", d:"Cierres de caja de la planilla.", c:"#EA580C", perm:"cierre"},
  {id:"rrhh",      t:"Novedades RR. HH.", d:"Llegadas tarde y ausencias.", c:"#DB2777", perm:"rrhh"},
  {id:"vacaciones",t:"Vacaciones", d:"Solicitudes del equipo.", c:"#0891B2", perm:"vacaciones"},
  {id:"otros",     t:"Otros", d:"Instalar la app y cambiar tu PIN.", c:"#CA8A04", perm:null},
  {id:"config",    t:"Configuración", d:"Ubicación, objetivos y alertas.", c:"#111113", perm:"config"}
];
const PERSONAL = {id:"personal", t:"Personal", d:"Altas, bajas, PIN y permisos.", c:"#2563EB", perm:"personal", go:()=>{ location.hash="#/empleados/personal"; }};
const modDe = id => MODULOS.find(m=>m.id===id);
const puedeVer = m => !m.perm || m.perm.split("|").some(tiene);

const saludoHora = () => { const h=new Date().getHours(); return h<12 ? "Buen día" : h<19 ? "Buenas tardes" : "Buenas noches"; };
const fechaLarga = () => { const s=new Date().toLocaleDateString("es-AR",{weekday:"long",day:"numeric",month:"long"}); return s.charAt(0).toUpperCase()+s.slice(1); };
const RESUMEN_KEY = "hb3_r";
const plural = (n, uno, varios) => n===1 ? uno : varios.replace("%", n);

/* Chip de estado de cada tarjeta a partir del resumen del día (R). null = sin dato. */
function chipDe(id, R){
  if (!R) return null;
  const al = t => ({t, alerta:true}), ok = t => ({t});
  if (id==="ingresos" && R.fichadas){
    const pf = (R.manualesPendientes||0) + (R.correccionesPendientes||0);
    if (pf) return {t:plural(pf, "1 pendiente", "% pendientes"), alerta:true, rojo:true};
    if ((R.fichadas.sucursalesIncompletas||[]).length) return al("Sucursal incompleta");
    if (!R.fichadas.abre) return ok("Hoy no abre");
    return ok(`Fichadas ${R.fichadas.entradas}/${R.fichadas.esperadas}`);
  }
  if (id==="personal" && R.personal) return ok(plural(R.personal.activos, "1 persona", "% personas"));
  if (id==="auditoria"){
    if (R.acciones && R.acciones.vencidas) return al(plural(R.acciones.vencidas, "1 acción vencida", "% acciones vencidas"));
    if (R.auditoria) return ok(`${fmtF(R.auditoria.fecha).slice(0,5)}: ${R.auditoria.resultado}`);
    if (R.auditoria===null) return ok("Sin auditorías");
  }
  if (id==="kpi" && R.mes){
    if (R.mes.objetivo && R.mes.total) return ok(`${Math.round(R.mes.total/R.mes.objetivo*100)}% del objetivo`);
    if (R.mes.total) return ok("Mes: "+moneyK(R.mes.total));
    if (R.cierre) return ok("Último "+fmtF(R.cierre.fecha).slice(0,5));
  }
  if (id==="cierre" && "diasSinCierre" in R){
    if (R.diasSinCierre) return al(plural(R.diasSinCierre, "1 día sin cierre", "% días sin cierre"));
    return ok(R.cierre ? "Al día ("+fmtF(R.cierre.fecha).slice(0,5)+")" : "Sin cierres");
  }
  if (id==="historial" && R.historialHoy!=null) return ok(plural(R.historialHoy, "1 evento hoy", "% eventos hoy"));
  if (id==="rrhh" && R.rrhh) return R.rrhh.abiertas ? al(plural(R.rrhh.abiertas, "1 abierta", "% abiertas")) : ok("Sin novedades");
  if (id==="vacaciones" && R.vacaciones) return R.vacaciones.pendientes ? {t:plural(R.vacaciones.pendientes, "1 pendiente", "% pendientes"), alerta:true, rojo:true} : ok("Sin pendientes");
  return null;
}
function chipEl(id, R, bloqueada){
  if (bloqueada) return el("span",{class:"chip",text:"Con usuario"});
  const chip = chipDe(id, R);
  if (chip) return el("span",{class:"chip"+(chip.alerta?" alerta":"")+(chip.rojo?" rojo":""),text:chip.t});
  return R===undefined ? el("span",{class:"chip cargando","aria-hidden":"true"}) : null;
}
function tarjetaMod(m, i, R, bloqueada){
  return el("button",{class:"mod"+(bloqueada?" lk":""),type:"button","data-id":m.id,style:`--mc:${m.c};--i:${i}`,onclick:()=>m.go?m.go():ir(m.id)},
    el("span",{class:"ico"}, icono(m.id)),
    el("span",{class:"t",text:m.t}), el("span",{class:"d",text:m.d}),
    chipEl(m.id, R, bloqueada));
}
function anillo(hecho, total){
  const r=30, c=2*Math.PI*r, p = total ? Math.min(1, hecho/total) : 0;
  const s = document.createElementNS("http://www.w3.org/2000/svg","svg");
  s.setAttribute("viewBox","0 0 72 72"); s.setAttribute("class","anillo"); s.setAttribute("role","img"); s.setAttribute("aria-label",`${hecho} de ${total} fichadas`);
  const mk = (t,a)=>{ const e=document.createElementNS("http://www.w3.org/2000/svg",t); for (const k in a) e.setAttribute(k,a[k]); s.append(e); return e; };
  mk("circle",{cx:36,cy:36,r,class:"pista"});
  mk("circle",{cx:36,cy:36,r,class:"avance","stroke-dasharray":c.toFixed(1),"stroke-dashoffset":(c*(1-p)).toFixed(1),transform:"rotate(-90 36 36)"});
  const t = mk("text",{x:36,y:36,"text-anchor":"middle","dominant-baseline":"central",class:"num"}); t.textContent = total ? `${hecho}/${total}` : "–";
  return s;
}
function tiraHoy(R){
  const box = el("section",{class:"hoy","aria-label":"Resumen de hoy",style:"--i:0"});
  if (!R){ box.append(el("div",{class:"datos"}, el("span",{class:"chip cargando"}), el("span",{class:"chip cargando"}))); return box; }
  const datos = el("div",{class:"datos"});
  const fila = (k,v,alerta) => datos.append(el("div",{class:"dato"+(alerta?" alerta":"")}, el("span",{class:"k",text:k}), el("b",{text:v})));
  if (R.fichadas){
    box.append(anillo(R.fichadas.entradas, R.fichadas.esperadas));
    fila("Fichadas de hoy", (R.fichadas.abre ? `${R.fichadas.entradas} entradas, ${R.fichadas.salidas} salidas` : "Hoy no abre") + (R.fichadas.feriado ? ` · 🎉 ${R.fichadas.feriado}` : ""));
    if ((R.fichadas.porSucursal||[]).length > 1) fila("Por sucursal", R.fichadas.porSucursal.map(x=>`${x.nombre} ${x.abre ? x.entradas+"/"+x.esperadas : "no abre"}`).join(" · "));
    (R.fichadas.sucursalesIncompletas||[]).forEach(x=>fila("⚠️ Sucursal "+x.nombre, "Falta "+x.faltan.join(", ")+": no se puede fichar", true));
    if (R.fichadas.deVacaciones) fila("De vacaciones hoy", plural(R.fichadas.deVacaciones, "1 persona (no cuenta como falta)", "% personas (no cuentan como falta)"));
  }
  if (R.cierre) fila("Último cierre", `${fmtF(R.cierre.fecha).slice(0,5)}: ${moneyK(R.cierre.total)}`);
  if (R.mes && R.mes.total) fila("Mes en curso", moneyK(R.mes.total) + (R.mes.objetivo ? ` de ${moneyK(R.mes.objetivo)}` : ""));
  if (R.manualesPendientes) fila("Fichajes manuales", plural(R.manualesPendientes, "1 por aprobar", "% por aprobar"), true);
  if (R.correccionesPendientes) fila("Correcciones de fichada", plural(R.correccionesPendientes, "1 por aprobar", "% por aprobar"), true);
  if (R.acciones && R.acciones.vencidas) fila("Acciones correctivas", plural(R.acciones.vencidas, "1 vencida", "% vencidas"), true);
  if (R.vacaciones && R.vacaciones.pendientes) fila("Vacaciones por resolver", plural(R.vacaciones.pendientes, "1 solicitud", "% solicitudes") + (R.vacaciones.demoradas ? ` · ${R.vacaciones.demoradas} con más de 3 días` : ""), true);
  if (!datos.children.length) fila("Hoy", "Sin novedades por ahora");
  box.append(datos);
  return box;
}
function renderHome(){
  const main=$("main"); main.textContent="";
  document.body.classList.add("is-home");
  const staff = !!S.user, nombre = staff ? S.user.nombre.split(" ")[0] : null;
  const R = staff ? S.resumen : null;   // undefined = cargando, null = sin resumen
  const home = el("div",{class:"home"});
  home.append(el("header",{class:"saludo"}, el("h1",{tabindex:"-1",text: nombre ? `${saludoHora()}, ${nombre}` : saludoHora()}), el("p",{class:"fecha",text:fechaLarga()})));
  if (staff) home.append(filaSesion());
  if (staff && S.perms.length) home.append(tiraHoy(R));
  /* 3.3: banner de feriados (próximos 30 días en días de apertura + pendientes de confirmar) arriba del tablero, solo para quien ve cierre/KPIs. */
  if (staff && (tiene("cierre") || tiene("kpi"))) home.append(el("div",{class:"banner-slot"}, bannerFeriados(R && R.feriados, {confirmar: tiene("cierre")})));
  home.append(el("button",{class:"cta",type:"button",style:"--i:1",onclick:()=>{ location.hash="#/empleados/fichar"; }},
    el("span",{class:"ic"}, icono("camara",26)),
    el("span",{class:"tx"}, el("b",{text:"Fichar entrada o salida"}), el("span",{text:"Con tu usuario y PIN. Ubicación activada, sacate la foto y listo."})),
    el("span",{class:"fl"}, icono("flecha",20))));
  home.append(el("button",{class:"cta sec",type:"button",style:"--i:2",onclick:()=>{ location.hash="#/empleados/vacaciones"; }},
    el("span",{class:"ic"}, icono("vacaciones",26)),
    el("span",{class:"tx"}, el("b",{text:"Mis vacaciones"}), el("span",{text:"Pedí tus vacaciones y mirá el estado de tus solicitudes."})),
    el("span",{class:"fl"}, icono("flecha",20))));
  const resto = MODULOS.filter(m=>m.id!=="empleados");
  const visibles = resto.filter(m=>!m.perm || (staff && puedeVer(m)));
  if (staff && tiene("personal")) visibles.splice(0, 0, PERSONAL);
  const grid = el("div",{class:"mods"});
  visibles.forEach((m,i)=>grid.append(tarjetaMod(m, i+2, R, false)));
  home.append(grid);
  /* Acceso de jefes y administración (3.2): tarjeta secundaria de ancho completo; pide usuario y PIN una sola vez y abre el panel. */
  if (!staff) home.append(el("button",{class:"acceso",type:"button",style:`--i:${visibles.length+2}`,onclick:()=>ir("acceso")},
    el("span",{class:"ic"}, icono("acceso",24)),
    el("span",{class:"tx"}, el("b",{text:"Jefes y Administración"}), el("span",{text:"Panel de gestión y control"})),
    el("span",{class:"fl"}, icono("flecha",20))));
  main.append(home);
  if (staff && S.perms.length) cargarResumen();
}
/* Fila de sesión del panel: quién está adentro, qué rol tiene, cuándo se cierra sola y el botón para cerrarla. */
function filaSesion(){
  const u = S.user, min = Math.round(limInact()/60000), gestion = S.perms.length>0;
  return el("div",{class:"sesion",style:"--i:0"},
    el("span",{class:"ic"}, icono("acceso",18)),
    el("span",{class:"tx"}, el("b",{text: gestion ? "Panel de gestión y control" : "Sesión personal"}),
      el("span",{text:`${u.nombre} · ${rolTxt(u)} · se cierra sola tras ${min} min sin uso`})),
    el("span",{class:"badge-slot"}, badgePendientes(S.resumen)),
    el("button",{class:"btn sm",type:"button",onclick:()=>salir("Sesión cerrada")}, icono("salir",16), " Cerrar sesión"));
}
/* 3.4 · Contador rojo de pendientes (fichajes manuales, correcciones y vacaciones) en la fila de sesión del panel. */
function badgePendientes(R){
  const n = R && R.pendientesTotal; if (!n) return null;
  const destino = (R.manualesPendientes||R.correccionesPendientes) && tiene("ingresos") ? "#/ingresos/pendientes" : "#/vacaciones";
  return el("a",{class:"badge-rojo",href:destino,"aria-label":plural(n, "1 pendiente por resolver", "% pendientes por resolver")}, String(n), el("span",{text:n===1?" pendiente":" pendientes"}));
}
/* 3.3 · Banner de feriados: próximos (30 días, solo días de apertura) y pendientes de confirmar, resolubles con un toque.
   F = R.feriados del resumen (o K.feriados de los KPIs). confirmar: si la persona puede confirmar (permiso "cierre"). */
function bannerFeriados(F, {confirmar=false, alConfirmar=null}={}){
  const box = el("section",{class:"banner feriados","aria-label":"Feriados"});
  if (F===undefined){ box.append(el("span",{class:"chip cargando"})); return box; }   // todavía cargando
  if (F===null){ box.hidden=true; return box; }                                     // sin resumen (sin conexión)
  const prox = F.proximos||[], pend = F.pendientes||[];
  const sync = F.sync;
  if (!prox.length && !pend.length && (!sync || sync.ok!==false)){ box.hidden=true; return box; }
  const cab = el("div",{class:"bh"}, el("span",{class:"ic"}, icono("feriado",20)), el("b",{text:"Feriados"}));
  box.append(cab);
  if (sync && sync.ok===false) box.append(el("p",{class:"hint",text:"⚠️ No pude actualizar los feriados, usando la última lista guardada" + (sync.ultimaOk ? " (del "+new Date(sync.ultimaOk).toLocaleDateString("es-AR")+")" : "") + "."}));
  if (prox.length) box.append(el("div",{class:"bl"}, el("span",{class:"k",text:"Próximos 30 días (mié–sáb)"}), el("ul",{}, prox.map(f=>el("li",{}, el("b",{class:"mono",text:fmtF(f.fecha).slice(0,5)}), ` ${f.dia} · ${f.nombre}`, f.finDeSemanaLargo?el("span",{class:"pill",text:"finde largo"}):null, f.palermo?el("span",{class:"pill "+(f.palermo==="cerrado"?"bad":"ok"),text:f.palermo==="cerrado"?"cerrado":"abre"}):null)))));
  if (pend.length){
    const ul = el("ul",{class:"pendf"});
    pend.forEach(f=>{
      const li = el("li",{}, el("span",{}, el("b",{class:"mono",text:fmtF(f.fecha).slice(0,5)}), ` ${f.dia} · ${f.nombre}`, el("span",{class:"pill warn",text:"Feriado: confirmar si abrió"})));
      if (confirmar){
        const acc = el("span",{class:"row"});
        const bt = (txt, est, cls) => el("button",{class:"btn sm "+(cls||""),type:"button",text:txt,onclick:async e=>{ const b=e.currentTarget; spinBtn(b); try{ const r = await apiS("confirmarFeriado", f.fecha, est); toast(est==="cerrado"?"Marcado: estuvo cerrado (excluido de promedios y proyección)":"Marcado: abrió (queda como cierre pendiente de carga)"); if (alConfirmar) alConfirmar(r); else { if (S.resumen && S.resumen.feriados) S.resumen.feriados = {...S.resumen.feriados, pendientes:r.pendientes, proximos:r.proximos}; box.replaceWith(bannerFeriados(S.resumen && S.resumen.feriados, {confirmar, alConfirmar})); } }catch(x){ unspin(b); toast(msgErr(x)); } }});
        acc.append(bt("Estuvo cerrado","cerrado"), bt("Abrió","abierto","primary"));
        li.append(acc);
      }
      ul.append(li);
    });
    box.append(el("div",{class:"bl"}, el("span",{class:"k",text:plural(pend.length, "1 feriado pendiente de confirmar", "% feriados pendientes de confirmar")}), ul,
      el("p",{class:"hint",text:"Nunca se asume que el local cerró. «Estuvo cerrado»: el día no cuenta en promedios ni proyección. «Abrió»: queda como cierre pendiente de carga en la planilla."})));
  }
  return box;
}
/* Actualiza en el lugar la tira "Hoy" y los chips con el resumen recibido, sin redibujar el panel. */
function aplicarResumen(R){
  if (S.view!=="home") return;
  const hoy = document.querySelector(".home .hoy"); if (hoy) hoy.replaceWith(tiraHoy(R));
  const bs = document.querySelector(".home .badge-slot"); if (bs){ bs.textContent=""; const b=badgePendientes(R); if (b) bs.append(b); }
  const slot = document.querySelector(".home .banner-slot"); if (slot){ slot.textContent=""; slot.append(bannerFeriados(R && R.feriados, {confirmar: tiene("cierre")})); }
  if (R && R.vacaciones && R.vacaciones.pendientes && !aplicarResumen._avisado){ aplicarResumen._avisado=true; if (tiene("vacaciones")) toast(`📬 ${plural(R.vacaciones.pendientes, "1 solicitud de vacaciones pendiente", "% solicitudes de vacaciones pendientes")}`); }
  document.querySelectorAll(".home .mod:not(.lk)").forEach(b=>{ const viejo=b.querySelector(".chip"); const nuevo=chipEl(b.dataset.id, R, false); if (viejo) nuevo ? viejo.replaceWith(nuevo) : viejo.remove(); else if (nuevo) b.append(nuevo); });
}
/* Resumen del día: se muestra el último conocido al instante y se actualiza en segundo plano (como mucho cada minuto). */
async function cargarResumen(){
  if (S.resumen===undefined){ const c = lsParse(ssGet(RESUMEN_KEY)); if (c && c.uid===S.user.id){ S.resumen=c.r; aplicarResumen(c.r); } }
  if (S.resumenTs && Date.now()-S.resumenTs < 60000) return;
  S.resumenTs = Date.now();
  try{ const r = await apiS("resumenHoy"); S.resumen = r; ssSet(RESUMEN_KEY, JSON.stringify({uid:S.user.id, r})); aplicarResumen(r); }
  catch(e){ if (S.resumen===undefined){ S.resumen=null; aplicarResumen(null); } }
}
/* ===================== Empleados: fichada y administración de personal ===================== */
function tabs(main, items, activo, onSel){
  const bar = el("div",{class:"subtabs",role:"tablist"});
  const body = el("div",{class:"subbody"});
  const sel = id => { [...bar.children].forEach(b=>b.setAttribute("aria-selected", b.dataset.id===id?"true":"false")); body.textContent="";
    try{ history.replaceState(null,"","#/"+S.view+"/"+id); }catch(e){} onSel(id, body); };
  items.forEach(([id,t])=>bar.append(el("button",{class:"subtab",type:"button",role:"tab","data-id":id,text:t,onclick:()=>sel(id)})));
  const sub = (location.hash.split("/")[2]||"");
  main.append(bar, body); sel(items.some(x=>x[0]===sub) ? sub : (activo || items[0][0]));
}
function vEmpleados(main){
  const items = [["fichar","📸 Fichar entrada / salida"], ["vacaciones","🏖️ Vacaciones"]];
  if (S.user && tiene("personal")) items.push(["personal","🗂️ Personal (altas y bajas)"]);
  else items.push(["personal","🗂️ Personal (jefes)"]);
  tabs(main, items, "fichar", (id, body)=> id==="fichar" ? vFichar(body) : id==="vacaciones" ? vVacacionesEmp(body) : (S.user && tiene("personal") ? vPersonal(body) :
    S.user ? body.append(el("div",{class:"card empty",text:"🔒 Solo jefes y administración pueden gestionar el personal."})) : loginCard(body,"Solo jefes: ingresá con tu usuario y PIN de 6 números.",()=>route())));
}

/* ----- Fichada (sesión propia del empleado; no toca la sesión de un jefe abierta en el mismo equipo) ----- */
const F = { token:null, t:null };
function finFichada(){ if (F.token) api("logout",F.token).catch(()=>{}); F.token=null; clearTimeout(F.t); }
function vFichar(body){
  finFichada();
  const u = el("input",{type:"text",autocomplete:"username",autocapitalize:"none",spellcheck:"false",placeholder:"Tu usuario",maxlength:"20","aria-label":"Usuario"});
  const p = el("input",{type:"password",inputmode:"numeric",autocomplete:"current-password",maxlength:"6",placeholder:"Tu PIN (4 números)","aria-label":"PIN"});
  const err = el("div",{class:"notice bad",hidden:true}), b = el("button",{class:"btn primary big-btn",type:"submit",text:"Continuar"});
  body.append(el("form",{class:"card lockcard",onsubmit:async e=>{ e.preventDefault(); err.hidden=true; spinBtn(b,"Verificando…");
      try{ const r = await api("login", u.value.trim(), p.value, {jornada:true}); p.value=""; F.token=r.token; F.nombre=r.user.nombre; body.textContent=""; jornada(body, r.jornada); }
      catch(x){ unspin(b); err.textContent=msgErr(x); err.hidden=false; p.value=""; } }},
    el("div",{class:"lockicon",text:"👋"}), el("h2",{text:"Identificate para fichar"}),
    el("p",{class:"lead",text:"Usá el usuario y el PIN que te dio tu jefe. Nadie más puede ver tus registros."}), el("div",{class:"grid"}, u, p, err, b)));
  setTimeout(()=>u.focus(),60);
}
/* ----- Personal (jefes) ----- */
/* L: lista ya cargada (después de un alta, baja, etc. se actualiza en el teléfono con lo que devolvió el servidor, sin volver a pedirla). */
let SUCS = [];
async function vPersonal(body, L){
  if (!L){
    body.append(el("div",{class:"card empty"}, el("span",{class:"spin"})," Cargando personal…"));
    try{ [L, SUCS] = await Promise.all([apiS("listarPersonal"), apiS("listarSucursales").catch(()=>[])]); }catch(e){ body.textContent=""; return body.append(el("div",{class:"card notice bad",text:msgErr(e)})); }
  }
  body.textContent="";
  const esAdmin = S.user.rol==="admin";
  // Alta
  const n = el("input",{type:"text",maxlength:"60",placeholder:"Nombre y apellido",required:true});
  const u = el("input",{type:"text",maxlength:"20",placeholder:"Usuario para entrar (ej.: lucia)",autocapitalize:"none",required:true});
  const s = el("input",{type:"text",maxlength:"40",placeholder:"Sector o puesto (ej.: Showroom)"});
  const fi = el("input",{type:"date",value:hoy()});
  const su = el("select",{"aria-label":"Sucursal"}, ...(SUCS.length ? SUCS : [{nombre:"Palermo"}]).filter(x=>x.activa!==false).map(x=>el("option",{value:x.nombre,text:x.nombre})));
  const rol = el("select",{}, el("option",{value:"empleado",text:"Empleado (solo ficha)"}), esAdmin?el("option",{value:"responsable",text:"Jefe / Responsable"}):null, esAdmin?el("option",{value:"admin",text:"Administración"}):null);
  const pin = el("input",{type:"password",inputmode:"numeric",maxlength:"4",placeholder:"PIN de 4 números",autocomplete:"new-password"});
  const ayudaPin = el("span",{class:"hint",text:"Empleados: 4 números. Evitá 1234, 0000 o fechas obvias."});
  rol.onchange = ()=>{ const L6 = rol.value!=="empleado"; pin.maxLength = L6?6:4; pin.placeholder = L6?"PIN de 6 números":"PIN de 4 números"; ayudaPin.textContent = L6?"Jefes y administración: 6 números.":"Empleados: 4 números. Evitá 1234, 0000 o fechas obvias."; };
  const b = el("button",{class:"btn primary",type:"submit",text:"➕ Dar de alta"});
  body.append(el("form",{class:"card",onsubmit:async e=>{ e.preventDefault(); spinBtn(b,"Guardando…");
      try{ const r = await apiS("altaEmpleado", {nombre:n.value, legajo:u.value, sector:s.value, fechaIngreso:fi.value, rol:rol.value, pin:pin.value, sucursal:su.value});
        pin.value=""; toast(`✅ ${r.user.nombre} dado/a de alta. Usuario: ${r.user.legajo.toLowerCase()}`);
        if (r.pinInicial) modal(el("div",{class:"grid"}, el("h2",{text:"PIN generado"}), el("p",{class:"lead",text:"Comunicáselo en persona. No se vuelve a mostrar."}), el("div",{class:"big mono",text:r.pinInicial})));
        L.push(r.user); body.textContent=""; vPersonal(body, L); }
      catch(x){ unspin(b); toast(msgErr(x)); } }},
    el("h2",{text:"Alta de personal"}), el("p",{class:"lead",text:"Asigná el nombre, el usuario y el PIN con el que va a fichar. Solo se piden los datos necesarios."}),
    el("div",{class:"grid2"}, el("label",{class:"f"},"Nombre y apellido",n), el("label",{class:"f"},"Usuario",u), el("label",{class:"f"},"Sector o puesto",s),
      el("label",{class:"f"},"Fecha de ingreso",fi), el("label",{class:"f"},"Sucursal",su), el("label",{class:"f"},"Tipo de acceso",rol), el("label",{class:"f"},"PIN",pin,ayudaPin)), b));
  // Listado
  const q = el("input",{type:"search",placeholder:"Buscar por nombre o usuario"}), fe = el("select",{}, el("option",{value:"activo",text:"Activos"}), el("option",{value:"inactivo",text:"Dados de baja"}), el("option",{value:"",text:"Todos"}));
  const lista = el("div",{class:"plist"});
  const pintar = ()=>{ lista.textContent=""; const t=q.value.trim().toLowerCase();
    L.filter(x=>(!fe.value||x.estado===fe.value)&&(!t||(x.nombre+" "+x.legajo).toLowerCase().includes(t))).sort((a,b)=>a.nombre.localeCompare(b.nombre)).forEach(x=>lista.append(fichaPersona(x, body, L)));
    if (!lista.children.length) lista.append(el("div",{class:"empty",text:"Sin resultados."})); };
  q.oninput=pintar; fe.onchange=pintar;
  body.append(el("div",{class:"card"}, el("h2",{text:"Personal"}), el("div",{class:"row"}, q, fe, el("button",{class:"btn sm",type:"button",text:"↻",title:"Actualizar la lista","aria-label":"Actualizar la lista",onclick:()=>{ body.textContent=""; vPersonal(body); }})), lista)); pintar();
}
function fichaPersona(x, body, L){
  const esAdmin = S.user.rol==="admin", yo = x.id===S.user.id, rolTxt = {empleado:"Empleado",responsable:"Jefe / Responsable",admin:"Administración"}[x.rol];
  const acc = el("div",{class:"row"});
  /* Se vuelve a dibujar con la persona ya actualizada (lo que devolvió el servidor), sin otra llamada. */
  const recargar = (nuevo)=>{ if (nuevo){ const i=L.findIndex(p=>p.id===x.id); if (i>=0) L[i]=Object.assign({}, L[i], nuevo); } body.textContent=""; vPersonal(body, L); };
  const puede = x.rol==="empleado" || esAdmin;
  if (x.estado==="activo" && puede){
    acc.append(el("button",{class:"btn sm",type:"button",text:"🔑 PIN nuevo",onclick:async()=>{
      const largo = x.largoPin||4, inp = el("input",{type:"password",inputmode:"numeric",maxlength:String(largo),placeholder:`PIN de ${largo} números (vacío = generar)`});
      const ok = el("button",{class:"btn primary",type:"button",text:"Asignar"});
      const m = modal(el("div",{class:"grid"}, el("h2",{text:"PIN nuevo para "+x.nombre}), el("p",{class:"lead",text:"Se cierran sus sesiones abiertas y se desbloquea si estaba bloqueado."}), inp, el("div",{class:"row"}, ok, el("button",{class:"btn",type:"button",text:"Cancelar",onclick:()=>m.cerrar()}))));
      ok.onclick = async ()=>{ spinBtn(ok,"Guardando…"); try{ const r = await apiS("resetPin", x.id, inp.value||null); m.cerrar();
          if (r.pinInicial) modal(el("div",{class:"grid"}, el("h2",{text:"PIN generado"}), el("p",{class:"lead",text:"Comunicáselo en persona."}), el("div",{class:"big mono",text:r.pinInicial})));
          else toast("✅ PIN actualizado"); recargar({bloqueado:false}); }catch(e){ unspin(ok); toast(msgErr(e)); } };
    }}));
    acc.append(el("button",{class:"btn sm",type:"button",text:"🏬 Sucursal y horas",onclick:()=>editarSucHoras(x, recargar)}));
    acc.append(el("button",{class:"btn sm",type:"button",text:x.registraIngreso?"⏸ No ficha":"▶ Ficha",title:"Habilitar o no la fichada",onclick:async e=>{ const bt=e.currentTarget; spinBtn(bt); try{ recargar(await apiS("editarEmpleado",x.id,{registraIngreso:!x.registraIngreso})); }catch(err){ unspin(bt); toast(msgErr(err)); } }}));
    if (!yo) acc.append(el("button",{class:"btn sm danger",type:"button",text:"⛔ Dar de baja",onclick:async()=>{
      const f = el("input",{type:"date",value:hoy()}), mo = el("input",{type:"text",maxlength:"200",placeholder:"Motivo (opcional)"}), ok = el("button",{class:"btn danger",type:"button",text:"Confirmar baja"});
      const m = modal(el("div",{class:"grid"}, el("h2",{text:"Baja de "+x.nombre}), el("p",{class:"lead",text:"Se desactiva el acceso, se cierran sus sesiones y no puede volver a fichar. Su historial y sus fotos se conservan según la política de retención."}),
        el("label",{class:"f"},"Fecha efectiva",f), el("label",{class:"f"},"Motivo",mo), el("div",{class:"row"}, ok, el("button",{class:"btn",type:"button",text:"Cancelar",onclick:()=>m.cerrar()}))));
      ok.onclick = async ()=>{ spinBtn(ok,"Procesando…"); try{ const r = await apiS("bajaEmpleado", x.id, f.value, mo.value); m.cerrar(); toast("Baja registrada"); recargar(r); }catch(e){ unspin(ok); toast(msgErr(e)); } };
    }}));
  }
  if (x.estado!=="activo" && puede) acc.append(el("button",{class:"btn sm",type:"button",text:"♻️ Reactivar",onclick:async()=>{
    const largo = x.largoPin||4, inp = el("input",{type:"password",inputmode:"numeric",maxlength:String(largo),placeholder:`PIN nuevo de ${largo} números (vacío = generar)`}), ok = el("button",{class:"btn primary",type:"button",text:"Reactivar"});
    const m = modal(el("div",{class:"grid"}, el("h2",{text:"Reactivar a "+x.nombre}), el("p",{class:"lead",text:"Se reutiliza su usuario (sin duplicar) y queda registrado quién lo reactivó."}), inp, el("div",{class:"row"}, ok, el("button",{class:"btn",type:"button",text:"Cancelar",onclick:()=>m.cerrar()}))));
    ok.onclick = async ()=>{ spinBtn(ok,"Procesando…"); try{ const r = await apiS("reactivarEmpleado", x.id, inp.value||null); m.cerrar();
        if (r.pinInicial) modal(el("div",{class:"grid"}, el("h2",{text:"PIN generado"}), el("div",{class:"big mono",text:r.pinInicial}))); else toast("✅ Reactivado"); recargar(r.user); }catch(e){ unspin(ok); toast(msgErr(e)); } };
  }}));
  if (esAdmin && !yo && x.estado==="activo") acc.append(el("button",{class:"btn sm",type:"button",text:"🛡️ Rol y permisos",onclick:()=>editarPermisos(x, recargar)}));
  return el("div",{class:"persona"+(x.estado!=="activo"?" off":"")},
    el("div",{class:"pinfo"}, el("b",{text:x.nombre}), el("span",{class:"mono",text:"usuario: "+x.legajo.toLowerCase()}),
      el("span",{text:[rolTxt, "🏬 "+(x.sucursal||"Palermo"), x.sector, x.fechaIngreso?"desde "+fmtF(x.fechaIngreso):"", x.horasEsperadas?`${x.horasEsperadas.horas} h por ${x.horasEsperadas.tipo==="semana"?"semana":"día"}`:""].filter(Boolean).join(" · ")}),
      x.estado!=="activo" ? el("span",{class:"pill bad",text:`Baja ${fmtF(x.fechaBaja)}${x.bajaPor?" · por "+x.bajaPor:""}${x.motivoBaja?" · "+x.motivoBaja:""}`}) :
        el("span",{class:"row",style:"gap:6px"}, el("span",{class:"pill ok",text:"Activo"}), x.registraIngreso?el("span",{class:"pill",text:"Ficha"}):null, x.bloqueado?el("span",{class:"pill bad",text:"Bloqueado: asignar PIN"}):null)),
    acc);
}
/* 3.4: sucursal de la persona y horas esperadas (informativas, para comparar con lo trabajado). */
function editarSucHoras(x, recargar){
  const su = el("select",{"aria-label":"Sucursal"}, ...(SUCS.length ? SUCS : [{nombre:x.sucursal||"Palermo"}]).map(s=>el("option",{value:s.nombre,text:s.nombre+(s.incompleta&&s.incompleta.length?" (incompleta)":""),selected:s.nombre===(x.sucursal||"Palermo")})));
  const he = x.horasEsperadas||{}, tp = el("select",{"aria-label":"Tipo de horas esperadas"}, el("option",{value:"dia",text:"Por día de apertura",selected:he.tipo!=="semana"}), el("option",{value:"semana",text:"Por semana",selected:he.tipo==="semana"}));
  const hs = el("input",{type:"number",min:"0",max:"80",step:"0.5",value:he.horas||"",placeholder:"Vacío = sin dato","aria-label":"Horas esperadas"});
  const ok = el("button",{class:"btn primary",type:"button",text:"Guardar"});
  const m = modal(el("div",{class:"grid"}, el("h2",{text:"Sucursal y horas · "+x.nombre}), el("label",{class:"f"},"Sucursal",su),
    el("div",{class:"grid2"}, el("label",{class:"f"},"Horas esperadas",tp), el("label",{class:"f"},"Cantidad de horas",hs)),
    el("p",{class:"hint",text:"Las horas esperadas son informativas: se muestra la diferencia con lo trabajado, sin calcular pagos ni horas extra."}),
    el("div",{class:"row"}, ok, el("button",{class:"btn",type:"button",text:"Cancelar",onclick:()=>m.cerrar()}))));
  ok.onclick = async ()=>{ spinBtn(ok,"Guardando…"); try{ recargar(await apiS("editarEmpleado", x.id, {sucursal:su.value, horasEsperadas: Number(hs.value)>0 ? {tipo:tp.value, horas:Number(hs.value)} : null})); m.cerrar(); toast("✅ Guardado"); }catch(e){ unspin(ok); toast(msgErr(e)); } };
}
function editarPermisos(x, recargar){
  const NOM = {ingresos:"Fichaje y horas (jefes)",auditar:"Auditar",auditoria:"Registro de auditorías",acciones:"Acciones correctivas",kpi:"KPIs",historial:"Historial",cierre:"Cierre diario",rrhh:"Novedades RR. HH.",vacaciones:"Vacaciones (resolver solicitudes)",otros:"Otros",personal:"Personal (altas y bajas)",config:"Configuración"};
  const rol = el("select",{}, ...["empleado","responsable","admin"].map(r=>el("option",{value:r,text:{empleado:"Empleado",responsable:"Jefe / Responsable",admin:"Administración"}[r],selected:x.rol===r})));
  const checks = Object.keys(NOM).map(k=>{ const c=el("input",{type:"checkbox",value:k,checked:x.permisos.includes(k)}); return el("label",{class:"chk"},c," "+NOM[k]); });
  const pers = el("input",{type:"checkbox",checked:x.permisosPersonalizados});
  const ok = el("button",{class:"btn primary",type:"button",text:"Guardar"});
  const m = modal(el("div",{class:"grid"}, el("h2",{text:"Rol y permisos · "+x.nombre}), el("label",{class:"f"},"Rol",rol),
    el("label",{class:"chk"},pers," Usar permisos personalizados (si no, los del rol)"), el("div",{class:"chkgrid"},checks),
    el("p",{class:"hint",text:"Principio de mínimo privilegio: habilitá solo lo necesario. Si cambia entre empleado y jefe, se genera un PIN nuevo con el largo correspondiente."}),
    el("div",{class:"row"}, ok, el("button",{class:"btn",type:"button",text:"Cancelar",onclick:()=>m.cerrar()}))));
  ok.onclick = async ()=>{ spinBtn(ok,"Guardando…");
    const permisos = pers.checked ? checks.map(l=>l.querySelector("input")).filter(c=>c.checked).map(c=>c.value) : null;
    try{ const r = await apiS("cambiarRol", x.id, rol.value, permisos); m.cerrar(); if (r.pinInicial) modal(el("div",{class:"grid"}, el("h2",{text:"PIN nuevo por cambio de nivel"}), el("div",{class:"big mono",text:r.pinInicial}))); else toast("✅ Permisos actualizados"); delete r.pinInicial; recargar(r); }
    catch(e){ unspin(ok); toast(msgErr(e)); } };
}
/* ===================== 3.4 · Fichaje del empleado: entrada y salida (varios pares por día), validación de ubicación en el servidor,
   fichaje manual cuando la ubicación no valida, entrada abierta de otro día, "Mis registros" y "Mis horas". =====================
   La ubicación se pide UNA vez, en el momento de tocar el botón; no hay seguimiento. La distancia y la hora las calcula el servidor. */
const estadoDiaTxt = {trabajado:"Trabajado", incompleto:"Incompleto", en_curso:"En curso", vacaciones:"Vacaciones", feriado:"Feriado", sin_fichaje:"Sin fichaje"};
const estadoDiaCls = {trabajado:"ok", incompleto:"warn", en_curso:"", vacaciones:"ok", feriado:"fer-l", sin_fichaje:"bad"};
const hm = m => m==null ? "–" : Math.floor(Math.abs(m)/60)+":"+String(Math.abs(m)%60).padStart(2,"0");
const difTxt = m => m==null ? "–" : (m<0?"−":"+")+hm(m);
const paresTxt = P => (P||[]).map(p=>(p.entrada||"¿?")+"–"+(p.salida||(p.enCurso?"…":"¿?"))).join(" · ");
/** Reinicia el cierre automático de la sesión de fichada (3 min sin uso). */
function vigilarF(body){ clearTimeout(F.t); F.t = setTimeout(()=>{ finFichada(); body.textContent=""; vFichar(body); toast("Sesión de fichada cerrada"); }, 3*60*1000); }

/* j: jornada ya recibida junto con el login (ahorra una llamada); si no viene, se pide. */
async function jornada(body, j){
  vigilarF(body);
  if (!j){
    body.textContent=""; body.append(el("div",{class:"card empty"}, el("span",{class:"spin"})," Cargando…"));
    try{ j = await api("miJornada", F.token); }catch(e){ body.textContent=""; vFichar(body); return toast(msgErr(e)); }
  }
  F.j = j; fichando = false; clearTimeout(liberarT);   // pantalla nueva: el bloqueo anti doble toque es solo para la pantalla anterior
  body.textContent="";
  const card = el("div",{class:"card fichar"});
  card.append(el("h2",{text:`Hola, ${j.nombre.split(" ")[0]}`}), el("p",{class:"lead",text:`Hoy, ${fmtF(j.fecha)} · Sucursal ${j.sucursal.nombre}`}));
  // Estado actual, grande y claro
  card.append(el("div",{class:"estado-actual "+(j.estado.tipo==="entrada"?"adentro":j.estado.tipo==="salida"?"afuera":"")}, el("span",{class:"k",text:"Estado actual"}), el("b",{text:j.estado.texto})));
  if (j.pares && j.pares.length) card.append(el("div",{class:"pares"}, el("span",{class:"k",text:"Hoy"}),
    el("span",{class:"mono",text:paresTxt(j.pares)}), j.minutosHoy ? el("b",{text:"Total "+horas(j.minutosHoy)}) : null));
  if ((j.manualesPendientes||[]).length) card.append(el("div",{class:"notice warn",text:`✋ ${j.manualesPendientes.map(m=>`${m.tipo==="salida"?"Salida":"Entrada"} manual de las ${m.hora}`).join(" y ")}: pendiente de aprobación de un jefe.`}));
  const incompleta = (j.sucursal.incompleta||[]).length>0;
  if (incompleta) card.append(el("div",{class:"notice bad",text:`⚠️ Tu sucursal (${j.sucursal.nombre}) no tiene cargado: ${j.sucursal.incompleta.join(", ")}. Hasta que un jefe lo complete no se puede fichar con ubicación. Podés pedir un fichaje manual.`}));
  if (!j.habilitado) card.append(el("div",{class:"notice warn",text:"Tu usuario no está habilitado para fichar. Consultá con tu jefe."}));
  else if (j.abiertaAnterior) card.append(formAbierta(body, j.abiertaAnterior));
  else {
    const mk = tipo => { const b = el("button",{class:"btn fichar-btn "+tipo,type:"button",disabled:j.siguiente!==tipo,"aria-describedby":"fichar-ayuda"},
        el("span",{text:tipo==="entrada"?"🟢":"🏁"}), el("span",{text:tipo==="entrada"?"Fichar entrada":"Fichar salida"}));
      b.onclick = ()=>pulsarFichar(body, tipo, [bE,bS]); return b; };
    const bE = mk("entrada"), bS = mk("salida");
    card.append(el("div",{class:"fbtns"}, bE, bS),
      el("p",{class:"aviso",id:"fichar-ayuda",text: j.siguiente==="entrada" ? "Te toca fichar la ENTRADA." : "Te toca fichar la SALIDA."}),
      el("p",{class:"aviso",text:"📍 Al tocar el botón se pide la ubicación del teléfono una sola vez, para validar que estés en tu sucursal."+(j.fotoObligatoria?" 📷 Después te sacás la foto.":"")}));
    if (incompleta) card.append(el("button",{class:"btn",type:"button",text:"✋ Solicitar fichaje manual",onclick:()=>formManual(body, j.siguiente, {motivo:"sucursal_incompleta", sucursal:j.sucursal.nombre, faltan:j.sucursal.incompleta}, null)}));
  }
  if (j.vacacionesNovedades) card.append(el("div",{class:"notice ok"}, `📬 ${j.vacacionesNovedades===1?"Tenés 1 solicitud de vacaciones resuelta":"Tenés "+j.vacacionesNovedades+" solicitudes de vacaciones resueltas"}. `, el("button",{class:"btn sm",type:"button",text:"Ver",onclick:()=>{ clearTimeout(F.t); location.hash="#/empleados/vacaciones"; }})));
  card.append(el("div",{class:"row"},
    el("button",{class:"btn",type:"button",text:"⏱️ Mis horas",onclick:()=>misHoras(body)}),
    el("button",{class:"btn",type:"button",text:"🧾 Mis registros y correcciones",onclick:()=>misRegistros(body)}),
    el("button",{class:"btn",type:"button",text:"🏖️ Mis vacaciones",onclick:()=>{ clearTimeout(F.t); location.hash="#/empleados/vacaciones"; }}),
    el("span",{class:"spacer"}), el("button",{class:"btn",type:"button",text:"Terminar",onclick:()=>{ finFichada(); body.textContent=""; vFichar(body); }})));
  body.append(card);
}
/* Entrada abierta de un día anterior: antes de fichar hoy hay que decir a qué hora fue la salida (lo aprueba un jefe). */
function formAbierta(body, ab){
  const h = el("input",{type:"time",value:"18:00","aria-label":"Hora de salida"}), m = el("input",{type:"text",maxlength:"300",placeholder:"Motivo (ej.: me fui sin fichar la salida)","aria-label":"Motivo"});
  const b = el("button",{class:"btn primary",type:"submit",text:"Enviar y seguir"});
  return el("form",{class:"notice warn abierta",onsubmit:async e=>{ e.preventDefault(); if (m.value.trim().length<3) return toast("Contá brevemente el motivo."); spinBtn(b,"Enviando…");
      try{ await api("solicitarCorreccion", F.token, {fecha:ab.fecha, tipo:"salida", horaPropuesta:h.value, motivo:m.value}); toast("✅ Corrección enviada. Ya podés fichar."); jornada(body); }
      catch(x){ unspin(b); toast(msgErr(x)); } }},
    el("b",{text:`⚠️ Tenés una entrada abierta del ${fmtF(ab.fecha)} a las ${ab.hora} sin salida.`}),
    el("span",{text:"Para fichar hoy, indicá a qué hora saliste ese día. Un jefe lo revisa y queda registrado (tu fichaje original no se modifica)."}),
    el("div",{class:"grid2"}, el("label",{class:"f"},"Hora de salida",h), el("label",{class:"f"},"Motivo",m)), b);
}
/* Aviso del primer uso: para qué se usa la ubicación (una vez por persona y teléfono). */
function avisoPrimerUso(texto){
  const k = "hb34_geo_"+((S.user&&S.user.legajo)||F.nombre||"");
  if (lsGet(k)) return Promise.resolve(true);
  return new Promise(res=>{
    const m = modal(el("div",{class:"grid"}, el("div",{class:"lockicon",text:"📍"}), el("h2",{text:"Antes de fichar"}),
      el("p",{style:"margin:0;font-size:15.5px",text:texto||"Usamos la ubicación del teléfono solo en el momento de fichar, para validar que estés en tu sucursal."}),
      el("ul",{class:"pasos"}, el("li",{text:"Se toma una sola vez, cuando tocás «Fichar». No hay seguimiento."}), el("li",{text:"La distancia y la hora las calcula el servidor."}), el("li",{text:"Tu ubicación solo la ven los jefes."})),
      el("div",{class:"row"}, el("button",{class:"btn primary",type:"button",text:"Entendido",onclick:()=>{ lsSet(k,1); m.cerrar(); res(true); }}),
        el("button",{class:"btn",type:"button",text:"Cancelar",onclick:()=>{ m.cerrar(); res(false); }}))), {cerrable:false});
  });
}
let fichando = false, liberarT = null;
/* Un toque: bloqueo de unos segundos (evita dobles toques) → ubicación → validación en el servidor → foto → registro. */
async function pulsarFichar(body, tipo, botones){
  if (fichando) return; fichando = true;
  botones.forEach(b=>b.disabled=true);
  const liberar = ()=>{ clearTimeout(liberarT); liberarT = setTimeout(()=>{ fichando=false; botones.forEach(b=>{ if (b.isConnected) b.disabled = !(F.j && F.j.siguiente===(b.classList.contains("salida")?"salida":"entrada")); }); }, 4000); };
  try{
    if (!(await avisoPrimerUso(F.j && F.j.avisoUbicacion))) return;
    const boton = botones.find(b=>b.classList.contains(tipo)); if (boton) spinBtn(boton, "Obteniendo ubicación…");
    const geo = await ubicacion();
    if (boton) unspin(boton);
    if (geo.error) return pantallaRechazo(body, tipo, {motivo:geo.error}, geo);
    let v; try{ v = await api("verificarUbicacion", F.token, tipo, geo); }
    catch(e){ return errorFichada(body, tipo, e, geo); }
    if (!v.ok) return pantallaRechazo(body, tipo, v, geo);
    if (F.j && F.j.fotoObligatoria) pasoFoto(body, tipo, geo, v); else enviarFichada(body, tipo, geo, null);
  } finally { liberar(); }
}
/* Ubicación que no valida: mensaje claro + reintentar + fichaje manual con motivo (lo aprueba un jefe). */
function pantallaRechazo(body, tipo, v, geo){
  vigilarF(body);
  body.textContent="";
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const card = el("div",{class:"card fichar rechazo"});
  const titulo = { fuera:`Estás a ${v.distancia!=null ? v.distancia.toLocaleString("es-AR") : "?"} metros de la sucursal`, precision:"La ubicación del teléfono es poco precisa",
    sucursal_incompleta:"Tu sucursal no tiene la ubicación completa", sin_permiso:"Activá la ubicación para fichar", no_disponible:"No pudimos obtener tu ubicación", tiempo_agotado:"No pudimos obtener tu ubicación" }[v.motivo] || "No se pudo validar la ubicación";
  card.append(el("div",{class:"bigok",text:v.motivo==="fuera"?"📏":"📍"}), el("h2",{text:titulo}));
  if (v.motivo==="fuera") card.append(el("p",{class:"lead",text:`Para fichar tenés que estar a menos de ${v.radio} m de ${v.sucursal}. El fichaje no se registró.`}));
  else if (v.motivo==="precision") card.append(el("p",{class:"lead",text:`El GPS marca con un margen de ±${v.precision} m (se necesita ${v.precisionMax||100} m o menos). El fichaje no se registró.`}),
    el("ol",{class:"pasos"}, ...["Activá la ubicación con «precisión alta» (o «ubicación precisa»).", "Acercate a una ventana o a la puerta del local y esperá unos segundos.", "Tocá «Reintentar»."].map(t=>el("li",{text:t}))));
  else if (v.motivo==="sucursal_incompleta") card.append(el("p",{class:"lead",text:`A ${v.sucursal} le falta: ${(v.faltan||[]).join(", ")}. Avisá a un jefe para que lo complete. Mientras tanto podés pedir un fichaje manual.`}));
  else card.append(el("p",{class:"lead",text:(v.motivo==="sin_permiso"?"No diste permiso de ubicación a la app.":"La ubicación del teléfono está apagada o no respondió a tiempo.")+" Sin ubicación el fichaje no se registra."}),
    el("ol",{class:"pasos"}, ...(ios ? ["Ajustes → Privacidad y seguridad → Localización: activá «Localización».", "En la misma lista, elegí Safari (o la app instalada) → «Al usar la app» y «Ubicación exacta».", "Volvé acá y tocá «Reintentar»."]
      : ["Bajá el panel de notificaciones y activá «Ubicación» (GPS).", "Si el navegador no la pidió: tocá el candado 🔒 de la barra de dirección → Permisos → Ubicación → Permitir.", "Volvé acá y tocá «Reintentar»."]).map(t=>el("li",{text:t}))));
  card.append(el("div",{class:"row",style:"justify-content:center"},
    v.motivo!=="sucursal_incompleta" ? el("button",{class:"btn primary big-btn",type:"button",text:"Reintentar",onclick:()=>jornada(body, F.j)}) : null,
    el("button",{class:"btn big-btn",type:"button",text:"✋ Solicitar fichaje manual",onclick:()=>formManual(body, tipo, v, geo)}),
    el("button",{class:"btn",type:"button",text:"Volver",onclick:()=>jornada(body)})));
  body.append(card);
}
function formManual(body, tipo, v, geo){
  vigilarF(body);
  body.textContent="";
  const m = el("textarea",{maxlength:"300",placeholder:"Ej.: estoy en el local, el GPS marca a otra cuadra","aria-label":"Motivo",required:true});
  const b = el("button",{class:"btn fichar-btn "+tipo,type:"submit",text:`Enviar ${tipo} manual`});
  body.append(el("form",{class:"card fichar",onsubmit:async e=>{ e.preventDefault(); if (m.value.trim().length<5) return toast("Contá brevemente el motivo."); spinBtn(b,"Enviando…");
      try{ const r = await api("solicitarFichajeManual", F.token, tipo, m.value, geo && !geo.error ? geo : (geo||{error:"no_disponible"}));
        body.textContent="";
        body.append(el("div",{class:"card fichar done "+tipo}, el("div",{class:"bigok",text:"✋"}), el("h2",{text:`${tipo==="entrada"?"Entrada":"Salida"} manual enviada`}),
          el("div",{class:"big mono",text:r.hora.slice(0,5)}), el("p",{class:"lead",text:`${fmtF(r.fecha)} · hora del servidor · ${r.sucursal}`}),
          el("p",{class:"lead",text:"Queda pendiente: un jefe la aprueba o la rechaza. Si la rechaza, vas a ver el motivo en «Mis registros»."}),
          el("button",{class:"btn primary",type:"button",text:"Listo",onclick:()=>jornada(body)})));
      }catch(x){ unspin(b); errorFichada(body, tipo, x, geo); } }},
    el("h2",{text:`Fichaje manual de ${tipo}`}),
    el("p",{class:"lead",text:"Se registra la hora del servidor de este momento y queda pendiente de aprobación de un jefe."}),
    el("label",{class:"f"},"Motivo (obligatorio)",m), b, el("button",{class:"btn",type:"button",text:"Cancelar",onclick:()=>jornada(body)})));
  setTimeout(()=>m.focus(),60);
}
/* Paso de la foto (si la configuración la exige): la cámara se abre con un toque propio de la persona. */
function pasoFoto(body, tipo, geo, v){
  vigilarF(body);
  body.textContent="";
  const b = el("button",{class:"btn fichar-btn "+tipo+" foto-btn",type:"button"}, el("span",{text:"📸"}), el("span",{text:"Sacar la foto"}));
  b.onclick = async ()=>{ spinBtn(b,"Abriendo la cámara…"); const foto = await elegirFoto(true); if (!foto){ unspin(b); return toast("Necesitás sacarte la foto para fichar."); } confirmarFichada(body, tipo, geo, foto); };
  body.append(el("div",{class:"card fichar"}, el("div",{class:"bigok",text:"✅"}), el("h2",{text:`Ubicación validada en ${v.sucursal}`}),
    el("p",{class:"lead",text:`Ahora sacate la foto para registrar tu ${tipo}.`}), b,
    el("button",{class:"btn",type:"button",text:"Cancelar",onclick:()=>jornada(body)})));
}
function confirmarFichada(body, tipo, geo, foto){
  body.textContent="";
  const b = el("button",{class:"btn fichar-btn "+tipo,type:"button",text:"Confirmar "+tipo});
  const otra = el("button",{class:"btn",type:"button",text:"Sacar otra foto",onclick:async()=>{ spinBtn(otra,"Abriendo la cámara…"); const f2 = await elegirFoto(true); unspin(otra); if (f2) confirmarFichada(body, tipo, geo, f2); }});
  body.append(el("div",{class:"card fichar"}, el("h2",{text:"Confirmá tu "+tipo}), el("img",{src:foto,alt:"Tu foto",class:"selfie"}), b, otra,
    el("button",{class:"btn",type:"button",text:"Cancelar",onclick:()=>jornada(body)})));
  b.onclick = ()=>{ spinBtn(b,"Registrando…"); enviarFichada(body, tipo, geo, foto, b); };
}
async function enviarFichada(body, tipo, geo, foto, boton){
  geo.ua = navigator.userAgent.slice(0,120);
  try{
    const r = await api("registrarFichada", F.token, tipo, foto, geo);
    body.textContent="";
    body.append(el("div",{class:"card fichar done "+tipo},
      el("div",{class:"bigok",text:"✅"}), el("h2",{text:(tipo==="entrada"?"Entrada":"Salida")+" registrada"}),
      el("div",{class:"big mono",text:r.hora.slice(0,5)}), el("p",{class:"lead",text:fmtF(r.fecha)+" · hora del servidor · "+r.sucursal}),
      r.precisionBaja ? el("p",{class:"notice warn",text:"El GPS tenía poca precisión: el registro queda «para revisar» por un jefe."}) : el("p",{class:"lead",text:"📍 Ubicación validada en tu sucursal"+(r.fotoGuardada?" · 📷 foto guardada":"")}),
      tipo==="salida" || r.minutosHoy ? el("p",{class:"lead",text:"⏱️ Hoy llevás "+horas(r.minutosHoy||0)}) : null,
      el("button",{class:"btn primary",type:"button",text:"Listo",onclick:()=>{ finFichada(); body.textContent=""; vFichar(body); }})));
    setTimeout(()=>{ if (F.token && body.querySelector(".fichar.done")){ finFichada(); body.textContent=""; vFichar(body); } }, 20000);
  }catch(e){ if (boton) unspin(boton); errorFichada(body, tipo, e, geo); }
}
function errorFichada(body, tipo, e, geo){
  const msg = String(e && e.message || "");
  const dup = /^DUP:(\w+):(.+)$/.exec(msg);
  if (dup){ body.textContent="";
    body.append(el("div",{class:"card notice warn",text: dup[1]==="entrada" ? `Ya tenés una entrada registrada a las ${dup[2].slice(0,5)}. Ahora te toca fichar la salida.` : `Ya registraste la salida a las ${dup[2].slice(0,5)}. Para volver a fichar, primero fichá una nueva entrada.`}));
    return setTimeout(()=>jornada(body),2800); }
  if (/^GEO:/.test(msg)){ let v={motivo:"no_disponible"}; try{ v = JSON.parse(msg.slice(4)); }catch(x){} return pantallaRechazo(body, tipo, v, geo); }
  if (/^RAPIDO:/.test(msg)) return toast(msg.slice(7));
  if (/^ABIERTA:/.test(msg)) return jornada(body);
  if (esAuth(e)){ toast("La sesión venció. Volvé a identificarte."); body.textContent=""; return vFichar(body); }
  toast("No se registró: "+msgErr(e));
}
async function misRegistros(body){
  vigilarF(body);
  body.textContent=""; let L=[], Sol=[];
  try{ [L, Sol] = await Promise.all([api("misIngresos", F.token), api("misSolicitudes", F.token)]); }catch(e){ return toast(msgErr(e)); }
  const tb = el("tbody");
  L.forEach(x=>tb.append(el("tr",{}, el("td",{class:"mono",text:fmtF(x.fecha)}), el("td",{text:x.tipo==="salida"?"Salida":"Entrada"}),
    el("td",{class:"mono",text:(x.horaCorregida? x.horaCorregida+" (corr.)" : (x.hora||"").slice(0,5))}),
    el("td",{},el("span",{class:"pill "+(x.estado==="valido"?"ok":x.estado==="revisar"?"warn":""),text:x.estado})), el("td",{text:x.modo==="manual"?"Manual":x.modo==="correccion"?"Corrección":"Automático"}))));
  if (!L.length) tb.append(el("tr",{},el("td",{colspan:"5",class:"empty",text:"Todavía no tenés fichajes."})));
  const ts = el("tbody");
  Sol.forEach(c=>ts.append(el("tr",{}, el("td",{class:"mono",text:fmtF(c.fecha)}), el("td",{text:(c.clase==="manual"?"Fichaje manual · ":"Corrección · ")+(c.tipo==="salida"?"salida":"entrada")}),
    el("td",{class:"mono",text:c.hora}), el("td",{}, el("span",{class:"pill "+(c.estado==="aprobada"?"ok":c.estado==="rechazada"?"bad":"warn"),text:c.estado})), el("td",{text:c.comentario?("Motivo del rechazo: "+c.comentario):c.motivo}))));
  if (!Sol.length) ts.append(el("tr",{},el("td",{colspan:"5",class:"empty",text:"Sin solicitudes."})));
  const f = el("input",{type:"date",value:hoy(),max:hoy()}), t = el("select",{}, el("option",{value:"entrada",text:"Entrada"}), el("option",{value:"salida",text:"Salida"}));
  const h = el("input",{type:"time",value:"09:00"}), m = el("input",{type:"text",maxlength:"300",placeholder:"Motivo (ej.: me olvidé de fichar)"});
  const b = el("button",{class:"btn primary",type:"submit",text:"Enviar solicitud"});
  body.append(el("div",{class:"card"}, el("h2",{text:"Mis últimos fichajes"}),
      el("div",{class:"tablewrap"}, el("table",{class:"compact"}, el("thead",{},el("tr",{}, ...["Fecha","Tipo","Hora","Estado","Modo"].map(x=>el("th",{text:x})))), tb))),
    el("div",{class:"card"}, el("h2",{text:"Mis solicitudes"}), el("div",{class:"tablewrap"}, el("table",{class:"compact"}, el("thead",{},el("tr",{}, ...["Fecha","Pedido","Hora","Estado","Detalle"].map(x=>el("th",{text:x})))), ts))),
    el("form",{class:"card",onsubmit:async e=>{ e.preventDefault(); spinBtn(b,"Enviando…");
        try{ await api("solicitarCorreccion", F.token, {fecha:f.value, tipo:t.value, horaPropuesta:h.value, motivo:m.value}); toast("✅ Solicitud enviada. La revisa un jefe."); misRegistros(body); }
        catch(x){ unspin(b); toast(msgErr(x)); } }},
      el("h2",{text:"Pedir una corrección"}), el("p",{class:"lead",text:"Tu registro original no se modifica: un jefe aprueba o rechaza el cambio y queda constancia."}),
      el("div",{class:"grid2"}, el("label",{class:"f"},"Fecha",f), el("label",{class:"f"},"Tipo",t), el("label",{class:"f"},"Hora correcta",h)), el("label",{class:"f"},"Motivo",m),
      el("div",{class:"row"}, b, el("button",{class:"btn",type:"button",text:"Volver",onclick:()=>jornada(body)}))));
}
/* "Mis horas": solo las propias, por mes, con días, semanas, total, promedio y diferencia con lo esperado (si está cargado). */
async function misHoras(body, mes){
  vigilarF(body);
  mes = mes || hoy().slice(0,7);
  body.textContent=""; body.append(el("div",{class:"card empty"}, el("span",{class:"spin"})," Calculando tus horas…"));
  const fin = (()=>{ const [y,m]=mes.split("-").map(Number); return fechaLocal(new Date(y, m, 0)); })();
  let r; try{ r = await api("resumenHoras", F.token, {desde: mes+"-01", hasta: fin}); }catch(e){ body.textContent=""; toast(msgErr(e)); return jornada(body); }
  body.textContent="";
  const e = r.empleados[0];
  const sel = el("select",{"aria-label":"Mes"}, ...[0,1,2,3].map(i=>{ const d=new Date(); d.setDate(1); d.setMonth(d.getMonth()-i); const k=fechaLocal(d).slice(0,7); return el("option",{value:k,selected:k===mes,text:d.toLocaleDateString("es-AR",{month:"long",year:"numeric"})}); }));
  sel.onchange = ()=>misHoras(body, sel.value);
  body.append(el("div",{class:"card"}, el("div",{class:"row"}, el("h2",{style:"margin:0",text:"⏱️ Mis horas"}), el("span",{class:"spacer"}), sel),
    e ? tablaHorasEmpleado(e, r, false) : el("p",{class:"empty",text:"Sin datos en el período."}),
    el("div",{class:"row"}, el("button",{class:"btn",type:"button",text:"Volver",onclick:()=>jornada(body)}))));
}
/** Bloque de horas de una persona: totales, semanas y detalle por día (lo usan "Mis horas" y la vista de jefes). */
function tablaHorasEmpleado(e, r, jefe, onCorregir){
  const box = el("div",{class:"grid"});
  const kpi = (k,v,cls) => el("div",{class:"hk "+(cls||"")}, el("span",{class:"k",text:k}), el("b",{text:v}));
  box.append(el("div",{class:"hkpis"}, kpi("Total", hm(e.total)+" h"), kpi("Días trabajados", String(e.diasTrabajados)), kpi("Promedio diario", e.promedio==null?"–":hm(e.promedio)+" h"),
    e.esperado!=null ? kpi("Esperado", hm(e.esperado)+" h") : null, e.diferencia!=null ? kpi("Diferencia", difTxt(e.diferencia)+" h", e.diferencia<0?"neg":"pos") : null));
  const avisos = [];
  if (e.incompletos) avisos.push(`${e.incompletos} día(s) incompleto(s): no se suman hasta que se corrijan.`);
  if (e.sinFichaje) avisos.push(`${e.sinFichaje} día(s) de apertura sin fichaje (para revisar, no es una conclusión).`);
  if (e.vacaciones) avisos.push(`${e.vacaciones} día(s) de vacaciones y ${e.feriados} feriado(s): no cuentan como ausencia.`);
  else if (e.feriados) avisos.push(`${e.feriados} feriado(s): no cuentan como ausencia.`);
  if (avisos.length) box.append(el("ul",{class:"hint lista-avisos"}, avisos.map(a=>el("li",{text:a}))));
  if (e.diferencia!=null) box.append(el("p",{class:"hint",text:`Esperado: ${e.horasEsperadas.horas} h por ${e.horasEsperadas.tipo==="semana"?"semana":"día de apertura"} (sin vacaciones ni feriados). La diferencia es informativa: no calcula pagos ni horas extra.`}));
  if (r.redondeo>1) box.append(el("p",{class:"hint",text:`Horas por día redondeadas a ${r.redondeo} minutos.`}));
  if (e.semanas.length){ const tw = el("tbody"); e.semanas.forEach(w=>tw.append(el("tr",{}, el("td",{class:"mono",text:"Semana del "+fmtF(w.semana).slice(0,5)}), el("td",{class:"n",text:hm(w.minutos)}), el("td",{class:"n",text:w.esperado==null?"–":hm(w.esperado)}), el("td",{class:"n",text:w.esperado==null?"–":difTxt(w.minutos-w.esperado)}))));
    box.append(el("div",{class:"tablewrap"}, el("table",{class:"compact"}, el("thead",{},el("tr",{}, el("th",{text:"Semana"}), el("th",{class:"n",text:"Horas"}), el("th",{class:"n",text:"Esperado"}), el("th",{class:"n",text:"Diferencia"}))), tw))); }
  const td = el("tbody");
  e.dias.slice().reverse().forEach(x=>td.append(el("tr",{}, el("td",{class:"mono",text:fmtF(x.fecha).slice(0,5)+" "+x.dia}),
    el("td",{}, el("span",{class:"pill "+(estadoDiaCls[x.estado]||""),text:estadoDiaTxt[x.estado]||x.estado}), x.feriado && x.estado!=="feriado" ? el("span",{class:"pill fer-l",text:"🎉"}) : null, jefe && x.revisar ? el("span",{class:"pill warn",text:"revisar"}) : null, x.manual ? el("span",{class:"pill",text:"manual"}) : null),
    el("td",{class:"mono",text: x.estado==="feriado" ? x.feriado : paresTxt(x.pares)}), el("td",{class:"n",text:x.minutos==null?(x.minutosParciales&&x.estado==="en_curso"?hm(x.minutosParciales)+"…":"–"):hm(x.minutos)}),
    jefe ? el("td",{}, x.estado==="incompleto" && onCorregir ? el("button",{class:"btn sm",type:"button",text:"Corregir",onclick:()=>onCorregir(e, x)}) : null) : null)));
  if (!e.dias.length) td.append(el("tr",{},el("td",{colspan:jefe?"5":"4",class:"empty",text:"Sin días en el período."})));
  box.append(el("div",{class:"tablewrap"}, el("table",{class:"compact"}, el("thead",{},el("tr",{}, ...["Día","Estado","Entradas y salidas","Horas"].concat(jefe?[""]:[]).map((x,i)=>el("th",{class:i===3?"n":null,text:x})))), td)));
  return box;
}
/* ===================== Registro de ingresos (vista administrativa) ===================== */
const GEO_TXT = {dentro:"En la sucursal",fuera:"Fuera del radio",precision:"GPS poco preciso",sucursal_incompleta:"Sucursal sin ubicación",sin_permiso:"Sin permiso de ubicación",no_disponible:"Ubicación no disponible",tiempo_agotado:"Ubicación no disponible",no_configurado:"No requerida",sin_referencia:"Registrada (sin referencia)",no_aplica:"No aplica (corrección)"};
const EST_CLS = {valido:"ok",revisar:"warn",corregido:"",anulado:"bad"};
function vFichadas(main){
  const lunes = (()=>{ const d=new Date(); d.setDate(d.getDate()-((d.getDay()+6)%7)); return fechaLocal(d); })();
  const de = el("input",{type:"date",value:lunes}), ha = el("input",{type:"date",value:hoy()});
  const emp = el("select",{}, el("option",{value:"",text:"Todo el personal"})), est = el("select",{}, el("option",{value:"",text:"Todos los estados"}), ...["valido","revisar","corregido","anulado"].map(x=>el("option",{value:x,text:x})));
  const q = el("input",{type:"search",placeholder:"Búsqueda rápida"});
  const body = el("div",{class:"stack"});
  let D = null;
  const cargar = async ()=>{ body.textContent=""; body.append(el("div",{class:"card empty"}, el("span",{class:"spin"})," Cargando…"));
    try{ D = await apiS("listarIngresos", de.value, ha.value); }catch(e){ body.textContent=""; return body.append(el("div",{class:"card notice bad",text:msgErr(e)})); }
    const nombres = [...new Map(D.lista.map(x=>[x.uid,x.nombre])).entries()].sort((a,b)=>a[1].localeCompare(b[1]));
    const cur = emp.value; emp.textContent=""; emp.append(el("option",{value:"",text:"Todo el personal"}), ...nombres.map(([id,n])=>el("option",{value:id,text:n,selected:id===cur})));
    pintar(); };
  const pintar = ()=>{ body.textContent=""; if (!D) return;
    const t=q.value.trim().toLowerCase();
    const L = D.lista.filter(x=>(!emp.value||x.uid===emp.value)&&(!est.value||x.estado===est.value)&&(!t||(x.nombre+" "+x.legajo+" "+(x.observacion||"")).toLowerCase().includes(t)));
    // Alertas para revisión (no son conclusiones)
    const al = el("div",{class:"alerts"});
    const pend = D.correcciones.filter(c=>c.estado==="pendiente");
    if (pend.length) al.append(el("div",{class:"notice warn",text:`✋ ${pend.length} solicitud(es) de corrección pendientes de aprobación.`}));
    if (D.pendientes.length) al.append(el("div",{class:"notice",text:`🔎 ${D.pendientes.length} día(s)-persona de apertura sin entrada registrada. Es una alerta para revisar, no una falta.`}));
    if ((D.deVacaciones||[]).length) al.append(el("div",{class:"notice ok",text:`🏖️ ${D.deVacaciones.length} día(s)-persona de vacaciones aprobadas en el período: no cuentan como falta ni como fichada pendiente.`}));
    if (D.sinSalida.length) al.append(el("div",{class:"notice",text:`🔎 ${D.sinSalida.length} jornada(s) con entrada y sin salida.`}));
    const dup = L.filter(x=>x.duplicado).length; if (dup) al.append(el("div",{class:"notice bad",text:`⚠️ ${dup} registro(s) con la secuencia entrada/salida rota (dos entradas seguidas o salida sin entrada): revisar.`}));
    const pb = L.filter(x=>x.precisionBaja && x.estado==="revisar").length; if (pb) al.append(el("div",{class:"notice warn",text:`📡 ${pb} fichaje(s) con precisión baja del GPS, marcados para revisar (la ubicación del celular puede alterarse).`}));
    if (al.children.length) body.append(al);
    // Jornadas
    const J = D.jornadas.filter(j=>(!emp.value||j.uid===emp.value)&&(!t||(j.nombre+" "+j.legajo).toLowerCase().includes(t)));
    const tj = el("tbody"); J.forEach(j=>tj.append(el("tr",{}, el("td",{class:"mono",text:fmtF(j.fecha)}), el("td",{text:j.nombre}), el("td",{text:j.sucursal||""}), el("td",{class:"mono",text:paresTxt(j.pares)}),
      el("td",{class:"n",text:horas(j.minutos)}), el("td",{}, j.incompleto?el("span",{class:"pill warn",text:j.sinSalida?"Sin salida":"Incompleto"}):j.enCurso?el("span",{class:"pill",text:"En curso"}):null))));
    if (!J.length) tj.append(el("tr",{},el("td",{colspan:"6",class:"empty",text:"Sin jornadas en el período."})));
    body.append(el("div",{class:"card"}, el("h2",{text:"Jornadas"}), el("div",{class:"tablewrap"}, el("table",{}, el("thead",{},el("tr",{}, ...["Fecha","Empleado","Sucursal","Entradas y salidas","Horas","Revisión"].map((x,i)=>el("th",{class:i===4?"n":null,text:x})))), tj))));
    // Detalle de fichadas
    const tb = el("tbody");
    L.forEach(x=>{ const abierto = S.openRow===x.id, tog=()=>{ S.openRow=abierto?null:x.id; pintar(); };
      tb.append(el("tr",{class:"clk"+(abierto?" sel":""),tabindex:"0",onclick:tog,onkeydown:e=>{if(e.key==="Enter")tog();}},
        el("td",{class:"mono",text:fmtF(x.fecha)}), el("td",{text:x.nombre+(x.usuarioInactivo?" (baja)":"")}), el("td",{text:x.sucursal||""}), el("td",{text:(x.tipo==="salida"?"Salida":"Entrada")+(x.modo==="manual"?" (manual)":"")}),
        el("td",{class:"mono",text:x.horaCorregida? x.horaCorregida+" ✎" : (x.hora||"").slice(0,8)}),
        el("td",{},el("span",{class:"pill "+(EST_CLS[x.estado]||""),text:x.estado})), el("td",{text:x.tieneFoto?"📷":x.fotoPurgada?"(vencida)":"—"}),
        el("td",{text:(GEO_TXT[x.geoResultado]||x.geoResultado||"")+(x.distancia!=null?" · "+x.distancia+" m":"")+(x.precisionBaja?" · 📡 baja":"")}), el("td",{text:x.observacion||""})));

    });
    if (!L.length) tb.append(el("tr",{},el("td",{colspan:"9",class:"empty",text:"Sin fichadas con estos filtros."})));
    const selI = L.find(x=>x.id===S.openRow);
    const detI = selI ? el("div",{class:"card detcard"}, el("div",{class:"row"}, el("h3",{style:"margin:0",text:`Detalle · ${selI.nombre} · ${selI.tipo} ${fmtF(selI.fecha)}`}), el("span",{class:"spacer"}), el("button",{class:"btn sm",type:"button",text:"Cerrar detalle",onclick:()=>{S.openRow=null;pintar();}})), detalleIngreso(selI, cargar)) : null;
    body.append(el("div",{class:"card"}, el("h2",{text:"Fichadas"}), el("p",{class:"lead",text:"Tocá una fila para ver la evidencia y revisarla. La hora es la del servidor; las correcciones conservan el registro original."}),
      el("div",{class:"tablewrap"}, el("table",{}, el("thead",{},el("tr",{}, ...["Fecha","Empleado","Sucursal","Tipo","Hora","Estado","Evidencia","Validación","Observaciones"].map(x=>el("th",{text:x})))), tb))));
    if (detI){ body.append(detI); setTimeout(()=>detI.scrollIntoView({behavior:"smooth",block:"start"}),30); }
    // Correcciones
    const tc = el("tbody");
    D.correcciones.slice().sort((a,b)=>(a.estado==="pendiente"?0:1)-(b.estado==="pendiente"?0:1)||b.creado.localeCompare(a.creado)).forEach(c=>{
      const acc = c.estado==="pendiente" ? el("span",{class:"row"},
        el("button",{class:"btn sm",type:"button",text:"✔ Aprobar",onclick:async()=>{ try{ await apiS("resolverCorreccion",c.id,true,""); toast("Corrección aprobada"); cargar(); }catch(e){ toast(msgErr(e)); } }}),
        el("button",{class:"btn sm danger",type:"button",text:"✖ Rechazar",onclick:()=>rechazarSolicitud(c, cargar)})) : el("span",{text:(c.resueltoPor||"")+(c.comentario?" · "+c.comentario:"")});
      tc.append(el("tr",{}, el("td",{class:"mono",text:fmtF(c.fecha)}), el("td",{text:c.nombre}), el("td",{text:(c.clase==="manual"?"Manual · ":"")+(c.tipo||"entrada")}), el("td",{class:"mono",text: c.clase==="manual" ? (c.horaSolicitada||c.horaPropuesta||"").slice(0,5)+" (hora del pedido)" : (c.horaOriginal||"sin registro").slice(0,5)+" → "+c.horaPropuesta}),
        el("td",{text:c.motivo}), el("td",{},el("span",{class:"pill "+(c.estado==="aprobada"?"ok":c.estado==="rechazada"?"bad":"warn"),text:c.estado})), el("td",{},acc)));
    });
    if (!D.correcciones.length) tc.append(el("tr",{},el("td",{colspan:"7",class:"empty",text:"Sin solicitudes de corrección."})));
    body.append(el("div",{class:"card"}, el("h2",{text:"Solicitudes (correcciones y fichajes manuales)"}), el("div",{class:"tablewrap"}, el("table",{}, el("thead",{},el("tr",{}, ...["Fecha","Empleado","Tipo","Cambio","Motivo","Estado",""].map(x=>el("th",{text:x})))), tc))));
    if (D.pendientes.length){ const tp=el("tbody"); D.pendientes.forEach(p=>tp.append(el("tr",{}, el("td",{class:"mono"}, fmtF(p.fecha), p.feriado?el("span",{class:"pill",text:"🎉 "+p.feriado}):null), el("td",{text:p.nombre}),
        el("td",{}, el("button",{class:"btn sm",type:"button",text:"Derivar a RR. HH.",onclick:()=>derivar({uid:p.uid,fecha:p.fecha}, p.nombre)})))));
      body.append(el("div",{class:"card"}, el("h2",{text:"Días de apertura sin entrada (para revisar)"}), el("p",{class:"lead",text:"Puede haber motivos válidos (franco, licencia, olvido). Si corresponde, derivalo a RR. HH. Los días cerrados (feriado confirmado o excepción) y las vacaciones aprobadas no aparecen acá."}), el("div",{class:"tablewrap"}, el("table",{class:"compact"}, el("thead",{},el("tr",{}, ...["Fecha","Empleado",""].map(x=>el("th",{text:x})))), tp)))); }
    if ((D.deVacaciones||[]).length){ const tv=el("tbody"); D.deVacaciones.forEach(p=>tv.append(el("tr",{}, el("td",{class:"mono",text:fmtF(p.fecha)}), el("td",{text:p.nombre}), el("td",{},el("span",{class:"pill ok",text:"🏖️ De vacaciones"})))));
      body.append(el("div",{class:"card"}, el("h2",{text:"De vacaciones (aprobadas)"}), el("div",{class:"tablewrap"}, el("table",{class:"compact"}, el("thead",{},el("tr",{}, ...["Fecha","Empleado","Estado"].map(x=>el("th",{text:x})))), tv)))); }
  };
  [emp,est].forEach(x=>x.onchange=pintar); q.oninput=pintar; [de,ha].forEach(x=>x.onchange=cargar);
  const bx = el("button",{class:"btn xl",type:"button",text:"⬇️ Excel"});
  bx.onclick = async ()=>{ spinBtn(bx,"Preparando…"); try{ const r = await apiS("exportarIngresos", de.value, ha.value); await loadLibs("xlsx"); guardar(`HeyBlackk_Ingresos_${de.value}_a_${ha.value}.xlsx`, new Blob([await xlsxIngresos(r)],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"})); }catch(e){ toast(msgErr(e)); } finally{ unspin(bx); } };
  main.append(el("div",{class:"card filters"}, el("div",{class:"grid2"}, el("label",{class:"f"},"Desde",de), el("label",{class:"f"},"Hasta",ha), el("label",{class:"f"},"Empleado",emp), el("label",{class:"f"},"Estado",est)),
    el("div",{class:"row"}, q, el("button",{class:"btn",type:"button",text:"↻ Actualizar",onclick:cargar}), bx)), body);
  cargar();
}
function detalleIngreso(x, recargar){
  const obs = el("input",{type:"text",maxlength:"300",value:x.observacion||"",placeholder:"Observación"});
  const est = el("select",{}, ...["valido","revisar","anulado"].map(v=>el("option",{value:v,text:v,selected:x.estado===v})));
  const box = el("div",{class:"dl"});
  box.append(el("div",{class:"row"}, x.tieneFoto ? miniFoto("fotoIngreso", x.id, `${x.nombre} · ${x.tipo} ${fmtF(x.fecha)} ${x.hora}`) : el("span",{class:"lead",text: x.fotoPurgada?"La foto se eliminó por la política de retención.":"Sin foto."}),
    el("div",{class:"grid",style:"flex:1;min-width:220px"},
      el("span",{text:`Ubicación: ${GEO_TXT[x.geoResultado]||x.geoResultado}${x.distancia!=null?" · a "+x.distancia+" m de "+(x.sucursal||"la sucursal"):""}${x.precision!=null?" · precisión ±"+x.precision+" m":""}`}),
      x.latitud!=null ? el("span",{class:"mono hint",text:`Lat ${x.latitud} · Long ${x.longitud} (solo jefes)`}) : null,
      el("span",{text:"Modo: "+(x.modo==="manual"?"manual":x.modo==="correccion"?"por corrección":"automático")}),
      x.horaCorregida ? el("span",{text:`Hora original: ${x.hora||"sin registro"} · vigente: ${x.horaCorregida}`}) : null,
      (x.correcciones||[]).length ? el("ul",{class:"hint lista-avisos"}, x.correcciones.map(c=>el("li",{text:`${new Date(c.ts).toLocaleString("es-AR")} · ${c.por}: ${c.de||"(sin registro)"} → ${c.a} · ${c.motivo}`}))) : null,
      x.revisadoPor ? el("span",{class:"hint",text:"Revisado por "+x.revisadoPor}) : null,
      el("p",{class:"hint",text:"La foto, la hora y la ubicación son datos de apoyo: por sí solos no prueban identidad ni presencia."}))));
  box.append(el("div",{class:"grid2"}, el("label",{class:"f"},"Observación",obs), el("label",{class:"f"},"Estado",est)),
    el("div",{class:"row"}, el("button",{class:"btn sm primary",type:"button",text:"Guardar revisión",onclick:async e=>{ e.stopPropagation(); try{ await apiS("observarIngreso", x.id, obs.value, est.value); toast("Revisión guardada"); recargar(); }catch(err){ toast(msgErr(err)); } }}),
      x.estado!=="anulado" ? el("button",{class:"btn sm",type:"button",text:"✎ Corregir hora",onclick:e=>{ e.stopPropagation(); corregirHora(x, recargar); }}) : null,
      el("button",{class:"btn sm",type:"button",text:"Derivar a RR. HH.",onclick:e=>{ e.stopPropagation(); derivar({ingresoId:x.id}, x.nombre); }})));
  box.append(el("p",{class:"hint",text:"Para anular, elegí «anulado» y escribí el motivo en la observación (es obligatorio). Nada se borra: queda el registro original y quién lo cambió."}));
  return box;
}
function derivar(ref, nombre){
  const tipo = el("select",{}, ...[["llegada_tarde","Llegada tarde"],["inasistencia","Inasistencia"],["salida_anticipada","Salida anticipada"],["otra","Otra"]].map(([v,t])=>el("option",{value:v,text:t})));
  const det = el("textarea",{maxlength:"400",placeholder:"Detalle para RR. HH."}), ok = el("button",{class:"btn primary",type:"button",text:"Derivar"});
  const m = modal(el("div",{class:"grid"}, el("h2",{text:"Derivar a RR. HH. · "+nombre}), el("p",{class:"lead",text:"La novedad la gestiona RR. HH. por su circuito. No se genera ninguna falta automática."}), el("label",{class:"f"},"Tipo",tipo), el("label",{class:"f"},"Detalle",det),
    el("div",{class:"row"}, ok, el("button",{class:"btn",type:"button",text:"Cancelar",onclick:()=>m.cerrar()}))));
  ok.onclick = async ()=>{ spinBtn(ok); try{ await apiS("derivarRRHH", ref, tipo.value, det.value); m.cerrar(); toast("✅ Derivado a RR. HH."); }catch(e){ unspin(ok); toast(msgErr(e)); } };
}
async function xlsxIngresos(r){
  const wb = new ExcelJS.Workbook(); wb.creator="Hey Blackk";
  const hoja = (nombre, cab, filas) => { const ws = wb.addWorksheet(nombre, {views:[{state:"frozen",ySplit:1}]}); ws.addRow(cab); ws.getRow(1).font={bold:true,color:{argb:"FFFFFFFF"}}; ws.getRow(1).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF111113"}};
    filas.forEach(f=>ws.addRow(f.map(v=>typeof v==="string" && /^[=+\-@]/.test(v) ? "'"+v : v))); ws.columns.forEach(c=>c.width=18); };
  hoja("Jornadas", ["Fecha","Empleado","Usuario","Sucursal","Entradas y salidas","Horas","Revisión"], r.jornadas.map(j=>[fmtF(j.fecha),j.nombre,j.legajo,j.sucursal||"",paresTxt(j.pares),j.minutos==null?"":horas(j.minutos),j.incompleto?"Incompleto":""]));
  hoja("Fichadas", ["Fecha","Empleado","Usuario","Sucursal","Tipo","Modo","Hora","Hora corregida","Estado","Ubicación","Distancia (m)","Precisión (m)","Latitud","Longitud","Foto","Observación","Revisado por"], r.lista.map(x=>[fmtF(x.fecha),x.nombre,x.legajo,x.sucursal||"",x.tipo,x.modo||"",x.hora,x.horaCorregida,x.estado,GEO_TXT[x.geoResultado]||x.geoResultado,x.distancia??"",x.precision??"",x.latitud??"",x.longitud??"",x.tieneFoto?"Sí":"No",x.observacion,x.revisadoPor]));
  hoja("Correcciones", ["Fecha","Empleado","Tipo","Hora original","Hora propuesta","Motivo","Estado","Resuelto por"], r.correcciones.map(c=>[fmtF(c.fecha),c.nombre,c.tipo||"entrada",c.horaOriginal,c.horaPropuesta,c.motivo,c.estado,c.resueltoPor||""]));
  hoja("Sin entrada (revisar)", ["Fecha","Empleado","Usuario"], r.pendientes.map(p=>[fmtF(p.fecha),p.nombre,p.legajo]));
  return wb.xlsx.writeBuffer();
}
/* ===================== 3.4 · Fichaje y horas (sección de jefes) =====================
   Hoy por sucursal · Pendientes (fichajes manuales y correcciones) · Horas (filtros y exportación a la planilla) · Fichadas · Sucursales.
   Todo se valida en el servidor; acá solo se muestra. La ubicación (lat/long) llega solo a esta sección. */
function vIngresos(main){
  tabs(main, [["hoy","📍 Hoy"],["pendientes","✋ Pendientes"],["horas","⏱️ Horas"],["fichadas","🧾 Fichadas"],["sucursales","🏬 Sucursales"]], "hoy", (id, body)=>
    ({hoy:vHoyFich, pendientes:vPendientesFich, horas:vHorasJefes, fichadas:vFichadas, sucursales:vSucursales})[id](body));
}
const EST_HOY = {adentro:["Adentro","ok"], salio:["Salió",""], falta:["Sin fichaje","bad"], vacaciones:["De vacaciones","ok"], feriado:["Feriado","fer-l"], no_abre:["No abre hoy",""], manual_pendiente:["Manual pendiente","warn"], revisar:["Revisar secuencia","warn"]};
async function vHoyFich(body){
  body.append(el("div",{class:"card empty"}, el("span",{class:"spin"})," Cargando el día…"));
  let P; try{ P = await apiS("panelFichajesHoy"); }catch(e){ body.textContent=""; return body.append(el("div",{class:"card notice bad",text:msgErr(e)})); }
  body.textContent="";
  const pend = P.manualesPendientes + P.correccionesPendientes;
  body.append(el("div",{class:"row"}, el("span",{class:"lead",style:"margin:0",text:"Hoy, "+fmtF(P.fecha)}), el("span",{class:"spacer"}),
    pend ? el("button",{class:"btn sm danger",type:"button",text:`✋ ${pend} pendiente${pend>1?"s":""}`,onclick:()=>{ location.hash="#/ingresos/pendientes"; }}) : null,
    el("button",{class:"btn sm",type:"button",text:"↻ Actualizar",onclick:()=>{ body.textContent=""; vHoyFich(body); }})));
  P.sucursales.forEach(s=>{
    const card = el("div",{class:"card suc-hoy"});
    card.append(el("div",{class:"row"}, el("h2",{style:"margin:0",text:"🏬 "+s.nombre}), el("span",{class:"pill "+(s.feriado?"fer-l":s.abre?"ok":""),text:s.feriado?"Feriado: "+s.feriado:s.abre?"Abre hoy":"No abre hoy"}), el("span",{class:"spacer"}),
      el("span",{class:"hint",text:s.direccion||""})));
    if (s.incompleta.length) card.append(el("div",{class:"notice bad"}, `⚠️ Faltan datos de la sucursal (${s.incompleta.join(", ")}): nadie de ${s.nombre} puede fichar con ubicación hasta completarlos. `,
      el("button",{class:"btn sm",type:"button",text:"Completar",onclick:()=>{ location.hash="#/ingresos/sucursales"; }})));
    s.avisos.forEach(a=>card.append(el("p",{class:"hint",text:"ℹ️ "+a})));
    card.append(el("div",{class:"hkpis"}, ...[["Adentro",s.adentro],["Salieron",s.salieron],["Sin fichaje",s.faltan],["De vacaciones",s.deVacaciones]].map(([k,v])=>el("div",{class:"hk"+(k==="Sin fichaje"&&v?" neg":"")}, el("span",{class:"k",text:k}), el("b",{text:String(v)})))));
    const tb = el("tbody");
    s.personas.forEach(p=>{ const [txt,cls] = EST_HOY[p.estado]||[p.estado,""];
      tb.append(el("tr",{}, el("td",{text:p.nombre}), el("td",{}, el("span",{class:"pill "+cls,text: p.estado==="adentro" ? `Adentro desde ${p.pares.length?p.pares[p.pares.length-1].entrada:"?"}` : p.estado==="salio" ? `Salió ${p.ultima}` : txt}),
          p.revisar ? el("span",{class:"pill warn",text:"📡 revisar"}) : null, p.manualesPendientes ? el("span",{class:"pill warn",text:"✋ manual"}) : null),
        el("td",{class:"mono",text:paresTxt(p.pares)||"—"}), el("td",{class:"n",text:p.minutos?hm(p.minutos):"–"}),
        el("td",{}, p.abiertaAnterior ? el("span",{class:"pill warn",text:`Entrada abierta del ${fmtF(p.abiertaAnterior.fecha).slice(0,5)}`}) : null))); });
    if (!s.personas.length) tb.append(el("tr",{},el("td",{colspan:"5",class:"empty",text:"Sin personal que fiche en esta sucursal."})));
    card.append(el("div",{class:"tablewrap"}, el("table",{class:"compact"}, el("thead",{},el("tr",{}, ...["Persona","Estado","Entradas y salidas","Horas hoy",""].map((x,i)=>el("th",{class:i===3?"n":null,text:x})))), tb)));
    body.append(card);
  });
  body.append(el("p",{class:"hint",text:"«Sin fichaje» es una alerta para revisar, no una conclusión sobre la persona. Vacaciones aprobadas y feriados no cuentan como ausencia."}));
}
/* Rechazo con motivo obligatorio (la persona lo ve). Sirve para fichajes manuales y correcciones. */
function rechazarSolicitud(c, recargar){
  const mo = el("textarea",{maxlength:"300",placeholder:"Motivo del rechazo (lo va a ver la persona)","aria-label":"Motivo del rechazo"}), ok = el("button",{class:"btn danger",type:"button",text:"Rechazar"});
  const m = modal(el("div",{class:"grid"}, el("h2",{text:`Rechazar · ${c.nombre}`}), el("p",{class:"lead",text:`${c.clase==="manual"?"Fichaje manual":"Corrección"} de ${c.tipo||"entrada"} del ${fmtF(c.fecha)}.`}), mo,
    el("div",{class:"row"}, ok, el("button",{class:"btn",type:"button",text:"Cancelar",onclick:()=>m.cerrar()}))));
  ok.onclick = async ()=>{ if (mo.value.trim().length<3) return toast("Escribí el motivo del rechazo."); spinBtn(ok,"Guardando…");
    try{ await apiS("resolverCorreccion", c.id, false, mo.value); m.cerrar(); toast("Solicitud rechazada"); recargar(); }catch(e){ unspin(ok); toast(msgErr(e)); } };
  setTimeout(()=>mo.focus(),60);
}
/* Corrección de un jefe sobre un fichaje existente: hora + motivo obligatorio. Se conserva el original. */
function corregirHora(x, recargar){
  const h = el("input",{type:"time",value:(x.horaCorregida||x.hora||"09:00").slice(0,5),"aria-label":"Hora correcta"}), mo = el("input",{type:"text",maxlength:"300",placeholder:"Motivo (obligatorio)","aria-label":"Motivo"});
  const ok = el("button",{class:"btn primary",type:"button",text:"Guardar corrección"});
  const m = modal(el("div",{class:"grid"}, el("h2",{text:`Corregir ${x.tipo} · ${x.nombre}`}), el("p",{class:"lead",text:`${fmtF(x.fecha)} · registrada ${x.hora||"sin hora"}${x.horaCorregida?" · vigente "+x.horaCorregida:""}. Se conserva la hora original y queda quién y cuándo la corrigió.`}),
    el("div",{class:"grid2"}, el("label",{class:"f"},"Hora correcta",h), el("label",{class:"f"},"Motivo",mo)), el("div",{class:"row"}, ok, el("button",{class:"btn",type:"button",text:"Cancelar",onclick:()=>m.cerrar()}))));
  ok.onclick = async ()=>{ if (mo.value.trim().length<5) return toast("Escribí el motivo de la corrección."); spinBtn(ok,"Guardando…");
    try{ await apiS("corregirFichaje", x.id, h.value, mo.value); m.cerrar(); toast("✅ Corrección guardada"); recargar(); }catch(e){ unspin(ok); toast(msgErr(e)); } };
}
/* Carga de un fichaje faltante (p. ej. la salida de un día incompleto). */
function cargarFaltante(e, d, recargar){
  const ultima = (d.pares||[]).slice(-1)[0]||{}, tipo = el("select",{"aria-label":"Tipo"}, el("option",{value:"salida",text:"Salida",selected:!!ultima.entrada&&!ultima.salida}), el("option",{value:"entrada",text:"Entrada",selected:!ultima.entrada}));
  const h = el("input",{type:"time",value:"18:00","aria-label":"Hora"}), mo = el("input",{type:"text",maxlength:"300",placeholder:"Motivo (obligatorio)","aria-label":"Motivo"});
  const ok = el("button",{class:"btn primary",type:"button",text:"Cargar fichaje"});
  const m = modal(el("div",{class:"grid"}, el("h2",{text:`Completar el ${fmtF(d.fecha)} · ${e.nombre}`}), el("p",{class:"lead",text:`Registrado: ${paresTxt(d.pares)}. Cargá lo que falta; queda como fichaje manual hecho por vos, con el motivo.`}),
    el("div",{class:"grid2"}, el("label",{class:"f"},"Tipo",tipo), el("label",{class:"f"},"Hora",h)), el("label",{class:"f"},"Motivo",mo), el("div",{class:"row"}, ok, el("button",{class:"btn",type:"button",text:"Cancelar",onclick:()=>m.cerrar()}))));
  ok.onclick = async ()=>{ if (mo.value.trim().length<5) return toast("Escribí el motivo."); spinBtn(ok,"Guardando…");
    try{ await apiS("cargarFichajeJefe", e.uid, d.fecha, tipo.value, h.value, mo.value); m.cerrar(); toast("✅ Fichaje cargado"); recargar(); }catch(x){ unspin(ok); toast(msgErr(x)); } };
}
async function vPendientesFich(body){
  body.append(el("div",{class:"card empty"}, el("span",{class:"spin"})," Cargando pendientes…"));
  let D; try{ D = await apiS("listarIngresos", diasAtras(60), hoy()); }catch(e){ body.textContent=""; return body.append(el("div",{class:"card notice bad",text:msgErr(e)})); }
  body.textContent="";
  const recargar = ()=>{ body.textContent=""; vPendientesFich(body); };
  const pend = D.correcciones.filter(c=>c.estado==="pendiente").sort((a,b)=>a.creado.localeCompare(b.creado));
  const man = pend.filter(c=>c.clase==="manual"), cor = pend.filter(c=>c.clase!=="manual");
  const GEOM = {fuera:"fuera del radio", precision:"GPS poco preciso", sin_permiso:"sin permiso de ubicación", no_disponible:"sin ubicación", tiempo_agotado:"sin ubicación", sucursal_incompleta:"sucursal sin ubicación cargada", dentro:"dentro del radio"};
  const tarjeta = c => el("div",{class:"persona"},
    el("div",{class:"pinfo"}, el("b",{text:`${c.nombre} · ${c.clase==="manual"?"fichaje manual":"corrección"} de ${c.tipo||"entrada"}`}),
      el("span",{class:"mono",text: c.clase==="manual" ? `${fmtF(c.fecha)} ${String(c.horaSolicitada||c.horaPropuesta).slice(0,5)} (hora del servidor al pedirlo) · ${c.sucursal||""}` : `${fmtF(c.fecha)} · ${(c.horaOriginal||"sin registro").slice(0,5)} → ${c.horaPropuesta}`}),
      el("span",{text:"Motivo: "+c.motivo}),
      c.clase==="manual" ? el("span",{class:"hint",text:`Ubicación del intento: ${GEOM[c.geoMotivo]||c.geoMotivo||"—"}${c.distancia!=null?" · a "+c.distancia+" m":""}${c.precision!=null?" · ±"+c.precision+" m":""}${c.geo?" · lat "+c.geo.lat+", long "+c.geo.lng:""}`}) : null,
      el("span",{class:"hint",text:"Pedido el "+new Date(c.creado).toLocaleString("es-AR")})),
    el("div",{class:"row"}, el("button",{class:"btn sm primary",type:"button",text:"✔ Aprobar",onclick:async e=>{ const b=e.currentTarget; spinBtn(b); try{ await apiS("resolverCorreccion", c.id, true, ""); toast("✅ Aprobado"); recargar(); }catch(x){ unspin(b); toast(msgErr(x)); } }}),
      el("button",{class:"btn sm danger",type:"button",text:"✖ Rechazar",onclick:()=>rechazarSolicitud(c, recargar)})));
  body.append(el("div",{class:"card"}, el("h2",{text:`✋ Fichajes manuales pendientes (${man.length})`}),
    el("p",{class:"lead",text:"Se piden cuando la ubicación no valida. Al aprobar, queda registrado con la hora del servidor del momento del pedido."}),
    man.length ? el("div",{class:"plist"}, man.map(tarjeta)) : el("div",{class:"empty",text:"Sin fichajes manuales pendientes."})));
  body.append(el("div",{class:"card"}, el("h2",{text:`✎ Correcciones pendientes (${cor.length})`}),
    cor.length ? el("div",{class:"plist"}, cor.map(tarjeta)) : el("div",{class:"empty",text:"Sin correcciones pendientes."})));
  if (D.incompletos && D.incompletos.length) body.append(el("div",{class:"card"}, el("h2",{text:`Días incompletos (últimos 60 días): ${D.incompletos.length}`}),
    el("p",{class:"lead",text:"Entrada sin salida u orden roto: no se suman a las horas hasta corregirlos. Se completan desde la pestaña Horas."}),
    el("ul",{class:"lista-avisos"}, D.incompletos.slice(0,30).map(j=>el("li",{text:`${fmtF(j.fecha)} · ${j.nombre} · ${paresTxt(j.pares)}`})))));
}
async function vHorasJefes(body){
  const de = el("input",{type:"date",value:hoy().slice(0,8)+"01"}), ha = el("input",{type:"date",value:hoy(),max:hoy()});
  const su = el("select",{}, el("option",{value:"",text:"Todas las sucursales"})), em = el("select",{}, el("option",{value:"",text:"Todo el personal"}));
  const res = el("div",{class:"stack"});
  let R = null, cargados = false;
  const cargar = async ()=>{ res.textContent=""; res.append(el("div",{class:"card empty"}, el("span",{class:"spin"})," Calculando horas…"));
    try{ R = await apiS("resumenHoras", {desde:de.value, hasta:ha.value, sucursal:su.value||null, uid:em.value||null}); }catch(e){ res.textContent=""; return res.append(el("div",{class:"card notice bad",text:msgErr(e)})); }
    if (!cargados){ cargados=true; R.sucursales.forEach(n=>su.append(el("option",{value:n,text:n}))); R.empleados.forEach(x=>em.append(el("option",{value:x.uid,text:x.nombre+" · "+x.sucursal}))); }
    pintar(); };
  const pintar = ()=>{ res.textContent="";
    if (!R.empleados.length) return res.append(el("div",{class:"card empty",text:"Sin personal que fiche con estos filtros."}));
    // Resumen general
    const tb = el("tbody");
    R.empleados.forEach(x=>tb.append(el("tr",{}, el("td",{text:x.nombre}), el("td",{text:x.sucursal}), el("td",{class:"n",text:String(x.diasTrabajados)}), el("td",{class:"n",text:hm(x.total)}),
      el("td",{class:"n",text:x.promedio==null?"–":hm(x.promedio)}), el("td",{class:"n",text:x.esperado==null?"–":hm(x.esperado)}), el("td",{class:"n "+(x.diferencia<0?"neg":""),text:difTxt(x.diferencia)}),
      el("td",{}, x.incompletos?el("span",{class:"pill warn",text:x.incompletos+" incompl."}):null, x.sinFichaje?el("span",{class:"pill bad",text:x.sinFichaje+" sin fichaje"}):null, x.revisar?el("span",{class:"pill warn",text:x.revisar+" revisar"}):null))));
    res.append(el("div",{class:"card"}, el("h2",{text:`Resumen del ${fmtF(R.desde)} al ${fmtF(R.hasta)}`}),
      el("div",{class:"tablewrap"}, el("table",{}, el("thead",{},el("tr",{}, ...["Persona","Sucursal","Días","Total","Promedio","Esperado","Diferencia","Revisar"].map((x,i)=>el("th",{class:i>=2&&i<=6?"n":null,text:x})))), tb)),
      el("p",{class:"hint",text:"Vacaciones aprobadas y feriados no cuentan como ausencia. La diferencia con lo esperado es informativa: no calcula pagos ni horas extra legales."+(R.redondeo>1?` Redondeo: ${R.redondeo} min por día.`:"")})));
    R.empleados.forEach(x=>res.append(el("details",{class:"card"}, el("summary",{}, el("b",{text:x.nombre}), ` · ${x.sucursal} · ${hm(x.total)} h`), tablaHorasEmpleado(x, R, true, (e,d)=>cargarFaltante(e, d, cargar)))));
  };
  const bx = el("button",{class:"btn primary",type:"button",text:"⬆️ Exportar a la planilla (hoja «Horas»)"});
  bx.onclick = async ()=>{ spinBtn(bx,"Exportando…"); try{ const r = await apiS("exportarHoras", {desde:de.value, hasta:ha.value, sucursal:su.value||null, uid:em.value||null});
      modal(el("div",{class:"grid"}, el("h2",{text:"✅ Exportado a la hoja «Horas»"}), el("p",{class:"lead",text:`${r.empleados} persona(s) · ${r.filas} filas. La hoja se reemplaza en cada exportación (queda registrado en el historial).`}),
        /^https:\/\/docs\.google\.com\//.test(r.url) ? el("a",{class:"btn primary",href:r.url,target:"_blank",rel:"noopener",text:"Abrir la planilla"}) : null));
    }catch(e){ toast(msgErr(e)); } finally{ unspin(bx); } };
  [de,ha,su,em].forEach(x=>x.onchange=cargar);
  body.append(el("div",{class:"card filters"}, el("div",{class:"grid2"}, el("label",{class:"f"},"Desde",de), el("label",{class:"f"},"Hasta",ha), el("label",{class:"f"},"Sucursal",su), el("label",{class:"f"},"Empleado",em)),
    el("div",{class:"row"}, el("button",{class:"btn",type:"button",text:"↻ Actualizar",onclick:cargar}), bx)), res);
  cargar();
}
async function vSucursales(body){
  body.append(el("div",{class:"card empty"}, el("span",{class:"spin"})," Cargando sucursales…"));
  let L; try{ L = await apiS("listarSucursales"); }catch(e){ body.textContent=""; return body.append(el("div",{class:"card notice bad",text:msgErr(e)})); }
  body.textContent="";
  body.append(el("div",{class:"card notice",text:"📄 Estos datos están en la hoja «Sucursales» de la planilla: podés editarlos acá o directamente en la hoja (latitud, longitud, radio en metros, días de apertura como «mié, jue, vie, sáb» o «lun a sáb», y Activa Sí/No). Si falta un dato, nadie de esa sucursal puede fichar con ubicación y la app lo avisa."}));
  const form = (s) => {
    const n = el("input",{type:"text",maxlength:"40",value:s?s.nombre:"",placeholder:"Nombre (ej.: Lima)","aria-label":"Nombre"}), di = el("input",{type:"text",maxlength:"120",value:s?s.direccion:"",placeholder:"Dirección","aria-label":"Dirección"});
    const la = el("input",{type:"text",inputmode:"decimal",value:s&&s.lat!=null?String(s.lat):"",placeholder:"-34.6210674","aria-label":"Latitud"}), lo = el("input",{type:"text",inputmode:"decimal",value:s&&s.lng!=null?String(s.lng):"",placeholder:"-58.3817634","aria-label":"Longitud"});
    const ra = el("input",{type:"number",min:"10",max:"2000",value:s&&s.radio!=null?s.radio:100,"aria-label":"Radio en metros"}), dd = el("input",{type:"text",maxlength:"60",value:s&&s.diasPropios?s.diasTxt:"",placeholder:"mié, jue, vie, sáb (vacío = los generales)","aria-label":"Días de apertura"});
    const ac = el("input",{type:"checkbox",checked:!s||s.activa});
    const b = el("button",{class:"btn primary",type:"button",text:s?"Guardar cambios":"➕ Agregar sucursal"});
    b.onclick = async ()=>{ spinBtn(b,"Guardando…"); try{ await apiS("guardarSucursal", {fila:s?s.fila:null, nombre:n.value, direccion:di.value, lat:la.value, lng:lo.value, radio:ra.value, dias:dd.value, activa:ac.checked}); toast("✅ Sucursal guardada"); body.textContent=""; vSucursales(body); }catch(e){ unspin(b); toast(msgErr(e)); } };
    const aqui = el("button",{class:"btn",type:"button",text:"📡 Usar mi ubicación actual",onclick:async e=>{ const bt=e.currentTarget; spinBtn(bt,"Ubicando…"); const g = await ubicacion(); unspin(bt);
      if (g.error) return toast("No se pudo obtener la ubicación ("+g.error.replace("_"," ")+")."); la.value=g.lat.toFixed(7); lo.value=g.lng.toFixed(7); toast(`Ubicación tomada (precisión ±${Math.round(g.acc)} m). Revisá y tocá Guardar.`); }});
    return el("div",{class:"grid"}, el("div",{class:"grid2"}, el("label",{class:"f"},"Nombre",n), el("label",{class:"f"},"Dirección",di), el("label",{class:"f"},"Latitud",la), el("label",{class:"f"},"Longitud",lo),
        el("label",{class:"f"},"Radio (metros)",ra), el("label",{class:"f"},"Días de apertura",dd)), el("label",{class:"chk"},ac," Activa"),
      el("div",{class:"row"}, aqui, b), el("p",{class:"hint",text:"Para tomar la ubicación con el teléfono, parate adentro del local. Editar sucursales pide tu PIN y queda en el historial."}));
  };
  L.forEach(s=>body.append(el("details",{class:"card",open:s.incompleta.length>0},
    el("summary",{}, el("b",{text:"🏬 "+s.nombre}), " ", s.incompleta.length ? el("span",{class:"pill bad",text:"Incompleta"}) : el("span",{class:"pill ok",text:"Completa"}), !s.activa ? el("span",{class:"pill",text:"Inactiva"}) : null,
      el("span",{class:"hint",text:` · radio ${s.radio??"?"} m · ${s.diasTxt} · ${s.personas} persona(s)`})),
    s.incompleta.length ? el("div",{class:"notice bad",text:"Falta: "+s.incompleta.join(", ")+". Hasta completarlo, nadie de esta sucursal puede fichar con ubicación."}) : null,
    ...s.avisos.map(a=>el("p",{class:"hint",text:"ℹ️ "+a})), form(s))));
  body.append(el("details",{class:"card"}, el("summary",{}, el("b",{text:"➕ Agregar una sucursal"})), form(null)));
}
/* ===================== Auditoría (se conserva el flujo existente; fotos por punto y acciones correctivas) ===================== */
const MAX_FOTOS = 12;
function vAuditoria(main){
  const items = [];
  if (tiene("auditar")) items.push(["auditar","📝 Auditar"]);
  if (tiene("auditoria")) items.push(["registro","🗂️ Registro"], ["indicadores","📊 Indicadores"]);
  if (tiene("acciones")) items.push(["acciones","🛠️ Acciones correctivas"]);
  tabs(main, items, null, (id, body)=>({auditar:vAuditar, registro:vRegistroAud, indicadores:vKpiAud, acciones:vAcciones})[id](body));
}
async function asegurarRegistro(force){
  if (S.lista.length && !force) return;
  const r = await apiS("getRegistro");   // trae también las acciones correctivas (una sola llamada)
  S.lista = (r.lista||[]).sort((a,b)=>(b.fecha||"").localeCompare(a.fecha||"")||(b.creado||"").localeCompare(a.creado||""));
  S.params = {...DEF,...r.params};
  if (tiene("acciones")) S.acciones = Array.isArray(r.acciones) ? r.acciones : [];
}

/* ----- Auditar ----- */
function blankForm(){ const f={puntajes:{},coment:{},inf:{}}; PUNTOS.forEach(p=>{f.inf[p.k]=0;}); return f; }
function calc(f=S.form){
  const vals = PUNTOS.map(p=>f.puntajes[p.k]).filter(v=>v);
  const prom = vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
  const tot = PUNTOS.reduce((a,p)=>a+(f.inf[p.k]||0),0);
  return {n:vals.length, prom, tot, completo: vals.length===PUNTOS.length};
}
function saveDraft(){ lsSet("hb_draft3",{form:S.form, fecha:$("f-fecha")&&$("f-fecha").value, dias:$("f-dias")&&$("f-dias").value, gen:$("f-general")&&$("f-general").value}); }
function vAuditar(body){
  const d = lsGet("hb_draft3");
  S.form = d && d.form ? d.form : blankForm(); S.fotos = S.fotos || [];
  const fecha = el("input",{type:"date",id:"f-fecha",value:(d&&d.fecha)||hoy(),max:hoy()});
  const dias = el("input",{type:"number",id:"f-dias",min:"0",max:"999",inputmode:"numeric",placeholder:"Ej.: 3",value:(d&&d.dias)||""});
  const gen = el("textarea",{id:"f-general",maxlength:"600",placeholder:"Observaciones generales, recomendaciones y mensaje para el equipo"}); gen.value=(d&&d.gen)||"";
  [fecha,dias,gen].forEach(x=>x.addEventListener("input",saveDraft));
  const puntos = el("div",{class:"puntos",id:"puntos"});
  const generales = el("div",{class:"fotos",id:"fotos-general"});
  const bar = el("div",{class:"resultbar",id:"resultbar"},
    el("div",{}, el("div",{class:"big",id:"r-prom"},"–",el("small",{text:" / 5"})), el("div",{class:"rlabel",id:"r-label",text:"⏳ Falta completar"})),
    el("span",{class:"pill",id:"r-inf",hidden:true}), el("div",{class:"meter"},el("i",{id:"r-meter"})), el("span",{class:"mono",id:"r-count",style:"font-size:12px"}),
    el("button",{class:"btn primary",type:"button",id:"btn-enviar",text:"✔ Validar y enviar",onclick:enviar}));
  body.append(
    el("div",{class:"card"}, el("h2",{text:"Nueva auditoría · Palermo"}), el("p",{class:"lead",text:`Auditor: ${S.user.nombre} (queda registrado con tu usuario).`}),
      el("div",{class:"grid2"}, el("label",{class:"f"},"📅 Fecha",fecha), el("label",{class:"f"},"📦 Días del pedido más viejo sin retirar",dias))),
    puntos,
    el("div",{class:"card"}, el("h3",{text:"💬 Comentario general"}), gen, el("h3",{style:"margin-top:14px",text:"📷 Fotos generales"}), generales),
    el("div",{id:"sent",hidden:true}), bar);
  buildPuntos(); renderFotos(); onChange();
}
function buildPuntos(){
  const box=$("puntos"); box.textContent="";
  PUNTOS.forEach((p,i)=>{
    const card = el("div",{class:"punto","data-s":S.form.puntajes[p.k]||null});
    const sc = el("div",{class:"score",role:"group","aria-label":"Puntaje "+p.l});
    for (let v=1; v<=5; v++) sc.append(el("button",{type:"button","data-v":v,"aria-pressed":S.form.puntajes[p.k]===v?"true":"false",
      onclick:()=>{ S.form.puntajes[p.k]=v; card.setAttribute("data-s",v); [...sc.children].forEach(b=>b.setAttribute("aria-pressed", b.dataset.v==v?"true":"false")); onChange(); }},
      el("span",{class:"n",text:EMO[v]+" "+v}), el("span",{class:"t",text:ETIQ[v]})));
    const com = el("input",{type:"text",maxlength:"200",placeholder:"💬 Observación (opcional)",value:S.form.coment[p.k]||"","aria-label":"Observación "+p.l, oninput:e=>{S.form.coment[p.k]=e.target.value; saveDraft();}});
    const num = el("input",{type:"number",min:"0",max:"999",inputmode:"numeric",value:S.form.inf[p.k]||0,"aria-label":"Infracciones "+p.inf, oninput:e=>{S.form.inf[p.k]=Math.max(0,parseInt(e.target.value)||0); onChange();}});
    const step = d => { num.value = Math.max(0,(parseInt(num.value)||0)+d); num.dispatchEvent(new Event("input")); };
    card.append(
      el("div",{class:"punto-head"}, el("b",{}, el("span",{class:"em",text:p.e}), p.l), el("span",{class:"idx",text:(i+1)+"/7"})), sc,
      el("div",{class:"punto-extra"}, com, el("div",{class:"inf"}, el("div",{class:"stepper"}, el("button",{type:"button","aria-label":"Restar",onclick:()=>step(-1),text:"−"}), num, el("button",{type:"button","aria-label":"Sumar",onclick:()=>step(1),text:"+"})), el("span",{text:"Infracciones"}))),
      el("div",{class:"fotos","data-punto":p.k}));
    box.append(card);
  });
}
function renderFotos(){
  document.querySelectorAll(".fotos[data-punto], #fotos-general").forEach(b=>b.textContent="");
  const cont = k => k==="general" ? $("fotos-general") : document.querySelector(`.fotos[data-punto="${k}"]`);
  S.fotos.forEach((f,i)=>{ const c=cont(f.punto); if (c) c.append(el("div",{class:"foto"}, el("img",{src:f.data,alt:"Evidencia"}), el("button",{type:"button","aria-label":"Quitar foto",text:"×",onclick:()=>{S.fotos.splice(i,1);renderFotos();}}))); });
  ["general",...PUNTOS.map(p=>p.k)].forEach(k=>{ const c=cont(k); if (c && S.fotos.length<MAX_FOTOS) c.append(el("button",{class:"addfoto",type:"button",text:"📷 Foto",onclick:async()=>{ const d=await elegirFoto(false); if(d){ S.fotos.push({punto:k,data:d}); renderFotos(); } }})); });
}
function onChange(){
  if (!$("r-prom")) return;
  const c = calc();
  $("r-prom").firstChild.textContent = c.prom==null?"–":fmt1(c.prom);
  const r = c.completo ? resAud(c.prom) : null;
  $("resultbar").setAttribute("data-r", r||"");
  $("r-label").textContent = r ? REMO[r]+" "+r : "⏳ Falta completar";
  const ip=$("r-inf"); ip.hidden = c.tot===0 && !c.completo; const rc=resChk(c.tot); ip.className="pill "+cls(rc); ip.textContent="Checklist: "+c.tot+" infracc. · "+rc;
  $("r-meter").style.width = (c.n/PUNTOS.length*100)+"%";
  $("r-count").textContent = c.n+" de "+PUNTOS.length;
  $("btn-enviar").disabled = !c.completo;
  saveDraft();
}
function mensaje(rec){
  const p=S.params;
  let m = `Equipo Palermo: auditoría del ${fmtF(rec.fecha)} realizada por ${rec.auditor}. Puntaje promedio: ${fmt1(rec.promedio)} de 5. `;
  m += (rec.resultado==="Excelente"?p.mExc:rec.resultado==="Advertencia"?p.mAdv:p.mRec)||"";
  const flojos = PUNTOS.filter(x=>rec.puntajes[x.k]<=2).map(x=>`${x.l} (${rec.puntajes[x.k]})`);
  if (flojos.length) m += `\nPuntos a corregir: ${flojos.join(", ")}.`;
  const infs = PUNTOS.filter(x=>rec.infracciones && rec.infracciones[x.k]>0).map(x=>`${x.inf.toLowerCase()}: ${rec.infracciones[x.k]}`);
  if (infs.length) m += `\nSe detectaron ${rec.totalInfracciones} infracciones (${infs.join(", ")}).`;
  if (rec.diasPedido!=null && rec.diasPedido>p.diasMax) m += `\nHay un pedido con ${rec.diasPedido} días sin retirar (límite ${p.diasMax}): avisar y gestionar hoy.`;
  if (rec.comentarioGeneral) m += `\nComentario: ${rec.comentarioGeneral}`;
  return m;
}
async function enviar(){
  const c=calc(); if (!c.completo) return;
  const btn=$("btn-enviar"); spinBtn(btn,"Enviando…");
  const data = { fecha:$("f-fecha").value||hoy(), puntajes:{...S.form.puntajes}, infracciones:{...S.form.inf}, comentarios:{...S.form.coment}, diasPedido:$("f-dias").value, comentarioGeneral:$("f-general").value };
  const enviadas = S.fotos.length;
  try {
    const rec = await apiS("guardarAuditoria", data, S.fotos.map(f=>({punto:f.punto,data:f.data})));
    const guardadas = (rec.fotos||[]).length;
    const sent=$("sent"); sent.textContent="";
    sent.append(el("div",{class:"card"}, el("div",{class:"sent-head"}, el("span",{class:"em",text:REMO[rec.resultado]}), el("div",{}, el("h2",{text:"Auditoría registrada"}), el("p",{class:"lead",style:"margin:0",text:`${fmtF(rec.fecha)} · ${rec.auditor} · ${fmt1(rec.promedio)} / 5 · ${rec.resultado}`}))),
      el("div",{class:"notice "+(guardadas===enviadas?"ok":"warn"),text: guardadas===enviadas ? `📷 ${guardadas} foto(s) guardada(s) y asociadas a su punto.` : `⚠️ Se guardaron ${guardadas} de ${enviadas} fotos. Las que no eran imágenes válidas se descartaron.`}),
      el("div",{class:"msgbox",text:mensaje(rec)}), el("div",{class:"row"}, el("button",{class:"btn",type:"button",text:"📋 Copiar mensaje para el equipo",onclick:()=>copiar(mensaje(rec),"Mensaje copiado")}))));
    sent.hidden=false;
    try{ localStorage.removeItem("hb_draft3"); }catch(e){}
    S.form=blankForm(); S.fotos=[]; $("f-dias").value=""; $("f-general").value=""; $("f-fecha").value=hoy(); buildPuntos(); renderFotos();
    S.lista.unshift(rec); sent.scrollIntoView({behavior:"smooth",block:"start"}); toast("✅ Auditoría registrada");
  } catch(e){ toast("No se pudo enviar: "+msgErr(e)+" El borrador quedó guardado (las fotos no)."); }
  finally { unspin(btn); onChange(); }
}

/* ----- Registro de auditorías ----- */
function filtReg(){
  const d=$("rf-desde")?.value, h=$("rf-hasta")?.value, r=$("rf-res")?.value, q=($("rf-q")?.value||"").trim().toLowerCase();
  return S.lista.filter(a=>(!d||a.fecha>=d)&&(!h||a.fecha<=h)&&(!r||a.resultado===r)&&
    (!q || (a.auditor||"").toLowerCase().includes(q) || (a.comentarioGeneral||"").toLowerCase().includes(q) || Object.values(a.comentarios||{}).some(c=>String(c).toLowerCase().includes(q))));
}
async function vRegistroAud(body){
  body.append(el("div",{class:"card empty"}, el("span",{class:"spin"})," Cargando registro…"));
  try{ await asegurarRegistro(true); }catch(e){ body.textContent=""; return body.append(el("div",{class:"card notice bad",text:msgErr(e)})); }
  body.textContent="";
  const res = el("select",{id:"rf-res"}, el("option",{value:"",text:"Todos"}), ...["Excelente","Advertencia","Reclamo"].map(r=>el("option",{value:r,text:REMO[r]+" "+r})));
  const tb = el("tbody",{id:"reg-body"}), lead = el("p",{class:"lead",id:"reg-lead"});
  const filtros = el("div",{class:"grid2"}, el("label",{class:"f"},"Desde",el("input",{type:"date",id:"rf-desde"})), el("label",{class:"f"},"Hasta",el("input",{type:"date",id:"rf-hasta"})),
    el("label",{class:"f"},"Resultado",res), el("label",{class:"f"},"Buscar",el("input",{type:"search",id:"rf-q",placeholder:"Auditor o comentario"})));
  filtros.addEventListener("input",()=>pintarReg()); filtros.addEventListener("change",()=>pintarReg());
  body.append(el("div",{class:"card"}, el("h2",{text:"Registro de auditorías"}), lead, filtros,
      el("div",{class:"row",style:"margin-top:10px"}, el("button",{class:"btn xl",type:"button",text:"⬇️ Excel",onclick:exportXLSX}), el("button",{class:"btn pdf",type:"button",text:"⬇️ PDF",onclick:exportPDF}),
        el("button",{class:"btn",type:"button",text:"📄 Abrir planilla",onclick:async()=>{ try{ const u=await apiS("hojaUrl"); if (/^https:\/\/docs\.google\.com\//.test(u)) window.open(u,"_blank","noopener"); }catch(e){ toast(msgErr(e)); } }}),
        el("button",{class:"btn",type:"button",text:"↻ Actualizar",onclick:async()=>{ await asegurarRegistro(true); pintarReg(); toast("Registro actualizado"); }}),
        el("span",{class:"mono",id:"exp-status",style:"font-size:12px;color:var(--muted)"})),
      el("div",{class:"tablewrap",style:"margin-top:12px"}, el("table",{}, el("thead",{},el("tr",{}, ...["Fecha","Auditor","Prom.","Resultado","Infr.","Checklist","Días ped.","📷"].map((x,i)=>el("th",{class:[2,4,6].includes(i)?"n":null,text:x})))), tb))),
    el("div",{class:"card detcard",id:"reg-det",hidden:true}),
    vaciarCard());
  pintarReg();
}
function pintarReg(){
  const rows = filtReg(), tb=$("reg-body"); if (!tb) return; tb.textContent="";
  $("reg-lead").textContent = `${rows.length} auditoría${rows.length===1?"":"s"} · tocá una fila para ver puntos, observaciones, fotos y acciones`;
  if (!rows.length){ tb.append(el("tr",{},el("td",{colspan:"8",class:"empty",text: S.lista.length? "Ninguna auditoría coincide con los filtros." : "Todavía no hay auditorías."}))); return; }
  rows.forEach(a=>{
    const open=S.openRow===a.id, tog=()=>{S.openRow=open?null:a.id;pintarReg();};
    tb.append(el("tr",{class:"clk"+(open?" sel":""),tabindex:"0",onclick:()=>{ tog(); if(!open) setTimeout(()=>$("reg-det").scrollIntoView({behavior:"smooth",block:"start"}),30); },onkeydown:e=>{if(e.key==="Enter")tog();}},
      el("td",{class:"mono",text:fmtF(a.fecha)}), el("td",{text:a.auditor}), el("td",{class:"n"},el("b",{text:fmt1(a.promedio)})),
      el("td",{},el("span",{class:"pill "+cls(a.resultado),text:(REMO[a.resultado]||"")+" "+a.resultado})), el("td",{class:"n",text:a.totalInfracciones??0}),
      el("td",{},a.resultadoChecklist?el("span",{class:"pill "+cls(a.resultadoChecklist),text:a.resultadoChecklist}):null),
      el("td",{class:"n",style:a.pedidoFueraDePlazo?"color:var(--bad);font-weight:700":null,text:a.diasPedido??"–"}), el("td",{text:(a.fotos||[]).length||""})));
  });
  const det=$("reg-det"); det.textContent="";
  const sel = rows.find(a=>a.id===S.openRow);
  if (sel){ det.append(el("div",{class:"row"}, el("h3",{style:"margin:0",text:`Detalle · ${fmtF(sel.fecha)} · ${sel.auditor}`}), el("span",{class:"spacer"}), el("button",{class:"btn sm",type:"button",text:"Cerrar detalle",onclick:()=>{S.openRow=null;pintarReg();}})), detalleAud(sel)); det.hidden=false; }
  else det.hidden=true;
}
function detalleAud(a){
  const fotosDe = k => (a.fotos||[]).map((id,i)=>({id, punto:(a.fotoPuntos||[])[i]||"general"})).filter(f=>f.punto===k);
  const acc = (S.acciones||[]).filter(x=>x.auditId===a.id);
  const g = el("div",{class:"dpuntos"});
  PUNTOS.forEach(p=>{ const v=a.puntajes?.[p.k], fs=fotosDe(p.k), ac=acc.filter(x=>x.punto===p.k);
    g.append(el("div",{class:"dpunto"}, el("div",{class:"row",style:"gap:8px"}, scChip(v), el("b",{text:p.e+" "+p.l})),
      (a.infracciones?.[p.k]>0)? el("div",{style:"color:var(--bad);font-size:13px",text:a.infracciones[p.k]+" infracciones"}):null,
      a.comentarios?.[p.k]? el("div",{class:"obs",text:"💬 "+a.comentarios[p.k]}):null,
      fs.length ? el("div",{class:"fotos"}, fs.map((f,i)=>miniFoto("getFoto", f.id, `${p.l} · ${fmtF(a.fecha)} · foto ${i+1}`))) : null,
      ac.map(x=>el("div",{class:"accmini"}, el("span",{class:"pill "+(x.estado==="resuelta"?"ok":x.vence&&x.vence<hoy()?"bad":"warn"),text:x.estado}), " ", x.descripcion, x.vence?` · vence ${fmtF(x.vence)}`:"", x.responsable?` · ${x.responsable}`:""))));
  });
  const box = el("div",{class:"dl"}, el("div",{class:"row"}, el("span",{text:`📅 ${fmtF(a.fecha)} · 👤 ${a.auditor}`}), el("span",{class:"spacer"}), el("span",{class:"mono hint",text:a.creado?"Cargada "+new Date(a.creado).toLocaleString("es-AR"):""})), g);
  const gen = fotosDe("general");
  if (a.comentarioGeneral) box.append(el("div",{},el("b",{text:"💬 Comentario general: "}),a.comentarioGeneral));
  if (gen.length) box.append(el("div",{}, el("b",{text:"📷 Fotos generales"}), el("div",{class:"fotos"}, gen.map((f,i)=>miniFoto("getFoto", f.id, `General · ${fmtF(a.fecha)} · foto ${i+1}`)))));
  const sueltas = acc.filter(x=>!PUNTOS.some(p=>p.k===x.punto));
  if (sueltas.length) box.append(el("div",{}, el("b",{text:"🛠️ Acciones correctivas"}), sueltas.map(x=>el("div",{class:"accmini",text:`${x.estado} · ${x.descripcion}`}))));
  const msg = mensaje(a);
  box.append(el("div",{class:"row"},
    el("button",{class:"btn sm",type:"button",text:"📋 Copiar mensaje",onclick:e=>{e.stopPropagation(); copiar(msg,"Mensaje copiado");}}),
    tiene("acciones") ? el("button",{class:"btn sm",type:"button",text:"➕ Acción correctiva",onclick:e=>{e.stopPropagation(); nuevaAccion(a);}}) : null,
    el("span",{class:"spacer"}),
    el("button",{class:"btn sm danger",type:"button",text:"🗑 Eliminar",onclick:async e=>{ e.stopPropagation();
      if (!await confirmar("¿Eliminar esta auditoría? Sus fotos van a la papelera de Drive y queda registrado en el historial.","Eliminar",true)) return;
      try{ await apiS("eliminarAuditoria",a.id); S.lista=S.lista.filter(x=>x.id!==a.id); S.openRow=null; pintarReg(); toast("Auditoría eliminada"); }catch(err){ toast(msgErr(err)); } }})));
  return box;
}
function nuevaAccion(a){
  const punto = el("select",{}, el("option",{value:"general",text:"General"}), ...PUNTOS.map(p=>el("option",{value:p.k,text:p.e+" "+p.l,selected:a.puntajes&&a.puntajes[p.k]<=2})));
  const d = el("textarea",{maxlength:"300",placeholder:"Qué hay que corregir"}), r = el("input",{type:"text",maxlength:"60",placeholder:"Responsable"}), v = el("input",{type:"date",min:hoy()});
  const ok = el("button",{class:"btn primary",type:"button",text:"Crear acción"});
  const m = modal(el("div",{class:"grid"}, el("h2",{text:"Acción correctiva · auditoría "+fmtF(a.fecha)}), el("label",{class:"f"},"Punto",punto), el("label",{class:"f"},"Acción",d),
    el("div",{class:"grid2"}, el("label",{class:"f"},"Responsable",r), el("label",{class:"f"},"Fecha límite",v)), el("div",{class:"row"}, ok, el("button",{class:"btn",type:"button",text:"Cancelar",onclick:()=>m.cerrar()}))));
  ok.onclick = async ()=>{ spinBtn(ok); try{ const x = await apiS("crearAccion",{auditId:a.id,punto:punto.value,descripcion:d.value,responsable:r.value,vence:v.value}); S.acciones.push(x); m.cerrar(); pintarReg(); toast("✅ Acción creada"); }catch(e){ unspin(ok); toast(msgErr(e)); } };
}
function vaciarCard(){
  const box = el("div",{class:"card"}, el("h3",{text:"🧹 Vaciar registro de auditorías"}),
    el("p",{class:"lead",text:"Antes de vaciar se crea una copia de respaldo en Drive. Las fotos se conservan y la acción queda en el historial. Requiere confirmar tu PIN."}));
  box.append(el("button",{class:"btn danger",type:"button",text:"Vaciar con respaldo",onclick:async()=>{
    if (!await confirmar(`¿Vaciar ${S.lista.length} auditorías? Se guarda un respaldo antes.`,"Vaciar",true)) return;
    try{ const r = await apiS("vaciarRegistro"); S.lista=[]; pintarReg(); const ok=el("div",{class:"notice ok"},`Se vaciaron ${r.borradas} auditorías. `);
      if (r.respaldo && /^https:\/\/docs\.google\.com\//.test(r.respaldo)) ok.append(el("a",{href:r.respaldo,target:"_blank",rel:"noopener",text:"Abrir el respaldo"})); box.append(ok); }
    catch(e){ toast(msgErr(e)); } }}));
  return box;
}

/* ----- Indicadores de auditoría (los existentes) ----- */
async function vKpiAud(body){
  body.append(el("div",{class:"card empty"}, el("span",{class:"spin"})," Cargando…"));
  try{ await asegurarRegistro(); }catch(e){ body.textContent=""; return body.append(el("div",{class:"card notice bad",text:msgErr(e)})); }
  body.textContent="";
  const per = el("select",{id:"kf-per"}, el("option",{value:"30",text:"Últimos 30 días"}), el("option",{value:"90",text:"Últimos 90 días"}), el("option",{value:"365",text:"Último año"}), el("option",{value:"",text:"Todo",selected:true}));
  per.onchange = renderKPI;
  body.append(el("div",{class:"card row"}, el("label",{class:"f"},"Período",per), el("p",{class:"lead",id:"kpi-lead",style:"margin:0"})), el("div",{class:"stack",id:"kpi-body"}));
  renderKPI();
}

/* ----- Acciones correctivas ----- */
async function vAcciones(body){
  let L; try{ L = await apiS("listarAcciones"); S.acciones=L; }catch(e){ return body.append(el("div",{class:"card notice bad",text:msgErr(e)})); }
  const tb = el("tbody");
  const pintar = ()=>{ tb.textContent="";
    L.slice().sort((a,b)=>(a.estado==="resuelta"||a.estado==="descartada"?1:0)-(b.estado==="resuelta"||b.estado==="descartada"?1:0)||(a.vence||"9").localeCompare(b.vence||"9")).forEach(x=>{
      const venc = x.vence && x.vence<hoy() && (x.estado==="abierta"||x.estado==="en_curso");
      const sel = el("select",{"aria-label":"Estado"}, ...["abierta","en_curso","resuelta","descartada"].map(v=>el("option",{value:v,text:v,selected:x.estado===v})));
      sel.onchange = async ()=>{ let foto=null; if (sel.value==="resuelta" && await confirmar("¿Agregar una foto como evidencia de la resolución?","Sacar foto")) foto = await elegirFoto(false);
        try{ const n = await apiS("actualizarAccion", x.id, sel.value, "", foto); Object.assign(x,n); pintar(); toast("Acción actualizada"); }catch(e){ toast(msgErr(e)); sel.value=x.estado; } };
      const p = PUNTOS.find(q=>q.k===x.punto);
      tb.append(el("tr",{}, el("td",{text:p?p.e+" "+p.l:"General"}), el("td",{text:x.descripcion}), el("td",{text:x.responsable||""}),
        el("td",{class:"mono",style:venc?"color:var(--bad);font-weight:700":null,text:x.vence?fmtF(x.vence)+(venc?" ⚠️":""):"—"}), el("td",{},sel),
        el("td",{}, (x.evidencia||[]).length ? el("div",{class:"fotos"}, x.evidencia.map((id,i)=>miniFoto("getFoto", id, "Evidencia de resolución "+(i+1)))) : null)));
    });
    if (!L.length) tb.append(el("tr",{},el("td",{colspan:"6",class:"empty",text:"Sin acciones. Se crean desde el detalle de cada auditoría en Registro."})));
  };
  body.append(el("div",{class:"card"}, el("h2",{text:"Acciones correctivas"}), el("p",{class:"lead",text:"Seguimiento con responsable, fecha límite, estado y evidencia de resolución."}),
    el("div",{class:"tablewrap"}, el("table",{}, el("thead",{},el("tr",{}, ...["Punto","Acción","Responsable","Vence","Estado","Evidencia"].map(x=>el("th",{text:x})))), tb))));
  pintar();
}
/* ===================== Descargas: Excel y PDF del registro de auditorías ===================== */
const loaded = {};
function loadScript([src,sri]){ return loaded[src] || (loaded[src] = new Promise((res,rej)=>{ const s=document.createElement("script"); s.src=src; s.integrity=sri; s.crossOrigin="anonymous"; s.referrerPolicy="no-referrer"; s.onload=res; s.onerror=()=>{delete loaded[src]; rej(new Error("load"));}; document.head.append(s); })); }
async function loadLibs(k){ for (const u of LIBS[k]) await loadScript(u); }
function guardar(filename, blob){
  const url=URL.createObjectURL(blob), a=document.createElement("a");
  a.href=url; a.download=filename; a.rel="noopener"; document.body.append(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 60000); toast("⬇️ Descargando "+filename);
}
function rangoTxt(){ const d=$("rf-desde").value, h=$("rf-hasta").value, r=$("rf-res").value;
  return [d||h ? `Período: ${d?fmtF(d):"inicio"} al ${h?fmtF(h):"hoy"}` : "Período: todo", r?`Resultado: ${r}`:""].filter(Boolean).join(" · "); }
const HEXR = {Excelente:"FFDCFCE7",Advertencia:"FFFEF3C7",Reclamo:"FFFEE2E2"}, HEXRT = {Excelente:"FF15803D",Advertencia:"FFB45309",Reclamo:"FFC81E1E"};
const HEXS = {1:["FFFEE4E2","FFD92D20"],2:["FFFFE8D9","FFE8590C"],3:["FFFEF3C7","FFA16207"],4:["FFDCFCE7","FF16A34A"],5:["FFC9F2D9","FF0E7A3E"]};
const fill = argb => ({type:"pattern",pattern:"solid",fgColor:{argb}});
const toDate = s => { const [y,m,d]=(s||"").split("-").map(Number); return y?new Date(Date.UTC(y,m-1,d)):s; };
async function buildXLSX(list){
  const wb = new ExcelJS.Workbook(); wb.creator="Hey Blackk"; wb.created=new Date();
  const ws = wb.addWorksheet("Registro", {views:[{state:"frozen", ySplit:6}], pageSetup:{orientation:"landscape", fitToPage:true, fitToWidth:1, fitToHeight:0}});
  const logoId = wb.addImage({base64:LOGO, extension:"png"});
  ws.addImage(logoId, {tl:{col:0.15,row:0.2}, ext:{width:260,height:34}});
  ws.getRow(1).height=32;
  ws.getCell("A3").value="Registro de auditorías · Sucursal Palermo"; ws.getCell("A3").font={bold:true,size:14};
  ws.getCell("A4").value=`${rangoTxt()} · ${list.length} auditorías · generado ${new Date().toLocaleString("es-AR")}`; ws.getCell("A4").font={size:10,color:{argb:"FF5F5F68"}};
  const head=["Fecha","Auditor",...PUNTOS.map(p=>p.l),"Promedio","Resultado","Infracciones","Checklist","Días pedido","Comentario general"];
  const NP=PUNTOS.length;
  const hr = ws.getRow(6); hr.values=head; hr.height=44;
  hr.eachCell(c=>{ c.font={bold:true,color:{argb:"FFFFFFFF"},size:10}; c.fill=fill("FF111113"); c.alignment={vertical:"middle",horizontal:"center",wrapText:true}; });
  const asc=[...list].reverse();
  asc.forEach((a,i)=>{
    const r = ws.getRow(7+i);
    r.values=[toDate(a.fecha), a.auditor, ...PUNTOS.map(p=>a.puntajes?.[p.k]??null), a.promedio, a.resultado, a.totalInfracciones??0, a.resultadoChecklist, a.diasPedido, a.comentarioGeneral||""];
    r.getCell(1).numFmt="dd/mm/yyyy";
    PUNTOS.forEach((p,j)=>{ const v=a.puntajes?.[p.k], c=r.getCell(3+j); c.alignment={horizontal:"center"}; if (HEXS[v]) { c.fill=fill(HEXS[v][0]); c.font={bold:true,color:{argb:HEXS[v][1]}}; } });
    const pc=r.getCell(3+NP); pc.numFmt="0.0"; pc.font={bold:true}; pc.alignment={horizontal:"center"};
    [[4+NP,a.resultado],[6+NP,a.resultadoChecklist]].forEach(([col,res])=>{ const c=r.getCell(col); c.fill=fill(HEXR[res]||"FFECECF0"); c.font={bold:true,color:{argb:HEXRT[res]||"FF5F5F68"}}; c.alignment={horizontal:"center"}; });
    r.getCell(5+NP).alignment={horizontal:"center"};
    const dc=r.getCell(7+NP); dc.alignment={horizontal:"center"}; if (a.pedidoFueraDePlazo) dc.font={bold:true,color:{argb:"FFC81E1E"}};
    r.getCell(8+NP).alignment={wrapText:true,vertical:"top"};
    for (let k=1;k<=head.length;k++) r.getCell(k).border={bottom:{style:"thin",color:{argb:"FFE0E0E6"}}};
  });
  head.forEach((h,i)=>{ ws.getColumn(i+1).width = i===0?12 : i===1?20 : i<2+NP?14 : i===head.length-1?46 : 12; });
  ws.autoFilter = {from:{row:6,column:1}, to:{row:6+asc.length, column:head.length}};

  const wd = wb.addWorksheet("Detalle por punto", {views:[{state:"frozen", ySplit:1}]});
  wd.columns=[{header:"Fecha",key:"f",width:12},{header:"Auditor",key:"a",width:20},{header:"Punto",key:"p",width:36},{header:"Puntaje",key:"s",width:10},{header:"Infracciones",key:"i",width:13},{header:"Comentario",key:"c",width:50},{header:"Promedio auditoría",key:"pr",width:12},{header:"Resultado",key:"r",width:14}];
  wd.getRow(1).eachCell(c=>{ c.font={bold:true,color:{argb:"FFFFFFFF"}}; c.fill=fill("FF111113"); });
  asc.forEach(a=>PUNTOS.forEach(p=>{ const v=a.puntajes?.[p.k];
    const row=wd.addRow({f:toDate(a.fecha),a:a.auditor,p:p.l,s:v,i:a.infracciones?.[p.k]||0,c:a.comentarios?.[p.k]||"",pr:a.promedio,r:a.resultado});
    row.getCell("f").numFmt="dd/mm/yyyy"; row.getCell("pr").numFmt="0.0";
    if (HEXS[v]) { const c=row.getCell("s"); c.fill=fill(HEXS[v][0]); c.font={bold:true,color:{argb:HEXS[v][1]}}; c.alignment={horizontal:"center"}; }
    const rc=row.getCell("r"); if (HEXR[a.resultado]) { rc.fill=fill(HEXR[a.resultado]); rc.font={bold:true,color:{argb:HEXRT[a.resultado]}}; } }));
  wd.autoFilter={from:"A1",to:"H1"};

  const wr = wb.addWorksheet("Resumen");
  const n=list.length, prom=list.reduce((s,a)=>s+a.promedio,0)/n, tot=list.reduce((s,a)=>s+(a.totalInfracciones||0),0);
  const cnt=r=>list.filter(a=>a.resultado===r).length;
  wr.getColumn(1).width=42; wr.getColumn(2).width=14; wr.getColumn(3).width=14;
  wr.addRow(["Indicadores · Sucursal Palermo"]).font={bold:true,size:14}; wr.addRow([rangoTxt()]).font={size:10,color:{argb:"FF5F5F68"}}; wr.addRow([]);
  [["Auditorías",n],["Puntaje promedio",Math.round(prom*10)/10],["Total infracciones",tot],["Infracciones por visita",Math.round(tot/n*10)/10]].forEach(r=>{ const row=wr.addRow(r); row.getCell(1).font={bold:true}; });
  ["Excelente","Advertencia","Reclamo"].forEach(k=>{ const row=wr.addRow([k,cnt(k),cnt(k)/n]); row.getCell(3).numFmt="0%"; row.getCell(1).fill=fill(HEXR[k]); row.getCell(1).font={bold:true,color:{argb:HEXRT[k]}}; });
  wr.addRow([]); const h2=wr.addRow(["Promedio por punto","Promedio","Infracciones"]); h2.eachCell(c=>{c.font={bold:true,color:{argb:"FFFFFFFF"}}; c.fill=fill("FF111113");});
  PUNTOS.forEach(p=>{ const v=list.map(a=>a.puntajes?.[p.k]).filter(Boolean); const av=v.length?v.reduce((s,x)=>s+x,0)/v.length:null;
    const row=wr.addRow([p.l, av==null?null:Math.round(av*10)/10, list.reduce((s,a)=>s+(a.infracciones?.[p.k]||0),0)]);
    const k=av==null?null:Math.max(1,Math.min(5,Math.round(av))); if (k){ const c=row.getCell(2); c.fill=fill(HEXS[k][0]); c.font={bold:true,color:{argb:HEXS[k][1]}}; } });
  return await wb.xlsx.writeBuffer();
}
function buildPDF(list){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({orientation:"landscape", unit:"mm", format:"a4"});
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  doc.addImage(LOGO, "PNG", 14, 10, 62, 8.2);
  doc.setFont("helvetica","bold"); doc.setFontSize(13); doc.setTextColor(20,20,22); doc.text("Registro de auditorías · Sucursal Palermo", 14, 27);
  doc.setFont("helvetica","normal"); doc.setFontSize(9); doc.setTextColor(95,95,104);
  doc.text(`${rangoTxt()} · ${list.length} auditorías · generado ${new Date().toLocaleString("es-AR")}`, 14, 32);
  const n=list.length, prom=list.reduce((s,a)=>s+a.promedio,0)/n, tot=list.reduce((s,a)=>s+(a.totalInfracciones||0),0);
  const cnt=r=>list.filter(a=>a.resultado===r).length;
  const RGB={Excelente:[[220,252,231],[21,128,61]],Advertencia:[[254,243,199],[180,83,9]],Reclamo:[[254,226,226],[200,30,30]]};
  const boxes=[["Puntaje promedio",fmt1(prom)+" / 5",resAud(prom)],["Excelente",String(cnt("Excelente")),"Excelente"],["Advertencia",String(cnt("Advertencia")),"Advertencia"],["Reclamo",String(cnt("Reclamo")),"Reclamo"],["Infracciones",String(tot),null]];
  const bw=(W-28-4*4)/5;
  boxes.forEach(([k,v,r],i)=>{ const x=14+i*(bw+4), col=RGB[r]||[[236,236,240],[20,20,22]];
    doc.setFillColor(...col[0]); doc.roundedRect(x,36,bw,16,2,2,"F");
    doc.setTextColor(...col[1]); doc.setFontSize(8); doc.setFont("helvetica","bold"); doc.text(k.toUpperCase(), x+3, 41);
    doc.setFontSize(13); doc.text(v, x+3, 48.5); });
  const SRGB={1:[[254,228,226],[217,45,32]],2:[[255,232,217],[232,89,12]],3:[[254,243,199],[161,98,7]],4:[[220,252,231],[22,163,74]],5:[[201,242,217],[14,122,62]]};
  const cortos=["Etiqueta","Estant.","Pedidos","Aviso","Limpieza","Depósito","Otros"];
  doc.autoTable({
    startY:57, theme:"grid", margin:{left:14,right:14,bottom:14},
    head:[["Fecha","Auditor",...cortos,"Prom.","Resultado","Infr.","Checklist","Días ped.","Comentario"]],
    body:[...list].reverse().map(a=>[fmtF(a.fecha),a.auditor,...PUNTOS.map(p=>a.puntajes?.[p.k]??"–"),fmt1(a.promedio),a.resultado,a.totalInfracciones??0,a.resultadoChecklist,a.diasPedido??"–",a.comentarioGeneral||""]),
    styles:{font:"helvetica",fontSize:8,cellPadding:1.8,lineColor:[224,224,230],lineWidth:0.2,textColor:[20,20,22],valign:"middle"},
    headStyles:{fillColor:[17,17,19],textColor:255,fontStyle:"bold",halign:"center"},
    columnStyles:{0:{cellWidth:18},1:{cellWidth:28},9:{halign:"center",fontStyle:"bold"},10:{halign:"center",cellWidth:22},11:{halign:"center"},12:{halign:"center",cellWidth:22},13:{halign:"center"}},
    didParseCell:d=>{ if (d.section!=="body") return; const c=d.column.index, v=d.cell.raw;
      if (c>=2 && c<=8){ d.cell.styles.halign="center"; if (SRGB[v]){ d.cell.styles.fillColor=SRGB[v][0]; d.cell.styles.textColor=SRGB[v][1]; d.cell.styles.fontStyle="bold"; } }
      if ((c===10||c===12) && RGB[v]){ d.cell.styles.fillColor=RGB[v][0]; d.cell.styles.textColor=RGB[v][1]; d.cell.styles.fontStyle="bold"; } },
    didDrawPage:()=>{ doc.setFontSize(8); doc.setFont("helvetica","normal"); doc.setTextColor(130); doc.text(`Hey Blackk · Auditoría Palermo · página ${doc.internal.getNumberOfPages()}`, 14, H-7); }
  });
  return doc.output("blob");
}

async function exportXLSX(){
  const list = filtReg(); if (!list.length) return toast("No hay auditorías para descargar con estos filtros.");
  const st=$("exp-status"); st.textContent="Preparando Excel…";
  try{ await loadLibs("xlsx"); const buf=await buildXLSX(list); st.textContent="";
    guardar(`HeyBlackk_Auditorias_Palermo_${hoy()}.xlsx`, new Blob([buf],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"})); }
  catch(e){ st.textContent=""; toast("No se pudo generar el Excel. Revisá la conexión y probá de nuevo."); }
}
async function exportPDF(){
  const list = filtReg(); if (!list.length) return toast("No hay auditorías para descargar con estos filtros.");
  const st=$("exp-status"); st.textContent="Preparando PDF…";
  try{ await loadLibs("pdf"); const blob=buildPDF(list); st.textContent=""; guardar(`HeyBlackk_Auditorias_Palermo_${hoy()}.pdf`, blob); }
  catch(e){ st.textContent=""; toast("No se pudo generar el PDF. Revisá la conexión y probá de nuevo."); }
}
/* ===================== Indicadores de auditoría (conservados de la versión anterior) ===================== */
async function copiar(t, ok="Copiado"){ try{ await navigator.clipboard.writeText(t); toast("📋 "+ok); }catch(e){
  const ta=el("textarea",{style:"position:fixed;opacity:0"}); ta.value=t; document.body.append(ta); ta.select(); try{ document.execCommand("copy"); toast("📋 "+ok); }catch(x){ toast("No se pudo copiar: seleccioná el texto a mano."); } ta.remove(); } }

/* ---------- KPI ---------- */
function filtKPI(){
  const d=parseInt($("kf-per").value);
  const lim = d ? diasAtras(d) : "";
  return S.lista.filter(a=>!lim||a.fecha>=lim);
}
function kpi(k,v,s,c){ return el("div",{class:"kpi "+(c||"")}, el("span",{class:"k",text:k}), el("span",{class:"v",style:c?`color:var(--${c})`:null,text:v}), s?el("span",{class:"s",text:s}):null); }
function renderKPI(){
  const body=$("kpi-body"); body.textContent="";
  const L = filtKPI(), n=L.length, P=S.params;
  $("kpi-lead").textContent = n ? `${n} auditoría${n===1?"":"s"} en el período · datos al momento de desbloquear` : "Sin auditorías en el período";
  if (!n){ body.append(el("div",{class:"card empty",text: S.lista.length ? "No hay auditorías en este período. Probá con «Todo»." : "Los indicadores aparecen con la primera auditoría validada."})); return; }
  const asc=[...L].sort((a,b)=>(a.fecha+a.creado).localeCompare(b.fecha+b.creado));
  const ult=asc[n-1], ant=asc[n-2];
  const prom = L.reduce((s,a)=>s+(a.promedio||0),0)/n;
  const dist={Excelente:0,Advertencia:0,Reclamo:0}; L.forEach(a=>dist[a.resultado]=(dist[a.resultado]||0)+1);
  const totInf = L.reduce((s,a)=>s+(a.totalInfracciones||0),0);
  const lim30=diasAtras(30);
  const inf30 = S.lista.filter(a=>a.fecha>=lim30).reduce((s,a)=>s+(a.totalInfracciones||0),0);
  const conDias=L.filter(a=>a.diasPedido!=null), maxDias = conDias.length?Math.max(...conDias.map(a=>a.diasPedido)):null;
  const fuera = L.filter(a=>a.diasPedido!=null && a.diasPedido>P.diasMax).length;
  const tend = !ant ? null : ult.promedio>ant.promedio ? "Mejora" : ult.promedio<ant.promedio ? "Empeora" : "Igual";
  const rp=resAud(prom);
  body.append(el("div",{class:"kpis"},
    kpi("⭐ Puntaje promedio", fmt1(prom), "de 5 · "+REMO[rp]+" "+rp, cls(rp)),
    kpi("✅ Auditorías", n, `${pct(dist.Excelente/n)} excelentes`),
    kpi("📅 Última auditoría", fmt1(ult.promedio), `${fmtF(ult.fecha)} · ${ult.resultado}`, cls(ult.resultado)),
    kpi("📈 Tendencia", tend? (tend==="Mejora"?"↑ Mejora":tend==="Empeora"?"↓ Empeora":"= Igual") : "–", ant?`vs ${fmt1(ant.promedio)} el ${fmtF(ant.fecha)}`:"Hace falta una segunda auditoría", tend==="Mejora"?"ok":tend==="Empeora"?"bad":null),
    kpi("🔢 Infracciones", totInf, `${fmt1(totInf/n)} por visita · ${inf30} en 30 días`, totInf?"warn":"ok"),
    kpi("⏳ Pedido más viejo", maxDias==null?"–":maxDias+" días", fuera?`${fuera} visita${fuera===1?"":"s"} fuera de plazo (>${P.diasMax} d)`:`Límite ${P.diasMax} días`, fuera?"bad":(maxDias!=null?"ok":null))));

  const avgP = PUNTOS.map(p=>{ const v=L.map(a=>a.puntajes?.[p.k]).filter(Boolean); return {p, v: v.length? v.reduce((s,x)=>s+x,0)/v.length : null}; });
  const weakest = avgP.filter(x=>x.v!=null).sort((a,b)=>a.v-b.v)[0];
  const bars = el("div",{class:"bars"});
  avgP.forEach(({p,v})=>{ const k=v==null?3:Math.max(1,Math.min(5,Math.round(v)));
    bars.append(el("div",{class:"bar"}, el("span",{text:p.e+" "+p.l}),
      el("div",{class:"track"+(weakest&&weakest.p.k===p.k?" weak":""),title:fmt1(v)}, el("i",{style:`width:${(v||0)/5*100}%;background:var(--s${k})`})),
      el("span",{class:"v",text:fmt1(v)}))); });

  const cat = PUNTOS.map(p=>{ const tot=L.reduce((s,a)=>s+(a.infracciones?.[p.k]||0),0); const vis=L.filter(a=>(a.infracciones?.[p.k]||0)>0).length; return {p,tot,vis}; }).sort((a,b)=>b.tot-a.tot);
  let acum=0; const tbl=el("tbody");
  cat.forEach(c=>{ acum+=c.tot; tbl.append(el("tr",{}, el("td",{text:c.p.e+" "+c.p.inf}), el("td",{class:"n",text:c.tot}), el("td",{class:"n",text:totInf?pct(c.tot/totInf):"–"}),
    el("td",{class:"n",text:totInf?pct(acum/totInf):"–"}), el("td",{class:"n",text:fmt1(c.tot/n)}), el("td",{class:"n",text:pct(c.vis/n)}))); });

  body.append(el("div",{class:"split"},
    el("div",{class:"card"}, el("h3",{text:"⭐ Promedio por punto"}), bars,
      weakest? el("p",{class:"lead",style:"margin:12px 0 0",text:`🎯 Punto más débil: ${weakest.p.l} (${fmt1(weakest.v)}).`}):null),
    el("div",{class:"card"}, el("h3",{text:"🚦 Resultado de las auditorías"}), distBar(dist,n),
      el("h3",{style:"margin-top:18px",text:"📈 Evolución del puntaje"}), chart(asc))));

  body.append(el("div",{class:"card"}, el("h3",{text:"🔢 Infracciones por categoría · Pareto"}),
    el("div",{class:"tablewrap"}, el("table",{}, el("thead",{},el("tr",{}, el("th",{text:"Categoría"}),el("th",{class:"n",text:"Total"}),el("th",{class:"n",text:"% total"}),el("th",{class:"n",text:"% acum."}),el("th",{class:"n",text:"Prom./visita"}),el("th",{class:"n",text:"Recurrencia"}))), tbl)),
    el("p",{class:"lead",style:"margin:10px 0 0",text: totInf? `Problema más frecuente: ${cat[0].p.inf} (${cat[0].tot}).` : "Sin infracciones registradas en el período."})));

  const acc=el("ul",{class:"action"});
  const top = cat.filter(c=>c.tot>0); let cum=0; const pareto=[]; for (const c of top){ pareto.push(c); cum+=c.tot; if (cum/totInf>=0.8) break; }
  const li=(e,t)=>acc.append(el("li",{},el("span",{text:e}),el("span",{text:t})));
  if (pareto.length) li("🎯",`Atacá primero ${pareto.map(c=>c.p.inf.toLowerCase()).join(" y ")}: explican el ${pct(cum/totInf)} de las infracciones. Corregir eso mueve el resultado más que cualquier otra cosa.`);
  if (weakest && weakest.v<P.promExc) li("📌",`Subí ${weakest.p.l.toLowerCase()} de ${fmt1(weakest.v)} a ${fmt1(P.promExc)}: definí un responsable en el local y revisalo en la próxima visita.`);
  if (fuera) li("📦",`${fuera} visita${fuera===1?"":"s"} con pedidos de más de ${P.diasMax} días: cada pedido viejo es plata inmovilizada y un cliente esperando. Pedí aviso diario de pendientes.`);
  if (tend==="Empeora") li("📉",`La última auditoría bajó respecto de la anterior (${fmt1(ant.promedio)} → ${fmt1(ult.promedio)}). Conviene una visita de seguimiento antes de 7 días.`);
  if (!acc.children.length) li("👏","El local está dentro de los parámetros. Mantené la frecuencia de auditoría y reconocé al equipo.");
  body.append(el("div",{class:"card"},el("h3",{text:"✅ Qué hacer ahora"}),acc));
}
function distBar(d,n){
  const wrap=el("div",{style:"display:grid;gap:10px"});
  const bar=el("div",{style:"display:flex;height:16px;border-radius:5px;overflow:hidden;background:var(--chip)"});
  [["Excelente","ok"],["Advertencia","warn"],["Reclamo","bad"]].forEach(([k,c])=>{ if(d[k]) bar.append(el("i",{style:`width:${d[k]/n*100}%;background:var(--${c})`,title:k})); });
  wrap.append(bar, el("div",{class:"row"}, ...[["Excelente","ok"],["Advertencia","warn"],["Reclamo","bad"]].map(([k,c])=>el("span",{class:"pill "+c,text:`${REMO[k]} ${k} ${d[k]||0} · ${pct((d[k]||0)/n)}`}))));
  return wrap;
}
function chart(asc){
  const NS="http://www.w3.org/2000/svg", W=560,H=200,pl=30,pr=12,pt=10,pb=26;
  const s=document.createElementNS(NS,"svg"); s.setAttribute("viewBox",`0 0 ${W} ${H}`); s.setAttribute("role","img"); s.setAttribute("aria-label","Evolución del puntaje promedio por auditoría");
  const mk=(t,a)=>{const e=document.createElementNS(NS,t); for(const k in a) e.setAttribute(k,a[k]); s.append(e); return e;};
  const y=v=>pt+(5-v)/4*(H-pt-pb), pts=asc.slice(-30), x=i=>pts.length===1?(pl+W-pr)/2:pl+i*(W-pl-pr)/(pts.length-1);
  mk("rect",{x:pl,y:y(5),width:W-pl-pr,height:y(S.params.promExc)-y(5),fill:"var(--ok-bg)"});
  mk("rect",{x:pl,y:y(S.params.promExc),width:W-pl-pr,height:y(S.params.promAdv)-y(S.params.promExc),fill:"var(--warn-bg)"});
  mk("rect",{x:pl,y:y(S.params.promAdv),width:W-pl-pr,height:y(1)-y(S.params.promAdv),fill:"var(--bad-bg)"});
  [1,2,3,4,5].forEach(v=>{ mk("line",{x1:pl,x2:W-pr,y1:y(v),y2:y(v),stroke:"var(--line)","stroke-width":1}); mk("text",{x:pl-8,y:y(v)+4,"text-anchor":"end"}).textContent=v; });
  if (pts.length>1) mk("polyline",{points:pts.map((a,i)=>x(i)+","+y(a.promedio)).join(" "),fill:"none",stroke:"var(--ink)","stroke-width":2.2,"stroke-linejoin":"round"});
  pts.forEach((a,i)=>{ const last=i===pts.length-1; const col=`var(--${cls(a.resultado)||"pend"})`; const c=mk("circle",{cx:x(i),cy:y(a.promedio),r:last?6:4,fill:col,stroke:"var(--surface)","stroke-width":2}); const t=document.createElementNS(NS,"title"); t.textContent=`${fmtF(a.fecha)} · ${fmt1(a.promedio)} · ${a.resultado}`; c.append(t); });
  const lab=(i,anchor)=>{ mk("text",{x:x(i),y:H-8,"text-anchor":anchor}).textContent=fmtF(pts[i].fecha).slice(0,5); };
  lab(0, pts.length===1?"middle":"start"); if (pts.length>1) lab(pts.length-1,"end");
  return el("div",{class:"chart"},s);
}



/* ===================== KPIs comerciales e inteligencia de negocio ===================== */
const NS = "http://www.w3.org/2000/svg";
function svgEl(t,a,txt){ const e=document.createElementNS(NS,t); for (const k in a) e.setAttribute(k,a[k]); if (txt!=null) e.textContent=txt; return e; }
/** Barras verticales simples. datos: [{label, v, color?, title}] */
function barras(datos, {alto=200, fmt=moneyK, linea=null, etiqueta="Gráfico de barras"}={}){
  const W=Math.max(560, datos.length*56), H=alto, pl=8, pr=8, pt=18, pb=28, max=Math.max(1,...datos.map(d=>d.v||0), linea||0);
  const s=svgEl("svg",{viewBox:`0 0 ${W} ${H}`,role:"img","aria-label":etiqueta+": "+datos.map(d=>`${d.label} ${fmt(d.v)}`).join(", ")}); const bw=(W-pl-pr)/datos.length;
  datos.forEach((d,i)=>{ const h=(d.v||0)/max*(H-pt-pb), x=pl+i*bw+bw*0.15, y=H-pb-h;
    const r=svgEl("rect",{x,y,width:bw*0.7,height:Math.max(0,h),rx:4,fill:d.color||"var(--kc)"}); r.append(svgEl("title",{},d.title||`${d.label}: ${fmt(d.v)}`)); s.append(r);
    if (d.v) s.append(svgEl("text",{x:x+bw*0.35,y:y-4,"text-anchor":"middle",class:"cv"},fmt(d.v)));
    s.append(svgEl("text",{x:x+bw*0.35,y:H-10,"text-anchor":"middle"},d.label)); });
  if (linea){ const y=H-pb-linea/max*(H-pt-pb); s.append(svgEl("line",{x1:pl,x2:W-pr,y1:y,y2:y,stroke:"var(--bad)","stroke-dasharray":"5 4","stroke-width":1.5})); }
  return el("div",{class:"chart hscroll"},s);
}
function info(def, act){
  if (!def) return null;
  const d = el("details",{class:"kinfo"}, el("summary",{"aria-label":"Cómo se calcula",text:"ℹ️"}),
    el("div",{}, el("b",{text:def.nombre}), el("p",{text:def.definicion}), el("p",{class:"mono",text:"Fórmula: "+def.formula}), el("p",{text:"Fuente: "+def.fuente}), act?el("p",{text:"Actualizado: "+new Date(act).toLocaleString("es-AR")}):null));
  return d;
}
function kpiC(k,v,s,c,def,act,onclick){ return el("div",{class:"kpi "+(c||""),onclick:onclick||null,style:onclick?"cursor:pointer":null}, el("span",{class:"k"},k, info(def,act)), el("span",{class:"v",style:c?`color:var(--${c})`:null,text:v}), s?el("span",{class:"s",text:s}):null); }

async function vKPI(main){
  const body = el("div",{class:"stack"}); main.append(body);
  body.append(el("div",{class:"card empty"}, el("span",{class:"spin"})," Leyendo cierres y calculando…"));
  let K; try{ K = await apiS("getKPIs"); }catch(e){ body.textContent=""; return body.append(el("div",{class:"card notice bad",text:msgErr(e)})); }
  body.textContent="";
  const C = K.comercial, def = id => (C.definiciones||[]).find(d=>d.id===id), act = C.actualizado;
  body.append(el("div",{class:"card row"}, el("span",{text:"Fuente: "+C.fuente}), el("span",{class:"spacer"}),
    el("span",{class:"hint",text: act ? "Última lectura de la planilla: "+new Date(act).toLocaleString("es-AR") : "Todavía no se leyó la planilla."}),
    tiene("cierre") ? el("button",{class:"btn sm",type:"button",text:"↻ Sincronizar",onclick:async e=>{ spinBtn(e.target,"Leyendo…"); try{ await apiS("sincronizarCierre"); main.textContent=""; route(); }catch(x){ unspin(e.target); toast(msgErr(x)); } }}) : null));
  // ----- 3.3: resumen hablado (arriba del tablero) y feriados
  body.append(barraAudio(K.audio));
  const fb = bannerFeriados(K.feriados, {confirmar: tiene("cierre"), alConfirmar: ()=>{ main.textContent=""; route(); }});
  if (!fb.hidden) body.append(fb);
  if (C.sinDatos){ body.append(el("div",{class:"card empty",text:"No hay cierres cargados todavía. Cuando la planilla tenga ventas, los indicadores se calculan solos."})); return; }

  // ----- Panel ejecutivo
  const ej = el("div",{class:"card exec"}, el("h2",{text:"🧭 Qué está pasando y qué decisiones tomar"}));
  (C.resumen||[]).forEach(r=>ej.append(el("div",{class:"qa"}, el("b",{text:r.pregunta}), el("span",{text:r.respuesta}))));
  body.append(ej);
  // ----- 3.3: ¿mes bajo? y acciones comerciales para Palermo
  body.append(cardAccionesComerciales(C));
  if ((C.recomendaciones||[]).length){
    const rc = el("div",{class:"recs"});
    C.recomendaciones.forEach((r,i)=>rc.append(el("details",{class:"rec p"+r.prioridad,open:i<2},
      el("summary",{}, el("span",{class:"pill "+(r.prioridad===1?"bad":r.prioridad===2?"warn":""),text:"Prioridad "+r.prioridad}), " ", el("b",{text:r.titulo})),
      el("dl",{}, el("dt",{text:"1. Qué está pasando"}), el("dd",{text:r.diagnostico}), el("dt",{text:"2. Datos que lo respaldan"}), el("dd",{text:r.datos}),
        el("dt",{text:"3. Causa posible (hechos vs. hipótesis)"}), el("dd",{text:r.causa}), el("dt",{text:"4. Acción recomendada"}), el("dd",{text:r.accion}),
        el("dt",{text:"5. Cómo medir si funcionó"}), el("dd",{text:r.medicion})))));
    body.append(el("div",{class:"card"}, el("h3",{text:"Recomendaciones"}), rc));
  }

  // ----- Tarjetas principales
  const meses = C.meses||[], conDatos = meses.filter(m=>m.dias>0), ref = conDatos[conDatos.length-1], prev = ref && ref.vsAnterior;
  const actual = meses.find(m=>m.enCurso);
  const P = C.proyeccion;
  const anio = (C.anios||[]).slice(-1)[0];
  const ultSem = (C.semanas||[]).slice(-1)[0];
  const ultDia = (C.ultimos||[]).slice(-1)[0];
  const vCls = n => n==null ? null : n>=0 ? "ok" : n<=-15 ? "bad" : "warn";
  body.append(el("div",{class:"kpis"},
    ultDia ? kpiC("💵 Último cierre", moneyK(ultDia.total), fmtF(ultDia.fecha), null, def("venta_dia"), act) : null,
    ultSem ? kpiC("📅 Última semana con ventas", moneyK(ultSem.total), `Semana del ${fmtF(ultSem.semana)} · ${ultSem.dias} días${ultSem.deltaPct!=null?" · "+sign(ultSem.deltaPct)+" vs. anterior":""}`, vCls(ultSem.deltaPct), def("venta_semana"), act) : null,
    ref ? kpiC("🗓️ "+cap(ref.nombre), moneyK(ref.total), `${ref.dias} días con cierre${prev?" · total "+sign(prev.deltaTotalPct)+" vs. "+mesNom(prev.mes)+" (ver promedio por día)":""}`, null, def("venta_mes"), act, ()=>detalleMes(ref, C)) : null,
    ref ? kpiC("📊 Promedio por día", moneyK(ref.promDia), (prev?`${sign(prev.deltaPromPct)} vs. ${moneyK(prev.promDia)} en ${mesNom(prev.mes)}`:"Sin mes anterior para comparar") + (ref.diasCerrados&&ref.diasCerrados.length?` · ${ref.diasCerrados.length} día(s) cerrado(s) descontado(s)`:""), vCls(prev&&prev.deltaPromPct), def("prom_dia"), act) : null,
    anio ? kpiC("📆 Año "+anio.anio, moneyK(anio.total), `${anio.dias} días con cierre · desde ${fmtF(anio.desde)}`, null, def("venta_anio"), act) : null,
    P && !P.bloqueada ? kpiC("🔮 Proyección "+(actual?actual.nombre:""), moneyK(P.medio), `Estimación: ${moneyK(P.minimo)} a ${moneyK(P.maximo)} · incertidumbre ${P.incertidumbre}`, "warn", def("proyeccion"), act) :
      P ? kpiC("🔮 Proyección del mes", "No disponible", "Faltan cierres de días ya pasados. Ver «¿Cómo cerraría el mes?».", null, def("proyeccion"), act) : null,
    P && P.objetivo ? kpiC("🎯 Objetivo del mes", P.avancePct!=null?P.avancePct+"%":"–", `Objetivo ${moneyK(P.objetivo)}${P.necesarioPorDia?" · faltan "+moneyK(P.necesarioPorDia)+" por día":""}`, P.avancePct>=100?"ok":"warn", def("objetivo"), act) :
      tiene("config") ? kpiC("🎯 Objetivo del mes", "Sin cargar", "Cargalo en Configuración → Objetivos", null, def("objetivo"), act, ()=>ir("config")) : null));
  if (P && !P.bloqueada) body.append(el("div",{class:"card"}, el("h3",{text:"🔮 Supuestos de la proyección (no es venta real)"}), el("ul",{class:"action"}, P.supuestos.map(s=>el("li",{text:s})))));
  if (prev && prev.notaFeriados) body.append(el("div",{class:"notice",text:"📅 "+prev.notaFeriados}));

  // ----- Evolución mensual
  const promTodos = conDatos.length ? conDatos.reduce((a,m)=>a+m.total,0)/conDatos.length : null;
  body.append(el("div",{class:"split"},
    el("div",{class:"card",style:"--kc:#7C3AED"}, el("h3",{},"Facturación mensual ", info(def("venta_mes"),act)),
      barras(conDatos.map(m=>({label:mesNom(m.mes).slice(0,3), v:m.total, title:`${m.nombre}: ${money(m.total)} · ${m.dias} días con cierre`})), {linea: actual&&actual.objetivo||null, etiqueta:"Facturación mensual"}),
      el("p",{class:"hint",text:"Tocá la tarjeta del mes para ver los cierres de cada día."+(actual&&actual.objetivo?" Línea roja: objetivo del mes en curso.":"")})),
    el("div",{class:"card",style:"--kc:#0D9488"}, el("h3",{},"Promedio por día con cierre ", info(def("prom_dia"),act)),
      barras(conDatos.map(m=>({label:mesNom(m.mes).slice(0,3), v:m.promDia, title:`${m.nombre}: ${money(m.promDia)} por día`})), {etiqueta:"Promedio por día con cierre"}),
      el("p",{class:"hint",text:"Compara meses con distinta cantidad de días cargados."}))));

  // ----- Día de la semana y mix
  const ds = C.diaSemana||[];
  const mix = ref && ref.mix;
  body.append(el("div",{class:"split"},
    el("div",{class:"card",style:"--kc:#EA580C"}, el("h3",{},"Rendimiento por día de la semana ", info(def("dia_semana"),act)),
      barras(ds.map(d=>({label:d.nombre.slice(0,3), v:d.promedio, title:`${d.nombre}: ${money(d.promedio)} de promedio · ${d.participacion}% de la facturación · ${d.n} días`})), {etiqueta:"Rendimiento por día de la semana"}),
      el("div",{class:"row"}, ds.map(d=>el("span",{class:"pill",text:`${d.nombre}: ${d.participacion}%`})))),
    el("div",{class:"card"}, el("h3",{},"Mix de medios de pago · "+(ref?ref.nombre:""), info(def("mix"),act)),
      mix ? mixBar(mix, prev && conDatos[conDatos.length-2] && conDatos[conDatos.length-2].mix) : el("p",{class:"lead",text:"Sin datos."}))));

  // ----- Semanas
  const sem = C.semanas||[];
  if (sem.length) body.append(el("div",{class:"card",style:"--kc:#2563EB"}, el("h3",{},"Facturación semanal (lunes a domingo) ", info(def("venta_semana"),act)),
    barras(sem.map(s=>({label:fmtF(s.semana).slice(0,5), v:s.total, color: s.dias<3?"var(--pend)":null, title:`Semana del ${fmtF(s.semana)}: ${money(s.total)} · ${s.dias} días con cierre`})), {etiqueta:"Facturación semanal"}),
    el("p",{class:"hint",text:"Gris: semanas con menos de 3 días cargados (no comparables)."})));

  // ----- Alertas
  const al = C.alertas||[];
  body.append(el("div",{class:"card"}, el("h3",{text:"🚨 Alertas comerciales y de datos"}),
    al.length ? el("div",{class:"tablewrap"}, el("table",{}, el("thead",{},el("tr",{}, ...["Alerta","Valor observado","Comparado con","Por qué requiere atención"].map(x=>el("th",{text:x})))),
      el("tbody",{}, al.map(a=>el("tr",{}, el("td",{}, el("span",{class:"pill "+(a.nivel==="alta"?"bad":"warn"),text:a.nivel}), " ", a.titulo), el("td",{text:a.observado}), el("td",{text:a.comparado}), el("td",{text:a.motivo})))))) :
      el("p",{class:"lead",text:"Sin alertas con los umbrales configurados."}),
    el("p",{class:"hint",text:"Las alertas se calculan solo con datos suficientes (mínimo de días configurable) para evitar avisos por fluctuaciones normales. Umbrales en Configuración."})));

  // ----- Operación
  const I=K.ingresos, A=K.acciones;
  body.append(el("div",{class:"card"}, el("h3",{text:"⚙️ Indicadores operativos"}), el("div",{class:"kpis"},
    kpiC("🕘 Entradas registradas", I.total, `${I.validos} válidas · ${I.revisar} para revisar · ${I.corregidos} corregidas`),
    kpiC("🏁 Salidas", I.salidas, `${I.sinSalida} jornadas sin salida${I.minutosPromedio!=null?" · promedio "+horas(I.minutosPromedio):""}`, I.sinSalida?"warn":null),
    kpiC("📍 Fuera del radio / sin ubicación", I.fuera+" / "+I.sinUbicacion, "Datos de apoyo para revisión"),
    kpiC("🔁 Duplicados evitados", I.duplicadosBloqueados, "Intentos de fichar dos veces"),
    kpiC("🛠️ Acciones abiertas", A.abiertas, `${A.vencidas} vencidas · ${A.resueltas} resueltas`, A.vencidas?"bad":null),
    kpiC("📋 Auditorías", K.auditoriasN ?? (K.auditorias||[]).length, "en el período"))));

  // ----- Sin datos
  body.append(el("div",{class:"card"}, el("h3",{text:"🧩 Indicadores que la planilla todavía no permite"}),
    el("p",{class:"lead",text:"No se calculan para no inventar datos. Para habilitarlos haría falta el detalle por operación del sistema de caja o de facturación."}),
    el("div",{class:"tablewrap"}, el("table",{class:"compact"}, el("thead",{},el("tr",{}, el("th",{text:"Indicador"}), el("th",{text:"Dato que falta"}))),
      el("tbody",{}, (C.noDisponible||[]).map(n=>el("tr",{}, el("td",{text:n.kpi}), el("td",{text:n.falta}))))))));
  // ----- Definiciones
  body.append(el("details",{class:"card"}, el("summary",{text:"📖 Definiciones, fórmulas y fuente de cada KPI"}),
    el("div",{class:"tablewrap"}, el("table",{}, el("thead",{},el("tr",{}, ...["KPI","Definición","Fórmula"].map(x=>el("th",{text:x})))),
      el("tbody",{}, (C.definiciones||[]).map(d=>el("tr",{}, el("td",{text:d.nombre}), el("td",{text:d.definicion}), el("td",{class:"mono",text:d.formula}))))))));
}
const MESN = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const mesNom = m => MESN[Number(String(m).slice(5,7))-1]+" "+String(m).slice(0,4);
const cap = s => s ? s[0].toUpperCase()+s.slice(1) : s;
function mixBar(m, ant){
  const C = [["tarjetas","Tarjetas","#2563EB"],["transferencia","Transferencia","#0D9488"],["efectivo","Efectivo","#CA8A04"]];
  return el("div",{class:"grid"},
    el("div",{class:"mixbar"}, C.map(([k,t,c])=>m[k]?el("i",{style:`width:${m[k]}%;background:${c}`,title:`${t}: ${m[k]}%`}):null)),
    el("div",{class:"row"}, C.map(([k,t,c])=>{ const d = ant && ant[k]!=null && m[k]!=null ? Math.round((m[k]-ant[k])*10)/10 : null;
      return el("span",{class:"pill",style:`background:color-mix(in srgb,${c} 14%,var(--surface));color:color-mix(in srgb,${c} 55%,var(--ink))`,text:`${t} ${String(m[k]??"–").replace(".",",")}%${d!=null?" ("+(d>=0?"+":"")+String(d).replace(".",",")+" pp)":""}`}); })));
}
async function detalleMes(m){
  let r; try{ r = await apiS("getCierre", m.mes+"-01", m.mes+"-31"); }catch(e){ return toast(msgErr(e)); }
  const tb = el("tbody"); r.cierres.forEach(c=>tb.append(el("tr",{class:c.total===0?"encero":null}, el("td",{class:"mono"}, fmtF(c.fecha), c.feriado?el("span",{class:"pill",title:c.feriado,text:"🎉 feriado"}):null, c.noHabitual?el("span",{class:"pill warn",text:"venta en día no habitual"}):null, c.total===0?el("span",{class:"pill",text:"sin ventas"}):null),
    el("td",{class:"n",text:money(c.tarjetas)}), el("td",{class:"n",text:money(c.transferencia)}), el("td",{class:"n",text:money(c.efectivo)}), el("td",{class:"n"},el("b",{text:money(c.total)})))));
  const cerr = (m.diasCerrados||[]).map(x=>`${fmtF(x.fecha)} (${x.motivo})`).join(", ");
  const mm = modal(el("div",{class:"grid"}, el("h2",{text:"Cierres de "+m.nombre}), el("p",{class:"lead",text:`${m.dias} días con cierre · ${m.diasOperativos} días de apertura efectivos · ${m.diasSinCierre.length} sin cierre${m.diasSinCierre.length?": "+m.diasSinCierre.map(fmtF).join(", "):""}${cerr?" · cerrados: "+cerr:""}${(m.feriadosSinConfirmar||[]).length?" · feriados a confirmar: "+m.feriadosSinConfirmar.map(x=>fmtF(x.fecha)).join(", "):""}`}),
    el("div",{class:"tablewrap"}, el("table",{class:"compact"}, el("thead",{},el("tr",{}, ...["Fecha","Tarjetas","Transferencia","Efectivo","Total"].map((x,i)=>el("th",{class:i?"n":null,text:x})))), tb)),
    el("button",{class:"btn",type:"button",text:"Cerrar",onclick:()=>mm.cerrar()})));
}
/* 3.3 · ¿Mes bajo? → acciones comerciales (qué hacer · por qué · esfuerzo · plazo · cómo medir). Si no es bajo: "Sin alertas: el mes viene en línea". */
function cardAccionesComerciales(C){
  const mb = C.mesBajo, A = C.accionesComerciales||[];
  const card = el("div",{class:"card acciones-com"}, el("h2",{text:"🛍️ Acciones comerciales para Palermo"}));
  if (!mb || mb.esBajo==null){ card.append(el("p",{class:"lead",text:(mb&&mb.mensaje)||"Sin datos suficientes para evaluar el mes."}), mb&&mb.aclaracion?el("p",{class:"hint",text:mb.aclaracion}):null); return card; }
  card.append(el("div",{class:"notice "+(mb.esBajo?"warn":"ok"),text:(mb.esBajo?"📉 ":"✅ ")+mb.mensaje}));
  if (mb.aclaracion) card.append(el("p",{class:"hint",text:mb.aclaracion}));
  const comps = (mb.comparaciones||[]).map(c=>el("span",{class:"pill "+(c.bajo?"bad":"ok"),text:`${sign(c.deltaPromPct)} vs. ${c.contra}${c.deltaProyPct!=null?" · proyección "+sign(c.deltaProyPct):""}`}));
  if (comps.length) card.append(el("div",{class:"row"}, ...comps));
  card.append(el("p",{class:"hint",text:`Criterio: promedio por día de apertura (o su proyección) por debajo del mes anterior o del promedio del año en más del ${mb.umbralPct}% (umbral configurable en Configuración). Contexto: showroom con poco tráfico; el sábado concentra cerca de la mitad de la venta y el miércoles es el día más flojo. Se priorizan acciones que atraen gente antes que bajar precios.`}));
  if (!A.length) return card;
  const ESF = {bajo:"ok",medio:"warn",alto:"bad"};
  const ol = el("div",{class:"recs"});
  A.forEach((a,i)=>ol.append(el("details",{class:"rec p"+a.prioridad,open:i<3},
    el("summary",{}, el("span",{class:"pill "+(a.prioridad===1?"bad":a.prioridad===2?"warn":""),text:"Prioridad "+a.prioridad}), " ", el("b",{text:a.titulo})),
    el("dl",{}, el("dt",{text:"Qué hacer"}), el("dd",{text:a.queHacer}), el("dt",{text:"Por qué (dato de la app)"}), el("dd",{text:a.porQue}),
      el("dt",{text:"Esfuerzo · plazo"}), el("dd",{}, el("span",{class:"pill "+ESF[a.esfuerzo],text:"esfuerzo "+a.esfuerzo}), " ", el("span",{class:"pill",text:a.plazo})),
      el("dt",{text:"Cómo medir si funcionó"}), el("dd",{text:a.medicion})))));
  card.append(ol);
  return card;
}
/* ===================== 3.3 · Resumen hablado (Web Speech API del navegador: sin servicios pagos ni claves) =====================
   El texto lo arma el servidor con datos reales; acá solo se lee en voz alta. Nunca suena solo: únicamente al tocar un botón. */
const VOZ_KEY = "hb3_voz";
const VOZ = {
  soporta(){ return typeof speechSynthesis !== "undefined" && typeof SpeechSynthesisUtterance !== "undefined"; },
  velocidad(){ const v = lsGet(VOZ_KEY); return ["lenta","normal","rapida"].includes(v) ? v : "normal"; },
  setVelocidad(v){ lsSet(VOZ_KEY, v); },
  rate(){ return {lenta:0.85, normal:1, rapida:1.2}[this.velocidad()]; },
  voces(){ try{ return speechSynthesis.getVoices()||[]; }catch(e){ return []; } },
  /* es-AR primero; si no hay, es-419 / es-US / es-MX / es-ES; dentro del idioma, la voz de mejor calidad (natural/neural/Google). */
  mejorVoz(){
    const vs = this.voces(); if (!vs.length) return null;
    const norm = l => String(l||"").replace("_","-").toLowerCase();
    for (const l of ["es-ar","es-419","es-us","es-mx","es-es"]){
      const c = vs.filter(v=>norm(v.lang)===l);
      if (c.length) return c.find(v=>/natural|neural|premium|enhanced|google/i.test(v.name)) || c[0];
    }
    const es = vs.filter(v=>/^es/i.test(v.lang)); return es.find(v=>/natural|neural|google/i.test(v.name)) || es[0] || null;
  },
  activa:null, onEstado:null,
  hablar(texto, onFin){
    if (!this.soporta()) return false;
    this.detener();
    const voz = this.mejorVoz(), rate = this.rate();
    const partes = String(texto).match(/[^.!?]+[.!?]+["»]?\s*|[^.!?]+$/g) || [String(texto)];   // por oraciones: algunos navegadores cortan los textos largos
    const ses = { onFin, i:0 }; this.activa = ses;
    const siguiente = () => {
      if (this.activa !== ses) return;
      if (ses.i >= partes.length){ this.activa=null; if (this.onEstado) this.onEstado(false); if (onFin) onFin(); return; }
      const u = new SpeechSynthesisUtterance(partes[ses.i++]);
      u.lang = voz ? voz.lang : "es-AR"; if (voz) u.voice = voz; u.rate = rate; u.pitch = 1;
      u.onend = siguiente; u.onerror = e => { if (e && (e.error==="interrupted"||e.error==="canceled")) return; siguiente(); };
      try{ speechSynthesis.speak(u); }catch(e){ siguiente(); }
    };
    if (this.onEstado) this.onEstado(true);
    siguiente();
    return true;
  },
  detener(){ this.activa=null; try{ speechSynthesis.cancel(); }catch(e){} if (this.onEstado) this.onEstado(false); }
};
try{ if (VOZ.soporta()){ speechSynthesis.getVoices(); speechSynthesis.addEventListener("voiceschanged", ()=>{}); } }catch(e){}
addEventListener("pagehide", ()=>VOZ.detener());

/* Barra de audio arriba del tablero: 4 botones, Detener y velocidad (se recuerda). Muestra en pantalla el mismo texto que se lee. */
function barraAudio(A){
  const box = el("section",{class:"card audio","aria-label":"Resumen hablado"});
  if (!A) return box;
  const titulo = el("b",{text:""}), txt = el("p",{class:"audio-txt",hidden:true}), estado = el("span",{class:"hint estado",text:""});
  const sel = el("select",{"aria-label":"Velocidad de lectura"}, ...[["lenta","Lenta"],["normal","Normal"],["rapida","Rápida"]].map(([v,t])=>el("option",{value:v,text:t,selected:VOZ.velocidad()===v})));
  sel.onchange = ()=>{ VOZ.setVelocidad(sel.value); toast("Velocidad de lectura: "+sel.selectedOptions[0].text); };
  const leer = (k, t) => { titulo.textContent = t; txt.textContent = A[k]; txt.hidden=false;
    if (!VOZ.soporta()){ estado.textContent="Este navegador no tiene voz: el texto queda visible para leerlo."; return; }
    VOZ.hablar(A[k]); };
  VOZ.onEstado = on => { box.classList.toggle("hablando", on); estado.textContent = on ? "🔊 Leyendo… tocá Detener para cortar." : ""; };
  const B = [["general","🔊 Escuchar resumen"],["comercial","🔊 Escuchar KPIs comerciales"],["auditoria","🔊 Escuchar KPIs de auditoría"],["acciones","🔊 Escuchar acciones para Palermo"]]
    .map(([k,t])=>el("button",{class:"btn"+(k==="general"?" primary":""),type:"button",text:t,"data-audio":k,onclick:()=>leer(k, t.replace("🔊 Escuchar ",""))}));
  box.append(...[el("h3",{},icono("audio",20)," Resumen hablado"),
    el("div",{class:"row"}, ...B, el("button",{class:"btn danger",type:"button",text:"⏹️ Detener",onclick:()=>VOZ.detener()}), el("label",{class:"f inline"},"Velocidad",sel)),
    !VOZ.soporta() ? el("div",{class:"notice warn",text:"Tu navegador no tiene síntesis de voz. Al tocar un botón, el texto se muestra igual."}) : null,
    estado, el("div",{class:"audio-panel"}, titulo, txt)].filter(Boolean));
  return box;
}
/* ===================== 3.3 · Vacaciones (todo dentro de la app, sin mails) =====================
   Personal: mismo usuario + PIN de la fichada. Jefes: módulo "Vacaciones" (permiso propio). El servidor valida dueño y permiso siempre. */
const EST_VAC = {pendiente:["Pendiente","warn"], aprobada:["Aprobada","ok"], rechazada:["Rechazada","bad"], cancelada:["Cancelada",""]};
const pillVac = e => { const [t,c] = EST_VAC[e]||[e,""]; return el("span",{class:"pill "+c,text:t}); };
const MESC = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const sumarD = (f,n) => { const d=new Date(f+"T12:00:00Z"); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10); };
const diasEntre = (a,b) => Math.round((new Date(b+"T12:00:00Z")-new Date(a+"T12:00:00Z"))/86400000)+1;
const dowD = f => new Date(f+"T12:00:00Z").getUTCDay();
const rangoVac = (a,b) => a===b ? fmtF(a) : `${fmtF(a)} al ${fmtF(b)}`;

/* Calendario mensual accesible (botones). opts: {mes:'YYYY-MM', feriados:[{fecha,nombre}], periodos:[{desde,hasta,nombre,estado,mio}], sel:{desde,hasta}, min, onSel(fecha), diasOperativos, soloLectura} */
function calendarioMes(o){
  const [y,m] = o.mes.split("-").map(Number), primero = o.mes+"-01", nDias = new Date(Date.UTC(y,m,0)).getUTCDate();
  const fer = {}; (o.feriados||[]).forEach(f=>{ fer[f.fecha]=f.nombre; });
  const grid = el("div",{class:"cal",role:"group","aria-label":"Calendario de "+MESC[m-1]+" "+y});
  ["L","M","M","J","V","S","D"].forEach(d=>grid.append(el("span",{class:"cal-h","aria-hidden":"true",text:d})));
  const off = (dowD(primero)+6)%7; for (let i=0;i<off;i++) grid.append(el("span",{class:"cal-v"}));
  for (let d=1; d<=nDias; d++){
    const f = o.mes+"-"+String(d).padStart(2,"0"), dw = dowD(f);
    const per = (o.periodos||[]).filter(p=>p.desde<=f && p.hasta>=f);
    const enSel = o.sel && o.sel.desde && f>=o.sel.desde && f<=(o.sel.hasta||o.sel.desde);
    const cls = ["cal-d"]; if (fer[f]) cls.push("fer"); if (o.diasOperativos && !o.diasOperativos.includes(dw)) cls.push("noabre"); if (f===hoy()) cls.push("hoy");
    if (enSel) cls.push("sel"); if (per.some(p=>p.mio)) cls.push("mio"); per.forEach(p=>{ if (p.estado) cls.push("p-"+p.estado); });
    const deshab = o.soloLectura || (o.min && f<o.min);
    const tit = [fer[f]?"Feriado: "+fer[f]:"", ...per.map(p=>(p.nombre?p.nombre+": ":"")+(EST_VAC[p.estado]?EST_VAC[p.estado][0]:p.estado||""))].filter(Boolean).join(" · ");
    const b = el(deshab?"span":"button",{class:cls.join(" "),type:deshab?null:"button",title:tit||null,"aria-label":`${d} de ${MESC[m-1]}${tit?" · "+tit:""}`,"data-f":f,onclick:deshab?null:()=>o.onSel&&o.onSel(f)}, el("span",{class:"n",text:d}),
      per.length ? el("span",{class:"dots"}, per.slice(0,3).map(p=>el("i",{class:"dot "+(p.estado||"")}))) : null);
    grid.append(b);
  }
  return el("div",{class:"calmes"}, el("div",{class:"cal-t",text:cap(MESC[m-1])+" "+y}), grid);
}
/* Varios meses con navegación. */
function calendarioVac(o){
  let ini = o.mes || hoy().slice(0,7);
  const wrap = el("div",{class:"calwrap"});
  const pintar = ()=>{ wrap.textContent="";
    const [y,m] = ini.split("-").map(Number);
    const nav = el("div",{class:"row calnav"}, el("button",{class:"btn sm",type:"button","aria-label":"Mes anterior",text:"‹",onclick:()=>{ ini = new Date(Date.UTC(y,m-2,1)).toISOString().slice(0,7); pintar(); }}),
      el("span",{class:"spacer"}), el("button",{class:"btn sm",type:"button","aria-label":"Mes siguiente",text:"›",onclick:()=>{ ini = new Date(Date.UTC(y,m,1)).toISOString().slice(0,7); pintar(); }}));
    wrap.append(nav);
    const meses = el("div",{class:"calmeses"});
    for (let i=0;i<(o.meses||2);i++){ const d=new Date(Date.UTC(y,m-1+i,1)); meses.append(calendarioMes(Object.assign({}, o, {mes:d.toISOString().slice(0,7)}))); }
    wrap.append(meses, el("div",{class:"row leyenda"}, el("span",{class:"pill"},el("i",{class:"dot aprobada"})," aprobadas"), el("span",{class:"pill"},el("i",{class:"dot pendiente"})," pendientes"), el("span",{class:"pill fer-l",text:"feriado"}), o.diasOperativos?el("span",{class:"pill noabre-l",text:"no abre"}):null)); };
  pintar(); wrap.repintar = pintar;
  return wrap;
}

/* ----- Personal: mis vacaciones (misma identificación que la fichada) ----- */
function loginEmpleado(body, texto, onOk){
  const u = el("input",{type:"text",autocomplete:"username",autocapitalize:"none",spellcheck:"false",placeholder:"Tu usuario",maxlength:"20","aria-label":"Usuario"});
  const p = el("input",{type:"password",inputmode:"numeric",autocomplete:"current-password",maxlength:"6",placeholder:"Tu PIN","aria-label":"PIN"});
  const err = el("div",{class:"notice bad",hidden:true}), b = el("button",{class:"btn primary big-btn",type:"submit",text:"Continuar"});
  body.append(el("form",{class:"card lockcard",onsubmit:async e=>{ e.preventDefault(); err.hidden=true; spinBtn(b,"Verificando…");
      try{ const r = await api("login", u.value.trim(), p.value); p.value=""; F.token=r.token; F.nombre=r.user.nombre; onOk(r); }
      catch(x){ unspin(b); err.textContent=msgErr(x); err.hidden=false; p.value=""; } }},
    el("div",{class:"lockicon",text:"🏖️"}), el("h2",{text:"Identificate"}), el("p",{class:"lead",text:texto}), el("div",{class:"grid"}, u, p, err, b)));
  setTimeout(()=>u.focus(),60);
}
function vVacacionesEmp(body){
  if (F.token) return vacEmp(body);
  loginEmpleado(body, "Usá el mismo usuario y PIN con el que fichás. Solo vos ves tus solicitudes.", ()=>{ body.textContent=""; vacEmp(body); });
}
async function vacEmp(body){
  clearTimeout(F.t); F.t = setTimeout(()=>{ finFichada(); body.textContent=""; vVacacionesEmp(body); toast("Sesión cerrada por inactividad"); }, 5*60*1000);
  body.textContent=""; body.append(el("div",{class:"card empty"}, el("span",{class:"spin"})," Cargando…"));
  let M; try{ M = await api("misVacaciones", F.token); }catch(e){ body.textContent=""; if (esAuth(e)){ F.token=null; return vVacacionesEmp(body); } return body.append(el("div",{class:"card notice bad",text:msgErr(e)})); }
  body.textContent="";
  // Novedades: solicitudes resueltas que todavía no vi
  if (M.novedades.length){
    const bl = el("button",{class:"btn sm",type:"button",text:"Marcar como leído",onclick:async e=>{ spinBtn(e.currentTarget); try{ await api("vacacionesVistas", F.token, M.novedades.map(v=>v.id)); vacEmp(body); }catch(x){ unspin(e.currentTarget); toast(msgErr(x)); } }});
    body.append(el("div",{class:"card novedades"}, el("h2",{text:"📬 Novedades"}), el("ul",{class:"action"}, M.novedades.map(v=>el("li",{}, el("span",{text:v.estado==="aprobada"?"✅":"❌"}), el("span",{}, `Tu solicitud del ${rangoVac(v.desde,v.hasta)} fue `, pillVac(v.estado), v.motivo?` · Motivo: ${v.motivo}`:"")))), bl));
  }
  // Pedir vacaciones
  const sel = {desde:null, hasta:null};
  const res = el("p",{class:"lead sel-txt",text:"Tocá el primer día y después el último."});
  const com = el("input",{type:"text",maxlength:"300",placeholder:"Comentario para tu jefe (opcional)"});
  const bS = el("button",{class:"btn primary big-btn",type:"submit",text:"Solicitar vacaciones",disabled:true});
  const periodos = M.equipo.map(e=>({desde:e.desde,hasta:e.hasta,nombre:e.nombre,estado:"aprobada"})).concat(M.mias.filter(v=>v.estado==="pendiente"||v.estado==="aprobada").map(v=>({desde:v.desde,hasta:v.hasta,nombre:"Vos",estado:v.estado,mio:true})));
  const cuenta = ()=>{ if (!sel.desde) return; const h = sel.hasta||sel.desde; const n = diasEntre(sel.desde,h);
    let habiles = 0; for (let f=sel.desde; f<=h; f=sumarD(f,1)) if (M.diasOperativos.includes(dowD(f)) && !M.feriados.some(x=>x.fecha===f)) habiles++;
    res.textContent = `Del ${rangoVac(sel.desde,h)} · ${n} día${n===1?"":"s"} corrido${n===1?"":"s"}` + (M.modoDias==="apertura" ? ` (${habiles} día${habiles===1?"":"s"} de apertura: así se cuentan)` : ` · ${habiles} de apertura`) + (n>M.maxDias?` · supera el máximo de ${M.maxDias}`:"");
    bS.disabled = !sel.hasta || n>M.maxDias; };
  const cal = calendarioVac({mes:hoy().slice(0,7), meses:2, feriados:M.feriados, periodos, sel, min:hoy(), diasOperativos:M.diasOperativos,
    onSel:f=>{ if (!sel.desde || sel.hasta){ sel.desde=f; sel.hasta=null; } else if (f<sel.desde){ sel.desde=f; } else { sel.hasta=f; } cuenta(); cal.repintar(); }});
  body.append(el("form",{class:"card",onsubmit:async e=>{ e.preventDefault(); spinBtn(bS,"Enviando…");
      try{ await api("solicitarVacaciones", F.token, sel.desde, sel.hasta||sel.desde, com.value); toast("✅ Solicitud enviada. La revisa un jefe."); vacEmp(body); }
      catch(x){ unspin(bS); toast(msgErr(x)); if (esAuth(x)){ F.token=null; body.textContent=""; vVacacionesEmp(body); } } }},
    el("h2",{text:`Pedir vacaciones · ${M.nombre.split(" ")[0]}`}), el("p",{class:"lead",text:"Elegí el primer y el último día en el calendario. Las fechas pasadas no se pueden pedir. Los puntos muestran vacaciones del equipo ya aprobadas (solo nombre y fechas)."}),
    cal, res, el("label",{class:"f"},"Comentario",com), bS));
  // Mis solicitudes
  const lista = el("div",{class:"vlist"});
  M.mias.forEach(v=>{
    const puedeCancelar = v.estado==="pendiente" || (v.estado==="aprobada" && v.desde>M.hoy);
    lista.append(el("div",{class:"vitem "+v.estado}, el("div",{class:"vinfo"}, el("b",{text:rangoVac(v.desde,v.hasta)}), el("span",{text:`${v.dias} día${v.dias===1?"":"s"} ${v.modoDias==="apertura"?"de apertura":"corridos"} · pedida el ${new Date(v.solicitado).toLocaleDateString("es-AR")}`}),
        v.comentario ? el("span",{class:"hint",text:"Tu comentario: "+v.comentario}) : null,
        v.estado==="rechazada" && v.motivo ? el("span",{class:"motivo",text:"Motivo del rechazo: "+v.motivo}) : null,
        v.decididoPor && v.estado!=="cancelada" ? el("span",{class:"hint",text:`Resuelta por ${v.decididoPor} el ${new Date(v.decidido).toLocaleDateString("es-AR")}`}) : null),
      el("div",{class:"row"}, pillVac(v.estado), puedeCancelar ? el("button",{class:"btn sm",type:"button",text:"Cancelar",onclick:async e=>{ if (!(await confirmar(`¿Cancelar la solicitud del ${rangoVac(v.desde,v.hasta)}?`,"Sí, cancelar",true))) return; try{ await api("cancelarVacaciones", F.token, v.id); toast("Solicitud cancelada"); vacEmp(body); }catch(x){ toast(msgErr(x)); } }}) : null)));
  });
  if (!M.mias.length) lista.append(el("div",{class:"empty",text:"Todavía no pediste vacaciones."}));
  body.append(el("div",{class:"card"}, el("h2",{text:"Mis vacaciones"}), lista));
  if (M.equipo.length) body.append(el("div",{class:"card"}, el("h3",{text:"Equipo de vacaciones (aprobadas)"}), el("ul",{class:"action"}, M.equipo.map(e=>el("li",{}, el("span",{text:"🏖️"}), el("span",{text:`${e.nombre}: ${rangoVac(e.desde,e.hasta)}`}))))));
  body.append(el("div",{class:"row"}, el("span",{class:"spacer"}), el("button",{class:"btn",type:"button",text:"Terminar",onclick:()=>{ finFichada(); body.textContent=""; vVacacionesEmp(body); }})));
}

/* ----- Jefes: solicitudes de vacaciones ----- */
async function vVacaciones(main){
  const body = el("div",{class:"stack"}); main.append(body);
  body.append(el("div",{class:"card empty"}, el("span",{class:"spin"})," Cargando solicitudes…"));
  let D; try{ D = await apiS("listarVacaciones"); }catch(e){ body.textContent=""; return body.append(el("div",{class:"card notice bad",text:msgErr(e)})); }
  body.textContent="";
  const recargar = ()=>{ main.textContent=""; route(); };
  const pend = D.lista.filter(v=>v.estado==="pendiente"), resto = D.lista.filter(v=>v.estado!=="pendiente");
  // Pendientes
  const lp = el("div",{class:"vlist"});
  pend.forEach(v=>{
    const cob = v.cobertura||{otras:[],feriados:[]};
    const avisos = [];
    if (cob.otras.length) avisos.push(`👥 En esas fechas ya tienen vacaciones aprobadas: ${cob.otras.map(o=>`${o.nombre} (${rangoVac(o.desde,o.hasta)})`).join(", ")}.`);
    if (cob.feriados.length) avisos.push(`🎉 Feriados en el período: ${cob.feriados.map(f=>`${fmtF(f.fecha).slice(0,5)} ${f.nombre}`).join(", ")}${cob.finDeSemanaLargo?" (fin de semana largo)":""}.`);
    const decidir = async (aprobar)=>{
      const mot = el("textarea",{maxlength:"300",placeholder: aprobar ? "Comentario (opcional)" : "Motivo del rechazo (obligatorio)"});
      const ok = el("button",{class:"btn "+(aprobar?"primary":"danger"),type:"button",text: aprobar ? "Aprobar" : "Rechazar"});
      const m = modal(el("div",{class:"grid"}, el("h2",{text:(aprobar?"Aprobar":"Rechazar")+" vacaciones · "+v.nombre}), el("p",{class:"lead",text:`${rangoVac(v.desde,v.hasta)} · ${v.dias} día${v.dias===1?"":"s"}${v.comentario?" · «"+v.comentario+"»":""}`}),
        avisos.length ? el("div",{class:"notice warn"}, el("b",{text:"Aviso de cobertura (informativo, no bloquea): "}), ...avisos.map(a=>el("div",{text:a}))) : el("div",{class:"notice ok",text:"Sin superposiciones ni feriados en el período."}),
        aprobar ? el("p",{class:"hint",text:"Mientras esté de vacaciones, la persona no cuenta como falta ni como fichada pendiente."}) : null,
        el("label",{class:"f"}, aprobar ? "Comentario" : "Motivo", mot), el("div",{class:"row"}, ok, el("button",{class:"btn",type:"button",text:"Volver",onclick:()=>m.cerrar()}))));
      ok.onclick = async ()=>{ if (!aprobar && !mot.value.trim()) return toast("Indicá el motivo del rechazo."); spinBtn(ok); try{ await apiS("resolverVacaciones", v.id, aprobar, mot.value); m.cerrar(); toast(aprobar?"✅ Vacaciones aprobadas":"Solicitud rechazada"); recargar(); }catch(e){ unspin(ok); toast(msgErr(e)); } };
    };
    lp.append(el("div",{class:"vitem pendiente"+(v.demorada?" demorada":"")}, el("div",{class:"vinfo"},
        el("b",{text:`${v.nombre} · ${rangoVac(v.desde,v.hasta)}`}), el("span",{text:`${v.dias} día${v.dias===1?"":"s"} ${v.modoDias==="apertura"?"de apertura":"corridos"} · pedida hace ${v.diasEsperando} día${v.diasEsperando===1?"":"s"}`}),
        v.comentario ? el("span",{class:"hint",text:"Comentario: "+v.comentario}) : null,
        v.demorada ? el("span",{class:"pill bad",text:"⏰ Más de 3 días sin respuesta"}) : null,
        ...avisos.map(a=>el("span",{class:"hint",text:a}))),
      el("div",{class:"row"}, el("button",{class:"btn sm primary",type:"button",text:"✔ Aprobar",onclick:()=>decidir(true)}), el("button",{class:"btn sm danger",type:"button",text:"✖ Rechazar",onclick:()=>decidir(false)}))));
  });
  if (!pend.length) lp.append(el("div",{class:"empty",text:"No hay solicitudes pendientes."}));
  body.append(el("div",{class:"card"}, el("h2",{}, "Solicitudes de vacaciones ", pend.length ? el("span",{class:"pill bad",text:pend.length+" pendiente"+(pend.length===1?"":"s")}) : null),
    el("p",{class:"lead",text:"Primero las pendientes (las más antiguas arriba). Antes de aprobar se muestra la cobertura del equipo y los feriados del período: es informativo, no bloquea."}), lp));
  // Calendario del equipo
  const periodos = D.lista.filter(v=>v.estado==="aprobada"||v.estado==="pendiente").map(v=>({desde:v.desde,hasta:v.hasta,nombre:v.nombre,estado:v.estado}));
  body.append(el("div",{class:"card"}, el("h2",{text:"Calendario del equipo"}), el("p",{class:"hint",text:"Verde: aprobadas · amarillo: pendientes · feriados marcados."}),
    calendarioVac({mes:hoy().slice(0,7), meses:2, feriados:D.feriados, periodos, soloLectura:true, diasOperativos:D.diasOperativos})));
  // Historial de decisiones (inmutable: cada decisión también queda en el Historial de la app)
  const fe = el("select",{}, el("option",{value:"",text:"Todas"}), ...["aprobada","rechazada","cancelada"].map(x=>el("option",{value:x,text:EST_VAC[x][0]})));
  const th = el("tbody");
  const pintarH = ()=>{ th.textContent=""; const L = resto.filter(v=>!fe.value||v.estado===fe.value);
    L.forEach(v=>th.append(el("tr",{}, el("td",{text:v.nombre}), el("td",{class:"mono",text:rangoVac(v.desde,v.hasta)}), el("td",{class:"n",text:v.dias}), el("td",{},pillVac(v.estado)), el("td",{text:v.decididoPor||""}), el("td",{class:"mono",text:v.decidido?new Date(v.decidido).toLocaleString("es-AR"):""}), el("td",{text:v.motivo||v.comentario||""}))));
    if (!L.length) th.append(el("tr",{},el("td",{colspan:"7",class:"empty",text:"Sin decisiones registradas."}))); };
  fe.onchange = pintarH; pintarH();
  body.append(el("div",{class:"card"}, el("div",{class:"row"}, el("h2",{style:"margin:0",text:"Historial de decisiones"}), el("span",{class:"spacer"}), el("label",{class:"f inline"},"Estado",fe)),
    el("p",{class:"hint",text:"Quién decidió, cuándo, qué y por qué. No se puede editar ni borrar; cada decisión queda además en el Historial protegido de la app."}),
    el("div",{class:"tablewrap"}, el("table",{}, el("thead",{},el("tr",{}, ...["Persona","Fechas","Días","Estado","Decidió","Cuándo","Motivo / comentario"].map(x=>el("th",{text:x})))), th))));
}
/* ===================== Cierre diario ===================== */
const ALERTA_TXT = {cierre_pendiente:"Cierre pendiente", falta_ingreso:"Ventas sin ingreso registrado", ingresos_sin_cierre:"Ingresos sin cierre", ingreso_duplicado:"Ingreso duplicado", empleado_inactivo:"Ingreso posterior a una baja",
  feriado_confirmar:"Feriado: confirmar si abrió", cierre_en_cero:"Cargado en $ 0 (sin ventas)"};
function vCierre(main){
  const ini = hoy().slice(0,8)+"01";
  const de = el("input",{type:"date",value:ini}), ha = el("input",{type:"date",value:hoy()}), body = el("div",{class:"stack"});
  const cargar = async ()=>{ body.textContent=""; body.append(el("div",{class:"card empty"}, el("span",{class:"spin"})," Cargando…"));
    let r; try{ r = await apiS("getCierre", de.value, ha.value); }catch(e){ body.textContent=""; return body.append(el("div",{class:"card notice bad",text:msgErr(e)})); }
    body.textContent="";
    const s = r.sync;
    body.append(el("div",{class:"card"}, el("h3",{text:"🔄 Sincronización con la planilla (solo lectura)"}),
      !s ? el("p",{class:"lead",text:"Todavía no se leyó la planilla."}) : el("div",{class:"grid"},
        el("div",{class:"notice "+(s.ok?(s.errores&&s.errores.length?"warn":"ok"):"bad"),text: s.ok ? `Última lectura: ${new Date(s.ts).toLocaleString("es-AR")} · ${s.dias} días con cierre · ${s.nuevos} nuevos · ${s.cambiados} con cambios` : "Error: "+s.error}),
        s.archivo ? el("span",{class:"hint",text:`Archivo: ${s.archivo} · modificado ${new Date(s.modificado).toLocaleString("es-AR")}`}) : null,
        s.errores && s.errores.length ? el("details",{}, el("summary",{text:`⚠️ ${s.errores.length} observación(es) en la planilla (para corregir)`}), el("ul",{}, s.errores.map(x=>el("li",{text:x})))) : null,
        s.avisos && s.avisos.length ? el("details",{}, el("summary",{text:`ℹ️ ${s.avisos.length} aviso(s) informativo(s) (se importa igual)`}), el("ul",{}, s.avisos.map(x=>el("li",{text:x})))) : null),
      el("p",{class:"hint",text:"La app no modifica tu planilla: la lee, calcula el total del día (tarjetas + transferencia + efectivo) y guarda una copia de los importes en su propia base."}),
      el("button",{class:"btn primary",type:"button",text:"↻ Sincronizar ahora",onclick:async e=>{ spinBtn(e.target,"Leyendo planilla…"); try{ await apiS("sincronizarCierre"); cargar(); toast("Planilla leída"); }catch(x){ unspin(e.target); toast(msgErr(x)); } }})));
    const tb = el("tbody"); let tot={t:0,tr:0,e:0,x:0};
    r.cierres.forEach(c=>{ tot.t+=c.tarjetas; tot.tr+=c.transferencia; tot.e+=c.efectivo; tot.x+=c.total;
      const notas = el("td",{class:"hint"}); if (c.anterior) notas.append(`Cambió (antes ${money(c.anterior.total)}) `);
      if (c.feriado) notas.append(el("span",{class:"pill",title:c.feriado,text:"🎉 "+c.feriado})); if (c.noHabitual) notas.append(el("span",{class:"pill warn",text:"venta en día no habitual"})); if (c.total===0) notas.append(el("span",{class:"pill",text:"sin ventas"}));
      tb.append(el("tr",{class:c.total===0?"encero":null}, el("td",{class:"mono",text:fmtF(c.fecha)}), el("td",{text:["dom","lun","mar","mié","jue","vie","sáb"][new Date(c.fecha+"T12:00:00").getDay()]}),
        el("td",{class:"n",text:money(c.tarjetas)}), el("td",{class:"n",text:money(c.transferencia)}), el("td",{class:"n",text:money(c.efectivo)}), el("td",{class:"n"},el("b",{text:money(c.total)})), notas)); });
    if (!r.cierres.length) tb.append(el("tr",{},el("td",{colspan:"7",class:"empty",text:"Sin cierres en el período."})));
    else tb.append(el("tr",{class:"tot"}, el("td",{text:"Total"}), el("td",{}), el("td",{class:"n",text:money(tot.t)}), el("td",{class:"n",text:money(tot.tr)}), el("td",{class:"n",text:money(tot.e)}), el("td",{class:"n"},el("b",{text:money(tot.x)})), el("td",{})));
    body.append(el("div",{class:"card"}, el("h2",{text:"Cierres por fecha"}), el("div",{class:"tablewrap"}, el("table",{}, el("thead",{},el("tr",{}, ...["Fecha","Día","Tarjetas","Transferencia","Efectivo","Total","Notas"].map((x,i)=>el("th",{class:i>=2&&i<=5?"n":null,text:x})))), tb))));
    const al = r.alertas||[];
    const confirmarF = (fecha, est) => async e => { const b=e.currentTarget; spinBtn(b); try{ await apiS("confirmarFeriado", fecha, est); toast(est==="cerrado"?"Marcado: estuvo cerrado":"Marcado: abrió (cierre pendiente de carga)"); cargar(); }catch(x){ unspin(b); toast(msgErr(x)); } };
    body.append(el("div",{class:"card"}, el("h3",{text:"🔎 Alertas para revisión"}),
      el("p",{class:"hint",text:"Un cierre de ventas no demuestra quién estuvo presente. Estas diferencias son para revisar, no conclusiones de incumplimiento. Quien está de vacaciones aprobadas no figura como falta."}),
      al.length ? el("ul",{class:"action"}, al.map(a=>el("li",{class:a.tipo}, el("span",{class:"mono",text:fmtF(a.fecha)}), el("span",{}, el("b",{text:(ALERTA_TXT[a.tipo]||a.tipo)+": "}), a.detalle,
        a.tipo==="feriado_confirmar" ? el("span",{class:"row",style:"margin-top:6px"}, el("button",{class:"btn sm",type:"button",text:"Estuvo cerrado",onclick:confirmarF(a.fecha,"cerrado")}), el("button",{class:"btn sm primary",type:"button",text:"Abrió",onclick:confirmarF(a.fecha,"abierto")})) : null)))) : el("p",{class:"lead",text:"Sin alertas en el período."})));
  };
  [de,ha].forEach(x=>x.onchange=cargar);
  main.append(el("div",{class:"card filters"}, el("div",{class:"grid2"}, el("label",{class:"f"},"Desde",de), el("label",{class:"f"},"Hasta",ha))), body);
  cargar();
}

/* ===================== Historial ===================== */
function vHistorial(main){
  const de = el("input",{type:"date",value:hoy().slice(0,8)+"01"}), ha = el("input",{type:"date",value:hoy()}), q = el("input",{type:"search",placeholder:"Buscar usuario, acción o detalle"});
  const body = el("div",{class:"stack"}), ver = el("div");
  const cargar = async ()=>{ body.textContent=""; let L; try{ L = await apiS("listarHistorial", de.value, ha.value, q.value); }catch(e){ return body.append(el("div",{class:"card notice bad",text:msgErr(e)})); }
    const tb = el("tbody"); L.forEach(h=>tb.append(el("tr",{}, el("td",{class:"mono",text:new Date(h.ts).toLocaleString("es-AR")}), el("td",{text:h.usuario}), el("td",{text:h.accion.replace(/_/g," ")}),
      el("td",{},el("span",{class:"pill "+(/error/.test(h.resultado)?"bad":/alerta/.test(h.resultado)?"warn":h.resultado==="ok"?"ok":""),text:h.resultado})), el("td",{class:"mono hint",text:h.ref}), el("td",{text:h.detalle}))));
    if (!L.length) tb.append(el("tr",{},el("td",{colspan:"6",class:"empty",text:"Sin eventos en el período."})));
    body.append(el("div",{class:"card"}, el("p",{class:"lead",text:`${L.length} evento(s) · hora del servidor`}), el("div",{class:"tablewrap"}, el("table",{}, el("thead",{},el("tr",{}, ...["Fecha y hora","Usuario","Acción","Resultado","Registro","Detalle"].map(x=>el("th",{text:x})))), tb)))); };
  [de,ha].forEach(x=>x.onchange=cargar); q.addEventListener("change",cargar);
  main.append(el("div",{class:"card filters"}, el("div",{class:"grid2"}, el("label",{class:"f"},"Desde",de), el("label",{class:"f"},"Hasta",ha), el("label",{class:"f"},"Buscar",q)),
    el("div",{class:"row"}, el("button",{class:"btn",type:"button",text:"🔐 Verificar integridad",onclick:async e=>{ spinBtn(e.target,"Verificando…");
      try{ const r = await apiS("verificarHistorial"); ver.textContent=""; ver.append(el("div",{class:"notice "+(r.ok?"ok":"bad"),text: r.ok ? `✅ Historial íntegro: ${r.eventos} eventos encadenados sin alteraciones.` : `⚠️ Se detectó una alteración en el evento n.º ${r.rotoEn} (${r.ts?new Date(r.ts).toLocaleString("es-AR"):""}). Revisá quién tiene acceso a la planilla.`})); }
      catch(x){ toast(msgErr(x)); } finally{ unspin(e.target); } }}), el("span",{class:"hint",text:"Cada evento queda encadenado con el anterior: si alguien edita o borra uno, la verificación lo detecta."})), ver), body);
  cargar();
}

/* ===================== Novedades de RR. HH. ===================== */
const TIPO_RH = {llegada_tarde:"Llegada tarde",inasistencia:"Inasistencia",salida_anticipada:"Salida anticipada",otra:"Otra"};
async function vRRHH(main){
  const body = el("div",{class:"stack"}); main.append(body);
  body.append(el("div",{class:"card empty"}, el("span",{class:"spin"})," Cargando…"));
  let L, P=[]; try{ [L, P] = await Promise.all([apiS("listarNovedades"), tiene("personal") ? apiS("listarPersonal") : []]); }catch(e){ body.textContent=""; return body.append(el("div",{class:"card notice bad",text:msgErr(e)})); }
  body.textContent="";
  if (P.length){
    const u = el("select",{}, ...P.filter(x=>x.estado==="activo").sort((a,b)=>a.nombre.localeCompare(b.nombre)).map(x=>el("option",{value:x.id,text:x.nombre})));
    const t = el("select",{}, ...Object.entries(TIPO_RH).map(([v,x])=>el("option",{value:v,text:x}))), f = el("input",{type:"date",value:hoy(),max:hoy()}), d = el("textarea",{maxlength:"400",placeholder:"Detalle"});
    const b = el("button",{class:"btn primary",type:"submit",text:"Registrar novedad"});
    body.append(el("form",{class:"card",onsubmit:async e=>{ e.preventDefault(); spinBtn(b); try{ await apiS("crearNovedad",{uid:u.value,tipo:t.value,fecha:f.value,detalle:d.value}); main.textContent=""; route(); toast("Novedad registrada"); }catch(x){ unspin(b); toast(msgErr(x)); } }},
      el("h2",{text:"Nueva novedad"}), el("div",{class:"grid2"}, el("label",{class:"f"},"Empleado",u), el("label",{class:"f"},"Tipo",t), el("label",{class:"f"},"Fecha",f)), el("label",{class:"f"},"Detalle",d), b));
  }
  const tb = el("tbody");
  L.forEach(n=>{ const sel = el("select",{"aria-label":"Estado"}, ...["abierta","justificada","no_justificada","cerrada"].map(v=>el("option",{value:v,text:v.replace("_"," "),selected:n.estado===v})));
    sel.onchange = async ()=>{ try{ await apiS("actualizarNovedad", n.id, sel.value, ""); toast("Estado actualizado"); }catch(e){ toast(msgErr(e)); sel.value=n.estado; } };
    tb.append(el("tr",{}, el("td",{class:"mono",text:fmtF(n.fecha)}), el("td",{text:n.nombre}), el("td",{text:TIPO_RH[n.tipo]||n.tipo}), el("td",{text:n.detalle||""}),
      el("td",{text:n.origen==="derivada_de_ingresos"?"Derivada de ingresos":"Manual"}), el("td",{text:n.creadoPor||""}), el("td",{},sel))); });
  if (!L.length) tb.append(el("tr",{},el("td",{colspan:"7",class:"empty",text:"Sin novedades."})));
  body.append(el("div",{class:"card"}, el("h2",{text:"Novedades"}), el("p",{class:"lead",text:"Circuito separado de la fichada: las alertas de ingreso no se convierten solas en novedades."}),
    el("div",{class:"tablewrap"}, el("table",{}, el("thead",{},el("tr",{}, ...["Fecha","Empleado","Tipo","Detalle","Origen","Cargó","Estado"].map(x=>el("th",{text:x})))), tb))));
}

/* ===================== Otros ===================== */
let promptInstalar = null;
addEventListener("beforeinstallprompt", e=>{ e.preventDefault(); promptInstalar=e; });
function vOtros(main){
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  main.append(el("div",{class:"card"}, el("h2",{text:"📲 Instalar la app en el teléfono"}),
    el("p",{class:"lead",text: ios ? "En iPhone: abrí este link en Safari → botón Compartir → «Agregar a inicio»." : "En Android: tocá Instalar (o menú ⋮ → «Instalar app» / «Agregar a pantalla principal»)."}),
    el("div",{class:"row"}, el("button",{class:"btn primary",type:"button",text:"Instalar",onclick:async()=>{ if (promptInstalar){ promptInstalar.prompt(); promptInstalar=null; } else toast(ios?"Usá Compartir → Agregar a inicio":"Usá el menú del navegador → Instalar app"); }}),
      el("button",{class:"btn",type:"button",text:"📋 Copiar link de la app",onclick:()=>copiar(location.origin+location.pathname,"Link copiado")}))));
  if (S.user){
    const largo = S.user.largoPin||6;
    const a = el("input",{type:"password",inputmode:"numeric",maxlength:"6",placeholder:"PIN actual"}), n = el("input",{type:"password",inputmode:"numeric",maxlength:String(largo),placeholder:`PIN nuevo (${largo} números)`}), n2 = el("input",{type:"password",inputmode:"numeric",maxlength:String(largo),placeholder:"Repetí el PIN nuevo"});
    const b = el("button",{class:"btn primary",type:"submit",text:"Cambiar PIN"});
    main.append(el("form",{class:"card",onsubmit:async e=>{ e.preventDefault(); if (n.value!==n2.value) return toast("Los PIN nuevos no coinciden.");
        spinBtn(b); try{ await api("cambiarMiPin", S.token, a.value, n.value); toast("✅ PIN cambiado. Volvé a ingresar."); salir(); }catch(x){ unspin(b); toast(msgErr(x)); } }},
      el("h2",{text:"🔑 Cambiar mi PIN"}), el("p",{class:"lead",text:"Al cambiarlo se cierran tus sesiones abiertas en otros equipos."}), el("div",{class:"grid2"}, a, n, n2), b));
  }
  main.append(el("div",{class:"card"}, el("h2",{text:"🔒 Privacidad y uso de fotos"}),
    el("ul",{class:"action"}, el("li",{text:"La foto de la fichada se usa solo para validar el registro de asistencia. La ven únicamente responsables autorizados y se borra automáticamente pasado el plazo de conservación (90 días)."}),
      el("li",{text:"La ubicación se toma una sola vez, en el momento de fichar, para validar que estés en tu sucursal. No hay seguimiento. Sin ubicación (o lejos del local) el fichaje no se registra y podés pedir un fichaje manual, que aprueba un jefe."}),
      el("li",{text:"La distancia y la hora las calcula el servidor (no se toma la hora del celular). Tu ubicación solo la ven los jefes."}),
      el("li",{text:"La app no usa reconocimiento facial. Una foto, por sí sola, no prueba identidad, hora ni ubicación: es un dato de apoyo."}),
      el("li",{text:"Cada persona solo puede ver sus propios registros. Toda acción queda en un historial protegido."}))));
}

/* ===================== Configuración ===================== */
async function vConfig(main){
  const body = el("div",{class:"stack"}); main.append(body);
  let c; try{ c = await apiS("getConfig"); }catch(e){ return body.append(el("div",{class:"card notice bad",text:msgErr(e)})); }
  const guardar = async (datos, b)=>{ spinBtn(b,"Guardando…"); try{ c = Object.assign(c, await apiS("setConfig", datos)); toast("✅ Configuración guardada"); }catch(e){ toast(msgErr(e)); } finally{ unspin(b); } };
  // 3.4 · Fichaje: las ubicaciones están por sucursal (pestaña Sucursales del módulo Fichaje y horas, o la hoja «Sucursales»)
  const red = el("select",{"aria-label":"Redondeo"}, ...[[1,"Al minuto"],[5,"A 5 minutos"],[10,"A 10 minutos"],[15,"A 15 minutos"]].map(([v,t])=>el("option",{value:v,text:t,selected:Number(c.redondeoMin||1)===v})));
  const gpm = el("input",{type:"number",min:"20",max:"500",value:c.precisionMax||100}), gpr = el("input",{type:"number",min:"5",max:"500",value:c.precisionRevisar||50});
  const au = el("textarea",{maxlength:"600"}); au.value = c.avisoUbicacion||"";
  const bU = el("button",{class:"btn primary",type:"button",text:"Guardar"});
  bU.onclick = ()=>guardar({redondeoMin:Number(red.value), precisionMax:Number(gpm.value), precisionRevisar:Number(gpr.value), avisoUbicacion:au.value}, bU);
  const inc = (c.sucursales||[]).filter(x=>x.activa && x.incompleta.length);
  body.append(el("div",{class:"card"}, el("h2",{text:"📍 Fichaje: sucursales, precisión y horas"}),
    el("p",{class:"lead",text:`Sucursales: ${(c.sucursales||[]).map(x=>x.nombre+(x.incompleta.length?" (incompleta)":"")).join(", ")||"—"}. Se editan en Fichaje y horas → Sucursales, o directamente en la hoja «Sucursales» de la planilla.`}),
    inc.length ? el("div",{class:"notice bad",text:"⚠️ Sucursales con datos faltantes: "+inc.map(x=>x.nombre+" ("+x.incompleta.join(", ")+")").join(" · ")+". Nadie de esas sucursales puede fichar con ubicación hasta completarlas."}) : null,
    el("div",{class:"row"}, el("a",{class:"btn",href:"#/ingresos/sucursales",text:"🏬 Ir a Sucursales"})),
    el("div",{class:"grid2"}, el("label",{class:"f"},"Redondeo de horas por día",red), el("label",{class:"f"},"Precisión máxima del GPS (m) para fichar",gpm), el("label",{class:"f"},"Precisión a partir de la cual queda «para revisar» (m)",gpr)),
    el("label",{class:"f"},"Aviso de ubicación (se muestra la primera vez que alguien ficha)",au), bU));
  // Fichada y retención
  const dias = [1,2,3,4,5,6,0].map(d=>{ const x=el("input",{type:"checkbox",value:d,checked:c.diasOperativos.includes(d)}); return el("label",{class:"chk"},x," "+["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"][d]); });
  const fo = el("input",{type:"checkbox",checked:c.fotoIngresoObligatoria}), ub = el("input",{type:"checkbox",checked:c.ubicacionObligatoria!==false}), ri = el("input",{type:"number",min:"7",max:"3650",value:c.retencionIngresosDias}), ra = el("input",{type:"number",min:"1",max:"120",value:c.retencionAuditoriasMeses});
  const vd = el("select",{}, el("option",{value:"corridos",text:"Días corridos",selected:c.vacacionesDias!=="apertura"}), el("option",{value:"apertura",text:"Solo días de apertura (sin feriados)",selected:c.vacacionesDias==="apertura"}));
  const av = el("textarea",{maxlength:"600"}); av.value=c.avisoFotos;
  const bF = el("button",{class:"btn primary",type:"button",text:"Guardar"});
  bF.onclick = ()=>guardar({diasOperativos:dias.map(l=>l.querySelector("input")).filter(x=>x.checked).map(x=>Number(x.value)), fotoIngresoObligatoria:fo.checked, ubicacionObligatoria:ub.checked, vacacionesDias:vd.value, retencionIngresosDias:Number(ri.value), retencionAuditoriasMeses:Number(ra.value), avisoFotos:av.value}, bF);
  body.append(el("div",{class:"card"}, el("h2",{text:"🕘 Fichada, fotos y conservación"}), el("h3",{text:"Días de apertura generales (los usa cada sucursal que no tenga los suyos)"}), el("div",{class:"chkgrid"},dias),
    el("label",{class:"chk"},fo," Foto obligatoria al fichar"),
    el("label",{class:"chk"},ub," Ubicación obligatoria al fichar (sin ubicación o fuera del radio, la fichada se rechaza y se ofrece el fichaje manual)"),
    el("label",{class:"f"},"Cómo se cuentan los días de vacaciones",vd),
    el("div",{class:"grid2"}, el("label",{class:"f"},"Conservar fotos de fichada (días)",ri), el("label",{class:"f"},"Conservar fotos de auditoría (meses)",ra)),
    el("label",{class:"f"},"Aviso al personal sobre el uso de fotos",av),
    el("p",{class:"hint",text:`Al vencer el plazo las fotos van a la papelera de Drive. Los registros (fecha, hora, estado) se conservan. Última limpieza automática: ${c.ultimaPurga?fmtF(c.ultimaPurga):"todavía no"}.`}), bF));
  // Objetivos y alertas
  const meses = (()=>{ const out=[], d=new Date(); d.setDate(1); d.setMonth(d.getMonth()-2); for(let i=0;i<8;i++){ out.push(d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")); d.setMonth(d.getMonth()+1); } return out; })();
  const obj = meses.map(m=>{ const x=el("input",{type:"number",min:"0",step:"1000",value:(c.objetivos||{})[m]||"",placeholder:"Sin objetivo","data-m":m}); return el("label",{class:"f"},cap(mesNom(m)),x); });
  const ac = c.alertasCom||{};
  const a1=el("input",{type:"number",min:"1",max:"90",value:ac.caidaPct}), a2=el("input",{type:"number",min:"1",max:"60",value:ac.mixPp}), a3=el("input",{type:"number",min:"2",max:"15",value:ac.minDias}), a4=el("input",{type:"number",min:"26",max:"90",value:ac.concentracionPct}), a5=el("input",{type:"number",min:"1",max:"90",value:ac.mesBajoPct==null?10:ac.mesBajoPct});
  const bO = el("button",{class:"btn primary",type:"button",text:"Guardar objetivos y alertas"});
  bO.onclick = ()=>{ const o = Object.assign({}, c.objetivos||{}); obj.forEach(l=>{ const x=l.querySelector("input"); if (x.value) o[x.dataset.m]=Number(x.value); else delete o[x.dataset.m]; });
    guardar({objetivos:o, alertasCom:{caidaPct:a1.value,mixPp:a2.value,minDias:a3.value,concentracionPct:a4.value,mesBajoPct:a5.value}}, bO); };
  body.append(el("div",{class:"card"}, el("h2",{text:"🎯 Objetivos de venta y alertas comerciales"}), el("h3",{text:"Objetivo mensual de facturación ($)"}), el("div",{class:"grid2"},obj),
    el("h3",{style:"margin-top:12px",text:"Umbrales de alertas"}), el("div",{class:"grid2"}, el("label",{class:"f"},"Caída de venta que alerta (%)",a1), el("label",{class:"f"},"Cambio de mix que alerta (puntos)",a2),
      el("label",{class:"f"},"Mínimo de días con cierre para comparar",a3), el("label",{class:"f"},"Concentración en un día que alerta (%)",a4), el("label",{class:"f"},"Mes bajo: % por debajo del mes anterior o del año",a5)), bO));
  // 3.3 · Feriados y excepciones
  body.append(cardFeriadosConfig(c.feriados, nuevo=>{ c.feriados=nuevo; main.textContent=""; route(); }));
  // Integración Drive
  const fid = el("input",{type:"text",value:c.cierreFileId,maxlength:"100"}), bD = el("button",{class:"btn primary",type:"button",text:"Guardar"});
  bD.onclick = ()=>guardar({cierreFileId:fid.value.trim()}, bD);
  const s = c.cierreSync;
  body.append(el("div",{class:"card"}, el("h2",{text:"🔗 Integración con Google Drive"}),
    el("p",{class:"lead",text:"Planilla de cierre de Palermo (solo lectura). Se identifica por su ID de archivo en Drive."}), el("label",{class:"f"},"ID del archivo",fid),
    el("p",{class:"hint",text: s ? `Última lectura: ${new Date(s.ts).toLocaleString("es-AR")} · ${s.ok?"correcta":"con error: "+s.error}` : "Sin lecturas todavía."}), bD));
  // Parámetros de auditoría (los existentes)
  const p = S.params, inp = (v,a)=>el("input",Object.assign({type:"number",value:v},a||{}));
  const pe=inp(p.promExc,{step:"0.1",min:"1",max:"5"}), pa=inp(p.promAdv,{step:"0.1",min:"1",max:"5"}), pm=inp(p.maxInf,{min:"0"}), pd=inp(p.diasMax,{min:"0"});
  const t1=el("textarea",{maxlength:"500"}), t2=el("textarea",{maxlength:"500"}), t3=el("textarea",{maxlength:"500"}); t1.value=p.mExc; t2.value=p.mAdv; t3.value=p.mRec;
  const bP = el("button",{class:"btn primary",type:"button",text:"Guardar parámetros"});
  bP.onclick = async ()=>{ spinBtn(bP); try{ S.params={...DEF,...await apiS("setParams",{promExc:pe.value,promAdv:pa.value,maxInf:pm.value,diasMax:pd.value,mExc:t1.value,mAdv:t2.value,mRec:t3.value})}; toast("✅ Parámetros guardados"); }catch(e){ toast(msgErr(e)); } finally{ unspin(bP); } };
  body.append(el("div",{class:"card"}, el("h2",{text:"📋 Parámetros de auditoría"}),
    el("div",{class:"grid2"}, el("label",{class:"f"},"Promedio mínimo «Excelente»",pe), el("label",{class:"f"},"Promedio mínimo «Advertencia»",pa), el("label",{class:"f"},"Infracciones máx. para «Advertencia»",pm), el("label",{class:"f"},"Días máx. de pedido sin retirar",pd)),
    el("label",{class:"f"},"✅ Mensaje Excelente",t1), el("label",{class:"f"},"⚠️ Mensaje Advertencia",t2), el("label",{class:"f"},"❌ Mensaje Reclamo",t3), bP));
  body.append(el("div",{class:"card"}, el("h2",{text:"👥 Usuarios, roles y permisos"}), el("p",{class:"lead",text:"Se administran en Empleados → Personal: alta, baja, PIN, rol y permisos por módulo."}),
    el("button",{class:"btn",type:"button",text:"Ir a Personal",onclick:()=>ir("empleados")})));
}

/* 3.3 · Configuración → Feriados de Argentina y excepciones del calendario (feriados de CABA, inventario, eventos = local cerrado). */
function cardFeriadosConfig(F, alCambiar){
  const card = el("div",{class:"card"}, el("h2",{text:"📅 Feriados y excepciones"}));
  if (!F){ card.append(el("p",{class:"lead",text:"Sin datos de feriados."})); return card; }
  const sy = F.sync;
  const estado = !sy ? "Todavía no se descargaron los feriados." : sy.ok ? `✅ Conectado: ${sy.nombreFuente||sy.fuente} · última actualización ${new Date(sy.ts).toLocaleString("es-AR")} · ${sy.total} feriados de ${sy.anios.join(" y ")}` :
    `⚠️ No pude actualizar los feriados, usando la última lista guardada${sy.ultimaOk?" (del "+new Date(sy.ultimaOk).toLocaleDateString("es-AR")+")":""}. Fuentes probadas: ${(sy.intentos||[]).map(i=>i.fuente+(i.ok?" ✓":" ✗")).join(", ")}.`;
  const bA = el("button",{class:"btn",type:"button",text:"↻ Actualizar feriados ahora",onclick:async e=>{ spinBtn(e.currentTarget,"Consultando…"); try{ const r = await apiS("actualizarFeriados"); toast(r.sync&&r.sync.ok?"Feriados actualizados":"No se pudo actualizar: se mantiene la lista guardada"); alCambiar(r); }catch(x){ unspin(e.currentTarget); toast(msgErr(x)); } }});
  card.append(el("div",{class:"notice "+(!sy?"":sy.ok?"ok":"warn"),text:estado}), el("p",{class:"hint",text:"Fuentes públicas y gratuitas, en orden: ArgentinaDatos → Nager.Date → nolaborables.com.ar. Se actualizan solas una vez por semana (activador) y también si pasaron más de 7 días."}), bA);
  const prox = (F.lista||[]).filter(f=>f.fecha>=hoy() && f.origen==="api").slice(0,8);
  card.append(el("h3",{text:"Próximos feriados nacionales"}), prox.length ? el("div",{class:"tablewrap"}, el("table",{class:"compact"}, el("thead",{},el("tr",{}, ...["Fecha","Día","Feriado","Tipo","Palermo"].map(x=>el("th",{text:x})))),
    el("tbody",{}, prox.map(f=>el("tr",{}, el("td",{class:"mono",text:fmtF(f.fecha)}), el("td",{text:f.dia+(f.abre?" (abre)":"")}), el("td",{text:f.nombre}), el("td",{text:f.tipo}), el("td",{text:f.palermo?(f.palermo==="cerrado"?"Estuvo cerrado":"Abrió"):(f.abre?"a confirmar después del día":"—")})))))) : el("p",{class:"lead",text:"Sin feriados cargados."}));
  // Excepciones
  const fe = el("input",{type:"date"}), mo = el("input",{type:"text",maxlength:"80",placeholder:"Motivo (feriado de CABA, inventario, evento…)"}), bE = el("button",{class:"btn primary",type:"button",text:"➕ Agregar excepción"});
  bE.onclick = async ()=>{ if (!fe.value||!mo.value.trim()) return toast("Completá fecha y motivo."); spinBtn(bE); try{ const r = await apiS("agregarExcepcion", fe.value, mo.value); toast("Excepción agregada: ese día cuenta como cerrado"); alCambiar(r); }catch(x){ unspin(bE); toast(msgErr(x)); } };
  const te = el("tbody"); (F.excepciones||[]).forEach(x=>te.append(el("tr",{}, el("td",{class:"mono",text:fmtF(x.fecha)}), el("td",{text:x.dia}), el("td",{text:x.nombre}), el("td",{text:x.confirmadoPor||""}),
    el("td",{}, el("button",{class:"btn sm danger",type:"button",text:"Quitar",onclick:async e=>{ if (!(await confirmar(`¿Quitar la excepción del ${fmtF(x.fecha)}?`,"Quitar",true))) return; try{ const r = await apiS("quitarExcepcion", x.fecha); toast("Excepción quitada"); alCambiar(r); }catch(err){ toast(msgErr(err)); } }})))));
  if (!(F.excepciones||[]).length) te.append(el("tr",{},el("td",{colspan:"5",class:"empty",text:"Sin excepciones. Un día de excepción se trata como local cerrado: no es cierre pendiente ni cuenta en promedios ni proyección."})));
  card.append(el("h3",{style:"margin-top:12px",text:"Excepciones (días cerrados que no son feriado nacional)"}), el("div",{class:"grid2"}, el("label",{class:"f"},"Fecha",fe), el("label",{class:"f"},"Motivo",mo)), bE,
    el("div",{class:"tablewrap",style:"margin-top:10px"}, el("table",{class:"compact"}, el("thead",{},el("tr",{}, ...["Fecha","Día","Motivo","Cargó",""].map(x=>el("th",{text:x})))), te)));
  return card;
}
/* ---------- Arranque ---------- */
document.querySelectorAll("img.logo").forEach(i=>i.src=LOGO);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(()=>{});
iniciar();
})();
