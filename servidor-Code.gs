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
const REV = '3.9c';                        // revisión del servidor (para verificar despliegues)

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

const MODULOS = ['ingresos', 'auditar', 'auditoria', 'acciones', 'kpi', 'historial', 'cierre', 'rrhh', 'otros', 'personal', 'config', 'vacaciones', 'clientes', 'produccion', 'finanzas'];   // 3.6: clientes y produccion (un jefe nuevo arranca sin ellas)
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
  Usuarios: ['id', 'legajo', 'nombre', 'sector', 'rol', 'estado', 'registraIngreso', 'fechaIngreso', 'fechaBaja', 'actualizado', 'sucursal', 'horasEsperadas', 'horario', 'vacacionesAnuales'],
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
  Vacaciones: ['id', 'usuario', 'desde', 'hasta', 'dias', 'comentario', 'estado', 'solicitado', 'decididoPor', 'decidido', 'motivo'],
  // 3.9 · Resumen diario de ventas por canal (de Contabilium, solo lectura) y carga manual de Google por local
  VentasCanal: ['clave', 'fecha', 'canal', 'ventas', 'comprobantes', 'nc', 'actualizado'],
  Google: ['id', 'local', 'fecha', 'calificacion', 'resenas', 'respondidas', 'fichaPropia', 'observaciones', 'cargadoPor', 'creado'],
  // 3.9c · Copia de lectura de los comprobantes de venta de Contabilium (0001/0005/0007) desde enero 2026
  Comprobantes: ['clave', 'fecha', 'mes', 'pv', 'tipo', 'numero', 'canal', 'cliente', 'conIva', 'sinIva', 'asociado', 'origen', 'actualizado']
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
  misVacaciones: 1, solicitarVacaciones: 1, cancelarVacaciones: 1, vacacionesVistas: 1, verificarUbicacion: 1, solicitarFichajeManual: 1, misSolicitudes: 1, probarUbicacion: 1 };
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
  probarUbicacion: probarUbicacion, previaBorrado: previaBorrado, borrarFichajes: borrarFichajes, borrarFichaje: borrarFichaje,   // 3.5
  panoramaRRHH: panoramaRRHH, setUmbralesRRHH: setUmbralesRRHH,   // 3.5
  clientesPedidos: clientesPedidos, produccionPanel: produccionPanel, detalleTaller: detalleTaller, vozNeural: vozNeural, contratoSugerido: contratoSugerido, finanzasPanel: finanzasPanel, descargaFinanzas: descargaFinanzas, descargaCyber: descargaCyber, descargaCanales: descargaCanales, guardarGoogle: guardarGoogle, auditoriaSorteo10: auditoriaSorteo10, conectarContabilium: conectarContabilium, descargaControl: descargaControl, actualizarPlanillas: actualizarPlanillas, setTipoCliente: setTipoCliente, permisosJefes: permisosJefes, setPermisoJefe: setPermisoJefe,   // 3.6
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
    sucursal: sucDe_(u), horasEsperadas: u.horasEsperadas || null, horario: u.horario || null, vacacionesAnuales: u.vacacionesAnuales || null,
    contrato: (() => { try { return contrato_(u, sucursales_().find(x => normSuc_(x.nombre) === normSuc_(sucDe_(u)))); } catch (e) { return null; } })() };
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
      const espera = abre ? del.filter(u => !vac(u.id, hoy) && opsDe_(u, x).indexOf(dow_(hoy)) >= 0) : [];   // 3.7: según la contratación de cada una
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
    out.cierre = u ? { fecha: u.fecha, total: u.total, vsDia: vsMismoDia37_(c, u) } : null;
    const desde = new Date(hoy + 'T12:00:00Z'); desde.setUTCDate(desde.getUTCDate() - 14);
    const con = {}; c.forEach(x => { con[x.fecha] = 1; });
    // 3.3: los feriados confirmados cerrados y las excepciones no cuentan; un feriado sin confirmar tampoco es "pendiente" (queda "a confirmar").
    const cal = calendario_(cfg);
    out.diasSinCierre = diasOperativosEntre_(desde.toISOString().slice(0, 10), hoy, cfg.diasOperativos).filter(d => d < hoy && !con[d] && !cal.cerrado(d) && !cal.sinConfirmar(d)).length;
    const cm = c.filter(x => x.fecha.slice(0, 7) === hoy.slice(0, 7));
    out.mes = { total: cm.reduce((a, x) => a + x.total, 0), dias: cm.filter(x => x.total > 0).length, objetivo: (cfg.objetivos || {})[hoy.slice(0, 7)] || null };
    out.clima = clima37_();   // 3.7: pronóstico + aviso de lluvia (la venta puede ser menor)
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
  try { migrarPermisos36_(); } catch (e) {}   // 3.6: caso inicial de permisos por jefe (una sola vez)
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
    const hor = horario_(d.horario);   // 3.7: contratación (días + horario) desde el alta
    const u = { id: nuevoId_('U'), legajo: legajo, nombre: nombre, sector: txt_(d.sector, 40), rol: rol, estado: 'activo', sucursal: suc, horario: hor,
      horasEsperadas: horasEsperadas_(d.horasEsperadas) || (hor ? { tipo: 'dia', horas: Math.round(minHorario_(hor) / 60 * 100) / 100 } : null),
      vacacionesAnuales: Number(d.vacacionesAnuales) > 0 ? Math.min(60, Math.round(Number(d.vacacionesAnuales))) : null,
      registraIngreso: d.registraIngreso !== false, fechaIngreso: fechaOk_(d.fechaIngreso) || hoy_(), salt: salt, pinHash: hashPin_(pin, salt),
      ver: 1, creado: new Date().toISOString(), creadoPor: s.user.nombre };
    guardarUsuario_(u, true);
    log_(s, 'alta_empleado', 'ok', u.id, nombre + ' · ' + legajo + ' · ' + rol + ' · ' + suc + (hor ? ' · ' + (hor.dias ? diasTxt_(hor.dias) : 'días de la sucursal') + ' ' + hor.entrada + '-' + hor.salida : '') + (asignado ? ' · PIN asignado por jefe' : ' · PIN generado'));
    return { user: publico_(u), pinInicial: asignado ? null : pin };
  });
}
function editarEmpleado(token, uid, d) {
  const s = sesion_(token, 'personal');
  d = d || {};
  return lock_(() => {
    const u = usuarios_().find(x => x.id === uid); if (!u) throw new Error('Empleado no encontrado.');
    const resumen = x => [x.nombre, x.sector, x.registraIngreso, x.fechaIngreso, sucDe_(x), x.horasEsperadas ? x.horasEsperadas.horas + ' h/' + x.horasEsperadas.tipo : 'sin horas esperadas', x.horario ? (x.horario.dias ? diasTxt_(x.horario.dias) + ' ' : '') + x.horario.entrada + '-' + x.horario.salida : 'sin horario', x.vacacionesAnuales ? x.vacacionesAnuales + ' días de vacaciones' : ''].join(' / ');
    const antes = resumen(u);
    if (d.nombre != null) u.nombre = txt_(d.nombre, 60) || u.nombre;
    if (d.sucursal != null) u.sucursal = sucursalValida_(d.sucursal);
    if (d.horasEsperadas !== undefined) u.horasEsperadas = horasEsperadas_(d.horasEsperadas);
    if (d.horario !== undefined) {   // 3.7: contratación (días + horario); la carga por día sale del horario si no se cargó otra
      u.horario = horario_(d.horario);
      if (u.horario && !d.horasEsperadas) u.horasEsperadas = { tipo: 'dia', horas: Math.round(minHorario_(u.horario) / 60 * 100) / 100 };
    }
    if (d.vacacionesAnuales !== undefined) { const v = Number(d.vacacionesAnuales); u.vacacionesAnuales = isFinite(v) && v > 0 ? Math.min(60, Math.round(v)) : null; }
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
/* 3.7 · Contratación de cada persona: días que trabaja + horario (entrada y salida). De ahí salen la carga por día, semana y mes,
   los días en que se la espera (no los de la sucursal) y lo esperado contra lo fichado. dias = null → los días de apertura de su sucursal. */
function horario_(h) {
  if (!h || (!h.entrada && !h.salida)) return null;
  const e = horaOk_(h.entrada), x = horaOk_(h.salida);
  if (!e || !x || x <= e) throw new Error('Horario inválido: cargá entrada y salida (HH:MM), con la salida después de la entrada.');
  let dias = null;
  if (Array.isArray(h.dias) && h.dias.length) {
    dias = h.dias.map(Number).filter((d, i, A) => d >= 0 && d <= 6 && Math.floor(d) === d && A.indexOf(d) === i).sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    if (!dias.length) throw new Error('Elegí al menos un día de trabajo.');
  }
  return { entrada: e, salida: x, dias: dias };
}
const minHorario_ = h => h ? Math.round(minDe_(h.salida) - minDe_(h.entrada)) : 0;
/** Días de la semana en que se espera a la persona: los de su contratación o, si no tiene, los de apertura de su sucursal. */
function opsDe_(u, suc) {
  if (u && u.horario && Array.isArray(u.horario.dias) && u.horario.dias.length) return u.horario.dias;
  return suc && suc.dias ? suc.dias : cfg_().diasOperativos;
}
/** 3.7 · Carga inicial (una sola vez, desde el editor) de las contrataciones informadas por la administración (25-oct-2026).
    Solo completa a quien todavía no tiene horario; nunca pisa uno cargado. Queda en el Historial. Devuelve qué hizo con cada persona. */
const CONTRATOS37_ = [
  { re: /^ivana\b/i, suc: /lima/i, h: { entrada: '11:00', salida: '17:00', dias: [1, 2, 3, 4, 5] } },
  { re: /^adri[aá]n\b/i, suc: /lima/i, h: { entrada: '11:00', salida: '17:00', dias: [1, 2, 3, 4, 5] } },
  { re: /^florencia\b/i, suc: /lima/i, h: { entrada: '11:00', salida: '17:00', dias: [0, 1, 2, 3, 4, 6] } },
  { re: /^isabel+a\b/i, suc: /lima/i, h: { entrada: '12:30', salida: '17:00', dias: [1, 2, 3, 4, 5] } },
  { re: /./, suc: /palermo/i, soloEmpleado: true, h: { entrada: '14:00', salida: '20:00', dias: null } }];
/** Al dar de alta: si el nombre y la sucursal coinciden con una contratación ya informada, la app la propone (se puede cambiar). */
function contratoSugerido(token, nombre, sucursal) {
  sesion_(token, 'personal');
  const n = String(nombre || '').trim(), su = String(sucursal || '');
  const c = CONTRATOS37_.find(k => !k.soloEmpleado && k.re.test(n) && k.suc.test(su)) || (n && CONTRATOS37_.find(k => k.soloEmpleado && k.suc.test(su)));
  return c ? { entrada: c.h.entrada, salida: c.h.salida, dias: c.h.dias } : null;
}
function aplicarContratos37() {
  const out = [];
  lock_(() => {
    usuarios_().filter(u => u.estado === 'activo' && u.registraIngreso).forEach(u => {
      const c = CONTRATOS37_.find(k => k.re.test(String(u.nombre || '').trim()) && k.suc.test(sucDe_(u)) && (!k.soloEmpleado || u.rol === 'empleado'));
      if (!c) { out.push(u.nombre + ' (' + sucDe_(u) + '): sin dato informado'); return; }
      if (u.horario) { out.push(u.nombre + ': ya tenía horario, no se toca'); return; }
      u.horario = horario_(c.h); u.horasEsperadas = { tipo: 'dia', horas: Math.round(minHorario_(u.horario) / 60 * 100) / 100 };
      guardarUsuario_(u);
      const t = (u.horario.dias ? diasTxt_(u.horario.dias) : 'días de la sucursal') + ' ' + u.horario.entrada + '-' + u.horario.salida;
      log_(null, 'contratacion_inicial', 'ok', u.id, u.nombre + ' · ' + t);
      out.push(u.nombre + ' (' + sucDe_(u) + '): ' + t);
    });
  });
  Logger.log('CONTRATOS37 ' + JSON.stringify(out));
  return out;
}
/** Carga horaria de la contratación en un mes (AAAA-MM): días a trabajar sin feriados de su sucursal ni vacaciones aprobadas. */
function cargaMes_(u, mes, suc, cal, vac) {
  if (!u.horario) return null;
  const ops = opsDe_(u, suc), md = minHorario_(u.horario), ini = mes + '-01', fin = sumarDias_(sumarDias_(ini, 32).slice(0, 8) + '01', -1);
  let dias = 0;
  for (let d = ini; d <= fin; d = sumarDias_(d, 1)) {
    if (ops.indexOf(dow_(d)) < 0) continue;
    if (u.fechaIngreso && d < u.fechaIngreso) continue;
    if (cal && feriadoSuc_(cal, sucDe_(u), d)) continue;
    if (vac && vac(u.id, d)) continue;
    dias++;
  }
  return { mes: mes, dias: dias, minutos: dias * md };
}
function contrato_(u, suc) {
  if (!u.horario) return null;
  const ops = opsDe_(u, suc), md = minHorario_(u.horario);
  return { entrada: u.horario.entrada, salida: u.horario.salida, dias: ops, diasPropios: !!(u.horario.dias && u.horario.dias.length), diasTxt: diasTxt_(ops),
    minDia: md, minSemana: md * ops.length };
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

/* =================== 3.7 · Voz neural (opcional): Google Cloud Text-to-Speech =================== */
/* Se activa sola cuando la administración guarda la clave en Propiedades del script (TTS_KEY). La clave vive solo en el servidor:
   nunca viaja al teléfono. Sin clave, la app usa la voz del teléfono. Voces por defecto: es-US-Neural2-B (hombre) y es-US-Neural2-A (mujer);
   se pueden cambiar con TTS_VOZ_M / TTS_VOZ_F. */
function vozNeural(token, texto, genero, vel) {
  sesion_(token);
  const key = PROPS.getProperty('TTS_KEY'); if (!key) return { disponible: false };
  const t = String(texto || '').replace(/\s+/g, ' ').trim().slice(0, 9000); if (!t) return { disponible: false };
  const voz = PROPS.getProperty('TTS_VOZ_F') || 'es-US-Neural2-A';   // solo voz femenina
  const rate = { lenta: 0.92, normal: 1.06, rapida: 1.2 }[vel] || 1.06;
  const ora = t.match(/[^.!?]+[.!?]+\s*|[^.!?]+$/g) || [t], partes = []; let b = '';
  ora.forEach(o => { if (Utilities.newBlob(b + o).getBytes().length > 4500 && b) { partes.push(b); b = o; } else b += o; }); if (b) partes.push(b);
  let bytes = [];
  for (let i = 0; i < partes.length; i++) {
    const r = UrlFetchApp.fetch('https://texttospeech.googleapis.com/v1/text:synthesize', { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { 'X-Goog-Api-Key': key }, payload: JSON.stringify({ input: { text: partes[i] }, voice: { languageCode: voz.slice(0, 5), name: voz }, audioConfig: { audioEncoding: 'MP3', speakingRate: rate } }) });
    if (r.getResponseCode() !== 200) { console.warn('vozNeural HTTP ' + r.getResponseCode()); return { disponible: false, error: 'HTTP ' + r.getResponseCode() }; }
    bytes = bytes.concat(Utilities.base64Decode(JSON.parse(r.getContentText()).audioContent));
  }
  return { disponible: true, voz: voz, audio: Utilities.base64Encode(bytes) };
}
/* =================== 3.8 · Dropbox (SOLO LECTURA): planilla financiera «Templete registro actividades» =================== */
/* Conexión privada: una app de Dropbox de la administración con permisos SOLO de lectura (files.content.read, files.metadata.read).
   Propiedades del script (nunca en el código ni en el teléfono): DROPBOX_APP_KEY, DROPBOX_APP_SECRET y, una sola vez, DROPBOX_CODE
   (el código que da Dropbox al autorizar). dropboxConectar() lo cambia por un token de renovación (DROPBOX_REFRESH) y borra el código.
   La app solo DESCARGA el archivo para leerlo: no puede subir, mover, editar ni borrar nada en Dropbox. */
const DBX_ARCHIVO_DEF = '/RESULTADOS/Templete registro actividades - 2026 OK OK.xlsx';   // carpeta compartida (se actualiza con cada carga)
const DBX_ARCHIVO_ALT = '/Templete registro actividades - 2026 OK OK.xlsx';               // respaldo: copia suelta en la raíz
function dbxArchivo_(alt) { return PROPS.getProperty('DROPBOX_ARCHIVO') || (alt ? DBX_ARCHIVO_ALT : DBX_ARCHIVO_DEF); }
/** Link para autorizar (lo abre la administración, con su sesión de Dropbox). La app key no es secreta. */
function dropboxLinkAutorizar() {
  const k = PROPS.getProperty('DROPBOX_APP_KEY'); if (!k) throw new Error('Falta DROPBOX_APP_KEY en Propiedades del script.');
  const u = 'https://www.dropbox.com/oauth2/authorize?client_id=' + encodeURIComponent(k) + '&response_type=code&token_access_type=offline';
  Logger.log('DROPBOX_AUTORIZAR ' + u); return u;
}
/** Cambia el código de autorización (DROPBOX_CODE) por el token de renovación. Se corre una vez desde el editor. */
function dropboxConectar() {
  const k = PROPS.getProperty('DROPBOX_APP_KEY'), sec = PROPS.getProperty('DROPBOX_APP_SECRET'), code = PROPS.getProperty('DROPBOX_CODE');
  if (!k || !sec || !code) throw new Error('Faltan DROPBOX_APP_KEY, DROPBOX_APP_SECRET o DROPBOX_CODE en Propiedades del script.');
  const r = UrlFetchApp.fetch('https://api.dropboxapi.com/oauth2/token', { method: 'post', muteHttpExceptions: true,
    payload: { code: code.trim(), grant_type: 'authorization_code', client_id: k, client_secret: sec } });
  let j = {}; try { j = JSON.parse(r.getContentText()); } catch (e) {}
  if (r.getResponseCode() !== 200 || !j.refresh_token) throw new Error('Dropbox no aceptó el código (HTTP ' + r.getResponseCode() + (j.error_description ? ': ' + j.error_description : '') + '). Generá uno nuevo con el link de autorización.');
  PROPS.setProperty('DROPBOX_REFRESH', j.refresh_token); PROPS.deleteProperty('DROPBOX_CODE');
  if (j.access_token) try { CACHE.put('DBX_TOKEN', j.access_token, Math.max(60, (Number(j.expires_in) || 14400) - 300)); } catch (e) {}
  Logger.log('DROPBOX conectado (scopes: ' + (j.scope || '') + ')');
  return true;
}
function dbxConfigurado_() { return !!(PROPS.getProperty('DROPBOX_REFRESH') && PROPS.getProperty('DROPBOX_APP_KEY') && PROPS.getProperty('DROPBOX_APP_SECRET')); }
function dbxToken_(forzar) {
  if (!forzar) { const c = CACHE.get('DBX_TOKEN'); if (c) return c; }
  if (!dbxConfigurado_()) throw new Error('Dropbox no está conectado todavía.');
  const r = UrlFetchApp.fetch('https://api.dropboxapi.com/oauth2/token', { method: 'post', muteHttpExceptions: true,
    payload: { grant_type: 'refresh_token', refresh_token: PROPS.getProperty('DROPBOX_REFRESH'), client_id: PROPS.getProperty('DROPBOX_APP_KEY'), client_secret: PROPS.getProperty('DROPBOX_APP_SECRET') } });
  let j = {}; try { j = JSON.parse(r.getContentText()); } catch (e) {}
  if (r.getResponseCode() !== 200 || !j.access_token) throw new Error('Dropbox rechazó la conexión (HTTP ' + r.getResponseCode() + '). Puede que se haya revocado el acceso.');
  try { CACHE.put('DBX_TOKEN', j.access_token, Math.max(60, (Number(j.expires_in) || 14400) - 300)); } catch (e) {}
  return j.access_token;
}
/** Descarga (solo lectura) la planilla financiera de Dropbox. Devuelve {blob, modificado, rev}. */
/* Hay dos copias del Templete (carpeta RESULTADOS y raíz del Dropbox): se usa la que se guardó por última vez. Solo lee metadatos. */
function dbxElegirCopia_() {
  if (PROPS.getProperty('DROPBOX_ARCHIVO')) return { alt: false };
  const meta = p => { const r = UrlFetchApp.fetch('https://api.dropboxapi.com/2/files/get_metadata', { method: 'post', muteHttpExceptions: true, contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + dbxToken_() }, payload: JSON.stringify({ path: p }) });
    if (r.getResponseCode() !== 200) return null; try { const j = JSON.parse(r.getContentText()); return { cuando: j.client_modified > j.server_modified ? j.client_modified : j.server_modified, nombre: j.name }; } catch (e) { return null; } };
  try { const a = meta(DBX_ARCHIVO_DEF), b = meta(DBX_ARCHIVO_ALT);
    if (a && b) return { alt: b.cuando > a.cuando, otra: { ruta: b.cuando > a.cuando ? DBX_ARCHIVO_DEF : DBX_ARCHIVO_ALT, modificado: b.cuando > a.cuando ? a.cuando : b.cuando }, usada: b.cuando > a.cuando ? b.cuando : a.cuando };
    return { alt: !a && !!b };
  } catch (e) { return { alt: false }; }
}
function dbxDescargar_() {
  const eleg = dbxElegirCopia_();
  let alt = !!eleg.alt;
  for (let i = 0; i < 3; i++) {
    const r = UrlFetchApp.fetch('https://content.dropboxapi.com/2/files/download', { method: 'post', muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + dbxToken_(i > 0 && !alt), 'Dropbox-API-Arg': JSON.stringify({ path: dbxArchivo_(alt) }).replace(/[\u007f-￿]/g, c => '\\u' + ('000' + c.charCodeAt(0).toString(16)).slice(-4)) } });
    const code = r.getResponseCode();
    if (code === 401 && i === 0) continue;
    if (code === 409 && !alt && !PROPS.getProperty('DROPBOX_ARCHIVO')) { alt = true; continue; }
    if (code === 409) throw new Error('No encuentro el archivo en Dropbox (' + dbxArchivo_(alt) + '). ¿Le cambiaron el nombre o lo movieron?');
    if (code !== 200) throw new Error('Dropbox respondió HTTP ' + code + ' al leer el archivo.');
    let meta = {}; try { meta = JSON.parse(r.getHeaders()['dropbox-api-result'] || r.getHeaders()['Dropbox-API-Result'] || '{}'); } catch (e) {}
    return { blob: r.getBlob(), modificado: eleg.usada || meta.server_modified || null, rev: meta.rev || null, nombre: meta.name || dbxArchivo_(alt), ruta: dbxArchivo_(alt), otraCopia: eleg.otra || null };
  }
}
/** Diagnóstico (desde el editor, solo lee): hojas, filas y ENCABEZADOS de texto (sin números) para mapear pagos, ventas y egresos. */
function dropboxProbar() {
  const out = { conectado: dbxConfigurado_(), archivo: dbxArchivo_() };
  if (!out.conectado) { Logger.log('DBX ' + JSON.stringify(out)); return out; }
  const d = dbxDescargar_(); out.modificado = d.modificado; out.bytes = d.blob.getBytes().length;
  const hojas = leerXlsx_(d.blob);
  out.hojas = hojas.map(h => {
    const refs = Object.keys(h.celdas), filas = {}; let maxF = 0, maxC = '';
    refs.forEach(r => { const m = r.match(/^([A-Z]+)(\d+)$/), f = Number(m[2]); if (f > maxF) maxF = f; if (m[1].length > maxC.length || (m[1].length === maxC.length && m[1] > maxC)) maxC = m[1];
      if (typeof h.celdas[r] === 'string' && f <= 12) (filas[f] = filas[f] || []).push(m[1] + ':' + String(h.celdas[r]).slice(0, 40)); });
    return { nombre: h.nombre, celdas: refs.length, ultimaFila: maxF, ultimaCol: maxC, textosFilas1a12: filas };
  });
  Logger.log('DBX ' + JSON.stringify(out).slice(0, 8500));
  return out;
}
/* =================== 3.8 · Finanzas Hey Blackk (planilla «Templete registro actividades», Dropbox, SOLO LECTURA) =================== */
/* Se lee la hoja «Data» (encabezado en la fila 4): B Fecha factura · D Mes devengado (aa-mm) · E Detalle · F Tipo (Ingreso/Egreso) ·
   G Rubro · H Cuenta · I Cliente/Proveedor · K Punto de venta · M Nro factura · N Monto transacción · O Medio de pago · P Monto sin IVA.
   Solo se parsea esa hoja (la planilla tiene ~1 millón de filas con formato): rápido y sin tocar el archivo. */
function finNorm_(t) { return String(t == null ? '' : t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ()]/g, ' ').replace(/\s+/g, ' ').trim(); }
function finSerial_(v) { if (typeof v !== 'number' || v < 20000 || v > 80000) return null; const d = new Date(Math.round((v - 25569) * 86400000)); return d.toISOString().slice(0, 10); }
function finMes_(v, fecha) {
  if (typeof v === 'number') { const f = finSerial_(v); return f ? f.slice(0, 7) : null; }
  const m = String(v || '').trim().match(/^(\d{2}|\d{4})[-\/](\d{1,2})$/);
  if (m) return (m[1].length === 2 ? '20' + m[1] : m[1]) + '-' + ('0' + m[2]).slice(-2);
  return fecha ? fecha.slice(0, 7) : null;
}
/** Lee solo la hoja «Data» del .xlsx. Devuelve las filas con tipo y monto. */
function finLeerData_(blob) {
  blob.setContentType('application/zip');
  const partes = {}; Utilities.unzip(blob).forEach(b => { partes[b.getName()] = b; });
  const str = n => partes[n] ? partes[n].getDataAsString('UTF-8') : '';
  const wb = str('xl/workbook.xml'), rels = str('xl/_rels/workbook.xml.rels');
  const sh = (wb.match(/<sheet [^>]*name="Data"[^>]*\/>/) || [])[0]; if (!sh) throw new Error('La planilla no tiene la hoja «Data».');
  const rid = (sh.match(/r:id="([^"]+)"/) || [])[1], tgt = ((rels.match(new RegExp('<Relationship [^>]*Id="' + rid + '"[^>]*>')) || [])[0] || '').match(/Target="([^"]+)"/);
  const xml = str(tgt ? tgt[1].replace(/^\/?(xl\/)?/, 'xl/') : '');
  const hojaXml = nombre => { const t = (wb.match(new RegExp('<sheet [^>]*name="' + nombre + '\\s*"[^>]*/>', 'i')) || [])[0]; if (!t) return '';
    const id = (t.match(/r:id="([^"]+)"/) || [])[1], g = ((rels.match(new RegExp('<Relationship [^>]*Id="' + id + '"[^>]*>')) || [])[0] || '').match(/Target="([^"]+)"/);
    return str(g ? g[1].replace(/^\/?(xl\/)?/, 'xl/') : ''); };
  const shared = []; (str('xl/sharedStrings.xml').match(/<si>[\s\S]*?<\/si>/g) || []).forEach(si => shared.push(xmlTexto_((si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || []).map(t => t.replace(/<t[^>]*>|<\/t>/g, '')).join(''))));
  const COLS = { B: 'fechaF', C: 'fechaP', D: 'mes', E: 'detalle', F: 'tipo', G: 'rubro', H: 'cuenta', I: 'contraparte', K: 'pv', M: 'factura', N: 'monto', O: 'medio', P: 'sinIva' };
  const out = [];
  const reRow = /<row [^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g; let m;
  while ((m = reRow.exec(xml))) {
    if (Number(m[1]) < 5) continue;
    const o = {}; let hay = false;
    (m[2].match(/<c [^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) || []).forEach(c => {
      const ref = (c.match(/ r="([A-Z]+)\d+"/) || [])[1], k = COLS[ref]; if (!k) return;
      const t = (c.match(/ t="([^"]+)"/) || [])[1], v = (c.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      let val = null;
      if (t === 's' && v != null) val = shared[Number(v)]; else if (t === 'inlineStr') val = xmlTexto_(((c.match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1]) || '');
      else if (t === 'str' && v != null) val = xmlTexto_(v); else if (v != null && v !== '') val = isNaN(Number(v)) ? xmlTexto_(v) : Number(v);
      if (val !== null && val !== '') { o[k] = val; hay = true; }
    });
    if (!hay || !/^(ingreso|egreso)$/i.test(String(o.tipo || '').trim())) continue;
    const fecha = finSerial_(o.fechaF) || finSerial_(o.fechaP);
    out.push({ fila: Number(m[1]), fecha: fecha, mes: finMes_(o.mes, fecha), tipo: /^i/i.test(String(o.tipo).trim()) ? 'ingreso' : 'egreso',
      rubro: String(o.rubro || 'Sin rubro').trim(), cuenta: String(o.cuenta || 'Sin cuenta').trim(), contraparte: String(o.contraparte || '').trim(),
      detalle: String(o.detalle || '').trim().slice(0, 120), pv: String(o.pv || '').trim(), factura: String(o.factura || '').trim(), medio: String(o.medio || '').trim(),
      monto: Math.abs(Number(o.monto) || 0), sinIva: Number(o.sinIva) || 0 });
  }
  try { out.stock = finLeerCierre_(hojaXml('cierre'), shared); } catch (e) { out.stock = null; }
  out.ultimaCarga = out.reduce((a, x) => x.fecha && x.fecha > a ? x.fecha : a, '');
  return out;
}
/** Hoja «cierre» (solo lectura): mercadería valorizada por local al cierre de cada mes (fila «TOTAL Inventarios»). Toma el último mes cargado. */
function finLeerCierre_(xml, shared) {
  if (!xml) return null;
  const celdas = {}; let m; const re = /<c [^>]*?r="([A-Z]+)(\d+)"[^>]*?(?:\/>|>([\s\S]*?)<\/c>)/g;
  while ((m = re.exec(xml))) { if (Number(m[2]) > 40 || !m[3]) continue; const v = (m[3].match(/<v>([\s\S]*?)<\/v>/) || [])[1]; if (v == null) continue;
    const t = (m[0].match(/ t="([^"]+)"/) || [])[1]; celdas[m[1] + m[2]] = t === 's' ? shared[Number(v)] : (t === 'str' ? xmlTexto_(v) : Number(v)); }
  const filaDe = txt => { for (let f = 1; f <= 40; f++) if (finNorm_(celdas['A' + f]) === finNorm_(txt)) return f; return 0; };
  const fT = filaDe('TOTAL Inventarios'); if (!fT) return null;
  const COLS = 'BCDEFGHIJKLM'.split(''); let col = null, mesIdx = -1;
  COLS.forEach((c, i) => { if (typeof celdas[c + fT] === 'number' && celdas[c + fT] > 0) { col = c; mesIdx = i; } });
  if (!col) return null;
  const locales = [];
  for (let f = fT - 8; f < fT; f++) { const n = String(celdas['A' + f] || ''); const mm = n.match(/Inventarios\s*-\s*(.+)$/i);
    if (mm && typeof celdas[col + f] === 'number' && celdas[col + f] > 0) locales.push({ nombre: mm[1].trim().replace(/^LP$/i, 'La Plata').replace(/^MIA$/i, 'Miami').toLowerCase().replace(/(^| )\S/g, x => x.toUpperCase()), monto: celdas[col + f] }); }
  const previo = mesIdx > 0 && typeof celdas[COLS[mesIdx - 1] + fT] === 'number' ? celdas[COLS[mesIdx - 1] + fT] : null;
  return { mesNum: mesIdx + 1, total: celdas[col + fT], previo: previo, locales: locales.sort((a, b) => b.monto - a.monto) };
}
/** Plata corta para leer rápido: «$ 99,6 M». */
const $M_ = n => Math.abs(n) >= 1e6 ? '$ ' + (n / 1e6).toFixed(1).replace('.', ',') + ' M' : $_(n);
/* Franquicias. Por cliente/pagador (reglas estrictas: hay clientas que se llaman «Rosario» o se apellidan «Córdoba»):
   La Plata = Carolina No Look · Rosario = María Sabetta · Uruguay = Joaquín · Córdoba = Martina Eizikovits.
   En el DETALLE de un anticipo («Anticipo temporada SS27- Rosario») alcanza con el nombre de la plaza. */
const FIN_FRANQ = [['Miami', /laghezza|\(\s*miami\s*\)|miami/], ['La Plata', /la plata|no look|no loock/], ['Rosario', /sabetta|\(\s*rosario\s*\)|franquicia rosario/], ['Uruguay', /uruguay/], ['Córdoba', /eizikovit|\(\s*cordoba\s*\)|franquicia cordoba/]];
const FIN_FRANQ_DET = [['Miami', /miami|laghezza/], ['La Plata', /la plata|no look/], ['Rosario', /rosario|sabetta/], ['Uruguay', /uruguay/], ['Córdoba', /cordoba|eizikovit/]];
const finFranq_ = c => { const n = finNorm_(c); const f = FIN_FRANQ.find(x => x[1].test(n)); return f ? f[0] : null; };
const finFranqX_ = x => finFranq_(x.contraparte) || (/anticip|temporada|ss2\d/i.test(x.detalle) ? (n => { const f = FIN_FRANQ_DET.find(y => y[1].test(n)); return f ? f[0] : null; })(finNorm_(x.detalle)) : null);
const finCli_ = c => { const n = finNorm_(c).replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim(); return n ? n.replace(/(^| )\S/g, x => x.toUpperCase()) : 'Sin nombre'; };
/** Resumen financiero: meses, semanas, rubros, cuentas, canales, clientes, franquicias, retiros de socios y alertas. */
function finResumen_(F, hoy) {
  hoy = hoy || hoy_(); const mesHoy = hoy.slice(0, 7);
  const validas = F.filter(x => x.mes && x.mes <= mesHoy), futuras = F.filter(x => x.mes && x.mes > mesHoy), sinMes = F.filter(x => !x.mes);
  const anio = mesHoy.slice(0, 4), delAnio = validas.filter(x => x.mes.slice(0, 4) === anio);
  const meses = {}; validas.forEach(x => { const M = meses[x.mes] = meses[x.mes] || { mes: x.mes, ingresos: 0, egresos: 0, ventas: 0, retiros: 0, filas: 0 };
    M[x.tipo === 'ingreso' ? 'ingresos' : 'egresos'] += x.monto; M.filas++;
    if (x.tipo === 'ingreso' && /^ventas$/i.test(x.rubro)) M.ventas += x.monto;
    if (x.tipo === 'egreso' && /^caja$/i.test(x.rubro)) M.retiros += x.monto; });
  const L = Object.keys(meses).sort().map(k => { const M = meses[k]; M.neto = M.ingresos - M.egresos; M.operativo = M.ingresos - (M.egresos - M.retiros); return M; });
  const cerrados = L.filter(M => M.mes < mesHoy), ult = cerrados[cerrados.length - 1] || null, enCurso = L.find(M => M.mes === mesHoy) || null;
  const prev3 = cerrados.slice(-4, -1), prom = k => prev3.length ? prev3.reduce((a, M) => a + M[k], 0) / prev3.length : null;
  // Semanas (por fecha de factura), últimas 10
  const lunes = f => { const d = new Date(f + 'T12:00:00Z'), w = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - w); return d.toISOString().slice(0, 10); };
  const desdeS = lunes(sumarDias_(hoy, -69)), sem = {};
  validas.filter(x => x.fecha && x.fecha >= desdeS && x.fecha <= hoy).forEach(x => { const w = lunes(x.fecha); const S = sem[w] = sem[w] || { semana: w, ingresos: 0, egresos: 0 }; S[x.tipo === 'ingreso' ? 'ingresos' : 'egresos'] += x.monto; });
  const semanas = Object.keys(sem).sort().map(k => sem[k]);
  // Rubros y cuentas (egresos): año y último mes cerrado
  const agrupa = (lista, kf) => { const o = {}; lista.forEach(x => { const k = kf(x); o[k] = (o[k] || 0) + x.monto; }); return Object.keys(o).map(k => ({ nombre: k, monto: o[k] })).sort((a, b) => b.monto - a.monto); };
  const egA = delAnio.filter(x => x.tipo === 'egreso'), egU = ult ? validas.filter(x => x.tipo === 'egreso' && x.mes === ult.mes) : [];
  const ctaK = x => /^ventas$/i.test(x.rubro) ? 'Devoluciones y ajustes de ventas' : x.cuenta;
  const rubrosAnio = agrupa(egA, x => x.rubro), cuentasUlt = agrupa(egU, ctaK).slice(0, 5);
  const cuentasPrev = {}; validas.filter(x => x.tipo === 'egreso' && prev3.some(M => M.mes === x.mes)).forEach(x => { cuentasPrev[ctaK(x)] = (cuentasPrev[ctaK(x)] || 0) + x.monto / Math.max(1, prev3.length); });
  cuentasUlt.forEach(c => { c.promedio = cuentasPrev[c.nombre] || 0; c.vsPromPct = c.promedio ? Math.round((c.monto / c.promedio - 1) * 100) : null; });
  // Ventas por canal (punto de venta) y clientes
  const ventasA = delAnio.filter(x => x.tipo === 'ingreso' && /^ventas$/i.test(x.rubro));
  const canales = agrupa(ventasA, x => finPvNom_(finClave_(x.factura), x.pv) || (/anticipo/i.test(x.cuenta + ' ' + x.detalle) ? 'Anticipos de temporada' : 'Sin número de factura'));
  const clientes = agrupa(ventasA, x => finFranqX_(x) ? finFranqX_(x) + ' (gran cuenta)' : finCli_(x.contraparte)).slice(0, 5);
  // Franquicias: lo cobrado a cada una (ingresos cuyo cliente coincide)
  const franq = {}; validas.filter(x => x.tipo === 'ingreso' && finFranqX_(x)).forEach(x => { const k = finFranqX_(x), f = franq[k] = franq[k] || { franquicia: k, cobrado: 0, cobradoAnio: 0, ultimo: null, porMes: {} };
    f.cobrado += x.monto; if (x.mes.slice(0, 4) === anio) f.cobradoAnio += x.monto; f.porMes[x.mes] = (f.porMes[x.mes] || 0) + x.monto; if (x.fecha && (!f.ultimo || x.fecha > f.ultimo)) f.ultimo = x.fecha; });
  // Retiros de socios (rubro Caja), por cuenta, en el año
  const retiros = agrupa(delAnio.filter(x => x.tipo === 'egreso' && /^caja$/i.test(x.rubro)), x => /^dividendos\s*$/i.test(x.cuenta) ? 'Dividendos sin asignar a un socio' : x.cuenta);
  const alertas = [];
  if (ult && ult.neto < 0) alertas.push({ nivel: 'rojo', texto: 'En ' + MES_NOM(ult.mes).split(' ')[0] + ' salió más plata de la que entró: salieron ' + $M_(ult.egresos) + ' y entraron ' + $M_(ult.ingresos) + '. Faltaron ' + $M_(-ult.neto) + '.' });
  cuentasUlt.filter(c => c.vsPromPct != null && c.vsPromPct >= 40 && c.monto >= 1000000 && c.promedio >= 1000000).slice(0, 2).forEach(c => alertas.push({ nivel: 'amarillo', texto: 'Se gastó más de lo normal en ' + c.nombre.toLowerCase() + ': ' + $M_(c.monto) + ' en ' + MES_NOM(ult.mes).split(' ')[0] + ', ' + c.vsPromPct + ' % más que el promedio de los 3 meses anteriores.' }));
  const devol = ult ? validas.filter(x => x.tipo === 'egreso' && /^ventas$/i.test(x.rubro) && x.mes === ult.mes && x.monto >= 1000000) : [];
  devol.slice(0, 2).forEach(x => alertas.push({ nivel: 'amarillo', texto: 'Hay una salida de ' + $M_(x.monto) + ' cargada como «venta»' + (x.contraparte ? ' (' + finCli_(x.contraparte) + ')' : '') + ' en ' + MES_NOM(ult.mes).split(' ')[0] + '. Conviene revisar si es una devolución o un error de carga.' }));
  if (futuras.length) alertas.push({ nivel: 'amarillo', texto: futuras.length + (futuras.length === 1 ? ' movimiento tiene' : ' movimientos tienen') + ' fecha futura (' + Array.from(new Set(futuras.map(x => MES_NOM(x.mes)))).slice(0, 3).join(', ') + '): seguramente es un error de tipeo en la planilla. Quedan afuera de las cuentas.' });
  if (sinMes.length) alertas.push({ nivel: 'amarillo', texto: sinMes.length + ' movimientos no tienen mes ni fecha: quedan afuera de las cuentas.' });
  const recomendaciones = [];
  if (cuentasUlt[0]) recomendaciones.push('Mirar en detalle lo que se pagó en ' + cuentasUlt[0].nombre.toLowerCase() + ': fue el gasto más grande de ' + MES_NOM(ult.mes).split(' ')[0] + ' (' + $M_(cuentasUlt[0].monto) + ').');
  const fr = Object.keys(franq).map(k => franq[k]).sort((a, b) => (a.ultimo || '').localeCompare(b.ultimo || ''));
  if (fr[0] && fr[0].ultimo && fr[0].ultimo < sumarDias_(hoy, -30)) recomendaciones.push('Llamar a la gran cuenta de ' + fr[0].franquicia + ' para cobrar: su último pago cargado es del ' + fdm_(fr[0].ultimo) + '.');
  // ---- Panel del jefe (palabras simples): a dónde va la plata, cuánto hay que vender para no perder, semáforo y mercadería ----
  const GRUPO = r => /^ventas$/i.test(r) ? 'devol' : /^costos?_directos$/i.test(r) ? 'ropa' : /^gtos_admin$/i.test(r) ? 'empresa' : /^gtos_comerciales$/i.test(r) ? 'vender' : /^impuestos$/i.test(r) ? 'impuestos' : /^caja$/i.test(r) ? 'socios' : 'otros';
  const GRUPO_TXT = { ropa: 'Hacer la ropa (talleres, telas, insumos, envíos)', empresa: 'Mantener la empresa (sueldos, alquileres, bancos)', vender: 'Vender y hacer publicidad', impuestos: 'Impuestos', socios: 'Retiros de los socios', devol: 'Devoluciones y ajustes de ventas', otros: 'Otros gastos' };
  const destinoDe = lista => { const o = {}; lista.filter(x => x.tipo === 'egreso').forEach(x => { const g = GRUPO(x.rubro); o[g] = (o[g] || 0) + x.monto; });
    const ent = lista.filter(x => x.tipo === 'ingreso').reduce((a, x) => a + x.monto, 0);
    return Object.keys(o).map(g => ({ grupo: g, nombre: GRUPO_TXT[g], monto: o[g], cada100: ent ? Math.round(o[g] / ent * 100) : null })).sort((a, b) => b.monto - a.monto); };
  const destinoAnio = destinoDe(delAnio), destinoMes = ult ? destinoDe(validas.filter(x => x.mes === ult.mes)) : [];
  // Todos los meses del año hasta hoy (el mes en curso, parcial)
  const destinoMeses = Array.from(new Set(delAnio.map(x => x.mes))).filter(m => m <= mesHoy).sort().map(m => ({ mes: m, enCurso: m === mesHoy, lista: destinoDe(delAnio.filter(x => x.mes === m)) })).filter(d => d.lista.length);
  // Punto de equilibrio con los 3 últimos meses cerrados: gastos fijos por mes ÷ (1 − parte de cada venta que se va en hacer la ropa)
  const ult3 = cerrados.slice(-3), en3 = validas.filter(x => ult3.some(M => M.mes === x.mes));
  const sum3 = f => en3.filter(f).reduce((a, x) => a + x.monto, 0);
  const ent3 = sum3(x => x.tipo === 'ingreso'), ropa3 = sum3(x => x.tipo === 'egreso' && GRUPO(x.rubro) === 'ropa');
  const fijos3 = sum3(x => x.tipo === 'egreso' && /^(empresa|vender|impuestos|otros)$/.test(GRUPO(x.rubro)));
  const pctRopa = ent3 ? ropa3 / ent3 : null, fijosMes = ult3.length ? fijos3 / ult3.length : null;
  const equilibrio = (pctRopa != null && pctRopa < 0.95 && fijosMes) ? { necesario: fijosMes / (1 - pctRopa), fijosMes: fijosMes, ropaCada100: Math.round(pctRopa * 100),
    conSocios: (fijosMes + (ult3.length ? sum3(x => x.tipo === 'egreso' && GRUPO(x.rubro) === 'socios') / ult3.length : 0)) / (1 - pctRopa),
    vendido: ult ? ult.ingresos : 0, mes: ult ? ult.mes : null, meses: ult3.map(M => M.mes) } : null;
  // Semáforo del último mes cerrado
  let semaforo = null;
  if (ult) { const sinSocios = ult.operativo;
    semaforo = ult.neto >= 0 ? { color: 'verde', titulo: 'Mes positivo', texto: 'En ' + MES_NOM(ult.mes).split(' ')[0] + ' entró más plata de la que salió.' }
      : sinSocios >= 0 ? { color: 'amarillo', titulo: 'Justo', texto: 'El negocio cubrió sus gastos, pero con los retiros de los socios salió más plata de la que entró.' }
      : { color: 'rojo', titulo: 'Mes en rojo', texto: 'En ' + MES_NOM(ult.mes).split(' ')[0] + ' salió más plata de la que entró, aun sin contar los retiros de los socios.' }; }
  const conNeto = L.filter(M => M.mes < mesHoy && M.mes.slice(0, 4) === anio);
  const mejor = conNeto.slice().sort((a, b) => b.neto - a.neto)[0] || null, peor = conNeto.slice().sort((a, b) => a.neto - b.neto)[0] || null;
  const ventasMax = conNeto.slice().sort((a, b) => b.ingresos - a.ingresos)[0] || null;
  if (equilibrio && ult && ult.ingresos < equilibrio.necesario) recomendaciones.unshift('Vender más o bajar gastos: para no perder plata hacen falta unos ' + $M_(Math.round(equilibrio.necesario / 1e5) * 1e5) + ' por mes y en ' + MES_NOM(ult.mes).split(' ')[0] + ' entraron ' + $M_(ult.ingresos) + '.');
  const stock = F.stock ? Object.assign({}, F.stock, { mes: anio + '-' + ('0' + F.stock.mesNum).slice(-2) }) : null;
  if (stock && stock.mes < (ult ? ult.mes : mesHoy)) recomendaciones.push('Actualizar el valor de la mercadería en la hoja «cierre»: el último dato cargado es de ' + MES_NOM(stock.mes).split(' ')[0] + '.');
  const simple = { destinoAnio: destinoAnio, destinoMes: destinoMes, destinoMeses: destinoMeses, equilibrio: equilibrio, semaforo: semaforo, mejor: mejor, peor: peor, ventasMax: ventasMax, stock: stock, ultimaCarga: F.ultimaCarga || null };
  return { mesHoy: mesHoy, anio: anio, meses: L, ultimoCerrado: ult, enCurso: enCurso, simple: simple,
    promedio3: prev3.length ? { ingresos: prom('ingresos'), egresos: prom('egresos'), neto: prom('neto'), ventas: prom('ventas') } : null,
    anioTotales: { ingresos: delAnio.filter(x => x.tipo === 'ingreso').reduce((a, x) => a + x.monto, 0), egresos: egA.reduce((a, x) => a + x.monto, 0), ventas: ventasA.reduce((a, x) => a + x.monto, 0),
      retiros: retiros.reduce((a, r) => a + r.monto, 0) },
    semanas: semanas, rubrosAnio: rubrosAnio, cuentasUltimoMes: cuentasUlt, canales: canales, topClientes: clientes,
    franquicias: Object.keys(franq).map(k => { const f = franq[k]; return { franquicia: f.franquicia, cobrado: f.cobrado, cobradoAnio: f.cobradoAnio, ultimo: f.ultimo, ultimoMes: ult ? (f.porMes[ult.mes] || 0) : 0 }; }).sort((a, b) => b.cobradoAnio - a.cobradoAnio),
    retiros: retiros, filas: F.length, fuera: futuras.length + sinMes.length, alertas: alertas, recomendaciones: recomendaciones };
}
/* =================== 3.8 · Anticipos de temporada por cliente (SOLO usuario MARIA) =================== */
/* Anticipos = ingresos del Templete con cuenta «Anticipos» o detalle «Anticipo…». El cliente sale del detalle («Anticipo temporada SS27- La Plata»),
   no de quien pagó (a veces paga un tercero). Se cruzan con el pedido y lo abonado según «Control ingreso Nueva temporada 27». */
function finAnticipos_(F) {
  const A = F.filter(x => !x.origen && x.tipo === 'ingreso' && (/anticipo/i.test(x.cuenta) || /anticip/i.test(x.detalle)));
  const cli = {};
  A.forEach(x => { const k = finFranqX_(x) || finCli_(x.contraparte), C = cli[k] = cli[k] || { cliente: k, anticipado: 0, pagos: [], avisos: [] };
    C.anticipado += x.monto; C.pagos.push({ fecha: x.fecha, mes: x.mes, monto: x.monto, pagador: finCli_(x.contraparte), medio: x.medio || '', detalle: x.detalle, fila: x.fila }); });
  let ped = []; try { ped = (control_(false).clientes || []).filter(c => c.seCuenta !== false).map(c => ({ cliente: finFranq_(c.nombre) || c.nombre, nombre: c.nombre, tipo: c.tipo,
    pedido: c.montoTotal || c.monto || 0, pagadoPlanilla: c.pagado != null ? c.pagado : null })); } catch (e) {}
  ped.forEach(p => { const C = cli[p.cliente] = cli[p.cliente] || { cliente: p.cliente, anticipado: 0, pagos: [], avisos: [] };
    C.pedido = (C.pedido || 0) + p.pedido; C.tipo = p.tipo; if (p.pagadoPlanilla != null) C.pagadoPlanilla = (C.pagadoPlanilla || 0) + p.pagadoPlanilla; });
  const anio = hoy_().slice(0, 4), fac = {};
  F.filter(x => !x.origen && x.tipo === 'ingreso' && /^ventas$/i.test(x.rubro) && !(/anticipo/i.test(x.cuenta) || /anticip/i.test(x.detalle)) && x.mes && x.mes.slice(0, 4) === anio)
    .forEach(x => { const k = finFranqX_(x); if (k) { const f = fac[k] = fac[k] || { monto: 0, ultimo: null }; f.monto += x.monto; if (x.fecha && (!f.ultimo || x.fecha > f.ultimo)) f.ultimo = x.fecha; } });
  const L = Object.keys(cli).map(k => cli[k]);
  L.forEach(C => { if (fac[C.cliente]) { C.facturasAnio = fac[C.cliente].monto; C.ultimaFactura = fac[C.cliente].ultimo; } });
  L.forEach(C => {
    C.pagos.sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
    const vistos = {}; C.pagos.forEach(p => { const key = p.fecha + '|' + Math.round(p.monto); if (vistos[key]) C.avisos.push('Dos pagos iguales el mismo día (' + fdm_(p.fecha) + ', ' + $M_(p.monto) + ', filas ' + vistos[key] + ' y ' + p.fila + '): confirmá que no esté cargado dos veces.'); else vistos[key] = p.fila; });
    const sinMedio = C.pagos.filter(p => !p.medio || /^medio de pago$/i.test(p.medio)); if (sinMedio.length) C.avisos.push(sinMedio.length + ' pago(s) sin medio de pago cargado (filas ' + sinMedio.map(p => p.fila).join(', ') + ').');
    const terceros = Array.from(new Set(C.pagos.map(p => p.pagador).filter(n => n && !finFranq_(n)))); if (terceros.length) C.terceros = terceros;
    if (C.pedido) { C.saldo = Math.max(0, C.pedido - C.anticipado); C.pct = Math.round(C.anticipado / C.pedido * 100); if (!C.anticipado) C.avisos.unshift('Tiene pedido de ' + $M_(C.pedido) + ' y no figura ningún anticipo de temporada en el Templete' + (C.facturasAnio ? ' (en el año pagó ' + $M_(C.facturasAnio) + ' en facturas, la última el ' + fdm_(C.ultimaFactura) + ').' : '.')); }
    if (C.pagadoPlanilla != null && Math.abs(C.pagadoPlanilla - C.anticipado) > Math.max(10000, C.anticipado * 0.01))
      C.avisos.push('No coincide con «Control ingreso»: ahí figura abonado ' + $M_(C.pagadoPlanilla) + ' y en el Templete ' + $M_(C.anticipado) + '.');
  });
  L.sort((a, b) => (b.pedido || b.anticipado) - (a.pedido || a.anticipado));
  return { clientes: L, total: L.reduce((a, c) => a + c.anticipado, 0), pedidos: L.reduce((a, c) => a + (c.pedido || 0), 0), saldo: L.reduce((a, c) => a + (c.saldo || 0), 0) };
}
/* =================== 3.8 · Ventas facturadas: Contabilium (COT, SOLO LECTURA) ↔ Templete =================== */
/* Puntos de venta: 0001 Palermo · 0005 Lima · 0007 Janette. Las ventas se facturan como COT; las notas de crédito (total o parcial)
   se descuentan de la factura a la que están asociadas. Conciliación por número de factura (PPPP-NNNNNNNN):
   - factura en Contabilium y en el Templete → conciliada (se cuenta UNA sola vez, con el importe del Templete);
   - factura solo en Contabilium → «falta cargar»: se suma al mes en el panel hasta que se cargue en el Templete (nunca se duplica);
   - factura solo en el Templete → se avisa (no está en Contabilium o es de otro período). */
const FIN_PV = { '0001': 'Palermo', '0005': 'Lima', '0007': 'Janette' };
function finClave_(t) { const m = String(t == null ? '' : t).match(/(\d{1,5})\s*-\s*(\d{1,8})/); return m ? ('0000' + m[1]).slice(-4) + '-' + ('0000000' + m[2]).slice(-8) : ''; }
function finPvNom_(clave, pvTxt) {
  const n = FIN_PV[String(clave || '').slice(0, 4)]; if (n) return n;
  const t = finNorm_(pvTxt); return /palermo/.test(t) ? 'Palermo' : /lima/.test(t) ? 'Lima' : /jan/.test(t) ? 'Janette' : '';
}
const finMesAnt_ = m => { const y = Number(m.slice(0, 4)), mm = Number(m.slice(5, 7)); return mm === 1 ? (y - 1) + '-12' : y + '-' + ('0' + (mm - 1)).slice(-2); };
/** Control del Templete: la misma factura cargada dos veces (mismo cliente) o el mismo número usado para clientes distintos. */
function finDuplicados_(F) {
  const g = {}; F.filter(x => !x.origen && x.tipo === 'ingreso' && /^ventas$/i.test(x.rubro)).forEach(x => { const k = finClave_(x.factura); if (k) (g[k] = g[k] || []).push(x); });
  const dup = [], typo = [];
  Object.keys(g).sort().forEach(k => { const L = g[k]; if (L.length < 2) return;
    const mismos = L.every(x => finNorm_(x.contraparte) === finNorm_(L[0].contraparte));
    (mismos ? dup : typo).push({ factura: k, local: finPvNom_(k), mes: L[0].mes, clientes: L.map(x => finCli_(x.contraparte)), filas: L.map(x => x.fila), montos: L.map(x => Math.round(x.monto)),
      deMas: mismos ? L.slice(1).reduce((a, x) => a + x.monto, 0) : 0 }); });
  return { duplicados: dup, mismoNumero: typo, montoDeMas: dup.reduce((a, d) => a + d.deMas, 0) };
}
const ctbPick_ = (o, ks) => { for (let i = 0; i < ks.length; i++) { const v = o ? o[ks[i]] : null; if (v != null && v !== '') return v; } return null; };
/** Normaliza un comprobante de Contabilium (acepta las variantes de nombres de campo de la API). */
function ctbNormCbte_(c) {
  const tipo = String(ctbPick_(c, ['TipoFc', 'Tipo', 'TipoComprobante', 'TipoDeComprobante', 'tipo']) || '').toUpperCase().trim();
  const pv = ctbPick_(c, ['PuntoVenta', 'PuntoDeVenta', 'PtoVenta', 'puntoVenta']), nro = ctbPick_(c, ['Numero', 'NumeroComprobante', 'Nro', 'numero']);
  let clave = finClave_(nro); if (!clave && pv != null && nro != null) clave = finClave_(pv + '-' + nro);
  if (!clave) clave = finClave_(ctbPick_(c, ['NumeroCompleto', 'Comprobante', 'Nombre']));
  const f = String(ctbPick_(c, ['FechaEmision', 'Fecha', 'FechaComprobante', 'fecha']) || '').slice(0, 10);
  return { id: ctbPick_(c, ['Id', 'ID', 'id']), asociadoId: ctbPick_(c, ['IdComprobanteAsociado']), saldo: ctbNum_(ctbPick_(c, ['Saldo'])), vence: String(ctbPick_(c, ['FechaVencimiento']) || '').slice(0, 10),
    tipo: tipo, clave: clave, pv: clave.slice(0, 4), fecha: f, mes: f.slice(0, 7),
    total: Math.abs(ctbNum_(ctbPick_(c, ['ImporteTotalNeto', 'Total', 'ImporteTotal', 'TotalNeto', 'Importe']))),
    cliente: String(ctbPick_(c, ['RazonSocial', 'Cliente', 'NombreCliente']) || '').trim(),
    asociado: finClave_(ctbPick_(c, ['ComprobanteAsociado', 'NumeroComprobanteAsociado', 'CbteAsociado', 'ComprobanteOrigen'])) };
}
const CTB_ES_VENTA = t => /^COT/.test(t) || /COTIZ/.test(t);
const CTB_ES_NC = t => /^NC/.test(t) || /NOTA\s*DE\s*CR/.test(t);
function ctbComprobantes_(desde, hasta, maxPag) {
  const out = [];
  for (let p = 1; p <= (maxPag || 60); p++) {
    const j = ctbGet_('/api/comprobantes/search', { fechaDesde: desde, fechaHasta: hasta, page: p });
    const L = j.Items || j.items || (Array.isArray(j) ? j : []); if (!L.length) break;
    L.forEach(c => out.push(ctbNormCbte_(c)));
    const tot = Number(j.TotalItems || j.totalItems || 0); if (tot && out.length >= tot) break;
  }
  return out;
}
/** Ventas facturadas (COT) de Palermo, Lima y Janette, con las notas de crédito descontadas de su factura. Caché 1 h. */
function ctbVentas_(desde, hasta) {
  const ck = 'CTBV_' + desde + '_' + hasta, c = CACHE.get(ck); if (c) { try { return JSON.parse(c); } catch (e) {} }
  const L = ctbComprobantes_(desde, hasta).filter(x => x.clave && FIN_PV[x.pv]);
  const fc = {}, porId = {}; L.filter(x => CTB_ES_VENTA(x.tipo)).forEach(x => { fc[x.clave] = { clave: x.clave, pv: x.pv, fecha: x.fecha, mes: x.mes, cliente: x.cliente, total: x.total, nc: 0, neto: x.total }; if (x.id != null) porId[x.id] = fc[x.clave]; });
  const sueltas = [];
  L.filter(x => CTB_ES_NC(x.tipo)).forEach(n => { const f = (n.asociadoId && porId[n.asociadoId]) || (n.asociado && fc[n.asociado]);
    if (f) { f.nc += n.total; f.neto = Math.max(0, f.total - f.nc); } else sueltas.push({ clave: n.clave, mes: n.mes, fecha: n.fecha, cliente: n.cliente, total: n.total, asociado: n.asociado }); });
  const R = { desde: desde, hasta: hasta, facturas: Object.keys(fc).map(k => fc[k]), ncSueltas: sueltas, leida: new Date().toISOString() };
  try { const s = JSON.stringify(R); if (s.length < 95000) CACHE.put(ck, s, 3600); } catch (e) {}
  return R;
}
/** 3.9c · Para NO contar dos veces: cobros del Templete sin número de factura (o con un número que no está en Contabilium), por
    cliente. Si un cliente pagó (p. ej. en septiembre) y la factura se hizo después (octubre), esa factura no se suma como «falta
    cargar»: la plata ya está contada el mes en que entró. Se muestra aparte para revisar. */
const cliClave_ = t => finNorm_(t).replace(/\(.*?\)/g, ' ').split(' ').filter(w => w.length >= 3 && !/^(srl|sas|del|las|los|por)$/.test(w)).slice(0, 2).join(' ');
function finPagosSinFactura_(F, enCtb) {
  const P = {}; F.filter(x => !x.origen && x.tipo === 'ingreso' && /^ventas$/i.test(x.rubro) && x.mes).forEach(x => { const k = finClave_(x.factura); if (k && enCtb[k]) return;
    const c = cliClave_(x.contraparte); if (c) (P[c] = P[c] || []).push({ mes: x.mes, monto: x.monto, fila: x.fila }); });
  return P;
}
function cobradoAntes_(P, cliente, mes) { const c = cliClave_(cliente), L = c && P[c]; if (!L) return null; const desde = finMesAnt_(finMesAnt_(mes));
  const ok = L.filter(p => p.mes >= desde && p.mes <= mes); return ok.length ? ok : null; }
/** Conciliación por mes entre Contabilium (V) y las ventas del Templete (F). */
function finConciliar_(F, V, meses) {
  const tpl = {}; F.filter(x => !x.origen && x.tipo === 'ingreso' && /^ventas$/i.test(x.rubro)).forEach(x => { const k = finClave_(x.factura); if (k) (tpl[k] = tpl[k] || []).push(x); });
  const enCtb = {}; V.facturas.forEach(f => { enCtb[f.clave] = f; }); const PSF = finPagosSinFactura_(F, enCtb);
  return meses.map(mes => {
    const r = { mes: mes, porLocal: {}, facturas: 0, ctbBruto: 0, ctbNc: 0, ctbNeto: 0, conciliadas: 0, montoConciliado: 0, faltaCargar: [], franquicias: [], cobradaAntes: [], montoFalta: 0, noEnCtb: [], diferencias: [], anuladas: [], ncSueltas: [] };
    V.facturas.filter(f => f.mes === mes).forEach(f => {
      const loc = FIN_PV[f.pv]; r.facturas++; r.ctbBruto += f.total; r.ctbNc += f.nc; r.ctbNeto += f.neto; r.porLocal[loc] = (r.porLocal[loc] || 0) + f.neto;
      const t = tpl[f.clave];
      if (!t) { if (f.neto > 0) { if (finFranq_(f.cliente) || f.canal === CANAL_GC) r.franquicias.push({ factura: f.clave, cliente: f.cliente, franquicia: finFranq_(f.cliente) || f.cliente, monto: f.neto });
        else if (cobradoAntes_(PSF, f.cliente, mes)) { const p = cobradoAntes_(PSF, f.cliente, mes); r.cobradaAntes.push({ factura: f.clave, local: loc, cliente: f.cliente, monto: f.neto, cobros: p.map(x => x.mes + ': ' + Math.round(x.monto) + ' (fila ' + x.fila + ')').join(' · ') }); }
        else r.faltaCargar.push({ factura: f.clave, local: loc, fecha: f.fecha, cliente: f.cliente, monto: f.neto, nc: f.nc }); } return; }
      const mt = t.reduce((a, x) => a + x.monto, 0); r.conciliadas++; r.montoConciliado += mt;
      if (f.neto === 0) r.anuladas.push({ factura: f.clave, cliente: f.cliente, monto: mt });
      else if (Math.abs(mt - f.neto) > Math.max(1000, f.neto * 0.01)) r.diferencias.push({ factura: f.clave, cliente: f.cliente, templete: mt, contabilium: f.neto, nc: f.nc });
    });
    Object.keys(tpl).forEach(k => { const t = tpl[k]; if (!enCtb[k] && t.some(x => x.mes === mes) && FIN_PV[k.slice(0, 4)])
      r.noEnCtb.push({ factura: k, cliente: finCli_(t[0].contraparte), monto: t.reduce((a, x) => a + x.monto, 0) }); });
    r.montoFalta = r.faltaCargar.reduce((a, x) => a + x.monto, 0);
    r.ncSueltas = V.ncSueltas.filter(n => n.mes === mes).map(n => ({ nc: n.clave, cliente: n.cliente, monto: n.total }));
    r.faltaCargar.sort((a, b) => b.monto - a.monto); r.diferencias.sort((a, b) => Math.abs(b.templete - b.contabilium) - Math.abs(a.templete - a.contabilium));
    return r;
  });
}
/** 3.8 · Ventas por sector (local): Palermo 0001 · Lima 0005 · Janette 0007 · anticipos de temporada. Últimos 3 meses + año.
    Palermo se compara con los cierres de caja de la app (al día), que no dependen de la carga del Templete. */
function finSectores_(F) {
  const mesHoy = hoy_().slice(0, 7), meses = [finMesAnt_(finMesAnt_(mesHoy)), finMesAnt_(mesHoy), mesHoy], anio = mesHoy.slice(0, 4);
  // Anticipos de franquicias aparte; las facturas a franquicias (p. ej. lo que se llevó La Plata) no se suman al local que facturó.
  const sec = x => /anticipo/i.test(x.cuenta + ' ' + x.detalle) ? 'Anticipos de temporada' : finFranq_(x.contraparte) ? 'Facturas a grandes cuentas' : (finPvNom_(finClave_(x.factura), x.pv) || 'Otras ventas');
  const v = {}, a = {};
  F.filter(x => x.tipo === 'ingreso' && /^ventas$/i.test(x.rubro) && x.mes).forEach(x => { const k = sec(x);
    if (meses.indexOf(x.mes) >= 0) v[k + '|' + x.mes] = (v[k + '|' + x.mes] || 0) + x.monto;
    if (x.mes.slice(0, 4) === anio && x.mes <= mesHoy) a[k] = (a[k] || 0) + x.monto; });
  const caja = {}, dias = {}; let ultimo = null;
  try { tAll_('Cierres').filter(c => Number(c.total) >= 0 && c.fecha).forEach(c => { const f = String(c.fecha).slice(0, 10), m = f.slice(0, 7);
    if (meses.indexOf(m) >= 0) { caja[m] = (caja[m] || 0) + Number(c.total || 0); dias[m] = (dias[m] || 0) + 1; }
    if (!ultimo || f > ultimo) ultimo = f; }); } catch (e) {}
  const orden = ['Palermo', 'Lima', 'Janette', 'Anticipos de temporada', 'Facturas a grandes cuentas', 'Otras ventas'];
  return { meses: meses, filas: orden.map(s => ({ sector: s, valores: meses.map(m => v[s + '|' + m] || 0), anio: a[s] || 0 })).filter(f => f.anio || f.valores.some(Boolean)),
    cajaPalermo: meses.map(m => caja[m] || 0), diasCaja: meses.map(m => dias[m] || 0), ultimoCierre: ultimo };
}
/** Lee la planilla de Dropbox (o la caché de 30 min / misma versión del archivo). */
function finanzas_(forzar) {
  if (!forzar) { const c = CACHE.get('FIN38_R'); if (c) { try { return JSON.parse(c); } catch (e) {} } }
  const d = dbxDescargar_(), F = finLeerData_(d.blob), filas = F.length, Fo = F.slice();
  let CM = null, controlMeses = null;
  // Ventas facturadas en Contabilium (mes anterior y mes en curso): lo que todavía no está en el Templete se suma, sin duplicar.
  let ctb = { configurado: ctbConfigurado_(), ok: false };
  if (ctb.configurado) {
    try { const hoy = hoy_(), mesHoy = hoy.slice(0, 7), mesAnt = finMesAnt_(mesHoy);
      // 3.9c · Si ya está la copia de los comprobantes (hoja «Comprobantes»), se usa esa: tiene todos los meses y las notas de crédito
      // de facturas de meses anteriores. Si no, se lee Contabilium en el momento (como en 3.8).
      CM = ctbMensual_(); const V = CM ? cmpVentas_() : ctbVentas_(mesAnt + '-01', hoy), conc = finConciliar_(F, V, [mesAnt, mesHoy]);
      if (CM) { try { controlMeses = finControlMeses_(Fo, CM, V, 3); } catch (e) { controlMeses = null; }
        conc.forEach(c => { const m = CM.meses.find(x => x.mes === c.mes); if (m) c.informe = m.total; }); }
      conc.forEach(c => c.faltaCargar.forEach(f => F.push({ fila: 0, fecha: f.fecha, mes: c.mes, tipo: 'ingreso', rubro: 'Ventas', cuenta: 'Facturado en Contabilium (falta cargar)',
        contraparte: f.cliente, detalle: '', pv: f.local, factura: f.factura, medio: '', monto: f.monto, sinIva: 0, origen: 'contabilium' })));
      ctb = { configurado: true, ok: true, leida: V.leida, conciliacion: conc };
    } catch (e) { ctb = { configurado: true, ok: false, error: String(e.message || e).slice(0, 200) }; }
  }
  const R = finResumen_(F), dup = finDuplicados_(F);
  R.filas = filas; R.contabilium = ctb; R.duplicados = dup; try { R.anticipos = finAnticipos_(F); } catch (e) { R.anticipos = null; } try { R.sectores = finSectores_(F); } catch (e) { R.sectores = null; }
  // 3.9c · Lo facturado por canal (Contabilium, con IVA) y el control mes a mes contra el informe de Contabilium y el Templete
  if (CM && R.sectores) try { R.sectores.facturado = finFacturadoCanal_(CM, R.sectores.meses); } catch (e) {}
  if (CM) R.controlMeses = { meses: controlMeses, leido: CM.leido, comprobantes: CM.comprobantes };
  if (dup.duplicados.length) R.alertas.push({ nivel: 'amarillo', texto: 'En el Templete hay ' + dup.duplicados.length + ' facturas cargadas dos veces (mismo número y mismo cliente): suman ' + $M_(dup.montoDeMas) + ' de más en ventas. Están en «Control de facturas».' });
  if (dup.mismoNumero.length) R.alertas.push({ nivel: 'amarillo', texto: dup.mismoNumero.length + ' números de factura aparecen con clientes distintos en el Templete: seguramente es un error de tipeo en el número.' });
  if (ctb.ok) ctb.conciliacion.forEach(c => { if (c.montoFalta > 0) R.recomendaciones.push('Cargar en el Templete las ' + c.faltaCargar.length + ' facturas de ' + MES_NOM(c.mes).split(' ')[0] + ' que están en Contabilium (' + $M_(c.montoFalta) + '). Mientras tanto el panel ya las suma.'); });
  R.archivo = d.nombre; R.modificado = d.modificado; R.ruta = d.ruta; R.leida = new Date().toISOString();
  if (d.otraCopia && d.otraCopia.modificado && d.modificado && d.otraCopia.modificado.slice(0, 16) !== d.modificado.slice(0, 16))
    R.alertas.push({ nivel: 'amarillo', texto: 'Hay dos copias del Templete en Dropbox y no son iguales. Se usó la más nueva (' + (d.ruta.indexOf('/RESULTADOS/') === 0 ? 'carpeta RESULTADOS' : 'raíz del Dropbox') + '). Conviene dejar una sola para no cargar datos en la equivocada.' });
  const s = JSON.stringify(R); if (s.length < 95000) try { CACHE.put('FIN38_R', s, 1800); } catch (e) {}
  CACHE.put('FIN38_F', 'x', 1);   // marca de lectura
  PROPS.setProperty('FIN_SYNC', JSON.stringify({ ts: R.leida, ok: true, modificado: d.modificado, filas: filas, contabilium: ctb.ok ? 'ok' : ctb.configurado ? 'error' : 'sin conectar' }));
  return R;
}
/** Millones redondeados, para decir en voz alta: «casi 78 millones», «más de 113 millones». */
function millones_(n) {
  n = Math.abs(Number(n) || 0); if (n < 1e6) return dinero_(n);
  const m = n / 1e6, r = Math.round(m);
  return (Math.abs(m - r) < 0.15 ? '' : m < r ? 'casi ' : 'más de ') + (m < r ? r : Math.floor(m)) + ' millones de pesos';
}
function audioFinanzas_(u, R) {
  if (!R || !R.meses.length) return '';
  const nombre = String(u && u.nombre || '').trim().split(' ')[0], P = [], U = R.ultimoCerrado, C = R.enCurso, S = R.simple || {};
  P.push((nombre ? 'Hola ' + nombre + '. ' : 'Hola. ') + 'Te cuento, en pocas palabras, cómo viene la plata de Hey Blackk.');
  if (U) P.push('En ' + MES_NOM(U.mes).split(' ')[0] + ' entraron ' + millones_(U.ingresos) + ' y salieron ' + millones_(U.egresos) + '. ' +
    (U.neto >= 0 ? 'Quedaron ' + millones_(U.neto) + ' a favor.' : 'Faltaron ' + millones_(-U.neto) + '.') +
    (U.retiros ? ' De lo que salió, ' + millones_(U.retiros) + ' fueron retiros de los socios.' : ''));
  if (S.equilibrio) P.push('Para no perder plata, hoy hay que vender ' + millones_(S.equilibrio.necesario).replace(/^(\d)/, 'unos $1') + ' por mes. ' +
    (U && U.ingresos >= S.equilibrio.necesario ? 'En ' + MES_NOM(U.mes).split(' ')[0] + ' se llegó.' : 'En ' + MES_NOM(U.mes).split(' ')[0] + ' no se llegó.'));
  if (S.destinoAnio && S.destinoAnio.length) { const d = S.destinoAnio.filter(x => x.cada100 != null).slice(0, 2);
    if (d.length) P.push('En el año, de cada cien pesos que entraron, ' + d.map(x => x.cada100 + ' se fueron en ' + x.nombre.split(' (')[0].toLowerCase()).join(' y ') + '.'); }
  if (C) P.push('En lo que va de ' + MES_NOM(C.mes).split(' ')[0] + ' entraron ' + millones_(C.ingresos) + ' y salieron ' + millones_(C.egresos) + '; faltan cargar cobros.');
  if (R.franquicias.length) P.push('Lo que pagaron las grandes cuentas en el año: ' + lista37_(R.franquicias.slice(0, 4).map(f => f.franquicia + ', ' + millones_(f.cobradoAnio))) + '.');
  const rec = R.recomendaciones.filter(t => !/^Vender más o bajar gastos/.test(t))[0];
  if (rec) P.push('Para revisar: ' + hablar_(rec.charAt(0).toLowerCase() + rec.slice(1).replace(/\$ ?([\d.,]+) M/g, (m, n) => millones_(Number(n.replace(',', '.')) * 1e6)).replace(/\$ ?[\d.]+/g, m => millones_(Number(m.replace(/[^\d]/g, ''))))));
  return P.join(' ').replace(/\s+/g, ' ').trim();
}
/** Solo la cuenta de administración de María (legajo MARIA) ve anticipos y cobranzas pendientes. */
const esMaria_ = u => !!u && u.rol === 'admin' && String(u.legajo || '').toUpperCase() === 'MARIA';
function finanzasPanel(token, forzar) {
  const s = sesion_(token, 'finanzas');
  if (!dbxConfigurado_()) return { conectado: false };
  if (forzar && ctbConfigurado_()) { const P = JSON.parse(PROPS.getProperty('CTB_PROD') || 'null'); if (!P || Date.now() - new Date(P.leida).getTime() > 2 * 3600000) try { ctbActualizarResumenes_(); } catch (e) {} }
  const R = Object.assign({}, finanzas_(!!forzar)), maria = esMaria_(s.user);
  if (!maria) delete R.anticipos;   // cobranzas pendientes y anticipos: solo el usuario MARIA
  try { R.productos = JSON.parse(PROPS.getProperty('CTB_PROD') || 'null'); } catch (e) {}
  if (maria) try { R.cobranzas = JSON.parse(PROPS.getProperty('CTB_COB') || 'null'); } catch (e) {}
  return { conectado: true, resumen: R, maria: maria, audio: audioFinanzas_(s.user, R), sync: JSON.parse(PROPS.getProperty('FIN_SYNC') || 'null') };
}
/** Hojas extra de la descarga: control de facturas, conciliación con Contabilium y (solo MARIA) anticipos por cliente. */
function finHojasExtra_(X, maria) {
  const H = [], D = X.duplicados || { duplicados: [], mismoNumero: [] };
  H.push({ nombre: 'Control de facturas', columnas: ['Problema', 'Factura', 'Local', 'Mes', 'Clientes', 'Filas del Templete', 'Importes', 'De más'], dinero: [7],
    filas: D.duplicados.map(x => ['Cargada dos veces', x.factura, x.local, x.mes, x.clientes.join(' / '), x.filas.join(', '), x.montos.map(m => $_(m)).join(' / '), Math.round(x.deMas)])
      .concat(D.mismoNumero.map(x => ['Mismo número, clientes distintos', x.factura, x.local, x.mes, x.clientes.join(' / '), x.filas.join(', '), x.montos.map(m => $_(m)).join(' / '), 0])) });
  const K = X.contabilium || {};
  if (K.ok) K.conciliacion.forEach(c => H.push({ nombre: 'Conciliación ' + c.mes, columnas: ['Situación', 'Factura', 'Cliente', 'Contabilium', 'Templete'], dinero: [3, 4],
    filas: c.faltaCargar.map(f => ['Falta cargar en el Templete (ya sumada al panel)', f.factura, f.cliente, Math.round(f.monto), 0])
      .concat(c.franquicias.map(f => ['Factura a gran cuenta: aplicar contra anticipos', f.factura, f.cliente, Math.round(f.monto), 0]))
      .concat((c.cobradaAntes || []).map(f => ['Ya cobrada antes sin número de factura: NO se suma (' + f.cobros + ')', f.factura, f.cliente, Math.round(f.monto), 0]))
      .concat(c.diferencias.map(f => ['Importe distinto', f.factura, f.cliente, Math.round(f.contabilium), Math.round(f.templete)]))
      .concat(c.noEnCtb.map(f => ['Está en el Templete y no en Contabilium', f.factura, f.cliente, 0, Math.round(f.monto)]))
      .concat(c.anuladas.map(f => ['Anulada con nota de crédito total', f.factura, f.cliente, 0, Math.round(f.monto)])) }));
  if (maria && X.anticipos) {
    H.push({ nombre: 'Anticipos por cliente', columnas: ['Cliente', 'Pedido', 'Anticipado (Templete)', '% cobrado', 'Saldo a cobrar', 'Abonado según Control ingreso', 'Avisos'], dinero: [1, 2, 4, 5],
      filas: X.anticipos.clientes.map(c => [c.cliente, Math.round(c.pedido || 0), Math.round(c.anticipado), c.pct != null ? c.pct + ' %' : '', Math.round(c.saldo || 0), c.pagadoPlanilla != null ? Math.round(c.pagadoPlanilla) : '', c.avisos.join(' ')]) });
    const P = []; X.anticipos.clientes.forEach(c => c.pagos.forEach(p => P.push([c.cliente, p.fecha ? fdm_(p.fecha) : '', Math.round(p.monto), p.pagador, p.medio, p.detalle, p.fila])));
    H.push({ nombre: 'Anticipos detalle', columnas: ['Cliente', 'Fecha', 'Monto', 'Pagó', 'Medio', 'Detalle', 'Fila'], dinero: [2], filas: P });
  }
  return H;
}
/** 3.9c · Hojas de control: lo facturado igual al informe de Contabilium y la conciliación mes a mes con el Templete. */
const MOTIVOS_TXT = { faltaCargar: 'Facturas de Contabilium que todavía no están en el Templete', grandesCuentas: 'Facturas a grandes cuentas (se cobran con anticipos; no se cargan como venta)',
  cobradaAntes: 'Facturas de clientes que ya habían pagado sin número de factura (no se suman: la plata ya está contada)',
  cargadaOtroMes: 'Facturas de este mes cargadas en el Templete en otro mes', deOtroMes: 'Cobros cargados en este mes de facturas de otro mes',
  noEstaEnContabilium: 'Números de factura del Templete que no existen en Contabilium (revisar tipeo)', importeDistinto: 'Importe distinto entre Templete y Contabilium',
  repetidaEnTemplete: 'Factura cargada más de una vez en el Templete', notasCreditoOtroMes: 'Notas de crédito: Contabilium las resta el mes en que se emiten',
  sinNumeroFactura: 'Ventas del Templete sin número de factura', otroPuntoVenta: 'Ventas del Templete de otro punto de venta' };
function finHojasControl_(F) {
  const CM = ctbMensual_(); if (!CM) return [];
  const V = cmpVentas_(), C = finControlMeses_(F, CM, V, 400), PVN = { '0001': '0001 Palermo', '0005': '0005 Lima (incluye Web y grandes cuentas)', '0007': '0007 Janette' };
  const H = [];
  const f1 = []; CM.meses.forEach(m => { Object.keys(m.pv).sort().forEach(p => { const o = m.pv[p]; f1.push([m.mes, PVN[p] || p, o.comprobantes, Math.round(o.sinIva), Math.round(o.conIva), Math.round(o.ncConIva)]); });
    f1.push([m.mes, 'TOTAL', m.total.comprobantes, Math.round(m.total.sinIva), Math.round(m.total.conIva), Math.round(m.total.ncConIva)]); });
  H.push({ nombre: 'Facturado (= Contabilium)', columnas: ['Mes', 'Punto de venta', 'Comprobantes', 'Total sin IVA', 'Total con IVA', 'Notas de crédito (ya restadas)'], dinero: [3, 4, 5], filas: f1 });
  const f2 = []; CM.meses.forEach(m => CANALES_TODOS.forEach(cn => { const o = m.canal[cn]; if (o) f2.push([m.mes, cn, o.comprobantes, Math.round(o.sinIva), Math.round(o.conIva)]); }));
  H.push({ nombre: 'Facturado por canal', columnas: ['Mes', 'Canal', 'Comprobantes', 'Sin IVA', 'Con IVA'], dinero: [3, 4], filas: f2 });
  H.push({ nombre: 'Facturado vs Templete', columnas: ['Mes', 'Facturado con IVA (Contabilium)', 'Ventas en el Templete (sin anticipos)', 'Anticipos de temporada (Templete)', 'Diferencia', 'Motivo', 'Cantidad', 'Importe del motivo'], dinero: [1, 2, 3, 4, 7],
    filas: [].concat.apply([], C.map(r => { const ks = Object.keys(r.motivos); const base = [r.mes, Math.round(r.informe.conIva), Math.round(r.templete.ventas), Math.round(r.templete.anticipos), r.diferencia];
      const L = ks.map(k => base.concat([MOTIVOS_TXT[k] || k, r.motivos[k].n, r.motivos[k].monto]));
      if (r.sinExplicar) L.push(base.concat(['Sin explicar', '', r.sinExplicar]));
      return L.length ? L : [base.concat(['Coincide', '', 0])]; })) });
  const f4 = []; C.forEach(r => Object.keys(r.ejemplos).forEach(k => r.ejemplos[k].forEach(e => f4.push([r.mes, MOTIVOS_TXT[k] || k, e[0], e[1] || '', Math.round(e[2] || 0), e.length > 3 ? (typeof e[3] === 'number' ? Math.round(e[3]) : e[3]) : '']))));
  H.push({ nombre: 'Detalle de diferencias', columnas: ['Mes', 'Motivo', 'Factura', 'Cliente', 'Importe', 'Dato extra'], dinero: [4], filas: f4 });
  return H;
}
/** Descarga (Excel/PDF) del detalle financiero: meses, rubros por mes, semanas, cuentas y franquicias. */
function descargaFinanzas(token) {
  const s = sesion_(token, 'finanzas'); if (!dbxConfigurado_()) throw new Error('La planilla de Dropbox no está conectada.');
  const d = dbxDescargar_(), F = finLeerData_(d.blob), R = finResumen_(F), X = finanzas_(false), maria = esMaria_(s.user);
  const meses = R.meses.map(M => M.mes), rub = {}, mesHoy = R.mesHoy;
  F.filter(x => x.tipo === 'egreso' && x.mes && x.mes <= mesHoy).forEach(x => { const k = x.rubro + ' · ' + x.cuenta; (rub[k] = rub[k] || {})[x.mes] = (rub[k][x.mes] || 0) + x.monto; });
  const filasRub = Object.keys(rub).sort().map(k => [k.split(' · ')[0], k.split(' · ')[1]].concat(meses.map(m => Math.round(rub[k][m] || 0)), [Math.round(meses.reduce((a, m) => a + (rub[k][m] || 0), 0))]));
  return { actualizado: new Date().toISOString(), modificado: d.modificado, generado: new Date().toISOString(), por: s.user.nombre, titulo: 'Finanzas Hey Blackk', archivo: 'Finanzas-Hey-Blackk',
    hojas: [
      { nombre: 'Resumen mensual', columnas: ['Mes', 'Ingresos', 'Egresos', 'Resultado', 'Ventas', 'Retiros de socios', 'Resultado sin retiros', 'Movimientos'], dinero: [1, 2, 3, 4, 5, 6],
        filas: R.meses.map(M => [M.mes, Math.round(M.ingresos), Math.round(M.egresos), Math.round(M.neto), Math.round(M.ventas), Math.round(M.retiros), Math.round(M.operativo), M.filas]) },
      { nombre: 'Egresos por cuenta y mes', columnas: ['Rubro', 'Cuenta'].concat(meses, ['Total']), dinero: meses.map((m, i) => i + 2).concat([meses.length + 2]), filas: filasRub },
      { nombre: 'Semanas', columnas: ['Semana del', 'Ingresos', 'Egresos', 'Resultado'], dinero: [1, 2, 3], filas: R.semanas.map(w => [fdm_(w.semana), Math.round(w.ingresos), Math.round(w.egresos), Math.round(w.ingresos - w.egresos)]) },
      { nombre: 'Ventas por canal (año)', columnas: ['Canal', 'Ventas'], dinero: [1], filas: R.canales.map(c => [c.nombre, Math.round(c.monto)]) },
      { nombre: 'Grandes cuentas cobrado', columnas: ['Gran cuenta', 'Cobrado total', 'Cobrado en el año', 'Último mes cerrado', 'Último pago'], dinero: [1, 2, 3], filas: R.franquicias.map(f => [f.franquicia, Math.round(f.cobrado), Math.round(f.cobradoAnio), Math.round(f.ultimoMes), f.ultimo ? fdm_(f.ultimo) : '']) },
      { nombre: 'Retiros de socios (año)', columnas: ['Cuenta', 'Monto'], dinero: [1], filas: R.retiros.map(r => [r.nombre, Math.round(r.monto)]) }].concat(finHojasControl_(F), finHojasExtra_(X, maria)) };
}
/* =================== 3.8 · Contabilium (SOLO LECTURA) =================== */
/* Conexión con la API de Contabilium (https://rest.contabilium.com). Las credenciales viven SOLO en Propiedades del script:
   CONTABILIUM_ID (email del usuario de la API) y CONTABILIUM_SECRET (API key). Nunca viajan al teléfono ni se escriben en el código.
   Solo se permiten consultas GET de una lista cerrada: la app no puede crear, modificar ni borrar nada en Contabilium. */
const CTB_BASE = 'https://rest.contabilium.com';
const CTB_LECTURAS = [/^\/api\/usuarios\/tieneAcceso$/, /^\/api\/usuarios\/obtenerinfo$/, /^\/api\/comprobantes\/search$/, /^\/api\/clientes\/search$/,
  /^\/api\/inventarios\/getDepositos$/, /^\/api\/inventarios\/getStockByDeposito$/, /^\/api\/conceptos\/search$/, /^\/api\/puntosdeventa\/search$/,
  /^\/api\/comprobantes\/?$/, /^\/api\/comprobantes\/getById$/];
/** 3.8 · María conecta Contabilium desde la app (sin tocar Propiedades del script): pega el Client ID y la API key, se validan
    contra Contabilium y recién ahí se guardan en el servidor. Nunca vuelven al teléfono ni quedan en el Historial. Pide PIN. */
function conectarContabilium(token, id, secreto) {
  const s = sesion_(token, 'finanzas', true); if (!esMaria_(s.user)) throw new Error('PERM');
  id = String(id || '').trim(); secreto = String(secreto || '').trim();
  if (!id || !secreto || id.length > 200 || secreto.length > 300) throw new Error('Completá el Client ID y la API key de Contabilium.');
  const r = UrlFetchApp.fetch(CTB_BASE + '/token', { method: 'post', muteHttpExceptions: true, contentType: 'application/x-www-form-urlencoded',
    payload: 'grant_type=client_credentials&client_id=' + encodeURIComponent(id) + '&client_secret=' + encodeURIComponent(secreto) });
  let j = {}; try { j = JSON.parse(r.getContentText()); } catch (e) {}
  if (r.getResponseCode() !== 200 || !j.access_token) { log_(s, 'conectar_contabilium', 'error', '', 'Contabilium rechazó las credenciales (HTTP ' + r.getResponseCode() + ')'); throw new Error('Contabilium no aceptó esos datos (HTTP ' + r.getResponseCode() + '). Revisá que sean el Client ID y la API key de Mi cuenta → API.'); }
  PROPS.setProperty('CONTABILIUM_ID', id); PROPS.setProperty('CONTABILIUM_SECRET', secreto);
  try { CACHE.put('CTB_TOKEN', j.access_token, Math.max(60, Math.min(21000, (Number(j.expires_in) || 3600) - 120))); CACHE.remove('FIN38_R'); } catch (e) {}
  log_(s, 'conectar_contabilium', 'ok', '', 'Conexión de solo lectura con Contabilium guardada');
  return { ok: true };
}
function ctbConfigurado_() { return !!(PROPS.getProperty('CONTABILIUM_ID') && PROPS.getProperty('CONTABILIUM_SECRET')); }
function ctbToken_(forzar) {
  if (!forzar) { const c = CACHE.get('CTB_TOKEN'); if (c) return c; }
  const id = PROPS.getProperty('CONTABILIUM_ID'), sec = PROPS.getProperty('CONTABILIUM_SECRET');
  if (!id || !sec) throw new Error('Contabilium no está configurado (faltan las credenciales en Propiedades del script).');
  const r = UrlFetchApp.fetch(CTB_BASE + '/token', { method: 'post', muteHttpExceptions: true, contentType: 'application/x-www-form-urlencoded',
    payload: 'grant_type=client_credentials&client_id=' + encodeURIComponent(id) + '&client_secret=' + encodeURIComponent(sec) });
  const code = r.getResponseCode(); let j = {}; try { j = JSON.parse(r.getContentText()); } catch (e) {}
  if (code !== 200 || !j.access_token) throw new Error('Contabilium rechazó las credenciales (HTTP ' + code + (j.error_description ? ': ' + String(j.error_description).slice(0, 120) : '') + ').');
  try { CACHE.put('CTB_TOKEN', j.access_token, Math.max(60, Math.min(21000, (Number(j.expires_in) || 3600) - 120))); } catch (e) {}
  return j.access_token;
}
/** GET de solo lectura a Contabilium (lista cerrada de rutas). Reintenta una vez si el token venció. */
function ctbGet_(path, q) {
  if (!CTB_LECTURAS.some(re => re.test(path))) throw new Error('Ruta de Contabilium no permitida: ' + path);
  const qs = q ? '?' + Object.keys(q).filter(k => q[k] != null && q[k] !== '').map(k => k + '=' + encodeURIComponent(q[k])).join('&') : '';
  // 3.9 · 401: se renueva el token una vez. 429/5xx (Contabilium pide frenar o está ocupado): se espera y se reintenta (hasta 5 veces).
  let renovar = false, esperas = 0;
  for (let i = 0; i < 8; i++) {
    const r = UrlFetchApp.fetch(CTB_BASE + path + qs, { method: 'get', muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + ctbToken_(renovar), Accept: 'application/json' } });
    const code = r.getResponseCode();
    if (code === 401 && !renovar) { renovar = true; continue; }
    if ((code === 429 || code >= 500) && esperas < 5) { esperas++; Utilities.sleep(Math.min(20000, 1500 * Math.pow(2, esperas - 1))); continue; }
    if (code !== 200) throw new Error('Contabilium respondió HTTP ' + code + ' en ' + path + (code === 429 ? ' (demasiadas consultas seguidas: probá de nuevo en un minuto)' : ''));
    return JSON.parse(r.getContentText());
  }
  throw new Error('Contabilium no respondió en ' + path);
}
/** Diagnóstico (se corre desde el editor, solo lee): verifica el acceso y muestra la ESTRUCTURA de los datos (nombres de campos y
    cantidades, sin importes ni datos personales en el registro) para mapear ventas, cobranzas y stock con los nombres reales. */
function contabiliumProbar() {
  const out = { configurado: ctbConfigurado_() };
  if (!out.configurado) { Logger.log('CTB ' + JSON.stringify(out)); return out; }
  const forma = o => o && typeof o === 'object' ? Object.keys(o).map(k => k + ':' + (Array.isArray(o[k]) ? 'lista(' + o[k].length + ')' : o[k] === null ? 'null' : typeof o[k])) : typeof o;
  const paso = (n, f) => { try { out[n] = f(); } catch (e) { out[n] = 'ERROR ' + String(e.message || e).slice(0, 160); } };
  paso('token', () => !!ctbToken_(true));
  paso('acceso', () => forma(ctbGet_('/api/usuarios/tieneAcceso')));
  const hasta = hoy_(), desde = sumarDias_(hasta, -30);
  paso('comprobantes', () => { const j = ctbGet_('/api/comprobantes/search', { fechaDesde: desde, fechaHasta: hasta, page: 1 });
    const L = j.Items || j.items || (Array.isArray(j) ? j : []); return { raiz: forma(j), cantidadPagina: L.length, item: forma(L[0]), detalleItem: L[0] && (L[0].Items || L[0].Detalle) ? forma((L[0].Items || L[0].Detalle)[0]) : null }; });
  paso('clientes', () => { const j = ctbGet_('/api/clientes/search', { page: 1 }); const L = j.Items || j.items || (Array.isArray(j) ? j : []); return { raiz: forma(j), item: forma(L[0]) }; });
  paso('depositos', () => { const j = ctbGet_('/api/inventarios/getDepositos'); const L = Array.isArray(j) ? j : (j.Items || []); return { cantidad: L.length, item: forma(L[0]), nombres: L.map(d => d.Nombre || d.nombre || d.Descripcion || '').slice(0, 10) }; });
  paso('stock', () => { const d = ctbGet_('/api/inventarios/getDepositos'), L = Array.isArray(d) ? d : (d.Items || []); if (!L.length) return 'sin depósitos';
    const j = ctbGet_('/api/inventarios/getStockByDeposito', { id: L[0].Id || L[0].ID || L[0].id }); const S = Array.isArray(j) ? j : (j.Items || []); return { cantidad: S.length, item: forma(S[0]) }; });
  Logger.log('CTB ' + JSON.stringify(out));
  PROPS.setProperty('CTB_PRUEBA', JSON.stringify({ ts: new Date().toISOString(), ok: out.token === true }));
  return out;
}
/** Diagnóstico 2 (editor, solo lectura): tipos de comprobante, puntos de venta, detalle de un ítem, stock y conceptos. Sin importes ni datos personales. */
function contabiliumProbar2() {
  const out = {}, forma = o => o && typeof o === 'object' ? Object.keys(o).map(k => k + ':' + (Array.isArray(o[k]) ? 'lista(' + o[k].length + ')' : o[k] === null ? 'null' : typeof o[k])) : typeof o;
  const paso = (n, f) => { try { out[n] = f(); } catch (e) { out[n] = 'ERROR ' + String(e.message || e).slice(0, 160); } };
  const hasta = hoy_(), desde = sumarDias_(hasta, -10); let L = [];
  paso('cbtes', () => { for (let p = 1; p <= 8; p++) { const j = ctbGet_('/api/comprobantes/search', { fechaDesde: desde, fechaHasta: hasta, page: p }); const I = j.Items || []; L = L.concat(I); if (!I.length || L.length >= (j.TotalItems || 0)) break; }
    const cnt = k => { const o = {}; L.forEach(c => { const v = String(c[k]); o[v] = (o[v] || 0) + 1; }); return o; };
    return { total: L.length, tipo: cnt('TipoFc'), pv: cnt('PuntoVenta'), canal: cnt('Canal'), modo: cnt('Modo'), origen: cnt('Origen'), condicion: cnt('CondicionVenta'),
      numeroForma: Array.from(new Set(L.slice(0, 40).map(c => String(c.Numero).replace(/\d/g, '9')))), asociados: L.filter(c => c.IdComprobanteAsociado).length,
      conSaldo: L.filter(c => Number(c.Saldo) > 0).length, fechaForma: String(L[0] && L[0].FechaEmision).replace(/\d/g, '9') }; });
  const cot = L.find(c => /COT/i.test(c.TipoFc) && Number(c.PuntoVenta) === 1) || L[0];
  if (cot) {
    paso('detalle1', () => { const j = ctbGet_('/api/comprobantes/', { id: cot.Id }); const it = (j.Items || [])[0]; return { raiz: forma(j), item: forma(it), items: (j.Items || []).length, codigoForma: it ? String(it.Codigo || it.CodigoProducto || '').replace(/\d/g, '9') : null }; });
    paso('detalle2', () => { const j = ctbGet_('/api/comprobantes/getById', { id: cot.Id }); return forma(j).slice(0, 12); });
  }
  paso('conceptos', () => { const j = ctbGet_('/api/conceptos/search', { page: 1 }); const I = j.Items || []; return { raiz: forma(j), total: j.TotalItems, item: forma(I[0]), ss27: I.filter(x => /SS27$/i.test(String(x.Codigo || ''))).length, codigos: I.slice(0, 8).map(x => String(x.Codigo || '').replace(/\d/g, '9')) }; });
  paso('stockPalermo', () => { const d = ctbGet_('/api/inventarios/getDepositos'), D = (Array.isArray(d) ? d : d.Items || []), pal = D.find(x => /palermo/i.test(x.Nombre) && !/falla/i.test(x.Nombre));
    const j = ctbGet_('/api/inventarios/getStockByDeposito', { id: pal.Id, page: 1 }); const S = Array.isArray(j) ? j : (j.Items || []); return { raiz: Array.isArray(j) ? 'lista' : forma(j), cantidad: S.length, total: j.TotalItems, depositos: D.map(x => x.Nombre) }; });
  Logger.log('CTB2 ' + JSON.stringify(out).slice(0, 8000));
  return out;
}
/* =================== 3.8 · Productos, temporada y cobranzas desde Contabilium (SOLO LECTURA) =================== */
/* Todo se LEE con GET (lista cerrada en CTB_LECTURAS): la app no crea, modifica ni borra nada en Contabilium.
   Lo pesado (detalle de comprobantes, deuda de clientes) se calcula en la actualización diaria y se guarda resumido. */
/* Contabilium manda importes como texto en formato argentino ("1.234.567,89"): punto = miles, coma = decimales. */
function ctbNum_(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  let s = String(v == null ? '' : v).trim().replace(/[^\d,.\-]/g, '');
  if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  return Number(s) || 0;
}
/** Detalle (ítems) de un comprobante, con caché de 6 h por comprobante. */
function ctbItems_(id) {
  const ck = 'CTBI_' + id, c = CACHE.get(ck); if (c) { try { return JSON.parse(c); } catch (e) {} }
  const j = ctbGet_('/api/comprobantes/', { id: id });
  const I = (j.Items || []).map(it => ({ codigo: String(it.Codigo || '').trim(), nombre: String(it.Concepto || '').trim().slice(0, 80), cant: ctbNum_(it.Cantidad),
    monto: ctbNum_(it.Cantidad) * ctbNum_(it.PrecioUnitario) * (1 - ctbNum_(it.Bonificacion) / 100) }));
  try { CACHE.put(ck, JSON.stringify(I), 21600); } catch (e) {}
  return I;
}
/** Productos vendidos en los últimos N días (COT menos notas de crédito), por local según el número (0001/0005/0007). */
/* Solo prendas: afuera envíos, bolsas, descuentos, señas y renglones sin código. */
function ctbNoProducto_(it) { return !it.codigo || /^(ENVIO|BOLSA|DESC|RECARGO|SENA|ANTICIPO)/i.test(it.codigo) || /\b(bolsas?|env[ií]o|descuento|recargo|se[ñn]a|anticipo|gift ?card)\b/i.test(it.nombre || ''); }
function ctbProductos_(dias) {
  const hasta = hoy_(), desde = sumarDias_(hasta, -(dias || 7) + 1);
  const L = ctbComprobantes_(desde, hasta).filter(x => x.id != null && FIN_PV[x.pv] && (CTB_ES_VENTA(x.tipo) || CTB_ES_NC(x.tipo)));
  const ag = {}, add = (loc, it, signo) => { if (ctbNoProducto_(it)) return; const k = loc + '|' + (it.codigo || it.nombre), A = ag[k] = ag[k] || { local: loc, codigo: it.codigo, nombre: it.nombre, unidades: 0, monto: 0 };
    A.unidades += signo * it.cant; A.monto += signo * it.monto; };
  let leidos = 0;
  L.forEach(c => { if (leidos >= 400) return; leidos++; const loc = FIN_PV[c.pv], sg = CTB_ES_NC(c.tipo) ? -1 : 1;
    ctbItems_(c.id).forEach(it => { add(loc, it, sg); add('Todos', it, sg); }); });
  const top = (loc, n) => Object.keys(ag).map(k => ag[k]).filter(a => a.local === loc && a.unidades > 0).sort((a, b) => b.unidades - a.unidades || b.monto - a.monto).slice(0, n)
    .map(a => ({ codigo: a.codigo, nombre: a.nombre, unidades: Math.round(a.unidades), monto: Math.round(a.monto), temporada: /SS27$/i.test(a.codigo) ? 'SS27' : 'fuera' }));
  return { desde: desde, hasta: hasta, comprobantes: leidos, palermo: top('Palermo', 15), lima: top('Lima', 10), janette: top('Janette', 10), todos: top('Todos', 10), leida: new Date().toISOString() };
}
/** Cobranzas pendientes: comprobantes del último año con saldo, agrupados por cliente (vencido / por vencer). */
function ctbCobranzas_() {
  const hasta = hoy_(), desde = sumarDias_(hasta, -365), cli = {};
  /* Notas de crédito con saldo = plata a favor del cliente: se descuenta de lo que debe (no se cobra dos veces). */
  ctbComprobantes_(desde, hasta, 150).filter(x => x.saldo > 0.5).forEach(x => {
    const k = x.cliente || 'Sin nombre', C = cli[k] = cli[k] || { cliente: k, saldo: 0, vencido: 0, aFavor: 0, comprobantes: 0, masViejo: null, franquicia: finFranq_(k) };
    if (CTB_ES_NC(x.tipo)) { C.aFavor += x.saldo; return; }
    C.saldo += x.saldo; C.comprobantes++; if (x.vence && x.vence < hasta) C.vencido += x.saldo; if (!C.masViejo || x.fecha < C.masViejo) C.masViejo = x.fecha; });
  Object.keys(cli).forEach(k => { const C = cli[k]; C.saldo = Math.max(0, C.saldo - C.aFavor); C.vencido = Math.min(C.vencido, C.saldo); });
  const L = Object.keys(cli).map(k => cli[k]).filter(c => c.saldo > 0.5).sort((a, b) => b.saldo - a.saldo);
  return { total: L.reduce((a, c) => a + c.saldo, 0), vencido: L.reduce((a, c) => a + c.vencido, 0), clientes: L.length, top: L.slice(0, 25).map(c => Object.assign({}, c, { saldo: Math.round(c.saldo), vencido: Math.round(c.vencido), aFavor: Math.round(c.aFavor) })), leida: new Date().toISOString() };
}
/** Productos FUERA DE TEMPORADA (el código no termina en SS27) con stock, para el Cyber Monday. Stock total y en HB Palermo / HB Lima. */
function ctbFueraTemporada_() {
  const C = []; for (let p = 1; p <= 80; p++) { const j = ctbGet_('/api/conceptos/search', { page: p }); const I = j.Items || []; C.push.apply(C, I); if (!I.length || C.length >= (j.TotalItems || 0)) break; }
  const dep = {}; try { const d = ctbGet_('/api/inventarios/getDepositos'), D = Array.isArray(d) ? d : (d.Items || []);
    [['palermo', /hb palermo/i], ['lima', /hb lima/i]].forEach(([k, re]) => { const x = D.find(y => re.test(y.Nombre)); if (!x) return; const m = dep[k] = {};
      for (let p = 1; p <= 80; p++) { const j = ctbGet_('/api/inventarios/getStockByDeposito', { id: x.Id, page: p }); const S = Array.isArray(j) ? j : (j.Items || []);
        S.forEach(s => { m[String(s.Codigo || '').trim()] = ctbNum_(s.StockActual); }); if (!S.length || Array.isArray(j) || Object.keys(m).length >= (j.TotalItems || 0)) break; } }); } catch (e) {}
  let vend = {}; try { const P = JSON.parse(PROPS.getProperty('CTB_PROD') || 'null'); if (P) P.todos.forEach(x => { vend[x.codigo] = x.unidades; }); } catch (e) {}
  return C.map(x => ({ codigo: String(x.Codigo || '').trim(), nombre: String(x.Nombre || '').trim(), stock: ctbNum_(x.Stock), precio: ctbNum_(x.PrecioFinal || x.Precio), costo: ctbNum_(x.CostoInterno), estado: String(x.Estado || '') }))
    .filter(x => !ctbNoProducto_(x) && !/SS27$/i.test(x.codigo) && x.stock > 0 && !/inactiv|baja/i.test(x.estado))
    .map(x => Object.assign(x, { palermo: dep.palermo ? (dep.palermo[x.codigo] || 0) : null, lima: dep.lima ? (dep.lima[x.codigo] || 0) : null, temporada: (x.codigo.match(/(SS|AW|FW|OI|PV)\d{2}$/i) || ['Anteriores'])[0].replace(/^[a-z]+\d+$/i, t => t.toUpperCase()),
      valorStock: Math.round(x.stock * x.precio) }))
    .sort((a, b) => b.stock - a.stock);
}
/** Recalcula y guarda (resumido) productos y cobranzas. Lo corre la actualización diaria y «Actualizar datos». */
function ctbActualizarResumenes_() {
  if (!ctbConfigurado_()) return null;
  const out = {};
  try { const P = ctbProductos_(7); PROPS.setProperty('CTB_PROD', JSON.stringify(P).slice(0, 8500)); out.productos = P.comprobantes; } catch (e) { out.productosError = String(e.message || e).slice(0, 150); }
  try { const K = ctbCobranzas_(); PROPS.setProperty('CTB_COB', JSON.stringify(K).slice(0, 8500)); out.cobranzas = K.clientes; } catch (e) { out.cobranzasError = String(e.message || e).slice(0, 150); }
  return out;
}
/** Para correr desde el editor: recalcula productos y cobranzas de Contabilium (solo lectura). */
function actualizarContabilium() { const r = ctbActualizarResumenes_(); console.log('CTB ' + JSON.stringify(r)); return r; }
/** Excel «Fuera de temporada · Cyber Monday» (permiso Administración y Finanzas). */
function descargaCyber(token) {
  const s = sesion_(token, 'finanzas'); if (!ctbConfigurado_()) throw new Error('Contabilium no está conectado.');
  const L = ctbFueraTemporada_();
  return { actualizado: new Date().toISOString(), generado: new Date().toISOString(), por: s.user.nombre, titulo: 'Fuera de temporada · Cyber Monday', archivo: 'Cyber-Monday-fuera-de-temporada',
    hojas: [{ nombre: 'Fuera de temporada', columnas: ['Código', 'Producto', 'Temporada', 'Stock total', 'HB Palermo', 'HB Lima', 'Precio', 'Valor del stock', 'Vendidas última semana'], dinero: [6, 7],
      filas: L.map(x => [x.codigo, x.nombre, x.temporada, x.stock, x.palermo == null ? '' : x.palermo, x.lima == null ? '' : x.lima, Math.round(x.precio), x.valorStock, (JSON.parse(PROPS.getProperty('CTB_PROD') || '{"todos":[]}').todos.find(t => t.codigo === x.codigo) || {}).unidades || 0]) },
      { nombre: 'Resumen por temporada', columnas: ['Temporada', 'Productos', 'Unidades', 'Valor del stock'], dinero: [3],
        filas: Object.entries(L.reduce((o, x) => { const t = o[x.temporada] = o[x.temporada] || [0, 0, 0]; t[0]++; t[1] += x.stock; t[2] += x.valorStock; return o; }, {})).sort((a, b) => b[1][2] - a[1][2]).map(([k, v]) => [k, v[0], v[1], v[2]]) }] };
}
/** Editor: relee Templete + Contabilium (sin caché) y muestra un resumen de control. Solo lectura. */
function refrescarTemplete() {
  const hoy = hoy_(); ['CTBV_' + finMesAnt_(hoy.slice(0, 7)) + '-01_' + hoy, 'FIN38_R'].forEach(k => { try { CACHE.remove(k); } catch (e) {} });
  const out = actualizacionDiaria();
  const R = JSON.parse(CACHE.get('FIN38_R') || '{}');
  const d = dbxDescargar_(), F = finLeerData_(d.blob);
  const busca = F.filter(x => /0005-00007507/.test(x.factura || '') || (/eizikovit/i.test(x.contraparte || '') && x.tipo === 'egreso')).map(x => [x.fila, x.fecha, x.tipo, x.rubro, x.cuenta, (x.contraparte || '').slice(0, 25), x.factura, Math.round(x.monto)]);
  const A = R.anticipos || {}, D = R.duplicados || { duplicados: [], mismoNumero: [] }, K = (R.contabilium || {}).conciliacion || [];
  Logger.log('REF1 ' + JSON.stringify({ act: out.map(o => o.planilla + ':' + (o.ok ? 'ok' : o.error)), archivo: R.archivo, modificado: R.modificado, filas: R.filas, claves: Object.keys(R) }));
  Logger.log('REF2 ' + JSON.stringify({ dupN: D.duplicados.length, deMas: Math.round(D.montoDeMas || 0), mismoNumero: D.mismoNumero.length, lista: D.duplicados.slice(0, 12).map(x => [x.factura, String(x.cliente || '').slice(0, 20), x.filas]), busca: busca }).slice(0, 6000));
  Logger.log('REF3 ' + JSON.stringify({ alertas: (R.alertas || []).map(a => String(a.texto).slice(0, 160)), recomendaciones: (R.recomendaciones || []).map(t => String(t).slice(0, 160)) }).slice(0, 6000));
  Logger.log('REF4 ' + JSON.stringify({ antClaves: Object.keys(A), clientes: (A.clientes || A.lista || []).slice(0, 10).map(c => [c.cliente, Math.round(c.anticipado || 0), Math.round(c.pedido || 0), Math.round(c.pagado || 0), (c.avisos || []).map(a => String(a.texto || a).slice(0, 90))]), conc: K.map(c => [c.mes, (c.faltaCargar || []).length, Math.round(c.montoFalta || 0), (c.diferencias || []).length, (c.noEnCtb || []).length]) }).slice(0, 7000));
  Logger.log('REF5 ' + JSON.stringify({ mes: R.mes, ultimo: R.ultimo, meses: (R.meses || []).slice(-4) }).slice(0, 4000));
}
/* =================== 3.9 · Ventas por canal (Contabilium, SOLO LECTURA) ===================
   Palermo = punto de venta 0001 · Lima = 0005 · Janette = 0007 · Web = comprobantes con Origen «TiendaNube» (Contabilium los
   factura por el 0005, por eso se separan por el origen y no por el número). Las facturas a grandes cuentas (franquicias y
   mayoristas de «Control ingreso») van aparte para no inflar el local que facturó. 0008 (postventa) no es un canal de venta.
   Se guarda un resumen por día y canal en la hoja «VentasCanal» (de la app): así comparar contra el año pasado no obliga a leer
   miles de comprobantes en cada consulta. La actualización diaria relee los últimos 10 días (notas de crédito tardías). */
const CANALES = ['Palermo', 'Lima', 'Janette', 'Web'];
const CANAL_PV = { '0001': 'Palermo', '0005': 'Lima', '0007': 'Janette' };
const CANAL_GC = 'Grandes cuentas';
const VC_HIST_DESDE = '2025-01-01';
function gcNombres_() {
  const S = {}; try { (control_(false).clientes || []).forEach(c => { const n = finNorm_(c.nombre || ''); if (n.length >= 4) S[n] = 1; }); } catch (e) {}
  return S;
}
function esGranCuenta_(razon, nombres) { const n = finNorm_(razon || ''); return !!finFranq_(razon) || !!(n && nombres[n]); }
function canalDe_(c, nombres) {
  if (/tienda\s*nube|tiendanube/i.test(String(c.Origen || ''))) return 'Web';
  const pv = String(c.Numero || '').slice(0, 4);
  if (!CANAL_PV[pv]) return null;
  if (esGranCuenta_(c.RazonSocial, nombres)) return CANAL_GC;
  return CANAL_PV[pv];
}
const vcEsVenta_ = t => /^(COT|FC)/.test(t), vcEsNc_ = t => /^NC/.test(t);
/** Lee los comprobantes de un rango (crudos) y los agrupa por día y canal. */
function vcLeer_(desde, hasta, nombres, limiteMs) {
  const t0 = Date.now(), raw = []; let completo = true;
  for (let p = 1; p <= 400; p++) {
    if (limiteMs && Date.now() - t0 > limiteMs) { completo = false; break; }
    const j = ctbGet_('/api/comprobantes/search', { fechaDesde: desde, fechaHasta: hasta, page: p }), I = j.Items || [];
    if (!I.length) break; raw.push.apply(raw, I); if (raw.length >= (Number(j.TotalItems) || 0)) break;
  }
  const canalId = {}; raw.forEach(c => { if (vcEsVenta_(String(c.TipoFc || '').toUpperCase())) canalId[c.Id] = canalDe_(c, nombres); });
  const agg = {};
  raw.forEach(c => { const t = String(c.TipoFc || '').toUpperCase(), v = vcEsVenta_(t), nc = vcEsNc_(t); if (!v && !nc) return;
    const canal = (nc && c.IdComprobanteAsociado && canalId[c.IdComprobanteAsociado]) || canalDe_(c, nombres); if (!canal) return;
    const f = String(c.FechaEmision || '').slice(0, 10); if (!/^\d{4}-\d\d-\d\d$/.test(f)) return;
    const k = f + '|' + canal, A = agg[k] = agg[k] || { clave: k, fecha: f, canal: canal, ventas: 0, comprobantes: 0, nc: 0 }, m = Math.abs(ctbNum_(c.ImporteTotalNeto));
    if (v) { A.ventas += m; A.comprobantes++; } else { A.ventas -= m; A.nc += m; } });
  return { filas: Object.keys(agg).map(k => agg[k]), completo: completo, leidos: raw.length };
}
/** Reemplaza en la hoja los días [desde, hasta] por los nuevos. */
function vcGuardar_(rangos, nuevas) {
  lock_(() => {
    const ahora = new Date().toISOString(), dentro = f => rangos.some(r => f >= r[0] && f <= r[1]);
    const L = tAll_('VentasCanal').filter(r => !dentro(r.fecha)).concat(nuevas.map(r => Object.assign(r, { ventas: Math.round(r.ventas), nc: Math.round(r.nc), actualizado: ahora })))
      .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.canal.localeCompare(b.canal));
    const sh = tabla_('VentasCanal'), nc = TABLAS.VentasCanal.length + 1, n = sh.getLastRow() - 1;
    if (n > 0) sh.getRange(2, 1, n, nc).clearContent();
    if (L.length) sh.getRange(2, 1, L.length, nc).setValues(L.map(o => filaDe_('VentasCanal', o)));
    delete MEMO_.VentasCanal;
  });
}
/** Actualización diaria: últimos 10 días; si falta el historial (desde 2025), lo completa por meses con límite de tiempo. */
function ventasCanalSync_(conHistorial) {
  if (!ctbConfigurado_()) return null;
  const hoy = hoy_(), nombres = gcNombres_(), out = {};
  const d = sumarDias_(hoy, -10), R = vcLeer_(d, hoy, nombres);
  vcGuardar_([[d, hoy]], R.filas); out.ultimosDias = R.filas.length;
  if (conHistorial && PROPS.getProperty('VC_HIST') !== 'ok') try { out.historial = ventasCanalHistorial_(240000); } catch (e) { out.historialError = String(e.message || e).slice(0, 150); }
  PROPS.setProperty('VC_SYNC', JSON.stringify({ ts: new Date().toISOString(), ok: true }));
  return out;
}
function ventasCanalHistorial_(limiteMs) {
  const t0 = Date.now(), hoy = hoy_(), nombres = gcNombres_();
  let m = PROPS.getProperty('VC_HIST_PROX') || VC_HIST_DESDE.slice(0, 7); const rangos = [], filas = [];
  const fin = sumarDias_(hoy, -11).slice(0, 7);
  while (m <= fin && Date.now() - t0 < limiteMs) {
    const d = m + '-01', [y, mo] = m.split('-').map(Number), h = Utilities.formatDate(new Date(y, mo, 0), TZ, 'yyyy-MM-dd'), hh = h > sumarDias_(hoy, -11) ? sumarDias_(hoy, -11) : h;
    const R = vcLeer_(d, hh, nombres, Math.max(20000, limiteMs - (Date.now() - t0))); if (!R.completo) break;
    rangos.push([d, hh]); filas.push.apply(filas, R.filas);
    m = mo === 12 ? (y + 1) + '-01' : y + '-' + ('0' + (mo + 1)).slice(-2);
  }
  if (rangos.length) vcGuardar_(rangos, filas);
  PROPS.setProperty('VC_HIST_PROX', m);
  if (m > fin) PROPS.setProperty('VC_HIST', 'ok');
  return { hasta: m, meses: rangos.length, completo: m > fin };
}
/** Editor: actualiza todo lo que viene de Contabilium y de las planillas vinculadas SIN leer el Templete (solo lectura en todas las fuentes). */
function actualizarSinTemplete() {
  SS_ = null; MEMO_ = {}; const out = [], paso = (n, f) => { try { out.push(n + ': ' + JSON.stringify(f()).slice(0, 160)); } catch (e) { out.push(n + ': ERROR ' + String(e.message || e).slice(0, 160)); } };
  paso('Control ingreso', () => { const d = control_(true, true); return { clientes: (d.clientes || []).length, modificado: d.modificado }; });
  paso('Ventas Palermo (cierres)', () => { const c = sync_(null); return { ok: c.ok, modificado: c.modificado }; });
  paso('Contabilium ventas por canal', () => ventasCanalSync_(true));
  paso('Contabilium comprobantes (control vs informe)', () => comprobantesSync_(150000));
  paso('Contabilium productos y cobranzas', () => ctbActualizarResumenes_());
  paso('Stock HB Palermo (sorteo)', () => stockPalermoArt_(true).length + ' artículos con stock');
  paso('Noticias y dólar', () => { CACHE.remove('CTX37'); const x = contexto37_(); return { dolar: !!x.dolar, noticias: x.noticias.map(n => n.titulo) }; });
  try { CACHE.remove('FIN38_R'); } catch (e) {}
  console.log('ACT ' + out.join(' | ')); return out;
}
/** Para correr desde el editor (o la actualización diaria): completa el historial de ventas por canal desde enero 2025. */
function ventasCanalHistorial() { const r = ventasCanalHistorial_(330000); console.log('VC ' + JSON.stringify(r)); return r; }

/* =================== 3.9c · Comprobantes de Contabilium: el mismo número que su informe (SOLO LECTURA) ===================
   Copia de lectura de cada comprobante de venta (COT, FC, ND y notas de crédito) de Palermo 0001, Lima 0005 y Janette 0007
   desde enero 2026, en la hoja «Comprobantes» de la app. Con eso:
   · «Facturado» da exactamente lo mismo que el informe «Ventas por punto de venta» de Contabilium (cantidad, sin IVA y con IVA).
     Las notas de crédito restan en el mes en que se emiten, igual que en Contabilium.
   · Se separa en canales: Web (Tiendanube) y Grandes cuentas se facturan por el 0005 y se muestran aparte.
   · Se concilia contra el Templete factura por factura, todos los meses, y se explica cada diferencia.
   Ojo con los nombres de la API: «ImporteTotalNeto» es el total CON IVA y «ImporteTotalBruto» el total SIN IVA (verificado contra
   el informe de septiembre 2026: Palermo $ 10.863.674,75 con IVA / $ 8.978.243,57 sin IVA).
   Los meses cerrados se leen una vez; el mes anterior y el actual se releen en cada actualización. */
const CMP_DESDE = '2026-01';
const cmpTipo_ = t => /^NC/.test(t) ? 'nc' : /^(COT|FC|ND)/.test(t) ? 'venta' : null;
const cmpR2_ = n => Math.round(n * 100) / 100;
const mesSig_ = m => { const y = Number(m.slice(0, 4)), mm = Number(m.slice(5, 7)); return mm === 12 ? (y + 1) + '-01' : y + '-' + ('0' + (mm + 1)).slice(-2); };
/** Lee todos los comprobantes de venta de un mes. Devuelve null si se terminó el tiempo (se retoma en la próxima actualización). */
function cmpLeerMes_(mes, nombres, limiteMs) {
  const y = Number(mes.slice(0, 4)), mo = Number(mes.slice(5, 7)), h = Utilities.formatDate(new Date(y, mo, 0), TZ, 'yyyy-MM-dd'), hasta = h > hoy_() ? hoy_() : h;
  const t0 = Date.now(), raw = [];
  for (let p = 1; p <= 200; p++) {
    if (limiteMs && Date.now() - t0 > limiteMs) return null;
    const j = ctbGet_('/api/comprobantes/search', { fechaDesde: mes + '-01', fechaHasta: hasta, page: p }), I = j.Items || [];
    if (!I.length) break; raw.push.apply(raw, I); if (raw.length >= (Number(j.TotalItems) || 0)) break;
  }
  const canalId = {}; raw.forEach(c => { if (cmpTipo_(String(c.TipoFc || '').toUpperCase()) === 'venta') canalId[c.Id] = canalDe_(c, nombres); });
  const ahora = new Date().toISOString(), out = [], vistos = {};
  raw.forEach(c => { const t = String(c.TipoFc || '').toUpperCase(), cl = cmpTipo_(t), num = String(c.Numero || '').trim(), pv = num.slice(0, 4);
    if (!cl || !CANAL_PV[pv] || vistos[c.Id]) return;
    const f = String(c.FechaEmision || '').slice(0, 10); if (f.slice(0, 7) !== mes) return;
    vistos[c.Id] = 1; const sg = cl === 'nc' ? -1 : 1;
    out.push({ clave: String(c.Id), fecha: f, mes: mes, pv: pv, tipo: t, numero: num,
      canal: (cl === 'nc' && c.IdComprobanteAsociado && canalId[c.IdComprobanteAsociado]) || canalDe_(c, nombres) || CANAL_PV[pv],
      cliente: String(c.RazonSocial || '').trim().slice(0, 60), conIva: sg * cmpR2_(Math.abs(ctbNum_(c.ImporteTotalNeto))), sinIva: sg * cmpR2_(Math.abs(ctbNum_(c.ImporteTotalBruto))),
      asociado: c.IdComprobanteAsociado ? String(c.IdComprobanteAsociado) : '', origen: String(c.Origen || '').slice(0, 20), actualizado: ahora });
  });
  return out;
}
/** Reemplaza en la hoja los meses leídos por sus comprobantes nuevos. */
function cmpGuardar_(meses, nuevas) {
  lock_(() => {
    const L = tAll_('Comprobantes').filter(r => meses.indexOf(r.mes) < 0).concat(nuevas).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.numero.localeCompare(b.numero));
    const sh = tabla_('Comprobantes'), nc = TABLAS.Comprobantes.length + 1, n = sh.getLastRow() - 1;
    if (n > 0) sh.getRange(2, 1, n, nc).clearContent();
    if (L.length) sh.getRange(2, 1, L.length, nc).setValues(L.map(o => filaDe_('Comprobantes', o)));
    delete MEMO_.Comprobantes;
  });
}
/** Actualiza la hoja: siempre el mes actual y el anterior; los meses que falten (desde enero 2026), con límite de tiempo. */
function comprobantesSync_(limiteMs, todos) {
  if (!ctbConfigurado_()) return null;
  const t0 = Date.now(), mesHoy = hoy_().slice(0, 7), mesAnt = finMesAnt_(mesHoy), nombres = gcNombres_();
  let est = {}; try { est = JSON.parse(PROPS.getProperty('CMP_MESES') || '{}'); } catch (e) {}
  const lista = []; for (let m = CMP_DESDE; m <= mesHoy; m = mesSig_(m)) lista.push(m);
  const orden = [mesHoy, mesAnt].filter(m => m >= CMP_DESDE).concat(lista.filter(m => m < mesAnt && (todos || !est[m])));
  const leidos = [], filas = [];
  for (let i = 0; i < orden.length; i++) {
    const quedan = limiteMs - (Date.now() - t0); if (quedan < 15000) break;
    const r = cmpLeerMes_(orden[i], nombres, quedan); if (!r) break;
    leidos.push(orden[i]); filas.push.apply(filas, r);
  }
  if (leidos.length) { cmpGuardar_(leidos, filas); const ts = new Date().toISOString(); leidos.forEach(m => est[m] = ts); PROPS.setProperty('CMP_MESES', JSON.stringify(est)); }
  return { leidos: leidos, comprobantes: filas.length, pendientes: lista.filter(m => !est[m]) };
}
/** Editor: lee (o relee) todos los meses desde enero 2026. Solo lectura en Contabilium. */
function comprobantesHistorial() { const r = comprobantesSync_(330000, true); console.log('CMP ' + JSON.stringify(r)); return r; }
/** Resumen por mes: por punto de venta (igual al informe de Contabilium) y por canal. */
function ctbMensual_() {
  const L = tAll_('Comprobantes'); if (!L.length) return null;
  let est = {}; try { est = JSON.parse(PROPS.getProperty('CMP_MESES') || '{}'); } catch (e) {}
  const M = {}, z = () => ({ comprobantes: 0, conIva: 0, sinIva: 0, nc: 0, ncConIva: 0 });
  const suma = (o, r) => { o.comprobantes++; o.conIva += r.conIva; o.sinIva += r.sinIva; if (r.conIva < 0) { o.nc++; o.ncConIva -= r.conIva; } };
  L.forEach(r => { const m = M[r.mes] = M[r.mes] || { mes: r.mes, pv: {}, canal: {}, total: z() };
    suma(m.pv[r.pv] = m.pv[r.pv] || z(), r); suma(m.canal[r.canal] = m.canal[r.canal] || z(), r); suma(m.total, r); });
  const red = o => { o.conIva = cmpR2_(o.conIva); o.sinIva = cmpR2_(o.sinIva); o.ncConIva = cmpR2_(o.ncConIva); return o; };
  const meses = Object.keys(M).sort().map(k => { const m = M[k]; Object.keys(m.pv).forEach(p => red(m.pv[p])); Object.keys(m.canal).forEach(c => red(m.canal[c])); red(m.total); m.leido = est[k] || null; return m; });
  return { meses: meses, comprobantes: L.length, leido: Object.keys(est).map(k => est[k]).sort().pop() || null };
}
/** Las facturas (con sus notas de crédito aplicadas) armadas desde la hoja, con la misma forma que ctbVentas_. */
function cmpVentas_() {
  const L = tAll_('Comprobantes'), porId = {}, fc = {}, sueltas = [];
  L.filter(r => r.conIva >= 0).forEach(r => { const k = finClave_(r.numero); if (!k) return;
    const f = fc[k] = fc[k] || { clave: k, pv: r.pv, fecha: r.fecha, mes: r.mes, cliente: r.cliente, canal: r.canal, total: 0, sinIva: 0, nc: 0, neto: 0, veces: 0 };
    f.total += r.conIva; f.sinIva += r.sinIva; f.veces++; porId[r.clave] = f; });
  L.filter(r => r.conIva < 0).forEach(n => { const f = n.asociado && porId[n.asociado];
    if (f) { f.nc += -n.conIva; (f.ncMeses = f.ncMeses || {})[n.mes] = (f.ncMeses[n.mes] || 0) - n.conIva; }
    else sueltas.push({ clave: finClave_(n.numero), mes: n.mes, fecha: n.fecha, cliente: n.cliente, total: -n.conIva, pv: n.pv, canal: n.canal }); });
  const F = Object.keys(fc).map(k => { const f = fc[k]; f.neto = Math.max(0, f.total - f.nc); return f; });
  return { facturas: F, ncSueltas: sueltas, leida: (ctbMensual_() || {}).leido || new Date().toISOString() };
}
/** Control mes a mes: lo facturado (igual al informe de Contabilium) contra lo registrado como venta en el Templete, con cada
    diferencia explicada. La suma de los motivos da exactamente la diferencia (si no, queda en «sin explicar»). */
function finControlMeses_(F, CM, V, maxEj) {
  maxEj = maxEj || 40;
  const mesHoy = hoy_().slice(0, 7), anio = mesHoy.slice(0, 4), tplMes = {}, tplFact = {};
  F.filter(x => !x.origen && x.tipo === 'ingreso' && /^ventas$/i.test(x.rubro) && x.mes && x.mes.slice(0, 4) === anio && x.mes <= mesHoy).forEach(x => {
    const t = tplMes[x.mes] = tplMes[x.mes] || { ventas: 0, anticipos: 0, sinFactura: 0, otroPv: 0, filas: 0 }; t.filas++;
    if (/anticipo/i.test(x.cuenta + ' ' + x.detalle)) { t.anticipos += x.monto; return; }
    t.ventas += x.monto; const k = finClave_(x.factura);
    if (!k) t.sinFactura += x.monto; else if (!FIN_PV[k.slice(0, 4)]) t.otroPv += x.monto; else (tplFact[k] = tplFact[k] || []).push(x); });
  const porClave = {}; V.facturas.forEach(f => { porClave[f.clave] = f; }); const PSF = finPagosSinFactura_(F, porClave);
  return CM.meses.filter(m => m.mes.slice(0, 4) === anio && m.mes <= mesHoy).map(m => {
    const T = tplMes[m.mes] || { ventas: 0, anticipos: 0, sinFactura: 0, otroPv: 0, filas: 0 };
    const r = { mes: m.mes, informe: m.total, pv: m.pv, canal: m.canal, templete: T, motivos: {}, ejemplos: {} };
    const add = (k, monto, ej) => { const o = r.motivos[k] = r.motivos[k] || { monto: 0, n: 0 }; o.monto += monto; o.n++; if (ej) { const e = r.ejemplos[k] = r.ejemplos[k] || []; if (e.length < maxEj) e.push(ej); } };
    let ncSobreMes = 0;
    V.facturas.filter(f => f.mes === m.mes).forEach(f => {   // notas de crédito emitidas hasta este mes (las posteriores se explican en su mes)
      const ncH = Object.keys(f.ncMeses || {}).filter(k => k <= m.mes).reduce((a, k) => a + f.ncMeses[k], 0), neto = f.total - ncH, t = tplFact[f.clave]; ncSobreMes += ncH;
      if (!t) { if (Math.abs(neto) < 1) return; if (finFranq_(f.cliente) || f.canal === CANAL_GC) add('grandesCuentas', neto, [f.clave, f.cliente, neto]); else if (cobradoAntes_(PSF, f.cliente, m.mes)) add('cobradaAntes', neto, [f.clave, f.cliente, neto, cobradoAntes_(PSF, f.cliente, m.mes).map(x => x.mes + ' fila ' + x.fila).join(' · ')]); else add('faltaCargar', neto, [f.clave, f.cliente, neto]); return; }
      const enMes = t.filter(x => x.mes === m.mes), mt = enMes.reduce((a, x) => a + x.monto, 0);
      if (!enMes.length) { add('cargadaOtroMes', neto, [f.clave, f.cliente, neto, t.map(x => x.mes).filter((v, i, a) => a.indexOf(v) === i).join(' / ')]); return; }
      if (Math.abs(mt - neto) >= 1) add(t.length > 1 && enMes.length > 1 ? 'repetidaEnTemplete' : 'importeDistinto', neto - mt, [f.clave, f.cliente, neto, mt]); });
    Object.keys(tplFact).forEach(k => { const enMes = tplFact[k].filter(x => x.mes === m.mes); if (!enMes.length) return;
      const mt = enMes.reduce((a, x) => a + x.monto, 0), f = porClave[k];
      if (!f) add('noEstaEnContabilium', -mt, [k, finCli_(enMes[0].contraparte), mt, 'fila ' + enMes.map(x => x.fila).join(', ')]);
      else if (f.mes !== m.mes) add('deOtroMes', -mt, [k, f.cliente, mt, 'facturada en ' + f.mes]); });
    const ncMes = m.total.ncConIva; if (Math.abs(ncSobreMes - ncMes) >= 1) add('notasCreditoOtroMes', ncSobreMes - ncMes, null);
    if (T.sinFactura) add('sinNumeroFactura', -T.sinFactura, null);
    if (T.otroPv) add('otroPuntoVenta', -T.otroPv, null);
    Object.keys(r.motivos).forEach(k => { r.motivos[k].monto = Math.round(r.motivos[k].monto); });
    r.diferencia = Math.round(m.total.conIva - T.ventas);
    r.sinExplicar = Math.round(r.diferencia - Object.keys(r.motivos).reduce((a, k) => a + r.motivos[k].monto, 0));
    return r;
  });
}
const CANALES_TODOS = ['Palermo', 'Lima', 'Janette', 'Web', 'Grandes cuentas'];
/** Ventas por canal FACTURADAS (Contabilium, con IVA) para los mismos meses del cuadro por sector. */
function finFacturadoCanal_(CM, meses) {
  const anio = meses[meses.length - 1].slice(0, 4), por = {}; CM.meses.forEach(m => { por[m.mes] = m; });
  const filas = CANALES_TODOS.map(c => ({ canal: c, valores: meses.map(m => por[m] && por[m].canal[c] ? Math.round(por[m].canal[c].conIva) : 0),
    anio: Math.round(CM.meses.filter(m => m.mes.slice(0, 4) === anio && m.mes <= meses[meses.length - 1]).reduce((a, m) => a + (m.canal[c] ? m.canal[c].conIva : 0), 0)) }))
    .filter(f => f.anio || f.valores.some(Boolean));
  const tot = k => meses.map(m => por[m] ? Math.round(por[m].total[k]) : 0);
  return { meses: meses, filas: filas, totalConIva: tot('conIva'), totalSinIva: tot('sinIva'), comprobantes: meses.map(m => por[m] ? por[m].total.comprobantes : 0) };
}

const pctVs_ = (a, b) => b > 0 ? Math.round((a - b) / b * 1000) / 10 : null;
/** KPIs por canal: hoy, ayer, mes, año; vs. mismo período del mes anterior y del año pasado; ticket promedio; participación. */
function kpiCanales_(hoy, sinGC) {
  const R = tAll_('VentasCanal'); if (!R.length) return null;
  hoy = hoy || hoy_();
  const y = hoy.slice(0, 4), m = hoy.slice(0, 7), dd = hoy.slice(8, 10), ya = String(Number(y) - 1), ayer = sumarDias_(hoy, -1);
  const ma = finMesAnt_(m), [may, mam] = ma.split('-').map(Number), finMa = Utilities.formatDate(new Date(may, mam, 0), TZ, 'yyyy-MM-dd');
  const maMismo = (ma + '-' + dd) > finMa ? finMa : ma + '-' + dd;
  const mAA = ya + '-' + m.slice(5), finMAA = Utilities.formatDate(new Date(Number(ya), Number(m.slice(5)), 0), TZ, 'yyyy-MM-dd');
  const mAAMismo = (mAA + '-' + dd) > finMAA ? finMAA : mAA + '-' + dd, yaMismo = ya + hoy.slice(4);
  const desdeHist = R.reduce((a, r) => r.fecha < a ? r.fecha : a, '9999').slice(0, 7) + '-01';   // el historial se carga por meses completos
  const S = (canal, d, h) => { let v = 0, n = 0; R.forEach(r => { if (r.canal === canal && r.fecha >= d && r.fecha <= h) { v += r.ventas; n += r.comprobantes; } }); return { v: Math.round(v), n: n, ticket: n ? Math.round(v / n) : null }; };
  const conHist = d => desdeHist <= d;   // solo se compara si hay historia para ese período
  const canales = CANALES.concat(sinGC ? [] : [CANAL_GC]).map(c => {
    const o = { canal: c, hoy: S(c, hoy, hoy), ayer: S(c, ayer, ayer), mes: S(c, m + '-01', hoy), mesAntMismo: conHist(ma + '-01') ? S(c, ma + '-01', maMismo) : null,
      mesAnt: conHist(ma + '-01') ? S(c, ma + '-01', finMa) : null, mesAnioAnt: conHist(mAA + '-01') ? S(c, mAA + '-01', mAAMismo) : null,
      anio: S(c, y + '-01-01', hoy), anioAntMismo: conHist(ya + '-01-01') ? S(c, ya + '-01-01', yaMismo) : null, anioAnt: conHist(ya + '-01-01') ? S(c, ya + '-01-01', ya + '-12-31') : null };
    o.vsMesAnt = o.mesAntMismo ? pctVs_(o.mes.v, o.mesAntMismo.v) : null; o.vsAnioAnt = o.mesAnioAnt ? pctVs_(o.mes.v, o.mesAnioAnt.v) : null;
    o.vsAnioAntAcum = o.anioAntMismo ? pctVs_(o.anio.v, o.anioAntMismo.v) : null;
    o.ticketVsMesAnt = o.mes.ticket && o.mesAntMismo && o.mesAntMismo.ticket ? pctVs_(o.mes.ticket, o.mesAntMismo.ticket) : null;
    const diasMes = Number(dd); o.promDiaMes = diasMes > 1 ? Math.round((o.mes.v - o.hoy.v) / (diasMes - 1)) : null;
    // Los locales facturan en Contabilium por tandas (no todos los días): se informa el último día facturado y la alerta de
    // «día flojo» solo se usa en canales que facturan a diario (p. ej. la web). Mes y año sí son completos.
    const filasC = R.filter(r => r.canal === c && r.ventas > 0 && r.fecha <= hoy), u = filasC[filasC.length - 1];
    o.ultimo = u ? { fecha: u.fecha, v: Math.round(u.ventas), n: u.comprobantes } : null;
    const d14 = sumarDias_(hoy, -14); o.diasConVenta14 = new Set(filasC.filter(r => r.fecha >= d14 && r.fecha < hoy).map(r => r.fecha)).size; o.facturaDiaria = o.diasConVenta14 >= 11;
    o.conDatos = !!(o.mes.v || o.anio.v || (o.mesAntMismo && o.mesAntMismo.v)); return o; }).filter(o => o.conDatos);
  if (!canales.length) return null;
  const totMes = canales.reduce((a, c) => a + Math.max(0, c.mes.v), 0), totAnio = canales.reduce((a, c) => a + Math.max(0, c.anio.v), 0);
  canales.forEach(c => { c.partMes = totMes ? Math.round(Math.max(0, c.mes.v) / totMes * 1000) / 10 : null; c.partAnio = totAnio ? Math.round(Math.max(0, c.anio.v) / totAnio * 1000) / 10 : null; });
  const sumK = k => canales.reduce((a, c) => a + (c[k] ? c[k].v : 0), 0);
  // Las variaciones del total se calculan solo con los canales que tienen dato en los dos períodos (un canal nuevo no infla la comparación).
  const vsK = (act, ref) => { const cs = canales.filter(c => c[ref] && c[ref].v > 0); if (!cs.length) return null; const a = cs.reduce((t, c) => t + c[act].v, 0), b = cs.reduce((t, c) => t + c[ref].v, 0); return { v: b, pct: pctVs_(a, b), canales: cs.length }; };
  const total = { mes: totMes, anio: totAnio, hoy: sumK('hoy'), ayer: sumK('ayer') }, m1 = vsK('mes', 'mesAntMismo'), m2 = vsK('mes', 'mesAnioAnt'), m3 = vsK('anio', 'anioAntMismo');
  total.mesAntMismo = m1 && m1.v; total.mesAnioAnt = m2 && m2.v; total.anioAntMismo = m3 && m3.v;
  total.vsMesAnt = m1 ? m1.pct : null; total.vsAnioAnt = m2 ? m2.pct : null; total.vsAnioAntAcum = m3 ? m3.pct : null;
  total.comparaParcial = [m1, m2, m3].some(x => x && x.canales < canales.length);
  return { hoy: hoy, mes: m, mesAnt: ma, anioAnt: ya, desde: desdeHist, canales: canales, total: total, acciones: accionesCanal_(canales, hoy), sync: JSON.parse(PROPS.getProperty('VC_SYNC') || 'null'),
    fuente: 'Contabilium (solo lectura): Palermo 0001 · Lima 0005 · Janette 0007 · Web = origen Tienda Nube · Grandes cuentas = clientes de «Control ingreso» y franquicias. Ventas netas de notas de crédito.' };
}
/** Acciones comerciales por canal para días o meses flojos (siempre con el dato que las justifica). */
const ACC_CANAL = {
  Palermo: ['Activar a las clientas frecuentes de Palermo', 'Mandar por WhatsApp las novedades SS27 con foto a las clientas que compraron en los últimos 90 días e invitarlas al showroom; reforzar vidriera y probadores con lo que más rota.'],
  Lima: ['Mover el salón de Lima', 'Armar exhibición con los artículos de mayor rotación y una promo por cantidad (2da unidad) para la clienta de paso; difundir el stock disponible.'],
  Janette: ['Reforzar el punto Janette', 'Reponer talles faltantes de los más vendidos y coordinar una acción en el punto (prenda destacada, cartel de novedades).'],
  Web: ['Empujar la tienda online', 'Campaña en Instagram y mail con los 10 más vendidos, revisar que el stock publicado en Tienda Nube esté al día y probar envío gratis desde un monto.'],
  'Grandes cuentas': ['Llamar a las grandes cuentas', 'Contactar a las cuentas con pedido o saldo pendiente para cerrar reposición y cobro antes de fin de mes.']
};
function accionesCanal_(canales, hoy) {
  const out = [], ayerNom = NOMBRE_DIA[new Date(sumarDias_(hoy, -1) + 'T12:00:00Z').getUTCDay()];
  canales.forEach(c => { const A = ACC_CANAL[c.canal]; if (!A) return;
    if (c.vsMesAnt != null && c.vsMesAnt <= -10) out.push({ canal: c.canal, prioridad: c.vsMesAnt <= -25 ? 1 : 2, titulo: A[0], accion: A[1], porQue: c.canal + ' lleva ' + $_(c.mes.v) + ' en el mes, ' + Math.abs(c.vsMesAnt) + ' % menos que el mes anterior a esta altura.' });
    else if (c.facturaDiaria && c.promDiaMes && c.canal !== CANAL_GC && c.ayer.v < c.promDiaMes * 0.5)
      out.push({ canal: c.canal, prioridad: 3, titulo: A[0], accion: A[1], porQue: 'Ayer (' + ayerNom + ') ' + c.canal + ' vendió ' + $_(c.ayer.v) + ', menos de la mitad de su promedio diario del mes (' + $_(c.promDiaMes) + ').' }); });
  return out.sort((a, b) => a.prioridad - b.prioridad);
}
/** Grandes cuentas (franquicias y mayoristas) desde «Control ingreso Nueva temporada 27»: pedido, entregado, cobrado, saldo y quiénes más compran. */
function kpiGrandesCuentas_(D) {
  const L = (D && D.clientes || []).filter(c => c.seCuenta !== false); if (!L.length) return null;
  const u = (c, a, b) => v37_(c, a, b), sum = f => L.reduce((t, c) => t + (f(c) || 0), 0);
  const conPago = L.filter(c => c.pagado != null);
  const o = { clientes: L.length, pedidoU: sum(c => u(c, 'pedidoTotal', 'pedido')), entregadoU: sum(c => u(c, 'despachado', 'entregado')),
    pedido$: sum(c => c.montoTotal || c.monto), entregado$: sum(c => c.montoDespachado), cobrado: conPago.length ? sum(c => c.pagado) : null, saldo: conPago.length ? sum(c => c.faltaPagar) : null };
  o.avance = o.pedidoU ? Math.round(o.entregadoU / o.pedidoU * 100) : null;
  o.top = L.slice().sort((a, b) => ((b.montoTotal || 0) - (a.montoTotal || 0)) || (u(b, 'pedidoTotal', 'pedido') - u(a, 'pedidoTotal', 'pedido'))).slice(0, 5)
    .map(c => ({ nombre: c.nombre, tipo: c.tipo || '', pedido$: c.montoTotal || null, pedidoU: u(c, 'pedidoTotal', 'pedido'), entregadoU: u(c, 'despachado', 'entregado'), cobrado: c.pagado, saldo: c.faltaPagar }));
  o.lista = L.map(c => [c.nombre, c.tipo || '', u(c, 'pedidoTotal', 'pedido'), u(c, 'despachado', 'entregado'), c.montoTotal || null, c.montoDespachado || null, c.pagado, c.faltaPagar]);
  return o;
}
/** Excel / PDF: ventas por día y canal (los últimos 90 días), por mes, y grandes cuentas. Las listas largas van acá, no en pantalla. */
function descargaCanales(token) {
  const s = sesion_(token, 'kpi'), hoy = hoy_(), R = tAll_('VentasCanal');
  const desde = sumarDias_(hoy, -90), dias = {}, meses = {};
  R.forEach(r => { if (r.canal === 'Grandes cuentas' && s.perms.indexOf('clientes') < 0) return;
    if (r.fecha >= desde) { const d = dias[r.fecha] = dias[r.fecha] || {}; d[r.canal] = (d[r.canal] || 0) + r.ventas; }
    const k = r.fecha.slice(0, 7), M = meses[k] = meses[k] || {}; M[r.canal] = M[r.canal] || { v: 0, n: 0 }; M[r.canal].v += r.ventas; M[r.canal].n += r.comprobantes; });
  const cs = CANALES.concat(s.perms.indexOf('clientes') >= 0 ? [CANAL_GC] : []);
  const hojas = [
    { nombre: 'Por día (90 días)', columnas: ['Fecha'].concat(cs, ['Total']), dinero: cs.map((x, i) => i + 1).concat([cs.length + 1]),
      filas: Object.keys(dias).sort().reverse().map(f => [fdm_(f)].concat(cs.map(c => Math.round(dias[f][c] || 0)), [Math.round(cs.reduce((a, c) => a + (dias[f][c] || 0), 0))])) },
    { nombre: 'Por mes', columnas: ['Mes'].concat(cs.map(c => c + ' ventas'), cs.map(c => c + ' ticket'), ['Total']), dinero: cs.map((x, i) => i + 1).concat(cs.map((x, i) => cs.length + i + 1), [2 * cs.length + 1]),
      filas: Object.keys(meses).sort().reverse().map(m => [MES_NOM(m)].concat(cs.map(c => Math.round((meses[m][c] || {}).v || 0)), cs.map(c => { const x = meses[m][c]; return x && x.n ? Math.round(x.v / x.n) : null; }), [Math.round(cs.reduce((a, c) => a + ((meses[m][c] || {}).v || 0), 0))])) }];
  if (s.perms.indexOf('clientes') >= 0) { try { const G = kpiGrandesCuentas_(control_(false)); if (G) hojas.push({ nombre: 'Grandes cuentas', columnas: ['Cliente', 'Tipo', 'Pedido (u)', 'Entregado (u)', 'Pedido ($)', 'Entregado ($)', 'Cobrado', 'Saldo'], dinero: [4, 5, 6, 7], filas: G.lista }); } catch (e) {} }
  try { const G2 = tAll_('Google').sort((a, b) => b.fecha.localeCompare(a.fecha)); if (G2.length) hojas.push({ nombre: 'Google', columnas: ['Fecha', 'Local', 'Calificación', 'Reseñas', 'Respondidas', '% respondidas', 'Ficha propia', 'Observaciones', 'Cargó'],
    filas: G2.map(g => [fdm_(g.fecha), g.local, g.calificacion, g.resenas, g.respondidas, g.resenas ? Math.round(g.respondidas / g.resenas * 100) + ' %' : '', g.fichaPropia === 'no' ? 'No' : 'Sí', g.observaciones || '', g.cargadoPor || '']) }); } catch (e) {}
  log_(s, 'descarga', 'ok', 'canales', 'Ventas por canal');
  return { actualizado: (JSON.parse(PROPS.getProperty('VC_SYNC') || 'null') || {}).ts || null, generado: new Date().toISOString(), por: s.user.nombre, titulo: 'Ventas por canal', archivo: 'Ventas-por-canal', hojas: hojas };
}

/* =================== 3.9 · Experiencia en Google (carga manual por local; la app no lee Google Maps) =================== */
const LOCALES_GOOGLE = ['Palermo', 'Lima', 'Janette'];
function guardarGoogle(token, data) {
  const s = sesion_(token, 'kpi'); data = data || {};
  const local = LOCALES_GOOGLE.indexOf(data.local) >= 0 ? data.local : null; if (!local) throw new Error('Elegí el local.');
  const fecha = fechaOk_(data.fecha) || hoy_(); if (fecha > hoy_()) throw new Error('La fecha no puede ser futura.');
  const ficha = data.fichaPropia === 'no' ? 'no' : 'si';
  const cal = Math.round(Number(String(data.calificacion == null ? '' : data.calificacion).replace(',', '.')) * 10) / 10;
  const res = Math.round(Number(data.resenas)), resp = Math.round(Number(data.respondidas));
  if (ficha === 'si') {
    if (!(cal >= 1 && cal <= 5)) throw new Error('La calificación va de 1 a 5 (por ejemplo 4,6).');
    if (!(res >= 0 && res < 100000)) throw new Error('Cantidad de reseñas inválida.');
    if (!(resp >= 0 && resp <= res)) throw new Error('Las reseñas respondidas no pueden ser más que el total.');
  }
  const o = { id: Utilities.getUuid(), local: local, fecha: fecha, calificacion: ficha === 'si' ? cal : null, resenas: ficha === 'si' ? res : null, respondidas: ficha === 'si' ? resp : null,
    fichaPropia: ficha, observaciones: txt_(data.observaciones, 300), cargadoPor: s.user.nombre, creado: new Date().toISOString() };
  lock_(() => tAdd_('Google', o));
  log_(s, 'google_carga', 'ok', local, fecha + ' · ' + (o.calificacion || 'sin ficha') + ' · ' + (o.resenas || 0) + ' reseñas');
  return { ok: true, panel: googlePanel_(hoy_()) };
}
function googlePanel_(hoy) {
  const T = tAll_('Google'); if (!T.length) return null;
  hoy = hoy || hoy_(); const hace30 = sumarDias_(hoy, -30);
  const locales = LOCALES_GOOGLE.map(loc => {
    const L = T.filter(g => g.local === loc).sort((a, b) => (a.fecha + a.creado).localeCompare(b.fecha + b.creado)); if (!L.length) return null;
    const u = L[L.length - 1], ant = L.length > 1 ? L[L.length - 2] : null;
    const mes = L.filter(g => g.fecha <= sumarDias_(u.fecha, -25)).pop() || null;   // la carga de hace ~1 mes (o la más vieja anterior a eso)
    const o = { local: loc, fecha: u.fecha, calificacion: u.calificacion, resenas: u.resenas, respondidas: u.respondidas, fichaPropia: u.fichaPropia !== 'no', observaciones: u.observaciones || '',
      pctRespondidas: u.resenas ? Math.round(u.respondidas / u.resenas * 100) : null, sinResponder: u.resenas != null ? Math.max(0, u.resenas - u.respondidas) : null, desactualizado: u.fecha < hace30,
      vsAnterior: ant && ant.calificacion != null && u.calificacion != null ? { fecha: ant.fecha, calif: Math.round((u.calificacion - ant.calificacion) * 10) / 10, resenas: u.resenas - ant.resenas } : null,
      vsMes: mes && mes.calificacion != null && u.calificacion != null ? { fecha: mes.fecha, calif: Math.round((u.calificacion - mes.calificacion) * 10) / 10, resenas: u.resenas - mes.resenas } : null };
    const al = [], sug = [];
    if (!o.fichaPropia) { al.push({ nivel: 'rojo', texto: loc + ' no tiene ficha propia en Google.' }); sug.push({ p: 1, t: 'Crear y verificar la ficha propia de ' + loc + ' en Google (Perfil de Empresa) con dirección, horario, teléfono y fotos.' }); }
    else {
      const baja = (o.vsAnterior && o.vsAnterior.calif < 0) || (o.vsMes && o.vsMes.calif < 0);
      if (baja) al.push({ nivel: 'rojo', texto: 'Bajó la calificación de ' + loc + ': ' + String(u.calificacion).replace('.', ',') + (o.vsMes && o.vsMes.calif < 0 ? ' (' + String(o.vsMes.calif).replace('.', ',') + ' en el mes)' : ' (' + String(o.vsAnterior.calif).replace('.', ',') + ' vs. la carga anterior)') + '.' });
      if (o.sinResponder) { al.push({ nivel: o.sinResponder >= 5 ? 'rojo' : 'amarillo', texto: loc + ' tiene ' + o.sinResponder + (o.sinResponder === 1 ? ' reseña sin responder.' : ' reseñas sin responder.') });
        sug.push({ p: 1, t: 'Responder las ' + o.sinResponder + ' reseñas pendientes de ' + loc + ', primero las negativas, y desde ahora contestar todas en menos de 48 h.' }); }
      if (baja || u.calificacion < 4.5) sug.push({ p: 2, t: 'Pedir reseñas a clientas satisfechas en ' + loc + ' con un QR en caja y en la bolsa; el objetivo es subir la calificación' + (u.calificacion < 4.5 ? ' por encima de 4,5' : '') + '.' });
      else if ((o.vsMes && o.vsMes.resenas < 5) || u.resenas < 50) sug.push({ p: 3, t: 'Sumar reseñas en ' + loc + ' (' + (o.vsMes ? o.vsMes.resenas + ' nuevas en el mes' : u.resenas + ' en total') + '): QR en caja y un mensaje post-compra pidiéndola.' });
      if (o.desactualizado) sug.push({ p: 3, t: 'Actualizar la carga de Google de ' + loc + ' (la última es del ' + fdm_(u.fecha) + ') y de paso revisar fotos, horarios y teléfono.' });
    }
    if (/duplic|vieja|desactualiz|otra ficha|cerrad/i.test(o.observaciones)) { al.push({ nivel: 'amarillo', texto: loc + ': hay una ficha duplicada o desactualizada (según la observación).' }); sug.push({ p: 2, t: 'Verificar y pedir a Google la baja o fusión de la ficha duplicada o desactualizada de ' + loc + '.' }); }
    if (!sug.length) sug.push({ p: 3, t: 'Mantener ' + loc + ': responder cada reseña, renovar fotos cada mes y revisar horarios en feriados.' });
    o.alertas = al; o.sugerencias = sug.sort((a, b) => a.p - b.p).map(x => x.t); o.accion = o.sugerencias[0];
    return o; }).filter(Boolean);
  return locales.length ? { locales: locales, generales: ['Revisar que horarios (incluidos feriados), teléfono y fotos estén actualizados en cada ficha.', 'Buscar en Google el nombre de la marca y verificar que no haya fichas duplicadas o de locales cerrados.'] } : null;
}

/* =================== 3.9 · Auditoría: perchero del showroom y control de 10 artículos al azar ===================
   Los dos ítems nuevos se guardan dentro del registro (JSON) sin mover las columnas de la hoja «Registro», y cuentan en el
   promedio, en las infracciones y en los KPIs de auditoría. «Otros» pasa a ser opcional.
   Stock: Contabilium, depósito «HB PALERMO» (la misma fuente que el Excel de Cyber Monday). SOLO LECTURA.
   El conteo es a ciegas: el auditor no ve el stock del sistema hasta guardar. */
const PUNTOS_EXTRA = [['perchero', 'Perchero del showroom', 'Perchero con problemas'], ['stock10', 'Control de 10 artículos al azar', 'Artículos con diferencia de stock']];
const PUNTOS_KPI = PUNTOS.concat(PUNTOS_EXTRA);
const PERCHERO_PUNTAJE = { ok: 5, obs: 3, mal: 1 }, PERCHERO_TXT = { ok: 'OK', obs: 'Con observaciones', mal: 'Mal' };
const stock10Puntaje_ = pct => pct >= 100 ? 5 : pct >= 90 ? 4 : pct >= 70 ? 3 : pct >= 50 ? 2 : 1;
const COLORES_ = ['negro', 'negra', 'blanco', 'blanca', 'beige', 'granate', 'habano', 'rosa', 'celeste', 'oseo', 'óseo', 'brown', 'nude', 'azul', 'rojo', 'roja', 'verde', 'gris', 'marron', 'marrón', 'crudo', 'cruda', 'camel',
  'chocolate', 'lila', 'natural', 'arena', 'tostado', 'bordo', 'bordó', 'mostaza', 'oliva', 'plata', 'dorado', 'cuadros', 'cuadro', 'pelaje', 'manchas', 'rayas', 'jean', 'denim', 'hueso', 'terracota', 'khaki', 'kaki',
  'militar', 'salmon', 'salmón', 'coral', 'fucsia', 'violeta', 'amarillo', 'naranja', 'menta', 'petroleo', 'petróleo', 'vison', 'visón', 'champagne', 'perla', 'off', 'white', 'print', 'animal', 'leopardo', 'cebra', 'vaca',
  'gold', 'silver', 'black', 'cream', 'tiza', 'piedra', 'cobre', 'malva', 'uva', 'vino', 'cereza', 'turquesa', 'aqua', 'jade', 'topo', 'carbon', 'carbón', 'mocca', 'moka', 'capuccino', 'canela', 'caramelo'];
const TALLE_RE_ = /^(XXXS|XXS|XS|S|M|L|XL|XXL|XXXL|U|UN|ÚN|UNICO|ÚNICO|TU|\d{1,2})$/i;
function talleColor_(nombre) {
  const w = String(nombre || '').replace(/\(([^)]*)\)/g, ' $1 ').replace(/\btalle\b/ig, ' ').replace(/\s+/g, ' ').trim().split(' ');
  let talle = ''; if (w.length > 1 && TALLE_RE_.test(w[w.length - 1])) { talle = w.pop().toUpperCase(); if (/^(U|UN|ÚN|UNICO|ÚNICO|TU)$/.test(talle)) talle = 'Único'; }
  const col = w.filter((x, i) => i > 0 && COLORES_.indexOf(x.toLowerCase()) >= 0);
  return { talle: talle || '—', color: col.length ? col.map(x => x.charAt(0).toUpperCase() + x.slice(1).toLowerCase()).join(' ') : '—' };
}
/** Stock de HB Palermo con nombre (caché 6 h, se precalienta en la actualización diaria). Solo artículos con stock > 0. */
function stockPalermoArt_(forzar) {
  if (!forzar) { const c = CACHE.get('STK_PAL10'); if (c) try { return JSON.parse(c); } catch (e) {} }
  const d = ctbGet_('/api/inventarios/getDepositos'), D = Array.isArray(d) ? d : (d.Items || []), pal = D.find(x => /hb palermo/i.test(x.Nombre) && !/falla/i.test(x.Nombre));
  if (!pal) throw new Error('No encuentro el depósito «HB PALERMO» en Contabilium.');
  const st = {};
  for (let p = 1; p <= 120; p++) { if (p > 1) Utilities.sleep(150);   // ritmo amable con Contabilium (evita el límite de consultas)
    const j = ctbGet_('/api/inventarios/getStockByDeposito', { id: pal.Id, page: p }); const S = Array.isArray(j) ? j : (j.Items || []);
    S.forEach(s => { const q = ctbNum_(s.StockActual); if (q > 0 && s.Codigo) st[String(s.Codigo).trim()] = q; }); if (!S.length || Array.isArray(j) || p * 50 >= (Number(j.TotalItems) || 0)) break; }
  const nom = {};
  for (let p = 1; p <= 120; p++) { if (p > 1) Utilities.sleep(150); const j = ctbGet_('/api/conceptos/search', { page: p }); const I = j.Items || [];
    I.forEach(x => { const k = String(x.Codigo || '').trim(); if (st[k] != null) nom[k] = String(x.Nombre || '').trim(); }); if (!I.length || p * 50 >= (Number(j.TotalItems) || 0)) break; }
  const L = Object.keys(st).filter(k => nom[k] && !ctbNoProducto_({ codigo: k, nombre: nom[k] })).map(k => [k, nom[k].slice(0, 60), st[k]]);
  const s = JSON.stringify(L); if (s.length < 95000) try { CACHE.put('STK_PAL10', s, 21600); } catch (e) {}
  return L;
}
/** Sortea 10 artículos al azar (que no estén en la auditoría anterior). Devuelve código, descripción, talle y color; NO el stock. */
function auditoriaSorteo10(token) {
  const s = sesion_(token, 'auditar');
  if (!ctbConfigurado_()) throw new Error('Contabilium no está conectado: no se puede sortear el control de stock.');
  const L = stockPalermoArt_(false); if (L.length < 10) throw new Error('No hay suficientes artículos con stock en HB Palermo para sortear.');
  let prev = []; try { prev = JSON.parse(PROPS.getProperty('AUD_ULT10') || '[]'); } catch (e) {}
  const pool = L.filter(x => prev.indexOf(x[0]) < 0), base = pool.length >= 10 ? pool : L;
  for (let i = base.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = base[i]; base[i] = base[j]; base[j] = t; }
  const items = base.slice(0, 10).map(x => Object.assign({ codigo: x[0], descripcion: x[1] }, talleColor_(x[1])));
  const id = Utilities.getUuid().slice(0, 13);
  CACHE.put('AUD10_' + id, JSON.stringify({ ts: new Date().toISOString(), sistema: base.slice(0, 10).map(x => [x[0], x[2]]), por: s.user.id }), 21600);
  log_(s, 'auditoria_sorteo10', 'ok', id, items.map(x => x.codigo).join(','));
  return { id: id, items: items, fuente: 'Stock de Contabilium · depósito HB PALERMO', vence: 'El sorteo vale 6 horas.' };
}
/** Valida y arma el resultado del control de stock (se llama al guardar la auditoría). */
function stock10Resultado_(d) {
  if (!d || !d.id) return null;
  const c = CACHE.get('AUD10_' + String(d.id).replace(/[^\w-]/g, '')); if (!c) throw new Error('El sorteo de los 10 artículos venció (dura 6 horas). Tocá «Sortear de nuevo» y volvé a contar.');
  const S = JSON.parse(c), cont = d.conteos || {}, items = (d.items || []);
  const res = S.sistema.map(([cod, sis]) => { const it = items.find(x => x.codigo === cod) || { codigo: cod };
    const v = cont[cod]; if (v === '' || v == null || !(Number(v) >= 0)) throw new Error('Falta el conteo de ' + cod + '.');
    const n = Math.round(Number(v)), dif = n - Math.round(sis);
    return { codigo: cod, descripcion: txt_(it.descripcion, 80), talle: txt_(it.talle, 10), color: txt_(it.color, 40), sistema: Math.round(sis), contado: n, diferencia: dif, estado: dif === 0 ? 'ok' : dif < 0 ? 'faltante' : 'sobrante' }; });
  const coinciden = res.filter(r => r.diferencia === 0).length, exactitud = Math.round(coinciden / res.length * 100);
  return { id: d.id, sorteado: S.ts, items: res, coinciden: coinciden, total: res.length, exactitud: exactitud,
    faltantes: res.filter(r => r.diferencia < 0).reduce((a, r) => a - r.diferencia, 0), sobrantes: res.filter(r => r.diferencia > 0).reduce((a, r) => a + r.diferencia, 0) };
}

/* =================== 3.7 · Contexto que puede impactar a Hey Blackk (dólar + noticias) =================== */
/* Fuentes públicas y gratuitas, sin clave: DolarApi (cotizaciones) y Google Noticias (titulares en español, Argentina).
   Se excluye C5N. Caché de 2 h; ante un error devuelve lo que pudo (nunca rompe el resumen). */
const CTX37_TEMAS = [
  { id: 'textil', titulo: 'Textil', q: '"industria textil" OR indumentaria Argentina', impacto: 'marca costos, competencia de importados y demanda de indumentaria' },
  // 3.9 · Temas que pidió administración (27/10/2026): consumo, importados por courier, CyberMonday/Black Friday e inflación
  { id: 'consumo', titulo: 'Consumo', q: 'CAME "ventas minoristas" pyme', impacto: 'muestra si la gente está comprando: anticipa el ritmo de ventas de los locales y de la web' },
  { id: 'importados', titulo: 'Importados', q: 'Shein OR Temu OR courier ARCA ropa importada', impacto: 'la ropa importada barata compite en precio con la marca, sobre todo en la web' },
  { id: 'cyber', titulo: 'Fechas de venta', q: 'CyberMonday OR "Black Friday" Argentina 2026', impacto: 'fechas de descuentos online: preparar stock, precios y campaña de la tienda web' },
  { id: 'inflacion', titulo: 'Inflación', q: 'INDEC inflación "prendas de vestir"', impacto: 'si la ropa sube menos que la inflación, se achica el margen: revisar precios y costos' },
  { id: 'uruguay', titulo: 'Uruguay', q: 'Uruguay Argentina exportaciones OR frontera OR aduana', impacto: 'pega en los envíos y la cobranza de la franquicia de Uruguay' },
  { id: 'clima', titulo: 'Clima', q: '"El Niño" OR tormentas OR "alerta meteorológica" Argentina', impacto: 'lluvias y tormentas pueden demorar envíos y cambiar la circulación en el local' },
  { id: 'combustibles', titulo: 'Combustibles', q: 'aumento combustibles nafta gasoil YPF', impacto: 'sube el costo de fletes y logística, incluidos los envíos a Uruguay' },
  { id: 'petroleo', titulo: 'Petróleo', q: 'petróleo Brent precio', impacto: 'anticipa ajustes de combustibles y del costo de fibras sintéticas como el poliéster' }];
function ctx37Fetch_(url) {
  const r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true, validateHttpsCertificates: true });
  if (r.getResponseCode() !== 200) throw new Error('HTTP ' + r.getResponseCode());
  return r.getContentText();
}
function ctx37Dolar_() {
  const L = JSON.parse(ctx37Fetch_('https://dolarapi.com/v1/dolares')), out = {};
  L.forEach(x => { if (['oficial', 'blue', 'mayorista'].indexOf(x.casa) >= 0) out[x.casa] = { compra: Number(x.compra), venta: Number(x.venta), fecha: x.fechaActualizacion || null }; });
  return out.oficial || out.blue ? out : null;
}
function ctx37Noticia_(T, limite) {
  const xml = ctx37Fetch_('https://news.google.com/rss/search?q=' + encodeURIComponent(T.q + ' when:3d') + '&hl=es-419&gl=AR&ceid=AR:es-419');
  const items = XmlService.parse(xml).getRootElement().getChild('channel').getChildren('item');
  for (let i = 0; i < items.length && i < 15; i++) {
    const it = items[i], tit = String(it.getChildText('title') || ''), link = String(it.getChildText('link') || ''), src = it.getChild('source');
    const fuente = src ? String(src.getText() || '') : (tit.split(' - ').pop() || ''), fecha = new Date(it.getChildText('pubDate') || 0);
    if (/c5n/i.test(fuente + ' ' + link + ' ' + (src ? src.getAttribute('url') && src.getAttribute('url').getValue() : ''))) continue;   // C5N excluido
    if (!(fecha.getTime() > limite)) continue;
    const limpio = tit.replace(new RegExp('\\s+-\\s+' + fuente.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'), '').trim();
    if (!limpio) continue;
    return { tema: T.id, titulo: T.titulo, titular: limpio.slice(0, 180), fuente: fuente.slice(0, 60), link: /^https:\/\//.test(link) ? link : null, fecha: fecha.toISOString(), impacto: T.impacto };
  }
  return null;
}
function contexto37_() {
  const c = CACHE.get('CTX37'); if (c) { try { return JSON.parse(c); } catch (e) {} }
  const out = { dolar: null, noticias: [], ts: new Date().toISOString(), fuentes: 'DolarApi · Google Noticias' };
  try { out.dolar = ctx37Dolar_(); } catch (e) {}
  const limite = Date.now() - 3 * 86400000;
  CTX37_TEMAS.forEach(T => { try { const n = ctx37Noticia_(T, limite); if (n) out.noticias.push(n); } catch (e) {} });
  try { CACHE.put('CTX37', JSON.stringify(out), out.dolar || out.noticias.length ? 7200 : 1800); } catch (e) {}
  return out;
}
/** Texto hablado del contexto: dólar (compra y venta) y hasta 5 titulares con su impacto para Hey Blackk. */
function audioContexto37_(X) {
  if (!X || (!X.dolar && !X.noticias.length)) return '';
  const P = ['Contexto que puede impactar a Hey Blackk.'], D = X.dolar, pesos = n => palabras_(Math.round(n)) + ' pesos';
  if (D && D.oficial) P.push('El dólar oficial ' + (D.oficial.fecha ? 'cerró' : 'está') + ' a ' + pesos(D.oficial.compra) + ' la compra y ' + pesos(D.oficial.venta) + ' la venta' +
    (D.blue ? '; el blue, ' + pesos(D.blue.compra) + ' la compra y ' + pesos(D.blue.venta) + ' la venta' : '') + '. Impacta en insumos importados y en lo que rinde lo que cobramos de Uruguay.');
  X.noticias.slice(0, 5).forEach(n => P.push(n.titulo + ': ' + n.titular.replace(/["«»]/g, '') + (n.fuente ? ', según ' + n.fuente : '') + '. Para Hey Blackk, ' + n.impacto + '.'));
  return P.join(' ');
}
/* =================== 3.7 · Clima (Open-Meteo: servicio público y gratuito, sin clave) =================== */
/* Pronóstico de la sucursal (por sus coordenadas de la hoja Sucursales) y, con el historial de lluvias, cuánto cambia la venta
   en los días de lluvia frente a los secos (comparando cada día contra el promedio de su mismo día de la semana). */
const WMO37_ = { 0: ['☀️', 'despejado'], 1: ['🌤️', 'mayormente despejado'], 2: ['⛅', 'parcialmente nublado'], 3: ['☁️', 'nublado'], 45: ['🌫️', 'niebla'], 48: ['🌫️', 'niebla'],
  51: ['🌦️', 'llovizna'], 53: ['🌦️', 'llovizna'], 55: ['🌧️', 'llovizna intensa'], 56: ['🌧️', 'llovizna helada'], 57: ['🌧️', 'llovizna helada'], 61: ['🌦️', 'lluvia débil'], 63: ['🌧️', 'lluvia'], 65: ['🌧️', 'lluvia fuerte'],
  66: ['🌧️', 'lluvia helada'], 67: ['🌧️', 'lluvia helada'], 71: ['🌨️', 'nieve'], 73: ['🌨️', 'nieve'], 75: ['🌨️', 'nieve'], 80: ['🌦️', 'chaparrones'], 81: ['🌧️', 'chaparrones'], 82: ['⛈️', 'chaparrones fuertes'],
  95: ['⛈️', 'tormenta'], 96: ['⛈️', 'tormenta con granizo'], 99: ['⛈️', 'tormenta con granizo'] };
function clima37Lugar_() {
  let s = null; try { const L = sucursales_().filter(x => x.activa && x.lat != null && x.lng != null); s = L.find(x => /palermo/i.test(x.nombre)) || L[0] || null; } catch (e) {}
  return s ? { nombre: s.nombre, lat: s.lat, lng: s.lng, dias: s.dias } : { nombre: 'Palermo', lat: -34.5889, lng: -58.4306, dias: cfg_().diasOperativos };
}
function clima37Get_(url) {
  const r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true, validateHttpsCertificates: true, headers: { Accept: 'application/json' } });
  if (r.getResponseCode() !== 200) throw new Error('HTTP ' + r.getResponseCode());
  return JSON.parse(r.getContentText());
}
const esLluvia37_ = d => (d.prob != null && d.prob >= 60) || d.mm >= 3 || ([61, 63, 65, 80, 81, 82, 95, 96, 99].indexOf(d.code) >= 0 && (d.prob == null || d.prob >= 50));
/** Impacto histórico de la lluvia en la venta (últimos ~6 meses). Se recalcula cada 12 h. null si no hay días suficientes. */
function impactoLluvia37_(P) {
  const k = 'CLIMA37_IMP', c = CACHE.get(k); if (c) return JSON.parse(c);
  const hoy = hoy_(), fin = sumarDias_(hoy, -6), ini = sumarDias_(hoy, -186);
  const j = clima37Get_('https://archive-api.open-meteo.com/v1/archive?latitude=' + P.lat + '&longitude=' + P.lng + '&start_date=' + ini + '&end_date=' + fin + '&daily=precipitation_sum&timezone=America%2FArgentina%2FBuenos_Aires');
  const mm = {}; (j.daily && j.daily.time || []).forEach((t, i) => { mm[t] = Number(j.daily.precipitation_sum[i]); });
  const C = tAll_('Cierres').filter(x => x.total > 0 && mm[x.fecha] != null && !isNaN(mm[x.fecha]));
  const secos = C.filter(x => mm[x.fecha] < 0.5), prom = {};
  secos.forEach(x => { const d = dow_(x.fecha); (prom[d] = prom[d] || []).push(x.total); });
  const base = d => prom[d] && prom[d].length >= 2 ? prom[d].reduce((a, b) => a + b, 0) / prom[d].length : null;
  const lluv = C.filter(x => mm[x.fecha] >= 2 && base(dow_(x.fecha)));
  let out = null;
  if (lluv.length >= 4 && secos.length >= 10) {
    const ratio = lluv.reduce((a, x) => a + x.total / base(dow_(x.fecha)), 0) / lluv.length;
    out = { pct: Math.round((ratio - 1) * 100), diasLluvia: lluv.length, diasSecos: secos.length, desde: ini };
  }
  CACHE.put(k, JSON.stringify(out), 43200);
  return out;
}
/** Pronóstico de hoy y los 3 días siguientes + aviso si llueve uno de los próximos días de apertura (hasta 4 días). Caché 1 h. Nunca rompe el panel: ante un error devuelve null. */
function clima37_() {
  try {
    const c = CACHE.get('CLIMA37'); if (c) return JSON.parse(c);
    const P = clima37Lugar_(), cfg = cfg_(), cal = calendario_(cfg);
    const j = clima37Get_('https://api.open-meteo.com/v1/forecast?latitude=' + P.lat + '&longitude=' + P.lng +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum&timezone=America%2FArgentina%2FBuenos_Aires&forecast_days=5');
    const D = j.daily || {}, dias = (D.time || []).map((t, i) => {
      const code = Number(D.weather_code[i]), w = WMO37_[code] || ['🌡️', ''];
      const d = { fecha: t, max: Math.round(D.temperature_2m_max[i]), min: Math.round(D.temperature_2m_min[i]), prob: D.precipitation_probability_max[i] == null ? null : Math.round(D.precipitation_probability_max[i]),
        mm: Math.round((Number(D.precipitation_sum[i]) || 0) * 10) / 10, code: code, emoji: w[0], desc: w[1] };
      d.lluvia = esLluvia37_(d); d.abre = P.dias.indexOf(dow_(t)) >= 0 && !feriadoSuc_(cal, P.nombre, t);
      return d;
    });
    let imp = null; try { imp = impactoLluvia37_(P); } catch (e) {}
    const hoy = hoy_(), ll = dias.find(d => d.lluvia && d.abre);
    let aviso = null;
    if (ll) {
      const cuando = ll.fecha === hoy ? 'Hoy' : ll.fecha === sumarDias_(hoy, 1) ? 'Mañana' : 'El ' + NOMBRE_DIA[dow_(ll.fecha)];
      aviso = { fecha: ll.fecha, cuando: cuando, prob: ll.prob, mm: ll.mm,
        texto: cuando + ' se espera ' + ll.desc + (ll.prob != null ? ' (' + ll.prob + ' % de probabilidad)' : '') + ': la venta del local puede ser menor' +
          (imp && imp.pct < 0 ? ' (en los días de lluvia de los últimos meses vendiste ' + Math.abs(imp.pct) + ' % menos que un día seco)' : '') + '.',
        dato: imp && imp.pct >= 0 ? 'Dato a favor: en los últimos 6 meses, los ' + imp.diasLluvia + ' días de lluvia vendiste ' + imp.pct + ' % más que un día seco del mismo día de la semana; tené stock y personal completos.' : '',
        accion: 'Reforzá WhatsApp, Instagram y la venta online ese día, y avisá a las clientas habituales de alguna promo o novedad.' };
    }
    const out = { lugar: P.nombre, dias: dias.slice(0, 4), aviso: aviso, impacto: imp, fuente: 'Open-Meteo', ts: new Date().toISOString() };
    CACHE.put('CLIMA37', JSON.stringify(out), 3600);
    return out;
  } catch (e) { try { CACHE.put('CLIMA37', 'null', 1800); } catch (x) {} return null; }
}
/** Comparación del último cierre contra el promedio de su mismo día de la semana (últimas 4 apariciones con venta). */
function vsMismoDia37_(c, u) {
  if (!u) return null;
  const prev = c.filter(x => x.fecha < u.fecha && x.total > 0 && dow_(x.fecha) === dow_(u.fecha)).slice(-4);
  if (prev.length < 2) return null;
  const p = prev.reduce((a, x) => a + x.total, 0) / prev.length;
  return { promedio: Math.round(p), pct: Math.round((u.total / p - 1) * 100), n: prev.length };
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
    vacacionesNovedades: nov, contrato: contratoHoy_(u, suc, hoy, P.minutos) };
}
/** 3.7 · Para la pantalla de fichada: su horario, si hoy le toca, lo que lleva hoy y el avance del mes contra su carga horaria. */
function contratoHoy_(u, suc, hoy, minHoy) {
  try {
    const sc = sucursales_().find(x => normSuc_(x.nombre) === normSuc_(suc.nombre)), c = contrato_(u, sc); if (!c) return null;
    const r = horas_({ uids: [u.id], desde: hoy.slice(0, 8) + '01', hasta: hoy }), e = r.empleados[0] || {};
    return Object.assign(c, { hoyLeToca: c.dias.indexOf(dow_(hoy)) >= 0, minutosHoy: minHoy || 0,
      mes: { trabajado: e.total || 0, esperadoHastaHoy: e.esperado, carga: e.cargaMes ? e.cargaMes.minutos : null, diasCarga: e.cargaMes ? e.cargaMes.dias : null } });
  } catch (x) { return null; }
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
    const suc = sucs.find(x => normSuc_(x.nombre) === normSuc_(sucDe_(u))), ops = opsDe_(u, suc);   // 3.7: días de su contratación
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
      contrato: contrato_(u, suc), cargaMes: cargaMes_(u, hasta.slice(0, 7), suc, cal, vac),
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
      const leToca = abre && opsDe_(u, suc).indexOf(dow_(hoy)) >= 0;   // 3.7: solo falta si hoy le toca por su contratación
      let estado = recs.length ? (P.abierta ? 'adentro' : P.incoherente ? 'revisar' : 'salio') : vac(u.id, hoy) ? 'vacaciones' : fer ? 'feriado' : leToca ? 'falta' : abre ? 'no_le_toca' : 'no_abre';
      if (!recs.length && pend.length) estado = 'manual_pendiente';
      return { uid: u.id, nombre: u.nombre, legajo: u.legajo, estado: estado, pares: P.pares, minutos: P.minutos,
        ultima: recs.length ? horaEf_(recs.slice().sort(ordenEv_).slice(-1)[0]).slice(0, 5) : null, abiertaAnterior: ab, manualesPendientes: pend.length,
        horario: u.horario ? u.horario.entrada + '–' + u.horario.salida : null,
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
    const suc = sucs.find(x => normSuc_(x.nombre) === normSuc_(sucDe_(u))), ops = opsDe_(u, suc);
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
    if (x[0] === 'otros' && !(v >= 1 && v <= 5)) return;   // 3.9: «Otros» es opcional
    if (!(v >= 1 && v <= 5)) throw new Error('Faltan puntos por evaluar.');
    rec.puntajes[x[0]] = v;
    rec.infracciones[x[0]] = Math.max(0, Math.min(999, Math.round(Number(data.infracciones && data.infracciones[x[0]]) || 0)));
    const c = txt_(data.comentarios && data.comentarios[x[0]], 200); if (c) rec.comentarios[x[0]] = c;
  });
  // 3.9 · Perchero del showroom (obligatorio) y control de 10 artículos al azar (obligatorio salvo que no se haya podido sortear)
  const pe = data.perchero || {}; if (!PERCHERO_PUNTAJE[pe.estado]) throw new Error('Falta evaluar el perchero del showroom.');
  rec.perchero = { estado: pe.estado, texto: PERCHERO_TXT[pe.estado], comentario: txt_(pe.comentario, 300) };
  rec.puntajes.perchero = PERCHERO_PUNTAJE[pe.estado]; rec.infracciones.perchero = pe.estado === 'mal' ? 1 : 0; if (rec.perchero.comentario) rec.comentarios.perchero = rec.perchero.comentario;
  if (data.stock10 && data.stock10.id) { rec.stock10 = stock10Resultado_(data.stock10); rec.puntajes.stock10 = stock10Puntaje_(rec.stock10.exactitud); rec.infracciones.stock10 = rec.stock10.total - rec.stock10.coinciden; }
  else if (!data.stock10SinDatos) throw new Error('Falta el control de los 10 artículos al azar.');
  const claves = Object.keys(rec.puntajes);
  const prom = claves.reduce((a, k) => a + rec.puntajes[k], 0) / claves.length;
  const tot = Object.keys(rec.infracciones).reduce((a, k) => a + (rec.infracciones[k] || 0), 0);
  rec.promedio = Math.round(prom * 100) / 100;
  rec.resultado = prom >= p.promExc ? 'Excelente' : prom >= p.promAdv ? 'Advertencia' : 'Reclamo';
  rec.totalInfracciones = tot;
  rec.resultadoChecklist = tot === 0 ? 'Excelente' : tot <= p.maxInf ? 'Advertencia' : 'Reclamo';
  rec.pedidoFueraDePlazo = rec.diasPedido != null && rec.diasPedido > p.diasMax;

  const subidas = [];
  try {
    // Cada foto puede venir asociada a un punto evaluado: {punto, data}. Texto suelto = foto general (compatibilidad).
    const claves = PUNTOS_KPI.map(x => x[0]);
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
      sh.appendRow([rec.id, new Date(y, mo - 1, d), celda_(rec.auditor), ...PUNTOS.map(x => rec.puntajes[x[0]] == null ? '' : rec.puntajes[x[0]]), rec.promedio, rec.resultado,
        ...PUNTOS.map(x => rec.infracciones[x[0]] == null ? '' : rec.infracciones[x[0]]), rec.totalInfracciones, rec.resultadoChecklist, rec.diasPedido == null ? '' : rec.diasPedido,
        rec.pedidoFueraDePlazo ? 'Sí' : 'No', celda_(rec.comentarioGeneral), ...PUNTOS.map(x => celda_(rec.comentarios[x[0]] || '')),
        rec.fotos.length, Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm'), JSON.stringify(rec)]);
      const r = sh.getLastRow(), N = PUNTOS.length, C = HEAD.length;
      sh.getRange(r, 2).setNumberFormat('dd/mm/yyyy'); sh.getRange(r, 4 + N).setNumberFormat('0.0');
      // Formato de toda la fila en 4 llamadas (una por propiedad) en lugar de una por celda.
      const col = { Excelente: ['#DCFCE7', '#15803D'], Advertencia: ['#FEF3C7', '#B45309'], Reclamo: ['#FEE2E2', '#C81E1E'] };
      const sc = { 1: ['#FEE4E2', '#D92D20'], 2: ['#FFE8D9', '#E8590C'], 3: ['#FEF3C7', '#A16207'], 4: ['#DCFCE7', '#16A34A'], 5: ['#C9F2D9', '#0E7A3E'] };
      const bg = Array(C).fill(null), fc = Array(C).fill(null), fw = Array(C).fill(null), ha = Array(C).fill(null);
      PUNTOS.forEach((x, j) => { const v = rec.puntajes[x[0]]; if (!v) return; bg[3 + j] = sc[v][0]; fc[3 + j] = sc[v][1]; fw[3 + j] = 'bold'; ha[3 + j] = 'center'; });
      [[4 + N, rec.resultado], [6 + 2 * N, rec.resultadoChecklist]].forEach(([i, res]) => { bg[i] = col[res][0]; fc[i] = col[res][1]; fw[i] = 'bold'; });
      sh.getRange(r, 1, 1, C).setBackgrounds([bg]).setFontColors([fc]).setFontWeights([fw]).setHorizontalAlignments([ha]);
    });
  } catch (e) {
    subidas.forEach(id => { try { DriveApp.getFileById(id).setTrashed(true); } catch (x) {} });   // sin fotos huérfanas
    throw e;
  }
  if (rec.stock10) { try { PROPS.setProperty('AUD_ULT10', JSON.stringify(rec.stock10.items.map(x => x.codigo))); CACHE.remove('AUD10_' + rec.stock10.id); } catch (e) {} }
  log_(s, 'auditoria_creada', rec.resultado, rec.id, rec.fecha + ' · ' + rec.promedio + ' · fotos ' + rec.fotos.length + (rec.stock10 ? ' · stock ' + rec.stock10.exactitud + ' %' : ''));
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
/** 3.8 · Activador diario (7 h): relee Control ingreso, Ventas Palermo, el Templete de Dropbox y las ventas de Contabilium. */
function actualizacionDiaria() { SS_ = null; MEMO_ = {}; const out = actualizarPlanillas_(null); console.log('DIARIA ' + JSON.stringify(out)); return out; }
/** Ejecutar UNA vez desde el editor de Apps Script: crea el activador semanal (si no existe) y hace la primera descarga. */
function instalarActivadores() {
  const hay = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'feriadosSemanal');
  if (!hay) ScriptApp.newTrigger('feriadosSemanal').timeBased().everyWeeks(1).onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(6).create();
  if (!ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'actualizacionDiaria')) ScriptApp.newTrigger('actualizacionDiaria').timeBased().everyDays(1).atHour(7).create();
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
/** 3.4 · Comando «actualizar app» (miércoles a domingo): se ejecuta desde el editor de Apps Script (no se puede llamar desde la web).
    Vuelve a leer la planilla de cierre de Palermo (solo lectura), actualiza los feriados si corresponde y deja un resumen en el registro. */
function actualizarApp() {
  SS_ = null; MEMO_ = {};
  let ctl; try { const d = control_(true); ctl = { ok: true, archivo: d.archivo, leida: d.leida, modificada: d.modificado, clientes: d.clientes.length, articulos: d.lineas.length, avisos: d.avisos }; } catch (e) { ctl = { ok: false, error: String(e.message || e) }; }
  const st = sync_(null);
  try { autoFeriados_(); } catch (e) {}
  const hoy = hoy_(), cfg = cfg_(), cal = calendario_(cfg);
  const c = tAll_('Cierres').filter(x => x.total >= 0).sort((a, b) => a.fecha.localeCompare(b.fecha)), u = c[c.length - 1];
  const desde = sumarDias_(hoy, -14), con = {}; c.forEach(x => { con[x.fecha] = 1; });
  const sinCierre = diasOperativosEntre_(desde, hoy, cfg.diasOperativos).filter(d => d < hoy && !con[d] && !cal.cerrado(d) && !cal.sinConfirmar(d));
  const mes = c.filter(x => x.fecha.slice(0, 7) === hoy.slice(0, 7));
  const out = { ok: st.ok, leida: st.ts, archivo: st.archivo || '', modificada: st.modificado || '', dias: st.dias, nuevos: st.nuevos, cambiados: st.cambiados,
    errores: st.errores || [st.error], avisos: st.avisos || [], ultimoCierre: u ? { fecha: u.fecha, total: u.total } : null,
    mes: { dias: mes.length, total: mes.reduce((a, x) => a + x.total, 0) }, diasSinCierre14: sinCierre,
    feriadosPorConfirmar: feriadosPanel_(cfg).pendientes.map(f => f.fecha + ' ' + f.nombre), controlIngreso: ctl };
  console.log('ACTUALIZAR_APP ' + JSON.stringify(out));
  return out;
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
  // 3.5: panorama de RRHH (últimos 30 días) solo para jefes y administración; se integra al resumen general.
  let rrhh = null; if (s.perms.indexOf('ingresos') >= 0) { try { rrhh = panorama_({}); } catch (e) { rrhh = null; } }
  // 3.6: clientes y producción, solo si el jefe tiene esas secciones habilitadas (lo que no tiene permiso ni se lee).
  let cliR = null, proR = null, cliL = [];
  if (s.perms.indexOf('clientes') >= 0 || s.perms.indexOf('produccion') >= 0) { try { const D = control_(false); if (s.perms.indexOf('clientes') >= 0) { cliR = resumenClientes_(D); cliL = D.clientes.filter(c => c.seCuenta !== false); } if (s.perms.indexOf('produccion') >= 0) proR = resumenProduccion_(D); } catch (e) {} }
  const ctxK = s.perms.indexOf('kpi') >= 0 ? contexto37_() : null;
  // 3.9 · Ventas por canal (Contabilium), grandes cuentas (Control ingreso, solo con la sección Clientes) y experiencia en Google
  const verGC = s.perms.indexOf('clientes') >= 0;
  let canales = null, grandes = null, google = null;
  try { canales = kpiCanales_(hoy, !verGC); } catch (e) { console.warn('kpiCanales_ ' + e); }
  if (verGC) try { grandes = kpiGrandesCuentas_(control_(false)); if (grandes) delete grandes.lista; } catch (e) {}
  try { google = googlePanel_(hoy); } catch (e) {}   // 3.7: dólar y noticias que pueden impactar a la marca
  const audio = audio_(s.user, comercial, auditoria, { canales: canales, grandes: grandes, google: google, pendientes: pendientes, acciones: accionesK, feriados: feriados, hoy: hoy, rrhh: rrhh, clientes: cliR, clientesLista: cliL, produccion: proR, clima: comercial && !comercial.sinDatos ? clima37_() : null, contexto: ctxK });
  return {
    desde: desde, hasta: hasta, auditoriasN: audN, params: params_(),
    acciones: accionesK, auditoria: auditoria, feriados: feriados, audio: audio, contexto: ctxK, canales: canales, grandesCuentas: grandes, google: google,
    clientes36: cliR ? { clientes: cliR.clientes, pedido: cliR.pedido, entregado: cliR.despachado, despachado: cliR.despachado, separado: cliR.separado, pendiente: cliR.pendiente, avance: cliR.avance, cumplimiento: cliR.cumplimiento,
      pagado: cliR.pagado, faltaPagar: cliR.faltaPagar, estados: cliR.estados, alertas: cliR.alertas.slice(0, 3) } : null,
    produccion36: proR ? { planificado: proR.planificado, ingresado: proR.ingresado, enProceso: proR.enProceso, faltaFabricar: proR.faltaFabricar, avance: proR.avance, atrasados: proR.atrasados,
      stockLibre: proR.stock ? proR.stock.libre : null, stockFisico: proR.stock ? proR.stock.fisico : null, stockComprometido: proR.stock ? proR.stock.comprometido : null, faltaProducir: proR.falta ? proR.falta.total : null,
      taller: proR.taller ? { llegado: proR.taller.llegadas, enProduccion: proR.taller.estados.en_produccion.unidades, porLlegar: proR.taller.estados.por_llegar.unidades, atrasados: proR.taller.estados.atrasado.pedidos } : null,
      alertas: proR.alertas.slice(0, 3) } : null,
    controlSync: (cliR || proR) ? sync36_() : null,
    rrhh: rrhh ? { periodo: rrhh.periodo, cuenta: rrhh.cuenta, alertas: rrhh.alertas.filter(a => a.nivel !== 'verde').slice(0, 5).concat(rrhh.alertas.filter(a => a.nivel === 'verde').slice(0, 3)), ranking: rrhh.ranking.slice(0, 3) } : null,
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
  if (!L.length) return out;   // 3.5: sin auditorías no se recomienda nada (regla: no mencionar lo que no tiene datos)
  const u = L[L.length - 1], a = L[L.length - 2] || null;
  out.ultima = { fecha: u.fecha, promedio: u.promedio, resultado: u.resultado, auditor: u.auditor };
  if (a) { out.anterior = { fecha: a.fecha, promedio: a.promedio, resultado: a.resultado }; out.tendencia = u.promedio > a.promedio ? 'mejora' : u.promedio < a.promedio ? 'empeora' : 'igual'; }
  const rec90 = L.filter(x => x.fecha >= sumarDias_(hoy, -90)); const base = rec90.length ? rec90 : L.slice(-5);
  const prom = {}; PUNTOS_KPI.forEach(x => { const v = base.map(b => b.puntajes && b.puntajes[x[0]]).filter(Boolean); prom[x[0]] = v.length ? v.reduce((s, y) => s + y, 0) / v.length : null; });
  const deb = PUNTOS_KPI.filter(x => prom[x[0]] != null).sort((x, y) => prom[x[0]] - prom[y[0]])[0];
  if (deb) out.puntoDebil = { punto: deb[1], promedio: r2_(prom[deb[0]]) };
  const inf = PUNTOS_KPI.map(x => ({ punto: x[2], total: base.reduce((s, b) => s + ((b.infracciones || {})[x[0]] || 0), 0) })).sort((x, y) => y.total - x.total);
  if (inf[0] && inf[0].total) out.infraccionTop = inf[0];
  out.pedidosFuera = base.filter(b => b.diasPedido != null && b.diasPedido > p.diasMax).length;
  // 3.9 · Perchero y exactitud del stock (último control con datos)
  const conStk = L.filter(x => x.stock10), us = conStk[conStk.length - 1], usA = conStk[conStk.length - 2];
  if (us) out.stock10 = { fecha: us.fecha, exactitud: us.stock10.exactitud, coinciden: us.stock10.coinciden, total: us.stock10.total, faltantes: us.stock10.faltantes, sobrantes: us.stock10.sobrantes,
    anterior: usA ? usA.stock10.exactitud : null, promedio: Math.round(conStk.slice(-5).reduce((a, x) => a + x.stock10.exactitud, 0) / Math.min(5, conStk.length)),
    diferencias: us.stock10.items.filter(i => i.diferencia).map(i => ({ codigo: i.codigo, descripcion: i.descripcion, sistema: i.sistema, contado: i.contado, diferencia: i.diferencia })) };
  const conPer = L.filter(x => x.perchero), up = conPer[conPer.length - 1]; if (up) out.perchero = { fecha: up.fecha, estado: up.perchero.estado, texto: up.perchero.texto, comentario: up.perchero.comentario || '' };
  // Recomendaciones: primero qué está pasando (hecho), después la acción. Sin conclusiones sobre el desempeño del personal.
  const R = out.recomendaciones;
  if (vencidas.length) R.push({ prioridad: 1, queEstaPasando: vencidas.length + ' acción(es) correctiva(s) vencida(s) sin resolver' + (vencidas[0] ? ' (la más antigua: ' + vencidas[0].descripcion.slice(0, 60) + ')' : '') + '.', accion: 'Revisar esas acciones con el local esta semana y cerrarlas con evidencia o fijar una nueva fecha.' });
  if (out.pedidosFuera) R.push({ prioridad: 1, queEstaPasando: out.pedidosFuera + ' auditoría(s) reciente(s) con pedidos de más de ' + p.diasMax + ' días sin retirar.', accion: 'Pedir aviso diario de pedidos pendientes y confirmar el retiro en la próxima visita.' });
  if (out.stock10 && out.stock10.exactitud < 90) R.push({ prioridad: out.stock10.exactitud < 70 ? 1 : 2, queEstaPasando: 'En el último control de stock coincidieron ' + out.stock10.coinciden + ' de ' + out.stock10.total + ' artículos (' + out.stock10.exactitud + ' % de exactitud)' + (out.stock10.faltantes ? ', con ' + out.stock10.faltantes + ' unidades faltantes' : '') + '.', accion: 'Revisar las diferencias con quien carga las ventas y los movimientos en Contabilium, y recontar esos artículos la semana próxima.' });
  if (out.perchero && out.perchero.estado !== 'ok') R.push({ prioridad: out.perchero.estado === 'mal' ? 1 : 3, queEstaPasando: 'El perchero del showroom quedó «' + out.perchero.texto + '» en la última auditoría' + (out.perchero.comentario ? ' (' + out.perchero.comentario.slice(0, 80) + ')' : '') + '.', accion: 'Reacomodarlo hoy (orden por modelo y talle, sin prendas caídas) y dejar foto como evidencia.' });
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
  const ops = cfg.diasOperativos || [3, 4, 5, 6];
  base.fechasEspeciales = fechasEspeciales_(hasta, ops, cal);   // 3.5: no dependen de las ventas
  if (!dias.length) return Object.assign(base, { sinDatos: true, alertas: [], recomendaciones: [], mesBajo: null, accionesComerciales: [], diasFlojos: null });

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
        causa: 'Hecho: la venta se concentra el ' + top.nombre + '. Hipótesis: más tráfico de fin de semana (se confirma contando las visitas al showroom).',
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
  if (top) resumen.push({ pregunta: '¿Qué está impulsando las ventas?', respuesta: 'Los ' + top.nombre + ' aportan el ' + top.participacion + '% (' + $_(top.promedio) + ' de promedio).' });
  if (rec.length) resumen.push({ pregunta: '¿Qué conviene revisar esta semana?', respuesta: rec.slice(0, 3).map(r => r.titulo).join(' · ') });

  return Object.assign(base, { desde: dias[0].fecha, hasta: dias[dias.length - 1].fecha, diasConCierre: dias.length,
    meses: meses, semanas: semanas.slice(-16), anios: anios, diaSemana: diaSemana, proyeccion: proyeccion, alertas: alertas, recomendaciones: rec, resumen: resumen,
    ultimos: dias.slice(-31).map(c => Object.assign({}, c, { feriado: cal.feriado(c.fecha) ? cal.feriado(c.fecha).nombre : '', noHabitual: !cal.esApertura(c.fecha) })),
    mesBajo: mesBajo, accionesComerciales: accionesComerciales, quintaSemana: quintaSemana, diasFlojos: diasFlojos_(dias, hasta, ops, cal) });
}

/* ---- 3.3 · Mes bajo: promedio por día de apertura (o su proyección) vs. mes anterior o promedio del año, con umbral configurable ---- */
function mesBajo_(meses, actual, proyeccion, ac, dias) {
  const umbral = Number(ac.mesBajoPct) || 10;
  let m = actual && actual.dias >= ac.minDias ? actual : null, aclaracion = '';
  if (!m) { const comp = meses.filter(x => !x.enCurso && x.dias >= ac.minDias); m = comp[comp.length - 1] || null;
    if (actual) aclaracion = m ? 'Se evalúa ' + m.nombre + ': ' + actual.nombre + ' lleva ' + actual.dias + ' días con cierre y se evalúa desde ' + ac.minDias + '.' : ''; }
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
    porQue: 'La acción apunta a subir el importe por visita.' + (actual && actual.mix ? ' Mix actual: tarjetas ' + actual.mix.tarjetas + '%, transferencia ' + actual.mix.transferencia + '%, efectivo ' + actual.mix.efectivo + '%.' : ''),
    esfuerzo: 'bajo', plazo: 'esta semana', medicion: 'Facturación por día de apertura y participación del medio de pago promocionado en las próximas 2 semanas.' });
  A.push({ prioridad: 3, tipo: 'clientes', titulo: 'Campaña de WhatsApp a clientas anteriores y registro de contactos',
    queHacer: 'Mandar una campaña por WhatsApp o mail a clientas anteriores con una invitación concreta al showroom, y registrar el contacto en cada venta nueva.',
    porQue: 'Una base de contactos permite medir la recurrencia y reactivar visitas en los días flojos.',
    esfuerzo: 'bajo', plazo: 'este mes', medicion: 'Contactos registrados por semana y ventas que responden a la campaña.' });
  A.push({ prioridad: 3, tipo: 'ticket', titulo: 'Venta cruzada y armado de looks',
    queHacer: 'Armar looks completos en el showroom y ofrecer la segunda prenda en cada venta.',
    porQue: 'Hipótesis: hay margen para subir el importe por visita con looks armados.',
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
/* ---- Textos del resumen hablado (el navegador los lee con la Web Speech API; aquí solo se arma el texto con datos reales) ----
   3.5 · Regla: lo que no tiene datos no se menciona (ni "no hay datos" ni secciones vacías). Orden: comercial → auditoría → RRHH,
   de lo más importante a lo positivo. Si no hay nada para contar, solo un saludo. */
/* 3.9 · Audio: un resumen corto por canal, cierre con el total de la marca y cuánto aporta cada canal; Google por local y acción. */
function audioCanales_(K, G) {
  if (!K || !K.canales || !K.canales.length) return { partes: [], total: '', acciones: [] };
  const mesN = MESES[Number(K.mes.slice(5, 7)) - 1], mesAN = MESES[Number(K.mesAnt.slice(5, 7)) - 1];
  const pc = v => palabras_(Math.round(Math.abs(v))) + ' por ciento ' + (v >= 0 ? 'más' : 'menos');
  const partes = K.canales.map(c => {
    if (c.canal === CANAL_GC) return c.mes.v ? 'Grandes cuentas: en ' + mesN + ' se les facturó ' + millones_(c.mes.v) + '.' : '';
    if (!c.mes.v && !c.anio.v) return '';
    const vs = [];
    if (c.vsMesAnt != null) vs.push(pc(c.vsMesAnt) + ' que ' + mesAN + ' a esta altura');
    if (c.vsAnioAnt != null) vs.push(pc(c.vsAnioAnt) + ' que ' + mesN + ' del año pasado');
    return c.canal + ': en ' + mesN + ' lleva ' + millones_(c.mes.v) + (vs.length ? ', ' + vs.join(' y ') : '') + '.' +
      (c.mes.ticket ? ' Ticket promedio ' + millones_(c.mes.ticket) + '.' : '') +
      (c.ultimo && c.ultimo.fecha >= sumarDias_(K.hoy, -3) ? (c.ultimo.fecha === K.hoy ? ' Hoy lleva ' : c.ultimo.fecha === sumarDias_(K.hoy, -1) ? ' Ayer vendió ' : ' Lo último facturado, ' + sinEl_(fechaHablada_(c.ultimo.fecha)) + ', suma ') + millones_(c.ultimo.v) + '.' : '');
  }).filter(Boolean);
  const T = K.total, conParte = K.canales.filter(c => c.partMes);
  const total = T.mes ? 'En total, la marca lleva ' + millones_(T.mes) + ' en ' + mesN + (T.vsMesAnt != null ? ', ' + pc(T.vsMesAnt) + ' que ' + mesAN + ' a esta altura' : '') + '. ' +
    (conParte.length > 1 ? 'Aportan: ' + conParte.sort((a, b) => b.partMes - a.partMes).map(c => c.canal.toLowerCase() + ' ' + palabras_(Math.round(c.partMes)) + ' por ciento').join(', ') + '.' : '') : '';
  const acciones = (K.acciones || []).slice(0, 3).map(a => a.canal + ': ' + hablar_(a.porQue) + ' Acción: ' + a.titulo.toLowerCase() + ', ' + a.accion.charAt(0).toLowerCase() + a.accion.slice(1));
  return { partes: partes, total: total, acciones: acciones };
}
function audioGoogle_(G) {
  if (!G || !G.locales) return [];
  return G.locales.map(l => {
    if (!l.fichaPropia) return l.local + ' no tiene ficha propia en Google. Acción: ' + l.accion.charAt(0).toLowerCase() + l.accion.slice(1);
    const cal = String(l.calificacion).replace('.', ' coma ');
    const ev = l.vsMes ? (l.vsMes.calif ? (l.vsMes.calif > 0 ? ', subió ' : ', bajó ') + String(Math.abs(l.vsMes.calif)).replace('.', ' coma ') + ' en el mes' : ', igual que hace un mes') + (l.vsMes.resenas > 0 ? ' y sumó ' + palabras_(l.vsMes.resenas) + ' reseñas' : '') : '';
    return 'En Google, ' + l.local + ' tiene ' + cal + ' estrellas con ' + palabras_(l.resenas) + ' reseñas' + ev + (l.pctRespondidas != null ? '; responde el ' + palabras_(l.pctRespondidas) + ' por ciento' : '') + '. Lo más importante: ' + l.accion.charAt(0).toLowerCase() + l.accion.slice(1);
  });
}
function audio_(u, com, aud, ctx) {
  const nombre = String(u && u.nombre || '').trim().split(' ')[0];
  const hola = nombre ? 'Hola ' + nombre + ', ' : 'Hola, ';
  const hoy = ctx.hoy || hoy_();
  const limpiar = t => String(t || '').replace(/\s+/g, ' ').trim();
  // Feriados: una frase breve solo cuando corresponde.
  const fer = ctx.feriados || { proximos: [], pendientes: [] }, lim14 = sumarDias_(hoy, 14);
  const prox = (fer.proximos || []).filter(f => f.fecha >= hoy && f.fecha <= lim14 && f.abre && !f.palermo)[0];
  const nPend = (fer.pendientes || []).length;
  const ferProx = prox ? 'Atención, ' + fechaHablada_(prox.fecha) + ' es feriado, ' + prox.nombre + ', hay que confirmar si Palermo abre.' : '';
  const ferPend = nPend ? (nPend === 1 ? 'Hay un feriado pendiente de confirmar si el local abrió.' : 'Hay ' + palabras_(nPend) + ' feriados pendientes de confirmar si el local abrió.') : '';
  // 3.7 · Clima: solo si se espera lluvia un día de apertura (la venta puede ser menor) y qué hacer.
  const cli = ctx.clima && ctx.clima.aviso, climaTxt = cli ? hablar_(cli.texto.replace(/ \((\d+) % de probabilidad\)/, ', con $1 % de probabilidad,')) + ' ' + cli.accion : '';
  // ---- Comercial
  const C = [], Cg = [];
  if (!com.sinDatos) {
    const meses = com.meses || [], actual = meses.find(m => m.enCurso), conDatos = meses.filter(m => m.dias), ref = conDatos[conDatos.length - 1], ult = (com.ultimos || []).slice(-1)[0];
    if (ult) { const s = 'El último cierre es del ' + sinEl_(fechaHablada_(ult.fecha)) + ', con ' + dinero_(ult.total) + (ult.feriado ? ', un día feriado' : '') + '.'; C.push(s); Cg.push(s); }
    if (ref) {
      const s = 'En ' + ref.nombre.split(' ')[0] + ' van ' + dinero_(ref.total) + ' en ' + palabras_(ref.dias) + (ref.dias === 1 ? ' día con cierre' : ' días con cierre') + ', un promedio de ' + dinero_(ref.promDia) + ' por día' +
        (ref.vsAnterior && ref.vsAnterior.deltaPromPct != null ? ', ' + porcentaje_(ref.vsAnterior.deltaPromPct) + ' que en ' + MES_NOM(ref.vsAnterior.mes).split(' ')[0] + '.' : '.');
      C.push(s); Cg.push(s);
      if (ref.diasCerrados && ref.diasCerrados.length) { const m = 'Este mes tuvo ' + (ref.diasCerrados.length === 1 ? 'un día menos de apertura' : palabras_(ref.diasCerrados.length) + ' días menos de apertura') + ' por ' + ref.diasCerrados[0].tipo + '.'; C.push(m); }
    }
    const sem = (com.semanas || []).filter(s => s.dias >= 1), us = sem[sem.length - 1];
    if (us) C.push('La última semana con ventas, la del ' + sinEl_(fechaHablada_(us.semana)) + ', sumó ' + dinero_(us.total) + (us.deltaPct != null ? ', ' + porcentaje_(us.deltaPct) + ' respecto de la anterior.' : '.'));
    const P = com.proyeccion;
    if (P && !P.bloqueada) { const s = 'Si se mantiene el ritmo, ' + (actual ? actual.nombre.split(' ')[0] : 'el mes') + ' cerraría cerca de ' + dinero_(P.medio) + ', entre ' + dinero_(P.minimo) + ' y ' + dinero_(P.maximo) + '. Es una estimación.' + (P.objetivo ? ' El objetivo es ' + dinero_(P.objetivo) + ' y el avance real es del ' + palabras_(Math.round(P.avancePct)) + ' por ciento.' : ''); C.push(s); Cg.push(s); }
    const ds = (com.diaSemana || []).filter(d => d.n >= 2), fuerte = ds.slice().sort((a, b) => b.participacion - a.participacion)[0];
    if (fuerte) C.push('El día más fuerte es el ' + fuerte.nombre + ', con el ' + palabras_(Math.round(fuerte.participacion)) + ' por ciento de la facturación.');
    if (ref && ref.mix) {
      C.push('En medios de pago: tarjetas ' + palabras_(Math.round(ref.mix.tarjetas)) + ' por ciento, transferencia ' + palabras_(Math.round(ref.mix.transferencia)) + ' y efectivo ' + palabras_(Math.round(ref.mix.efectivo)) + '.');
      const cm = (com.alertas || []).find(a => a.tipo === 'cambio_mix'); if (cm) C.push('Cambio relevante: ' + hablar_(cm.titulo.toLowerCase() + ', ' + cm.observado + ' contra ' + cm.comparado) + '.');
    }
    const recs = (com.recomendaciones || []).slice(0, 2); if (recs.length) C.push('Recomendaciones comerciales: ' + recs.map(r => hablar_(r.titulo).toLowerCase()).join('; ') + '.');
  }
  // ---- Días flojos (vs. el promedio del mismo día de la semana) y acciones para traccionar
  const DF = com.diasFlojos, F = [], Fg = [];
  if (DF) {
    const pe = DF.diaMasFlojo;
    if (pe && pe.vsGeneralPct != null && pe.vsGeneralPct < 0) { const s = 'El día más flojo es el ' + pe.nombre + ', con ' + dinero_(pe.promedio) + ' de promedio, ' + porcentaje_(pe.vsGeneralPct) + ' que el promedio general.'; F.push(s); Fg.push(s); }
    if (DF.flojos.length) F.push('En las últimas dos semanas vendieron por debajo de lo habitual ' + DF.flojos.slice(0, 3).map(x => sinEl_(fechaHablada_(x.fecha))).join(', ') + '.');
    const ac = DF.acciones.slice(0, 3);
    if (ac.length) { F.push('Para traccionar ventas: ' + ac.map((a, i) => palabras_(i + 1) + ', ' + a.titulo.toLowerCase() + ': ' + hablar_(a.detalle.charAt(0).toLowerCase() + a.detalle.slice(1))).join(' ') + (ac[0].meta ? ' ' + hablar_(ac[0].meta) : '')); Fg.push('Acción sugerida: ' + ac[0].titulo.toLowerCase() + '.'); }
  }
  // ---- Fechas especiales que se vienen (aviso con 3 a 4 semanas) y qué hacer ahora
  const FE = com.fechasEspeciales || [], E = [], Eg = [];
  FE.slice(0, 3).forEach((f, i) => {
    const cuando = f.faltan <= 0 ? ' es hoy' : f.faltan === 1 ? ' es mañana' : ' es ' + fechaHablada_(f.fecha) + ', en ' + palabras_(f.faltan) + ' días';
    const s = f.nombre + cuando + (f.aConfirmar ? ', fecha a confirmar' : '') + '. Ahora conviene: ' + f.accionAhora.charAt(0).toLowerCase() + f.accionAhora.slice(1) + (f.refuerzoLocal && f.faltan <= 7 ? ' Reforzá el local en los días de apertura cercanos.' : '');
    E.push(s); if (i === 0) Eg.push(s);
  });
  // ---- Mes bajo (una frase) y acciones
  const mb = com.mesBajo, X = [];
  let bajoTxt = '';
  if (mb && mb.esBajo === false) bajoTxt = 'El mes viene en línea: ' + mb.nombre.split(' ')[0] + ' promedia ' + dinero_(mb.promDia) + ' por día de apertura.';
  else if (mb && mb.esBajo) bajoTxt = cap_(mb.nombre.split(' ')[0]) + ' se considera un mes bajo: ' + (mb.criterio === 'promedio' ? 'el promedio por día de apertura es ' + dinero_(mb.promDia) : 'la proyección por día es ' + dinero_(mb.promDiaProyectado)) + ', ' + porcentaje_(mb.deltaPct) + ' que el ' + mb.contra.replace(/\s*\(.*\)/, '') + '.';
  if (bajoTxt) X.push(bajoTxt);
  const acs = com.accionesComerciales || [];
  if (acs.length) X.push('Las ' + (acs.length >= 3 ? 'tres' : palabras_(acs.length)) + ' acciones principales: ' + acs.slice(0, 3).map((a, i) => palabras_(i + 1) + ', ' + hablar_(a.titulo) + '. ' + hablar_(a.porQue.replace(/^Dato: /, '')) + ' Esfuerzo ' + a.esfuerzo + ', plazo ' + a.plazo + '.').join(' '));
  if (acs.length) X.push('El detalle de cada acción, con cómo medirla, está en pantalla.');
  X.push.apply(X, F); X.push.apply(X, E);
  // ---- Auditoría (solo lo que tiene datos)
  const A = [], pend = ctx.pendientes || [], acc = ctx.acciones || {};
  if (pend.length) A.push(pend.length === 1 ? 'Hay un cierre pendiente de carga, el ' + sinEl_(fechaHablada_(pend[0])) + '.' : 'Hay ' + palabras_(pend.length) + ' cierres pendientes de carga; los primeros son ' + pend.slice(0, 3).map(f => sinEl_(fechaHablada_(f))).join(', ') + '.');
  if (acc.abiertas) A.push(palabras_(acc.abiertas) === 'uno' ? 'Hay una acción correctiva abierta' + (acc.vencidas ? ', vencida.' : '.') : 'Hay ' + palabras_(acc.abiertas) + ' acciones correctivas abiertas' + (acc.vencidas ? ', ' + palabras_(acc.vencidas) + (acc.vencidas === 1 ? ' vencida.' : ' vencidas.') : '.'));
  if (aud && aud.ultima) A.push('La última auditoría fue el ' + sinEl_(fechaHablada_(aud.ultima.fecha)) + ', con resultado ' + String(aud.ultima.resultado).toLowerCase() + ', ' + String(aud.ultima.promedio).replace('.', ' coma ') + ' sobre cinco.');
  if (aud && aud.stock10) A.push('En el control de stock de diez artículos al azar coincidieron ' + palabras_(aud.stock10.coinciden) + ' de ' + palabras_(aud.stock10.total) + ', ' + palabras_(aud.stock10.exactitud) + ' por ciento de exactitud' + (aud.stock10.faltantes ? ', con ' + unid36_(aud.stock10.faltantes) + ' faltantes' : '') + (aud.stock10.sobrantes ? ' y ' + unid36_(aud.stock10.sobrantes) + ' de más' : '') + '.');
  if (aud && aud.perchero && aud.perchero.estado !== 'ok') A.push('El perchero del showroom quedó ' + aud.perchero.texto.toLowerCase() + '.');
  const recA = (aud && aud.recomendaciones || []).slice(0, 3).map(r => 'Prioridad ' + palabras_(r.prioridad) + ': ' + hablar_(r.queEstaPasando) + ' Acción: ' + hablar_(r.accion));
  if (ferPend) A.push(ferPend);
  // ---- RRHH (jefes y administración): hasta 3 alertas, de las rojas a las positivas, en tono neutro
  const R = [], al = ctx.rrhh && ctx.rrhh.alertas || [];
  const atencion = al.filter(a => a.nivel !== 'verde').slice(0, 3), positivas = al.filter(a => a.nivel === 'verde');
  const minus = t => hablar_(t.charAt(0).toLowerCase() + t.slice(1));
  const porPersona = []; atencion.forEach(a => { const p = porPersona.find(x => x.uid === a.uid); if (p) p.t.push(minus(a.titulo)); else porPersona.push({ uid: a.uid, nombre: a.nombre, t: [minus(a.titulo)] }); });
  porPersona.slice(0, 3).forEach(p => R.push(p.nombre + ': ' + p.t.join(' y ') + '.'));
  if (positivas.length && porPersona.length < 3) R.push('Para destacar: ' + positivas[0].nombre + ', ' + minus(positivas[0].titulo) + '.');
  // ---- Armado
  const intro = t => hola + t + ' ';
  const seccion = (titulo, partes) => partes.filter(Boolean).length ? limpiar(intro(titulo) + partes.filter(Boolean).join(' ')) : '';
  const ctxTxt = audioContexto37_(ctx.contexto);
  const CN = audioCanales_(ctx.canales), GO = audioGoogle_(ctx.google), gcr = ctx.grandes;
  const gcTxt = gcr && gcr.pedido$ ? 'Grandes cuentas, según Control ingreso: ' + palabras_(gcr.clientes) + ' clientes, pedido por ' + millones_(gcr.pedido$) + (gcr.entregado$ ? ', entregado ' + millones_(gcr.entregado$) : '') + (gcr.cobrado != null ? ', cobrado ' + millones_(gcr.cobrado) : '') + (gcr.saldo ? ' y saldo pendiente de ' + millones_(gcr.saldo) : '') + '.' + (gcr.top && gcr.top[0] ? ' La que más compra es ' + gcr.top[0].nombre + '.' : '') : '';
  const comercial = CN.partes.length ? seccion('te cuento las ventas de la marca, canal por canal.', CN.partes.concat([gcTxt, CN.total], C.length ? ['En Palermo, según los cierres de caja: ' + C.slice(0, 2).join(' ')] : [], GO, F.slice(0, 1), E.slice(0, 1), [ferProx, climaTxt, ctxTxt]))
    : seccion('te cuento los indicadores comerciales de Palermo.', C.concat([gcTxt], GO, F, E, [ferProx, climaTxt, ctxTxt]));
  const auditoria = seccion('te cuento los indicadores de auditoría de Palermo.', A.concat(recA));
  const acciones = seccion(CN.acciones.length ? 'te cuento las acciones comerciales por canal.' : 'te cuento las acciones comerciales para Palermo.', CN.acciones.concat(X));
  const rrhh = seccion('te cuento el panorama de recursos humanos de los últimos treinta días.', R);
  const cuerpo = [];
  if (CN.partes.length) cuerpo.push(['Ventas por canal. '].concat(CN.partes, [CN.total], CN.acciones.slice(0, 1).map(a => 'Para traccionar, ' + a.charAt(0).toLowerCase() + a.slice(1)), Eg, [ferProx, climaTxt]).filter(Boolean).join(' '));
  else if (Cg.length || bajoTxt || Fg.length || Eg.length || ferProx || climaTxt) cuerpo.push(Cg.concat([bajoTxt], Fg, Eg, [ferProx, climaTxt]).filter(Boolean).join(' '));
  if (gcTxt) cuerpo.push(gcTxt);
  if (GO.length) cuerpo.push(GO.join(' '));
  if (A.length) cuerpo.push('Ahora, auditoría. ' + A.slice(0, 3).join(' ') + (recA.length ? ' ' + recA[0] : ''));
  const cr = ctx.clientes, pr = ctx.produccion;
  if (!gcTxt && cr && cr.clientes) { const top = (ctx.clientesLista || []).filter(c => c.pendiente).sort((a, b) => b.pendiente - a.pendiente)[0];
    const tp = cr.topPendiente && cr.topPendiente[0];
    cuerpo.push('Pedidos de clientes: se llevaron ' + unid36_(cr.despachado) + ', el ' + palabras_(cr.avance || 0) + ' por ciento' + (cr.separado ? ', hay ' + unid36_(cr.separado) + ' separadas' : '') + ' y faltan despachar ' + unid36_(cr.pendiente) + (tp ? '; ' + tp.nombre + ' es el que más espera' : '') + '.' +
      (cr.pagado != null ? ' Pagado: ' + dinero_(cr.pagado) + (cr.faltaPagar ? ', falta pagar ' + dinero_(cr.faltaPagar) : '') + '.' : '')); }
  if (pr && (pr.planificado || pr.stock)) cuerpo.push('Producción: ' + (pr.stock ? 'stock real libre en Lima, ' + unid36_(pr.stock.libre) + '; ' : '') + (pr.falta ? 'falta producir ' + unid36_(pr.falta.total) + '; ' : '') +
    (pr.taller ? 'de los pedidos de taller llegaron ' + unid36_(pr.taller.llegadas) + (pr.taller.estados.en_produccion.unidades ? ' y ' + unid36_(pr.taller.estados.en_produccion.unidades) + ' siguen en producción' : '') : 'avance del ' + palabras_(pr.avance || 0) + ' por ciento') +
    (pr.atrasados ? '; hay ' + palabras_(pr.atrasados) + (pr.atrasados === 1 ? ' pedido atrasado' : ' pedidos atrasados') : '') + '.');
  if (R.length) cuerpo.push('En recursos humanos: ' + R.join(' '));
  if (ctxTxt) cuerpo.push(ctxTxt);
  const general = cuerpo.length ? limpiar(intro('te cuento las últimas novedades.') + cuerpo.join(' ') + ' Eso es todo por ahora.') : limpiar((nombre ? 'Hola ' + nombre : 'Hola') + ', que tengas un buen día.');
  return { saludo: nombre, general: general, comercial: comercial, auditoria: auditoria, acciones: acciones, rrhh: rrhh };
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

/* =================== 3.5 · Probar mi ubicación (no registra nada) =================== */
/** Muestra si con esta ubicación se podría fichar: distancia a la sucursal, radio y precisión. No guarda la ubicación ni consulta la secuencia. */
function probarUbicacion(token, geo) {
  const s = sesion_(token), v = validarGeo_(geo, sucursalDe_(s.user), cfg_());
  return { ok: v.ok, motivo: v.motivo, distancia: v.distancia, precision: v.precision, radio: v.radio, sucursal: v.sucursal, faltan: v.faltan || null, precisionMax: v.precisionMax || null, precisionBaja: !!v.precisionBaja };
}

/* =================== 3.5 · Borrado de fichajes (solo administración) =================== */
/* Solo el rol "admin" (María). Se borran filas de Ingresos (y las solicitudes de fichaje manual / corrección de ese empleado en el rango)
   y las fotos van a la papelera de Drive. En el historial queda: quién, cuándo, de qué empleado y cuántos registros (sin los datos borrados). */
function soloAdmin_(token, elev) { const s = sesion_(token, 'personal', elev); if (s.user.rol !== 'admin') throw new Error('PERM'); return s; }
/** Borra las filas de una tabla que cumplen la condición, de abajo hacia arriba y por bloques contiguos. Devuelve los objetos borrados. */
function tDelWhere_(nombre, pred) {
  delete MEMO_[nombre];
  const sh = tabla_(nombre), filas = jsonCol_(nombre), idx = [], borrados = [];
  filas.forEach((o, i) => { if (o && pred(o)) { idx.push(i + 2); borrados.push(o); } });
  for (let k = idx.length - 1; k >= 0;) {
    let fin = idx[k], ini = fin; k--;
    while (k >= 0 && idx[k] === ini - 1) { ini = idx[k]; k--; }
    sh.deleteRows(ini, fin - ini + 1);
  }
  delete MEMO_[nombre];
  return borrados;
}
function criterioBorrado_(d) {
  d = d || {};
  const uid = String(d.uid || ''), u = usuarios_().find(x => x.id === uid);
  if (!u) throw new Error('Elegí el empleado.');
  const todos = d.todos === true, desde = todos ? null : fechaOk_(d.desde), hasta = todos ? null : fechaOk_(d.hasta);
  if (!todos && !desde && !hasta) throw new Error('Elegí un rango de fechas o marcá «todos los registros de ese empleado».');
  if (desde && hasta && desde > hasta) throw new Error('La fecha «desde» es posterior a «hasta».');
  const enRango = f => (!desde || f >= desde) && (!hasta || f <= hasta);
  // 3.7: además de fichajes y solicitudes, todo lo de esa persona: vacaciones y novedades de RR. HH.
  return { u: u, todos: todos, desde: desde, hasta: hasta, ing: x => x.uid === uid && enRango(x.fecha), cor: c => c.uid === uid && enRango(c.fecha),
    vac: v => v.uid === uid && (todos || enRango(v.desde) || enRango(v.hasta)), nov: n => (n.uid === uid || (!n.uid && n.legajo === u.legajo)) && enRango(n.fecha),
    texto: todos ? 'todos los registros' : (desde && hasta ? 'del ' + fdm_(desde) + ' al ' + fdm_(hasta) : desde ? 'desde el ' + fdm_(desde) : 'hasta el ' + fdm_(hasta)) };
}
/** Vista previa: cuántos registros se borrarían (no borra nada). */
function previaBorrado(token, d) {
  soloAdmin_(token, false);
  const c = criterioBorrado_(d), ing = tAll_('Ingresos').filter(c.ing), cor = tAll_('Correcciones').filter(c.cor), vac = tAll_('Vacaciones').filter(c.vac), nov = tAll_('RRHH').filter(c.nov);
  const quitable = c.todos && c.u.id !== sesion_(token).user.id && !(c.u.rol === 'admin' && usuarios_().filter(x => x.rol === 'admin' && x.estado === 'activo').length <= 1);
  return { uid: c.u.id, nombre: c.u.nombre, estado: c.u.estado, rango: c.texto, fichajes: ing.length, solicitudes: cor.length, vacaciones: vac.length, novedades: nov.length, fotos: ing.filter(x => x.foto).length,
    quitable: quitable, todos: c.todos,
    primero: ing.length ? ing.map(x => x.fecha).sort()[0] : null, ultimo: ing.length ? ing.map(x => x.fecha).sort().slice(-1)[0] : null };
}
function borrarFichajes(token, d) {
  const s = soloAdmin_(token, true);
  d = d || {};
  if (String(d.confirmacion || '').trim().toUpperCase() !== 'BORRAR') throw new Error('Para confirmar escribí BORRAR.');
  return lock_(() => {
    const c = criterioBorrado_(d);
    const esperado = Number(d.esperado);
    const ing = tDelWhere_('Ingresos', c.ing);
    if (isFinite(esperado) && d.esperado != null && ing.length !== esperado) log_(s, 'borrado_fichajes_aviso', 'alerta', c.u.id, 'La cantidad cambió entre la vista previa (' + esperado + ') y el borrado (' + ing.length + ')');
    const cor = tDelWhere_('Correcciones', c.cor), vac = tDelWhere_('Vacaciones', c.vac), nov = tDelWhere_('RRHH', c.nov);
    let fotos = 0; ing.forEach(x => { if (x.foto) { try { DriveApp.getFileById(x.foto).setTrashed(true); fotos++; } catch (e) {} } });
    // 3.7: con «todos los registros» se puede quitar también a la persona de Personal (nunca a uno mismo ni al único administrador).
    let quitada = false;
    if (d.quitarPersona === true && c.todos) {
      if (c.u.id === s.user.id) throw new Error('No podés quitarte a vos mismo.');
      if (c.u.rol === 'admin' && usuarios_().filter(x => x.rol === 'admin' && x.estado === 'activo').length <= 1) throw new Error('Es el único administrador activo.');
      quitada = tDelWhere_('Usuarios', x => x.id === c.u.id).length > 0; CACHE.remove('usuarios');
    }
    log_(s, 'borrado_fichajes', 'ok', c.u.id, c.u.nombre + ' (' + c.u.legajo + ') · ' + c.texto + ' · ' + ing.length + ' fichaje(s), ' + cor.length + ' solicitud(es), ' + vac.length + ' vacaciones, ' + nov.length + ' novedad(es), ' + fotos + ' foto(s) a la papelera' + (quitada ? ' · persona quitada de Personal' : ''));
    return { nombre: c.u.nombre, fichajes: ing.length, solicitudes: cor.length, vacaciones: vac.length, novedades: nov.length, fotos: fotos, quitada: quitada };
  });
}
/** Borrado de un registro individual (desde el detalle de la fichada). */
function borrarFichaje(token, id) {
  const s = soloAdmin_(token, true);
  return lock_(() => {
    const borr = tDelWhere_('Ingresos', x => x.id === String(id || ''));
    if (!borr.length) throw new Error('Registro no encontrado (puede que ya se haya borrado).');
    const x = borr[0];
    if (x.foto) { try { DriveApp.getFileById(x.foto).setTrashed(true); } catch (e) {} }
    log_(s, 'borrado_fichajes', 'ok', x.uid, x.nombre + ' (' + x.legajo + ') · 1 registro individual (' + tipoDe_(x) + ')');
    return { fichajes: 1 };
  });
}

/* =================== 3.5 · Días flojos y fechas especiales (acciones comerciales) =================== */
/** Días flojos: los días de apertura recientes que vendieron por debajo del promedio de su mismo día de la semana (últimas 8 semanas). */
function diasFlojos_(dias, hasta, ops, cal) {
  const desde8 = sumarDias_(hasta, -56), base = dias.filter(c => c.fecha >= desde8 && c.fecha <= hasta && ops.indexOf(dow_(c.fecha)) >= 0 && !(cal.feriado(c.fecha)));
  if (base.length < 6) return null;
  const prom = {}; ops.forEach(d => { const l = base.filter(c => dow_(c.fecha) === d); if (l.length >= 2) prom[d] = { n: l.length, prom: l.reduce((a, c) => a + c.total, 0) / l.length }; });
  const general = base.reduce((a, c) => a + c.total, 0) / base.length;
  const recientes = base.filter(c => c.fecha >= sumarDias_(hasta, -14) && prom[dow_(c.fecha)]).map(c => {
    const p = prom[dow_(c.fecha)].prom; return { fecha: c.fecha, dia: NOMBRE_DIA[dow_(c.fecha)], total: c.total, promedioDia: r2_(p), deltaPct: pct_(c.total, p) };
  });
  const flojos = recientes.filter(x => x.deltaPct != null && x.deltaPct <= -20).sort((a, b) => a.deltaPct - b.deltaPct);
  const ranking = Object.keys(prom).map(Number).map(d => ({ dia: d, nombre: NOMBRE_DIA[d], promedio: r2_(prom[d].prom), vsGeneralPct: pct_(prom[d].prom, general) })).sort((a, b) => a.promedio - b.promedio);
  const peor = ranking[0];
  if (!flojos.length && !(peor && peor.vsGeneralPct <= -15)) return null;
  const nom = peor ? peor.nombre : flojos[0].dia, brecha = peor ? Math.max(0, r2_(general - peor.promedio)) : 0;
  const acciones = [];
  acciones.push({ titulo: 'Promo exclusiva del ' + nom, detalle: 'Un beneficio solo válido ese día en el showroom (regalo con la compra, 10 % en la segunda prenda o preventa de novedades), anunciado el día anterior.',
    meta: brecha ? 'Llevar el ' + nom + ' a su promedio general suma unos ' + $_(brecha) + ' por semana.' : '' });
  acciones.push({ titulo: 'WhatsApp a la base de clientas el día anterior', detalle: 'Mensaje corto con 3 fotos de novedades e invitación al showroom para el ' + nom + ', priorizando a las clientas frecuentes (atención preferencial o un horario reservado).', meta: '' });
  acciones.push({ titulo: flojos.length >= 2 ? 'Combo de 2 prendas y contenido en redes' : 'Contenido en redes para ese día', detalle: (flojos.length >= 2 ? 'Combo o beneficio al llevar dos o más prendas y ' : '') + 'historias del local en vivo ese día (vidriera, ingresos nuevos, looks armados) con la dirección y el horario.', meta: '' });
  return { umbralPct: -20, flojos: flojos.slice(0, 4), diaMasFlojo: peor || null, promedioGeneral: r2_(general), acciones: acciones };
}
const nDomingo_ = (y, mes, n) => { const d = new Date(Date.UTC(y, mes - 1, 1)); const off = (7 - d.getUTCDay()) % 7; return new Date(Date.UTC(y, mes - 1, 1 + off + 7 * (n - 1))).toISOString().slice(0, 10); };
const nDiaSemana_ = (y, mes, dow, n) => { const d = new Date(Date.UTC(y, mes - 1, 1)); const off = (dow - d.getUTCDay() + 7) % 7; return new Date(Date.UTC(y, mes - 1, 1 + off + 7 * (n - 1))).toISOString().slice(0, 10); };
/* Eventos de comercio electrónico con fecha oficial de CACE cuando está anunciada; si no, se marca "a confirmar". */
const EVENTOS_CACE = { cyber: { 2026: ['2026-11-02', '2026-11-04'] }, hotsale: { 2026: ['2026-05-11', '2026-05-13'] } };
/** Fechas especiales de Argentina de este año y el próximo (comerciales + fines de semana largos de los feriados cargados). */
function fechasEspecialesLista_(y, cal) {
  const L = [];
  [y, y + 1].forEach(a => {
    L.push({ id: 'madre', nombre: 'Día de la Madre', fecha: nDomingo_(a, 10, 3), tipo: 'regalo' });
    L.push({ id: 'padre', nombre: 'Día del Padre', fecha: nDomingo_(a, 6, 3), tipo: 'regalo' });
    L.push({ id: 'blackfriday', nombre: 'Black Friday', fecha: nDiaSemana_(a, 11, 5, 4), tipo: 'descuentos' });
    L.push({ id: 'cybermonday_us', nombre: 'Cyber Monday', fecha: sumarDias_(nDiaSemana_(a, 11, 5, 4), 3), tipo: 'descuentos' });
    const cy = EVENTOS_CACE.cyber[a]; L.push({ id: 'cyber_cace', nombre: 'CyberMonday (CACE)', fecha: cy ? cy[0] : nDiaSemana_(a, 11, 1, 1), hasta: cy ? cy[1] : null, aConfirmar: !cy, tipo: 'descuentos' });
    const hs = EVENTOS_CACE.hotsale[a]; L.push({ id: 'hotsale', nombre: 'Hot Sale (CACE)', fecha: hs ? hs[0] : nDiaSemana_(a, 5, 1, 2), hasta: hs ? hs[1] : null, aConfirmar: !hs, tipo: 'descuentos' });
    L.push({ id: 'navidad', nombre: 'Navidad', fecha: a + '-12-25', tipo: 'regalo' });
    L.push({ id: 'anionuevo', nombre: 'Año Nuevo', fecha: (a + 1) + '-01-01', tipo: 'fiestas' });
  });
  // Fines de semana largos: feriados nacionales (o puentes) pegados a un sábado/domingo.
  const vistos = {};
  cal.lista.filter(f => f.origen === 'api' && f.fecha.slice(0, 4) >= String(y)).forEach(f => {
    const d = dow_(f.fecha); if ([1, 5].indexOf(d) < 0 && f.tipo !== 'puente turístico') return;
    let ini = f.fecha, fin = f.fecha;
    while (dow_(sumarDias_(ini, -1)) === 0 || dow_(sumarDias_(ini, -1)) === 6 || cal.feriado(sumarDias_(ini, -1))) ini = sumarDias_(ini, -1);
    while (dow_(sumarDias_(fin, 1)) === 0 || dow_(sumarDias_(fin, 1)) === 6 || cal.feriado(sumarDias_(fin, 1))) fin = sumarDias_(fin, 1);
    if (vistos[ini] || (Date.parse(fin) - Date.parse(ini)) / 86400000 < 2) return; vistos[ini] = 1;
    L.push({ id: 'finde_' + ini, nombre: 'Fin de semana largo por ' + f.nombre.replace(/\s*\([^)]*\)/g, ''), fecha: ini, hasta: fin, tipo: 'finde' });
  });
  return L.sort((a, b) => a.fecha.localeCompare(b.fecha));
}
/** Plan por etapas para una fecha especial: 3-4 semanas antes, 2 semanas antes, semana previa y el día; con refuerzo del local si cae en días de apertura. */
function planFecha_(f, ops, hoy) {
  const faltan = Math.round((Date.parse(f.fecha + 'T12:00:00Z') - Date.parse(hoy + 'T12:00:00Z')) / 86400000);
  const etapa = faltan >= 21 ? 'tres_cuatro' : faltan >= 8 ? 'dos' : faltan >= 1 ? 'previa' : 'dia';
  const abiertos = []; for (let d = sumarDias_(f.fecha, -6); d <= (f.hasta || f.fecha); d = sumarDias_(d, 1)) if (ops.indexOf(dow_(d)) >= 0) abiertos.push(d);
  const regalo = f.tipo === 'regalo', desc = f.tipo === 'descuentos', finde = f.tipo === 'finde';
  const P = {
    tres_cuatro: regalo ? 'Definir los productos foco para regalo (3 a 5), asegurar stock y talles, preparar packaging de regalo y fotos para el catálogo.' :
      desc ? 'Elegir qué se ofrece (preventa, combos o beneficio con transferencia) sin rematar la colección nueva, revisar stock de lo que va a rotar y armar el catálogo de la acción.' :
      finde ? 'Revisar si conviene abrir o ampliar horario esos días y planificar stock de lo que más rota.' : 'Planificar stock y propuesta para las fiestas: regalos, looks de fiesta y tarjetas de regalo.',
    dos: regalo ? 'Comunicar: posteos e historias con la guía de regalos, pauta geolocalizada alrededor del showroom y mensaje a la base de clientas.' :
      desc ? 'Anunciar la acción con cuenta regresiva en redes, pauta a públicos que ya interactuaron y lista de difusión por WhatsApp.' :
      finde ? 'Anunciar los horarios del fin de semana largo y una propuesta para quienes se quedan en la ciudad.' : 'Comunicar horarios especiales y guía de regalos.',
    previa: regalo ? 'Promo de último momento (envoltorio sin cargo, beneficio por compra en el local), recordatorio por WhatsApp y equipo completo en el showroom los días de más movimiento.' :
      desc ? 'Recordatorio el día anterior, beneficio extra para quien compre en el local y el equipo preparado para responder consultas rápido.' :
      finde ? 'Recordar horarios por redes y WhatsApp; vidriera y looks listos.' : 'Recordatorio de horarios y promo de último momento.',
    dia: desc ? 'Publicar en vivo, responder consultas en el momento y medir ventas por hora.' : 'Atención reforzada, contenido en vivo desde el local y registro de ventas para comparar con el año próximo.'
  };
  return { id: f.id, nombre: f.nombre, fecha: f.fecha, hasta: f.hasta || null, aConfirmar: !!f.aConfirmar, faltan: faltan, etapa: etapa, accionAhora: P[etapa],
    etapas: [{ cuando: '3 a 4 semanas antes', que: P.tres_cuatro }, { cuando: '2 semanas antes', que: P.dos }, { cuando: 'Semana previa', que: P.previa }, { cuando: 'El día', que: P.dia }],
    refuerzoLocal: abiertos.length ? 'Cae cerca de días de apertura (' + abiertos.slice(-3).map(d => DIAS_CORTOS[dow_(d)] + ' ' + fdm_(d).slice(0, 5)).join(', ') + '): sumá una persona en el showroom ' + (abiertos.indexOf(f.fecha) >= 0 ? 'ese día' : 'el último día de apertura previo') + ', ampliá el horario si se puede y tené stock a mano de los productos foco.' : '' };
}
/** Fechas que se vienen en las próximas 4 semanas (aviso con 3 a 4 semanas de anticipación). */
function fechasEspeciales_(hoy, ops, cal) {
  const y = Number(hoy.slice(0, 4)), lim = sumarDias_(hoy, 28);
  return fechasEspecialesLista_(y, cal).filter(f => (f.hasta || f.fecha) >= hoy && f.fecha <= lim).slice(0, 4).map(f => planFecha_(f, ops, hoy));
}

/* =================== 3.5 · Panorama RRHH (solo jefes y administración) =================== */
const RRHH_DEF = { tolerancia: 10, faltasAmarillo: 2, faltasRojo: 3, tardanzasAmarillo: 2, tardanzasRojo: 4, incompletosAmarillo: 1, incompletosRojo: 3,
  cumplimientoAmarillo: 90, cumplimientoRojo: 75, jornadaMaxHoras: 10, extraPct: 20, ubicacionAmarillo: 3, ubicacionRojo: 6, rachaDias: 10 };
const umbralesRRHH_ = () => Object.assign({}, RRHH_DEF, cfg_().rrhh || {});
function setUmbralesRRHH(token, u) {
  const s = sesion_(token, 'ingresos', true); u = u || {};
  const c = cfg_(), out = {}, n = (k, lo, hi) => { const v = Number(u[k]); out[k] = isFinite(v) && String(u[k]) !== '' ? Math.min(hi, Math.max(lo, Math.round(v))) : umbralesRRHH_()[k]; };
  n('tolerancia', 0, 60); n('faltasAmarillo', 1, 20); n('faltasRojo', 1, 30); n('tardanzasAmarillo', 1, 30); n('tardanzasRojo', 1, 40); n('incompletosAmarillo', 1, 20); n('incompletosRojo', 1, 30);
  n('cumplimientoAmarillo', 10, 100); n('cumplimientoRojo', 5, 100); n('jornadaMaxHoras', 4, 16); n('extraPct', 5, 100); n('ubicacionAmarillo', 1, 30); n('ubicacionRojo', 1, 50); n('rachaDias', 3, 60);
  if (out.faltasRojo < out.faltasAmarillo || out.tardanzasRojo < out.tardanzasAmarillo || out.incompletosRojo < out.incompletosAmarillo || out.ubicacionRojo < out.ubicacionAmarillo) throw new Error('El umbral rojo no puede ser menor que el amarillo.');
  if (out.cumplimientoRojo > out.cumplimientoAmarillo) throw new Error('El cumplimiento en rojo tiene que ser menor que el de amarillo.');
  c.rrhh = out; PROPS.setProperty('CFG', JSON.stringify(c));
  log_(s, 'cambio_umbrales_rrhh', 'ok', '', JSON.stringify(out).slice(0, 300));
  return out;
}
/** Calcula el panorama de RRHH a partir de fichajes, vacaciones, feriados y horarios. Informativo: no sanciona ni descuenta nada. */
function panorama_(opts) {
  const U = umbralesRRHH_(), hoy = hoy_();
  const hasta = fechaOk_(opts.hasta) && opts.hasta < hoy ? opts.hasta : sumarDias_(hoy, -1);   // hasta ayer: el día en curso no está terminado
  const desde = fechaOk_(opts.desde) && opts.desde <= hasta ? opts.desde : sumarDias_(hasta, -29);
  const H = horas_({ desde: desde, hasta: hasta, sucursal: opts.sucursal || null, uids: opts.uids || null });
  const users = usuarios_(), ing = tAll_('Ingresos').filter(x => x.fecha >= desde && x.fecha <= hasta && vivo_(x));
  const vacAll = tAll_('Vacaciones').filter(v => v.estado === 'aprobada');
  const hist = histRango_(desde, hasta).filter(h => h.accion === 'fichada_rechazada_ubicacion');
  const man = tAll_('Correcciones').filter(c => c.clase === 'manual' && c.fecha >= desde && c.fecha <= hasta);
  const cfg = cfg_(), cal = calendario_(cfg), sucs = sucursales_();
  const periodo = { desde: desde, hasta: hasta };
  const alertas = [], resumen = [];
  H.empleados.forEach(e => {
    const u = users.find(x => x.id === e.uid) || {}, hor = u.horario && horaOk_(u.horario.entrada) && horaOk_(u.horario.salida) ? u.horario : null;
    const suc = sucs.find(x => normSuc_(x.nombre) === normSuc_(e.sucursal)), ops = opsDe_(u, suc);
    const mios = ing.filter(x => x.uid === e.uid);
    const trab = e.dias.filter(x => x.estado === 'trabajado'), faltas = e.dias.filter(x => x.estado === 'sin_fichaje'), inc = e.dias.filter(x => x.estado === 'incompleto');
    // Tardanzas y salidas anticipadas (solo si la persona tiene horario cargado)
    let tard = [], anticip = [];
    if (hor) trab.forEach(x => {
      const P = (x.pares || []).filter(p => p.entrada && p.salida); if (!P.length) return;
      if (minDe_(P[0].entrada) > minDe_(hor.entrada) + U.tolerancia) tard.push(x.fecha);
      if (minDe_(P[P.length - 1].salida) < minDe_(hor.salida) - U.tolerancia) anticip.push(x.fecha);
    });
    const largas = trab.filter(x => x.minutos > U.jornadaMaxHoras * 60);
    const rechazos = hist.filter(h => h.uid === e.uid).length, manuales = man.filter(c => c.uid === e.uid).length;
    const cumpl = e.esperado ? Math.round(e.total / e.esperado * 100) : null;
    const vacTom = e.dias.filter(x => x.estado === 'vacaciones').length;
    let saldo = null;
    if (u.vacacionesAnuales > 0) {
      const anio = hoy.slice(0, 4); let usados = 0;
      vacAll.filter(v => v.uid === e.uid && v.desde.slice(0, 4) <= anio && v.hasta.slice(0, 4) >= anio).forEach(v => { usados += Number(v.dias) || 0; });
      saldo = u.vacacionesAnuales - usados;
    }
    // Racha actual de días esperados trabajados (desde el más reciente hacia atrás)
    let racha = 0; for (let i = e.dias.length - 1; i >= 0; i--) { const x = e.dias[i]; if (x.estado === 'trabajado' || x.estado === 'en_curso') racha++; else if (x.estado === 'sin_fichaje' || x.estado === 'incompleto') break; }
    // Personal dado de baja: solo aparece si trabajó en el período (sus días sin fichaje no son ausencias).
    const tieneDatos = u.estado !== 'activo' ? trab.length > 0 : (trab.length || faltas.length || inc.length || rechazos || manuales || vacTom);
    if (!tieneDatos) return;   // regla: si no hay datos en el período, no se menciona
    const A = (nivel, tipo, titulo, detalle) => alertas.push({ uid: e.uid, nombre: e.nombre, sucursal: e.sucursal, nivel: nivel, tipo: tipo, titulo: titulo, detalle: detalle, periodo: periodo });
    const lista = L => L.slice(0, 6).map(f => fdm_(f).slice(0, 5)).join(', ') + (L.length > 6 ? '…' : '');
    if (faltas.length >= U.faltasAmarillo) A(faltas.length >= U.faltasRojo ? 'rojo' : 'amarillo', 'ausentismo', pl_(faltas.length, 'día', 'días') + ' sin fichaje en días que le tocaba trabajar', 'Fechas: ' + lista(faltas.map(x => x.fecha)) + '. Ya descontadas vacaciones aprobadas y feriados.');
    const nT = tard.length + anticip.length;
    if (nT >= U.tardanzasAmarillo) A(nT >= U.tardanzasRojo ? 'rojo' : 'amarillo', 'puntualidad', (tard.length ? pl_(tard.length, 'llegada tarde', 'llegadas tarde') : '') + (tard.length && anticip.length ? ' y ' : '') + (anticip.length ? pl_(anticip.length, 'salida anticipada', 'salidas anticipadas') : ''),
      'Horario ' + hor.entrada + ' a ' + hor.salida + ', tolerancia ' + U.tolerancia + ' min. ' + (tard.length ? 'Tarde: ' + lista(tard) + '. ' : '') + (anticip.length ? 'Antes de hora: ' + lista(anticip) + '.' : ''));
    if (inc.length >= U.incompletosAmarillo) A(inc.length >= U.incompletosRojo ? 'rojo' : 'amarillo', 'incompletos', pl_(inc.length, 'día', 'días') + ' con fichaje incompleto (entrada sin salida o salida sin entrada)', 'Fechas: ' + lista(inc.map(x => x.fecha)) + '. No se suman a las horas hasta corregirlos.');
    if (cumpl != null && cumpl < U.cumplimientoAmarillo) A(cumpl < U.cumplimientoRojo ? 'rojo' : 'amarillo', 'horas', 'Horas por debajo de lo pactado: ' + cumpl + ' %', hm_(e.total) + ' h trabajadas de ' + hm_(e.esperado) + ' h pactadas.');
    if (cumpl != null && cumpl > 100 + U.extraPct) A('amarillo', 'extra', 'Horas por encima de lo pactado: ' + cumpl + ' %', hm_(e.total) + ' h trabajadas de ' + hm_(e.esperado) + ' h pactadas.');
    if (largas.length) A('amarillo', 'jornada_larga', pl_(largas.length, 'jornada', 'jornadas') + ' de más de ' + U.jornadaMaxHoras + ' h', 'Fechas: ' + lista(largas.map(x => x.fecha)) + '.');
    const nU = rechazos + manuales;
    if (nU >= U.ubicacionAmarillo) A(nU >= U.ubicacionRojo ? 'rojo' : 'amarillo', 'ubicacion', 'Ubicación rechazada o fichaje manual ' + pl_(nU, 'vez', 'veces'), (rechazos ? rechazos + ' intento(s) rechazado(s) por ubicación' : '') + (rechazos && manuales ? ' y ' : '') + (manuales ? manuales + ' pedido(s) de fichaje manual' : '') + '.');
    // Patrones: faltas el mismo día de la semana, o pegadas a feriados y fines de semana.
    if (faltas.length >= 2) {
      const porDow = {}; faltas.forEach(x => { const d = dow_(x.fecha); porDow[d] = (porDow[d] || 0) + 1; });
      const rep = Object.keys(porDow).filter(d => porDow[d] >= 2).map(Number);
      if (rep.length) A('amarillo', 'patron_dia', 'Faltas repetidas los ' + rep.map(d => NOMBRE_DIA[d]).join(' y '), 'Puede ser casualidad: conviene conversarlo antes de sacar conclusiones.');
      const primero = Math.min.apply(null, ops.map(d => (d + 6) % 7)), ultimo = Math.max.apply(null, ops.map(d => (d + 6) % 7));
      const pegadas = faltas.filter(x => { const d = (dow_(x.fecha) + 6) % 7; return d === primero || d === ultimo || cal.feriado(sumarDias_(x.fecha, -1)) || cal.feriado(sumarDias_(x.fecha, 1)); });
      if (pegadas.length >= 2) A('amarillo', 'patron_finde', pegadas.length + ' faltas pegadas a feriados o al fin de semana', 'Fechas: ' + lista(pegadas.map(x => x.fecha)) + '.');
    }
    // Positivas
    const sinProblemas = !faltas.length && !nT && !inc.length;
    if (sinProblemas && cumpl != null && cumpl >= 100) A('verde', 'cumplimiento', 'Cumplió el ' + cumpl + ' % de sus horas, sin faltas ni tardanzas', hm_(e.total) + ' h de ' + hm_(e.esperado) + ' h pactadas.');
    else if (sinProblemas && hor && trab.length >= 5) A('verde', 'puntualidad', 'Puntualidad destacada: ' + trab.length + ' días sin llegadas tarde', 'Tolerancia ' + U.tolerancia + ' min.');
    else if (sinProblemas && trab.length >= 4 && cumpl == null) A('verde', 'asistencia', trab.length + ' días trabajados sin faltas en el período', '');
    if (racha >= U.rachaDias) A('verde', 'racha', 'Racha de ' + racha + ' días seguidos sin faltas', '');
    const asistencia = trab.length + faltas.length ? Math.round(trab.length / (trab.length + faltas.length) * 100) : null;
    resumen.push({ uid: e.uid, nombre: e.nombre, sucursal: e.sucursal, horas: e.total, esperado: e.esperado, cumplimiento: cumpl, diasTrabajados: trab.length, faltas: faltas.length,
      tardanzas: tard.length, salidasAnticipadas: anticip.length, incompletos: inc.length, vacacionesTomadas: vacTom, saldoVacaciones: saldo, asistencia: asistencia, horario: hor,
      puntaje: cumpl != null ? Math.min(cumpl, 110) - faltas.length * 10 - nT * 3 - inc.length * 3 : (asistencia || 0) - nT * 3 - inc.length * 3 });
  });
  const orden = { rojo: 0, amarillo: 1, verde: 2 };
  alertas.sort((a, b) => orden[a.nivel] - orden[b.nivel] || a.nombre.localeCompare(b.nombre));
  const ranking = resumen.filter(r => r.diasTrabajados).slice().sort((a, b) => b.puntaje - a.puntaje).slice(0, 5)
    .map((r, i) => ({ puesto: i + 1, uid: r.uid, nombre: r.nombre, sucursal: r.sucursal, cumplimiento: r.cumplimiento, asistencia: r.asistencia }));
  return { periodo: periodo, umbrales: U, alertas: alertas, resumen: resumen.sort((a, b) => a.sucursal.localeCompare(b.sucursal) || a.nombre.localeCompare(b.nombre)), ranking: ranking,
    sucursales: sucs.map(x => x.nombre), cuenta: { rojo: alertas.filter(a => a.nivel === 'rojo').length, amarillo: alertas.filter(a => a.nivel === 'amarillo').length, verde: alertas.filter(a => a.nivel === 'verde').length } };
}
const pl_ = (n, uno, varios) => n + ' ' + (n === 1 ? uno : varios);
const hm_ = m => m == null ? '' : Math.floor(m / 60) + ':' + String(Math.round(m) % 60).padStart(2, '0');
function panoramaRRHH(token, f) {
  sesion_(token, 'ingresos'); f = f || {};
  return panorama_({ desde: f.desde, hasta: f.hasta, sucursal: txt_(f.sucursal, 40) || null, uids: f.uid ? [String(f.uid)] : null });
}

/* =================== 3.6 · Clientes y pedidos + Producción (planilla «Control ingreso Nueva temporada 27») ===================
   La planilla se LEE con SpreadsheetApp (nunca se escribe). Las columnas se ubican por el texto del encabezado, no por la posición,
   para que agregar o mover columnas en la planilla no rompa la app. Lo leído se guarda en caché (6 h) y se refresca con
   «Actualizar datos» o con el comando «actualizar las planillas» (función actualizarApp del editor), cualquier día de la semana. */
const CONTROL_ID_DEF = '1ecqEsW9ZILcGxYjAqWvSTqJAgOtaBA7lhSZ5hnf8zP0';
const CONTROL_CACHE = 'CONTROL36';
const controlId_ = () => cfg_().controlFileId || CONTROL_ID_DEF;
const nh_ = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
/** Número de una celda: acepta números, "1.234", "1.234,5", "$ 34.269.420", "-" (cero), "(7)" (negativo). */
function n36_(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  let s = String(v == null ? '' : v).trim(); if (!s || s === '-' || s === '—') return 0;
  const neg = /^\(.*\)$/.test(s) || /^[-−]/.test(s);
  s = s.replace(/[^\d,.]/g, ''); if (!s) return 0;
  if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.'); else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const x = parseFloat(s); return isNaN(x) ? 0 : (neg ? -x : x);
}
/** Fecha de una celda (Date o "dd/mm/aaaa" o "dd/mm") → "aaaa-mm-dd" o null. */
function f36_(v, d) {
  if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  const s = String(d != null && d !== '' ? d : v || '').trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return y + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2); }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[0];
  return null;
}
/** Hoja por nombre (sin importar tildes ni mayúsculas): valores + texto mostrado. */
function hoja36_(ss, re) { return vals36_(ss.getSheets().filter(s => re.test(nh_(s.getName())))[0]); }
function vals36_(sh) {
  if (!sh) return null;
  const lr = sh.getLastRow(), lc = sh.getLastColumn();
  if (!lr || !lc) return { nombre: sh.getName(), v: [], d: [] };
  const rg = sh.getRange(1, 1, lr, lc);
  return { nombre: sh.getName(), v: rg.getValues(), d: rg.getDisplayValues() };
}
/** Fila de encabezado: la primera que contiene todos los textos pedidos. Devuelve {i, col(re)}. */
function enc36_(H, req) {
  if (!H) return null;
  for (let i = 0; i < H.d.length; i++) {
    const row = H.d[i].map(nh_);
    if (req.every(r => row.some(c => r.test(c)))) return { i: i, row: row, col: re => row.findIndex(c => re.test(c)) };
  }
  return null;
}
/* ---------- Lectura y armado de los datos ---------- */
function leerControl_() {
  const id = controlId_();
  let ss; try { ss = SpreadsheetApp.openById(id); } catch (e) { throw new Error('No se encontró la planilla «Control ingreso Nueva temporada 27» o no hay permiso de lectura.'); }
  const hoy = hoy_(), avisos = [];
  // ---- PEDIDOS: una fila por producto; por cliente: Pidió / Asegurado / Entregado
  const P = hoja36_(ss, /^PEDIDOS$/), eP = enc36_(P, [/^CODIGO$/, /^PRODUCTO$/, /PIDIO$/]);
  const clientes = {}, orden = [];
  if (!eP) avisos.push('No se encontró la hoja PEDIDOS con las columnas Código, Producto y «Pidió» por cliente.');
  else {
    const cCod = eP.col(/^CODIGO$/), cProd = eP.col(/^PRODUCTO$/), cLista = eP.col(/^LISTA EL/), cEst = eP.col(/^ESTADO$/), cStock = eP.col(/^STOCK HB LIMA/);
    const cols = {};
    const orig = {};
    eP.row.forEach((h, j) => { const m = h.match(/^(.+?) (PIDIO|ASEGURADO|ENTREGADO)$/); if (m) { const k = m[1]; (cols[k] = cols[k] || {})[m[2]] = j; if (m[2] === 'PIDIO') orig[k] = String(P.d[eP.i][j]).replace(/\s*Pidi[oó]\s*$/i, '').trim(); } });
    Object.keys(cols).forEach(k => { if (cols[k].PIDIO == null) return; orden.push(k); clientes[k] = { clave: k, nombre: cap36_(orig[k] || k), items: [], pedido: 0, entregado: 0, separado: 0, pendiente: 0, extra: 0 }; });
    for (let i = eP.i + 1; i < P.v.length; i++) {
      const r = P.v[i], d = P.d[i], cod = String(d[cCod] || '').trim(), prod = String(d[cProd] || '').trim();
      if (!cod || !prod) continue;
      const stock = cStock >= 0 ? Math.max(0, n36_(r[cStock])) : 0;
      orden.forEach(k => {
        const c = cols[k], pid = Math.max(0, n36_(r[c.PIDIO])), ent = c.ENTREGADO != null ? Math.max(0, n36_(r[c.ENTREGADO])) : 0, ase = c.ASEGURADO != null ? Math.max(0, n36_(r[c.ASEGURADO])) : 0;
        if (!pid && !ent) return;
        const entA = Math.min(ent, pid), sep = Math.min(ase, pid - entA), pen = Math.max(0, pid - entA - sep), C = clientes[k];
        C.pedido += pid; C.entregado += entA; C.separado += sep; C.pendiente += pen; C.extra += Math.max(0, ent - pid);
        C.items.push({ codigo: cod, producto: prod, pedido: pid, entregado: entA, separado: sep, pendiente: pen, extra: Math.max(0, ent - pid), stockLima: stock,
          listaEl: cLista >= 0 ? f36_(r[cLista], d[cLista]) : null, estado: cEst >= 0 ? String(d[cEst] || '').replace(/^[^\wÁÉÍÓÚáéíóúñÑ]+/, '').trim() : '' });
      });
    }
  }
  // ---- TABLERO · «Lo que falta cubrir por cliente»: monto del pedido, ¿se cuenta?, entrega total estimada y qué hacer
  const T = hoja36_(ss, /^TABLERO$/), eT = enc36_(T, [/^CLIENTE$/, /^MONTO DEL PEDIDO$/]);
  if (eT) {
    const cC = eT.col(/^CLIENTE$/), cM = eT.col(/^MONTO DEL PEDIDO$/), cS = eT.col(/^¿?SE CUENTA/), cE = eT.col(/^ENTREGA TOTAL/), cQ = eT.col(/^QUE HACER/);
    for (let i = eT.i + 1; i < T.v.length; i++) {
      const nom = nh_(T.d[i][cC]); if (!nom) break;
      const C = clientes[nom]; if (!C) continue;
      C.monto = cM >= 0 ? n36_(T.v[i][cM]) || null : null;
      C.seCuenta = cS >= 0 ? nh_(T.d[i][cS]) !== 'NO' : true;
      C.entregaEstimada = C.entregaEstimada || (cE >= 0 ? f36_(T.v[i][cE], T.d[i][cE]) : null);
      C.queHacer = C.queHacer || (cQ >= 0 ? String(T.d[i][cQ] || '').trim() : '');
    }
  } else avisos.push('En TABLERO no se encontró la tabla «Lo que falta cubrir por cliente» (monto del pedido y entrega estimada).');
  // ---- Tablero clientes · «Resumen por cliente»: son los totales que muestra la planilla (fuente principal de los totales;
  //      el detalle por modelo sale de PEDIDOS). Si la suma del detalle no coincide, se avisa.
  const TC = hoja36_(ss, /^TABLERO CLIENTES$/), eC = enc36_(TC, [/^CLIENTE$/, /^PEDIDO$/, /^LE DEBEMOS$/]);
  if (eC) {
    const k = { cli: eC.col(/^CLIENTE$/), ped: eC.col(/^PEDIDO$/), ent: eC.col(/^ENTREGADO/), sep: eC.col(/^SEPARADO/), deb: eC.col(/^LE DEBEMOS$/), esp: eC.col(/^ESPERA FABRICACION/),
      fec: eC.col(/^ENTREGA TOTAL/), que: eC.col(/^QUE HACER/) };
    for (let i = eC.i + 1; i < TC.v.length; i++) {
      const nom = nh_(TC.d[i][k.cli]); if (!nom || nom === 'TOTAL') { if (!nom) break; continue; }
      const C = clientes[nom]; if (!C) continue;
      const sumaDetalle = { pedido: C.pedido, pendiente: C.pendiente };
      C.pedido = n36_(TC.v[i][k.ped]); if (k.ent >= 0) C.entregado = n36_(TC.v[i][k.ent]); if (k.sep >= 0) C.separado = n36_(TC.v[i][k.sep]); if (k.deb >= 0) C.pendiente = n36_(TC.v[i][k.deb]);
      if (k.esp >= 0) C.esperaFabricacion = n36_(TC.v[i][k.esp]);
      if (k.fec >= 0) C.entregaEstimada = f36_(TC.v[i][k.fec], TC.d[i][k.fec]) || C.entregaEstimada || null;
      if (k.que >= 0 && TC.d[i][k.que]) C.queHacer = String(TC.d[i][k.que]).trim();
      if (sumaDetalle.pedido !== C.pedido) C.difDetalle = 'El detalle por modelo (hoja PEDIDOS) suma ' + sumaDetalle.pedido + ' u pedidas y el resumen de la planilla dice ' + C.pedido + ' u.';
    }
  }
  // ---- 3.7 · Hojas de cada cliente y sus «SE LLEVÓ…» (formato remito). Pedido = lo que figura en la hoja del cliente + lo que se
  //      movió a su hoja SE LLEVÓ; Se llevó (despachado) = la hoja SE LLEVÓ; Pagó = «Abonado». La fecha sale del nombre (p. ej. «EL 25-9»).
  const claves = orden.slice().sort((a, b) => b.length - a.length);
  const deHoja = n => { const t = nh_(n).replace(/^SE LLEVO\s*/, '').replace(/^TRASLADADO.*\bA\s+/, ''); return claves.find(k => t === k || t.indexOf(k + ' ') === 0) || null; };
  ss.getSheets().forEach(sh => {
    const nom = nh_(sh.getName()), llevo = /^SE LLEVO/.test(nom), k = llevo ? deHoja(sh.getName()) : claves.find(x => x === nom);
    if (!k) return;
    const t = totales36_(vals36_(sh)); if (!t) return;
    const C = clientes[k];
    if (llevo) {
      const m = nom.match(/\bEL\s+(\d{1,2})[-\/](\d{1,2})\b/); let f = null;
      if (m) { f = hoy.slice(0, 4) + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2); if (f > hoy) f = (Number(hoy.slice(0, 4)) - 1) + f.slice(4); }
      C.llevo = C.llevo || { unidades: 0, monto: 0, remitos: [] };
      C.llevo.unidades += t.unidades || 0; C.llevo.monto += t.monto || 0; C.llevo.remitos.push({ hoja: sh.getName(), fecha: f, unidades: t.unidades || 0, monto: t.monto || 0 });
      if (t.abonado) C.abonadoLlevo = Math.max(C.abonadoLlevo || 0, t.abonado);
    } else { C.hoja = { nombre: sh.getName(), unidades: t.unidades || 0, monto: t.monto || 0 }; if (t.abonado) C.abonadoHoja = t.abonado; }
  });
  // ---- 3.7 · STOCK vs Pedidos: por SKU, stock de Lima, lo pendiente de todos los clientes, «Stock Lima final» (lo que le queda a Lima)
  //      y, por cliente, Pedido · Se llevó · Stock depo (separado) · Pendiente.
  const SV = hoja36_(ss, /^STOCK VS PEDIDOS$/), eS = enc36_(SV, [/^CODIGO$/, /^STOCK LIMA FINAL/]);
  const stockSku = [];
  if (!eS) avisos.push('No se encontró la hoja «STOCK vs Pedidos» con «Stock Lima final».');
  else {
    const c = { cod: eS.col(/^CODIGO$/), prod: eS.col(/^PRODUCTO$/), art: eS.col(/^NOMBRE ARTISTICO/), st: eS.col(/^STOCK LIMA DISP/), tp: eS.col(/^TOTAL PENDIENTE/),
      fin: eS.col(/^STOCK LIMA FINAL/), fal: eS.col(/^FALTAN FABRICAR/), est: eS.col(/^ESTADO$/) };
    // Grupos por cliente: cada «Pedido» abre un grupo (Pedido · Se llevó · Stock depo · Pendiente), en el orden de los clientes de la fila de arriba.
    const arriba = SV.d.slice(0, eS.i).map(r => r.map(nh_));
    const filaCli = arriba.map(r => r.filter(x => clientes[x]).length).reduce((b, n, i, A) => n > A[b] ? i : b, 0);   // la fila con más nombres de clientes
    const seq = []; (arriba[filaCli] || []).forEach((x, j, r) => { if (clientes[x] && !seq.some(q => q.k === x)) seq.push({ k: x, j: j, si: nh_(r[j + 1] || '') !== 'NO' }); });
    const grupos = []; eS.row.forEach((h, j) => { if (h === 'PEDIDO') grupos.push({ ped: j, lle: j + 1, dep: j + 2, pen: j + 3 }); });
    const gCli = grupos.slice(-seq.length).map((g, n) => Object.assign({ k: seq[n].k, si: seq[n].si }, g));
    gCli.forEach(g => { clientes[g.k].separadoDepo = 0; clientes[g.k].seCuentaStock = g.si; clientes[g.k].modelos = []; });
    for (let i = eS.i + 1; i < SV.v.length; i++) {
      const r = SV.v[i], d = SV.d[i], cod = String(d[c.cod] || '').trim(), prod = String(d[c.prod] || '').trim(); if (!cod || !prod) continue;
      const tl = talle36_(prod), st = n36_(r[c.st]), tp = Math.max(0, n36_(r[c.tp])), fin = c.fin >= 0 ? n36_(r[c.fin]) : st - tp;
      stockSku.push({ sku: cod, producto: prod, modelo: tl.modelo, talle: tl.talle, artistico: c.art >= 0 ? String(d[c.art] || '').trim() : '', fisico: Math.max(0, st),
        comprometido: Math.max(0, Math.min(Math.max(0, st), tp)), pendienteClientes: tp, libre: Math.max(0, fin), faltante: Math.max(0, c.fal >= 0 ? n36_(r[c.fal]) : -fin), estado: c.est >= 0 ? String(d[c.est] || '').trim() : '' });
      gCli.forEach(g => { const C = clientes[g.k], pe = Math.max(0, n36_(r[g.ped])), ll = Math.max(0, n36_(r[g.lle])), de = Math.max(0, n36_(r[g.dep])), pn = Math.max(0, n36_(r[g.pen]));
        C.separadoDepo += de; if (pe || ll || de || pn) C.modelos.push({ sku: cod, producto: prod, modelo: tl.modelo, talle: tl.talle, pedido: pe, sellevo: ll, separado: de, pendiente: pn }); });
    }
  }
  const tipos = cfg_().tiposCliente || {};
  const listaCli = orden.map(k => {
    const C = clientes[k];
    C.tipo = tipos[k] || 'Franquicia';
    // 3.7 · Totales según las hojas del cliente (si existen); si no, quedan los del Tablero clientes.
    if (C.hoja || C.llevo) {
      const ll = C.llevo || { unidades: 0, monto: 0, remitos: [] }, hj = C.hoja || { unidades: 0, monto: 0 };
      C.pedidoTotal = hj.unidades + ll.unidades; C.montoTotal = Math.round(hj.monto + ll.monto);
      C.despachado = ll.unidades; C.montoDespachado = Math.round(ll.monto);
      C.pendienteTotal = Math.max(0, C.pedidoTotal - C.despachado);
      C.exigible = Math.round(0.5 * C.montoTotal + 0.5 * C.montoDespachado);   // 50 % del pedido total (anticipo) + 50 % de lo que se llevó
      const ab = Math.max(C.abonadoHoja || 0, C.abonadoLlevo || 0);
      if (ab) { C.pagado = Math.round(ab); C.faltaPagar = Math.max(0, C.exigible - C.pagado); C.pctPagado = C.montoTotal ? Math.round(C.pagado / C.montoTotal * 100) : null; }
      C.remitos = ll.remitos;
    }
    if (C.separadoDepo != null) C.separadoTotal = C.separadoDepo;
    const ped = C.pedidoTotal != null ? C.pedidoTotal : C.pedido, des = C.despachado != null ? C.despachado : C.entregado, sep = C.separadoTotal != null ? C.separadoTotal : C.separado;
    const pen = C.pendienteTotal != null ? C.pendienteTotal : C.pendiente;
    C.avance = ped ? Math.round(des / ped * 100) : null;
    C.cumplimiento = ped ? Math.round(Math.min(ped, des + sep) / ped * 100) : null;
    C.estado = !ped ? 'sin_pedido' : !pen ? 'completo' : (des + sep) === 0 ? 'pendiente' : 'parcial';
    if (pen && C.entregaEstimada && C.entregaEstimada < hoy) C.estado = 'atrasado';
    if (C.monto && C.facturado != null) C.pendienteFacturar = Math.max(0, Math.round(C.monto - C.facturado));
    C.separableYa = C.items.reduce((a, x) => a + Math.min(x.pendiente, x.stockLima), 0);
    C.items.sort((a, b) => b.pendiente - a.pendiente || a.producto.localeCompare(b.producto));
    if (C.modelos) C.modelos.sort((a, b) => b.pendiente - a.pendiente || a.producto.localeCompare(b.producto));
    return C;
  }).filter(C => (C.pedidoTotal || C.pedido) > 0);

  // ---- INGRESO (lo que llega del taller al depósito)
  const I = hoja36_(ss, /^INGRESO$/), eI = enc36_(I, [/^PRODUCTO$/, /^PEDIDO AL TALLER/, /^LLEGO/]);
  const lineas = [];
  if (!eI) avisos.push('No se encontró la hoja INGRESO con Producto, «Pedido al taller» y «Llegó».');
  else {
    const c = { prod: eI.col(/^PRODUCTO$/), tienda: eI.col(/^NOMBRE TIENDA/), ot: eI.col(/^N° OT|^NO OT|^N OT/), sku: eI.col(/^CODIGO|SKU/), taller: eI.col(/^TALLER$/),
      ult: eI.col(/^FECHA ULTIMA LLEGADA/), plan: eI.col(/^PEDIDO AL TALLER/), llego: eI.col(/^LLEGO/), fallas: eI.col(/^FALLAS$/), est: eI.col(/^ESTADO$/),
      salio: eI.col(/SALIO DEL TALLER/), prom: eI.col(/^FECHA PROMETIDA/) };
    for (let i = eI.i + 1; i < I.v.length; i++) {
      const r = I.v[i], d = I.d[i], prod = String(d[c.prod] || '').trim(), plan = Math.max(0, n36_(r[c.plan]));
      if (!prod || !plan) continue;
      const llego = Math.max(0, n36_(r[c.llego])), falt = Math.max(0, plan - llego), prom = c.prom >= 0 ? f36_(r[c.prom], d[c.prom]) : null;
      const estTxt = c.est >= 0 ? String(d[c.est] || '').replace(/^[^\wÁÉÍÓÚáéíóúñÑ]+/, '').trim() : '';
      const est = !falt ? 'completo' : !llego ? 'pendiente' : 'parcial';
      lineas.push({ producto: prod, nombreTienda: c.tienda >= 0 ? String(d[c.tienda] || '').trim() : '', ot: c.ot >= 0 ? String(d[c.ot] || '').trim() : '', sku: c.sku >= 0 ? String(d[c.sku] || '').trim() : '',
        taller: (c.taller >= 0 ? String(d[c.taller] || '').trim() : '') || 'Sin taller', planificado: plan, ingresado: Math.min(llego, plan), sobrante: Math.max(0, llego - plan), faltante: falt,
        fallas: c.fallas >= 0 ? Math.max(0, n36_(r[c.fallas])) : 0, estado: est, estadoPlanilla: estTxt, fechaPrometida: prom, ultimaLlegada: c.ult >= 0 ? f36_(r[c.ult], d[c.ult]) : null,
        salioDelTaller: c.salio >= 0 ? /^SI/.test(nh_(d[c.salio])) : null, atrasado: !!(falt && prom && prom < hoy) });
    }
  }
  // ---- PRODUCCIÓN (OTs y en qué paso están)
  const O = hoja36_(ss, /^PRODUCCION$/), eO = enc36_(O, [/^N° OT|^NO OT|^N OT/, /^ESTADO ACTUAL/]);
  const ots = [];
  if (eO) {
    const c = { ot: eO.col(/^N° OT|^NO OT|^N OT/), sku: eO.col(/^CODIGO|SKU/), prenda: eO.col(/^PRENDA/), tipo: eO.col(/^TIPO$/), cant: eO.col(/^CANTIDAD/), taller: eO.col(/^TALLER/),
      ini: eO.col(/^FECHA INICIO/), rec: eO.col(/^RECIBIDAS/), est: eO.col(/^ESTADO ACTUAL/), paso: eO.col(/^PASO SIGUIENTE/), al: eO.col(/^ALERTA/) };
    for (let i = eO.i + 1; i < O.v.length; i++) {
      const d = O.d[i], ot = String(d[c.ot] || '').trim(); if (!/^OT/i.test(ot)) continue;
      const cant = Math.max(0, n36_(O.v[i][c.cant])), rec = c.rec >= 0 ? Math.max(0, n36_(O.v[i][c.rec])) : 0;
      const al = c.al >= 0 ? String(d[c.al] || '') : '', est = c.est >= 0 ? String(d[c.est] || '') : '';
      const term = /TERMINAD/i.test(al) || /TERMINAD/i.test(est);
      ots.push({ ot: ot, sku: c.sku >= 0 ? String(d[c.sku] || '').trim() : '', prenda: c.prenda >= 0 ? String(d[c.prenda] || '').trim() : '', tipo: c.tipo >= 0 ? String(d[c.tipo] || '').trim() : '',
        cantidad: cant, recibidas: rec, taller: c.taller >= 0 ? String(d[c.taller] || '').trim() : '', inicio: c.ini >= 0 ? f36_(O.v[i][c.ini], d[c.ini]) : null,
        estado: est.replace(/^[^\wÁÉÍÓÚáéíóúñÑ]+/, '').trim(), paso: c.paso >= 0 ? String(d[c.paso] || '').replace(/^[^\wÁÉÍÓÚáéíóúñÑ]+/, '').trim() : '', alerta: al.replace(/^[^\wÁÉÍÓÚáéíóúñÑ]+/, '').trim(),
        terminada: term, atrasada: /ATRAS/i.test(al) });
    }
  }
  // ---- A FABRICAR (lo que falta fabricar para pedidos y para llegar al stock mínimo)
  const F = hoja36_(ss, /^A FABRICAR$/), eF = enc36_(F, [/^CODIGO|SKU/, /^FALTAN P/]);
  const fabricar = [];
  if (eF) {
    const c = { sku: eF.col(/^CODIGO|SKU/), prod: eF.col(/^PRODUCTO$/), talle: eF.col(/^TALLE$/), stock: eF.col(/^STOCK LIMA/), pend: eF.col(/^PEDIDOS PENDIENTES/), falt: eF.col(/^FALTAN P/),
      min: eF.col(/^PARA LLEGAR AL MINIMO/), ot: eF.col(/^OT$/), est: eF.col(/^ESTADO DE PRODUCCION/), llega: eF.col(/^LLEGA/), prio: eF.col(/^PRIORIDAD/), que: eF.col(/^PASO SIGUIENTE|^QUE HACER/) };
    for (let i = eF.i + 1; i < F.v.length; i++) {
      const r = F.v[i], d = F.d[i], sku = String(d[c.sku] || '').trim(); if (!sku) continue;
      const falt = Math.max(0, n36_(r[c.falt])), min = c.min >= 0 ? Math.max(0, n36_(r[c.min])) : 0; if (!falt && !min) continue;
      fabricar.push({ sku: sku, producto: c.prod >= 0 ? String(d[c.prod] || '').trim() : '', talle: c.talle >= 0 ? String(d[c.talle] || '').trim() : '', stockLima: c.stock >= 0 ? n36_(r[c.stock]) : null,
        faltanPedidos: falt, paraMinimo: min, ot: c.ot >= 0 ? String(d[c.ot] || '').trim() : '', estadoProduccion: c.est >= 0 ? String(d[c.est] || '').replace(/^[^\wÁÉÍÓÚáéíóúñÑ]+/, '').trim() : '',
        llega: c.llega >= 0 ? f36_(r[c.llega], d[c.llega]) : null, prioridad: c.prio >= 0 ? String(d[c.prio] || '').trim() : '', queHacer: c.que >= 0 ? String(d[c.que] || '').trim() : '' });
    }
  }
  let modificado = null; try { modificado = DriveApp.getFileById(id).getLastUpdated().toISOString(); } catch (e) {}
  return { leida: new Date().toISOString(), modificado: modificado, archivo: ss.getName(), avisos: avisos, clientes: listaCli, lineas: lineas, ots: ots, fabricar: fabricar, stock: stockSku };
}
/** 3.7 · Totales de una hoja de cliente o «SE LLEVÓ»: busca las etiquetas y toma el primer número a su derecha. */
function totales36_(H) {
  if (!H || !H.d.length) return null;
  const busca = re => { for (let i = 0; i < H.d.length; i++) for (let j = 0; j < H.d[i].length; j++) if (re.test(nh_(H.d[i][j]))) {
    for (let k = j + 1; k < H.d[i].length; k++) { const x = n36_(H.v[i][k]); if (x > 0) return x; } } return null; };
  const u = busca(/^CANTIDAD TOTAL DE PRENDAS$|^CANTIDAD (DE )?PRENDAS$|^PRENDAS TOTALES$/), m = busca(/^TOTAL A PAGAR$/) || busca(/^TOTAL$/), a = busca(/^ABONADO$/);
  if (u == null && m == null) return null;
  return { unidades: u || 0, monto: m || 0, abonado: a || 0 };
}
/** Talle al final del nombre del producto ("BODY GRANATE BEIGE M" → modelo "BODY GRANATE BEIGE", talle "M"). */
function talle36_(p) {
  const m = String(p || '').trim().match(/^(.*?)\s+(XXS|XS|S|M|L|XL|XXL|XXXL|U|UNICO|ÚNICO|T\d|\d{2})$/i);
  return m ? { modelo: m[1].trim(), talle: m[2].toUpperCase().replace('UNICO', 'ÚNICO') } : { modelo: String(p || '').trim(), talle: 'Único' };
}
/** Tipo de cada cliente (Franquicia / Mayorista): se aplica al leer, así un cambio se ve sin releer la planilla. */
function tipos36_(D) { const T = cfg_().tiposCliente || {}; (D.clientes || []).forEach(c => { c.tipo = T[c.clave] || 'Franquicia'; }); return D; }
const cap36_ = s => String(s).toLowerCase().replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase());
/* ---------- Caché (en partes de 90 KB) ---------- */
function cacheGuardar36_(obj) {
  const s = JSON.stringify(obj), n = Math.ceil(s.length / 90000), o = {};
  for (let i = 0; i < n; i++) o[CONTROL_CACHE + '_' + i] = s.slice(i * 90000, (i + 1) * 90000);
  o[CONTROL_CACHE + '_n'] = String(n);
  try { CACHE.putAll(o, 21600); } catch (e) {}
}
function cacheLeer36_() {
  try {
    const n = Number(CACHE.get(CONTROL_CACHE + '_n')); if (!n) return null;
    const k = []; for (let i = 0; i < n; i++) k.push(CONTROL_CACHE + '_' + i);
    const g = CACHE.getAll(k); if (k.some(x => g[x] == null)) return null;
    return JSON.parse(k.map(x => g[x]).join(''));
  } catch (e) { return null; }
}
/** Lee la planilla (o usa la caché). Deja registrada la última actualización (o el error). */
function control_(forzar, estricto) {
  if (!forzar) { const c = cacheLeer36_(); if (c) return tipos36_(c); }
  let d;
  try { d = leerControl_(); }
  catch (e) {
    const st = { ts: new Date().toISOString(), ok: false, error: String(e.message || e).slice(0, 200) };
    PROPS.setProperty('CONTROL_SYNC', JSON.stringify(st));
    const c = estricto ? null : cacheLeer36_(); if (c) { c.errorUltimaLectura = st.error; return tipos36_(c); }
    throw new Error(st.error);
  }
  cacheGuardar36_(d); tipos36_(d);
  PROPS.setProperty('CONTROL_SYNC', JSON.stringify({ ts: d.leida, ok: true, archivo: d.archivo, modificado: d.modificado, avisos: d.avisos.slice(0, 10) }));
  return d;
}
/* ---------- Resúmenes (3.7) ---------- */
const ESTADO_PED = { completo: 'Completo', parcial: 'Parcial', pendiente: 'Pendiente', atrasado: 'Atrasado' };
const v37_ = (C, a, b) => C[a] != null ? C[a] : (C[b] || 0);   // valor de las hojas del cliente (3.7) o del Tablero clientes
function resumenClientes_(D) {
  const L = D.clientes.filter(c => c.seCuenta !== false), hoy = hoy_();
  const sum = (a, b) => L.reduce((t, c) => t + v37_(c, a, b), 0);
  const pedido = sum('pedidoTotal', 'pedido'), desp = sum('despachado', 'entregado'), sep = sum('separadoTotal', 'separado'), pend = sum('pendienteTotal', 'pendiente');
  const conPago = L.filter(c => c.pagado != null);
  const pagado = conPago.reduce((t, c) => t + c.pagado, 0), falta = conPago.reduce((t, c) => t + (c.faltaPagar || 0), 0), totPago = conPago.reduce((t, c) => t + (c.montoTotal || 0), 0);
  const monto = L.reduce((t, c) => t + (c.montoTotal || c.monto || 0), 0), montoDesp = L.reduce((t, c) => t + (c.montoDespachado || 0), 0);
  const porTipo = {}; L.forEach(c => { const t = porTipo[c.tipo] = porTipo[c.tipo] || { tipo: c.tipo, clientes: 0, pedido: 0, despachado: 0, separado: 0, pendiente: 0 };
    t.clientes++; t.pedido += v37_(c, 'pedidoTotal', 'pedido'); t.despachado += v37_(c, 'despachado', 'entregado'); t.separado += v37_(c, 'separadoTotal', 'separado'); t.pendiente += v37_(c, 'pendienteTotal', 'pendiente'); });
  Object.keys(porTipo).forEach(k => { const t = porTipo[k]; t.avance = t.pedido ? Math.round(t.despachado / t.pedido * 100) : null; });
  const estados = { completo: 0, parcial: 0, pendiente: 0, atrasado: 0 }; L.forEach(c => { if (estados[c.estado] != null) estados[c.estado]++; });
  const pen = c => v37_(c, 'pendienteTotal', 'pendiente'), ped = c => v37_(c, 'pedidoTotal', 'pedido');
  const alertas = [];
  L.forEach(c => {
    const pct = ped(c) ? pen(c) / ped(c) : 0;
    if (c.estado === 'atrasado') alertas.push({ nivel: 'rojo', cliente: c.nombre, texto: c.nombre + ': ' + pen(c) + ' u pendientes y la entrega estimada (' + fdm_(c.entregaEstimada) + ') ya pasó.' });
    else if (pen(c) >= 50 && pct >= 0.3) alertas.push({ nivel: pct >= 0.6 ? 'rojo' : 'amarillo', cliente: c.nombre, texto: c.nombre + ': falta despachar ' + pen(c) + ' u, el ' + Math.round(pct * 100) + ' % del pedido.' });
    if (c.faltaPagar && c.exigible && c.faltaPagar / c.exigible >= 0.3) alertas.push({ nivel: 'amarillo', cliente: c.nombre, texto: c.nombre + ': falta pagar ' + $_(c.faltaPagar) + ' de lo exigible a hoy.' });
  });
  const topPend = L.filter(pen).sort((a, b) => pen(b) - pen(a)).slice(0, 5).map(c => ({ nombre: c.nombre, pendiente: pen(c), pedido: ped(c), estado: c.estado }));
  const topSaldo = conPago.filter(c => c.faltaPagar).sort((a, b) => b.faltaPagar - a.faltaPagar).slice(0, 5).map(c => ({ nombre: c.nombre, faltaPagar: c.faltaPagar, pagado: c.pagado, pctPagado: c.pctPagado }));
  const recomendaciones = [];
  const sepYa = L.filter(c => c.separableYa > 0).sort((a, b) => b.separableYa - a.separableYa);
  if (sepYa.length) recomendaciones.push('Separar ya con stock de Lima ' + sepYa.slice(0, 3).map(c => c.separableYa + ' u de ' + c.nombre).join(', ') + ': acorta la entrega sin fabricar.');
  if (topPend[0]) recomendaciones.push('Priorizar el próximo despacho a ' + topPend[0].nombre + ', que tiene la mayor cantidad pendiente (' + topPend[0].pendiente + ' u).');
  if (topSaldo[0]) recomendaciones.push('Gestionar el cobro de ' + topSaldo[0].nombre + ' (' + $_(topSaldo[0].faltaPagar) + ' por pagar) antes del próximo despacho.');
  return { clientes: L.length, pedido: pedido, despachado: desp, entregado: desp, separado: sep, pendiente: pend, monto: monto || null, montoDespachado: montoDesp || null,
    avance: pedido ? Math.round(desp / pedido * 100) : null, cumplimiento: pedido ? Math.round(Math.min(pedido, desp + sep) / pedido * 100) : null,
    pagado: conPago.length ? pagado : null, faltaPagar: conPago.length ? falta : null, pctPagado: conPago.length && totPago ? Math.round(pagado / totPago * 100) : null, clientesConPago: conPago.map(c => c.nombre),
    porTipo: Object.keys(porTipo).map(k => porTipo[k]), estados: estados, topPendiente: topPend, topSaldo: topSaldo,
    alertas: alertas.sort((a, b) => (a.nivel === 'rojo' ? 0 : 1) - (b.nivel === 'rojo' ? 0 : 1)), recomendaciones: recomendaciones };
}
/** Stock real de Lima (lo que queda libre después de los pedidos): planilla «STOCK vs Pedidos», columna «Stock Lima final». */
function resumenStock37_(D) {
  const S = D.stock || []; if (!S.length) return null;
  const tot = k => Math.round(S.reduce((a, x) => a + (x[k] || 0), 0));
  const porModelo = {}; S.forEach(x => { const m = porModelo[x.modelo] = porModelo[x.modelo] || { modelo: x.modelo, fisico: 0, comprometido: 0, libre: 0, faltante: 0, talles: 0 };
    m.fisico += x.fisico; m.comprometido += x.comprometido; m.libre += x.libre; m.faltante += x.faltante; m.talles++; });
  const M = Object.keys(porModelo).map(k => porModelo[k]); M.forEach(m => ['fisico', 'comprometido', 'libre', 'faltante'].forEach(k => { m[k] = Math.round(m[k]); }));
  return { fisico: tot('fisico'), comprometido: tot('comprometido'), libre: tot('libre'), faltante: tot('faltante'), skus: S.length, modelos: M.length,
    topLibre: M.filter(m => m.libre).sort((a, b) => b.libre - a.libre).slice(0, 5),
    topMenos: M.filter(m => m.faltante || (m.fisico && !m.libre) || m.comprometido).sort((a, b) => (b.faltante - a.faltante) || (a.libre - b.libre)).slice(0, 5) };
}
/** Qué falta producir: hoja «A FABRICAR» (para pedidos y para llegar al stock mínimo); el taller sale de la OT o de INGRESO. */
function resumenFalta37_(D) {
  const F = D.fabricar || []; if (!F.length) return null;
  const plan = D.lineas.reduce((a, x) => a + x.planificado, 0), ped = F.reduce((a, x) => a + x.faltanPedidos, 0), min = F.reduce((a, x) => a + x.paraMinimo, 0);
  const urg = x => /URGENTE/i.test(x.prioridad) ? 0 : 1;
  const porModelo = {}; F.forEach(x => { const t = talle36_(x.producto), k = t.modelo || x.sku; const m = porModelo[k] = porModelo[k] || { modelo: k, pedidos: 0, minimo: 0, urgente: false, talles: [], taller: '' };
    m.pedidos += x.faltanPedidos; m.minimo += x.paraMinimo; if (!urg(x)) m.urgente = true; m.talles.push(x.talle || t.talle); if (!m.taller && x.taller) m.taller = x.taller; });
  const top = Object.keys(porModelo).map(k => porModelo[k]).sort((a, b) => (b.urgente - a.urgente) || (b.pedidos - a.pedidos) || (b.minimo - a.minimo)).slice(0, 5);
  return { total: ped + min, paraPedidos: ped, paraMinimo: min, planificado: plan, pctPlanificado: plan ? Math.round((ped + min) / plan * 100) : null, urgentes: F.filter(x => !urg(x)).length,
    sinOt: F.filter(x => x.faltanPedidos && !x.ot).length, top: top };
}
/** Pedidos de taller (hoja INGRESO): Llegado (LLEGÓ > 0) · En producción (con taller y falta) · Por llegar (sin taller y falta) · Atrasado (pasó la fecha prometida). */
function estadoTaller37_(x) { return x.atrasado ? 'atrasado' : x.faltante ? (x.taller !== 'Sin taller' ? 'en_produccion' : 'por_llegar') : 'llegado'; }
function resumenTaller37_(D) {
  const L = D.lineas || []; if (!L.length) return null;
  const est = { llegado: { pedidos: 0, unidades: 0 }, en_produccion: { pedidos: 0, unidades: 0 }, por_llegar: { pedidos: 0, unidades: 0 }, atrasado: { pedidos: 0, unidades: 0 } };
  let llegadas = 0, conLlegada = 0;
  L.forEach(x => { const e = estadoTaller37_(x); est[e].pedidos++; est[e].unidades += e === 'llegado' ? x.ingresado + x.sobrante : x.faltante; llegadas += x.ingresado + x.sobrante; if (x.ingresado) conLlegada++; });
  const ultimos = L.filter(x => x.ultimaLlegada && (x.ingresado || x.sobrante)).sort((a, b) => b.ultimaLlegada.localeCompare(a.ultimaLlegada) || (b.ingresado - a.ingresado)).slice(0, 5)
    .map(x => ({ taller: x.taller, modelo: x.nombreTienda || x.producto, cantidad: x.ingresado + x.sobrante, fecha: x.ultimaLlegada, ot: x.ot, completo: !x.faltante }));
  const pend = L.filter(x => x.faltante);
  const proximos = pend.slice().sort((a, b) => (b.atrasado - a.atrasado) || ((a.fechaPrometida || '9') .localeCompare(b.fechaPrometida || '9')) || ((a.taller === 'Sin taller') - (b.taller === 'Sin taller')) || (b.faltante - a.faltante)).slice(0, 5)
    .map(x => ({ taller: x.taller, modelo: x.nombreTienda || x.producto, pendiente: x.faltante, fecha: x.fechaPrometida, estado: estadoTaller37_(x), ot: x.ot }));
  const T = {}; L.forEach(x => { const t = T[x.taller] = T[x.taller] || { taller: x.taller, pedidos: 0, pedido: 0, llegado: 0, falta: 0, atrasados: 0, ultima: null, proxima: null };
    t.pedidos++; t.pedido += x.planificado; t.llegado += x.ingresado; t.falta += x.faltante; if (x.atrasado) t.atrasados++;
    if (x.ultimaLlegada && (!t.ultima || x.ultimaLlegada > t.ultima)) t.ultima = x.ultimaLlegada; if (x.faltante && x.fechaPrometida && (!t.proxima || x.fechaPrometida < t.proxima)) t.proxima = x.fechaPrometida; });
  const total = L.reduce((a, x) => a + x.planificado, 0);
  return { estados: est, llegadas: llegadas, conLlegada: conLlegada, total: total, ultimos: ultimos, proximos: proximos,
    talleres: Object.keys(T).map(k => T[k]).sort((a, b) => b.falta - a.falta || b.pedido - a.pedido) };
}
function resumenProduccion_(D) {
  const L = D.lineas, tot = k => L.reduce((a, x) => a + (x[k] || 0), 0);
  const plan = tot('planificado'), ing = tot('ingresado');
  const enProceso = L.filter(x => x.faltante && x.taller !== 'Sin taller').reduce((a, x) => a + x.faltante, 0);
  const sinIniciar = L.filter(x => x.faltante && x.taller === 'Sin taller').reduce((a, x) => a + x.faltante, 0);
  const faltaFab = D.fabricar.reduce((a, x) => a + x.faltanPedidos, 0), paraMin = D.fabricar.reduce((a, x) => a + x.paraMinimo, 0);
  const atrasadas = L.filter(x => x.atrasado);
  const stock = resumenStock37_(D), falta = resumenFalta37_(D), taller = resumenTaller37_(D);
  const alertas = [];
  if (atrasadas.length) alertas.push({ nivel: 'rojo', texto: atrasadas.length + (atrasadas.length === 1 ? ' pedido de taller atrasado' : ' pedidos de taller atrasados') + ' (pasó la fecha prometida y falta mercadería): ' + atrasadas.slice(0, 3).map(x => (x.nombreTienda || x.producto) + ' · ' + x.taller).join(', ') + '.' });
  const sinOt = D.fabricar.filter(x => x.faltanPedidos && !x.ot);
  if (sinOt.length) alertas.push({ nivel: 'rojo', texto: sinOt.length + ' talles con faltante para pedidos todavía sin OT (' + sinOt.reduce((a, x) => a + x.faltanPedidos, 0) + ' u).' });
  if (stock && stock.faltante) alertas.push({ nivel: 'amarillo', texto: 'A Lima le faltan ' + stock.faltante + ' u para cubrir lo que piden los clientes.' });
  const recomendaciones = [];
  if (sinOt.length) recomendaciones.push('Abrir OT para lo urgente sin orden, empezando por ' + sinOt.slice(0, 3).map(x => x.producto).join(', ') + '.');
  if (taller && taller.talleres[0] && taller.talleres[0].falta && taller.talleres[0].taller !== 'Sin taller') recomendaciones.push('Seguir de cerca al taller ' + taller.talleres[0].taller + ', que concentra lo que falta llegar (' + taller.talleres[0].falta + ' u).');
  else if (taller && taller.estados.por_llegar.unidades) recomendaciones.push('Asignar taller a lo planificado que todavía no se mandó a fabricar (' + taller.estados.por_llegar.unidades + ' u).');
  return { planificado: plan, ingresado: ing, enProceso: enProceso, sinIniciar: sinIniciar, faltaFabricar: faltaFab, paraMinimo: paraMin, sobrante: tot('sobrante'), fallas: tot('fallas'),
    avance: plan ? Math.round(ing / plan * 100) : null, articulos: L.length, talleres: (taller ? taller.talleres : []).map(t => Object.assign({ planificado: t.pedido, ingresado: t.llegado, faltante: t.falta, avance: t.pedido ? Math.round(t.llegado / t.pedido * 100) : null }, t)),
    otsAbiertas: D.ots.filter(o => !o.terminada).length, otsTerminadas: D.ots.filter(o => o.terminada).length, atrasados: atrasadas.length,
    stock: stock, falta: falta, taller: taller, alertas: alertas, recomendaciones: recomendaciones };
}
/* ---------- Audio (texto que el navegador lee) ---------- */
function unid36_(n) { n = Math.round(n || 0); return n === 1 ? 'una unidad' : palabras_(n) + ' unidades'; }
function cuandoAct36_() {
  const st = JSON.parse(PROPS.getProperty('CONTROL_SYNC') || 'null'); if (!st || !st.ts) return '';
  const d = new Date(st.ts), f = Utilities.formatDate(d, TZ, 'yyyy-MM-dd'), h = Utilities.formatDate(d, TZ, 'HH:mm');
  return 'Datos de la planilla actualizados ' + fechaHablada_(f) + ' a las ' + palabras_(Number(h.slice(0, 2))) + (Number(h.slice(3)) ? ' y ' + palabras_(Number(h.slice(3))) : '') + '.';
}
const lista37_ = a => a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' y ' + a[a.length - 1];
function audioClientes_(u, R, L) {
  const nombre = String(u && u.nombre || '').trim().split(' ')[0], P = [];
  if (!R.clientes) return '';
  P.push((nombre ? 'Hola ' + nombre + ', ' : 'Hola, ') + 'te cuento cómo están los pedidos de los clientes.');
  P.push(cuandoAct36_());
  P.push('Pidieron ' + unid36_(R.pedido) + '. Ya se llevaron ' + unid36_(R.despachado) + ', el ' + palabras_(R.avance || 0) + ' por ciento' + (R.separado ? ', hay ' + unid36_(R.separado) + ' separadas en sus depósitos' : '') + ' y faltan despachar ' + unid36_(R.pendiente) + '.');
  if (R.topPendiente.length) P.push('Los que más esperan: ' + lista37_(R.topPendiente.slice(0, 3).map(c => c.nombre + ', ' + unid36_(c.pendiente))) + '.');
  if (R.pagado != null) P.push('Pagos: ' + lista37_(R.clientesConPago) + (R.clientesConPago.length === 1 ? ' pagó ' : ' pagaron ') + dinero_(R.pagado) + (R.faltaPagar ? ' y falta pagar ' + dinero_(R.faltaPagar) + ' de lo que corresponde a hoy' : ', está al día') + '.');
  if (R.recomendaciones.length) P.push('La prioridad de hoy: ' + hablar_(R.recomendaciones[R.recomendaciones.length > 1 && /Separar/.test(R.recomendaciones[0]) ? 0 : 0].replace(/(\d+) u\b/g, (m, n) => unid36_(Number(n)))).replace(/^\w/, c => c.toLowerCase()));
  return P.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}
function audioProduccion_(u, R) {
  const nombre = String(u && u.nombre || '').trim().split(' ')[0], P = [];
  const S = R.stock, F = R.falta, T = R.taller;
  if (!S && !F && !T && !R.planificado) return '';
  P.push((nombre ? 'Hola ' + nombre + ', ' : 'Hola, ') + 'te cuento cómo viene la producción.');
  P.push(cuandoAct36_());
  if (S) P.push('Stock real de Lima: ' + unid36_(S.libre) + ' libres para vender, de ' + unid36_(S.fisico) + ' en el depósito; ' + unid36_(S.comprometido) + ' están comprometidas por pedidos' + (S.faltante ? ' y faltan ' + unid36_(S.faltante) + ' para cubrirlos' : '') + '.');
  if (F) P.push('Falta producir ' + unid36_(F.total) + ', el ' + palabras_(F.pctPlanificado || 0) + ' por ciento de lo planificado: ' + unid36_(F.paraPedidos) + ' para pedidos y ' + unid36_(F.paraMinimo) + ' para el stock mínimo.' +
    (F.top.length ? ' Lo más urgente: ' + lista37_(F.top.slice(0, 3).map(m => m.modelo.toLowerCase())) + '.' : ''));
  if (T) {
    P.push('Pedidos de taller: llegaron ' + unid36_(T.llegadas) + (T.estados.en_produccion.unidades ? ', ' + unid36_(T.estados.en_produccion.unidades) + ' siguen en producción' : '') + (T.estados.por_llegar.unidades ? ' y ' + unid36_(T.estados.por_llegar.unidades) + ' todavía no se mandaron a un taller' : '') + '.');
    if (T.ultimos.length) P.push('Últimos ingresos: ' + lista37_(T.ultimos.slice(0, 3).map(x => x.modelo.toLowerCase() + ' de ' + x.taller + ', ' + unid36_(x.cantidad))) + '.');
    if (T.estados.atrasado.pedidos) P.push('Hay ' + palabras_(T.estados.atrasado.pedidos) + (T.estados.atrasado.pedidos === 1 ? ' pedido atrasado' : ' pedidos atrasados') + ', con ' + unid36_(T.estados.atrasado.unidades) + ' que no llegaron.');
  }
  if (R.recomendaciones.length) P.push('La prioridad de hoy: ' + R.recomendaciones[0].replace(/\((\d+) u\)/g, (m, n) => ', ' + unid36_(Number(n))).replace(/^\w/, c => c.toLowerCase()));
  return P.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}
/* ---------- API ---------- */
const sync36_ = () => JSON.parse(PROPS.getProperty('CONTROL_SYNC') || 'null');
/* En pantalla viajan solo resúmenes y Top 5 (sin listas largas); el detalle completo sale por descargaControl, con el mismo permiso. */
function clientesPedidos(token) {
  const s = sesion_(token, 'clientes'), D = control_(false), R = resumenClientes_(D), L = D.clientes.filter(c => c.seCuenta !== false);
  const cli = D.clientes.map(c => ({ clave: c.clave, nombre: c.nombre, tipo: c.tipo, estado: c.estado, seCuenta: c.seCuenta !== false, pedido: v37_(c, 'pedidoTotal', 'pedido'), despachado: v37_(c, 'despachado', 'entregado'),
    separado: v37_(c, 'separadoTotal', 'separado'), pendiente: v37_(c, 'pendienteTotal', 'pendiente'), avance: c.avance, montoTotal: c.montoTotal || c.monto || null, montoDespachado: c.montoDespachado || null,
    exigible: c.exigible || null, pagado: c.pagado != null ? c.pagado : null, faltaPagar: c.faltaPagar != null ? c.faltaPagar : null, pctPagado: c.pctPagado != null ? c.pctPagado : null,
    entregaEstimada: c.entregaEstimada || null, queHacer: c.queHacer || '', separableYa: c.separableYa || 0, remitos: c.remitos || [],
    topModelos: (c.modelos || c.items.map(x => ({ producto: x.producto, pedido: x.pedido, sellevo: x.entregado, separado: x.separado, pendiente: x.pendiente }))).filter(x => x.pendiente).slice(0, 5) }));
  return { sync: sync36_(), cierreSync: JSON.parse(PROPS.getProperty('CIERRE_SYNC') || 'null'), resumen: R, clientes: cli, avisos: D.avisos, audio: audioClientes_(s.user, R, L) };
}
function produccionPanel(token) {
  const s = sesion_(token, 'produccion'), D = control_(false), R = resumenProduccion_(D);
  return { sync: sync36_(), cierreSync: JSON.parse(PROPS.getProperty('CIERRE_SYNC') || 'null'), resumen: R, avisos: D.avisos, audio: audioProduccion_(s.user, R) };
}
/** Detalle de un taller (al tocarlo en pantalla): sus pedidos, sin listas largas (hasta 8). */
function detalleTaller(token, taller) {
  sesion_(token, 'produccion'); const D = control_(false), t = String(taller || '');
  const L = D.lineas.filter(x => x.taller === t);
  return { taller: t, pedidos: L.length, pedido: L.reduce((a, x) => a + x.planificado, 0), llegado: L.reduce((a, x) => a + x.ingresado, 0), falta: L.reduce((a, x) => a + x.faltante, 0),
    lineas: L.slice().sort((a, b) => (b.atrasado - a.atrasado) || (b.faltante - a.faltante)).slice(0, 8).map(x => ({ modelo: x.nombreTienda || x.producto, ot: x.ot, pedido: x.planificado, llegado: x.ingresado + x.sobrante, falta: x.faltante, estado: estadoTaller37_(x), ultima: x.ultimaLlegada, prometida: x.fechaPrometida })), masDe8: L.length > 8 };
}
/** Descargas (Excel / PDF): el detalle completo, con la fecha y hora de la última actualización. Mismo permiso que la sección. */
function descargaControl(token, tipo) {
  const perm = { clientes: 'clientes', stock: 'produccion', falta: 'produccion', taller: 'produccion' }[tipo];
  if (!perm) throw new Error('Descarga inválida.');
  const s = sesion_(token, perm), D = control_(false), st = sync36_() || {};
  const meta = { actualizado: st.ts || D.leida, modificado: st.modificado || D.modificado || null, generado: new Date().toISOString(), por: s.user.nombre };
  const n = x => x == null ? '' : x;
  if (tipo === 'clientes') {
    const C = D.clientes;
    const res = C.map(c => [c.nombre, c.tipo, ESTADO_PED[c.estado] || '', v37_(c, 'pedidoTotal', 'pedido'), v37_(c, 'despachado', 'entregado'), v37_(c, 'separadoTotal', 'separado'), v37_(c, 'pendienteTotal', 'pendiente'),
      n(c.avance), n(c.montoTotal || c.monto), n(c.montoDespachado), n(c.exigible), n(c.pagado), n(c.faltaPagar), n(c.pctPagado), c.entregaEstimada ? fdm_(c.entregaEstimada) : '']);
    const det = []; C.forEach(c => (c.modelos || []).forEach(x => det.push([c.nombre, x.sku, x.modelo, x.talle, x.pedido, x.sellevo, x.separado, x.pendiente])));
    const rem = []; C.forEach(c => (c.remitos || []).forEach(r => rem.push([c.nombre, r.hoja, r.fecha ? fdm_(r.fecha) : '', r.unidades, r.monto])));
    return Object.assign(meta, { titulo: 'Clientes y pedidos', archivo: 'Clientes-y-pedidos', hojas: [
      { nombre: 'Resumen por cliente', columnas: ['Cliente', 'Tipo', 'Estado', 'Pedido (u)', 'Se llevó / despachado (u)', 'Separado (u)', 'Pendiente (u)', 'Avance %', 'Monto del pedido', 'Monto despachado', 'A pagar a hoy', 'Pagó', 'Falta pagar', 'Pagado %', 'Entrega estimada'], dinero: [8, 9, 10, 11, 12], filas: res },
      { nombre: 'Detalle por modelo', columnas: ['Cliente', 'SKU', 'Modelo y color', 'Talle', 'Pedido', 'Se llevó', 'Separado', 'Pendiente'], filas: det },
      { nombre: 'Remitos (SE LLEVÓ)', columnas: ['Cliente', 'Hoja', 'Fecha', 'Unidades', 'Monto'], dinero: [4], filas: rem }] });
  }
  if (tipo === 'stock') return Object.assign(meta, { titulo: 'Stock real de Lima', archivo: 'Stock-real-Lima', hojas: [
    { nombre: 'Stock real por SKU', columnas: ['SKU', 'Modelo y color', 'Talle', 'Nombre artístico', 'Stock físico Lima', 'Comprometido por pedidos', 'Stock real (libre)', 'Falta para pedidos', 'Estado'],
      filas: (D.stock || []).map(x => [x.sku, x.modelo, x.talle, x.artistico, x.fisico, x.comprometido, x.libre, x.faltante, x.estado]) }] });
  if (tipo === 'falta') {
    const tallerDe = x => { const l = D.lineas.find(y => (x.ot && y.ot === x.ot) || (y.sku && y.sku === x.sku)); const o = D.ots.find(y => (x.ot && y.ot === x.ot) || y.sku === x.sku); return (o && o.taller) || (l && l.taller !== 'Sin taller' ? l.taller : '') || ''; };
    return Object.assign(meta, { titulo: 'Qué falta producir', archivo: 'Falta-producir', hojas: [
      { nombre: 'Falta producir', columnas: ['SKU', 'Modelo y color', 'Talle', 'Para pedidos', 'Para el stock mínimo', 'Total a producir', 'Prioridad', 'OT', 'Taller', 'Estado de producción', 'Llega (estim.)'],
        filas: (D.fabricar || []).map(x => { const t = talle36_(x.producto); return [x.sku, t.modelo, x.talle || t.talle, x.faltanPedidos, x.paraMinimo, x.faltanPedidos + x.paraMinimo, x.prioridad, x.ot, tallerDe(x), x.estadoProduccion, x.llega ? fdm_(x.llega) : '']; }) }] });
  }
  const EST = { llegado: 'Llegado', en_produccion: 'En producción', por_llegar: 'Por llegar', atrasado: 'Atrasado' };
  return Object.assign(meta, { titulo: 'Pedidos de taller', archivo: 'Pedidos-de-taller', hojas: [
    { nombre: 'Pedidos de taller', columnas: ['Taller', 'OT', 'Modelo', 'SKU', 'Pedido', 'Llegado', 'Pendiente', 'Estado', 'Fecha de llegada', 'Fecha prometida', 'Fallas'],
      filas: D.lineas.map(x => { const t = talle36_(x.nombreTienda || x.producto); return [x.taller, x.ot, x.nombreTienda || x.producto, x.sku, x.planificado, x.ingresado + x.sobrante, x.faltante, EST[estadoTaller37_(x)], x.ultimaLlegada ? fdm_(x.ultimaLlegada) : '', x.fechaPrometida ? fdm_(x.fechaPrometida) : '', x.fallas || '']; }) }] });
}
/** «Actualizar datos»: relee las DOS planillas (Control ingreso y Ventas Palermo), cualquier día de la semana. */
function actualizarPlanillas(token) {
  const s = sesion_(token);
  if (!['clientes', 'produccion', 'cierre', 'kpi', 'finanzas'].some(p => s.perms.indexOf(p) >= 0)) throw new Error('PERM');
  return actualizarPlanillas_(s);
}
function actualizarPlanillas_(s) {
  const out = [];
  try { const d = control_(true, true); out.push({ planilla: d.archivo || 'Control ingreso Nueva temporada 27', ok: true, ts: d.leida, modificado: d.modificado, avisos: d.avisos }); }
  catch (e) { out.push({ planilla: 'Control ingreso Nueva temporada 27', ok: false, ts: new Date().toISOString(), error: String(e.message || e) }); }
  const c = sync_(s);
  out.push({ planilla: c.archivo || 'HeyBlackk_VentasPalermo_2026 (1)', ok: !!c.ok, ts: c.ts, modificado: c.modificado || null, error: c.ok ? null : c.error });
  // 3.9c · Copia de los comprobantes de Contabilium (antes del Templete: la conciliación la usa). Botón: mes actual y anterior.
  if (ctbConfigurado_()) {
    try { const r = comprobantesSync_(s ? 90000 : 200000) || {}; out.push({ planilla: 'Contabilium · comprobantes de venta', ok: !(r.pendientes || []).length, ts: new Date().toISOString(), modificado: null,
      error: (r.pendientes || []).length ? 'Faltan leer: ' + r.pendientes.join(', ') + ' (se completa en la próxima actualización)' : null }); }
    catch (e) { out.push({ planilla: 'Contabilium · comprobantes de venta', ok: false, ts: new Date().toISOString(), error: String(e.message || e).slice(0, 200) }); }
  }
  // 3.8 · Templete (Dropbox, solo lectura) + ventas facturadas de Contabilium
  if (dbxConfigurado_()) {
    try { const R = finanzas_(true), k = R.contabilium || {};
      out.push({ planilla: 'Templete registro actividades (Dropbox)', ok: true, ts: R.leida, modificado: R.modificado });
      if (k.configurado) out.push({ planilla: 'Contabilium · ventas facturadas (COT)', ok: !!k.ok, ts: k.leida || R.leida, modificado: null, error: k.ok ? null : k.error });
      if (k.configurado) { const r2 = ctbActualizarResumenes_() || {}; out.push({ planilla: 'Contabilium · productos y cobranzas', ok: !r2.productosError && !r2.cobranzasError, ts: new Date().toISOString(), modificado: null, error: r2.productosError || r2.cobranzasError || null }); }
    } catch (e) { out.push({ planilla: 'Templete registro actividades (Dropbox)', ok: false, ts: new Date().toISOString(), error: String(e.message || e).slice(0, 200) }); }
  }
  // 3.9 · Ventas por canal (Contabilium, no depende del Templete). Desde el botón solo los últimos días; el historial y el stock del sorteo, en la de las 7 h.
  if (ctbConfigurado_()) {
    try { const v = ventasCanalSync_(!s) || {}; out.push({ planilla: 'Contabilium · ventas por canal', ok: !v.historialError, ts: new Date().toISOString(), modificado: null, error: v.historialError || null }); }
    catch (e) { out.push({ planilla: 'Contabilium · ventas por canal', ok: false, ts: new Date().toISOString(), error: String(e.message || e).slice(0, 200) }); }
    if (!s) try { stockPalermoArt_(true); } catch (e) {}
  }
  log_(s, 'actualizar_planillas', out.every(x => x.ok) ? 'ok' : 'error', '', out.map(x => x.planilla + ': ' + (x.ok ? 'ok' : x.error)).join(' · ').slice(0, 300));
  return out;
}
/** Tipo de cliente (Franquicia / Mayorista): lo define administración o quien tiene el módulo; no se escribe en la planilla original. */
function setTipoCliente(token, clave, tipo) {
  const s = sesion_(token, 'clientes', true);
  if (['Franquicia', 'Mayorista'].indexOf(tipo) < 0) throw new Error('Tipo inválido.');
  const k = nh_(clave); if (!k) throw new Error('Falta el cliente.');
  const c = cfg_(); c.tiposCliente = Object.assign({}, c.tiposCliente || {}); const antes = c.tiposCliente[k] || 'Franquicia'; c.tiposCliente[k] = tipo;
  PROPS.setProperty('CFG', JSON.stringify(c));
  log_(s, 'tipo_cliente', 'ok', k, k + ': ' + antes + ' → ' + tipo);
  return { clave: k, tipo: tipo };
}
/* ---------- Permisos por jefe (solo administración) ---------- */
const SECCIONES_JEFE = [['finanzas', 'Administración y Finanzas (pagos, cobros e ingresos)'], ['clientes', 'Clientes y pedidos'], ['produccion', 'Producción'], ['ingresos', 'Fichaje y horas / RRHH'], ['vacaciones', 'Vacaciones'], ['rrhh', 'Novedades RR. HH.'],
  ['kpi', 'KPIs comerciales'], ['cierre', 'Cierre diario'], ['auditar', 'Auditar'], ['auditoria', 'Registro de auditorías'], ['acciones', 'Acciones correctivas'], ['historial', 'Historial'], ['personal', 'Personal'], ['config', 'Configuración'], ['otros', 'Otros']];
function permisosJefes(token) {
  const s = sesion_(token, 'personal'); if (s.user.rol !== 'admin') throw new Error('PERM');
  return { secciones: SECCIONES_JEFE.map(x => ({ id: x[0], nombre: x[1] })),
    jefes: usuarios_().filter(u => u.estado === 'activo' && u.rol !== 'empleado').map(u => ({ id: u.id, nombre: u.nombre, rol: u.rol, permisos: permisos_(u) }))
      .sort((a, b) => (a.rol === 'admin' ? 1 : 0) - (b.rol === 'admin' ? 1 : 0) || a.nombre.localeCompare(b.nombre)) };
}
function setPermisoJefe(token, uid, modulo, activo) {
  const s = sesion_(token, 'personal', true);
  if (s.user.rol !== 'admin') throw new Error('Solo la administración cambia los permisos de los jefes.');
  if (MODULOS.indexOf(modulo) < 0) throw new Error('Sección inválida.');
  return lock_(() => {
    const u = usuarios_().find(x => x.id === uid); if (!u) throw new Error('Jefe no encontrado.');
    if (u.rol === 'empleado') throw new Error('Primero cambiá el rol a Jefe/Responsable.');
    if (u.rol === 'admin') throw new Error('La administración tiene acceso a todas las secciones.');
    const P = permisos_(u).slice(), tenia = P.indexOf(modulo) >= 0;
    if (!!activo === tenia) return publico_(u);
    u.permisos = activo ? P.concat([modulo]) : P.filter(p => p !== modulo);
    u.ver = Number(u.ver || 0) + 1;   // la sesión del jefe toma el cambio en su próxima llamada
    guardarUsuario_(u);
    const nom = (SECCIONES_JEFE.find(x => x[0] === modulo) || [modulo, modulo])[1];
    log_(s, 'cambio_permisos', 'ok', u.id, u.nombre + ': ' + (activo ? 'habilitó' : 'quitó') + ' «' + nom + '»');
    return publico_(u);
  });
}
/** Caso inicial pedido por María (una sola vez): Thomás → Clientes y pedidos sí, Producción no · Víctor → Producción sí, Clientes no. */
function migrarPermisos36_() {
  if (PROPS.getProperty('MIG36_PERMS')) return;
  PROPS.setProperty('MIG36_PERMS', new Date().toISOString());
  const reglas = [[/^T+H?OMAS\b/, 'clientes', 'produccion'], [/^VICTOR\b/, 'produccion', 'clientes']];
  usuarios_().filter(u => u.estado === 'activo' && u.rol === 'responsable').forEach(u => {
    const r = reglas.find(x => x[0].test(nh_(u.nombre))); if (!r) return;
    u.permisos = permisos_(u).filter(p => p !== r[2]).concat(permisos_(u).indexOf(r[1]) >= 0 ? [] : [r[1]]);
    u.ver = Number(u.ver || 0) + 1; guardarUsuario_(u);
    log_(null, 'cambio_permisos', 'ok', u.id, u.nombre + ': caso inicial 3.6 (+' + r[1] + ', sin ' + r[2] + ')');
  });
}
