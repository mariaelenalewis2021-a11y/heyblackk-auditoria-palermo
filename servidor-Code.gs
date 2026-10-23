/**
 * Hey Blackk · Auditoría Palermo — SERVIDOR (Google Apps Script)
 *
 * Guarda las auditorías en UNA planilla de Google del Drive de la cuenta dueña
 * (única fuente de verdad) y las fotos en una carpeta de ese Drive.
 *
 * Seguridad:
 *  - No hay claves en este archivo. Las claves se crean desde la app con un
 *    código de instalación de un solo uso (función generarCodigoInstalacion).
 *  - Las claves se guardan como hash con sal (SHA-256 iterado) en las
 *    Propiedades del script, nunca en texto.
 *  - Sesiones con vencimiento: auditor/jefe 6 h para cargar; secciones de
 *    jefes 15 min. Bloqueo temporal ante intentos fallidos.
 *  - Toda entrada se valida y recorta en el servidor; se neutraliza la
 *    inyección de fórmulas en la planilla.
 */
const PROPS = PropertiesService.getScriptProperties();
const CACHE = CacheService.getScriptCache();
const TZ = 'America/Argentina/Buenos_Aires';
const TTL_APP = 6 * 60 * 60;      // sesión para cargar auditorías (máximo de CacheService)
const TTL_SECCION = 15 * 60;      // sesión de Registro/KPI/Ajustes
const MAX_FALLAS = 8, BLOQUEO_SEG = 5 * 60;
const MAX_FOTO_B64 = 2500000;     // ~1,8 MB por foto (la app ya comprime a ~300 KB)

const PUNTOS = [
  ['etiqueta', 'Prendas con etiqueta', 'Prendas sin etiqueta'],
  ['estanterias', 'Estanterías sin ropa detrás', 'Ropa detrás de estanterías'],
  ['pedidos', 'Pedidos retirados a tiempo', 'Pedidos sin retirar'],
  ['aviso', 'Palermo avisa pedidos pendientes', 'Pedidos no avisados por Palermo'],
  ['limpieza', 'Limpieza', 'Desorden / limpieza'],
  ['deposito', 'Depósito ordenado (todo en su lugar)', 'Depósito: cosas fuera de lugar'],
  ['otros', 'Otros', 'Otros']
];
const DEF = {
  promExc: 4.5, promAdv: 3, maxInf: 3, diasMax: 7,
  mExc: '¡Felicitaciones! El local está impecable: prendas etiquetadas, depósito ordenado y pedidos al día. Gracias por el compromiso, sigamos así.',
  mAdv: 'Atención: se detectaron algunas observaciones que hay que corregir antes de la próxima visita.',
  mRec: 'Reclamo formal: se registraron demasiadas infracciones. Es necesario corregirlas de inmediato y avisar siempre los pedidos pendientes de retiro. Esperamos respuesta con el plan de acción.'
};
const HEAD = ['ID', 'Fecha', 'Auditor', ...PUNTOS.map(p => p[1]), 'Promedio', 'Resultado',
  ...PUNTOS.map(p => 'Infr. ' + p[2]), 'Total infracciones', 'Checklist', 'Días pedido más viejo', 'Pedido fuera de plazo',
  'Comentario general', ...PUNTOS.map(p => 'Coment. ' + p[1]), 'Fotos', 'Cargada', 'JSON'];

/* =================== Instalación (se corre UNA vez desde el editor) =================== */
/**
 * Ejecutá esta función desde el editor (botón ▶ Ejecutar). En "Registro de ejecución"
 * aparece un código de 8 caracteres que vence en 30 minutos. Ingresalo en la app
 * para crear la clave de jefes y la de auditor.
 */
function generarCodigoInstalacion() {
  const code = Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase();
  PROPS.setProperty('SETUP', JSON.stringify({ code: code, exp: Date.now() + 30 * 60 * 1000 }));
  ss_(); carpeta_();
  console.log('Código de instalación (vence en 30 min): ' + code);
  return code;
}

/* =================== API =================== */
function doGet() {
  return json_({ ok: true, app: 'heyblackk-auditoria', v: 2 });
}
function doPost(e) {
  let req;
  try { req = JSON.parse(e && e.postData && e.postData.contents || '{}'); } catch (x) { return json_({ ok: false, error: 'Pedido inválido.' }); }
  const fn = API[req && req.fn];
  if (!fn) return json_({ ok: false, error: 'Acción desconocida.' });
  try {
    return json_({ ok: true, data: fn.apply(null, Array.isArray(req.args) ? req.args : []) });
  } catch (err) {
    const m = String(err && err.message || err);
    return json_({ ok: false, error: m === 'AUTH' ? 'AUTH' : m.replace(/^Error:\s*/, '').slice(0, 200) });
  }
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

const API = {
  estado: () => ({ configurado: !!PROPS.getProperty('KEY_JEFE') && !!PROPS.getProperty('KEY_AUD') }),
  configurar: configurar,
  login: login,
  logout: logout,
  getParams: () => params_(),
  guardarAuditoria: guardarAuditoria,
  getRegistro: getRegistro,
  eliminarAuditoria: eliminarAuditoria,
  vaciarRegistro: vaciarRegistro,
  getFoto: getFoto,
  hojaUrl: hojaUrl,
  setParams: setParams,
  cambiarClave: cambiarClave
};

/* =================== Almacenamiento =================== */
function ss_() {
  const id = PROPS.getProperty('SS_ID');
  if (id) { try { return SpreadsheetApp.openById(id); } catch (e) {} }
  const ss = SpreadsheetApp.create('HeyBlackk · Auditorías Palermo');
  PROPS.setProperty('SS_ID', ss.getId());
  const sh = ss.getSheets()[0];
  sh.setName('Registro');
  sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD]).setFontWeight('bold').setFontColor('#ffffff')
    .setBackground('#111113').setWrap(true).setVerticalAlignment('middle').setHorizontalAlignment('center');
  sh.setFrozenRows(1); sh.setRowHeight(1, 48);
  sh.hideColumns(HEAD.length);
  sh.hideColumns(1);
  return ss;
}
function hoja_() { return ss_().getSheetByName('Registro'); }
function carpeta_() {
  const id = PROPS.getProperty('FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  const f = DriveApp.createFolder('HeyBlackk · Auditorías Palermo · Fotos');
  PROPS.setProperty('FOLDER_ID', f.getId());
  return f;
}
function params_() {
  try { return Object.assign({}, DEF, JSON.parse(PROPS.getProperty('PARAMS') || '{}')); } catch (e) { return Object.assign({}, DEF); }
}

/* =================== Claves y sesiones =================== */
function hash_(pw, salt) {
  let b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + pw, Utilities.Charset.UTF_8);
  const s = Utilities.newBlob(salt).getBytes();
  for (let i = 0; i < 1500; i++) b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, b.concat(s));
  return Utilities.base64Encode(b);
}
function eq_(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function setKey_(name, pw) {
  const salt = Utilities.getUuid();
  PROPS.setProperty(name, JSON.stringify({ salt: salt, hash: hash_(pw, salt) }));
}
function checkKey_(name, pw) {
  const k = JSON.parse(PROPS.getProperty(name) || 'null');
  return !!k && eq_(hash_(String(pw || ''), k.salt), k.hash);
}
function validarClave_(pw) {
  pw = String(pw || '');
  if (pw.length < 6 || pw.length > 128) throw new Error('La clave tiene que tener entre 6 y 128 caracteres.');
  return pw;
}
function fallas_() { return Number(CACHE.get('fallas') || 0); }
function sumarFalla_() { CACHE.put('fallas', String(fallas_() + 1), BLOQUEO_SEG); }
function sesion_(token, nivel) {
  const r = token && /^[0-9a-f-]{36}$/.test(String(token)) ? CACHE.get('t_' + token) : null;
  if (!r) throw new Error('AUTH');
  if (nivel === 'seccion' && r !== 'seccion') throw new Error('AUTH');
  return r;
}

function configurar(codigo, jefe, auditor) {
  if (API.estado().configurado) throw new Error('Las claves ya están creadas.');
  if (fallas_() >= MAX_FALLAS) throw new Error('Demasiados intentos fallidos. Esperá 5 minutos.');
  const s = JSON.parse(PROPS.getProperty('SETUP') || 'null');
  if (!s || Date.now() > s.exp || !eq_(String(codigo || '').trim().toUpperCase(), s.code)) {
    sumarFalla_();
    throw new Error('Código de instalación inválido o vencido. Generá uno nuevo desde el editor.');
  }
  jefe = validarClave_(jefe); auditor = validarClave_(auditor);
  if (jefe === auditor) throw new Error('La clave de jefes y la de auditor tienen que ser distintas.');
  setKey_('KEY_JEFE', jefe); setKey_('KEY_AUD', auditor);
  PROPS.deleteProperty('SETUP');
  ss_(); carpeta_();
  return true;
}

/** nivel 'app' acepta clave de auditor o de jefes; nivel 'seccion' exige la de jefes. */
function login(pw, nivel) {
  if (fallas_() >= MAX_FALLAS) throw new Error('Demasiados intentos fallidos. Esperá 5 minutos.');
  let rol = null;
  if (checkKey_('KEY_JEFE', pw)) rol = nivel === 'seccion' ? 'seccion' : 'jefe';
  else if (nivel !== 'seccion' && checkKey_('KEY_AUD', pw)) rol = 'auditor';
  if (!rol) { sumarFalla_(); throw new Error(nivel === 'seccion' ? 'Clave de jefes incorrecta.' : 'Clave incorrecta.'); }
  const token = Utilities.getUuid();
  CACHE.put('t_' + token, rol, rol === 'seccion' ? TTL_SECCION : TTL_APP);
  return { token: token, rol: rol, params: params_() };
}
function logout(token) { if (token && /^[0-9a-f-]{36}$/.test(String(token))) CACHE.remove('t_' + token); return true; }

/* =================== Auditorías =================== */
const txt_ = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
const celda_ = s => /^[=+\-@\t\r]/.test(s) ? "'" + s : s;

function guardarAuditoria(token, data, fotos) {
  sesion_(token);
  data = data || {};
  const p = params_();
  const rec = {
    id: Utilities.getUuid(),
    fecha: /^\d{4}-\d{2}-\d{2}$/.test(data.fecha) ? data.fecha : Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'),
    creado: new Date().toISOString(),
    auditor: txt_(data.auditor, 60),
    sucursal: 'Palermo',
    puntajes: {}, infracciones: {}, comentarios: {},
    diasPedido: data.diasPedido === '' || data.diasPedido == null ? null : Math.max(0, Math.min(999, Math.round(Number(data.diasPedido) || 0))),
    comentarioGeneral: txt_(data.comentarioGeneral, 600),
    fotos: [], umbrales: { promExc: p.promExc, promAdv: p.promAdv, maxInf: p.maxInf, diasMax: p.diasMax }
  };
  if (!rec.auditor) throw new Error('Falta el nombre del auditor.');
  PUNTOS.forEach(x => {
    const v = Math.round(Number(data.puntajes && data.puntajes[x[0]]));
    if (!(v >= 1 && v <= 5)) throw new Error('Faltan puntos por evaluar.');
    rec.puntajes[x[0]] = v;
    rec.infracciones[x[0]] = Math.max(0, Math.min(999, Math.round(Number(data.infracciones && data.infracciones[x[0]]) || 0)));
    const c = txt_(data.comentarios && data.comentarios[x[0]], 200); if (c) rec.comentarios[x[0]] = c;
  });
  const prom = PUNTOS.reduce((a, x) => a + rec.puntajes[x[0]], 0) / PUNTOS.length;
  const tot = PUNTOS.reduce((a, x) => a + rec.infracciones[x[0]], 0);
  rec.promedio = Math.round(prom * 100) / 100;
  rec.resultado = prom >= p.promExc ? 'Excelente' : prom >= p.promAdv ? 'Advertencia' : 'Reclamo';
  rec.totalInfracciones = tot;
  rec.resultadoChecklist = tot === 0 ? 'Excelente' : tot <= p.maxInf ? 'Advertencia' : 'Reclamo';
  rec.pedidoFueraDePlazo = rec.diasPedido != null && rec.diasPedido > p.diasMax;

  (Array.isArray(fotos) ? fotos : []).slice(0, 4).forEach((f, i) => {
    const m = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/.exec(String(f || ''));
    if (!m || m[2].length > MAX_FOTO_B64) return;
    const nombre = rec.fecha + '_' + rec.auditor.replace(/[^\wÀ-ÿ ]/g, '').slice(0, 30) + '_' + (i + 1) + (m[1] === 'png' ? '.png' : '.jpg');
    const blob = Utilities.newBlob(Utilities.base64Decode(m[2]), 'image/' + m[1], nombre);
    rec.fotos.push(carpeta_().createFile(blob).getId());
  });

  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const sh = hoja_();
    const [y, mo, d] = rec.fecha.split('-').map(Number);
    sh.appendRow([rec.id, new Date(y, mo - 1, d), celda_(rec.auditor), ...PUNTOS.map(x => rec.puntajes[x[0]]), rec.promedio, rec.resultado,
      ...PUNTOS.map(x => rec.infracciones[x[0]]), rec.totalInfracciones, rec.resultadoChecklist, rec.diasPedido == null ? '' : rec.diasPedido,
      rec.pedidoFueraDePlazo ? 'Sí' : 'No', celda_(rec.comentarioGeneral), ...PUNTOS.map(x => celda_(rec.comentarios[x[0]] || '')),
      rec.fotos.length, Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm'), JSON.stringify(rec)]);
    const r = sh.getLastRow(), N = PUNTOS.length;
    sh.getRange(r, 2).setNumberFormat('dd/mm/yyyy');
    sh.getRange(r, 4 + N).setNumberFormat('0.0');
    const col = { Excelente: ['#DCFCE7', '#15803D'], Advertencia: ['#FEF3C7', '#B45309'], Reclamo: ['#FEE2E2', '#C81E1E'] };
    [[5 + N, rec.resultado], [7 + 2 * N, rec.resultadoChecklist]].forEach(([c, res]) =>
      sh.getRange(r, c).setBackground(col[res][0]).setFontColor(col[res][1]).setFontWeight('bold'));
    const sc = { 1: ['#FEE4E2', '#D92D20'], 2: ['#FFE8D9', '#E8590C'], 3: ['#FEF3C7', '#A16207'], 4: ['#DCFCE7', '#16A34A'], 5: ['#C9F2D9', '#0E7A3E'] };
    PUNTOS.forEach((x, j) => { const v = rec.puntajes[x[0]]; sh.getRange(r, 4 + j).setBackground(sc[v][0]).setFontColor(sc[v][1]).setFontWeight('bold').setHorizontalAlignment('center'); });
  } finally { lock.releaseLock(); }
  return rec;
}

function leer_() {
  const sh = hoja_(), n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, HEAD.length, n, 1).getValues().map(r => { try { return JSON.parse(r[0]); } catch (e) { return null; } }).filter(Boolean);
}
function getRegistro(token) { sesion_(token, 'seccion'); return { lista: leer_(), params: params_() }; }

function eliminarAuditoria(token, id) {
  sesion_(token, 'seccion');
  id = String(id || '');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const sh = hoja_(), n = sh.getLastRow() - 1; if (n < 1) return false;
    const ids = sh.getRange(2, 1, n, 1).getValues();
    for (let i = ids.length - 1; i >= 0; i--) if (ids[i][0] === id) { sh.deleteRow(i + 2); return true; }
    return false;
  } finally { lock.releaseLock(); }
}

/** Vaciar: primero copia la planilla completa como respaldo en el Drive, después limpia el registro. */
function vaciarRegistro(token, clave) {
  sesion_(token, 'seccion');
  if (!checkKey_('KEY_JEFE', clave)) { sumarFalla_(); throw new Error('Clave de jefes incorrecta.'); }
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const ss = ss_(), sh = hoja_(), n = sh.getLastRow() - 1;
    if (n < 1) return { borradas: 0 };
    const copia = ss.copy('HeyBlackk · Auditorías Palermo · Respaldo ' + Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH.mm'));
    sh.deleteRows(2, n);
    return { borradas: n, respaldo: copia.getUrl() };
  } finally { lock.releaseLock(); }
}

function getFoto(token, id) {
  sesion_(token, 'seccion');
  id = String(id || '');
  if (!/^[\w-]{10,100}$/.test(id)) throw new Error('Foto no disponible.');
  let f, ok = false;
  try { f = DriveApp.getFileById(id); const parents = f.getParents(); ok = parents.hasNext() && parents.next().getId() === carpeta_().getId(); } catch (e) {}
  if (!ok) throw new Error('Foto no disponible.');
  const b = f.getBlob();
  return 'data:' + b.getContentType() + ';base64,' + Utilities.base64Encode(b.getBytes());
}

function hojaUrl(token) { sesion_(token, 'seccion'); return ss_().getUrl(); }

/* =================== Ajustes =================== */
function setParams(token, p) {
  sesion_(token, 'seccion');
  p = p || {};
  const n = (v, d, lo, hi) => { v = Number(v); return isFinite(v) && String(v) !== '' ? Math.min(hi, Math.max(lo, v)) : d; };
  const out = {
    promExc: n(p.promExc, DEF.promExc, 1, 5), promAdv: n(p.promAdv, DEF.promAdv, 1, 5),
    maxInf: Math.round(n(p.maxInf, DEF.maxInf, 0, 999)), diasMax: Math.round(n(p.diasMax, DEF.diasMax, 0, 365)),
    mExc: txt_(p.mExc, 500) || DEF.mExc, mAdv: txt_(p.mAdv, 500) || DEF.mAdv, mRec: txt_(p.mRec, 500) || DEF.mRec
  };
  if (out.promAdv > out.promExc) throw new Error('El mínimo de Advertencia no puede superar al de Excelente.');
  PROPS.setProperty('PARAMS', JSON.stringify(out));
  return out;
}
function cambiarClave(token, cual, actualJefe, nueva) {
  sesion_(token, 'seccion');
  if (!checkKey_('KEY_JEFE', actualJefe)) { sumarFalla_(); throw new Error('La clave de jefes actual no es correcta.'); }
  nueva = validarClave_(nueva);
  const es = cual === 'jefe' ? 'KEY_JEFE' : 'KEY_AUD', otra = cual === 'jefe' ? 'KEY_AUD' : 'KEY_JEFE';
  if (checkKey_(otra, nueva)) throw new Error('La clave de jefes y la de auditor tienen que ser distintas.');
  setKey_(es, nueva);
  return true;
}
