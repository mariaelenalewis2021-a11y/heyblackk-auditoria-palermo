/**
 * Hey Blackk · Palermo — SERVIDOR v3 (Google Apps Script)
 *
 * Única fuente de datos: planilla "HeyBlackk · Auditorías Palermo" en el Drive de la cuenta dueña.
 * Hojas: Registro (auditorías, se conserva), Usuarios, Ingresos, Correcciones, Acciones, RRHH, Cierres, Historial.
 *
 * Seguridad:
 *  - Usuario individual por persona (legajo + PIN de 6 dígitos). PIN con sal + pimienta (secreto del servidor),
 *    SHA-256 iterado. Nunca se guarda en texto ni viaja de vuelta.
 *  - Permisos por módulo validados en el servidor en CADA operación. Roles: empleado / responsable / admin.
 *  - Sesiones con vencimiento y revocación (versión por usuario). Reautenticación con PIN para operaciones sensibles.
 *  - Bloqueo por usuario tras intentos fallidos + límite global.
 *  - Historial encadenado por hash (detecta alteraciones). Sin endpoints para editarlo.
 *  - Fotos en carpetas privadas de Drive, servidas solo por API autenticada. Retención automática.
 *  - Planilla de cierre: SOLO LECTURA (se lee el .xlsx sin convertirlo ni copiarlo).
 */
const PROPS = PropertiesService.getScriptProperties();
const CACHE = CacheService.getScriptCache();
const TZ = 'America/Argentina/Buenos_Aires';
const VERSION = 3;
const REV = '3.2';                        // revisión del servidor (para verificar despliegues)

/* Sesiones (3.2): la de jefes/administración vence por INACTIVIDAD (se renueva con cada uso) y tiene un máximo absoluto;
   la del personal que ficha es corta y fija. La validación es siempre del servidor: cada llamada verifica token, usuario activo,
   versión de credenciales, permiso del módulo y, si corresponde, reautenticación reciente (ELEV). */
const SESION = { empleado: { inact: 10 * 60, max: 10 * 60 }, responsable: { inact: 30 * 60, max: 10 * 60 * 60 }, admin: { inact: 30 * 60, max: 10 * 60 * 60 } };
const politica_ = rol => SESION[rol] || SESION.empleado;
const politicaPub_ = rol => ({ inactividadSeg: politica_(rol).inact, maximoSeg: politica_(rol).max });
const ELEV_MS = 5 * 60 * 1000;            // reautenticación válida 5 min
const FALLAS_USUARIO = 5, BLOQUEO_USUARIO_SEG = 15 * 60;
const FALLAS_GLOBAL = 60, VENTANA_GLOBAL_SEG = 10 * 60;
const MAX_FOTO_B64 = 2500000;
const CIERRE_FILE_DEF = '1NuRUTwd9RwMWC5DdnDR0OS0_0XuPKMH1';

const MODULOS = ['ingresos', 'auditar', 'auditoria', 'acciones', 'kpi', 'historial', 'cierre', 'rrhh', 'otros', 'personal', 'config'];
const PERMS_ROL = {
  empleado: [],
  responsable: ['ingresos', 'auditar', 'auditoria', 'acciones', 'kpi', 'cierre', 'otros'],
  admin: MODULOS.slice()
};

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
const CFG_DEF = {
  diasOperativos: [3, 4, 5, 6],          // 0=dom … 6=sáb (miércoles a sábado)
  local: null,                            // {lat, lng, radio}
  radioDef: 150,
  fotoIngresoObligatoria: true,
  retencionIngresosDias: 90,
  retencionAuditoriasMeses: 12,
  cierreFileId: CIERRE_FILE_DEF,
  objetivos: {},                          // {'2026-10': 15000000} — los carga un administrador
  alertasCom: { caidaPct: 15, mixPp: 10, minDias: 4, concentracionPct: 45 },
  avisoFotos: 'La foto de ingreso se usa solo para validar el registro de asistencia al showroom. La ven únicamente los responsables autorizados y se elimina automáticamente a los 90 días.'
};

/* ---------- Auditorías (hoja existente) ---------- */
const HEAD = ['ID', 'Fecha', 'Auditor', ...PUNTOS.map(p => p[1]), 'Promedio', 'Resultado',
  ...PUNTOS.map(p => 'Infr. ' + p[2]), 'Total infracciones', 'Checklist', 'Días pedido más viejo', 'Pedido fuera de plazo',
  'Comentario general', ...PUNTOS.map(p => 'Coment. ' + p[1]), 'Fotos', 'Cargada', 'JSON'];

/* ---------- Tablas nuevas (columnas legibles + JSON completo al final) ---------- */
const TABLAS = {
  Usuarios: ['id', 'legajo', 'nombre', 'sector', 'rol', 'estado', 'registraIngreso', 'fechaIngreso', 'fechaBaja', 'actualizado'],
  Ingresos: ['id', 'fecha', 'tipo', 'legajo', 'nombre', 'hora', 'estado', 'geoResultado', 'tieneFoto', 'horaCorregida', 'creado'],
  Correcciones: ['id', 'ingresoId', 'tipo', 'legajo', 'nombre', 'fecha', 'horaPropuesta', 'motivo', 'estado', 'resueltoPor', 'resuelto', 'creado'],
  Acciones: ['id', 'auditId', 'punto', 'descripcion', 'responsable', 'vence', 'estado', 'creado', 'cerrado'],
  RRHH: ['id', 'legajo', 'nombre', 'fecha', 'tipo', 'detalle', 'origen', 'estado', 'creadoPor', 'creado'],
  Cierres: ['fecha', 'tarjetas', 'transferencia', 'efectivo', 'total', 'hoja', 'columna', 'sincronizado'],
  Historial: ['ts', 'usuario', 'accion', 'resultado', 'ref', 'detalle', 'hash']
};

/* =================== Instalación =================== */
function generarCodigoInstalacion() {
  const code = Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase();
  PROPS.setProperty('SETUP', JSON.stringify({ code: code, exp: Date.now() + 30 * 60 * 1000 }));
  ss_(); carpeta_('FOLDER_ID', 'HeyBlackk · Auditorías Palermo · Fotos');
  console.log('Código de instalación (vence en 30 min): ' + code);
  return code;
}

/* =================== API =================== */
function doGet() { return json_({ ok: true, app: 'heyblackk-palermo', v: VERSION, rev: REV }); }
/* Llamadas sensibles a la latencia (fichada, arranque, fotos): la limpieza diaria de fotos no se cuelga de ellas. */
const RAPIDAS_ = { estado: 1, inicio: 1, resumenHoy: 1, login: 1, logout: 1, yo: 1, reauth: 1, miJornada: 1, misIngresos: 1, registrarFichada: 1, registrarIngreso: 1, solicitarCorreccion: 1, getParams: 1, getAviso: 1, fotoIngreso: 1, getFoto: 1 };
function doPost(e) {
  SS_ = null; MEMO_ = {};   // cada pedido arranca sin datos memorizados
  let req;
  try { req = JSON.parse(e && e.postData && e.postData.contents || '{}'); } catch (x) { return json_({ ok: false, error: 'Pedido inválido.' }); }
  const fn = API[req && req.fn];
  if (!fn || typeof req.fn !== 'string' || !Object.prototype.hasOwnProperty.call(API, req.fn)) return json_({ ok: false, error: 'Acción desconocida.' });
  try {
    const out = fn.apply(null, Array.isArray(req.args) ? req.args.slice(0, 8) : []);
    if (!RAPIDAS_[req.fn]) { try { purgaDiaria_(); } catch (x) {} }
    return json_({ ok: true, data: out });
  } catch (err) {
    const m = String(err && err.message || err);
    if (m === 'AUTH' || m === 'PERM' || m === 'ELEV' || m.indexOf('DUP:') === 0) return json_({ ok: false, error: m });
    if (!/^[^\n]{1,200}$/.test(m) || /Exception|TypeError|ReferenceError|undefined|null/.test(m)) {
      try { log_(null, 'error_servidor', 'error', req.fn, m.slice(0, 300)); } catch (x) {}
      return json_({ ok: false, error: 'No se pudo completar la operación. Probá de nuevo.' });
    }
    return json_({ ok: false, error: m.replace(/^Error:\s*/, '') });
  }
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

const API = {
  estado: estado, inicio: inicio, resumenHoy: resumenHoy, bootstrapAdmin: bootstrapAdmin, login: login, logout: logout, reauth: reauth, yo: yo, cambiarMiPin: cambiarMiPin,
  getParams: () => params_(), getAviso: () => cfg_().avisoFotos,
  // Empleados / ingreso
  registrarIngreso: registrarIngreso, registrarFichada: registrarFichada, miJornada: miJornada, misIngresos: misIngresos, solicitarCorreccion: solicitarCorreccion,
  // Personal (altas, bajas)
  listarPersonal: listarPersonal, altaEmpleado: altaEmpleado, editarEmpleado: editarEmpleado, bajaEmpleado: bajaEmpleado,
  reactivarEmpleado: reactivarEmpleado, resetPin: resetPin, cambiarRol: cambiarRol,
  // Registro de ingresos (admin)
  listarIngresos: listarIngresos, fotoIngreso: fotoIngreso, resolverCorreccion: resolverCorreccion, observarIngreso: observarIngreso,
  derivarRRHH: derivarRRHH, exportarIngresos: exportarIngresos,
  // Auditoría
  guardarAuditoria: guardarAuditoria, getRegistro: getRegistro, eliminarAuditoria: eliminarAuditoria, vaciarRegistro: vaciarRegistro,
  getFoto: getFoto, hojaUrl: hojaUrl, listarAcciones: listarAcciones, crearAccion: crearAccion, actualizarAccion: actualizarAccion,
  // Cierre, KPIs, Historial, RRHH, Config
  sincronizarCierre: sincronizarCierre, getCierre: getCierre, getKPIs: getKPIs,
  listarHistorial: listarHistorial, verificarHistorial: verificarHistorial,
  listarNovedades: listarNovedades, crearNovedad: crearNovedad, actualizarNovedad: actualizarNovedad,
  getConfig: getConfig, setConfig: setConfig, setParams: setParams, cerrarSesionesDe: cerrarSesionesDe
};

/* =================== Almacenamiento =================== */
/* Memoria de un solo pedido: la planilla abierta y las tablas ya leídas. Se vacía al entrar a doPost y al tomar el bloqueo,
   así cada sección crítica lee datos frescos. Evita abrir la planilla y releer la misma tabla varias veces por pedido. */
let SS_ = null, MEMO_ = {};
function ss_() {
  if (SS_) return SS_;
  const id = PROPS.getProperty('SS_ID');
  if (id) { try { return (SS_ = SpreadsheetApp.openById(id)); } catch (e) {} }
  const ss = SpreadsheetApp.create('HeyBlackk · Auditorías Palermo');
  PROPS.setProperty('SS_ID', ss.getId());
  const sh = ss.getSheets()[0];
  sh.setName('Registro');
  sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD]).setFontWeight('bold').setFontColor('#ffffff')
    .setBackground('#111113').setWrap(true).setVerticalAlignment('middle').setHorizontalAlignment('center');
  sh.setFrozenRows(1); sh.setRowHeight(1, 48); sh.hideColumns(HEAD.length); sh.hideColumns(1);
  return (SS_ = ss);
}
function hoja_() { return ss_().getSheetByName('Registro'); }
function tabla_(nombre) {
  const ss = ss_();
  let sh = ss.getSheetByName(nombre);
  if (!sh) {
    sh = ss.insertSheet(nombre);
    const cols = TABLAS[nombre].concat(['JSON']);
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold').setFontColor('#ffffff').setBackground('#111113');
    sh.setFrozenRows(1); sh.hideColumns(cols.length);
    if (nombre === 'Historial' || nombre === 'Usuarios') {
      try { const p = sh.protect().setDescription('Solo el servidor de la app'); p.removeEditors(p.getEditors()); } catch (e) {}
    }
  }
  return sh;
}
function filaDe_(nombre, o) {
  return TABLAS[nombre].map(k => {
    let v = o[k];
    if (v == null) return '';
    if (typeof v === 'object') v = JSON.stringify(v);
    return typeof v === 'string' ? celda_(v) : v;
  }).concat([JSON.stringify(o)]);
}
function jsonCol_(nombre) {
  const sh = tabla_(nombre), n = sh.getLastRow() - 1, nc = TABLAS[nombre].length + 1;
  if (n < 1) return [];
  return sh.getRange(2, nc, n, 1).getValues().map(r => { try { return JSON.parse(r[0]); } catch (e) { return null; } });
}
function tAll_(nombre) {
  if (!MEMO_[nombre]) MEMO_[nombre] = jsonCol_(nombre).filter(Boolean);
  return MEMO_[nombre].slice();
}
function tAdd_(nombre, o) { tabla_(nombre).appendRow(filaDe_(nombre, o)); delete MEMO_[nombre]; return o; }
/* Busca la fila por la clave dentro del JSON (no por la celda visible: Sheets convierte textos como 2026-06-03 en fechas). */
function tUpd_(nombre, key, val, o) {
  delete MEMO_[nombre];
  const filas = jsonCol_(nombre);
  for (let i = 0; i < filas.length; i++) if (filas[i] && String(filas[i][key]) === String(val)) {
    const row = filaDe_(nombre, o);
    tabla_(nombre).getRange(i + 2, 1, 1, row.length).setValues([row]);
    return true;
  }
  return false;
}
function carpeta_(prop, nombre) {
  const id = PROPS.getProperty(prop);
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  const f = DriveApp.createFolder(nombre);
  PROPS.setProperty(prop, f.getId());
  return f;
}
const fotosAud_ = () => carpeta_('FOLDER_ID', 'HeyBlackk · Auditorías Palermo · Fotos');
const fotosIng_ = () => carpeta_('FOLDER_ING', 'HeyBlackk · Palermo · Fotos de ingreso (privado)');
function params_() { try { return Object.assign({}, DEF, JSON.parse(PROPS.getProperty('PARAMS') || '{}')); } catch (e) { return Object.assign({}, DEF); } }
function cfg_() { try { return Object.assign({}, CFG_DEF, JSON.parse(PROPS.getProperty('CFG') || '{}')); } catch (e) { return Object.assign({}, CFG_DEF); } }
/** Bloqueo re-entrante: una operación que ya tiene el bloqueo no lo libera antes de tiempo al registrar en el historial. */
let LOCK_DEPTH = 0;
function lock_(fn) {
  if (LOCK_DEPTH > 0) { LOCK_DEPTH++; try { return fn(); } finally { LOCK_DEPTH--; } }
  const l = LockService.getScriptLock(); l.waitLock(25000); LOCK_DEPTH = 1; MEMO_ = {};   // dentro del bloqueo se lee fresco
  try { return fn(); } finally { LOCK_DEPTH = 0; l.releaseLock(); }
}

/* =================== Utilidades =================== */
const txt_ = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
const celda_ = s => /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
const hoy_ = () => Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
const hora_ = d => Utilities.formatDate(d || new Date(), TZ, 'HH:mm:ss');
const fechaOk_ = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) ? String(s) : null;
const horaOk_ = s => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s || '')) ? String(s) : null;
function sha_(s) { return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)); }
function pepper_() {
  let p = PROPS.getProperty('PEPPER');
  if (!p) { p = Utilities.getUuid() + Utilities.getUuid(); PROPS.setProperty('PEPPER', p); }
  return p;
}
function hashPin_(pin, salt) {
  const s = Utilities.newBlob(salt + pepper_()).getBytes();
  let b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + pin + '|' + pepper_(), Utilities.Charset.UTF_8);
  for (let i = 0; i < 3000; i++) b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, b.concat(s));
  return Utilities.base64Encode(b);
}
function eq_(a, b) { a = String(a); b = String(b); if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
/** Empleados: PIN de 4 números (lo asigna un jefe). Responsables y administradores: 6 números. */
const largoPin_ = rol => rol === 'empleado' ? 4 : 6;
function pinValido_(pin, largo) {
  largo = largo || 6; pin = String(pin == null ? '' : pin).trim();
  if (!new RegExp('^\\d{' + largo + '}$').test(pin)) throw new Error('El PIN tiene que tener ' + largo + ' números.');
  if (/^(\d)\1+$/.test(pin) || '01234567890'.indexOf(pin) >= 0 || '9876543210'.indexOf(pin) >= 0)
    throw new Error('Elegí un PIN menos predecible (no ' + '1'.repeat(largo) + ' ni ' + '1234567890'.slice(0, largo) + ').');
  return pin;
}
function pinAleatorio_(largo) {
  largo = largo || 6; let p;
  do { p = ''; for (let i = 0; i < largo; i++) p += String(Math.floor(Math.random() * 10)); try { pinValido_(p, largo); } catch (e) { p = null; } } while (!p);
  return p;
}
function nuevoId_(pref) { return pref + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 12); }
function dataUrlFoto_(f) {
  const m = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/.exec(String(f || ''));
  if (!m || m[2].length > MAX_FOTO_B64) return null;
  const bytes = Utilities.base64Decode(m[2]);
  // Validación de contenido real (firma de archivo), no solo del encabezado declarado.
  const jpg = (bytes[0] & 255) === 0xFF && (bytes[1] & 255) === 0xD8;
  const png = (bytes[0] & 255) === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47;
  if (!(jpg || png)) return null;
  return { bytes: bytes, tipo: jpg ? 'image/jpeg' : 'image/png', ext: jpg ? 'jpg' : 'png' };
}
function distancia_(a, b) {
  const R = 6371000, r = x => x * Math.PI / 180;
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/* =================== Historial (append-only, encadenado) =================== */
function log_(s, accion, resultado, ref, detalle) {
  return lock_(() => {
    const prev = PROPS.getProperty('HIST_LAST') || 'GENESIS';
    const e = { ts: new Date().toISOString(), usuario: s ? (s.user.nombre + ' (' + s.user.legajo + ')') : 'sistema',
      uid: s ? s.user.id : '', accion: txt_(accion, 60), resultado: txt_(resultado, 30), ref: txt_(ref, 80), detalle: txt_(detalle, 400) };
    e.prev = prev;
    e.hash = sha_(prev + '|' + e.ts + '|' + e.uid + '|' + e.accion + '|' + e.resultado + '|' + e.ref + '|' + e.detalle);
    tAdd_('Historial', e);
    PROPS.setProperty('HIST_LAST', e.hash);
    return e;
  });
}

/* =================== Usuarios y sesiones =================== */
function usuarios_() {
  const c = CACHE.get('usuarios');
  if (c) { try { return JSON.parse(c); } catch (e) {} }
  const u = tAll_('Usuarios');
  try { CACHE.put('usuarios', JSON.stringify(u), 60); } catch (e) {}
  return u;
}
function guardarUsuario_(u, nuevo) {
  u.actualizado = new Date().toISOString();
  if (nuevo) tAdd_('Usuarios', u); else tUpd_('Usuarios', 'id', u.id, u);
  CACHE.remove('usuarios');
  return u;
}
function permisos_(u) {
  const base = PERMS_ROL[u.rol] || [];
  const extra = Array.isArray(u.permisos) ? u.permisos.filter(p => MODULOS.indexOf(p) >= 0) : null;
  return extra || base;
}
function publico_(u) {
  return { id: u.id, legajo: u.legajo, nombre: u.nombre, sector: u.sector, rol: u.rol, estado: u.estado, registraIngreso: !!u.registraIngreso,
    fechaIngreso: u.fechaIngreso || '', fechaBaja: u.fechaBaja || '', bajaPor: u.bajaPor || '', motivoBaja: u.motivoBaja || '',
    permisos: permisos_(u), permisosPersonalizados: Array.isArray(u.permisos), creado: u.creado || '', bloqueado: !!u.bloqueadoPin, largoPin: largoPin_(u.rol) };
}
function sesion_(token, perm, necesitaElev) {
  if (!token || !/^[0-9a-f-]{36}$/.test(String(token))) throw new Error('AUTH');
  const raw = CACHE.get('s_' + token);
  if (!raw) throw new Error('AUTH');
  const s = JSON.parse(raw);
  const u = usuarios_().find(x => x.id === s.uid);
  if (!u || u.estado !== 'activo' || Number(u.ver || 0) !== Number(s.ver || 0)) { CACHE.remove('s_' + token); throw new Error('AUTH'); }
  const pol = politica_(u.rol), ahora = Date.now();
  // Máximo absoluto de la sesión (aunque se use sin parar) y renovación por actividad: la caché vence sola tras `inact` sin llamadas.
  if (ahora - Number(s.t || 0) > pol.max * 1000) { CACHE.remove('s_' + token); throw new Error('AUTH'); }
  if (ahora - Number(s.a || s.t || 0) > 60000) { s.a = ahora; CACHE.put('s_' + token, JSON.stringify(s), pol.inact); }
  const perms = permisos_(u);
  if (perm && perms.indexOf(perm) < 0) throw new Error('PERM');
  if (necesitaElev && !(s.elev && ahora - s.elev < ELEV_MS)) throw new Error('ELEV');
  return { token: token, data: s, user: u, perms: perms };
}
function estado() {
  const hayUsuarios = usuarios_().some(u => u.rol === 'admin' && u.estado === 'activo');
  return { v: VERSION, rev: REV, usuarios: hayUsuarios, legado: !!PROPS.getProperty('KEY_JEFE'), aviso: cfg_().avisoFotos, politica: politicaPub_('responsable') };
}
/** Datos del día para el panel inicial (solo de los módulos que el usuario puede ver). Una llamada liviana. */
function resumenHoy(token) {
  const s = sesion_(token), p = s.perms, hoy = hoy_(), cfg = cfg_(), out = { fecha: hoy, ts: new Date().toISOString() };
  const ve = m => p.indexOf(m) >= 0;
  if (ve('ingresos') || ve('personal')) {
    const activos = usuarios_().filter(u => u.estado === 'activo'), fichan = activos.filter(u => u.registraIngreso);
    const delDia = tAll_('Ingresos').filter(x => x.fecha === hoy && vivo_(x));
    const ent = {}, sal = {}; delDia.forEach(x => { (tipoDe_(x) === 'salida' ? sal : ent)[x.uid] = 1; });
    out.personal = { activos: activos.length, fichan: fichan.length };
    out.fichadas = { entradas: Object.keys(ent).length, salidas: Object.keys(sal).length, esperadas: fichan.length,
      abre: cfg.diasOperativos.indexOf(new Date(hoy + 'T12:00:00Z').getUTCDay()) >= 0 };
    if (ve('ingresos')) out.correccionesPendientes = tAll_('Correcciones').filter(c => c.estado === 'pendiente').length;
  }
  if (ve('acciones')) {
    const acc = tAll_('Acciones').filter(a => a.estado === 'abierta' || a.estado === 'en_curso');
    out.acciones = { abiertas: acc.length, vencidas: acc.filter(a => a.vence && a.vence < hoy).length };
  }
  if (ve('auditoria') || ve('auditar')) {
    const l = leerAud_().sort((a, b) => (b.fecha + (b.creado || '')).localeCompare(a.fecha + (a.creado || '')));
    out.auditoria = l.length ? { fecha: l[0].fecha, resultado: l[0].resultado, promedio: l[0].promedio } : null;
    out.auditoriasMes = l.filter(a => a.fecha.slice(0, 7) === hoy.slice(0, 7)).length;
  }
  if (ve('cierre') || ve('kpi')) {
    const c = tAll_('Cierres').filter(x => x.total > 0).sort((a, b) => a.fecha.localeCompare(b.fecha)), u = c[c.length - 1];
    out.cierre = u ? { fecha: u.fecha, total: u.total } : null;
    const desde = new Date(hoy + 'T12:00:00Z'); desde.setUTCDate(desde.getUTCDate() - 14);
    const con = {}; c.forEach(x => { con[x.fecha] = 1; });
    out.diasSinCierre = diasOperativosEntre_(desde.toISOString().slice(0, 10), hoy, cfg.diasOperativos).filter(d => d < hoy && !con[d]).length;
    out.mes = { total: c.filter(x => x.fecha.slice(0, 7) === hoy.slice(0, 7)).reduce((a, x) => a + x.total, 0), objetivo: (cfg.objetivos || {})[hoy.slice(0, 7)] || null };
  }
  if (ve('rrhh')) out.rrhh = { abiertas: tAll_('RRHH').filter(n => n.estado === 'abierta').length };
  if (ve('historial')) out.historialHoy = histRango_(hoy, hoy).length;
  return out;
}
/** Arranque en una sola llamada: estado de la instalación y, si hay token guardado, la sesión (null si venció). */
function inicio(token) {
  const e = estado();
  let ses = null;
  if (token) { try { ses = yo(token); } catch (x) { ses = null; } }
  e.sesion = ses;
  return e;
}
function checkLegacy_(name, pw) {
  const k = JSON.parse(PROPS.getProperty(name) || 'null');
  if (!k) return false;
  let b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, k.salt + '|' + String(pw || ''), Utilities.Charset.UTF_8);
  const s = Utilities.newBlob(k.salt).getBytes();
  for (let i = 0; i < 1500; i++) b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, b.concat(s));
  return eq_(Utilities.base64Encode(b), k.hash);
}
/** Primer administrador: con la clave de jefes anterior (o un código de instalación). Solo si no hay admins. */
function bootstrapAdmin(credencial, datos) {
  return lock_(() => {
    if (estado().usuarios) throw new Error('Ya existe un administrador. Ingresá con tu legajo y PIN.');
    globalFallas_();
    const setup = JSON.parse(PROPS.getProperty('SETUP') || 'null');
    const okCodigo = setup && Date.now() < setup.exp && eq_(String(credencial || '').trim().toUpperCase(), setup.code);
    if (!okCodigo && !checkLegacy_('KEY_JEFE', credencial)) { sumarGlobal_(); throw new Error('Clave de jefes o código incorrecto.'); }
    datos = datos || {};
    const nombre = txt_(datos.nombre, 60), legajo = txt_(datos.legajo, 20).toUpperCase();
    if (!nombre || !/^[A-Z0-9-]{1,20}$/.test(legajo)) throw new Error('Completá nombre y un legajo (letras, números o guion).');
    const pin = pinValido_(datos.pin);
    const salt = Utilities.getUuid();
    const u = { id: nuevoId_('U'), legajo: legajo, nombre: nombre, sector: txt_(datos.sector, 40) || 'Administración', rol: 'admin', estado: 'activo',
      registraIngreso: false, fechaIngreso: hoy_(), salt: salt, pinHash: hashPin_(pin, salt), ver: 1, creado: new Date().toISOString() };
    guardarUsuario_(u, true);
    PROPS.deleteProperty('SETUP'); PROPS.deleteProperty('KEY_AUD'); PROPS.deleteProperty('KEY_JEFE');
    log_({ user: u }, 'alta_administrador_inicial', 'ok', u.id, 'Se retiraron las claves compartidas anteriores');
    return true;
  });
}
function globalFallas_() { if (Number(CACHE.get('fallas_global') || 0) >= FALLAS_GLOBAL) throw new Error('Demasiados intentos fallidos en la app. Esperá unos minutos.'); }
function sumarGlobal_() { CACHE.put('fallas_global', String(Number(CACHE.get('fallas_global') || 0) + 1), VENTANA_GLOBAL_SEG); }
function login(legajo, pin, opts) {
  globalFallas_();
  legajo = txt_(legajo, 20).toUpperCase();
  const u = usuarios_().find(x => x.legajo === legajo);
  const kb = 'b_' + legajo, kf = 'f_' + legajo, kn = 'nb_' + legajo;
  if (CACHE.get(kb)) throw new Error('Usuario bloqueado por intentos fallidos. Probá en 15 minutos.');
  if (u && u.bloqueadoPin) throw new Error('Usuario bloqueado por intentos fallidos. Pedile a un jefe que te asigne un PIN nuevo.');
  // El hash se calcula siempre (también si el usuario no existe) para que el tiempo de respuesta no revele qué usuarios hay.
  const calc = hashPin_(String(pin || ''), u ? u.salt : 'sin-usuario');
  const ok = u && u.estado === 'activo' && eq_(calc, u.pinHash);
  if (!ok) {
    sumarGlobal_();
    const f = Number(CACHE.get(kf) || 0) + 1;
    CACHE.put(kf, String(f), BLOQUEO_USUARIO_SEG);
    if (f >= FALLAS_USUARIO) {
      CACHE.put(kb, '1', BLOQUEO_USUARIO_SEG); CACHE.remove(kf);
      const nb = Number(CACHE.get(kn) || 0) + 1; CACHE.put(kn, String(nb), 21600);
      if (u) {
        // Tercer bloqueo en pocas horas: queda bloqueado hasta que un jefe asigne un PIN nuevo (protege PIN de 4 números).
        if (nb >= 3) lock_(() => { const x = usuarios_().find(v => v.id === u.id); x.bloqueadoPin = true; x.ver = Number(x.ver || 0) + 1; guardarUsuario_(x); });
        log_({ user: u }, nb >= 3 ? 'bloqueo_hasta_nuevo_pin' : 'bloqueo_por_intentos', 'alerta', u.id, 'Bloqueo n.º ' + nb);
      }
    }
    throw new Error('Usuario o PIN incorrecto.');
  }
  CACHE.remove(kf);
  const token = Utilities.getUuid(), pol = politica_(u.rol), ahora = Date.now();
  CACHE.put('s_' + token, JSON.stringify({ uid: u.id, ver: Number(u.ver || 0), t: ahora, a: ahora }), pol.inact);
  const out = { token: token, user: publico_(u), params: params_(), ttl: pol.inact, politica: politicaPub_(u.rol) };
  if (opts && opts.jornada) out.jornada = jornadaDe_(u);   // fichada: identificarse y ver la jornada en una sola llamada
  return out;
}
function logout(token) { if (token && /^[0-9a-f-]{36}$/.test(String(token))) CACHE.remove('s_' + token); return true; }
function yo(token) { const s = sesion_(token); return { user: publico_(s.user), params: params_(), elev: !!(s.data.elev && Date.now() - s.data.elev < ELEV_MS), politica: politicaPub_(s.user.rol) }; }
function reauth(token, pin) {
  const s = sesion_(token);
  const kb = 'b_' + s.user.legajo;
  if (CACHE.get(kb)) throw new Error('Usuario bloqueado por intentos fallidos. Probá en 15 minutos.');
  if (!eq_(hashPin_(String(pin || ''), s.user.salt), s.user.pinHash)) {
    const kf = 'f_' + s.user.legajo, f = Number(CACHE.get(kf) || 0) + 1;
    CACHE.put(kf, String(f), BLOQUEO_USUARIO_SEG);
    if (f >= FALLAS_USUARIO) { CACHE.put(kb, '1', BLOQUEO_USUARIO_SEG); CACHE.remove('s_' + token); }
    throw new Error('PIN incorrecto.');
  }
  s.data.elev = Date.now(); s.data.a = s.data.elev;
  CACHE.put('s_' + token, JSON.stringify(s.data), politica_(s.user.rol).inact);
  return true;
}
function cambiarMiPin(token, actual, nuevo) {
  const s = sesion_(token);
  if (!eq_(hashPin_(String(actual || ''), s.user.salt), s.user.pinHash)) throw new Error('El PIN actual no es correcto.');
  const pin = pinValido_(nuevo, largoPin_(s.user.rol));
  return lock_(() => {
    const u = usuarios_().find(x => x.id === s.user.id);
    u.salt = Utilities.getUuid(); u.pinHash = hashPin_(pin, u.salt); u.ver = Number(u.ver || 0) + 1;
    guardarUsuario_(u);
    log_(s, 'cambio_pin_propio', 'ok', u.id, '');
    return true;
  });
}
function cerrarSesionesDe(token, uid) {
  const s = sesion_(token, 'personal', true);
  return lock_(() => {
    const u = usuarios_().find(x => x.id === uid); if (!u) throw new Error('Empleado no encontrado.');
    u.ver = Number(u.ver || 0) + 1; guardarUsuario_(u);
    log_(s, 'revocar_sesiones', 'ok', u.id, u.nombre);
    return true;
  });
}

/* =================== Personal: altas, bajas, estados =================== */
function listarPersonal(token) { sesion_(token, 'personal'); return usuarios_().map(publico_); }
function altaEmpleado(token, d) {
  const s = sesion_(token, 'personal', true);
  d = d || {};
  return lock_(() => {
    const nombre = txt_(d.nombre, 60), legajo = txt_(d.legajo, 20).toUpperCase();
    if (!nombre) throw new Error('Falta el nombre y apellido.');
    if (!/^[A-Z0-9-]{1,20}$/.test(legajo)) throw new Error('El usuario admite letras, números o guion, sin espacios (máx. 20).');
    if (usuarios_().some(u => u.legajo === legajo)) throw new Error('Ya existe una persona con ese usuario. Si volvió a trabajar, usá "Reactivar".');
    let rol = ['empleado', 'responsable', 'admin'].indexOf(d.rol) >= 0 ? d.rol : 'empleado';
    if (rol !== 'empleado' && s.user.rol !== 'admin') throw new Error('Solo un administrador puede dar de alta responsables o administradores.');
    const asignado = d.pin != null && String(d.pin) !== '';
    const pin = asignado ? pinValido_(d.pin, largoPin_(rol)) : pinAleatorio_(largoPin_(rol)), salt = Utilities.getUuid();
    const u = { id: nuevoId_('U'), legajo: legajo, nombre: nombre, sector: txt_(d.sector, 40), rol: rol, estado: 'activo',
      registraIngreso: d.registraIngreso !== false, fechaIngreso: fechaOk_(d.fechaIngreso) || hoy_(), salt: salt, pinHash: hashPin_(pin, salt),
      ver: 1, creado: new Date().toISOString(), creadoPor: s.user.nombre };
    guardarUsuario_(u, true);
    log_(s, 'alta_empleado', 'ok', u.id, nombre + ' · ' + legajo + ' · ' + rol + (asignado ? ' · PIN asignado por jefe' : ' · PIN generado'));
    return { user: publico_(u), pinInicial: asignado ? null : pin };
  });
}
function editarEmpleado(token, uid, d) {
  const s = sesion_(token, 'personal');
  d = d || {};
  return lock_(() => {
    const u = usuarios_().find(x => x.id === uid); if (!u) throw new Error('Empleado no encontrado.');
    const antes = [u.nombre, u.sector, u.registraIngreso, u.fechaIngreso].join(' / ');
    if (d.nombre != null) u.nombre = txt_(d.nombre, 60) || u.nombre;
    if (d.sector != null) u.sector = txt_(d.sector, 40);
    if (d.registraIngreso != null) u.registraIngreso = !!d.registraIngreso;
    if (d.fechaIngreso != null && fechaOk_(d.fechaIngreso)) u.fechaIngreso = d.fechaIngreso;
    guardarUsuario_(u);
    log_(s, 'edicion_empleado', 'ok', u.id, antes + ' → ' + [u.nombre, u.sector, u.registraIngreso, u.fechaIngreso].join(' / '));
    return publico_(u);
  });
}
function bajaEmpleado(token, uid, fechaBaja, motivo) {
  const s = sesion_(token, 'personal', true);
  return lock_(() => {
    const u = usuarios_().find(x => x.id === uid); if (!u) throw new Error('Empleado no encontrado.');
    if (u.id === s.user.id) throw new Error('No podés darte de baja a vos mismo.');
    if (u.rol === 'admin' && usuarios_().filter(x => x.rol === 'admin' && x.estado === 'activo').length <= 1) throw new Error('Es el único administrador activo.');
    if (u.rol !== 'empleado' && s.user.rol !== 'admin') throw new Error('Solo un administrador puede dar de baja a responsables o administradores.');
    u.estado = 'inactivo'; u.fechaBaja = fechaOk_(fechaBaja) || hoy_(); u.motivoBaja = txt_(motivo, 200);
    u.bajaPor = s.user.nombre + ' (' + s.user.legajo + ')'; u.bajaRegistrada = new Date().toISOString();
    u.ver = Number(u.ver || 0) + 1;   // revoca sesiones activas
    guardarUsuario_(u);
    log_(s, 'baja_empleado', 'ok', u.id, u.nombre + ' · efectiva ' + u.fechaBaja + (u.motivoBaja ? ' · ' + u.motivoBaja : ''));
    return publico_(u);
  });
}
function reactivarEmpleado(token, uid, pinNuevo) {
  const s = sesion_(token, 'personal', true);
  return lock_(() => {
    const u = usuarios_().find(x => x.id === uid); if (!u) throw new Error('Empleado no encontrado.');
    if (u.estado === 'activo') throw new Error('Ya está activo.');
    if (u.rol !== 'empleado' && s.user.rol !== 'admin') throw new Error('Solo un administrador puede reactivar a responsables o administradores.');
    const asignado = pinNuevo != null && String(pinNuevo) !== '';
    const pin = asignado ? pinValido_(pinNuevo, largoPin_(u.rol)) : pinAleatorio_(largoPin_(u.rol));
    u.bloqueadoPin = false;
    u.estado = 'activo'; u.reactivado = new Date().toISOString(); u.historialBajas = (u.historialBajas || []).concat([{ fechaBaja: u.fechaBaja, motivo: u.motivoBaja, por: u.bajaPor }]);
    u.fechaBaja = ''; u.motivoBaja = ''; u.bajaPor = '';
    u.salt = Utilities.getUuid(); u.pinHash = hashPin_(pin, u.salt); u.ver = Number(u.ver || 0) + 1;
    guardarUsuario_(u);
    log_(s, 'reactivacion_empleado', 'ok', u.id, u.nombre);
    return { user: publico_(u), pinInicial: asignado ? null : pin };
  });
}
function resetPin(token, uid, pinNuevo) {
  const s = sesion_(token, 'personal', true);
  return lock_(() => {
    const u = usuarios_().find(x => x.id === uid); if (!u) throw new Error('Empleado no encontrado.');
    if (u.rol !== 'empleado' && s.user.rol !== 'admin') throw new Error('Solo un administrador puede restablecer el PIN de un responsable o administrador.');
    if (u.estado !== 'activo') throw new Error('Está dado de baja. Usá "Reactivar".');
    const asignado = pinNuevo != null && String(pinNuevo) !== '';
    const pin = asignado ? pinValido_(pinNuevo, largoPin_(u.rol)) : pinAleatorio_(largoPin_(u.rol));
    u.salt = Utilities.getUuid(); u.pinHash = hashPin_(pin, u.salt); u.ver = Number(u.ver || 0) + 1; u.bloqueadoPin = false;
    guardarUsuario_(u);
    CACHE.remove('b_' + u.legajo); CACHE.remove('f_' + u.legajo); CACHE.remove('nb_' + u.legajo);
    log_(s, 'reset_pin', 'ok', u.id, u.nombre + (asignado ? ' · asignado por jefe' : ' · generado'));
    return { pinInicial: asignado ? null : pin };
  });
}
function cambiarRol(token, uid, rol, permisos) {
  const s = sesion_(token, 'personal', true);
  if (s.user.rol !== 'admin') throw new Error('Solo un administrador puede cambiar roles o permisos.');
  return lock_(() => {
    const u = usuarios_().find(x => x.id === uid); if (!u) throw new Error('Empleado no encontrado.');
    if (['empleado', 'responsable', 'admin'].indexOf(rol) < 0) throw new Error('Rol inválido.');
    if (u.rol === 'admin' && rol !== 'admin' && usuarios_().filter(x => x.rol === 'admin' && x.estado === 'activo').length <= 1) throw new Error('Tiene que quedar al menos un administrador activo.');
    const antes = u.rol + ' [' + permisos_(u).join(',') + ']';
    let pinInicial = null;
    if (largoPin_(u.rol) !== largoPin_(rol)) { pinInicial = pinAleatorio_(largoPin_(rol)); u.salt = Utilities.getUuid(); u.pinHash = hashPin_(pinInicial, u.salt); }
    u.rol = rol;
    u.permisos = Array.isArray(permisos) ? permisos.filter(p => MODULOS.indexOf(p) >= 0) : undefined;
    if (rol === 'empleado') u.permisos = undefined;
    u.ver = Number(u.ver || 0) + 1;
    guardarUsuario_(u);
    log_(s, 'cambio_permisos', 'ok', u.id, u.nombre + ': ' + antes + ' → ' + u.rol + ' [' + permisos_(u).join(',') + ']' + (pinInicial ? ' · PIN nuevo por cambio de nivel' : ''));
    return Object.assign(publico_(u), { pinInicial: pinInicial });
  });
}

/* =================== Fichada de entrada y salida =================== */
const tipoDe_ = x => x.tipo === 'salida' ? 'salida' : 'entrada';   // registros previos a v3.1 = entrada
const vivo_ = x => x.estado !== 'anulado';
function registrarIngreso(token, foto, geo) { return registrarFichada(token, 'entrada', foto, geo); }
function registrarFichada(token, tipo, foto, geo) {
  const s = sesion_(token);
  const u = s.user, cfg = cfg_();
  tipo = tipo === 'salida' ? 'salida' : 'entrada';
  if (!u.registraIngreso) throw new Error('Tu usuario no está habilitado para fichar. Consultá con un responsable.');
  const ahora = new Date(), fecha = hoy_();
  const f = foto ? dataUrlFoto_(foto) : null;
  if (cfg.fotoIngresoObligatoria && !f) throw new Error('Falta la foto o el archivo no es una imagen válida. Tomá la foto de nuevo.');
  let geoRes = 'no_configurado', dist = null, g = null;
  if (geo && typeof geo === 'object' && isFinite(geo.lat) && isFinite(geo.lng) && geo.lat !== null && Math.abs(geo.lat) <= 90 && Math.abs(geo.lng) <= 180) {
    g = { lat: Math.round(Number(geo.lat) * 1e5) / 1e5, lng: Math.round(Number(geo.lng) * 1e5) / 1e5, acc: Math.min(99999, Math.round(Number(geo.acc) || 0)) };
    if (cfg.local && isFinite(cfg.local.lat)) {
      dist = distancia_(cfg.local, g);
      geoRes = dist <= (cfg.local.radio || cfg.radioDef) + Math.min(g.acc, 100) ? 'dentro' : 'fuera';
    } else geoRes = 'sin_referencia';
  } else if (geo && geo.error) geoRes = ['sin_permiso', 'no_disponible', 'tiempo_agotado'].indexOf(geo.error) >= 0 ? geo.error : 'no_disponible';
  else if (cfg.local) geoRes = 'no_disponible';
  const estadoIng = (f || !cfg.fotoIngresoObligatoria) && (geoRes === 'dentro' || geoRes === 'no_configurado' || geoRes === 'sin_referencia') ? 'valido' : 'revisar';

  return lock_(() => {
    const delDia = tAll_('Ingresos').filter(x => x.uid === u.id && x.fecha === fecha && vivo_(x));
    const previo = delDia.find(x => tipoDe_(x) === tipo);
    if (previo) { contar_('dup_' + fecha.slice(0, 7)); log_(s, tipo + '_duplicada_bloqueada', 'alerta', previo.id, 'Intento a las ' + hora_(ahora)); throw new Error('DUP:' + tipo + ':' + (previo.horaCorregida || previo.hora)); }
    const entrada = delDia.find(x => tipoDe_(x) === 'entrada');
    if (tipo === 'salida' && !entrada) throw new Error('Primero tenés que fichar la entrada de hoy. Si te olvidaste, pedí una corrección.');
    let fotoId = null;
    if (f) fotoId = fotosIng_().createFile(Utilities.newBlob(f.bytes, f.tipo, fecha + '_' + u.legajo + '_' + tipo + '.' + f.ext)).getId();
    const rec = { id: nuevoId_(tipo === 'salida' ? 'O' : 'I'), tipo: tipo, uid: u.id, legajo: u.legajo, nombre: u.nombre, fecha: fecha, hora: hora_(ahora), ts: ahora.toISOString(),
      estado: estadoIng, geoResultado: geoRes, geo: g, distancia: dist, foto: fotoId, tieneFoto: !!fotoId, creado: ahora.toISOString(),
      dispositivo: txt_((geo && geo.ua) || '', 120) };
    if (tipo === 'salida') { rec.entradaId = entrada.id; rec.minutos = minutosEntre_(entrada.horaCorregida || entrada.hora, rec.hora); }
    try { tAdd_('Ingresos', rec); }
    catch (e) { if (fotoId) try { DriveApp.getFileById(fotoId).setTrashed(true); } catch (x) {} throw e; }
    log_(s, 'registro_' + tipo, estadoIng, rec.id, rec.fecha + ' ' + rec.hora + ' · ubicación: ' + geoRes + (rec.minutos != null ? ' · ' + rec.minutos + ' min' : ''));
    return { id: rec.id, tipo: tipo, fecha: rec.fecha, hora: rec.hora, estado: rec.estado, geoResultado: geoRes, distancia: dist, minutos: rec.minutos == null ? null : rec.minutos, fotoGuardada: !!fotoId };
  });
}
function minutosEntre_(h1, h2) {
  const m = h => { const p = String(h || '').split(':').map(Number); return p[0] * 60 + p[1] + (p[2] || 0) / 60; };
  if (!h1 || !h2) return null;
  const d = Math.round(m(h2) - m(h1));
  return d >= 0 ? d : null;
}
/** Estado de hoy del propio empleado: qué fichó y qué le toca. Solo sus datos. */
function miJornada(token) { return jornadaDe_(sesion_(token).user); }
function jornadaDe_(u) {
  const delDia = tAll_('Ingresos').filter(x => x.uid === u.id && x.fecha === hoy_() && vivo_(x));
  const e = delDia.find(x => tipoDe_(x) === 'entrada'), o = delDia.find(x => tipoDe_(x) === 'salida');
  return { fecha: hoy_(), nombre: u.nombre, habilitado: !!u.registraIngreso, aviso: cfg_().avisoFotos,
    entrada: e ? { hora: e.horaCorregida || e.hora, estado: e.estado } : null, salida: o ? { hora: o.horaCorregida || o.hora, estado: o.estado, minutos: o.minutos } : null,
    siguiente: !e ? 'entrada' : !o ? 'salida' : null };
}
/* Contadores livianos por mes (p. ej. intentos de fichar dos veces) para no recorrer todo el historial al calcular KPIs. */
function contar_(k) {
  try { const c = JSON.parse(PROPS.getProperty('CONT') || '{}'); c[k] = (c[k] || 0) + 1; PROPS.setProperty('CONT', JSON.stringify(c)); } catch (e) {}
}
function contados_(pref, desde, hasta) {
  let c = {}; try { c = JSON.parse(PROPS.getProperty('CONT') || '{}'); } catch (e) {}
  const d = desde.slice(0, 7), h = hasta.slice(0, 7);
  return Object.keys(c).filter(k => k.indexOf(pref + '_') === 0 && k.slice(pref.length + 1) >= d && k.slice(pref.length + 1) <= h).reduce((a, k) => a + Number(c[k] || 0), 0);
}
function misIngresos(token) {
  const s = sesion_(token);
  const corr = tAll_('Correcciones').filter(c => c.uid === s.user.id);
  return tAll_('Ingresos').filter(x => x.uid === s.user.id).slice(-30).reverse().map(x => ({
    id: x.id, tipo: tipoDe_(x), fecha: x.fecha, hora: x.hora, horaCorregida: x.horaCorregida || '', estado: x.estado, geoResultado: x.geoResultado,
    correccion: (corr.find(c => c.ingresoId === x.id) || {}).estado || '' }));
}
function solicitarCorreccion(token, d) {
  const s = sesion_(token);
  d = d || {};
  const fecha = fechaOk_(d.fecha), hp = horaOk_(d.horaPropuesta), motivo = txt_(d.motivo, 300), tipo = d.tipo === 'salida' ? 'salida' : 'entrada';
  if (!fecha || !hp || !motivo) throw new Error('Completá fecha, hora y motivo.');
  if (fecha > hoy_()) throw new Error('No se pueden pedir correcciones de días futuros.');
  return lock_(() => {
    let ing = null;
    if (d.ingresoId) { ing = tAll_('Ingresos').find(x => x.id === d.ingresoId); if (!ing || ing.uid !== s.user.id) throw new Error('Registro no encontrado.'); }
    else ing = tAll_('Ingresos').find(x => x.uid === s.user.id && x.fecha === fecha && vivo_(x) && tipoDe_(x) === tipo) || null;
    const t = ing ? tipoDe_(ing) : tipo;
    if (tAll_('Correcciones').some(c => c.uid === s.user.id && c.fecha === fecha && (c.tipo || 'entrada') === t && c.estado === 'pendiente')) throw new Error('Ya tenés una solicitud pendiente para esa ' + t + '.');
    const c = { id: nuevoId_('C'), tipo: t, uid: s.user.id, legajo: s.user.legajo, nombre: s.user.nombre, ingresoId: ing ? ing.id : '', horaOriginal: ing ? ing.hora : '',
      fecha: fecha, horaPropuesta: hp, motivo: motivo, estado: 'pendiente', creado: new Date().toISOString() };
    tAdd_('Correcciones', c);
    log_(s, 'solicitud_correccion', 'pendiente', c.id, t + ' ' + fecha + ' → ' + hp);
    return { id: c.id };
  });
}

/* =================== Registro de ingresos (vista administrativa) =================== */
function diasOperativosEntre_(desde, hasta, dias) {
  const out = [], d = new Date(desde + 'T12:00:00Z'), h = new Date(hasta + 'T12:00:00Z');
  for (let i = 0; d <= h && i < 400; i++) { if (dias.indexOf(d.getUTCDay()) >= 0) out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}
function listarIngresos(token, desde, hasta) {
  sesion_(token, 'ingresos');
  hasta = fechaOk_(hasta) || hoy_(); desde = fechaOk_(desde) || hasta;
  if (desde > hasta) { const t = desde; desde = hasta; hasta = t; }
  const ing = tAll_('Ingresos').filter(x => x.fecha >= desde && x.fecha <= hasta);
  const corr = tAll_('Correcciones');
  const users = usuarios_();
  const lista = ing.map(x => ({ id: x.id, tipo: tipoDe_(x), minutos: x.minutos == null ? null : x.minutos, uid: x.uid, fecha: x.fecha, legajo: x.legajo, nombre: x.nombre, hora: x.hora, horaCorregida: x.horaCorregida || '',
    estado: x.estado, geoResultado: x.geoResultado, distancia: x.distancia, tieneFoto: !!x.foto, fotoPurgada: !!x.fotoPurgada, observacion: x.observacion || '',
    revisadoPor: x.revisadoPor || '', origen: x.origen || 'app', derivado: !!x.derivado,
    usuarioInactivo: !!users.find(u => u.id === x.uid && u.estado !== 'activo') }));
  // Duplicados y pendientes (alertas para revisión, no conclusiones)
  const dups = {}; lista.forEach(x => { if (x.estado !== 'anulado') { const k = x.uid + x.fecha + x.tipo; dups[k] = (dups[k] || 0) + 1; } });
  lista.forEach(x => { x.duplicado = dups[x.uid + x.fecha + x.tipo] > 1; });
  // Jornadas: entrada + salida por persona y día
  const jornadas = {};
  lista.filter(x => x.estado !== 'anulado').forEach(x => {
    const k = x.uid + '|' + x.fecha, j = jornadas[k] = jornadas[k] || { uid: x.uid, fecha: x.fecha, nombre: x.nombre, legajo: x.legajo, entrada: '', salida: '', minutos: null };
    j[x.tipo] = x.horaCorregida || x.hora;
  });
  const listaJ = Object.keys(jornadas).map(k => { const j = jornadas[k]; j.minutos = minutosEntre_(j.entrada, j.salida); j.sinSalida = !!j.entrada && !j.salida && j.fecha < hoy_(); return j; })
    .sort((a, b) => (b.fecha + a.nombre).localeCompare(a.fecha + b.nombre));
  const dias = diasOperativosEntre_(desde, hasta, cfg_().diasOperativos).filter(d => d <= hoy_());
  const pendientes = [];
  dias.forEach(d => users.filter(u => u.estado === 'activo' && u.registraIngreso && (!u.fechaIngreso || u.fechaIngreso <= d)).forEach(u => {
    if (!lista.some(x => x.uid === u.id && x.fecha === d && x.estado !== 'anulado' && x.tipo === 'entrada')) pendientes.push({ fecha: d, uid: u.id, legajo: u.legajo, nombre: u.nombre });
  }));
  return { desde: desde, hasta: hasta, lista: lista.sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora)),
    correcciones: corr.filter(c => c.estado === 'pendiente' || (c.fecha >= desde && c.fecha <= hasta)), pendientes: pendientes,
    jornadas: listaJ, sinSalida: listaJ.filter(j => j.sinSalida) };
}
function fotoIngreso(token, id) {
  const s = sesion_(token, 'ingresos');
  const r = tAll_('Ingresos').find(x => x.id === String(id || ''));
  if (!r || !r.foto) throw new Error('Foto no disponible.');
  const out = fotoDe_(r.foto, fotosIng_());
  log_(s, 'ver_foto_ingreso', 'ok', r.id, r.nombre + ' ' + r.fecha);
  return out;
}
function fotoDe_(fid, carpeta) {
  let f, ok = false;
  try { f = DriveApp.getFileById(String(fid)); const p = f.getParents(); ok = p.hasNext() && p.next().getId() === carpeta.getId(); } catch (e) {}
  if (!ok) throw new Error('Foto no disponible.');
  const b = f.getBlob();
  return 'data:' + b.getContentType() + ';base64,' + Utilities.base64Encode(b.getBytes());
}
function resolverCorreccion(token, id, aprobar, comentario) {
  const s = sesion_(token, 'ingresos', true);
  return lock_(() => {
    const c = tAll_('Correcciones').find(x => x.id === id); if (!c) throw new Error('Solicitud no encontrada.');
    if (c.estado !== 'pendiente') throw new Error('La solicitud ya fue resuelta.');
    if (c.uid === s.user.id) throw new Error('No podés aprobar tu propia corrección.');
    c.estado = aprobar ? 'aprobada' : 'rechazada'; c.resueltoPor = s.user.nombre; c.resuelto = new Date().toISOString(); c.comentario = txt_(comentario, 300);
    tUpd_('Correcciones', 'id', c.id, c);
    if (aprobar) {
      const ings = tAll_('Ingresos');
      const ing = c.ingresoId ? ings.find(x => x.id === c.ingresoId) : null;
      if (ing) { ing.horaCorregida = c.horaPropuesta; ing.correccionId = c.id; ing.estado = 'corregido'; tUpd_('Ingresos', 'id', ing.id, ing); }
      else tAdd_('Ingresos', { id: nuevoId_(c.tipo === 'salida' ? 'O' : 'I'), tipo: c.tipo || 'entrada', uid: c.uid, legajo: c.legajo, nombre: c.nombre, fecha: c.fecha, hora: '', horaCorregida: c.horaPropuesta,
        estado: 'corregido', origen: 'correccion', correccionId: c.id, geoResultado: 'no_aplica', tieneFoto: false, creado: new Date().toISOString() });
    }
    log_(s, 'resolucion_correccion', c.estado, c.id, (c.tipo || 'entrada') + ' · ' + c.nombre + ' ' + c.fecha + ' ' + (c.horaOriginal || 'sin registro') + ' → ' + c.horaPropuesta);
    return c;
  });
}
function observarIngreso(token, id, obs, marcar) {
  const s = sesion_(token, 'ingresos');
  return lock_(() => {
    const r = tAll_('Ingresos').find(x => x.id === id); if (!r) throw new Error('Registro no encontrado.');
    r.observacion = txt_(obs, 300);
    if (['valido', 'revisar', 'anulado'].indexOf(marcar) >= 0 && marcar !== r.estado) {
      if (marcar === 'anulado') sesion_(token, 'ingresos', true);
      r.estadoAnterior = r.estado; r.estado = marcar;
    }
    r.revisadoPor = s.user.nombre; r.revisado = new Date().toISOString();
    tUpd_('Ingresos', 'id', r.id, r);
    log_(s, 'revision_ingreso', r.estado, r.id, r.observacion);
    return true;
  });
}
function derivarRRHH(token, ref, tipo, detalle) {
  const s = sesion_(token, 'ingresos');
  const tipos = ['llegada_tarde', 'inasistencia', 'salida_anticipada', 'otra'];
  if (tipos.indexOf(tipo) < 0) throw new Error('Tipo de novedad inválido.');
  return lock_(() => {
    let uid, fecha, nombre, legajo, ing = null;
    if (ref && ref.ingresoId) { ing = tAll_('Ingresos').find(x => x.id === ref.ingresoId); if (!ing) throw new Error('Registro no encontrado.'); uid = ing.uid; fecha = ing.fecha; }
    else { uid = ref && ref.uid; fecha = fechaOk_(ref && ref.fecha); }
    const u = usuarios_().find(x => x.id === uid); if (!u || !fecha) throw new Error('Datos incompletos para derivar.');
    nombre = u.nombre; legajo = u.legajo;
    const n = { id: nuevoId_('R'), uid: uid, legajo: legajo, nombre: nombre, fecha: fecha, tipo: tipo, detalle: txt_(detalle, 400),
      origen: 'derivada_de_ingresos', ref: ing ? ing.id : '', estado: 'abierta', creadoPor: s.user.nombre, creado: new Date().toISOString() };
    tAdd_('RRHH', n);
    if (ing) { ing.derivado = true; tUpd_('Ingresos', 'id', ing.id, ing); }
    log_(s, 'derivacion_rrhh', 'ok', n.id, nombre + ' ' + fecha + ' · ' + tipo);
    return { id: n.id };
  });
}
function exportarIngresos(token, desde, hasta) {
  const s = sesion_(token, 'ingresos', true);
  const r = listarIngresos(token, desde, hasta);
  log_(s, 'exportacion_ingresos', 'ok', '', r.desde + ' a ' + r.hasta + ' · ' + r.lista.length + ' registros');
  return r;
}

/* =================== Auditoría (se conserva) =================== */
function guardarAuditoria(token, data, fotos) {
  const s = sesion_(token, 'auditar');
  data = data || {};
  const p = params_();
  const rec = {
    id: Utilities.getUuid(),
    fecha: fechaOk_(data.fecha) || hoy_(),
    creado: new Date().toISOString(),
    auditor: s.user.nombre, auditorLegajo: s.user.legajo, uid: s.user.id,
    sucursal: 'Palermo',
    puntajes: {}, infracciones: {}, comentarios: {},
    diasPedido: data.diasPedido === '' || data.diasPedido == null ? null : Math.max(0, Math.min(999, Math.round(Number(data.diasPedido) || 0))),
    comentarioGeneral: txt_(data.comentarioGeneral, 600),
    fotos: [], umbrales: { promExc: p.promExc, promAdv: p.promAdv, maxInf: p.maxInf, diasMax: p.diasMax }
  };
  if (rec.fecha > hoy_()) throw new Error('La fecha no puede ser futura.');
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

  const subidas = [];
  try {
    // Cada foto puede venir asociada a un punto evaluado: {punto, data}. Texto suelto = foto general (compatibilidad).
    const claves = PUNTOS.map(x => x[0]);
    rec.fotoPuntos = []; rec.fotosDescartadas = 0;
    (Array.isArray(fotos) ? fotos : []).slice(0, 12).forEach((f, i) => {
      const data = typeof f === 'string' ? f : f && f.data;
      const punto = f && typeof f === 'object' && claves.indexOf(f.punto) >= 0 ? f.punto : 'general';
      const img = dataUrlFoto_(data); if (!img) { rec.fotosDescartadas++; return; }
      const nombre = rec.fecha + '_' + rec.auditor.replace(/[^\wÀ-ÿ ]/g, '').slice(0, 30) + '_' + punto + '_' + (i + 1) + '.' + img.ext;
      const id = fotosAud_().createFile(Utilities.newBlob(img.bytes, img.tipo, nombre)).getId();
      subidas.push(id); rec.fotos.push(id); rec.fotoPuntos.push(punto);
    });
    lock_(() => {
      const sh = hoja_();
      const [y, mo, d] = rec.fecha.split('-').map(Number);
      sh.appendRow([rec.id, new Date(y, mo - 1, d), celda_(rec.auditor), ...PUNTOS.map(x => rec.puntajes[x[0]]), rec.promedio, rec.resultado,
        ...PUNTOS.map(x => rec.infracciones[x[0]]), rec.totalInfracciones, rec.resultadoChecklist, rec.diasPedido == null ? '' : rec.diasPedido,
        rec.pedidoFueraDePlazo ? 'Sí' : 'No', celda_(rec.comentarioGeneral), ...PUNTOS.map(x => celda_(rec.comentarios[x[0]] || '')),
        rec.fotos.length, Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm'), JSON.stringify(rec)]);
      const r = sh.getLastRow(), N = PUNTOS.length, C = HEAD.length;
      sh.getRange(r, 2).setNumberFormat('dd/mm/yyyy'); sh.getRange(r, 4 + N).setNumberFormat('0.0');
      // Formato de toda la fila en 4 llamadas (una por propiedad) en lugar de una por celda.
      const col = { Excelente: ['#DCFCE7', '#15803D'], Advertencia: ['#FEF3C7', '#B45309'], Reclamo: ['#FEE2E2', '#C81E1E'] };
      const sc = { 1: ['#FEE4E2', '#D92D20'], 2: ['#FFE8D9', '#E8590C'], 3: ['#FEF3C7', '#A16207'], 4: ['#DCFCE7', '#16A34A'], 5: ['#C9F2D9', '#0E7A3E'] };
      const bg = Array(C).fill(null), fc = Array(C).fill(null), fw = Array(C).fill(null), ha = Array(C).fill(null);
      PUNTOS.forEach((x, j) => { const v = rec.puntajes[x[0]]; bg[3 + j] = sc[v][0]; fc[3 + j] = sc[v][1]; fw[3 + j] = 'bold'; ha[3 + j] = 'center'; });
      [[4 + N, rec.resultado], [6 + 2 * N, rec.resultadoChecklist]].forEach(([i, res]) => { bg[i] = col[res][0]; fc[i] = col[res][1]; fw[i] = 'bold'; });
      sh.getRange(r, 1, 1, C).setBackgrounds([bg]).setFontColors([fc]).setFontWeights([fw]).setHorizontalAlignments([ha]);
    });
  } catch (e) {
    subidas.forEach(id => { try { DriveApp.getFileById(id).setTrashed(true); } catch (x) {} });   // sin fotos huérfanas
    throw e;
  }
  log_(s, 'auditoria_creada', rec.resultado, rec.id, rec.fecha + ' · ' + rec.promedio + ' · fotos ' + rec.fotos.length);
  return rec;
}
function leerAud_() {
  const sh = hoja_(), n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, HEAD.length, n, 1).getValues().map(r => { try { return JSON.parse(r[0]); } catch (e) { return null; } }).filter(Boolean);
}
function getRegistro(token) {
  const s = sesion_(token, 'auditoria');
  return { lista: leerAud_(), params: params_(), acciones: s.perms.indexOf('acciones') >= 0 ? tAll_('Acciones') : null };
}
function eliminarAuditoria(token, id) {
  const s = sesion_(token, 'auditoria', true);
  id = String(id || '');
  const borrada = lock_(() => {
    const sh = hoja_(), n = sh.getLastRow() - 1; if (n < 1) return null;
    const ids = sh.getRange(2, 1, n, 1).getValues();
    for (let i = ids.length - 1; i >= 0; i--) if (ids[i][0] === id) {
      let rec = null; try { rec = JSON.parse(sh.getRange(i + 2, HEAD.length).getValue()); } catch (e) {}
      sh.deleteRow(i + 2); return rec || { id: id, fotos: [] };
    }
    return null;
  });
  if (!borrada) return false;
  (borrada.fotos || []).forEach(f => { try { DriveApp.getFileById(f).setTrashed(true); } catch (e) {} });
  log_(s, 'auditoria_eliminada', 'ok', id, (borrada.fecha || '') + ' · ' + (borrada.auditor || '') + ' · fotos a papelera: ' + (borrada.fotos || []).length);
  return true;
}
function vaciarRegistro(token) {
  const s = sesion_(token, 'auditoria', true);
  const r = lock_(() => {
    const ss = ss_(), sh = hoja_(), n = sh.getLastRow() - 1;
    if (n < 1) return { borradas: 0 };
    const copia = ss.copy('HeyBlackk · Auditorías Palermo · Respaldo ' + Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH.mm'));
    sh.deleteRows(2, n);
    return { borradas: n, respaldo: copia.getUrl() };
  });
  log_(s, 'registro_auditorias_vaciado', 'ok', '', r.borradas + ' auditorías · respaldo creado');
  return r;
}
function getFoto(token, id) { sesion_(token, 'auditoria'); return fotoDe_(String(id || ''), fotosAud_()); }
function hojaUrl(token) { sesion_(token, 'auditoria'); return ss_().getUrl(); }

/* ---- Acciones correctivas ---- */
function listarAcciones(token) { sesion_(token, 'acciones'); return tAll_('Acciones'); }
function crearAccion(token, d) {
  const s = sesion_(token, 'acciones');
  d = d || {};
  const desc = txt_(d.descripcion, 300); if (!desc) throw new Error('Describí la acción.');
  const a = { id: nuevoId_('A'), auditId: txt_(d.auditId, 40), punto: txt_(d.punto, 30), descripcion: desc, responsable: txt_(d.responsable, 60),
    vence: fechaOk_(d.vence) || '', estado: 'abierta', creado: new Date().toISOString(), creadoPor: s.user.nombre, cerrado: '', evidencia: [] };
  lock_(() => tAdd_('Acciones', a));
  log_(s, 'accion_creada', 'abierta', a.id, desc.slice(0, 80));
  return a;
}
function actualizarAccion(token, id, estadoN, nota, foto) {
  const s = sesion_(token, 'acciones');
  if (['abierta', 'en_curso', 'resuelta', 'descartada'].indexOf(estadoN) < 0) throw new Error('Estado inválido.');
  return lock_(() => {
    const a = tAll_('Acciones').find(x => x.id === id); if (!a) throw new Error('Acción no encontrada.');
    const img = foto ? dataUrlFoto_(foto) : null;
    if (img) a.evidencia = (a.evidencia || []).concat([fotosAud_().createFile(Utilities.newBlob(img.bytes, img.tipo, 'accion_' + a.id + '.' + img.ext)).getId()]);
    const antes = a.estado;
    a.estado = estadoN; a.nota = txt_(nota, 300) || a.nota || '';
    a.cerrado = estadoN === 'resuelta' || estadoN === 'descartada' ? new Date().toISOString() : '';
    a.actualizadoPor = s.user.nombre;
    tUpd_('Acciones', 'id', a.id, a);
    log_(s, 'accion_actualizada', estadoN, a.id, antes + ' → ' + estadoN);
    return a;
  });
}

/* =================== Cierre diario (SOLO LECTURA de la planilla) =================== */
function xmlTexto_(s) { return String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (m, n) => String.fromCharCode(n)).replace(/&amp;/g, '&'); }
function leerXlsx_(blob) {
  blob.setContentType('application/zip');
  const partes = {};
  Utilities.unzip(blob).forEach(b => { partes[b.getName()] = b; });
  const str = n => partes[n] ? partes[n].getDataAsString('UTF-8') : '';
  const shared = [];
  (str('xl/sharedStrings.xml').match(/<si>[\s\S]*?<\/si>/g) || []).forEach(si => {
    shared.push(xmlTexto_((si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || []).map(t => t.replace(/<t[^>]*>|<\/t>/g, '')).join('')));
  });
  const rels = {};
  (str('xl/_rels/workbook.xml.rels').match(/<Relationship [^>]*>/g) || []).forEach(r => {
    const id = (r.match(/Id="([^"]+)"/) || [])[1], t = (r.match(/Target="([^"]+)"/) || [])[1];
    if (id && t) rels[id] = t.replace(/^\/?(xl\/)?/, 'xl/');
  });
  const hojas = [];
  (str('xl/workbook.xml').match(/<sheet [^>]*\/>/g) || []).forEach(sx => {
    const nombre = xmlTexto_((sx.match(/name="([^"]+)"/) || [])[1] || ''), rid = (sx.match(/r:id="([^"]+)"/) || [])[1];
    const xml = str(rels[rid] || '');
    const celdas = {};
    (xml.match(/<c [^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) || []).forEach(c => {
      const ref = (c.match(/ r="([A-Z]+\d+)"/) || [])[1]; if (!ref) return;
      const t = (c.match(/ t="([^"]+)"/) || [])[1];
      const v = (c.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      let val = null;
      if (t === 's' && v != null) val = shared[Number(v)];
      else if (t === 'inlineStr') val = xmlTexto_(((c.match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1]) || '');
      else if (t === 'str' && v != null) val = xmlTexto_(v);
      else if (v != null && v !== '') val = isNaN(Number(v)) ? xmlTexto_(v) : Number(v);
      if (val !== null && val !== '') celdas[ref] = val;
    });
    hojas.push({ nombre: nombre, celdas: celdas });
  });
  return hojas;
}
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS_ABR = { dom: 0, lun: 1, mar: 2, mie: 3, jue: 4, vie: 5, sab: 6 };
function diaDeEtiqueta_(s) {
  const k = String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '').slice(0, 3);
  return Object.prototype.hasOwnProperty.call(DIAS_ABR, k) ? DIAS_ABR[k] : null;
}
function parsearCierres_(hojas) {
  const out = [], errores = [], sinFecha = [];
  const COLS = ['B', 'C', 'D', 'E', 'G', 'H', 'I', 'J', 'L', 'M', 'N', 'O', 'Q', 'R', 'S', 'T'];
  hojas.forEach(h => {
    const c = h.celdas;
    const etiq = String(c.E2 || c.A1 || '');
    const anio = Number((etiq.match(/(20\d{2})/) || String(c.A1 || '').match(/(20\d{2})/) || [])[1]);
    const mesHoja = MESES.indexOf(String(h.nombre).trim().toLowerCase()) + 1;
    if (!(String(c.A6 || '').toUpperCase().indexOf('TARJETA') >= 0)) { errores.push('Hoja "' + h.nombre + '": no tiene el formato esperado (fila 6 = TARJETAS).'); return; }
    COLS.forEach(col => {
      const vt = c[col + '6'], vtr = c[col + '7'], ve = c[col + '8'], f = c[col + '5'];
      const hayValores = [vt, vtr, ve].some(v => v != null && v !== '');
      if (f == null || f === '') {
        if (hayValores) { errores.push('Hoja "' + h.nombre + '" columna ' + col + ' (' + (c[col + '4'] || 's/d') + '): hay importes sin fecha; no se importaron.'); sinFecha.push({ hoja: h.nombre, columna: col, t: Number(vt) || 0, tr: Number(vtr) || 0, e: Number(ve) || 0 }); }
        return;
      }
      let dia, mes;
      if (typeof f === 'number') { const d = new Date(Math.round((f - 25569) * 86400000)); dia = d.getUTCDate(); mes = d.getUTCMonth() + 1; }
      else { const m = String(f).match(/^\s*(\d{1,2})\s*[-\/.]\s*(\d{1,2})/); if (!m) { errores.push('Hoja "' + h.nombre + '" columna ' + col + ': fecha ilegible "' + String(f).slice(0, 12) + '".'); return; } dia = Number(m[1]); mes = Number(m[2]); }
      let y = anio || Number(hoy_().slice(0, 4));
      if (mesHoja && mes !== mesHoja) errores.push('Hoja "' + h.nombre + '" columna ' + col + ': la fecha ' + dia + '/' + mes + ' no corresponde al mes de la hoja.');
      if (!hayValores) return;
      const num = v => { if (v == null || v === '') return 0; const n = typeof v === 'number' ? v : Number(String(v).replace(/\./g, '').replace(',', '.')); return isFinite(n) && n >= 0 ? n : NaN; };
      const t = num(vt), tr = num(vtr), e = num(ve);
      if ([t, tr, e].some(isNaN)) { errores.push('Hoja "' + h.nombre + '" columna ' + col + ': importe no numérico.'); return; }
      if (typeof f === 'number') y = new Date(Math.round((f - 25569) * 86400000)).getUTCFullYear();
      const fecha = y + '-' + String(mes).padStart(2, '0') + '-' + String(dia).padStart(2, '0');
      const dsem = new Date(fecha + 'T12:00:00Z').getUTCDay(), dEtiq = diaDeEtiqueta_(c[col + '4']);
      if (isNaN(dsem)) { errores.push('Hoja "' + h.nombre + '" columna ' + col + ': fecha inválida.'); return; }
      if (dEtiq != null && dEtiq !== dsem) errores.push('Hoja "' + h.nombre + '" columna ' + col + ': la fecha ' + fecha.split('-').reverse().join('/') + ' no cae ' + c[col + '4'] + '.');
      out.push({ fecha: fecha, tarjetas: t, transferencia: tr, efectivo: e, total: Math.round((t + tr + e) * 100) / 100, hoja: h.nombre, columna: col });
    });
  });
  // Importes sin fecha que coinciden exactamente con un día fechado (posible doble carga)
  sinFecha.forEach(s => {
    const igual = out.find(o => o.tarjetas === s.t && o.transferencia === s.tr && o.efectivo === s.e && (s.t + s.tr + s.e) > 0);
    if (igual) errores.push('Hoja "' + s.hoja + '" columna ' + s.columna + ': los importes sin fecha son idénticos a los del ' + igual.fecha.split('-').reverse().join('/') + ' (posible doble carga).');
  });
  return { cierres: out, errores: errores };
}
function sincronizarCierre(token) { return sync_(sesion_(token, 'cierre')); }
/** Sincroniza sola si la última lectura tiene más de 6 h (se registra como "sistema"). */
function autoSync_() {
  const st = JSON.parse(PROPS.getProperty('CIERRE_SYNC') || 'null');
  if (st && Date.now() - new Date(st.ts).getTime() < 6 * 3600 * 1000) return;
  try { sync_(null); } catch (e) {}
}
function sync_(s) {
  const cfg = cfg_();
  let file;
  try { file = DriveApp.getFileById(cfg.cierreFileId); } catch (e) {
    const st = { ts: new Date().toISOString(), ok: false, error: 'No se encontró la planilla de cierre o no hay permiso de lectura.' };
    PROPS.setProperty('CIERRE_SYNC', JSON.stringify(st)); log_(s, 'sync_cierre', 'error', cfg.cierreFileId, st.error); return st;
  }
  let res;
  try { res = parsearCierres_(leerXlsx_(file.getBlob())); }
  catch (e) {
    const st = { ts: new Date().toISOString(), ok: false, error: 'No se pudo leer la planilla (¿cambió el formato?).' };
    PROPS.setProperty('CIERRE_SYNC', JSON.stringify(st)); log_(s, 'sync_cierre', 'error', file.getId(), String(e.message || e).slice(0, 200)); return st;
  }
  const porFecha = {}, dupFechas = [];
  res.cierres.forEach(c => { if (porFecha[c.fecha]) dupFechas.push(c.fecha); porFecha[c.fecha] = c; });
  dupFechas.forEach(f => res.errores.push('La fecha ' + f + ' aparece más de una vez en la planilla.'));
  let nuevos = 0, cambiados = 0;
  lock_(() => {
    const prev = {}; tAll_('Cierres').forEach(c => { prev[c.fecha] = c; });
    const ts = new Date().toISOString();
    Object.keys(porFecha).sort().forEach(f => {
      const c = porFecha[f]; c.sincronizado = ts;
      const p = prev[f];
      if (!p) { tAdd_('Cierres', c); nuevos++; }
      else if (p.total !== c.total || p.tarjetas !== c.tarjetas || p.transferencia !== c.transferencia || p.efectivo !== c.efectivo) {
        c.anterior = { total: p.total, sincronizado: p.sincronizado }; tUpd_('Cierres', 'fecha', f, c); cambiados++;
      }
    });
  });
  const st = { ts: new Date().toISOString(), ok: true, archivo: file.getName(), modificado: file.getLastUpdated().toISOString(),
    dias: Object.keys(porFecha).length, nuevos: nuevos, cambiados: cambiados, errores: res.errores.slice(0, 40) };
  PROPS.setProperty('CIERRE_SYNC', JSON.stringify(st));
  log_(s, 'sync_cierre', res.errores.length ? 'con_alertas' : 'ok', file.getId(), st.dias + ' días · ' + nuevos + ' nuevos · ' + cambiados + ' cambiados · ' + res.errores.length + ' alertas');
  return st;
}
function alertasCierre_(cierres, desde, hasta) {
  const cfg = cfg_(), users = usuarios_(), ing = tAll_('Ingresos').filter(x => x.fecha >= desde && x.fecha <= hasta && x.estado !== 'anulado' && tipoDe_(x) === 'entrada');
  const alertas = [], porFecha = {};
  cierres.forEach(c => { porFecha[c.fecha] = c; });
  diasOperativosEntre_(desde, hasta, cfg.diasOperativos).filter(d => d < hoy_()).forEach(d => {
    const c = porFecha[d], delDia = ing.filter(x => x.fecha === d);
    if (!c) alertas.push({ fecha: d, tipo: 'cierre_pendiente', detalle: 'Día de apertura sin cierre cargado en la planilla.' });
    if (c && c.total > 0) {
      users.filter(u => u.estado === 'activo' && u.registraIngreso && (!u.fechaIngreso || u.fechaIngreso <= d)).forEach(u => {
        if (!delDia.some(x => x.uid === u.id)) alertas.push({ fecha: d, tipo: 'falta_ingreso', detalle: 'Hay cierre de ventas pero no hay ingreso registrado de ' + u.nombre + '.' });
      });
    }
    if (!c && delDia.length) alertas.push({ fecha: d, tipo: 'ingresos_sin_cierre', detalle: delDia.length + ' ingreso(s) registrado(s) y ningún cierre en la planilla.' });
  });
  const cuenta = {}; ing.forEach(x => { const k = x.uid + x.fecha; cuenta[k] = (cuenta[k] || 0) + 1; });
  Object.keys(cuenta).filter(k => cuenta[k] > 1).forEach(k => { const x = ing.find(i => i.uid + i.fecha === k); alertas.push({ fecha: x.fecha, tipo: 'ingreso_duplicado', detalle: 'Más de un ingreso de ' + x.nombre + '.' }); });
  ing.forEach(x => { const u = users.find(v => v.id === x.uid); if (u && u.estado !== 'activo' && u.fechaBaja && x.fecha > u.fechaBaja) alertas.push({ fecha: x.fecha, tipo: 'empleado_inactivo', detalle: 'Ingreso de ' + x.nombre + ' posterior a su baja.' }); });
  return alertas.sort((a, b) => b.fecha.localeCompare(a.fecha));
}
function getCierre(token, desde, hasta) {
  sesion_(token, 'cierre');
  autoSync_();
  hasta = fechaOk_(hasta) || hoy_(); desde = fechaOk_(desde) || (hasta.slice(0, 8) + '01');
  const cierres = tAll_('Cierres').filter(c => c.fecha >= desde && c.fecha <= hasta).sort((a, b) => a.fecha.localeCompare(b.fecha));
  return { desde: desde, hasta: hasta, cierres: cierres, sync: JSON.parse(PROPS.getProperty('CIERRE_SYNC') || 'null'), alertas: alertasCierre_(cierres, desde, hasta) };
}

/* =================== KPIs (datos reales, agregados en el servidor) =================== */
function getKPIs(token, desde, hasta) {
  const s = sesion_(token, 'kpi');
  autoSync_();
  hasta = fechaOk_(hasta) || hoy_(); desde = fechaOk_(desde) || '2000-01-01';
  const audN = leerAud_().filter(a => a.fecha >= desde && a.fecha <= hasta).length;
  const acc = tAll_('Acciones');
  const hoy = hoy_();
  const todasF = tAll_('Ingresos').filter(x => x.fecha >= desde && x.fecha <= hasta);
  const ing = todasF.filter(x => tipoDe_(x) === 'entrada');
  const sal = todasF.filter(x => tipoDe_(x) === 'salida' && vivo_(x));
  const dupIntentos = contados_('dup', desde, hasta);   // contador por mes (no se recorre el historial completo)
  const porDia = {}; ing.filter(x => x.estado !== 'anulado').forEach(x => { porDia[x.fecha] = (porDia[x.fecha] || 0) + 1; });
  const cierres = tAll_('Cierres').filter(c => c.fecha >= desde && c.fecha <= hasta).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const desdeCierre = cierres.length ? cierres[0].fecha : (desde > '2000-01-01' ? desde : hasta.slice(0, 8) + '01');
  const alertas = alertasCierre_(cierres, desdeCierre, hasta);
  return {
    desde: desde, hasta: hasta, auditoriasN: audN, params: params_(),
    acciones: { abiertas: acc.filter(a => a.estado === 'abierta' || a.estado === 'en_curso').length,
      vencidas: acc.filter(a => (a.estado === 'abierta' || a.estado === 'en_curso') && a.vence && a.vence < hoy).length,
      resueltas: acc.filter(a => a.estado === 'resuelta').length, total: acc.length },
    ingresos: { total: ing.filter(x => x.estado !== 'anulado').length, revisar: ing.filter(x => x.estado === 'revisar').length,
      validos: ing.filter(x => x.estado === 'valido').length, corregidos: ing.filter(x => x.estado === 'corregido').length,
      fuera: ing.filter(x => x.geoResultado === 'fuera').length, sinUbicacion: ing.filter(x => ['sin_permiso', 'no_disponible', 'tiempo_agotado'].indexOf(x.geoResultado) >= 0).length,
      duplicadosBloqueados: dupIntentos, porDia: porDia, salidas: sal.length,
      sinSalida: ing.filter(e => vivo_(e) && e.fecha < hoy && !sal.some(o => o.uid === e.uid && o.fecha === e.fecha)).length,
      minutosPromedio: (() => { const m = sal.map(o => o.minutos).filter(v => v != null); return m.length ? Math.round(m.reduce((a, b) => a + b, 0) / m.length) : null; })() },
    cierres: cierres.map(c => ({ fecha: c.fecha, tarjetas: c.tarjetas, transferencia: c.transferencia, efectivo: c.efectivo, total: c.total })),
    cierreSync: JSON.parse(PROPS.getProperty('CIERRE_SYNC') || 'null'),
    comercial: kpiComercial_(tAll_('Cierres'), cfg_(), hasta, JSON.parse(PROPS.getProperty('CIERRE_SYNC') || 'null')),
    alertas: { cierrePendiente: alertas.filter(a => a.tipo === 'cierre_pendiente').length, total: alertas.length, faltaIngreso: alertas.filter(a => a.tipo === 'falta_ingreso').length }
  };
}

/* =================== KPIs comerciales e inteligencia de negocio ===================
 * Fuente única: tabla "Cierres" (leída de la planilla de cierre, filas 6-8).
 * Datos disponibles: fecha y ventas por medio de pago. No hay productos, vendedores,
 * clientes, cantidad de operaciones ni costos: esos KPIs se informan como "sin datos".
 */
const FUENTE_CIERRE = 'Planilla de cierre de Palermo (Drive) · filas 6 a 8: Tarjetas, Transferencia, Efectivo';
const NOMBRE_DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const DEFINICIONES = [
  ['venta_dia', 'Facturación diaria', 'Ventas registradas en el cierre de un día.', 'Tarjetas + Transferencia + Efectivo'],
  ['venta_semana', 'Facturación semanal', 'Suma de los días con cierre de la semana (lunes a domingo).', 'Σ facturación diaria de la semana'],
  ['venta_mes', 'Facturación mensual', 'Suma de los días con cierre del mes calendario.', 'Σ facturación diaria del mes'],
  ['venta_anio', 'Facturación anual', 'Suma de los días con cierre del año calendario.', 'Σ facturación diaria del año'],
  ['prom_dia', 'Promedio por día con cierre', 'Venta media de los días que tienen cierre cargado. Permite comparar meses con distinta cantidad de días.', 'Facturación del período ÷ días con cierre'],
  ['variacion', 'Variación vs. período comparable', 'Diferencia contra el mes (o las semanas) anterior.', 'Δ$ = actual − anterior · Δ% = Δ$ ÷ anterior'],
  ['dia_semana', 'Rendimiento por día de la semana', 'Promedio y participación de cada día de apertura.', 'Σ ventas del día de semana ÷ cantidad de esos días'],
  ['mix', 'Mix de medios de pago', 'Participación de cada medio en la facturación.', 'Ventas del medio ÷ facturación total'],
  ['proyeccion', 'Proyección de cierre mensual (estimación)', 'Estimación, no venta real. Suma lo vendido más los días de apertura que faltan por la venta típica reciente.', 'Real + días restantes × mediana diaria (rango: percentiles 25 y 75 de los últimos 40 días con cierre)'],
  ['objetivo', 'Cumplimiento del objetivo', 'Avance contra el objetivo mensual cargado en Configuración.', 'Real ÷ objetivo · necesario por día = (objetivo − real) ÷ días restantes'],
  ['dias_sin_cierre', 'Días de apertura sin cierre', 'Días operativos ya pasados sin importes en la planilla. Alerta de calidad de datos.', 'Días operativos − días con cierre']
].map(d => ({ id: d[0], nombre: d[1], definicion: d[2], formula: d[3], fuente: FUENTE_CIERRE }));
const NO_DISPONIBLE = [
  { kpi: 'Ticket promedio y cantidad de operaciones', falta: 'Cantidad de ventas u operaciones por día' },
  { kpi: 'Productos y categorías (10.2)', falta: 'Detalle por producto: artículo, categoría, unidades e importe' },
  { kpi: 'Desempeño por vendedor (10.3)', falta: 'Vendedor de cada venta y días u horas trabajadas' },
  { kpi: 'Clientes y recurrencia (10.4)', falta: 'Identificación del cliente en cada venta' },
  { kpi: 'Rentabilidad y margen (10.5)', falta: 'Costo de cada producto, descuentos y devoluciones' }
];
function r2_(n) { return Math.round(n * 100) / 100; }
function pct_(a, b) { return b ? r2_((a - b) / b * 100) : null; }
function cuantil_(arr, q) {
  if (!arr.length) return null;
  const a = arr.slice().sort((x, y) => x - y), p = (a.length - 1) * q, i = Math.floor(p);
  return a[i] + (a[Math.min(i + 1, a.length - 1)] - a[i]) * (p - i);
}
function lunes_(f) { const d = new Date(f + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); }
function sumar_(lista) {
  const o = { total: 0, tarjetas: 0, transferencia: 0, efectivo: 0, dias: lista.length };
  lista.forEach(c => { o.total += c.total; o.tarjetas += c.tarjetas; o.transferencia += c.transferencia; o.efectivo += c.efectivo; });
  ['total', 'tarjetas', 'transferencia', 'efectivo'].forEach(k => { o[k] = r2_(o[k]); });
  o.promDia = o.dias ? r2_(o.total / o.dias) : null;
  o.mix = o.total ? { tarjetas: r2_(o.tarjetas / o.total * 100), transferencia: r2_(o.transferencia / o.total * 100), efectivo: r2_(o.efectivo / o.total * 100) } : null;
  return o;
}
const $_ = n => '$ ' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const fdm_ = f => f.split('-').reverse().join('/');
const MES_NOM = m => MESES[Number(m.slice(5, 7)) - 1] + ' ' + m.slice(0, 4);

function kpiComercial_(todos, cfg, hasta, sync) {
  hasta = hasta || hoy_();
  const ac = Object.assign({ caidaPct: 15, mixPp: 10, minDias: 4, concentracionPct: 45 }, cfg.alertasCom || {});
  const dias = todos.filter(c => c.fecha <= hasta && c.total > 0).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const base = { definiciones: DEFINICIONES, noDisponible: NO_DISPONIBLE, actualizado: sync ? sync.ts : null, fuente: FUENTE_CIERRE };
  if (!dias.length) return Object.assign(base, { sinDatos: true, alertas: [], recomendaciones: [] });
  const ops = cfg.diasOperativos || [3, 4, 5, 6];

  // ---- Meses
  const porMes = {};
  dias.forEach(c => { const m = c.fecha.slice(0, 7); (porMes[m] = porMes[m] || []).push(c); });
  const mesHoy = hasta.slice(0, 7);
  if (!porMes[mesHoy]) porMes[mesHoy] = [];
  const meses = Object.keys(porMes).sort().map(m => {
    const s = sumar_(porMes[m]);
    const fin = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).toISOString().slice(0, 10);
    const opMes = diasOperativosEntre_(m + '-01', fin, ops);
    const pasados = opMes.filter(d => d < hasta || (d === hasta && porMes[m].some(c => c.fecha === d)));
    const conCierre = {}; porMes[m].forEach(c => { conCierre[c.fecha] = 1; });
    s.mes = m; s.nombre = MES_NOM(m); s.diasOperativos = opMes.length;
    s.diasSinCierre = pasados.filter(d => !conCierre[d]);
    s.restantes = opMes.filter(d => d >= hasta && !conCierre[d]).length;
    s.enCurso = m === mesHoy;
    s.objetivo = (cfg.objetivos || {})[m] || null;
    if (porMes[m].length) {
      const ord = porMes[m].slice().sort((a, b) => b.total - a.total);
      s.mejor = { fecha: ord[0].fecha, total: ord[0].total }; s.peor = { fecha: ord[ord.length - 1].fecha, total: ord[ord.length - 1].total };
    }
    return s;
  });
  meses.forEach((s, i) => {
    const p = meses[i - 1];
    if (p && p.dias) s.vsAnterior = { mes: p.mes, total: p.total, deltaTotal: r2_(s.total - p.total), deltaTotalPct: pct_(s.total, p.total),
      promDia: p.promDia, deltaPromPct: s.promDia != null ? pct_(s.promDia, p.promDia) : null };
  });

  // ---- Semanas (lunes a domingo)
  const porSem = {};
  dias.forEach(c => { const w = lunes_(c.fecha); (porSem[w] = porSem[w] || []).push(c); });
  const semanas = Object.keys(porSem).sort().map(w => Object.assign(sumar_(porSem[w]), { semana: w }));
  semanas.forEach((s, i) => { if (i) s.deltaPct = pct_(s.total, semanas[i - 1].total); });

  // ---- Años
  const porAnio = {};
  dias.forEach(c => { const y = c.fecha.slice(0, 4); (porAnio[y] = porAnio[y] || []).push(c); });
  const anios = Object.keys(porAnio).sort().map(y => Object.assign(sumar_(porAnio[y]), { anio: y, desde: porAnio[y][0].fecha, hasta: porAnio[y][porAnio[y].length - 1].fecha }));

  // ---- Día de la semana (todo el histórico disponible)
  const totalHist = dias.reduce((a, c) => a + c.total, 0);
  const diaSemana = ops.map(d => {
    const l = dias.filter(c => new Date(c.fecha + 'T12:00:00Z').getUTCDay() === d), t = l.reduce((a, c) => a + c.total, 0);
    return { dia: d, nombre: NOMBRE_DIA[d], n: l.length, total: r2_(t), promedio: l.length ? r2_(t / l.length) : null, participacion: totalHist ? r2_(t / totalHist * 100) : 0 };
  });

  // ---- Proyección del mes en curso (estimación)
  const actual = meses.find(m => m.mes === mesHoy);
  const recientes = dias.slice(-40).map(c => c.total);
  let proyeccion = null;
  if (actual && actual.diasSinCierre.length > 2) {
    proyeccion = { esEstimacion: true, bloqueada: true, real: actual.total, objetivo: actual.objetivo,
      motivo: 'No se proyecta ' + actual.nombre + ': hay ' + actual.diasSinCierre.length + ' días de apertura ya pasados sin cierre cargado. Una proyección con esos huecos sería engañosa. Cargá los cierres y se calcula sola.' };
  } else if (actual && recientes.length >= ac.minDias + 2) {
    const med = cuantil_(recientes, 0.5), p25 = cuantil_(recientes, 0.25), p75 = cuantil_(recientes, 0.75);
    proyeccion = { esEstimacion: true, real: actual.total, diasRestantes: actual.restantes, base: recientes.length,
      medio: r2_(actual.total + actual.restantes * med), minimo: r2_(actual.total + actual.restantes * p25), maximo: r2_(actual.total + actual.restantes * p75),
      supuestos: ['Abre ' + ops.map(d => NOMBRE_DIA[d]).join(', ') + ' (' + actual.restantes + ' días de apertura restantes en ' + actual.nombre + ').',
        'Cada día restante vende como la mediana de los últimos ' + recientes.length + ' días con cierre (' + $_(med) + ').',
        'Rango: percentiles 25 y 75 de esos días. No incluye feriados, promociones ni eventos especiales.',
        actual.diasSinCierre.length ? 'Hay ' + actual.diasSinCierre.length + ' día(s) de apertura sin cierre: si se cargan, el real sube.' : 'Todos los días de apertura pasados tienen cierre.'],
      incertidumbre: recientes.length < 12 ? 'alta' : (p75 - p25) / (med || 1) > 0.8 ? 'alta' : 'media' };
    if (actual.objetivo) {
      proyeccion.objetivo = actual.objetivo;
      proyeccion.avancePct = r2_(actual.total / actual.objetivo * 100);
      proyeccion.necesarioPorDia = actual.restantes ? r2_(Math.max(0, actual.objetivo - actual.total) / actual.restantes) : null;
      proyeccion.cumpliriaPct = r2_(proyeccion.medio / actual.objetivo * 100);
    }
  }

  // ---- Alertas (valor observado, período comparado, motivo)
  const alertas = [];
  const ultCompleto = meses.filter(m => !m.enCurso && m.dias >= ac.minDias);
  const comp = (m, p) => {
    if (!m || !p || m.dias < ac.minDias || p.dias < ac.minDias) return;
    const d = pct_(m.promDia, p.promDia);
    if (d != null && d <= -ac.caidaPct) alertas.push({ tipo: 'caida_facturacion', nivel: 'alta', titulo: 'Caída del promedio diario de ventas',
      observado: $_(m.promDia) + ' por día en ' + m.nombre + ' (' + m.dias + ' días con cierre)', comparado: $_(p.promDia) + ' por día en ' + p.nombre + ' (' + p.dias + ' días)',
      valor: d, motivo: 'Baja de ' + Math.abs(d) + '%, por encima del umbral configurado (' + ac.caidaPct + '%).' });
    if (m.mix && p.mix) ['tarjetas', 'transferencia', 'efectivo'].forEach(k => {
      const pp = r2_(m.mix[k] - p.mix[k]);
      if (Math.abs(pp) >= ac.mixPp) alertas.push({ tipo: 'cambio_mix', nivel: 'media', titulo: 'Cambio en el mix de ' + k,
        observado: m.mix[k] + '% en ' + m.nombre, comparado: p.mix[k] + '% en ' + p.nombre, valor: pp,
        motivo: (pp > 0 ? 'Subió ' : 'Bajó ') + Math.abs(pp) + ' puntos (umbral ' + ac.mixPp + ').' });
    });
  };
  if (actual && actual.dias >= ac.minDias) comp(actual, ultCompleto[ultCompleto.length - 1]);
  else if (ultCompleto.length >= 2) comp(ultCompleto[ultCompleto.length - 1], ultCompleto[ultCompleto.length - 2]);
  // Semana: última semana con ≥3 días vs promedio de las 4 previas
  const semOk = semanas.filter(s => s.dias >= 3);
  if (semOk.length >= 5) {
    const u = semOk[semOk.length - 1], prev = semOk.slice(-5, -1), prom = prev.reduce((a, s) => a + s.total, 0) / prev.length, d = pct_(u.total, prom);
    if (d <= -ac.caidaPct) alertas.push({ tipo: 'caida_semanal', nivel: 'media', titulo: 'Semana por debajo de lo habitual',
      observado: $_(u.total) + ' en la semana del ' + fdm_(u.semana), comparado: $_(prom) + ' de promedio en las 4 semanas anteriores', valor: d,
      motivo: 'Baja de ' + Math.abs(d) + '% (umbral ' + ac.caidaPct + '%).' });
  }
  if (proyeccion && !proyeccion.bloqueada && proyeccion.objetivo && proyeccion.maximo < proyeccion.objetivo) alertas.push({ tipo: 'desvio_objetivo', nivel: 'alta', titulo: 'Riesgo de no cumplir el objetivo del mes',
    observado: 'Proyección ' + $_(proyeccion.minimo) + ' a ' + $_(proyeccion.maximo) + ' (estimación)', comparado: 'Objetivo ' + $_(proyeccion.objetivo) + ' de ' + actual.nombre,
    valor: proyeccion.cumpliriaPct, motivo: 'Incluso el escenario alto queda debajo del objetivo. Hacen falta ' + $_(proyeccion.necesarioPorDia || 0) + ' por día en los ' + actual.restantes + ' días restantes.' });
  const top = diaSemana.slice().sort((a, b) => b.participacion - a.participacion)[0];
  if (top && top.n >= ac.minDias && top.participacion >= ac.concentracionPct) alertas.push({ tipo: 'concentracion_dia', nivel: 'media', titulo: 'Ventas concentradas en un solo día',
    observado: top.participacion + '% de la facturación ocurre los ' + top.nombre, comparado: 'Histórico desde ' + fdm_(dias[0].fecha) + ' (' + dias.length + ' días con cierre)',
    valor: top.participacion, motivo: 'Supera el ' + ac.concentracionPct + '% configurado: un ' + top.nombre + ' flojo impacta fuerte en el mes.' });
  const sinCierre = meses.reduce((a, m) => a.concat(m.diasSinCierre), []).filter(d => d >= dias[0].fecha);
  if (sinCierre.length) alertas.push({ tipo: 'datos_incompletos', nivel: sinCierre.length > 3 ? 'alta' : 'media', titulo: 'Días de apertura sin cierre cargado',
    observado: sinCierre.length + ' día(s): ' + sinCierre.slice(-6).map(fdm_).join(', ') + (sinCierre.length > 6 ? '…' : ''), comparado: 'Calendario de apertura configurado',
    valor: sinCierre.length, motivo: 'Los KPIs de esos períodos pueden estar subestimados. No implica que el local no haya abierto.' });
  if (sync && sync.errores && sync.errores.length) alertas.push({ tipo: 'inconsistencias', nivel: 'media', titulo: 'Inconsistencias en la planilla',
    observado: sync.errores.length + ' observación(es) en la última lectura', comparado: 'Lectura del ' + fdm_(String(sync.ts).slice(0, 10)), valor: sync.errores.length,
    motivo: sync.errores.slice(0, 3).join(' · ') });

  // ---- Recomendaciones (diagnóstico · datos · causa posible · acción · medición)
  const rec = [];
  alertas.forEach(a => {
    if (a.tipo === 'caida_facturacion') rec.push({ prioridad: 1, titulo: 'Recuperar el promedio diario',
      diagnostico: 'Se vende menos por día de apertura que el mes anterior.', datos: a.observado + ' vs. ' + a.comparado + ' (' + a.valor + '%).',
      causa: 'Hecho: bajó la venta media diaria. Hipótesis (sin verificar): menor tráfico, días sin cargar, estacionalidad o falta de stock. La planilla no tiene productos ni operaciones, así que no permite atribuir la caída a una categoría.',
      accion: 'Revisar los 3 días más bajos del mes' + (actual && actual.peor ? ' (el peor: ' + fdm_(actual.peor.fecha) + ', ' + $_(actual.peor.total) + ')' : '') + ': confirmar que el cierre esté completo y cruzar con la auditoría de esos días (orden, pedidos pendientes).',
      medicion: 'Promedio por día con cierre de las próximas 2 semanas, contra ' + a.comparado + '.' });
    if (a.tipo === 'desvio_objetivo') rec.push({ prioridad: 1, titulo: 'Ritmo necesario para el objetivo',
      diagnostico: 'Con el ritmo actual no se llega al objetivo del mes.', datos: a.observado + '; ' + a.comparado + '; avance real ' + proyeccion.avancePct + '%.',
      causa: 'Hecho: la proyección (estimación) queda debajo del objetivo. La causa no se puede determinar con los datos de cierre.',
      accion: 'Fijar una meta diaria de ' + $_(proyeccion.necesarioPorDia || 0) + ' para los ' + actual.restantes + ' días que quedan y revisarla en la apertura de cada día. Si no es realista, revisar el objetivo.',
      medicion: 'Venta diaria contra la meta de ' + $_(proyeccion.necesarioPorDia || 0) + ' y avance % del objetivo cada semana.' });
    if (a.tipo === 'concentracion_dia') {
      const flojo = diaSemana.filter(d => d.n >= 2).sort((x, y) => x.promedio - y.promedio)[0];
      rec.push({ prioridad: 2, titulo: 'Reducir la dependencia del ' + top.nombre,
        diagnostico: 'Gran parte de la venta depende de un solo día.', datos: a.observado + '. Día más flojo: ' + (flojo ? flojo.nombre + ' (' + $_(flojo.promedio) + ' de promedio, ' + flojo.participacion + '%)' : 's/d') + '.',
        causa: 'Hecho: la venta se concentra el ' + top.nombre + '. Hipótesis: más tráfico de fin de semana. Sin datos de visitas no se puede confirmar.',
        accion: 'Probar durante 4 semanas una acción puntual el ' + (flojo ? flojo.nombre : 'día más flojo') + ' (comunicación en redes, beneficio por transferencia o recordatorio a clientas) y no cambiar nada más para poder medirla.',
        medicion: 'Promedio del ' + (flojo ? flojo.nombre : 'día') + ' en esas 4 semanas contra ' + (flojo ? $_(flojo.promedio) : 'su promedio actual') + ', y participación del ' + top.nombre + ' por debajo del ' + ac.concentracionPct + '%.' });
    }
    if (a.tipo === 'cambio_mix') rec.push({ prioridad: 3, titulo: 'Entender el cambio en ' + a.titulo.replace('Cambio en el mix de ', ''),
      diagnostico: 'Cambió de forma relevante cómo pagan las clientas.', datos: a.observado + ' vs. ' + a.comparado + ' (' + (a.valor > 0 ? '+' : '') + a.valor + ' pp).',
      causa: 'Hecho: cambió la participación del medio de pago. Hipótesis: promociones bancarias, recargos o un error de carga. Hay que verificarlo con caja.',
      accion: 'Conciliar los importes del medio con el resumen del banco o del posnet de la semana y confirmar que no haya errores de carga.',
      medicion: 'Diferencia entre planilla y conciliación igual a 0 y mix estable en las próximas 2 semanas.' });
    if (a.tipo === 'datos_incompletos' || a.tipo === 'inconsistencias') rec.push({ prioridad: a.tipo === 'datos_incompletos' ? 1 : 2, titulo: a.tipo === 'datos_incompletos' ? 'Completar los cierres faltantes' : 'Corregir inconsistencias de la planilla',
      diagnostico: 'Los indicadores dependen de que el cierre se cargue completo cada día.', datos: a.observado + '.',
      causa: 'Hecho: faltan datos o hay datos ambiguos. No es una conclusión sobre el desempeño del local ni del personal.',
      accion: a.tipo === 'datos_incompletos' ? 'Cargar los días pendientes o indicar en la planilla que el local estuvo cerrado. Agregar una 5.ª semana en los meses con más de 16 días de apertura.' : 'Revisar en la planilla las celdas señaladas (' + a.motivo.slice(0, 160) + ').',
      medicion: 'Cero días pendientes y cero observaciones en la próxima sincronización.' });
  });
  if (actual && actual.vsAnterior && actual.vsAnterior.deltaPromPct != null && actual.vsAnterior.deltaPromPct >= ac.caidaPct && actual.dias >= ac.minDias) rec.push({ prioridad: 3, titulo: 'Sostener la mejora',
    diagnostico: 'El promedio diario mejoró contra el mes anterior.', datos: $_(actual.promDia) + ' vs. ' + $_(actual.vsAnterior.promDia) + ' (+' + actual.vsAnterior.deltaPromPct + '%).',
    causa: 'Hecho: subió la venta media diaria. La causa no surge de la planilla; conviene anotar qué se hizo distinto este mes.',
    accion: 'Registrar en Otros/Novedades qué acciones comerciales hubo este mes para poder repetirlas.', medicion: 'Que el promedio del mes próximo no baje de ' + $_(actual.vsAnterior.promDia) + '.' });
  rec.sort((a, b) => a.prioridad - b.prioridad);

  // ---- Resumen ejecutivo
  const ref = actual && actual.dias ? actual : ultCompleto[ultCompleto.length - 1];
  const resumen = [];
  if (ref && ref.vsAnterior) resumen.push({ pregunta: '¿Estamos vendiendo más o menos que antes?', respuesta: ref.nombre + ': ' + $_(ref.promDia) + ' por día con cierre, ' +
    (ref.vsAnterior.deltaPromPct >= 0 ? '+' : '') + ref.vsAnterior.deltaPromPct + '% contra ' + MES_NOM(ref.vsAnterior.mes) + ' (' + $_(ref.vsAnterior.promDia) + ').' + (ref.enCurso ? ' Mes en curso.' : '') });
  if (proyeccion && proyeccion.bloqueada) resumen.push({ pregunta: '¿Cómo cerraría el mes?', respuesta: proyeccion.motivo });
  else if (proyeccion) resumen.push({ pregunta: '¿Cómo cerraría el mes?', respuesta: 'Estimación: ' + $_(proyeccion.minimo) + ' a ' + $_(proyeccion.maximo) + ' (central ' + $_(proyeccion.medio) + '), incertidumbre ' + proyeccion.incertidumbre + '.' + (proyeccion.objetivo ? ' Objetivo ' + $_(proyeccion.objetivo) + ': avance ' + proyeccion.avancePct + '%.' : ' No hay objetivo cargado para este mes.') });
  if (top) resumen.push({ pregunta: '¿Qué está impulsando las ventas?', respuesta: 'Los ' + top.nombre + ' aportan el ' + top.participacion + '% (' + $_(top.promedio) + ' de promedio). Sin detalle por producto no se puede identificar qué artículos impulsan la venta.' });
  resumen.push({ pregunta: '¿Qué conviene revisar esta semana?', respuesta: rec.length ? rec.slice(0, 3).map(r => r.titulo).join(' · ') : 'Sin alertas relevantes con los umbrales actuales.' });

  return Object.assign(base, { desde: dias[0].fecha, hasta: dias[dias.length - 1].fecha, diasConCierre: dias.length,
    meses: meses, semanas: semanas.slice(-16), anios: anios, diaSemana: diaSemana, proyeccion: proyeccion, alertas: alertas, recomendaciones: rec, resumen: resumen,
    ultimos: dias.slice(-31) });
}

/* =================== Historial =================== */
/* El historial es cronológico y solo crece: se ubica el rango por búsqueda binaria sobre la columna de fecha
   y se leen únicamente esas filas (no toda la hoja). */
function histRango_(desde, hasta) {
  const sh = tabla_('Historial'), n = sh.getLastRow() - 1;
  if (n < 1) return [];
  const ts = sh.getRange(2, 1, n, 1).getValues();
  const fechaDe = i => { const v = ts[i][0]; return Utilities.formatDate(v instanceof Date ? v : new Date(String(v)), TZ, 'yyyy-MM-dd'); };
  let lo = 0, hi = n;
  while (lo < hi) { const m = (lo + hi) >> 1; if (fechaDe(m) < desde) lo = m + 1; else hi = m; }
  const ini = lo; hi = n;
  while (lo < hi) { const m = (lo + hi) >> 1; if (fechaDe(m) <= hasta) lo = m + 1; else hi = m; }
  if (lo <= ini) return [];
  return sh.getRange(ini + 2, TABLAS.Historial.length + 1, lo - ini, 1).getValues().map(r => { try { return JSON.parse(r[0]); } catch (e) { return null; } }).filter(Boolean);
}
function listarHistorial(token, desde, hasta, q) {
  sesion_(token, 'historial');
  hasta = fechaOk_(hasta) || hoy_(); desde = fechaOk_(desde) || hasta.slice(0, 8) + '01';
  q = txt_(q, 40).toLowerCase();
  return histRango_(desde, hasta)
    .filter(h => !q || (h.usuario + ' ' + h.accion + ' ' + h.detalle + ' ' + h.ref).toLowerCase().indexOf(q) >= 0)
    .map(h => ({ ts: h.ts, usuario: h.usuario, accion: h.accion, resultado: h.resultado, ref: h.ref, detalle: h.detalle })).reverse().slice(0, 1000);
}
function verificarHistorial(token) {
  const s = sesion_(token, 'historial');
  const h = tAll_('Historial');
  let prev = 'GENESIS';
  for (let i = 0; i < h.length; i++) {
    const e = h[i];
    const calc = sha_(prev + '|' + e.ts + '|' + e.uid + '|' + e.accion + '|' + e.resultado + '|' + e.ref + '|' + e.detalle);
    if (e.prev !== prev || calc !== e.hash) return { ok: false, eventos: h.length, rotoEn: i + 1, ts: e.ts };
    prev = e.hash;
  }
  return { ok: prev === (PROPS.getProperty('HIST_LAST') || 'GENESIS'), eventos: h.length };
}

/* =================== Novedades de RR. HH. (separado) =================== */
function listarNovedades(token) { sesion_(token, 'rrhh'); return tAll_('RRHH').reverse(); }
function crearNovedad(token, d) {
  const s = sesion_(token, 'rrhh');
  d = d || {};
  const tipos = ['llegada_tarde', 'inasistencia', 'salida_anticipada', 'otra'];
  const u = usuarios_().find(x => x.id === d.uid);
  if (!u || tipos.indexOf(d.tipo) < 0 || !fechaOk_(d.fecha)) throw new Error('Completá empleado, tipo y fecha.');
  const n = { id: nuevoId_('R'), uid: u.id, legajo: u.legajo, nombre: u.nombre, fecha: d.fecha, tipo: d.tipo, detalle: txt_(d.detalle, 400),
    origen: 'manual', estado: 'abierta', creadoPor: s.user.nombre, creado: new Date().toISOString() };
  lock_(() => tAdd_('RRHH', n));
  log_(s, 'novedad_rrhh_creada', 'abierta', n.id, u.nombre + ' ' + n.fecha + ' · ' + n.tipo);
  return n;
}
function actualizarNovedad(token, id, estadoN, nota) {
  const s = sesion_(token, 'rrhh');
  if (['abierta', 'justificada', 'no_justificada', 'cerrada'].indexOf(estadoN) < 0) throw new Error('Estado inválido.');
  return lock_(() => {
    const n = tAll_('RRHH').find(x => x.id === id); if (!n) throw new Error('Novedad no encontrada.');
    const antes = n.estado; n.estado = estadoN; n.nota = txt_(nota, 300); n.actualizadoPor = s.user.nombre; n.actualizado = new Date().toISOString();
    tUpd_('RRHH', 'id', n.id, n);
    log_(s, 'novedad_rrhh_actualizada', estadoN, n.id, antes + ' → ' + estadoN);
    return n;
  });
}

/* =================== Configuración =================== */
function getConfig(token) {
  sesion_(token, 'config');
  const c = cfg_();
  return Object.assign({}, c, { modulos: MODULOS, permsRol: PERMS_ROL, version: VERSION, cierreSync: JSON.parse(PROPS.getProperty('CIERRE_SYNC') || 'null'),
    ultimaPurga: PROPS.getProperty('ULTIMA_PURGA') || '' });
}
function setConfig(token, d) {
  const s = sesion_(token, 'config', true);
  d = d || {};
  const c = cfg_(), antes = JSON.stringify(c);
  if (Array.isArray(d.diasOperativos)) c.diasOperativos = d.diasOperativos.map(Number).filter(n => n >= 0 && n <= 6);
  if (d.local === null) c.local = null;
  else if (d.local && isFinite(d.local.lat) && isFinite(d.local.lng)) c.local = { lat: Math.round(Number(d.local.lat) * 1e6) / 1e6, lng: Math.round(Number(d.local.lng) * 1e6) / 1e6, radio: Math.min(2000, Math.max(30, Math.round(Number(d.local.radio) || c.radioDef))) };
  if (d.fotoIngresoObligatoria != null) c.fotoIngresoObligatoria = !!d.fotoIngresoObligatoria;
  if (d.retencionIngresosDias != null) c.retencionIngresosDias = Math.min(3650, Math.max(7, Math.round(Number(d.retencionIngresosDias) || 90)));
  if (d.retencionAuditoriasMeses != null) c.retencionAuditoriasMeses = Math.min(120, Math.max(1, Math.round(Number(d.retencionAuditoriasMeses) || 12)));
  if (d.cierreFileId != null) { const id = txt_(d.cierreFileId, 100); if (!/^[\w-]{20,100}$/.test(id)) throw new Error('ID de archivo inválido.'); c.cierreFileId = id; }
  if (d.objetivos && typeof d.objetivos === 'object') {
    const o = {};
    Object.keys(d.objetivos).slice(0, 60).forEach(k => { const v = Number(d.objetivos[k]); if (/^\d{4}-\d{2}$/.test(k) && isFinite(v) && v > 0) o[k] = Math.round(v); });
    c.objetivos = o;
  }
  if (d.alertasCom && typeof d.alertasCom === 'object') {
    const a = d.alertasCom, n = (v, lo, hi, def) => { v = Number(v); return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def; };
    c.alertasCom = { caidaPct: n(a.caidaPct, 1, 90, 15), mixPp: n(a.mixPp, 1, 60, 10), minDias: Math.round(n(a.minDias, 2, 15, 4)), concentracionPct: n(a.concentracionPct, 26, 90, 45) };
  }
  if (d.avisoFotos != null) c.avisoFotos = txt_(d.avisoFotos, 600) || CFG_DEF.avisoFotos;
  PROPS.setProperty('CFG', JSON.stringify(c));
  log_(s, 'cambio_configuracion', 'ok', '', antes.slice(0, 180) + ' → ' + JSON.stringify(c).slice(0, 180));
  return c;
}
function setParams(token, p) {
  const s = sesion_(token, 'config', true);   // 3.2: parámetros que cambian cómo se califica = operación sensible (PIN reciente)
  p = p || {};
  const n = (v, d, lo, hi) => { v = Number(v); return isFinite(v) && String(v) !== '' ? Math.min(hi, Math.max(lo, v)) : d; };
  const out = {
    promExc: n(p.promExc, DEF.promExc, 1, 5), promAdv: n(p.promAdv, DEF.promAdv, 1, 5),
    maxInf: Math.round(n(p.maxInf, DEF.maxInf, 0, 999)), diasMax: Math.round(n(p.diasMax, DEF.diasMax, 0, 365)),
    mExc: txt_(p.mExc, 500) || DEF.mExc, mAdv: txt_(p.mAdv, 500) || DEF.mAdv, mRec: txt_(p.mRec, 500) || DEF.mRec
  };
  if (out.promAdv > out.promExc) throw new Error('El mínimo de Advertencia no puede superar al de Excelente.');
  PROPS.setProperty('PARAMS', JSON.stringify(out));
  log_(s, 'cambio_parametros_auditoria', 'ok', '', JSON.stringify(out).slice(0, 200));
  return out;
}

/* =================== Retención (una vez por día, en segundo plano) =================== */
/* Corre colgada de un pedido de personal jerárquico, así que trabaja por lotes acotados: si queda pendiente, sigue al día siguiente. */
const PURGA_LOTE = 20;
function purgaDiaria_() {
  const hoy = hoy_();
  if (PROPS.getProperty('ULTIMA_PURGA') === hoy) return;
  const l = LockService.getScriptLock(); if (!l.tryLock(1000)) return;
  try {
    if (PROPS.getProperty('ULTIMA_PURGA') === hoy) return;
    PROPS.setProperty('ULTIMA_PURGA', hoy);
    const cfg = cfg_();
    const limIng = new Date(Date.now() - cfg.retencionIngresosDias * 86400000).toISOString().slice(0, 10);
    const vencidas = tAll_('Ingresos').filter(x => x.foto && x.fecha < limIng);
    vencidas.slice(0, PURGA_LOTE).forEach(x => {
      try { DriveApp.getFileById(x.foto).setTrashed(true); } catch (e) {}
      x.foto = null; x.fotoPurgada = true; x.tieneFoto = false; tUpd_('Ingresos', 'id', x.id, x);
    });
    const limAud = new Date(); limAud.setMonth(limAud.getMonth() - cfg.retencionAuditoriasMeses);
    let m = 0;
    const it = fotosAud_().searchFiles("createdDate < '" + Utilities.formatDate(limAud, 'UTC', "yyyy-MM-dd'T'HH:mm:ss") + "'");
    while (it.hasNext() && m < PURGA_LOTE) { it.next().setTrashed(true); m++; }
    PROPS.setProperty('PURGA_RES', JSON.stringify({ fecha: hoy, fotosIngreso: Math.min(vencidas.length, PURGA_LOTE), fotosAuditoria: m, pendientes: vencidas.length > PURGA_LOTE || it.hasNext() }));
  } finally { l.releaseLock(); }
  const r = JSON.parse(PROPS.getProperty('PURGA_RES') || '{}');
  if (r.fecha === hoy && (r.fotosIngreso || r.fotosAuditoria)) log_(null, 'retencion_automatica', 'ok', '', 'Fotos de ingreso a papelera: ' + r.fotosIngreso + ' · fotos de auditoría: ' + r.fotosAuditoria + (r.pendientes ? ' · quedan más para mañana' : ''));
}
