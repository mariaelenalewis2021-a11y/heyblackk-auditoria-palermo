/**
 * Hey Blackk · Palermo — SERVIDOR v3 (Google Apps Script)
 *
 * Única fuente de datos: planilla "HeyBlackk · Auditorías Palermo" en el Drive de la cuenta dueña.
 * Hojas: Registro (auditorías, se conserva), Usuarios, Ingresos, Correcciones, Acciones, RRHH, Cierres, Historial,
 *        Feriados (3.3: feriados nacionales leídos de una API pública + excepciones manuales), Vacaciones (3.3),
 *        Sucursales (3.4: editable a mano por jefes) y Horas (3.4: exportación para liquidación de sueldos).
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
const REV = '3.4';                        // revisión del servidor (para verificar despliegues)

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

const MODULOS = ['ingresos', 'auditar', 'auditoria', 'acciones', 'kpi', 'historial', 'cierre', 'rrhh', 'otros', 'personal', 'config', 'vacaciones'];
const PERMS_ROL = {
  empleado: [],
  responsable: ['ingresos', 'auditar', 'auditoria', 'acciones', 'kpi', 'cierre', 'otros', 'vacaciones'],
  admin: MODULOS.slice()
};
/* 3.3 · Feriados: fuentes públicas y gratuitas (sin clave). Se prueban en orden; si una falla se pasa a la siguiente.
   Tipos normalizados: feriado nacional · trasladable · puente turístico · día no laborable. */
const FERIADOS_FUENTES = [
  { id: 'argentinadatos', nombre: 'ArgentinaDatos (api.argentinadatos.com)', url: y => 'https://api.argentinadatos.com/v1/feriados/' + y,
    parse: j => (Array.isArray(j) ? j : []).map(x => ({ fecha: fechaOk_(x.fecha), nombre: txt_(x.nombre, 80), tipo: tipoFeriado_(x.tipo, x.nombre) })) },
  { id: 'nager', nombre: 'Nager.Date (date.nager.at)', url: y => 'https://date.nager.at/api/v3/PublicHolidays/' + y + '/AR',
    parse: j => (Array.isArray(j) ? j : []).map(x => ({ fecha: fechaOk_(x.date), nombre: txt_(x.localName || x.name, 80), tipo: tipoFeriado_(x.types && x.types[0], x.localName || x.name) })) },
  { id: 'nolaborables', nombre: 'nolaborables.com.ar', url: y => 'https://nolaborables.com.ar/api/v2/feriados/' + y,
    parse: (j, y) => (Array.isArray(j) ? j : []).map(x => ({ fecha: fechaOk_(y + '-' + String(x.mes).padStart(2, '0') + '-' + String(x.dia).padStart(2, '0')), nombre: txt_(x.motivo || x.nombre, 80), tipo: tipoFeriado_(x.tipo, x.motivo) })) }
];
function tipoFeriado_(t, nombre) {
  t = String(t || '').toLowerCase(); const n = String(nombre || '').toLowerCase();
  if (/puente/.test(t) || /puente/.test(n)) return 'puente turístico';
  if (/traslad/.test(t)) return 'trasladable';
  if (/nolaborable|no laborable|optional|observance/.test(t) || /no laborable/.test(n)) return 'día no laborable';
  return 'feriado nacional';
}

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
  ubicacionObligatoria: true,             // 3.3: sin ubicación del teléfono la fichada se rechaza (no queda ni "para revisar")
  retencionIngresosDias: 90,
  retencionAuditoriasMeses: 12,
  cierreFileId: CIERRE_FILE_DEF,
  objetivos: {},                          // {'2026-10': 15000000} — los carga un administrador
  alertasCom: { caidaPct: 15, mixPp: 10, minDias: 4, concentracionPct: 45, mesBajoPct: 10 },   // mesBajoPct (3.3): umbral para considerar "mes bajo"
  vacacionesDias: 'corridos',
  redondeoMin: 1,                         // 3.4: redondeo de las horas por día (1 = al minuto; 5, 10 o 15 minutos)
  precisionMax: 100,                      // 3.4: precisión del GPS peor que esto (m) → no se ficha (se ofrece fichaje manual)
  precisionRevisar: 50,                   // 3.4: precisión peor que esto (m) → se ficha pero queda "para revisar"
  avisoUbicacion: 'Usamos la ubicación de tu teléfono una sola vez, en el momento en que tocás «Fichar», para validar que estés en tu sucursal. No hacemos seguimiento ni la guardamos en ningún otro momento, y solo la ven los jefes.',             // 3.3: cómo se cuentan los días de vacaciones: 'corridos' o 'apertura' (solo días en que Palermo abre, sin feriados)
  avisoFotos: 'La foto de ingreso se usa solo para validar el registro de asistencia al showroom. La ven únicamente los responsables autorizados y se elimina automáticamente a los 90 días.'
};

/* ---------- Auditorías (hoja existente) ---------- */
const HEAD = ['ID', 'Fecha', 'Auditor', ...PUNTOS.map(p => p[1]), 'Promedio', 'Resultado',
  ...PUNTOS.map(p => 'Infr. ' + p[2]), 'Total infracciones', 'Checklist', 'Días pedido más viejo', 'Pedido fuera de plazo',
  'Comentario general', ...PUNTOS.map(p => 'Coment. ' + p[1]), 'Fotos', 'Cargada', 'JSON'];

/* ---------- Tablas nuevas (columnas legibles + JSON completo al final) ---------- */
const TABLAS = {
  // 3.4: columnas nuevas al final (antes de JSON): la migración las inserta sin mover los datos existentes.
  Usuarios: ['id', 'legajo', 'nombre', 'sector', 'rol', 'estado', 'registraIngreso', 'fechaIngreso', 'fechaBaja', 'actualizado', 'sucursal', 'horasEsperadas'],
  Ingresos: ['id', 'fecha', 'tipo', 'legajo', 'nombre', 'hora', 'estado', 'geoResultado', 'tieneFoto', 'horaCorregida', 'creado', 'sucursal', 'modo', 'latitud', 'longitud', 'precision', 'distancia'],
  Correcciones: ['id', 'ingresoId', 'tipo', 'legajo', 'nombre', 'fecha', 'horaPropuesta', 'motivo', 'estado', 'resueltoPor', 'resuelto', 'creado', 'clase', 'sucursal'],
  Acciones: ['id', 'auditId', 'punto', 'descripcion', 'responsable', 'vence', 'estado', 'creado', 'cerrado'],
  RRHH: ['id', 'legajo', 'nombre', 'fecha', 'tipo', 'detalle', 'origen', 'estado', 'creadoPor', 'creado'],
  Cierres: ['fecha', 'tarjetas', 'transferencia', 'efectivo', 'total', 'hoja', 'columna', 'sincronizado'],
  Historial: ['ts', 'usuario', 'accion', 'resultado', 'ref', 'detalle', 'hash'],
  // 3.3 · Feriados: origen 'api' (feriado nacional) o 'manual' (excepción: feriado de CABA, inventario, evento = local cerrado).
  //       palermo: '' (sin confirmar) · 'cerrado' (estuvo cerrado) · 'abierto' (abrió; el cierre queda pendiente de carga).
  Feriados: ['fecha', 'nombre', 'tipo', 'origen', 'palermo', 'confirmadoPor', 'actualizado'],
  // 3.3 · Vacaciones: solo el usuario (legajo) y el id interno; sin PIN, sin mail. Nombres se resuelven desde Usuarios al leer.
  Vacaciones: ['id', 'usuario', 'desde', 'hasta', 'dias', 'comentario', 'estado', 'solicitado', 'decididoPor', 'decidido', 'motivo']
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
const RAPIDAS_ = { estado: 1, inicio: 1, resumenHoy: 1, login: 1, logout: 1, yo: 1, reauth: 1, miJornada: 1, misIngresos: 1, registrarFichada: 1, registrarIngreso: 1, solicitarCorreccion: 1, getParams: 1, getAviso: 1, fotoIngreso: 1, getFoto: 1,
  misVacaciones: 1, solicitarVacaciones: 1, cancelarVacaciones: 1, vacacionesVistas: 1, verificarUbicacion: 1, solicitarFichajeManual: 1, misSolicitudes: 1 };
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
    if (m === 'AUTH' || m === 'PERM' || m === 'ELEV' || /^(DUP|GEO|ABIERTA|RAPIDO):/.test(m)) return json_({ ok: false, error: m.slice(0, 600) });   // códigos que la app interpreta
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
  // 3.4 · Fichaje con sucursales, fichaje manual, horas y panel de jefes
  verificarUbicacion: verificarUbicacion, solicitarFichajeManual: solicitarFichajeManual, misSolicitudes: misSolicitudes, resumenHoras: resumenHoras, exportarHoras: exportarHoras,
  panelFichajesHoy: panelFichajesHoy, corregirFichaje: corregirFichaje, cargarFichajeJefe: cargarFichajeJefe, listarSucursales: listarSucursales, guardarSucursal: guardarSucursal,
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
  getConfig: getConfig, setConfig: setConfig, setParams: setParams, cerrarSesionesDe: cerrarSesionesDe,
  // 3.3 · Feriados (jefes confirman; administración agrega excepciones y fuerza la actualización)
  getFeriados: getFeriados, confirmarFeriado: confirmarFeriado, agregarExcepcion: agregarExcepcion, quitarExcepcion: quitarExcepcion, actualizarFeriados: actualizarFeriados,
  // 3.3 · Vacaciones (empleado: las suyas · jefes: resolver)
  misVacaciones: misVacaciones, solicitarVacaciones: solicitarVacaciones, cancelarVacaciones: cancelarVacaciones, vacacionesVistas: vacacionesVistas,
  listarVacaciones: listarVacaciones, resolverVacaciones: resolverVacaciones
};

/* =================== Almacenamiento =================== */
/* Memoria de un solo pedido: la planilla abierta y las tablas ya leídas. Se vacía al entrar a doPost y al tomar el bloqueo,
   así cada sección crítica lee datos frescos. Evita abrir la planilla y releer la misma tabla varias veces por pedido. */
let SS_ = null, MEMO_ = {}, SCHEMA_OK = {};
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
    PROPS.setProperty('SCHEMA_' + nombre, TABLAS[nombre].join('|'));
  } else if (!SCHEMA_OK[nombre]) { if (PROPS.getProperty('SCHEMA_' + nombre) !== TABLAS[nombre].join('|')) migrarColumnas_(nombre, sh); SCHEMA_OK[nombre] = 1; }
  return sh;
}
/** 3.4 · Migración de columnas: si una tabla existente tiene menos columnas visibles que las definidas, inserta las nuevas
    ANTES de la columna JSON (los datos no se mueven de lugar relativo) y vuelve a escribir las filas con sus valores visibles.
    Solo agrega columnas al final; si la hoja no coincide con lo esperado, no toca nada y frena las escrituras (para no desalinear). */
function migrarColumnas_(nombre, sh) {
  lock_(() => {
    const firma = TABLAS[nombre].join('|');
    if (PROPS.getProperty('SCHEMA_' + nombre) === firma) return;
    const lc = sh.getLastColumn(), head = sh.getRange(1, 1, 1, lc).getValues()[0].map(String);
    const jsonAt = head.lastIndexOf('JSON') + 1, actuales = head.slice(0, Math.max(0, jsonAt - 1));
    const esPrefijo = jsonAt > 0 && actuales.join('|') === TABLAS[nombre].slice(0, actuales.length).join('|');
    if (!esPrefijo) { try { log_(null, 'migracion_columnas', 'error', nombre, 'Encabezados inesperados: ' + head.join(',').slice(0, 300)); } catch (e) {} throw new Error('La hoja ' + nombre + ' tiene columnas cambiadas a mano. Avisá a administración (no se modificó nada).'); }
    const faltan = TABLAS[nombre].slice(actuales.length);
    if (faltan.length) {
      sh.insertColumnsBefore(jsonAt, faltan.length);
      sh.getRange(1, jsonAt, 1, faltan.length).setValues([faltan]).setFontWeight('bold').setFontColor('#ffffff').setBackground('#111113');
      try { sh.showColumns(jsonAt, faltan.length); sh.hideColumns(jsonAt + faltan.length); } catch (e) {}
      const n = sh.getLastRow() - 1, nc = TABLAS[nombre].length + 1;
      if (n > 0) {
        const objs = sh.getRange(2, nc, n, 1).getValues().map(r => { try { return JSON.parse(r[0]); } catch (e) { return null; } });
        if (nombre === 'Usuarios') objs.forEach(o => { if (o && !o.sucursal) o.sucursal = 'Palermo'; });   // el personal existente es de Palermo
        const filas = objs.map((o, i) => o ? filaDe_(nombre, o) : sh.getRange(i + 2, 1, 1, nc).getValues()[0]);
        sh.getRange(2, 1, n, nc).setValues(filas);
      }
    }
    PROPS.setProperty('SCHEMA_' + nombre, firma);
    delete MEMO_[nombre]; if (nombre === 'Usuarios') CACHE.remove('usuarios');
    try { log_(null, 'migracion_columnas', 'ok', nombre, faltan.length ? 'Columnas agregadas: ' + faltan.join(', ') : 'Sin cambios'); } catch (e) {}
  });
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
  if (MEMO_[nombre]) return MEMO_[nombre].slice();
  const v = jsonCol_(nombre).filter(Boolean);   // (se lee antes de memorizar: una migración de columnas puede reiniciar MEMO_)
  MEMO_[nombre] = v;
  return v.slice();
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
/** Reemplaza todas las filas de una tabla chica (Feriados). Se usa dentro de lock_. */
function tReplace_(nombre, lista) {
  delete MEMO_[nombre];
  const sh = tabla_(nombre), n = sh.getLastRow() - 1, nc = TABLAS[nombre].length + 1;
  if (n > 0) sh.deleteRows(2, n);
  if (lista.length) sh.getRange(2, 1, lista.length, nc).setValues(lista.map(o => filaDe_(nombre, o)));
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
    permisos: permisos_(u), permisosPersonalizados: Array.isArray(u.permisos), creado: u.creado || '', bloqueado: !!u.bloqueadoPin, largoPin: largoPin_(u.rol),
    sucursal: sucDe_(u), horasEsperadas: u.horasEsperadas || null };
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
    const vac = deVacaciones_(), calHoy = calendario_(cfg), sucs = sucursales_();
    // 3.4: lo esperado se calcula por sucursal (sus días de apertura y feriados); quien está de vacaciones no se espera (no es falta).
    const porSuc = sucs.filter(x => x.activa).map(x => {
      const del = fichan.filter(u => normSuc_(sucDe_(u)) === normSuc_(x.nombre)), abre = x.dias.indexOf(dow_(hoy)) >= 0 && !feriadoSuc_(calHoy, x.nombre, hoy);
      const espera = abre ? del.filter(u => !vac(u.id, hoy)) : [];
      return { nombre: x.nombre, abre: abre, entradas: del.filter(u => ent[u.id]).length, esperadas: espera.length, incompleta: x.incompleta.length > 0 };
    }).filter(x => x.esperadas || x.entradas || x.incompleta);
    const enVac = fichan.filter(u => vac(u.id, hoy));
    out.personal = { activos: activos.length, fichan: fichan.length };
    out.fichadas = { entradas: Object.keys(ent).length, salidas: Object.keys(sal).length, esperadas: porSuc.reduce((a, x) => a + x.esperadas, 0), deVacaciones: enVac.length,
      abre: porSuc.some(x => x.abre), feriado: calHoy.feriado(hoy) ? calHoy.feriado(hoy).nombre : '', porSucursal: porSuc,
      sucursalesIncompletas: sucs.filter(x => x.activa && x.incompleta.length).map(x => ({ nombre: x.nombre, faltan: x.incompleta })) };
    if (ve('ingresos')) {
      const pend = tAll_('Correcciones').filter(c => c.estado === 'pendiente');
      out.correccionesPendientes = pend.filter(c => c.clase !== 'manual').length;
      out.manualesPendientes = pend.filter(c => c.clase === 'manual').length;
    }
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
    // 3.3: un día cargado en $0 también es un cierre (sin ventas); solo los días sin fila son "sin cierre".
    const c = tAll_('Cierres').filter(x => x.total >= 0).sort((a, b) => a.fecha.localeCompare(b.fecha)), u = c[c.length - 1];
    out.cierre = u ? { fecha: u.fecha, total: u.total } : null;
    const desde = new Date(hoy + 'T12:00:00Z'); desde.setUTCDate(desde.getUTCDate() - 14);
    const con = {}; c.forEach(x => { con[x.fecha] = 1; });
    // 3.3: los feriados confirmados cerrados y las excepciones no cuentan; un feriado sin confirmar tampoco es "pendiente" (queda "a confirmar").
    const cal = calendario_(cfg);
    out.diasSinCierre = diasOperativosEntre_(desde.toISOString().slice(0, 10), hoy, cfg.diasOperativos).filter(d => d < hoy && !con[d] && !cal.cerrado(d) && !cal.sinConfirmar(d)).length;
    out.mes = { total: c.filter(x => x.fecha.slice(0, 7) === hoy.slice(0, 7)).reduce((a, x) => a + x.total, 0), objetivo: (cfg.objetivos || {})[hoy.slice(0, 7)] || null };
    const fp = feriadosPanel_(cfg);
    out.feriados = { proximos: fp.proximos, pendientes: fp.pendientes, sync: fp.sync ? { ok: fp.sync.ok, ts: fp.sync.ts, ultimaOk: fp.sync.ultimaOk || (fp.sync.ok ? fp.sync.ts : null), fuente: fp.sync.nombreFuente || fp.sync.fuente || null } : null };
  }
  if (ve('rrhh')) out.rrhh = { abiertas: tAll_('RRHH').filter(n => n.estado === 'abierta').length };
  if (ve('historial')) out.historialHoy = histRango_(hoy, hoy).length;
  if (ve('vacaciones')) {
    const pend = tAll_('Vacaciones').filter(v => v.estado === 'pendiente'), lim = Date.now() - 3 * 86400000;
    out.vacaciones = { pendientes: pend.length, demoradas: pend.filter(v => new Date(v.solicitado).getTime() < lim).length };
  }
  // 3.4: contador rojo del menú = fichajes manuales + correcciones + vacaciones por resolver (solo lo que esta persona puede resolver).
  out.pendientesTotal = (out.manualesPendientes || 0) + (out.correccionesPendientes || 0) + (out.vacaciones ? out.vacaciones.pendientes : 0);
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
    const suc = sucursalValida_(d.sucursal);
    const asignado = d.pin != null && String(d.pin) !== '';
    const pin = asignado ? pinValido_(d.pin, largoPin_(rol)) : pinAleatorio_(largoPin_(rol)), salt = Utilities.getUuid();
    const u = { id: nuevoId_('U'), legajo: legajo, nombre: nombre, sector: txt_(d.sector, 40), rol: rol, estado: 'activo', sucursal: suc, horasEsperadas: horasEsperadas_(d.horasEsperadas),
      registraIngreso: d.registraIngreso !== false, fechaIngreso: fechaOk_(d.fechaIngreso) || hoy_(), salt: salt, pinHash: hashPin_(pin, salt),
      ver: 1, creado: new Date().toISOString(), creadoPor: s.user.nombre };
    guardarUsuario_(u, true);
    log_(s, 'alta_empleado', 'ok', u.id, nombre + ' · ' + legajo + ' · ' + rol + ' · ' + suc + (asignado ? ' · PIN asignado por jefe' : ' · PIN generado'));
    return { user: publico_(u), pinInicial: asignado ? null : pin };
  });
}
function editarEmpleado(token, uid, d) {
  const s = sesion_(token, 'personal');
  d = d || {};
  return lock_(() => {
    const u = usuarios_().find(x => x.id === uid); if (!u) throw new Error('Empleado no encontrado.');
    const resumen = x => [x.nombre, x.sector, x.registraIngreso, x.fechaIngreso, sucDe_(x), x.horasEsperadas ? x.horasEsperadas.horas + ' h/' + x.horasEsperadas.tipo : 'sin horas esperadas'].join(' / ');
    const antes = resumen(u);
    if (d.nombre != null) u.nombre = txt_(d.nombre, 60) || u.nombre;
    if (d.sucursal != null) u.sucursal = sucursalValida_(d.sucursal);
    if (d.horasEsperadas !== undefined) u.horasEsperadas = horasEsperadas_(d.horasEsperadas);
    if (d.sector != null) u.sector = txt_(d.sector, 40);
    if (d.registraIngreso != null) u.registraIngreso = !!d.registraIngreso;
    if (d.fechaIngreso != null && fechaOk_(d.fechaIngreso)) u.fechaIngreso = d.fechaIngreso;
    guardarUsuario_(u);
    log_(s, 'edicion_empleado', 'ok', u.id, antes + ' → ' + resumen(u));
    return publico_(u);
  });
}
/** 3.4: la sucursal tiene que existir en la hoja Sucursales (por defecto, Palermo). Devuelve el nombre tal como está en la hoja. */
function sucursalValida_(nombre) {
  const n = txt_(nombre, 40) || 'Palermo', s = sucursales_().find(x => normSuc_(x.nombre) === normSuc_(n));
  if (!s) throw new Error('La sucursal «' + n + '» no existe. Agregala primero en Fichaje → Sucursales (o en la hoja Sucursales).');
  return s.nombre;
}
/** Horas esperadas por empleado (informativo): {tipo: 'dia' | 'semana', horas}. null = sin dato. */
function horasEsperadas_(h) {
  if (!h || typeof h !== 'object') return null;
  const tipo = h.tipo === 'semana' ? 'semana' : 'dia', horas = Number(h.horas);
  if (!isFinite(horas) || horas <= 0) return null;
  if (horas > (tipo === 'dia' ? 16 : 80)) throw new Error(tipo === 'dia' ? 'Las horas esperadas por día no pueden superar 16.' : 'Las horas esperadas por semana no pueden superar 80.');
  return { tipo: tipo, horas: Math.round(horas * 100) / 100 };
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

/* =================== 3.4 · Sucursales (hoja editable por jefes) =================== */
/* La hoja "Sucursales" se edita a mano en la planilla (o desde la app): no tiene columna JSON, se lee celda por celda.
   Si una sucursal tiene datos incompletos, nadie de esa sucursal puede fichar automáticamente: se avisa en pantalla. */
const SUC_HEAD = ['Sucursal', 'Dirección', 'Latitud', 'Longitud', 'Radio (m)', 'Días de apertura', 'Activa', 'Actualizado'];
const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const SUC_LIMA = ['Lima', 'Lima 1111, Capital Federal, Buenos Aires', -34.6210674, -58.3817634, 100, '', 'Sí', ''];
const normSuc_ = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const diasTxt_ = arr => (arr || []).slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(d => DIAS_CORTOS[d]).join(', ');
function hojaSucursales_() {
  const ss = ss_();
  let sh = ss.getSheetByName('Sucursales');
  if (sh) return sh;
  sh = ss.insertSheet('Sucursales');
  sh.getRange(1, 1, 1, SUC_HEAD.length).setValues([SUC_HEAD]).setFontWeight('bold').setFontColor('#ffffff').setBackground('#111113');
  sh.setFrozenRows(1);
  // Semilla: Palermo con la ubicación que ya estaba configurada (si la había) y Lima con los datos indicados.
  const c = cfg_(), l = c.local && isFinite(c.local.lat) ? c.local : null, ahora = Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm');
  sh.getRange(2, 1, 2, SUC_HEAD.length).setValues([
    ['Palermo', '', l ? l.lat : '', l ? l.lng : '', l ? (l.radio || c.radioDef) : '', diasTxt_(c.diasOperativos), 'Sí', ahora],
    SUC_LIMA.slice(0, 7).concat([ahora])]);
  return sh;
}
function num_(v) {
  if (typeof v === 'number') return isFinite(v) ? v : NaN;
  let t = String(v == null ? '' : v).trim().replace(/\s/g, '').replace('−', '-');
  if (!t) return null;
  if (t.indexOf('.') < 0) t = t.replace(',', '.'); else t = t.replace(/,/g, '');
  const n = Number(t);
  return isFinite(n) ? n : NaN;
}
/** "mié, jue, vie, sáb" · "mié a sáb" · "miércoles-sábado" · "3,4,5,6" → [3,4,5,6]. Vacío → null. Texto no reconocido → {error}. */
function parseDias_(s) {
  const t = String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  if (!t) return { lista: null };
  const cod = w => { w = w.trim(); if (/^[0-6]$/.test(w)) return Number(w); const k = ['do', 'lu', 'ma', 'mi', 'ju', 'vi', 'sa'].indexOf(w.slice(0, 2)); return k; };
  const out = {}; let error = false;
  t.split(/\s*[,;\/]\s*|\s+y\s+/).filter(Boolean).forEach(parte => {
    const r = parte.split(/\s*(?:-|\sa\s|\sal\s)\s*/);
    if (r.length === 2) { const a = cod(r[0]), b = cod(r[1]); if (a < 0 || b < 0) { error = true; return; } for (let d = a, i = 0; i < 7; i++, d = (d + 1) % 7) { out[d] = 1; if (d === b) break; } }
    else { const a = cod(parte); if (a < 0) error = true; else out[a] = 1; }
  });
  const lista = Object.keys(out).map(Number);
  return error || !lista.length ? { lista: null, error: true } : { lista: lista };
}
/** Sucursales leídas de la hoja, con lo que les falta para validar el fichaje. */
function sucursales_() {
  if (MEMO_.__suc) return MEMO_.__suc;
  const sh = hojaSucursales_(), n = sh.getLastRow() - 1, cfg = cfg_();
  const filas = n > 0 ? sh.getRange(2, 1, n, SUC_HEAD.length).getValues() : [];
  const out = [];
  filas.forEach((r, i) => {
    const nombre = txt_(r[0], 40); if (!nombre) return;
    const lat = num_(r[2]), lng = num_(r[3]), radio = num_(r[4]), dias = parseDias_(r[5]);
    const faltan = [], avisos = [];
    if (lat == null || isNaN(lat) || Math.abs(lat) > 90) faltan.push('latitud');
    if (lng == null || isNaN(lng) || Math.abs(lng) > 180) faltan.push('longitud');
    if (radio == null || isNaN(radio) || radio < 10 || radio > 2000) faltan.push('radio (entre 10 y 2000 m)');
    if (dias.error) avisos.push('Días de apertura no reconocidos ("' + txt_(r[5], 40) + '"): se usan los generales (' + diasTxt_(cfg.diasOperativos) + ').');
    else if (!dias.lista) avisos.push('Sin días de apertura cargados: se usan los generales (' + diasTxt_(cfg.diasOperativos) + ').');
    if (out.some(x => normSuc_(x.nombre) === normSuc_(nombre))) avisos.push('Nombre repetido en la hoja: se usa la primera fila.');
    out.push({ fila: i + 2, nombre: nombre, direccion: txt_(r[1], 120), lat: faltan.indexOf('latitud') < 0 ? lat : null, lng: faltan.indexOf('longitud') < 0 ? lng : null,
      radio: faltan.some(f => /^radio/.test(f)) ? null : Math.round(radio), dias: dias.lista || cfg.diasOperativos, diasPropios: !!dias.lista, diasTxt: diasTxt_(dias.lista || cfg.diasOperativos),
      activa: !/^(no|n|false|0|inactiva)$/i.test(String(r[6] == null ? '' : r[6]).trim()), incompleta: faltan, avisos: avisos });
  });
  return (MEMO_.__suc = out);
}
/** Sucursal de una persona (los usuarios anteriores a 3.4 son de Palermo). */
function sucursalDe_(u) {
  const nombre = (u && u.sucursal) || 'Palermo';
  const s = sucursales_().find(x => normSuc_(x.nombre) === normSuc_(nombre));
  if (!s) return { nombre: nombre, noExiste: true, incompleta: ['la sucursal no está en la hoja Sucursales'], avisos: [], dias: cfg_().diasOperativos };
  if (!s.activa) return Object.assign({}, s, { incompleta: s.incompleta.concat(['la sucursal está marcada como inactiva']) });
  return s;
}
const sucDe_ = u => (u && u.sucursal) || 'Palermo';
function listarSucursales(token) {
  const s = sesion_(token);
  if (!['ingresos', 'personal', 'config'].some(p => s.perms.indexOf(p) >= 0)) throw new Error('PERM');
  const us = usuarios_().filter(u => u.estado === 'activo');
  return sucursales_().map(x => Object.assign({}, x, { personas: us.filter(u => normSuc_(sucDe_(u)) === normSuc_(x.nombre)).length }));
}
/** Alta o edición de una sucursal desde la app (jefes, con PIN reciente). La hoja se puede seguir editando a mano. */
function guardarSucursal(token, d) {
  const s = sesion_(token, 'ingresos', true);
  d = d || {};
  return lock_(() => {
    MEMO_ = {};
    const sh = hojaSucursales_(), L = sucursales_();
    const nombre = txt_(d.nombre, 40), lat = num_(d.lat), lng = num_(d.lng), radio = num_(d.radio);
    if (!nombre) throw new Error('Falta el nombre de la sucursal.');
    if (lat == null || isNaN(lat) || Math.abs(lat) > 90 || lng == null || isNaN(lng) || Math.abs(lng) > 180) throw new Error('Latitud y longitud tienen que ser números válidos (ej.: -34.6210674 y -58.3817634).');
    if (radio == null || isNaN(radio) || radio < 10 || radio > 2000) throw new Error('El radio tiene que estar entre 10 y 2000 metros.');
    const dias = parseDias_(d.dias);
    if (dias.error) throw new Error('No reconozco los días de apertura. Escribilos así: «mié, jue, vie, sáb» o «lun a sáb».');
    const previo = d.fila ? L.find(x => x.fila === Number(d.fila)) : null;
    if (d.fila && !previo) throw new Error('La sucursal ya no está en esa fila de la hoja. Actualizá la lista.');
    if (L.some(x => normSuc_(x.nombre) === normSuc_(nombre) && (!previo || x.fila !== previo.fila))) throw new Error('Ya existe una sucursal con ese nombre.');
    if (previo && normSuc_(previo.nombre) !== normSuc_(nombre) && usuarios_().some(u => u.estado === 'activo' && normSuc_(sucDe_(u)) === normSuc_(previo.nombre)))
      throw new Error('No se puede renombrar: hay personal asignado a «' + previo.nombre + '». Reasignalo primero.');
    const fila = [celda_(nombre), celda_(txt_(d.direccion, 120)), Math.round(lat * 1e7) / 1e7, Math.round(lng * 1e7) / 1e7, Math.round(radio),
      dias.lista ? diasTxt_(dias.lista) : '', d.activa === false ? 'No' : 'Sí', Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm')];
    if (previo) sh.getRange(previo.fila, 1, 1, fila.length).setValues([fila]); else sh.appendRow(fila);
    MEMO_ = {};
    log_(s, previo ? 'edicion_sucursal' : 'alta_sucursal', 'ok', nombre,
      (previo ? [previo.nombre, previo.lat, previo.lng, previo.radio, previo.diasTxt, previo.activa ? 'activa' : 'inactiva'].join(' / ') + ' → ' : '') + [nombre, fila[2], fila[3], fila[4], fila[5] || 'días generales', fila[6]].join(' / '));
    return listarSucursales(token);
  });
}

/* =================== 3.4 · Fichaje (entrada y salida, varios pares por día) =================== */
const tipoDe_ = x => x.tipo === 'salida' ? 'salida' : 'entrada';   // registros previos a v3.1 = entrada
const vivo_ = x => x.estado !== 'anulado';
const horaEf_ = x => String(x.horaCorregida || x.hora || '').slice(0, 8);
const minDe_ = h => { const p = String(h || '').split(':').map(Number); return p[0] * 60 + (p[1] || 0) + (p[2] || 0) / 60; };
const ordenEv_ = (a, b) => (a.fecha + ' ' + horaEf_(a)).localeCompare(b.fecha + ' ' + horaEf_(b)) || String(a.creado || '').localeCompare(String(b.creado || ''));
/** Pares entrada→salida de una persona en un día. Un día con entrada sin salida (o con la secuencia rota) es "incompleto" y no se suma. */
function pares_(recs, fecha, hoy) {
  const L = recs.slice().sort(ordenEv_), pares = [];
  let abierta = null, incoherente = false, min = 0;
  L.forEach(x => {
    const h = horaEf_(x).slice(0, 5);
    if (tipoDe_(x) === 'entrada') { if (abierta) { incoherente = true; pares.push({ entrada: abierta, salida: null }); } abierta = h; }
    else if (!abierta) { incoherente = true; pares.push({ entrada: null, salida: h }); }
    else { const m = Math.round(minDe_(h) - minDe_(abierta)); if (m < 0) incoherente = true; else min += m; pares.push({ entrada: abierta, salida: h, minutos: Math.max(0, m) }); abierta = null; }
  });
  const enCurso = !!abierta && fecha === hoy && !incoherente;
  if (abierta) pares.push({ entrada: abierta, salida: null, enCurso: enCurso });
  return { pares: pares, minutos: min, incoherente: incoherente, abierta: abierta, enCurso: enCurso, incompleto: incoherente || (!!abierta && fecha < hoy) };
}
/** Eventos de la persona: fichajes vigentes + fichajes manuales pendientes (cuentan para la secuencia mientras se resuelven). */
function eventos_(uid) {
  const ing = tAll_('Ingresos').filter(x => x.uid === uid && vivo_(x));
  const man = tAll_('Correcciones').filter(c => c.uid === uid && c.clase === 'manual' && c.estado === 'pendiente')
    .map(c => ({ id: c.id, tipo: c.tipo, fecha: c.fecha, hora: c.horaSolicitada || c.horaPropuesta, creado: c.creado, ts: c.creado, pendiente: true }));
  return ing.concat(man).sort(ordenEv_);
}
/** Entrada abierta del último día anterior con actividad (sin salida y sin una corrección de salida pendiente). */
function abiertaAnterior_(uid, ev, hoy) {
  const ant = ev.filter(x => x.fecha < hoy);
  if (!ant.length) return null;
  const f = ant[ant.length - 1].fecha, P = pares_(ant.filter(x => x.fecha === f), f, hoy);
  if (!P.abierta) return null;
  const pedida = tAll_('Correcciones').some(c => c.uid === uid && c.fecha === f && (c.tipo || 'entrada') === 'salida' && c.estado === 'pendiente');
  return pedida ? null : { fecha: f, hora: P.abierta };
}
/** Reglas de secuencia: sin dos entradas seguidas, sin salida sin entrada, sin entrada abierta de otro día, sin doble toque. */
function secuencia_(u, tipo, hoy, ahora) {
  const ev = eventos_(u.id), ab = abiertaAnterior_(u.id, ev, hoy);
  if (ab) throw new Error('ABIERTA:' + ab.fecha + ':' + ab.hora);
  const delDia = ev.filter(x => x.fecha === hoy), ult = delDia[delDia.length - 1] || null;
  const dup = () => { if (ahora) { contar_('dup_' + hoy.slice(0, 7)); try { log_({ user: u }, tipo + '_duplicada_bloqueada', 'alerta', ult.id, 'Intento a las ' + hora_(ahora)); } catch (e) {} } return new Error('DUP:' + tipo + ':' + horaEf_(ult)); };
  if (tipo === 'entrada' && ult && tipoDe_(ult) === 'entrada') throw dup();
  if (tipo === 'salida' && ult && tipoDe_(ult) === 'salida') throw dup();
  if (tipo === 'salida' && !ult) throw new Error('Primero tenés que fichar la entrada de hoy. Si te olvidaste, pedí una corrección.');
  if (ult && ahora && ahora.getTime() - new Date(ult.ts || ult.creado).getTime() < 20000) throw new Error('RAPIDO:Ya registramos tu ' + tipoDe_(ult) + ' hace unos segundos. Esperá un momento antes de volver a tocar.');
  return { ult: ult, delDia: delDia };
}
/** Validación de ubicación SIEMPRE en el servidor (Haversine contra la sucursal de la persona). */
function validarGeo_(geo, suc, cfg) {
  const out = { ok: false, motivo: '', distancia: null, precision: null, radio: suc.radio || null, sucursal: suc.nombre, g: null };
  if (suc.incompleta && suc.incompleta.length) { out.motivo = 'sucursal_incompleta'; out.faltan = suc.incompleta; return out; }
  if (!geo || typeof geo !== 'object' || geo.lat == null || geo.lng == null || !isFinite(geo.lat) || !isFinite(geo.lng) || Math.abs(geo.lat) > 90 || Math.abs(geo.lng) > 180) {
    out.motivo = geo && ['sin_permiso', 'no_disponible', 'tiempo_agotado'].indexOf(geo.error) >= 0 ? geo.error : 'no_disponible'; return out;
  }
  const g = { lat: Math.round(Number(geo.lat) * 1e7) / 1e7, lng: Math.round(Number(geo.lng) * 1e7) / 1e7, acc: geo.acc == null || !isFinite(geo.acc) ? null : Math.min(99999, Math.round(Number(geo.acc))) };
  out.g = g; out.precision = g.acc;
  out.distancia = distancia_({ lat: suc.lat, lng: suc.lng }, g);
  const pMax = Number(cfg.precisionMax) || 100;
  if (g.acc == null || g.acc > pMax) { out.motivo = 'precision'; out.precisionMax = pMax; return out; }
  if (out.distancia > suc.radio) { out.motivo = 'fuera'; return out; }
  out.ok = true;
  // Precisión baja (pero aceptable) o un valor sospechoso (0 m): se registra y queda para revisar. La ubicación del celular puede alterarse.
  out.precisionBaja = g.acc > (Number(cfg.precisionRevisar) || 50) || g.acc <= 0;
  return out;
}
function errGeo_(v) {
  return new Error('GEO:' + JSON.stringify({ motivo: v.motivo, distancia: v.distancia, precision: v.precision, radio: v.radio, sucursal: v.sucursal, faltan: v.faltan || null, precisionMax: v.precisionMax || null }));
}
/** Chequeo previo (antes de abrir la cámara): ¿con esta ubicación se puede fichar? No guarda la ubicación. */
function verificarUbicacion(token, tipo, geo) {
  const s = sesion_(token), u = s.user, cfg = cfg_();
  if (!u.registraIngreso) throw new Error('Tu usuario no está habilitado para fichar. Consultá con un responsable.');
  secuencia_(u, tipo === 'salida' ? 'salida' : 'entrada', hoy_(), null);
  const v = validarGeo_(geo, sucursalDe_(u), cfg);
  return { ok: v.ok, motivo: v.motivo, distancia: v.distancia, precision: v.precision, radio: v.radio, sucursal: v.sucursal, faltan: v.faltan || null, precisionMax: v.precisionMax || null };
}
function registrarIngreso(token, foto, geo) { return registrarFichada(token, 'entrada', foto, geo); }
function registrarFichada(token, tipo, foto, geo) {
  const s = sesion_(token);
  const u = s.user, cfg = cfg_();
  tipo = tipo === 'salida' ? 'salida' : 'entrada';
  if (!u.registraIngreso) throw new Error('Tu usuario no está habilitado para fichar. Consultá con un responsable.');
  const suc = sucursalDe_(u), v = validarGeo_(geo, suc, cfg);
  if (!v.ok && (cfg.ubicacionObligatoria !== false || v.motivo === 'sucursal_incompleta')) {
    try { log_(s, 'fichada_rechazada_ubicacion', 'rechazada', suc.nombre, tipo + ' · ' + v.motivo + (v.distancia != null ? ' · a ' + v.distancia + ' m' : '') + (v.precision != null ? ' · ±' + v.precision + ' m' : '')); } catch (e) {}
    throw errGeo_(v);
  }
  const f = foto ? dataUrlFoto_(foto) : null;
  if (cfg.fotoIngresoObligatoria && !f) throw new Error('Falta la foto o el archivo no es una imagen válida. Tomá la foto de nuevo.');
  return lock_(() => {
    const ahora = new Date(), fecha = hoy_();
    const sq = secuencia_(u, tipo, fecha, ahora);
    if (sq.ult == null && tipo === 'salida') throw new Error('Primero tenés que fichar la entrada de hoy.');
    let fotoId = null;
    if (f) fotoId = fotosIng_().createFile(Utilities.newBlob(f.bytes, f.tipo, fecha + '_' + u.legajo + '_' + tipo + '_' + hora_(ahora).replace(/:/g, '') + '.' + f.ext)).getId();
    const g = v.g;
    const estadoIng = v.ok ? (v.precisionBaja ? 'revisar' : 'valido') : 'revisar';
    const rec = { id: nuevoId_(tipo === 'salida' ? 'O' : 'I'), tipo: tipo, uid: u.id, legajo: u.legajo, nombre: u.nombre, sucursal: suc.nombre, fecha: fecha, hora: hora_(ahora), ts: ahora.toISOString(),
      estado: estadoIng, geoResultado: v.ok ? 'dentro' : (v.motivo || 'no_disponible'), geo: g, latitud: g ? g.lat : '', longitud: g ? g.lng : '', precision: g ? g.acc : '', distancia: v.distancia,
      precisionBaja: !!v.precisionBaja, modo: 'automatico', foto: fotoId, tieneFoto: !!fotoId, creado: ahora.toISOString(), dispositivo: txt_((geo && geo.ua) || '', 120) };
    if (tipo === 'salida') { const e = sq.ult; rec.entradaId = e.id; rec.minutos = e.pendiente ? null : minutosEntre_(horaEf_(e), rec.hora); }
    try { tAdd_('Ingresos', rec); }
    catch (e) { if (fotoId) try { DriveApp.getFileById(fotoId).setTrashed(true); } catch (x) {} throw e; }
    log_(s, 'registro_' + tipo, estadoIng, rec.id, rec.fecha + ' ' + rec.hora + ' · ' + suc.nombre + ' · a ' + v.distancia + ' m (±' + (g ? g.acc : '?') + ' m)' + (v.precisionBaja ? ' · precisión baja: revisar' : '') + (rec.minutos != null ? ' · ' + rec.minutos + ' min' : ''));
    const P = pares_(tAll_('Ingresos').filter(x => x.uid === u.id && x.fecha === fecha && vivo_(x)), fecha, fecha);
    return { id: rec.id, tipo: tipo, fecha: rec.fecha, hora: rec.hora, estado: rec.estado, geoResultado: rec.geoResultado, distancia: v.distancia, precision: g ? g.acc : null,
      precisionBaja: !!v.precisionBaja, sucursal: suc.nombre, minutos: rec.minutos == null ? null : rec.minutos, minutosHoy: P.minutos, fotoGuardada: !!fotoId };
  });
}
/** Fichaje manual: cuando la ubicación no valida. Queda pendiente con la hora del servidor; un jefe lo aprueba o rechaza. */
function solicitarFichajeManual(token, tipo, motivo, geo) {
  const s = sesion_(token), u = s.user, cfg = cfg_();
  tipo = tipo === 'salida' ? 'salida' : 'entrada';
  motivo = txt_(motivo, 300);
  if (!u.registraIngreso) throw new Error('Tu usuario no está habilitado para fichar. Consultá con un responsable.');
  if (motivo.length < 5) throw new Error('Contá brevemente el motivo (por ejemplo: «el GPS marca lejos, estoy en el local»).');
  const suc = sucursalDe_(u), v = validarGeo_(geo, suc, cfg);
  return lock_(() => {
    const ahora = new Date(), fecha = hoy_();
    secuencia_(u, tipo, fecha, null);
    const g = v.g;
    const c = { id: nuevoId_('M'), clase: 'manual', tipo: tipo, uid: u.id, legajo: u.legajo, nombre: u.nombre, sucursal: suc.nombre, ingresoId: '', horaOriginal: '',
      fecha: fecha, horaPropuesta: hora_(ahora).slice(0, 5), horaSolicitada: hora_(ahora), motivo: motivo, estado: 'pendiente', creado: ahora.toISOString(),
      geoMotivo: v.ok ? 'dentro' : v.motivo, geo: g, distancia: v.distancia, precision: g ? g.acc : null };
    tAdd_('Correcciones', c);
    log_(s, 'solicitud_fichaje_manual', 'pendiente', c.id, tipo + ' ' + fecha + ' ' + c.horaSolicitada + ' · ' + suc.nombre + ' · ' + c.geoMotivo + (v.distancia != null ? ' · a ' + v.distancia + ' m' : ''));
    return { id: c.id, tipo: tipo, fecha: fecha, hora: c.horaSolicitada, sucursal: suc.nombre };
  });
}
function minutosEntre_(h1, h2) {
  if (!h1 || !h2) return null;
  const d = Math.round(minDe_(h2) - minDe_(h1));
  return d >= 0 ? d : null;
}
/** Estado de hoy del propio empleado: qué fichó y qué le toca. Solo sus datos (sin coordenadas). */
function miJornada(token) { return jornadaDe_(sesion_(token).user); }
function jornadaDe_(u) {
  const hoy = hoy_(), cfg = cfg_(), ev = eventos_(u.id), delDia = ev.filter(x => x.fecha === hoy);
  const vivos = delDia.filter(x => !x.pendiente), P = pares_(vivos, hoy, hoy), ult = delDia[delDia.length - 1] || null;
  const ab = abiertaAnterior_(u.id, ev, hoy), suc = sucursalDe_(u);
  const nov = tAll_('Vacaciones').filter(v => v.uid === u.id && (v.estado === 'aprobada' || v.estado === 'rechazada') && !v.visto).length;
  const e = vivos.filter(x => tipoDe_(x) === 'entrada')[0], o = vivos.filter(x => tipoDe_(x) === 'salida').slice(-1)[0];
  const texto = !ult ? 'Sin fichar' : (tipoDe_(ult) === 'entrada' ? 'Entrada registrada a las ' : 'Salida registrada a las ') + horaEf_(ult).slice(0, 5) + (ult.pendiente ? ' (manual, pendiente de aprobación)' : '');
  return { fecha: hoy, nombre: u.nombre, habilitado: !!u.registraIngreso, aviso: cfg.avisoFotos, avisoUbicacion: cfg.avisoUbicacion, fotoObligatoria: !!cfg.fotoIngresoObligatoria,
    sucursal: { nombre: suc.nombre, incompleta: suc.incompleta || [], direccion: suc.direccion || '' },
    estado: { texto: texto, tipo: ult ? tipoDe_(ult) : null, hora: ult ? horaEf_(ult).slice(0, 5) : null, pendiente: !!(ult && ult.pendiente) },
    pares: P.pares, minutosHoy: P.minutos, abiertaAnterior: ab,
    siguiente: ab ? null : (ult && tipoDe_(ult) === 'entrada' ? 'salida' : 'entrada'),
    manualesPendientes: delDia.filter(x => x.pendiente).map(x => ({ tipo: x.tipo, hora: String(x.hora).slice(0, 5) })),
    entrada: e ? { hora: horaEf_(e).slice(0, 5), estado: e.estado } : null, salida: o ? { hora: horaEf_(o).slice(0, 5), estado: o.estado, minutos: P.minutos } : null,
    vacacionesNovedades: nov };
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
/** Últimos registros del propio empleado: sin latitud, longitud ni distancia (la ubicación solo la ven los jefes). */
function misIngresos(token) {
  const s = sesion_(token);
  const corr = tAll_('Correcciones').filter(c => c.uid === s.user.id);
  const ing = tAll_('Ingresos').filter(x => x.uid === s.user.id).slice(-40).reverse().map(x => ({
    id: x.id, tipo: tipoDe_(x), fecha: x.fecha, hora: x.hora, horaCorregida: x.horaCorregida || '', estado: x.estado, modo: x.modo || (x.origen === 'correccion' ? 'correccion' : 'automatico'),
    correccion: (corr.find(c => c.ingresoId === x.id) || {}).estado || '' }));
  return ing;
}
/** Solicitudes propias (fichajes manuales y correcciones): pendientes y las últimas resueltas, con el motivo del jefe si rechazó. */
function misSolicitudes(token) {
  const s = sesion_(token);
  return tAll_('Correcciones').filter(c => c.uid === s.user.id).slice(-20).reverse().map(c => ({ id: c.id, clase: c.clase || 'correccion', tipo: c.tipo || 'entrada', fecha: c.fecha,
    hora: String(c.horaSolicitada || c.horaPropuesta || '').slice(0, 5), motivo: c.motivo, estado: c.estado, comentario: c.estado === 'rechazada' ? (c.comentario || '') : '', resuelto: c.resuelto || '' }));
}
function solicitarCorreccion(token, d) {
  const s = sesion_(token);
  d = d || {};
  const fecha = fechaOk_(d.fecha), hp = horaOk_(d.horaPropuesta), motivo = txt_(d.motivo, 300), tipo = d.tipo === 'salida' ? 'salida' : 'entrada';
  if (!fecha || !hp || !motivo) throw new Error('Completá fecha, hora y motivo.');
  if (fecha > hoy_()) throw new Error('No se pueden pedir correcciones de días futuros.');
  if (fecha === hoy_() && hp > hora_().slice(0, 5)) throw new Error('La hora no puede ser posterior a la hora actual.');
  return lock_(() => {
    let ing = null;
    if (d.ingresoId) { ing = tAll_('Ingresos').find(x => x.id === d.ingresoId); if (!ing || ing.uid !== s.user.id) throw new Error('Registro no encontrado.'); }
    const t = ing ? tipoDe_(ing) : tipo;
    if (tAll_('Correcciones').some(c => c.uid === s.user.id && c.fecha === fecha && (c.tipo || 'entrada') === t && c.estado === 'pendiente' && c.clase !== 'manual')) throw new Error('Ya tenés una solicitud pendiente para esa ' + t + '.');
    const c = { id: nuevoId_('C'), clase: 'correccion', tipo: t, uid: s.user.id, legajo: s.user.legajo, nombre: s.user.nombre, sucursal: sucDe_(s.user), ingresoId: ing ? ing.id : '', horaOriginal: ing ? ing.hora : '',
      fecha: fecha, horaPropuesta: hp, motivo: motivo, estado: 'pendiente', creado: new Date().toISOString() };
    tAdd_('Correcciones', c);
    log_(s, 'solicitud_correccion', 'pendiente', c.id, t + ' ' + fecha + ' → ' + hp + (ing ? ' (registro ' + ing.hora + ')' : ' (sin registro)'));
    return { id: c.id };
  });
}

/* =================== 3.4 · Correcciones de jefes (siempre con motivo; se conserva el valor original) =================== */
function corregirFichaje(token, id, hora, motivo) {
  const s = sesion_(token, 'ingresos', true);
  hora = horaOk_(hora); motivo = txt_(motivo, 300);
  if (!hora) throw new Error('Hora inválida (formato HH:MM).');
  if (motivo.length < 5) throw new Error('Escribí el motivo de la corrección: queda registrado.');
  return lock_(() => {
    const r = tAll_('Ingresos').find(x => x.id === String(id || '')); if (!r) throw new Error('Registro no encontrado.');
    if (!vivo_(r)) throw new Error('El registro está anulado.');
    if (r.uid === s.user.id) throw new Error('No podés corregir tus propios fichajes: lo tiene que hacer otro jefe.');
    if (r.fecha === hoy_() && hora > hora_().slice(0, 5)) throw new Error('La hora no puede ser posterior a la hora actual.');
    const antes = horaEf_(r);
    r.correcciones = (r.correcciones || []).concat([{ de: antes, a: hora, motivo: motivo, por: s.user.nombre + ' (' + s.user.legajo + ')', ts: new Date().toISOString() }]);
    r.horaCorregida = hora; if (r.estado !== 'corregido') r.estadoAnterior = r.estado; r.estado = 'corregido';
    r.revisadoPor = s.user.nombre; r.revisado = new Date().toISOString();
    if (tipoDe_(r) === 'salida' && r.entradaId) { const e = tAll_('Ingresos').find(x => x.id === r.entradaId); if (e) r.minutos = minutosEntre_(horaEf_(e), hora); }
    tUpd_('Ingresos', 'id', r.id, r);
    log_(s, 'correccion_fichaje_jefe', 'corregido', r.id, r.nombre + ' · ' + tipoDe_(r) + ' ' + r.fecha + ' ' + (r.hora || 'sin registro') + (antes !== r.hora ? ' (vigente ' + antes + ')' : '') + ' → ' + hora + ' · motivo: ' + motivo);
    return true;
  });
}
/** Carga de un fichaje faltante por un jefe (por ejemplo, la salida de una entrada que quedó abierta). */
function cargarFichajeJefe(token, uid, fecha, tipo, hora, motivo) {
  const s = sesion_(token, 'ingresos', true);
  fecha = fechaOk_(fecha); hora = horaOk_(hora); motivo = txt_(motivo, 300); tipo = tipo === 'salida' ? 'salida' : 'entrada';
  if (!fecha || !hora) throw new Error('Completá fecha y hora.');
  if (motivo.length < 5) throw new Error('Escribí el motivo: queda registrado.');
  if (fecha > hoy_() || (fecha === hoy_() && hora > hora_().slice(0, 5))) throw new Error('No se pueden cargar fichajes en el futuro.');
  return lock_(() => {
    const u = usuarios_().find(x => x.id === uid); if (!u) throw new Error('Empleado no encontrado.');
    if (u.id === s.user.id) throw new Error('No podés cargar tus propios fichajes: lo tiene que hacer otro jefe.');
    const ahora = new Date().toISOString();
    const rec = { id: nuevoId_(tipo === 'salida' ? 'O' : 'I'), tipo: tipo, uid: u.id, legajo: u.legajo, nombre: u.nombre, sucursal: sucDe_(u), fecha: fecha, hora: '', horaCorregida: hora,
      estado: 'corregido', origen: 'jefe', modo: 'manual', geoResultado: 'no_aplica', tieneFoto: false, creado: ahora,
      correcciones: [{ de: '', a: hora, motivo: motivo, por: s.user.nombre + ' (' + s.user.legajo + ')', ts: ahora }], revisadoPor: s.user.nombre, revisado: ahora };
    tAdd_('Ingresos', rec);
    log_(s, 'carga_fichaje_jefe', 'corregido', rec.id, u.nombre + ' · ' + tipo + ' ' + fecha + ' ' + hora + ' · motivo: ' + motivo);
    return { id: rec.id };
  });
}

/* =================== 3.4 · Horas trabajadas =================== */
/** ¿Es feriado para esta sucursal? Los nacionales valen para todas; las excepciones manuales del calendario son de Palermo. */
function feriadoSuc_(cal, suc, d) {
  const f = cal.feriado(d); if (!f) return null;
  if (f.origen === 'manual' && normSuc_(suc) !== 'palermo') return null;
  return f;
}
const redondear_ = (m, r) => r > 1 ? Math.round(m / r) * r : m;
/** Resumen de horas por empleado: por día, semana y mes, con total, promedio y diferencia con lo esperado (informativo). */
function horas_(opts) {
  const cfg = cfg_(), cal = calendario_(cfg), vac = deVacaciones_(), hoy = hoy_(), red = Number(cfg.redondeoMin) || 1;
  let hasta = fechaOk_(opts.hasta) || hoy, desde = fechaOk_(opts.desde) || (hoy.slice(0, 8) + '01');
  if (desde > hasta) { const t = desde; desde = hasta; hasta = t; }
  if (hasta > hoy) hasta = hoy;
  if (sumarDias_(desde, 400) < hasta) desde = sumarDias_(hasta, -400);
  const sucs = sucursales_();
  let users = usuarios_().filter(u => opts.uids ? opts.uids.indexOf(u.id) >= 0 : (u.registraIngreso && (u.estado === 'activo' || (u.fechaBaja && u.fechaBaja >= desde))));
  if (opts.sucursal) users = users.filter(u => normSuc_(sucDe_(u)) === normSuc_(opts.sucursal));
  const ing = tAll_('Ingresos').filter(x => x.fecha >= desde && x.fecha <= hasta && vivo_(x));
  const empleados = users.map(u => {
    const suc = sucs.find(x => normSuc_(x.nombre) === normSuc_(sucDe_(u))), ops = suc ? suc.dias : cfg.diasOperativos;
    const mios = ing.filter(x => x.uid === u.id), dias = [], he = u.horasEsperadas || null;
    let d = u.fechaIngreso && u.fechaIngreso > desde ? u.fechaIngreso : desde;
    const fin = u.estado !== 'activo' && u.fechaBaja && u.fechaBaja < hasta ? u.fechaBaja : hasta;
    for (let i = 0; d <= fin && i < 402; i++, d = sumarDias_(d, 1)) {
      const recs = mios.filter(x => x.fecha === d), fer = feriadoSuc_(cal, sucDe_(u), d), enVac = vac(u.id, d), abre = ops.indexOf(dow_(d)) >= 0;
      const base = { fecha: d, dia: DIAS_CORTOS[dow_(d)], semana: lunes_(d), feriado: fer ? fer.nombre : '', vacaciones: enVac, abre: abre };
      if (recs.length) {
        const P = pares_(recs, d, hoy);
        const revisar = recs.some(x => x.estado === 'revisar'), manual = recs.some(x => x.modo === 'manual'), corregido = recs.some(x => x.estado === 'corregido');
        dias.push(Object.assign(base, { estado: P.incompleto ? 'incompleto' : P.enCurso ? 'en_curso' : 'trabajado', pares: P.pares,
          minutos: P.incompleto || P.enCurso ? null : redondear_(P.minutos, red), minutosParciales: P.minutos, revisar: revisar, manual: manual, corregido: corregido }));
      } else if (enVac) dias.push(Object.assign(base, { estado: 'vacaciones', minutos: null }));
      else if (fer) dias.push(Object.assign(base, { estado: 'feriado', minutos: null }));
      else if (abre && d < hoy) dias.push(Object.assign(base, { estado: 'sin_fichaje', minutos: null }));
    }
    // Esperado (informativo): por día de apertura (sin vacaciones ni feriados) o por semana, prorrateado por los días de apertura del rango.
    const diasEsperables = [];
    for (let k = 0, f = u.fechaIngreso && u.fechaIngreso > desde ? u.fechaIngreso : desde; f <= fin && k < 402; k++, f = sumarDias_(f, 1)) {
      if (ops.indexOf(dow_(f)) >= 0 && (f < hoy || dias.some(y => y.fecha === f && y.estado === 'trabajado')) && !vac(u.id, f) && !feriadoSuc_(cal, sucDe_(u), f)) diasEsperables.push(f);
    }
    const espSem = {};
    if (he && he.horas > 0 && he.tipo === 'semana') {
      const porSem = {}; diasEsperables.forEach(f => { const w = lunes_(f); porSem[w] = (porSem[w] || 0) + 1; });
      Object.keys(porSem).forEach(w => { espSem[w] = Math.round(he.horas * 60 * porSem[w] / Math.max(1, ops.length)); });
    } else if (he && he.horas > 0) diasEsperables.forEach(f => { const w = lunes_(f); espSem[w] = (espSem[w] || 0) + Math.round(he.horas * 60); });
    const trab = dias.filter(x => x.estado === 'trabajado'), total = trab.reduce((a, x) => a + x.minutos, 0);
    const semanas = {}, meses = {};
    dias.forEach(x => {
      const w = semanas[x.semana] = semanas[x.semana] || { semana: x.semana, minutos: 0, dias: 0, esperado: null };
      const m = meses[x.fecha.slice(0, 7)] = meses[x.fecha.slice(0, 7)] || { mes: x.fecha.slice(0, 7), minutos: 0, dias: 0, esperado: null };
      if (x.estado === 'trabajado') { w.minutos += x.minutos; w.dias++; m.minutos += x.minutos; m.dias++; }
    });
    Object.keys(espSem).forEach(w => { (semanas[w] = semanas[w] || { semana: w, minutos: 0, dias: 0, esperado: null }).esperado = espSem[w]; });
    if (he && he.horas > 0) {
      Object.keys(meses).forEach(k => { meses[k].esperado = 0; });
      diasEsperables.forEach(f => { const k = f.slice(0, 7); meses[k] = meses[k] || { mes: k, minutos: 0, dias: 0, esperado: 0 }; meses[k].esperado = (meses[k].esperado || 0) + (he.tipo === 'semana' ? Math.round(he.horas * 60 / Math.max(1, ops.length)) : Math.round(he.horas * 60)); });
    }
    const esperado = he && he.horas > 0 ? Object.keys(espSem).reduce((a, w) => a + espSem[w], 0) : null;
    const cuenta = e => dias.filter(x => x.estado === e).length;
    return { uid: u.id, nombre: u.nombre, legajo: u.legajo, sucursal: sucDe_(u), activo: u.estado === 'activo', horasEsperadas: he,
      dias: dias.sort((a, b) => a.fecha.localeCompare(b.fecha)),
      semanas: Object.keys(semanas).sort().map(k => semanas[k]), meses: Object.keys(meses).sort().map(k => meses[k]),
      total: total, diasTrabajados: trab.length, promedio: trab.length ? Math.round(total / trab.length) : null,
      esperado: esperado, diferencia: esperado == null ? null : total - esperado,
      incompletos: cuenta('incompleto'), sinFichaje: cuenta('sin_fichaje'), vacaciones: cuenta('vacaciones'), feriados: cuenta('feriado'), revisar: dias.filter(x => x.revisar).length };
  }).sort((a, b) => (a.sucursal + a.nombre).localeCompare(b.sucursal + b.nombre));
  return { desde: desde, hasta: hasta, redondeo: red, sucursales: sucs.map(x => x.nombre), empleados: empleados,
    incompletos: [].concat.apply([], empleados.map(e => e.dias.filter(x => x.estado === 'incompleto').map(x => ({ uid: e.uid, nombre: e.nombre, sucursal: e.sucursal, fecha: x.fecha, pares: x.pares })))) };
}
/** Horas: cada empleado ve solo las suyas; los jefes (permiso de ingresos) ven todas y filtran por sucursal, empleado y fechas. */
function resumenHoras(token, f) {
  const s = sesion_(token); f = f || {};
  const jefe = s.perms.indexOf('ingresos') >= 0;
  if (!jefe || f.propias) { const r = horas_({ desde: f.desde, hasta: f.hasta, uids: [s.user.id] }); r.empleados.forEach(e => e.dias.forEach(x => { delete x.revisar; })); return r; }
  return horas_({ desde: f.desde, hasta: f.hasta, sucursal: txt_(f.sucursal, 40) || null, uids: f.uid ? [String(f.uid)] : null });
}
/** Exporta el resumen de horas a la hoja "Horas" de la planilla (para liquidación de sueldos). Reemplaza el contenido anterior. */
function exportarHoras(token, f) {
  const s = sesion_(token, 'ingresos', true); f = f || {};
  const r = horas_({ desde: f.desde, hasta: f.hasta, sucursal: txt_(f.sucursal, 40) || null, uids: f.uid ? [String(f.uid)] : null });
  const hm = m => m == null ? '' : Math.floor(m / 60) + ':' + String(Math.abs(m) % 60).padStart(2, '0');
  const sg = m => m == null ? '' : (m < 0 ? '-' : '+') + hm(Math.abs(m));
  const EST = { trabajado: 'Trabajado', incompleto: 'Incompleto (no se suma)', en_curso: 'En curso', vacaciones: 'Vacaciones', feriado: 'Feriado', sin_fichaje: 'Sin fichaje (revisar)' };
  const filas = [['Resumen de horas · ' + fdm_(r.desde) + ' al ' + fdm_(r.hasta) + (f.sucursal ? ' · ' + f.sucursal : ''), '', '', '', '', '', '', '', '', ''],
    ['Generado por ' + s.user.nombre + ' el ' + Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm') + ' · redondeo: ' + (r.redondeo > 1 ? r.redondeo + ' min' : 'al minuto') + ' · la diferencia con lo esperado es informativa (no calcula pagos ni horas extra).', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', ''],
    ['Sucursal', 'Empleado', 'Usuario', 'Fecha', 'Día', 'Estado', 'Entradas y salidas', 'Horas (h:mm)', 'Minutos', 'Observaciones']];
  r.empleados.forEach(e => e.dias.forEach(x => filas.push([e.sucursal, e.nombre, e.legajo.toLowerCase(), fdm_(x.fecha), x.dia, EST[x.estado] || x.estado,
    (x.pares || []).map(p => (p.entrada || '¿?') + '–' + (p.salida || '¿?')).join(', '), x.minutos == null ? '' : hm(x.minutos), x.minutos == null ? '' : x.minutos,
    [x.feriado ? 'Feriado: ' + x.feriado : '', x.vacaciones && x.estado !== 'vacaciones' ? 'Con vacaciones aprobadas' : '', x.manual ? 'Incluye fichaje manual' : '', x.corregido ? 'Incluye corrección' : '', x.revisar ? 'Precisión/ubicación para revisar' : ''].filter(Boolean).join(' · ')])));
  filas.push(['', '', '', '', '', '', '', '', '', ''], ['Totales por empleado', '', '', '', '', '', '', '', '', ''],
    ['Sucursal', 'Empleado', 'Usuario', 'Días trabajados', 'Total (h:mm)', 'Total (min)', 'Promedio diario', 'Esperado (h:mm)', 'Diferencia', 'Incompletos / sin fichaje / vacaciones / feriados']);
  r.empleados.forEach(e => filas.push([e.sucursal, e.nombre, e.legajo.toLowerCase(), e.diasTrabajados, hm(e.total), e.total, hm(e.promedio), hm(e.esperado), sg(e.diferencia),
    e.incompletos + ' / ' + e.sinFichaje + ' / ' + e.vacaciones + ' / ' + e.feriados]));
  const safe = filas.map(row => row.map(v => typeof v === 'string' ? celda_(v) : v));
  lock_(() => {
    const ss = ss_(); let sh = ss.getSheetByName('Horas');
    if (!sh) sh = ss.insertSheet('Horas'); else sh.clear();
    sh.getRange(1, 1, safe.length, 10).setValues(safe);
    sh.getRange(4, 1, 1, 10).setFontWeight('bold').setFontColor('#ffffff').setBackground('#111113');
    sh.getRange(1, 1, 1, 1).setFontWeight('bold');
    sh.setFrozenRows(4);
  });
  log_(s, 'exportacion_horas', 'ok', 'Horas', r.desde + ' a ' + r.hasta + ' · ' + r.empleados.length + ' empleados' + (f.sucursal ? ' · ' + f.sucursal : ''));
  return { filas: safe.length, empleados: r.empleados.length, url: ss_().getUrl() + '#gid=' + ss_().getSheetByName('Horas').getSheetId() };
}
/** Panel de jefes: fichajes de hoy por sucursal (quién entró, quién salió, quién falta) y pendientes. */
function panelFichajesHoy(token) {
  sesion_(token, 'ingresos');
  const hoy = hoy_(), cfg = cfg_(), cal = calendario_(cfg), vac = deVacaciones_(), sucs = sucursales_();
  const ing = tAll_('Ingresos').filter(x => vivo_(x));
  const users = usuarios_().filter(u => u.estado === 'activo' && u.registraIngreso);
  const man = tAll_('Correcciones').filter(c => c.estado === 'pendiente');
  const nombres = sucs.map(x => x.nombre);
  users.forEach(u => { if (!nombres.some(n => normSuc_(n) === normSuc_(sucDe_(u)))) nombres.push(sucDe_(u)); });
  return { fecha: hoy, sucursales: nombres.map(n => {
    const suc = sucs.find(x => normSuc_(x.nombre) === normSuc_(n)) || { nombre: n, incompleta: ['la sucursal no está en la hoja Sucursales'], dias: cfg.diasOperativos, avisos: [] };
    const fer = feriadoSuc_(cal, n, hoy), abre = suc.dias.indexOf(dow_(hoy)) >= 0;
    const personas = users.filter(u => normSuc_(sucDe_(u)) === normSuc_(n)).map(u => {
      const recs = ing.filter(x => x.uid === u.id && x.fecha === hoy), P = pares_(recs, hoy, hoy);
      const ev = eventos_(u.id), ab = abiertaAnterior_(u.id, ev, hoy), pend = man.filter(c => c.uid === u.id && c.fecha === hoy);
      let estado = recs.length ? (P.abierta ? 'adentro' : P.incoherente ? 'revisar' : 'salio') : vac(u.id, hoy) ? 'vacaciones' : fer ? 'feriado' : abre ? 'falta' : 'no_abre';
      if (!recs.length && pend.length) estado = 'manual_pendiente';
      return { uid: u.id, nombre: u.nombre, legajo: u.legajo, estado: estado, pares: P.pares, minutos: P.minutos,
        ultima: recs.length ? horaEf_(recs.slice().sort(ordenEv_).slice(-1)[0]).slice(0, 5) : null, abiertaAnterior: ab, manualesPendientes: pend.length,
        revisar: recs.some(x => x.estado === 'revisar') };
    }).sort((a, b) => a.nombre.localeCompare(b.nombre));
    const c = e => personas.filter(p => p.estado === e).length;
    return { nombre: n, direccion: suc.direccion || '', incompleta: suc.incompleta || [], avisos: suc.avisos || [], abre: abre, feriado: fer ? fer.nombre : '', radio: suc.radio || null,
      personas: personas, adentro: c('adentro'), salieron: c('salio'), faltan: c('falta'), deVacaciones: c('vacaciones'), entradas: personas.filter(p => p.pares.length).length };
  }), manualesPendientes: man.filter(c => c.clase === 'manual').length, correccionesPendientes: man.filter(c => c.clase !== 'manual').length };
}

/* =================== Registro de ingresos (vista administrativa) =================== */
/** 3.3: vacaciones APROBADAS por persona y día: esos días no son falta ni fichada pendiente. Devuelve fn(uid, fecha) → true. */
function deVacaciones_() {
  const apro = tAll_('Vacaciones').filter(v => v.estado === 'aprobada');
  return (uid, fecha) => apro.some(v => v.uid === uid && v.desde <= fecha && v.hasta >= fecha);
}
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
  // La ubicación (latitud, longitud, precisión, distancia) solo llega acá: esta vista exige el permiso de jefes ("ingresos").
  const lista = ing.map(x => ({ id: x.id, tipo: tipoDe_(x), minutos: x.minutos == null ? null : x.minutos, uid: x.uid, fecha: x.fecha, legajo: x.legajo, nombre: x.nombre, hora: x.hora, horaCorregida: x.horaCorregida || '',
    estado: x.estado, geoResultado: x.geoResultado, distancia: x.distancia, latitud: x.geo ? x.geo.lat : null, longitud: x.geo ? x.geo.lng : null, precision: x.geo ? x.geo.acc : null,
    precisionBaja: !!x.precisionBaja, sucursal: x.sucursal || sucDe_(users.find(u => u.id === x.uid)), modo: x.modo || (x.origen === 'correccion' ? 'correccion' : x.origen === 'jefe' ? 'manual' : 'automatico'),
    correcciones: x.correcciones || [], tieneFoto: !!x.foto, fotoPurgada: !!x.fotoPurgada, observacion: x.observacion || '',
    revisadoPor: x.revisadoPor || '', origen: x.origen || 'app', derivado: !!x.derivado,
    usuarioInactivo: !!users.find(u => u.id === x.uid && u.estado !== 'activo') }));
  // 3.4: varios pares por día son válidos; se marca para revisar solo una secuencia rota (dos entradas seguidas, salida sin entrada).
  const hoy = hoy_(), porDia = {};
  lista.filter(x => x.estado !== 'anulado').forEach(x => { const k = x.uid + '|' + x.fecha; (porDia[k] = porDia[k] || []).push(x); });
  const listaJ = Object.keys(porDia).map(k => {
    const L = porDia[k], x0 = L[0], P = pares_(L, x0.fecha, hoy);
    L.forEach(x => { x.duplicado = P.incoherente; });
    const ent = L.filter(x => x.tipo === 'entrada').map(horaEf_).sort(), sal = L.filter(x => x.tipo === 'salida').map(horaEf_).sort();
    return { uid: x0.uid, fecha: x0.fecha, nombre: x0.nombre, legajo: x0.legajo, sucursal: x0.sucursal, entrada: ent[0] || '', salida: sal[sal.length - 1] || '',
      pares: P.pares, minutos: P.incompleto || P.enCurso ? null : P.minutos, sinSalida: !!P.abierta && x0.fecha < hoy, incompleto: P.incompleto, enCurso: P.enCurso };
  }).sort((a, b) => (b.fecha + a.nombre).localeCompare(a.fecha + b.nombre));
  // Días de apertura sin entrada (por sucursal: sus días y feriados). Las vacaciones aprobadas se listan aparte: no son falta.
  const cfg = cfg_(), cal = calendario_(cfg), vac = deVacaciones_(), sucs = sucursales_();
  const pendientes = [], deVacaciones = [];
  users.filter(u => u.estado === 'activo' && u.registraIngreso).forEach(u => {
    const suc = sucs.find(x => normSuc_(x.nombre) === normSuc_(sucDe_(u))), ops = suc ? suc.dias : cfg.diasOperativos;
    diasOperativosEntre_(desde, hasta, ops).filter(d => d <= hoy && (!u.fechaIngreso || u.fechaIngreso <= d) && !(normSuc_(sucDe_(u)) === 'palermo' && cal.cerrado(d))).forEach(d => {
      if (lista.some(x => x.uid === u.id && x.fecha === d && x.estado !== 'anulado' && x.tipo === 'entrada')) return;
      if (vac(u.id, d)) deVacaciones.push({ fecha: d, uid: u.id, legajo: u.legajo, nombre: u.nombre });
      else { const f = feriadoSuc_(cal, sucDe_(u), d); if (f && f.origen === 'api' && normSuc_(sucDe_(u)) !== 'palermo') return; pendientes.push({ fecha: d, uid: u.id, legajo: u.legajo, nombre: u.nombre, sucursal: sucDe_(u), feriado: f ? f.nombre : '' }); }
    });
  });
  pendientes.sort((a, b) => b.fecha.localeCompare(a.fecha) || a.nombre.localeCompare(b.nombre));
  return { desde: desde, hasta: hasta, lista: lista.sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora)),
    correcciones: corr.filter(c => c.estado === 'pendiente' || (c.fecha >= desde && c.fecha <= hasta)), pendientes: pendientes, deVacaciones: deVacaciones,
    jornadas: listaJ, sinSalida: listaJ.filter(j => j.sinSalida), incompletos: listaJ.filter(j => j.incompleto) };
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
    const coment = txt_(comentario, 300);
    if (!aprobar && coment.length < 3) throw new Error('Para rechazar tenés que escribir el motivo: la persona lo va a ver.');
    c.estado = aprobar ? 'aprobada' : 'rechazada'; c.resueltoPor = s.user.nombre; c.resuelto = new Date().toISOString(); c.comentario = coment;
    tUpd_('Correcciones', 'id', c.id, c);
    if (aprobar && c.clase === 'manual') {
      // 3.4 · Fichaje manual aprobado: se registra con la hora del servidor del momento en que se pidió (no la de la aprobación).
      const u = usuarios_().find(x => x.id === c.uid) || {};
      tAdd_('Ingresos', { id: nuevoId_(c.tipo === 'salida' ? 'O' : 'I'), tipo: c.tipo, uid: c.uid, legajo: c.legajo, nombre: c.nombre, sucursal: c.sucursal || sucDe_(u), fecha: c.fecha,
        hora: c.horaSolicitada || (c.horaPropuesta + ':00'), ts: c.creado, estado: 'valido', origen: 'manual', modo: 'manual', manualId: c.id, aprobadoPor: s.user.nombre,
        geoResultado: c.geoMotivo || 'no_disponible', geo: c.geo || null, latitud: c.geo ? c.geo.lat : '', longitud: c.geo ? c.geo.lng : '', precision: c.geo ? c.geo.acc : '', distancia: c.distancia,
        tieneFoto: false, creado: new Date().toISOString() });
    } else if (aprobar) {
      const ings = tAll_('Ingresos');
      const ing = c.ingresoId ? ings.find(x => x.id === c.ingresoId) : null;
      if (ing) { ing.horaCorregida = c.horaPropuesta; ing.correccionId = c.id; ing.estado = 'corregido'; tUpd_('Ingresos', 'id', ing.id, ing); }
      else tAdd_('Ingresos', { id: nuevoId_(c.tipo === 'salida' ? 'O' : 'I'), tipo: c.tipo || 'entrada', uid: c.uid, legajo: c.legajo, nombre: c.nombre, fecha: c.fecha, hora: '', horaCorregida: c.horaPropuesta,
        estado: 'corregido', origen: 'correccion', correccionId: c.id, geoResultado: 'no_aplica', tieneFoto: false, creado: new Date().toISOString() });
    }
    log_(s, c.clase === 'manual' ? 'resolucion_fichaje_manual' : 'resolucion_correccion', c.estado, c.id, (c.tipo || 'entrada') + ' · ' + c.nombre + ' ' + c.fecha + ' ' + (c.clase === 'manual' ? (c.horaSolicitada || c.horaPropuesta) + ' (manual)' : (c.horaOriginal || 'sin registro') + ' → ' + c.horaPropuesta) + (c.comentario ? ' · ' + c.comentario : ''));
    return c;
  });
}
function observarIngreso(token, id, obs, marcar) {
  const s = sesion_(token, 'ingresos');
  return lock_(() => {
    const r = tAll_('Ingresos').find(x => x.id === id); if (!r) throw new Error('Registro no encontrado.');
    r.observacion = txt_(obs, 300);
    if (['valido', 'revisar', 'anulado'].indexOf(marcar) >= 0 && marcar !== r.estado) {
      if (marcar === 'anulado') { sesion_(token, 'ingresos', true); if (txt_(obs, 300).length < 5) throw new Error('Para anular un fichaje escribí el motivo en la observación: queda registrado.'); }
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

/* =================== 3.3 · Feriados de Argentina ===================
 * Se descargan solos (año actual y siguiente) de una API pública sin clave; si una fuente falla se prueba la siguiente.
 * Se guardan en la hoja "Feriados" junto con las excepciones manuales (feriados de CABA, inventario, eventos).
 * Regla: NUNCA se asume que el local cerró en un feriado. Un día de apertura feriado sin caja queda "a confirmar";
 * un jefe marca "Estuvo cerrado" (se excluye de todos los cálculos) o "Abrió" (queda como cierre pendiente de carga).
 */
const FERIADOS_DIAS_REFRESCO = 7;
const dow_ = d => new Date(d + 'T12:00:00Z').getUTCDay();
function sumarDias_(f, n) { const d = new Date(f + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function feriados_() { return tAll_('Feriados').filter(f => fechaOk_(f.fecha)).sort((a, b) => a.fecha.localeCompare(b.fecha)); }
function feriadosSync_() { try { return JSON.parse(PROPS.getProperty('FERIADOS_SYNC') || 'null'); } catch (e) { return null; } }
/** Busca y reemplaza una fila por condición sobre el JSON (p. ej. fecha + origen). */
function tUpdWhere_(nombre, pred, o) {
  delete MEMO_[nombre];
  const filas = jsonCol_(nombre);
  for (let i = 0; i < filas.length; i++) if (filas[i] && pred(filas[i])) {
    const row = filaDe_(nombre, o);
    tabla_(nombre).getRange(i + 2, 1, 1, row.length).setValues([row]);
    return true;
  }
  return false;
}
/** Descarga los feriados del año actual y el siguiente y actualiza la hoja. Devuelve el estado (también queda en FERIADOS_SYNC). */
function feriadosActualizar_(s) {
  const anioHoy = Number(hoy_().slice(0, 4)), anios = [anioHoy, anioHoy + 1], intentos = [];
  let ok = null;
  for (let i = 0; i < FERIADOS_FUENTES.length && !ok; i++) {
    const f = FERIADOS_FUENTES[i], lista = [];
    try {
      anios.forEach(y => {
        const r = UrlFetchApp.fetch(f.url(y), { muteHttpExceptions: true, followRedirects: true, validateHttpsCertificates: true, headers: { Accept: 'application/json' } });
        const code = r.getResponseCode();
        if (code !== 200) throw new Error('HTTP ' + code + ' para ' + y);
        const items = f.parse(JSON.parse(r.getContentText()), y).filter(x => x.fecha && x.fecha.slice(0, 4) === String(y) && x.nombre);
        // Conectó pero sin datos (o muy pocos): no se borra lo guardado; se prueba la siguiente fuente.
        if (items.length < 6) throw new Error('sin datos suficientes para ' + y + ' (' + items.length + ')');
        items.forEach(x => lista.push(x));
      });
      ok = { fuente: f.id, nombre: f.nombre, lista: lista };
      intentos.push({ fuente: f.id, ok: true, n: lista.length });
    } catch (e) { intentos.push({ fuente: f.id, ok: false, error: String(e && e.message || e).slice(0, 160) }); }
  }
  const prev = feriadosSync_();
  if (!ok) {
    const st = { ts: new Date().toISOString(), ok: false, intentos: intentos, anios: anios, ultimaOk: prev ? (prev.ok ? prev.ts : prev.ultimaOk) || null : null,
      fuente: prev && prev.fuente || null, nombreFuente: prev && prev.nombreFuente || null, total: feriados_().filter(f => f.origen === 'api').length,
      error: 'No pude actualizar los feriados, usando la última lista guardada.' };
    PROPS.setProperty('FERIADOS_SYNC', JSON.stringify(st));
    log_(s, 'feriados_actualizacion', 'error', anios.join('-'), intentos.map(i => i.fuente + ': ' + (i.error || 'ok')).join(' · '));
    return st;
  }
  let nuevos = 0, total = 0;
  lock_(() => {
    const actuales = feriados_(), porFecha = {};
    actuales.filter(f => f.origen === 'api').forEach(f => { porFecha[f.fecha] = f; });
    const ts = new Date().toISOString(), vistos = {}, api = [];
    ok.lista.forEach(x => {
      if (vistos[x.fecha]) return; vistos[x.fecha] = 1;
      const p = porFecha[x.fecha]; if (!p) nuevos++;
      // Se conserva la confirmación que hizo un jefe (cerrado/abrió) sobre un feriado que sigue existiendo.
      api.push({ fecha: x.fecha, nombre: x.nombre, tipo: x.tipo, origen: 'api', fuente: ok.fuente, palermo: p ? (p.palermo || '') : '',
        confirmadoPor: p ? (p.confirmadoPor || '') : '', confirmado: p ? (p.confirmado || '') : '', actualizado: ts });
    });
    const otrosAnios = actuales.filter(f => f.origen === 'api' && anios.indexOf(Number(f.fecha.slice(0, 4))) < 0);   // años anteriores: se conservan
    const manuales = actuales.filter(f => f.origen === 'manual');                                                     // excepciones: nunca se borran
    const todo = otrosAnios.concat(api).concat(manuales).sort((a, b) => a.fecha.localeCompare(b.fecha));
    total = todo.length;
    tReplace_('Feriados', todo);
  });
  const st = { ts: new Date().toISOString(), ok: true, fuente: ok.fuente, nombreFuente: ok.nombre, anios: anios, total: ok.lista.length, nuevos: nuevos, intentos: intentos, ultimaOk: new Date().toISOString() };
  PROPS.setProperty('FERIADOS_SYNC', JSON.stringify(st));
  log_(s, 'feriados_actualizacion', 'ok', anios.join('-'), ok.nombre + ' · ' + ok.lista.length + ' feriados · ' + nuevos + ' nuevos');
  return st;
}
/** Respaldo del activador semanal: si la última lectura correcta tiene más de 7 días, actualiza (nunca en llamadas rápidas). */
function autoFeriados_() {
  const st = feriadosSync_();
  const ult = st && (st.ok ? st.ts : st.ultimaOk);
  if (ult && Date.now() - new Date(ult).getTime() < FERIADOS_DIAS_REFRESCO * 86400000) return;
  if (st && !st.ok && Date.now() - new Date(st.ts).getTime() < 6 * 3600000) return;   // acaba de fallar: no reintentar en cada pedido
  try { feriadosActualizar_(null); } catch (e) {}
}
/** Activador semanal (lo crea instalarActivadores): refresca los feriados. */
function feriadosSemanal() { return feriadosActualizar_(null); }
/** Ejecutar UNA vez desde el editor de Apps Script: crea el activador semanal (si no existe) y hace la primera descarga. */
function instalarActivadores() {
  const hay = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'feriadosSemanal');
  if (!hay) ScriptApp.newTrigger('feriadosSemanal').timeBased().everyWeeks(1).onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(6).create();
  const st = feriadosActualizar_(null);
  console.log((hay ? 'El activador semanal ya existía.' : 'Activador semanal creado (lunes, 6 h).') + ' FERIADOS ' + JSON.stringify(st));
  return st;
}
/** Calendario del local: feriados (api) y excepciones (manual) con su estado. Las excepciones siempre significan "cerrado". */
function calendario_(cfg) {
  cfg = cfg || cfg_();
  const ops = cfg.diasOperativos || [3, 4, 5, 6], map = {};
  feriados_().forEach(f => { if (f.origen === 'manual' || !map[f.fecha]) map[f.fecha] = f; });
  const esApertura = d => ops.indexOf(dow_(d)) >= 0;
  return { ops: ops, map: map, esApertura: esApertura, feriado: d => map[d] || null,
    cerrado: d => { const f = map[d]; return !!f && (f.origen === 'manual' || f.palermo === 'cerrado'); },
    sinConfirmar: d => { const f = map[d]; return !!f && f.origen === 'api' && !f.palermo && esApertura(d); },
    lista: Object.keys(map).sort().map(k => map[k]) };
}
/** Días de apertura reales: calendario configurado menos feriados confirmados cerrados y excepciones. */
function diasAperturaEfectivos_(desde, hasta, cal) { return diasOperativosEntre_(desde, hasta, cal.ops).filter(d => !cal.cerrado(d)); }
function feriadoInfo_(f, cal, con) {
  return { fecha: f.fecha, nombre: f.nombre, tipo: f.tipo, origen: f.origen, palermo: f.palermo || '', confirmadoPor: f.confirmadoPor || '', confirmado: f.confirmado || '',
    dia: NOMBRE_DIA[dow_(f.fecha)], abre: cal.esApertura(f.fecha), conCierre: !!(con && con[f.fecha]), finDeSemanaLargo: [1, 4, 5].indexOf(dow_(f.fecha)) >= 0 };
}
/** Panel de feriados para la app: lista, próximos 30 días en días de apertura, pendientes de confirmar y excepciones. */
function feriadosPanel_(cfg) {
  const cal = calendario_(cfg), hoy = hoy_(), con = {};
  const cierres = tAll_('Cierres').filter(c => c.total > 0); cierres.forEach(c => { con[c.fecha] = 1; });
  const desdeDatos = cierres.length ? cierres.map(c => c.fecha).sort()[0] : sumarDias_(hoy, -60), lim = sumarDias_(hoy, 30);
  const info = f => feriadoInfo_(f, cal, con);
  return { lista: cal.lista.map(info), sync: feriadosSync_(), diasOperativos: cal.ops,
    proximos: cal.lista.filter(f => f.fecha >= hoy && f.fecha <= lim && cal.esApertura(f.fecha)).map(info),
    proximos5: cal.lista.filter(f => f.fecha >= hoy && f.origen === 'api').slice(0, 5).map(info),
    pendientes: cal.lista.filter(f => f.fecha < hoy && f.fecha >= desdeDatos && cal.sinConfirmar(f.fecha) && !con[f.fecha]).map(info),
    excepciones: cal.lista.filter(f => f.origen === 'manual').map(info) };
}
function getFeriados(token) {
  const s = sesion_(token);
  if (!['cierre', 'kpi', 'config', 'vacaciones'].some(p => s.perms.indexOf(p) >= 0)) throw new Error('PERM');
  autoFeriados_();
  return feriadosPanel_(cfg_());
}
/** Un jefe confirma qué pasó en un feriado que cae en día de apertura: 'cerrado', 'abierto' o '' (deshacer). */
function confirmarFeriado(token, fecha, estadoN) {
  const s = sesion_(token, 'cierre');
  fecha = fechaOk_(fecha); if (!fecha) throw new Error('Fecha inválida.');
  if (['cerrado', 'abierto', ''].indexOf(estadoN) < 0) throw new Error('Estado inválido.');
  if (fecha > hoy_()) throw new Error('Ese feriado todavía no pasó: se confirma después del día.');
  return lock_(() => {
    const f = feriados_().find(x => x.fecha === fecha && x.origen === 'api'); if (!f) throw new Error('Ese día no figura como feriado nacional.');
    f.palermo = estadoN; f.confirmadoPor = estadoN ? s.user.nombre + ' (' + s.user.legajo + ')' : ''; f.confirmado = estadoN ? new Date().toISOString() : ''; f.actualizado = new Date().toISOString();
    tUpdWhere_('Feriados', x => x.fecha === fecha && x.origen === 'api', f);
    log_(s, 'feriado_confirmado', estadoN || 'sin_confirmar', fecha, f.nombre + ' → ' + (estadoN === 'cerrado' ? 'Palermo estuvo cerrado' : estadoN === 'abierto' ? 'Palermo abrió (cierre pendiente de carga)' : 'sin confirmar'));
    return feriadosPanel_(cfg_());
  });
}
/** Excepción manual (administración): feriado de CABA, inventario, evento. Significa local cerrado ese día. */
function agregarExcepcion(token, fecha, motivo) {
  const s = sesion_(token, 'config', true);
  fecha = fechaOk_(fecha); motivo = txt_(motivo, 80);
  if (!fecha || !motivo) throw new Error('Completá la fecha y el motivo.');
  return lock_(() => {
    if (feriados_().some(x => x.fecha === fecha && x.origen === 'manual')) throw new Error('Ya hay una excepción para esa fecha.');
    tAdd_('Feriados', { fecha: fecha, nombre: motivo, tipo: 'excepción', origen: 'manual', fuente: 'manual', palermo: 'cerrado', confirmadoPor: s.user.nombre + ' (' + s.user.legajo + ')', confirmado: new Date().toISOString(), actualizado: new Date().toISOString() });
    log_(s, 'excepcion_calendario', 'agregada', fecha, motivo);
    return feriadosPanel_(cfg_());
  });
}
function quitarExcepcion(token, fecha) {
  const s = sesion_(token, 'config', true);
  fecha = fechaOk_(fecha); if (!fecha) throw new Error('Fecha inválida.');
  return lock_(() => {
    const todos = feriados_(), resto = todos.filter(x => !(x.fecha === fecha && x.origen === 'manual'));
    if (resto.length === todos.length) throw new Error('No hay una excepción en esa fecha.');
    tReplace_('Feriados', resto);
    log_(s, 'excepcion_calendario', 'quitada', fecha, '');
    return feriadosPanel_(cfg_());
  });
}
function actualizarFeriados(token) { const s = sesion_(token, 'config'); feriadosActualizar_(s); return feriadosPanel_(cfg_()); }

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
/** 3.3: columnas con fecha de una hoja (fila 4 = día de la semana o fila 5 = fecha), en orden. Lee todas las semanas que haya
 *  (4, 5 o más bloques), no solo las 4 primeras; se excluyen SUBTOTAL y TOTAL. */
function columnasFecha_(c) {
  const cols = {};
  Object.keys(c).forEach(ref => {
    const m = /^([A-Z]+)([45])$/.exec(ref); if (!m || m[1] === 'A') return;
    const v = c[ref];
    if (m[2] === '4') { if (diaDeEtiqueta_(v) != null && !/subtotal|total/i.test(String(v))) cols[m[1]] = 1; }
    else if (typeof v === 'number' || /^\s*\d{1,2}\s*[-\/.]\s*\d{1,2}/.test(String(v))) cols[m[1]] = 1;
  });
  Object.keys(cols).forEach(col => { if (/subtotal|total/i.test(String(c[col + '4'] || ''))) delete cols[col]; });
  return Object.keys(cols).sort((a, b) => a.length - b.length || a.localeCompare(b));
}
function parsearCierres_(hojas) {
  const out = [], errores = [], avisos = [], sinFecha = [];   // errores: hay que corregir la planilla · avisos: informativos (se importa igual)
  hojas.forEach(h => {
    const c = h.celdas;
    const etiq = String(c.E2 || c.A1 || '');
    const anio = Number((etiq.match(/(20\d{2})/) || String(c.A1 || '').match(/(20\d{2})/) || [])[1]);
    const mesHoja = MESES.indexOf(String(h.nombre).trim().toLowerCase()) + 1;
    if (!(String(c.A6 || '').toUpperCase().indexOf('TARJETA') >= 0)) { errores.push('Hoja "' + h.nombre + '": no tiene el formato esperado (fila 6 = TARJETAS).'); return; }
    const COLS = columnasFecha_(c), fechasHoja = {};
    if (COLS.length > 16) avisos.push('Hoja "' + h.nombre + '": tiene ' + (COLS.length / 4) + ' semanas (' + COLS.length + ' columnas con fecha); se leen todas.');
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
      if (mesHoja && mes !== mesHoja) avisos.push('Hoja "' + h.nombre + '" columna ' + col + ': la fecha ' + dia + '/' + mes + ' está en la hoja de otro mes; se importa con su fecha real.');
      // 3.3: una semana copiada sin actualizar las fechas (p. ej. 5.ª semana con las mismas fechas que la 4.ª) se avisa aunque no tenga importes.
      const kf = dia + '/' + mes;
      if (fechasHoja[kf] && !hayValores) errores.push('Hoja "' + h.nombre + '" columna ' + col + ': la fecha ' + kf + ' se repite (ya está en la columna ' + fechasHoja[kf] + '); si es la semana siguiente, corregí las fechas antes de cargar importes.');
      if (!fechasHoja[kf]) fechasHoja[kf] = col;
      if (!hayValores) return;
      const num = v => { if (v == null || v === '') return 0; const n = typeof v === 'number' ? v : Number(String(v).replace(/\./g, '').replace(',', '.')); return isFinite(n) && n >= 0 ? n : NaN; };
      const t = num(vt), tr = num(vtr), e = num(ve);
      if ([t, tr, e].some(isNaN)) { errores.push('Hoja "' + h.nombre + '" columna ' + col + ': importe no numérico.'); return; }
      if (typeof f === 'number') y = new Date(Math.round((f - 25569) * 86400000)).getUTCFullYear();
      const fecha = y + '-' + String(mes).padStart(2, '0') + '-' + String(dia).padStart(2, '0');
      const dsem = new Date(fecha + 'T12:00:00Z').getUTCDay(), dEtiq = diaDeEtiqueta_(c[col + '4']);
      if (isNaN(dsem)) { errores.push('Hoja "' + h.nombre + '" columna ' + col + ': fecha inválida.'); return; }
      if (dEtiq != null && dEtiq !== dsem) errores.push('Hoja "' + h.nombre + '" columna ' + col + ': la fecha ' + fecha.split('-').reverse().join('/') + ' no cae ' + c[col + '4'] + '.');
      const total = Math.round((t + tr + e) * 100) / 100;
      // 3.3: un día con importes cargados en $0 es un día CARGADO sin ventas (o feriado): no es un cierre pendiente.
      out.push({ fecha: fecha, tarjetas: t, transferencia: tr, efectivo: e, total: total, enCero: total === 0, hoja: h.nombre, columna: col });
    });
  });
  // Importes sin fecha que coinciden exactamente con un día fechado (posible doble carga)
  sinFecha.forEach(s => {
    const igual = out.find(o => o.tarjetas === s.t && o.transferencia === s.tr && o.efectivo === s.e && (s.t + s.tr + s.e) > 0);
    if (igual) errores.push('Hoja "' + s.hoja + '" columna ' + s.columna + ': los importes sin fecha son idénticos a los del ' + igual.fecha.split('-').reverse().join('/') + ' (posible doble carga).');
  });
  return { cierres: out, errores: errores, avisos: avisos };
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
    dias: Object.keys(porFecha).length, nuevos: nuevos, cambiados: cambiados, errores: res.errores.slice(0, 40), avisos: (res.avisos || []).slice(0, 40) };
  PROPS.setProperty('CIERRE_SYNC', JSON.stringify(st));
  log_(s, 'sync_cierre', res.errores.length ? 'con_alertas' : 'ok', file.getId(), st.dias + ' días · ' + nuevos + ' nuevos · ' + cambiados + ' cambiados · ' + res.errores.length + ' alertas');
  return st;
}
function alertasCierre_(cierres, desde, hasta, cal) {
  const cfg = cfg_(), users = usuarios_(), ing = tAll_('Ingresos').filter(x => x.fecha >= desde && x.fecha <= hasta && x.estado !== 'anulado' && tipoDe_(x) === 'entrada');
  cal = cal || calendario_(cfg);
  const vac = deVacaciones_();
  const alertas = [], porFecha = {};
  cierres.forEach(c => { porFecha[c.fecha] = c; });
  diasOperativosEntre_(desde, hasta, cfg.diasOperativos).filter(d => d < hoy_()).forEach(d => {
    const c = porFecha[d], delDia = ing.filter(x => x.fecha === d), f = cal.feriado(d);
    // "Sin caja": no hay fila cargada, o está en $0 y es feriado sin confirmar que abrió. Un $0 en un día común es un día cargado sin ventas.
    const sinCaja = !c || (c.total === 0 && f && f.palermo !== 'abierto');
    if (sinCaja && cal.cerrado(d)) return;   // feriado confirmado cerrado o excepción: no es un cierre pendiente
    if (sinCaja && cal.sinConfirmar(d)) alertas.push({ fecha: d, tipo: 'feriado_confirmar', detalle: 'Feriado (' + f.nombre + '): confirmar si Palermo abrió. No se cuenta como cierre pendiente hasta confirmarlo.', feriado: f.nombre });
    else if (!c) alertas.push({ fecha: d, tipo: 'cierre_pendiente', detalle: 'Día de apertura sin cierre cargado en la planilla.' + (f ? ' Feriado (' + f.nombre + ') confirmado como abierto.' : '') });
    else if (c.total === 0) alertas.push({ fecha: d, tipo: 'cierre_en_cero', detalle: 'Cargado en $ 0: día sin ventas' + (f ? ' (feriado ' + f.nombre + ', confirmado abierto)' : '') + '. Si el local no abrió, marcalo como excepción en Configuración para excluirlo del promedio.' });
    if (c && c.total > 0) {
      users.filter(u => u.estado === 'activo' && u.registraIngreso && normSuc_(sucDe_(u)) === 'palermo' && (!u.fechaIngreso || u.fechaIngreso <= d) && !vac(u.id, d)).forEach(u => {   // 3.3: de vacaciones no es falta · 3.4: la caja es de Palermo
        if (!delDia.some(x => x.uid === u.id)) alertas.push({ fecha: d, tipo: 'falta_ingreso', detalle: 'Hay cierre de ventas pero no hay ingreso registrado de ' + u.nombre + '.' });
      });
    }
    if (!c && delDia.length) alertas.push({ fecha: d, tipo: 'ingresos_sin_cierre', detalle: delDia.length + ' ingreso(s) registrado(s) y ningún cierre en la planilla.' });
  });
  // 3.4: varias entradas en el día son válidas si alternan con salidas; se alerta solo la secuencia rota (dos entradas seguidas).
  const todos = tAll_('Ingresos').filter(x => x.fecha >= desde && x.fecha <= hasta && vivo_(x)), grupos = {};
  todos.forEach(x => { const k = x.uid + '|' + x.fecha; (grupos[k] = grupos[k] || []).push(x); });
  Object.keys(grupos).forEach(k => { const L = grupos[k]; if (pares_(L, L[0].fecha, hoy_()).incoherente) alertas.push({ fecha: L[0].fecha, tipo: 'ingreso_duplicado', detalle: 'Fichajes de ' + L[0].nombre + ' con la secuencia entrada/salida rota (revisar).' }); });
  ing.forEach(x => { const u = users.find(v => v.id === x.uid); if (u && u.estado !== 'activo' && u.fechaBaja && x.fecha > u.fechaBaja) alertas.push({ fecha: x.fecha, tipo: 'empleado_inactivo', detalle: 'Ingreso de ' + x.nombre + ' posterior a su baja.' }); });
  return alertas.sort((a, b) => b.fecha.localeCompare(a.fecha));
}
function getCierre(token, desde, hasta) {
  sesion_(token, 'cierre');
  autoSync_(); autoFeriados_();
  hasta = fechaOk_(hasta) || hoy_(); desde = fechaOk_(desde) || (hasta.slice(0, 8) + '01');
  const cfg = cfg_(), cal = calendario_(cfg);
  // Cada cierre lleva su contexto de calendario: feriado (🎉) y venta en día no habitual (se cuenta igual, pero se marca).
  const cierres = tAll_('Cierres').filter(c => c.fecha >= desde && c.fecha <= hasta).sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map(c => { const f = cal.feriado(c.fecha); return Object.assign({}, c, { feriado: f ? f.nombre : '', noHabitual: !cal.esApertura(c.fecha) }); });
  const feriados = {}; cal.lista.filter(f => f.fecha >= desde && f.fecha <= hasta).forEach(f => { feriados[f.fecha] = feriadoInfo_(f, cal, null); });
  return { desde: desde, hasta: hasta, cierres: cierres, sync: JSON.parse(PROPS.getProperty('CIERRE_SYNC') || 'null'), alertas: alertasCierre_(cierres, desde, hasta, cal), feriados: feriados };
}

/* =================== KPIs (datos reales, agregados en el servidor) =================== */
function getKPIs(token, desde, hasta) {
  const s = sesion_(token, 'kpi');
  autoSync_(); autoFeriados_();
  hasta = fechaOk_(hasta) || hoy_(); desde = fechaOk_(desde) || '2000-01-01';
  const auds = leerAud_(), audN = auds.filter(a => a.fecha >= desde && a.fecha <= hasta).length;
  const acc = tAll_('Acciones');
  const hoy = hoy_(), cfg = cfg_(), cal = calendario_(cfg);
  const todasF = tAll_('Ingresos').filter(x => x.fecha >= desde && x.fecha <= hasta);
  const ing = todasF.filter(x => tipoDe_(x) === 'entrada');
  const sal = todasF.filter(x => tipoDe_(x) === 'salida' && vivo_(x));
  const dupIntentos = contados_('dup', desde, hasta);   // contador por mes (no se recorre el historial completo)
  const porDia = {}; ing.filter(x => x.estado !== 'anulado').forEach(x => { porDia[x.fecha] = (porDia[x.fecha] || 0) + 1; });
  const cierres = tAll_('Cierres').filter(c => c.fecha >= desde && c.fecha <= hasta).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const desdeCierre = cierres.length ? cierres[0].fecha : (desde > '2000-01-01' ? desde : hasta.slice(0, 8) + '01');
  const alertas = alertasCierre_(cierres, desdeCierre, hasta, cal);
  const sync = JSON.parse(PROPS.getProperty('CIERRE_SYNC') || 'null');
  const comercial = kpiComercial_(tAll_('Cierres'), cfg, hasta, sync, cal);
  const accionesK = { abiertas: acc.filter(a => a.estado === 'abierta' || a.estado === 'en_curso').length,
    vencidas: acc.filter(a => (a.estado === 'abierta' || a.estado === 'en_curso') && a.vence && a.vence < hoy).length,
    resueltas: acc.filter(a => a.estado === 'resuelta').length, total: acc.length };
  const auditoria = kpiAuditoria_(auds, acc, params_(), hoy);
  const feriados = feriadosPanel_(cfg);
  const pendientes = alertas.filter(a => a.tipo === 'cierre_pendiente').map(a => a.fecha).sort();
  const audio = audio_(s.user, comercial, auditoria, { pendientes: pendientes, acciones: accionesK, feriados: feriados, hoy: hoy });
  return {
    desde: desde, hasta: hasta, auditoriasN: audN, params: params_(),
    acciones: accionesK, auditoria: auditoria, feriados: feriados, audio: audio,
    cierresPendientes: pendientes, feriadosPendientes: alertas.filter(a => a.tipo === 'feriado_confirmar').map(a => a.fecha).sort(),
    ingresos: { total: ing.filter(x => x.estado !== 'anulado').length, revisar: ing.filter(x => x.estado === 'revisar').length,
      validos: ing.filter(x => x.estado === 'valido').length, corregidos: ing.filter(x => x.estado === 'corregido').length,
      fuera: ing.filter(x => x.geoResultado === 'fuera').length, sinUbicacion: ing.filter(x => ['sin_permiso', 'no_disponible', 'tiempo_agotado'].indexOf(x.geoResultado) >= 0).length,
      duplicadosBloqueados: dupIntentos, porDia: porDia, salidas: sal.length,
      sinSalida: ing.filter(e => vivo_(e) && e.fecha < hoy && !sal.some(o => o.uid === e.uid && o.fecha === e.fecha)).length,
      minutosPromedio: (() => { const m = sal.map(o => o.minutos).filter(v => v != null); return m.length ? Math.round(m.reduce((a, b) => a + b, 0) / m.length) : null; })() },
    cierres: cierres.map(c => ({ fecha: c.fecha, tarjetas: c.tarjetas, transferencia: c.transferencia, efectivo: c.efectivo, total: c.total })),
    cierreSync: sync,
    comercial: comercial,
    alertas: { cierrePendiente: pendientes.length, total: alertas.length, faltaIngreso: alertas.filter(a => a.tipo === 'falta_ingreso').length, feriadoConfirmar: alertas.filter(a => a.tipo === 'feriado_confirmar').length }
  };
}

/* =================== 3.3 · Indicadores de auditoría (para el audio y el panel) =================== */
function kpiAuditoria_(auds, acc, p, hoy) {
  const L = auds.slice().sort((a, b) => (a.fecha + (a.creado || '')).localeCompare(b.fecha + (b.creado || '')));
  const abiertas = acc.filter(a => a.estado === 'abierta' || a.estado === 'en_curso'), vencidas = abiertas.filter(a => a.vence && a.vence < hoy);
  const out = { auditorias: L.length, ultima: null, anterior: null, puntoDebil: null, infraccionTop: null, pedidosFuera: 0, tendencia: null,
    accionesAbiertas: abiertas.length, accionesVencidas: vencidas.length, recomendaciones: [], diferenciasCaja: 'sin_datos' };
  if (!L.length) { out.recomendaciones.push({ prioridad: 1, queEstaPasando: 'Todavía no hay auditorías cargadas.', accion: 'Hacer la primera auditoría del local desde la app para tener una línea de base.' }); return out; }
  const u = L[L.length - 1], a = L[L.length - 2] || null;
  out.ultima = { fecha: u.fecha, promedio: u.promedio, resultado: u.resultado, auditor: u.auditor };
  if (a) { out.anterior = { fecha: a.fecha, promedio: a.promedio, resultado: a.resultado }; out.tendencia = u.promedio > a.promedio ? 'mejora' : u.promedio < a.promedio ? 'empeora' : 'igual'; }
  const rec90 = L.filter(x => x.fecha >= sumarDias_(hoy, -90)); const base = rec90.length ? rec90 : L.slice(-5);
  const prom = {}; PUNTOS.forEach(x => { const v = base.map(b => b.puntajes && b.puntajes[x[0]]).filter(Boolean); prom[x[0]] = v.length ? v.reduce((s, y) => s + y, 0) / v.length : null; });
  const deb = PUNTOS.filter(x => prom[x[0]] != null).sort((x, y) => prom[x[0]] - prom[y[0]])[0];
  if (deb) out.puntoDebil = { punto: deb[1], promedio: r2_(prom[deb[0]]) };
  const inf = PUNTOS.map(x => ({ punto: x[2], total: base.reduce((s, b) => s + ((b.infracciones || {})[x[0]] || 0), 0) })).sort((x, y) => y.total - x.total);
  if (inf[0] && inf[0].total) out.infraccionTop = inf[0];
  out.pedidosFuera = base.filter(b => b.diasPedido != null && b.diasPedido > p.diasMax).length;
  // Recomendaciones: primero qué está pasando (hecho), después la acción. Sin conclusiones sobre el desempeño del personal.
  const R = out.recomendaciones;
  if (vencidas.length) R.push({ prioridad: 1, queEstaPasando: vencidas.length + ' acción(es) correctiva(s) vencida(s) sin resolver' + (vencidas[0] ? ' (la más antigua: ' + vencidas[0].descripcion.slice(0, 60) + ')' : '') + '.', accion: 'Revisar esas acciones con el local esta semana y cerrarlas con evidencia o fijar una nueva fecha.' });
  if (out.pedidosFuera) R.push({ prioridad: 1, queEstaPasando: out.pedidosFuera + ' auditoría(s) reciente(s) con pedidos de más de ' + p.diasMax + ' días sin retirar.', accion: 'Pedir aviso diario de pedidos pendientes y confirmar el retiro en la próxima visita.' });
  if (out.infraccionTop) R.push({ prioridad: 2, queEstaPasando: 'La infracción más frecuente en las últimas auditorías es «' + out.infraccionTop.punto + '» (' + out.infraccionTop.total + ').', accion: 'Atacar primero ese punto: definir un responsable en el local y revisarlo en la próxima auditoría.' });
  if (out.puntoDebil && out.puntoDebil.promedio < p.promExc) R.push({ prioridad: 2, queEstaPasando: 'El punto más débil es «' + out.puntoDebil.punto + '» con ' + String(out.puntoDebil.promedio).replace('.', ',') + ' sobre 5.', accion: 'Subirlo a ' + String(p.promExc).replace('.', ',') + ': acordar con el local qué se corrige y verificarlo en la próxima visita.' });
  if (out.tendencia === 'empeora') R.push({ prioridad: 3, queEstaPasando: 'La última auditoría bajó respecto de la anterior (' + String(a.promedio).replace('.', ',') + ' → ' + String(u.promedio).replace('.', ',') + ').', accion: 'Hacer una visita de seguimiento antes de 7 días.' });
  if (abiertas.length && !vencidas.length) R.push({ prioridad: 3, queEstaPasando: abiertas.length + ' acción(es) correctiva(s) abierta(s), ninguna vencida.', accion: 'Mantener el seguimiento y cerrarlas con evidencia al resolverse.' });
  if (!R.length) R.push({ prioridad: 3, queEstaPasando: 'El local está dentro de los parámetros (última auditoría: ' + u.resultado + ').', accion: 'Mantener la frecuencia de auditoría.' });
  R.sort((x, y) => x.prioridad - y.prioridad);
  return out;
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

function kpiComercial_(todos, cfg, hasta, sync, cal) {
  hasta = hasta || hoy_();
  const ac = Object.assign({ caidaPct: 15, mixPp: 10, minDias: 4, concentracionPct: 45, mesBajoPct: 10 }, cfg.alertasCom || {});
  cal = cal || calendario_(cfg);   // 3.3: feriados y excepciones
  // 3.3: un día cargado en $0 es un día de apertura sin ventas (cuenta como cierre). Si es feriado y nadie confirmó que abrió, queda "a confirmar".
  const cargado = c => c.total > 0 || (c.total === 0 && (!cal.feriado(c.fecha) || cal.feriado(c.fecha).palermo === 'abierto'));
  const dias = todos.filter(c => c.fecha <= hasta && cargado(c)).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const base = { definiciones: DEFINICIONES, noDisponible: NO_DISPONIBLE, actualizado: sync ? sync.ts : null, fuente: FUENTE_CIERRE };
  if (!dias.length) return Object.assign(base, { sinDatos: true, alertas: [], recomendaciones: [], mesBajo: null, accionesComerciales: [] });
  const ops = cfg.diasOperativos || [3, 4, 5, 6];

  // ---- Meses
  const porMes = {};
  dias.forEach(c => { const m = c.fecha.slice(0, 7); (porMes[m] = porMes[m] || []).push(c); });
  const mesHoy = hasta.slice(0, 7);
  if (!porMes[mesHoy]) porMes[mesHoy] = [];
  const meses = Object.keys(porMes).sort().map(m => {
    const s = sumar_(porMes[m]);
    const fin = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).toISOString().slice(0, 10);
    const conCierre = {}; porMes[m].forEach(c => { conCierre[c.fecha] = 1; });
    const opMes = diasOperativosEntre_(m + '-01', fin, ops);
    // Días de apertura efectivos: sin feriados confirmados cerrados ni excepciones (un día con caja cuenta siempre, aunque esté marcado cerrado).
    const cerrados = opMes.filter(d => cal.cerrado(d) && !conCierre[d]).map(d => ({ fecha: d, motivo: cal.feriado(d).nombre, tipo: cal.feriado(d).origen === 'manual' ? 'excepción' : 'feriado' }));
    const opEf = opMes.filter(d => !cerrados.some(x => x.fecha === d));
    const pasados = opEf.filter(d => d < hasta || (d === hasta && conCierre[d]));
    s.mes = m; s.nombre = MES_NOM(m); s.diasOperativos = opEf.length; s.diasCalendario = opMes.length; s.diasCerrados = cerrados;
    s.feriadosSinConfirmar = pasados.filter(d => !conCierre[d] && cal.sinConfirmar(d)).map(d => ({ fecha: d, nombre: cal.feriado(d).nombre }));
    s.feriadosConVenta = porMes[m].filter(c => cal.feriado(c.fecha)).map(c => ({ fecha: c.fecha, nombre: cal.feriado(c.fecha).nombre, total: c.total }));
    s.ventasNoHabituales = porMes[m].filter(c => !cal.esApertura(c.fecha)).map(c => ({ fecha: c.fecha, total: c.total }));
    s.diasEnCero = porMes[m].filter(c => c.total === 0).map(c => c.fecha);
    s.diasSinCierre = pasados.filter(d => !conCierre[d] && !cal.sinConfirmar(d));
    s.restantes = opEf.filter(d => d >= hasta && !conCierre[d]).length;
    s.feriadosRestantes = opEf.filter(d => d >= hasta && !conCierre[d] && cal.feriado(d)).map(d => ({ fecha: d, nombre: cal.feriado(d).nombre }));
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
    if (p && p.dias) {
      s.vsAnterior = { mes: p.mes, total: p.total, deltaTotal: r2_(s.total - p.total), deltaTotalPct: pct_(s.total, p.total),
        promDia: p.promDia, deltaPromPct: s.promDia != null ? pct_(s.promDia, p.promDia) : null, diasOperativos: p.diasOperativos, diasCerrados: p.diasCerrados.length };
      // La comparación dice si los feriados cambiaron la cantidad de días de apertura.
      const notas = [];
      if (s.diasCerrados.length) notas.push(s.nombre + ' tuvo ' + s.diasCerrados.length + ' día(s) menos de apertura por ' + s.diasCerrados.map(x => x.tipo + ' (' + fdm_(x.fecha) + ')').join(', '));
      if (p.diasCerrados.length) notas.push(p.nombre + ' tuvo ' + p.diasCerrados.length + ' día(s) menos de apertura por ' + p.diasCerrados.map(x => x.tipo + ' (' + fdm_(x.fecha) + ')').join(', '));
      if (s.diasOperativos !== p.diasOperativos) notas.push('Días de apertura: ' + s.diasOperativos + ' en ' + s.nombre + ' vs. ' + p.diasOperativos + ' en ' + p.nombre + '; por eso se compara el promedio por día y no el total.');
      s.vsAnterior.notaFeriados = notas.length ? notas.join('. ') + '.' : '';
    }
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
      supuestos: ['Abre ' + ops.map(d => NOMBRE_DIA[d]).join(', ') + ' (' + actual.restantes + ' días de apertura restantes en ' + actual.nombre +
          (actual.diasCerrados.length ? '; ya descontados ' + actual.diasCerrados.length + ' día(s) cerrado(s): ' + actual.diasCerrados.map(x => fdm_(x.fecha) + ' ' + x.motivo).join(', ') : '') + ').',
        'Cada día restante vende como la mediana de los últimos ' + recientes.length + ' días con cierre (' + $_(med) + ').',
        'Rango: percentiles 25 y 75 de esos días. No incluye promociones ni eventos especiales.',
        actual.feriadosRestantes.length ? 'Incluye como día de apertura el feriado ' + actual.feriadosRestantes.map(x => fdm_(x.fecha) + ' (' + x.nombre + ')').join(' y ') + ': nunca se asume que el local cierra; si no abre, marcalo como cerrado y la proyección se ajusta.' : 'No quedan feriados en los días de apertura restantes.',
        actual.diasSinCierre.length ? 'Hay ' + actual.diasSinCierre.length + ' día(s) de apertura sin cierre: si se cargan, el real sube.' : 'Todos los días de apertura pasados tienen cierre.'].concat(
        actual.feriadosSinConfirmar.length ? ['Feriado(s) sin confirmar: ' + actual.feriadosSinConfirmar.map(x => fdm_(x.fecha)).join(', ') + '. No se cuentan como días sin cierre hasta que un jefe confirme si Palermo abrió.'] : []),
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
  const quintaSemana = meses.filter(m => m.diasOperativos > 16).map(m => m.nombre);   // regla de la 5.ª semana con días de apertura efectivos
  const ultCompleto = meses.filter(m => !m.enCurso && m.dias >= ac.minDias);
  const feriadosPend = meses.reduce((a, m) => a.concat(m.feriadosSinConfirmar), []).filter(x => x.fecha >= dias[0].fecha);
  if (feriadosPend.length) alertas.push({ tipo: 'feriado_confirmar', nivel: 'media', titulo: 'Feriado: confirmar si abrió',
    observado: feriadosPend.map(x => fdm_(x.fecha) + ' (' + x.nombre + ')').join(', '), comparado: 'Días de apertura sin caja que caen en feriado', valor: feriadosPend.length,
    motivo: 'No se asume que el local cerró. Un jefe marca «Estuvo cerrado» (se excluye de promedios y proyección) o «Abrió» (queda como cierre pendiente de carga).' });
  const enCero = meses.reduce((a, m) => a.concat(m.diasEnCero), []);
  if (enCero.length) alertas.push({ tipo: 'cierres_en_cero', nivel: 'media', titulo: 'Días cargados en $ 0 (sin ventas)',
    observado: enCero.length + ' día(s): ' + enCero.slice(-6).map(fdm_).join(', ') + (enCero.length > 6 ? '…' : ''), comparado: 'Planilla: importes en 0 en tarjetas, transferencia y efectivo', valor: enCero.length,
    motivo: 'Se toman como días de apertura sin ventas (cuentan en el promedio por día). Si el local no abrió, marcá el día como excepción en Configuración y queda excluido.' });
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
      accion: a.tipo === 'datos_incompletos' ? 'Cargar los días pendientes o, si el local no abrió, marcarlo en la app (feriado «Estuvo cerrado» o excepción). ' + (quintaSemana.length ? 'Agregar una 5.ª semana en la planilla en ' + quintaSemana.join(', ') + ' (más de 16 días de apertura efectivos).' : 'Ningún mes supera los 16 días de apertura efectivos: no hace falta 5.ª semana.') : 'Revisar en la planilla las celdas señaladas (' + a.motivo.slice(0, 160) + ').',
      medicion: 'Cero días pendientes y cero observaciones en la próxima sincronización.' });
  });
  if (actual && actual.vsAnterior && actual.vsAnterior.deltaPromPct != null && actual.vsAnterior.deltaPromPct >= ac.caidaPct && actual.dias >= ac.minDias) rec.push({ prioridad: 3, titulo: 'Sostener la mejora',
    diagnostico: 'El promedio diario mejoró contra el mes anterior.', datos: $_(actual.promDia) + ' vs. ' + $_(actual.vsAnterior.promDia) + ' (+' + actual.vsAnterior.deltaPromPct + '%).',
    causa: 'Hecho: subió la venta media diaria. La causa no surge de la planilla; conviene anotar qué se hizo distinto este mes.',
    accion: 'Registrar en Otros/Novedades qué acciones comerciales hubo este mes para poder repetirlas.', medicion: 'Que el promedio del mes próximo no baje de ' + $_(actual.vsAnterior.promDia) + '.' });
  rec.sort((a, b) => a.prioridad - b.prioridad);

  // ---- 3.3 · ¿Mes bajo? y acciones comerciales (tráfico antes que precio). Considera feriados y fines de semana largos próximos.
  const mesBajo = mesBajo_(meses, actual, proyeccion, ac, dias);
  const proxFer = cal.lista.filter(f => f.fecha >= hasta && f.fecha <= sumarDias_(hasta, 45) && f.origen === 'api').map(f => feriadoInfo_(f, cal, null));
  const accionesComerciales = mesBajo && mesBajo.esBajo ? accionesComerciales_(mesBajo, diaSemana, actual, proxFer) : [];

  // ---- Resumen ejecutivo
  const ref = actual && actual.dias ? actual : ultCompleto[ultCompleto.length - 1];
  const resumen = [];
  if (ref && ref.vsAnterior) resumen.push({ pregunta: '¿Estamos vendiendo más o menos que antes?', respuesta: ref.nombre + ': ' + $_(ref.promDia) + ' por día con cierre, ' +
    (ref.vsAnterior.deltaPromPct >= 0 ? '+' : '') + ref.vsAnterior.deltaPromPct + '% contra ' + MES_NOM(ref.vsAnterior.mes) + ' (' + $_(ref.vsAnterior.promDia) + ').' + (ref.enCurso ? ' Mes en curso.' : '') + (ref.vsAnterior.notaFeriados ? ' ' + ref.vsAnterior.notaFeriados : '') });
  if (mesBajo && mesBajo.esBajo != null) resumen.push({ pregunta: '¿Es un mes bajo?', respuesta: mesBajo.mensaje + (mesBajo.esBajo ? ' Ver «Acciones comerciales para Palermo».' : '') });
  if (proyeccion && proyeccion.bloqueada) resumen.push({ pregunta: '¿Cómo cerraría el mes?', respuesta: proyeccion.motivo });
  else if (proyeccion) resumen.push({ pregunta: '¿Cómo cerraría el mes?', respuesta: 'Estimación: ' + $_(proyeccion.minimo) + ' a ' + $_(proyeccion.maximo) + ' (central ' + $_(proyeccion.medio) + '), incertidumbre ' + proyeccion.incertidumbre + '.' + (proyeccion.objetivo ? ' Objetivo ' + $_(proyeccion.objetivo) + ': avance ' + proyeccion.avancePct + '%.' : ' No hay objetivo cargado para este mes.') });
  if (top) resumen.push({ pregunta: '¿Qué está impulsando las ventas?', respuesta: 'Los ' + top.nombre + ' aportan el ' + top.participacion + '% (' + $_(top.promedio) + ' de promedio). Sin detalle por producto no se puede identificar qué artículos impulsan la venta.' });
  resumen.push({ pregunta: '¿Qué conviene revisar esta semana?', respuesta: rec.length ? rec.slice(0, 3).map(r => r.titulo).join(' · ') : 'Sin alertas relevantes con los umbrales actuales.' });

  return Object.assign(base, { desde: dias[0].fecha, hasta: dias[dias.length - 1].fecha, diasConCierre: dias.length,
    meses: meses, semanas: semanas.slice(-16), anios: anios, diaSemana: diaSemana, proyeccion: proyeccion, alertas: alertas, recomendaciones: rec, resumen: resumen,
    ultimos: dias.slice(-31).map(c => Object.assign({}, c, { feriado: cal.feriado(c.fecha) ? cal.feriado(c.fecha).nombre : '', noHabitual: !cal.esApertura(c.fecha) })),
    mesBajo: mesBajo, accionesComerciales: accionesComerciales, quintaSemana: quintaSemana });
}

/* ---- 3.3 · Mes bajo: promedio por día de apertura (o su proyección) vs. mes anterior o promedio del año, con umbral configurable ---- */
function mesBajo_(meses, actual, proyeccion, ac, dias) {
  const umbral = Number(ac.mesBajoPct) || 10;
  let m = actual && actual.dias >= ac.minDias ? actual : null, aclaracion = '';
  if (!m) { const comp = meses.filter(x => !x.enCurso && x.dias >= ac.minDias); m = comp[comp.length - 1] || null;
    if (actual) aclaracion = 'Todavía no hay suficientes días con cierre en ' + actual.nombre + ' (' + actual.dias + ' de un mínimo de ' + ac.minDias + '); se evalúa ' + (m ? m.nombre : 'ningún mes') + '.'; }
  if (!m) return { esBajo: null, umbralPct: umbral, mensaje: 'Sin datos suficientes para evaluar un mes.', aclaracion: aclaracion };
  const idx = meses.indexOf(m), prev = idx > 0 && meses[idx - 1].dias >= ac.minDias ? meses[idx - 1] : null;
  const delAnio = dias.filter(c => c.fecha.slice(0, 4) === m.mes.slice(0, 4) && c.fecha.slice(0, 7) < m.mes);
  const promAnio = delAnio.length >= ac.minDias ? r2_(delAnio.reduce((a, c) => a + c.total, 0) / delAnio.length) : null;
  const promProy = m.enCurso && proyeccion && !proyeccion.bloqueada && (m.dias + m.restantes) ? r2_(proyeccion.medio / (m.dias + m.restantes)) : null;
  const comps = [];
  const cmp = (contra, refV) => { if (refV == null) return; const d1 = pct_(m.promDia, refV), d2 = promProy != null ? pct_(promProy, refV) : null;
    comps.push({ contra: contra, referencia: refV, deltaPromPct: d1, deltaProyPct: d2, bajo: (d1 != null && d1 <= -umbral) || (d2 != null && d2 <= -umbral) }); };
  if (prev) cmp('mes anterior (' + prev.nombre + ')', prev.promDia);
  cmp('promedio del año (' + delAnio.length + ' días con cierre)', promAnio);
  if (!comps.length) return { esBajo: null, mes: m.mes, nombre: m.nombre, promDia: m.promDia, umbralPct: umbral, aclaracion: aclaracion, mensaje: 'No hay un mes anterior ni promedio del año para comparar ' + m.nombre + '.' };
  const esBajo = comps.some(c => c.bajo);
  const peorDe = c => Math.min(c.deltaPromPct == null ? 0 : c.deltaPromPct, c.deltaProyPct == null ? 0 : c.deltaProyPct);
  const peor = comps.filter(c => c.bajo).sort((a, b) => peorDe(a) - peorDe(b))[0];
  const porProm = peor && peor.deltaPromPct != null && peor.deltaPromPct <= -umbral;
  return { esBajo: esBajo, mes: m.mes, nombre: m.nombre, enCurso: !!m.enCurso, dias: m.dias, promDia: m.promDia, promDiaProyectado: promProy, comparaciones: comps, umbralPct: umbral, aclaracion: aclaracion,
    criterio: esBajo ? (porProm ? 'promedio' : 'proyeccion') : null, contra: peor ? peor.contra : null, referencia: peor ? peor.referencia : null, deltaPct: peor ? (porProm ? peor.deltaPromPct : peor.deltaProyPct) : null,
    mensaje: esBajo ? cap_(m.nombre) + ' se considera mes bajo: ' + (porProm ? 'el promedio por día de apertura (' + $_(m.promDia) + ') está ' + Math.abs(peor.deltaPromPct) + '% por debajo del ' + peor.contra : 'la proyección por día (' + $_(promProy) + ') queda ' + Math.abs(peor.deltaProyPct) + '% por debajo del ' + peor.contra) + ' (' + $_(peor.referencia) + '). Umbral: ' + umbral + '%.'
      : 'Sin alertas: el mes viene en línea. ' + cap_(m.nombre) + ': ' + $_(m.promDia) + ' por día de apertura' + comps.map(c => ', ' + (c.deltaPromPct >= 0 ? '+' : '') + c.deltaPromPct + '% vs. ' + c.contra).join('') + ' (umbral −' + umbral + '%).' };
}
/* ---- 3.3 · Acciones comerciales para meses bajos: qué hacer · por qué (dato) · esfuerzo · plazo · cómo medir. Tráfico antes que descuentos. ---- */
function accionesComerciales_(mb, diaSemana, actual, proxFer) {
  const A = [];
  const ds = diaSemana.filter(d => d.n >= 2), flojo = ds.slice().sort((a, b) => a.promedio - b.promedio)[0], fuerte = ds.slice().sort((a, b) => b.participacion - a.participacion)[0];
  const dato = $_(mb.promDia) + ' por día de apertura en ' + mb.nombre + ' vs. ' + $_(mb.referencia) + ' del ' + mb.contra + ' (' + mb.deltaPct + '%)';
  const ferLargo = proxFer.filter(f => f.finDeSemanaLargo || f.abre)[0];
  A.push({ prioridad: 1, tipo: 'trafico', titulo: 'Pauta geolocalizada alrededor del showroom y contenido del local',
    queHacer: 'Correr una campaña en Instagram/Meta con radio de pocos kilómetros alrededor del showroom, activa en los horarios de apertura, y publicar contenido del local físico (vidriera, cómo llegar, horarios) dos veces por semana.',
    porQue: 'Dato: ' + dato + '. Hipótesis a verificar: el showroom tiene poco tráfico y la pauta digital no apunta al punto físico.',
    esfuerzo: 'medio', plazo: 'esta semana', medicion: 'Promedio por día de apertura de las próximas 2 semanas contra ' + $_(mb.promDia) + ', y cantidad de visitas que mencionan el anuncio (anotarlas en cada venta).' });
  if (flojo) A.push({ prioridad: 2, tipo: 'dias_flojos', titulo: 'Acción para ' + flojo.nombre + (flojo.dia === 3 ? ' y jueves' : ''),
    queHacer: 'Un beneficio exclusivo para quien visita el showroom los ' + flojo.nombre + (flojo.dia === 3 ? ' y jueves' : '') + ' (asesoramiento de look, regalo con la compra o preventa de la colección), comunicado el día anterior por redes y WhatsApp.',
    porQue: 'Dato: los ' + flojo.nombre + ' promedian ' + $_(flojo.promedio) + ' (' + flojo.participacion + '% de la facturación)' + (fuerte && fuerte.dia !== flojo.dia ? ' contra ' + $_(fuerte.promedio) + ' los ' + fuerte.nombre + ' (' + fuerte.participacion + '%)' : '') + '.',
    esfuerzo: 'bajo', plazo: 'esta semana', medicion: 'Promedio de los ' + flojo.nombre + ' en 4 semanas contra ' + $_(flojo.promedio) + '.' });
  if (ferLargo) A.push({ prioridad: 2, tipo: 'evento', titulo: 'Acción especial para el ' + (ferLargo.finDeSemanaLargo ? 'fin de semana largo del ' : 'feriado del ') + fdm_(ferLargo.fecha),
    queHacer: 'Confirmar si Palermo abre el ' + ferLargo.dia + ' ' + fdm_(ferLargo.fecha) + ' (' + ferLargo.nombre + ') y armar una acción para esos días: horario extendido el sábado, lanzamiento o evento en el showroom y aviso previo a la base de clientas.',
    porQue: 'Dato: hay un feriado en los próximos días' + (ferLargo.abre ? ', en día de apertura' : '') + '. Hipótesis: más gente circulando en un fin de semana largo; hay que verificarlo con las ventas de esos días.',
    esfuerzo: 'medio', plazo: 'este mes', medicion: 'Venta de cada día del fin de semana largo contra el promedio del mismo día de la semana.' });
  else A.push({ prioridad: 2, tipo: 'evento', titulo: 'Evento o lanzamiento en el showroom con alianzas cercanas',
    queHacer: 'Organizar un evento (lanzamiento de colección, tarde para clientas invitadas) y aliarse con dos o tres comercios cercanos para cruzar públicos (flyer o beneficio mutuo).',
    porQue: 'Dato: ' + dato + '. Hipótesis: falta un motivo puntual para ir al showroom.',
    esfuerzo: 'alto', plazo: 'este mes', medicion: 'Venta del día del evento contra el promedio del mismo día de la semana, y contactos nuevos registrados.' });
  A.push({ prioridad: 3, tipo: 'conversion', titulo: 'Beneficio por 2 o más prendas y promo con un medio de pago',
    queHacer: 'Combo o beneficio al llevar dos o más prendas y una promo acotada con un medio de pago (por ejemplo transferencia), antes que bajar precios de lista.',
    porQue: 'Dato: la planilla no tiene cantidad de operaciones, así que no se mide conversión ni ticket promedio; la acción apunta a subir el importe por visita. Mix actual: ' + (actual && actual.mix ? 'tarjetas ' + actual.mix.tarjetas + '%, transferencia ' + actual.mix.transferencia + '%, efectivo ' + actual.mix.efectivo + '%' : 'sin datos') + '.',
    esfuerzo: 'bajo', plazo: 'esta semana', medicion: 'Facturación por día de apertura y participación del medio de pago promocionado en las próximas 2 semanas.' });
  A.push({ prioridad: 3, tipo: 'clientes', titulo: 'Campaña de WhatsApp a clientas anteriores y registro de contactos',
    queHacer: 'Mandar una campaña por WhatsApp o mail a clientas anteriores con una invitación concreta al showroom, y registrar el contacto en cada venta nueva.',
    porQue: 'Dato: no hay identificación de clientes en la planilla (indicador 10.4 sin datos); sin base no hay recurrencia medible.',
    esfuerzo: 'bajo', plazo: 'este mes', medicion: 'Contactos registrados por semana y ventas que responden a la campaña.' });
  A.push({ prioridad: 3, tipo: 'ticket', titulo: 'Venta cruzada y armado de looks',
    queHacer: 'Armar looks completos en el showroom y ofrecer la segunda prenda en cada venta.',
    porQue: 'Dato: sin cantidad de operaciones no se conoce el ticket promedio; la hipótesis es que hay margen para subirlo.',
    esfuerzo: 'bajo', plazo: 'esta semana', medicion: 'Facturación por día de apertura en 2 semanas contra ' + $_(mb.promDia) + '.' });
  return A.slice(0, 5);
}

/* ---- 3.3 · Audio: números dichos como se hablan ---- */
const UNI_ = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const DEC_ = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const CEN_ = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];
function palabras_(n) {
  n = Math.round(Math.abs(Number(n) || 0));
  if (n < 30) return UNI_[n];
  if (n < 100) return DEC_[Math.floor(n / 10)] + (n % 10 ? ' y ' + UNI_[n % 10] : '');
  if (n === 100) return 'cien';
  if (n < 1000) return CEN_[Math.floor(n / 100)] + (n % 100 ? ' ' + palabras_(n % 100) : '');
  if (n < 1000000) { const m = Math.floor(n / 1000), r = n % 1000; return (m === 1 ? 'mil' : palabras_(m).replace(/uno$/, 'un') + ' mil') + (r ? ' ' + palabras_(r) : ''); }
  const M = Math.floor(n / 1000000), r = n % 1000000;
  return (M === 1 ? 'un millón' : palabras_(M) + ' millones') + (r ? ' ' + palabras_(r) : '');
}
/** Importes: "dos con veintinueve millones de pesos" · "cuatrocientos sesenta y dos mil pesos" · "ochocientos pesos". */
function dinero_(n) {
  n = Math.round(Number(n) || 0);
  if (n >= 1000000) {
    let M = Math.floor(n / 1e6), dec = Math.round((n % 1e6) / 1e4); if (dec === 100) { M++; dec = 0; }
    const un = w => w.replace(/veintiuno$/, 'veintiún').replace(/ uno$/, ' un');   // "setenta y un millones"
    return (dec ? palabras_(M) + ' con ' + (dec < 10 ? 'cero ' : '') + un(palabras_(dec)) : un(palabras_(M))) + (M === 1 && !dec ? ' millón' : ' millones') + ' de pesos';
  }
  if (n >= 1000) { const r = Math.round(n / 1000) * 1000; return r >= 1000000 ? dinero_(r) : palabras_(r) + ' pesos'; }
  return palabras_(n) + ' pesos';
}
function porcentaje_(p) { if (p == null || isNaN(p)) return ''; const a = Math.abs(p), ent = Math.floor(a), d = Math.round((a - ent) * 10); return (p < 0 ? 'menos ' : 'más ') + palabras_(ent) + (d && ent < 10 ? ' coma ' + palabras_(d) : '') + ' por ciento'; }
function fechaHablada_(f) { const d = Number(f.slice(8, 10)); return 'el ' + NOMBRE_DIA[dow_(f)] + ' ' + (d === 1 ? 'primero' : palabras_(d)) + ' de ' + MESES[Number(f.slice(5, 7)) - 1]; }
/** Pasa a forma hablada los importes ($ 1.234.567), porcentajes (−12%, 8,5%) y fechas (12/10/2026) que haya en un texto. */
function hablar_(t) {
  return String(t || '').replace(/\$\s?([\d.]+)/g, (m, d) => dinero_(Number(d.replace(/\./g, ''))))
    .replace(/([+\-−]?)(\d+(?:[.,]\d+)?)\s?%/g, (m, sg, p) => (sg === '+' ? 'más ' : sg ? 'menos ' : '') + palabras_(Math.floor(Number(p.replace(',', '.')))) + ((p.indexOf(',') >= 0 || p.indexOf('.') >= 0) && Number(p.replace(',', '.')) < 10 && Math.round((Number(p.replace(',', '.')) % 1) * 10) ? ' coma ' + palabras_(Math.round((Number(p.replace(',', '.')) % 1) * 10)) : '') + ' por ciento')
    .replace(/(\d{2})\/(\d{2})\/(\d{4})/g, (m, d, mo, y) => fechaHablada_(y + '-' + mo + '-' + d).replace(/^el /, ''))
    .replace(/\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre) 20\d\d\b/g, '$1')   // "octubre 2026" → "octubre"
    .replace(/\s+pp\b/g, ' puntos').replace(/ vs\. /g, ' contra ').replace(/\bs\/d\b/g, 'sin dato');
}
const sinEl_ = s => s.replace(/^el /, '');
const cap_ = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
/* ---- 3.3 · Textos del resumen hablado (el navegador los lee con la Web Speech API; aquí solo se arma el texto con datos reales) ---- */
function audio_(u, com, aud, ctx) {
  const nombre = String(u && u.nombre || '').trim().split(' ')[0];
  const hola = nombre ? 'Hola ' + nombre + ', ' : 'Hola, ';
  const hoy = ctx.hoy || hoy_();
  // Feriados: una frase breve solo cuando corresponde.
  const fer = ctx.feriados || { proximos: [], pendientes: [] }, lim14 = sumarDias_(hoy, 14);
  const prox = (fer.proximos || []).filter(f => f.fecha >= hoy && f.fecha <= lim14 && f.abre && !f.palermo)[0];
  const nPend = (fer.pendientes || []).length;
  const ferProx = prox ? 'Atención, ' + fechaHablada_(prox.fecha) + ' es feriado, ' + prox.nombre + ', hay que confirmar si Palermo abre.' : '';
  const ferPend = nPend ? (nPend === 1 ? 'Hay un feriado pendiente de confirmar si el local abrió.' : 'Hay ' + palabras_(nPend) + ' feriados pendientes de confirmar si el local abrió.') : '';
  // ---- Comercial
  const C = [], Cg = [];   // completo y versión corta para el general
  let mesTxt = '';
  if (com.sinDatos) { C.push('Todavía no hay cierres cargados en la planilla, así que no tengo indicadores comerciales.'); Cg.push(C[0]); }
  else {
    const meses = com.meses || [], actual = meses.find(m => m.enCurso), conDatos = meses.filter(m => m.dias), ref = conDatos[conDatos.length - 1], ult = (com.ultimos || []).slice(-1)[0];
    if (ult) { const s = 'El último cierre es del ' + sinEl_(fechaHablada_(ult.fecha)) + ', con ' + dinero_(ult.total) + (ult.feriado ? ', un día feriado' : '') + '.'; C.push(s); Cg.push(s); }
    if (ref) {
      const s = 'En ' + ref.nombre.split(' ')[0] + ' van ' + dinero_(ref.total) + ' en ' + palabras_(ref.dias) + (ref.dias === 1 ? ' día con cierre' : ' días con cierre') + ', un promedio de ' + dinero_(ref.promDia) + ' por día' +
        (ref.vsAnterior && ref.vsAnterior.deltaPromPct != null ? ', ' + porcentaje_(ref.vsAnterior.deltaPromPct) + ' que en ' + MES_NOM(ref.vsAnterior.mes).split(' ')[0] + '.' : '.');
      C.push(s); Cg.push(s);
      if (ref.diasCerrados && ref.diasCerrados.length) { mesTxt = 'Este mes tuvo ' + (ref.diasCerrados.length === 1 ? 'un día menos de apertura' : palabras_(ref.diasCerrados.length) + ' días menos de apertura') + ' por ' + ref.diasCerrados[0].tipo + '.'; C.push(mesTxt); Cg.push(mesTxt); }
    }
    const sem = (com.semanas || []).filter(s => s.dias >= 1), us = sem[sem.length - 1];
    if (us) C.push('La última semana con ventas, la del ' + sinEl_(fechaHablada_(us.semana)) + ', sumó ' + dinero_(us.total) + (us.deltaPct != null ? ', ' + porcentaje_(us.deltaPct) + ' respecto de la anterior.' : '.'));
    const P = com.proyeccion;
    if (P && P.bloqueada) { const s = 'No proyecto el mes porque hay ' + palabras_(actual.diasSinCierre.length) + ' días de apertura sin cierre cargado.'; C.push(s); Cg.push(s); }
    else if (P) { const s = 'Si se mantiene el ritmo, ' + (actual ? actual.nombre.split(' ')[0] : 'el mes') + ' cerraría cerca de ' + dinero_(P.medio) + ', entre ' + dinero_(P.minimo) + ' y ' + dinero_(P.maximo) + '. Es una estimación.' + (P.objetivo ? ' El objetivo es ' + dinero_(P.objetivo) + ' y el avance real es del ' + palabras_(Math.round(P.avancePct)) + ' por ciento.' : ''); C.push(s); Cg.push(s); }
    const ds = (com.diaSemana || []).filter(d => d.n >= 2), fuerte = ds.slice().sort((a, b) => b.participacion - a.participacion)[0], flojo = ds.slice().sort((a, b) => a.promedio - b.promedio)[0];
    if (fuerte) { const s = 'El día más fuerte es el ' + fuerte.nombre + ', con el ' + palabras_(Math.round(fuerte.participacion)) + ' por ciento de la facturación' + (flojo && flojo.dia !== fuerte.dia ? '; el más flojo, el ' + flojo.nombre + ', con ' + dinero_(flojo.promedio) + ' de promedio.' : '.'); C.push(s); Cg.push(s); }
    if (ref && ref.mix) {
      C.push('En medios de pago: tarjetas ' + palabras_(Math.round(ref.mix.tarjetas)) + ' por ciento, transferencia ' + palabras_(Math.round(ref.mix.transferencia)) + ' y efectivo ' + palabras_(Math.round(ref.mix.efectivo)) + '.');
      const cm = (com.alertas || []).find(a => a.tipo === 'cambio_mix'); if (cm) C.push('Cambio relevante: ' + hablar_(cm.titulo.toLowerCase() + ', ' + cm.observado + ' contra ' + cm.comparado) + '.');
    }
    const recs = (com.recomendaciones || []).slice(0, 2); if (recs.length) C.push('Recomendaciones comerciales: ' + recs.map(r => hablar_(r.titulo).toLowerCase()).join('; ') + '.');
  }
  // ---- Mes bajo (una frase) y acciones
  const mb = com.mesBajo, X = [];
  let bajoTxt = '';
  if (!mb || mb.esBajo == null) bajoTxt = mb && mb.mensaje ? hablar_(mb.mensaje) : 'No hay datos suficientes para evaluar si el mes es bajo.';
  else if (!mb.esBajo) bajoTxt = 'Sin alertas: el mes viene en línea. ' + cap_(mb.nombre.split(' ')[0]) + ' promedia ' + dinero_(mb.promDia) + ' por día de apertura y no queda por debajo del umbral del ' + palabras_(mb.umbralPct) + ' por ciento.';
  else bajoTxt = cap_(mb.nombre.split(' ')[0]) + ' se considera un mes bajo: ' + (mb.criterio === 'promedio' ? 'el promedio por día de apertura es ' + dinero_(mb.promDia) : 'la proyección por día es ' + dinero_(mb.promDiaProyectado)) + ', ' + porcentaje_(mb.deltaPct) + ' que el ' + mb.contra.replace(/\s*\(.*\)/, '') + ', con un umbral del ' + palabras_(mb.umbralPct) + ' por ciento.';
  X.push(bajoTxt);
  const acs = com.accionesComerciales || [];
  if (acs.length) {
    X.push('Las ' + (acs.length >= 3 ? 'tres' : palabras_(acs.length)) + ' acciones principales: ' + acs.slice(0, 3).map((a, i) => palabras_(i + 1) + ', ' + hablar_(a.titulo) + '. ' + hablar_(a.porQue.replace(/^Dato: /, '')) + ' Esfuerzo ' + a.esfuerzo + ', plazo ' + a.plazo + '.').join(' '));
    X.push('El detalle de cada acción, con cómo medirla, está en pantalla.');
  }
  // ---- Auditoría
  const A = [], pend = ctx.pendientes || [], ac = ctx.acciones || {};
  A.push(pend.length ? (pend.length === 1 ? 'Hay un cierre pendiente de carga, el ' + sinEl_(fechaHablada_(pend[0])) + '.' : 'Hay ' + palabras_(pend.length) + ' cierres pendientes de carga; los primeros son ' + pend.slice(0, 3).map(f => sinEl_(fechaHablada_(f))).join(', ') + '.') : 'No hay cierres pendientes de carga en los días de apertura.');
  A.push('Sobre diferencias de caja: la planilla no registra arqueos ni diferencias, así que no puedo informarlas.');
  A.push(ac.abiertas ? 'Observaciones abiertas: ' + palabras_(ac.abiertas) + (ac.abiertas === 1 ? ' acción correctiva abierta' : ' acciones correctivas abiertas') + (ac.vencidas ? ', ' + palabras_(ac.vencidas) + (ac.vencidas === 1 ? ' vencida.' : ' vencidas.') : ', ninguna vencida.') : 'No hay acciones correctivas abiertas.');
  if (aud && aud.ultima) A.push('La última auditoría fue el ' + sinEl_(fechaHablada_(aud.ultima.fecha)) + ', con resultado ' + String(aud.ultima.resultado).toLowerCase() + ', ' + String(aud.ultima.promedio).replace('.', ' coma ') + ' sobre cinco.');
  const recA = (aud && aud.recomendaciones || []).slice(0, 3).map(r => 'Prioridad ' + palabras_(r.prioridad) + ': ' + hablar_(r.queEstaPasando) + ' Acción: ' + hablar_(r.accion));
  const intro = t => hola + t + ' ';
  const comercial = intro('te cuento los indicadores comerciales de Palermo.') + C.join(' ') + (ferProx ? ' ' + ferProx : '');
  const auditoria = intro('te cuento los indicadores de auditoría de Palermo.') + A.concat(recA).join(' ') + (ferPend ? ' ' + ferPend : '');
  const acciones = intro('te cuento las acciones comerciales para Palermo.') + X.join(' ');
  const general = intro('te cuento las últimas novedades de Palermo.') + Cg.join(' ') + ' ' + bajoTxt + ' Ahora, auditoría. ' + A.slice(0, 3).join(' ') + (recA.length ? ' ' + recA[0] : '') +
    (ferProx ? ' ' + ferProx : '') + (ferPend ? ' ' + ferPend : '') + ' Eso es todo por ahora.';
  const limpiar = t => t.replace(/\s+/g, ' ').trim();
  return { saludo: nombre, general: limpiar(general), comercial: limpiar(comercial), auditoria: limpiar(auditoria), acciones: limpiar(acciones) };
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

/* =================== 3.3 · Vacaciones (todo dentro de la app, sin mails) ===================
 * Empleado: usa el mismo usuario + PIN de la fichada; solo ve y cancela lo suyo. Jefes (permiso "vacaciones"): resuelven.
 * El servidor valida dueño y permiso en cada llamada. En la hoja no hay PIN ni mail: solo el usuario (legajo) y el id interno.
 */
const VAC_MAX_DIAS = 60;
const solapa_ = (a1, b1, a2, b2) => a1 <= b2 && a2 <= b1;
function diasVacaciones_(desde, hasta, modo, cal) {
  if (modo === 'apertura') return diasAperturaEfectivos_(desde, hasta, cal).filter(d => !cal.feriado(d)).length;
  return Math.round((new Date(hasta + 'T12:00:00Z') - new Date(desde + 'T12:00:00Z')) / 86400000) + 1;
}
function vacPublica_(v, u, completa) {
  const o = { id: v.id, uid: v.uid, usuario: v.legajo, nombre: u ? u.nombre : v.legajo, desde: v.desde, hasta: v.hasta, dias: v.dias, modoDias: v.modoDias || 'corridos', estado: v.estado,
    solicitado: v.solicitado, decididoPor: v.decididoPor || '', decidido: v.decidido || '', visto: v.visto || '' };
  if (completa) { o.comentario = v.comentario || ''; o.motivo = v.motivo || ''; }   // comentarios y motivos: solo la persona y los jefes
  return o;
}
function misVacaciones(token) {
  const s = sesion_(token), u = s.user, cfg = cfg_(), cal = calendario_(cfg), hoy = hoy_();
  const todas = tAll_('Vacaciones'), users = usuarios_();
  const mias = todas.filter(v => v.uid === u.id).sort((a, b) => b.desde.localeCompare(a.desde)).map(v => vacPublica_(v, u, true));
  // Equipo: solo períodos aprobados de otras personas (nombre y fechas), de 30 días atrás a 6 meses adelante.
  const equipo = todas.filter(v => v.uid !== u.id && v.estado === 'aprobada' && v.hasta >= sumarDias_(hoy, -30) && v.desde <= sumarDias_(hoy, 180))
    .map(v => { const x = users.find(w => w.id === v.uid); return { nombre: x ? x.nombre : v.legajo, desde: v.desde, hasta: v.hasta }; });
  return { hoy: hoy, nombre: u.nombre, mias: mias, novedades: mias.filter(v => (v.estado === 'aprobada' || v.estado === 'rechazada') && !v.visto), equipo: equipo,
    feriados: cal.lista.filter(f => f.fecha >= sumarDias_(hoy, -30) && f.fecha <= sumarDias_(hoy, 400)).map(f => ({ fecha: f.fecha, nombre: f.nombre, tipo: f.tipo })),
    modoDias: cfg.vacacionesDias === 'apertura' ? 'apertura' : 'corridos', diasOperativos: cal.ops, maxDias: VAC_MAX_DIAS };
}
function solicitarVacaciones(token, desde, hasta, comentario) {
  const s = sesion_(token), u = s.user, cfg = cfg_(), cal = calendario_(cfg), hoy = hoy_(), modo = cfg.vacacionesDias === 'apertura' ? 'apertura' : 'corridos';
  desde = fechaOk_(desde); hasta = fechaOk_(hasta); comentario = txt_(comentario, 300);
  if (!desde || !hasta) throw new Error('Elegí el primer y el último día.');
  if (desde < hoy) throw new Error('No se pueden pedir fechas pasadas.');
  if (hasta < desde) throw new Error('El último día tiene que ser igual o posterior al primero.');
  if (diasVacaciones_(desde, hasta, 'corridos', cal) > VAC_MAX_DIAS) throw new Error('El pedido supera los ' + VAC_MAX_DIAS + ' días corridos. Dividilo en dos solicitudes.');
  const dias = diasVacaciones_(desde, hasta, modo, cal);
  if (dias < 1) throw new Error('El período no incluye días de vacaciones: con el modo «días de apertura», elegí al menos un día en que Palermo abra.');
  return lock_(() => {
    const choque = tAll_('Vacaciones').find(v => v.uid === u.id && (v.estado === 'pendiente' || v.estado === 'aprobada') && solapa_(desde, hasta, v.desde, v.hasta));
    if (choque) throw new Error('Ya tenés una solicitud ' + choque.estado + ' del ' + fdm_(choque.desde) + ' al ' + fdm_(choque.hasta) + ' que se superpone.');
    const ts = new Date().toISOString();
    const v = { id: nuevoId_('V'), uid: u.id, legajo: u.legajo, usuario: u.legajo, desde: desde, hasta: hasta, dias: dias, modoDias: modo, comentario: comentario, estado: 'pendiente',
      solicitado: ts, decididoPor: '', decidido: '', motivo: '', visto: '', historial: [{ ts: ts, quien: u.nombre + ' (' + u.legajo + ')', que: 'solicitud' }] };
    tAdd_('Vacaciones', v);
    log_(s, 'vacaciones_solicitud', 'pendiente', v.id, fdm_(desde) + ' → ' + fdm_(hasta) + ' · ' + dias + ' días ' + modo);
    return vacPublica_(v, u, true);
  });
}
function cancelarVacaciones(token, id) {
  const s = sesion_(token), u = s.user, hoy = hoy_();
  return lock_(() => {
    const v = tAll_('Vacaciones').find(x => x.id === String(id || '')); if (!v || v.uid !== u.id) throw new Error('Solicitud no encontrada.');
    if (v.estado === 'aprobada' && v.desde <= hoy) throw new Error('Esas vacaciones aprobadas ya empezaron: hablá con tu jefe para modificarlas.');
    if (v.estado !== 'pendiente' && v.estado !== 'aprobada') throw new Error('Esa solicitud ya está ' + v.estado + '.');
    const antes = v.estado; v.estado = 'cancelada'; v.decidido = new Date().toISOString(); v.decididoPor = u.nombre + ' (' + u.legajo + ')'; v.motivo = 'Cancelada por quien la solicitó';
    v.historial = (v.historial || []).concat([{ ts: v.decidido, quien: v.decididoPor, que: 'cancelada', antes: antes }]);
    tUpd_('Vacaciones', 'id', v.id, v);
    log_(s, 'vacaciones_cancelada', antes, v.id, fdm_(v.desde) + ' → ' + fdm_(v.hasta));
    return vacPublica_(v, u, true);
  });
}
/** La persona marca como vistas sus solicitudes resueltas (salen de "Novedades"). */
function vacacionesVistas(token, ids) {
  const s = sesion_(token), u = s.user;
  ids = Array.isArray(ids) ? ids.map(String).slice(0, 50) : [];
  return lock_(() => {
    let n = 0;
    tAll_('Vacaciones').filter(v => v.uid === u.id && ids.indexOf(v.id) >= 0 && !v.visto && (v.estado === 'aprobada' || v.estado === 'rechazada')).forEach(v => { v.visto = new Date().toISOString(); tUpd_('Vacaciones', 'id', v.id, v); n++; });
    return n;
  });
}
/* ---- Jefes ---- */
function listarVacaciones(token) {
  sesion_(token, 'vacaciones');
  const cfg = cfg_(), cal = calendario_(cfg), hoy = hoy_(), users = usuarios_(), todas = tAll_('Vacaciones'), lim3 = Date.now() - 3 * 86400000;
  const lista = todas.map(v => {
    const u = users.find(x => x.id === v.uid), o = vacPublica_(v, u, true);
    o.demorada = v.estado === 'pendiente' && new Date(v.solicitado).getTime() < lim3;
    o.diasEsperando = v.estado === 'pendiente' ? Math.floor((Date.now() - new Date(v.solicitado).getTime()) / 86400000) : null;
    o.historial = v.historial || [];
    if (v.estado === 'pendiente') {
      // Cobertura (informativa, no bloquea): otras personas con vacaciones aprobadas en esas fechas; feriados o fin de semana largo en el período.
      const otras = todas.filter(w => w.id !== v.id && w.uid !== v.uid && w.estado === 'aprobada' && solapa_(v.desde, v.hasta, w.desde, w.hasta))
        .map(w => { const x = users.find(y => y.id === w.uid); return { nombre: x ? x.nombre : w.legajo, desde: w.desde, hasta: w.hasta }; });
      const fer = cal.lista.filter(f => f.fecha >= v.desde && f.fecha <= v.hasta).map(f => feriadoInfo_(f, cal, null));
      o.cobertura = { otras: otras, feriados: fer, finDeSemanaLargo: fer.some(f => f.finDeSemanaLargo) };
    }
    return o;
  }).sort((a, b) => ((a.estado === 'pendiente' ? 0 : 1) - (b.estado === 'pendiente' ? 0 : 1)) || (a.estado === 'pendiente' ? a.solicitado.localeCompare(b.solicitado) : b.desde.localeCompare(a.desde)));
  return { hoy: hoy, lista: lista, pendientes: lista.filter(v => v.estado === 'pendiente').length, demoradas: lista.filter(v => v.demorada).length,
    feriados: cal.lista.filter(f => f.fecha >= sumarDias_(hoy, -30) && f.fecha <= sumarDias_(hoy, 400)).map(f => ({ fecha: f.fecha, nombre: f.nombre, tipo: f.tipo })),
    diasOperativos: cal.ops, modoDias: cfg.vacacionesDias === 'apertura' ? 'apertura' : 'corridos' };
}
function resolverVacaciones(token, id, aprobar, motivo) {
  const s = sesion_(token, 'vacaciones');
  motivo = txt_(motivo, 300);
  if (!aprobar && !motivo) throw new Error('Para rechazar hay que indicar el motivo.');
  return lock_(() => {
    const v = tAll_('Vacaciones').find(x => x.id === String(id || '')); if (!v) throw new Error('Solicitud no encontrada.');
    if (v.estado !== 'pendiente') throw new Error('La solicitud ya fue resuelta (' + v.estado + ').');
    if (v.uid === s.user.id) throw new Error('No podés resolver tu propia solicitud.');
    v.estado = aprobar ? 'aprobada' : 'rechazada'; v.decididoPor = s.user.nombre + ' (' + s.user.legajo + ')'; v.decidido = new Date().toISOString(); v.motivo = motivo; v.visto = '';
    v.historial = (v.historial || []).concat([{ ts: v.decidido, quien: v.decididoPor, que: v.estado, motivo: motivo }]);
    tUpd_('Vacaciones', 'id', v.id, v);
    const u = usuarios_().find(x => x.id === v.uid);
    log_(s, 'vacaciones_decision', v.estado, v.id, (u ? u.nombre : v.legajo) + ' · ' + fdm_(v.desde) + ' → ' + fdm_(v.hasta) + ' · ' + v.dias + ' días' + (motivo ? ' · ' + motivo : ''));
    return vacPublica_(v, u, true);
  });
}

/* =================== Configuración =================== */
function getConfig(token) {
  sesion_(token, 'config');
  const c = cfg_();
  return Object.assign({}, c, { modulos: MODULOS, permsRol: PERMS_ROL, version: VERSION, cierreSync: JSON.parse(PROPS.getProperty('CIERRE_SYNC') || 'null'),
    ultimaPurga: PROPS.getProperty('ULTIMA_PURGA') || '', feriados: feriadosPanel_(c), sucursales: sucursales_() });
}
function setConfig(token, d) {
  const s = sesion_(token, 'config', true);
  d = d || {};
  const c = cfg_(), antes = JSON.stringify(c);
  if (Array.isArray(d.diasOperativos)) c.diasOperativos = d.diasOperativos.map(Number).filter(n => n >= 0 && n <= 6);
  if (d.local === null) c.local = null;
  else if (d.local && isFinite(d.local.lat) && isFinite(d.local.lng)) c.local = { lat: Math.round(Number(d.local.lat) * 1e6) / 1e6, lng: Math.round(Number(d.local.lng) * 1e6) / 1e6, radio: Math.min(2000, Math.max(30, Math.round(Number(d.local.radio) || c.radioDef))) };
  if (d.fotoIngresoObligatoria != null) c.fotoIngresoObligatoria = !!d.fotoIngresoObligatoria;
  if (d.ubicacionObligatoria != null) c.ubicacionObligatoria = !!d.ubicacionObligatoria;
  if (d.vacacionesDias != null) c.vacacionesDias = d.vacacionesDias === 'apertura' ? 'apertura' : 'corridos';
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
    c.alertasCom = { caidaPct: n(a.caidaPct, 1, 90, 15), mixPp: n(a.mixPp, 1, 60, 10), minDias: Math.round(n(a.minDias, 2, 15, 4)), concentracionPct: n(a.concentracionPct, 26, 90, 45), mesBajoPct: n(a.mesBajoPct, 1, 90, 10) };
  }
  if (d.avisoFotos != null) c.avisoFotos = txt_(d.avisoFotos, 600) || CFG_DEF.avisoFotos;
  if (d.avisoUbicacion != null) c.avisoUbicacion = txt_(d.avisoUbicacion, 600) || CFG_DEF.avisoUbicacion;
  if (d.redondeoMin != null) { const r = Number(d.redondeoMin); if ([1, 5, 10, 15].indexOf(r) < 0) throw new Error('El redondeo puede ser 1, 5, 10 o 15 minutos.'); c.redondeoMin = r; }
  if (d.precisionMax != null) c.precisionMax = Math.min(500, Math.max(20, Math.round(Number(d.precisionMax) || 100)));
  if (d.precisionRevisar != null) c.precisionRevisar = Math.min(c.precisionMax || 100, Math.max(5, Math.round(Number(d.precisionRevisar) || 50)));
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
