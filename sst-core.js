/* Hey Blackk · Ventas sin stock — núcleo de reglas (mismo código para la app y para la demo).
   Reglas de control interno 1–10 del pedido. Nada de esto toca Contabilium. */
var SST = (function () {
  'use strict';
  var EST = {
    PEND_VAL: 'PENDIENTE DE VALIDACIÓN DE DEPÓSITO',
    APROBADA: 'APROBADA · PENDIENTE DE RECEPCIÓN',
    PARCIAL: 'INGRESO PARCIAL',
    PEND_CTB: 'PENDIENTE DE REGULARIZACIÓN EN CONTABILIUM',
    REGULARIZADA: 'REGULARIZADA',
    RECHAZADA: 'RECHAZADA',
    REEMPLAZADA: 'REEMPLAZADA POR REVISIÓN'
  };
  var COLOR = {}; // semáforo pedido: amarillo, azul, naranja, verde, rojo
  COLOR[EST.PEND_VAL] = 'gris'; COLOR[EST.APROBADA] = 'amarillo'; COLOR[EST.PARCIAL] = 'azul';
  COLOR[EST.PEND_CTB] = 'naranja'; COLOR[EST.REGULARIZADA] = 'verde'; COLOR[EST.RECHAZADA] = 'gris';
  COLOR[EST.REEMPLAZADA] = 'gris';

  function nuevoEstado() { return { seq: { SOL: 0, ING: 0, PLA: 0 }, solicitudes: [], ingresos: [], placas: [], log: [] }; }
  function hoy(now) { return (now || new Date()).toISOString().slice(0, 10); }
  function ts(now) { return (now || new Date()).toISOString(); }
  function id(db, p) { db.seq[p]++; return p + '-' + String(db.seq[p]).padStart(4, '0'); }
  function int(v) { var n = Number(v); return Number.isFinite(n) && n === Math.floor(n) ? n : NaN; }
  function cod(c) { return String(c || '').trim().toUpperCase(); }
  /* Fechas: solo AAAA-MM-DD reales; texto libre con largo máximo (nada de código). */
  function fecha(v, nombre, now) { if (v == null || v === '') return now === undefined ? '' : hoy(now);
    var s = String(v).trim(); if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(Date.parse(s + 'T00:00:00Z'))) err('La fecha «' + nombre + '» no es válida (AAAA-MM-DD).'); return s; }
  function txt(v, max) { var s = String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim(); return Array.from(s).slice(0, max || 200).join(''); }
  function err(m) { var e = new Error(m); e.usuario = true; throw e; }
  function log(db, u, accion, ref, detalle, now) { db.log.push({ ts: ts(now), usuario: u.nombre, rol: u.rol, accion: accion, ref: ref, detalle: detalle }); }
  function sol(db, i) { var s = db.solicitudes.find(function (x) { return x.id === i; }); if (!s) err('No existe la solicitud ' + i); return s; }
  function puede(u, roles) { if (roles.indexOf(u.rol) < 0) err('Tu usuario no tiene permiso para esta acción (' + u.rol + ').'); }

  /* 1 · Comercial crea la solicitud. No mueve stock (regla 1). */
  function crearSolicitud(db, u, d, now) {
    puede(u, ['comercial', 'admin']);
    var cant = int(d.cantidad);
    if (!cod(d.codigo)) err('Falta el código del producto.');
    if (!d.cliente) err('Falta el cliente.');
    if (!(cant > 0)) err('La cantidad tiene que ser un número entero mayor a 0.');
    if (d.pedidoRef) {
      var dup = db.solicitudes.find(function (x) {
        return x.estado !== EST.REEMPLAZADA && x.estado !== EST.RECHAZADA &&
          cod(x.codigo) === cod(d.codigo) && String(x.pedidoRef).trim() === String(d.pedidoRef).trim();
      });
      if (dup) err('Ya existe ' + dup.id + ' para ese pedido y ese código. Si cambió la cantidad, pedí una revisión.');
    }
    var s = {
      id: id(db, 'SOL'), rev: 0, origen: null, fecha: fecha(d.fecha, 'fecha de solicitud', now || new Date()), vendedor: txt(d.vendedor, 80) || u.nombre,
      cliente: txt(d.cliente, 120), codigo: cod(txt(d.codigo, 60)), descripcion: txt(d.descripcion, 160), temporada: txt(d.temporada, 20),
      cantidad: cant, motivo: txt(d.motivo), fechaEstimada: fecha(d.fechaEstimada, 'fecha estimada'), observaciones: txt(d.observaciones, 300),
      pedidoRef: txt(d.pedidoRef, 60), estado: EST.PEND_VAL, validacion: null, recibido: 0, creada: ts(now)
    };
    db.solicitudes.push(s);
    log(db, u, 'solicitud_creada', s.id, s.cantidad + ' u ' + s.codigo + ' · ' + s.cliente, now);
    return s;
  }

  /* 2 · Depósito valida. Regla: no aprobar sin respaldo real (stock libre o ingreso previsto con documento). */
  function validar(db, u, i, d, now) {
    puede(u, ['deposito', 'admin']);
    var s = sol(db, i);
    if (s.estado !== EST.PEND_VAL) err(s.id + ' ya fue validada (' + s.estado + ').');
    var res = String(d.resultado || '').toUpperCase();
    if (['APROBADO', 'APROBADO PARCIALMENTE', 'RECHAZADO'].indexOf(res) < 0) err('Elegí APROBADO, APROBADO PARCIALMENTE o RECHAZADO.');
    var v = {
      resultado: res, stockFisico: int(d.stockFisico || 0), comprometible: int(d.comprometible || 0),
      pendienteIngreso: int(d.pendienteIngreso || 0), respaldo: txt(d.respaldo, 120),
      fechaRecepcion: fecha(d.fechaRecepcion, 'fecha de recepción'), observaciones: txt(d.observaciones, 300),
      aprobada: 0, responsable: u.nombre, fecha: ts(now)   // fecha y responsable automáticos
    };
    if (res === 'RECHAZADO') {
      if (!v.observaciones) err('Para rechazar, escribí el motivo en observaciones.');
      s.estado = EST.RECHAZADA;
    } else {
      var ap = int(d.aprobada);
      ['stockFisico', 'comprometible', 'pendienteIngreso'].forEach(function (k) { if (!(v[k] >= 0)) err('Revisá «' + k + '»: tiene que ser un entero ≥ 0.'); });
      if (!(ap > 0)) err('La cantidad aprobada tiene que ser mayor a 0.');
      if (ap > s.cantidad) err('No se puede aprobar más de lo solicitado (' + s.cantidad + ').');
      if (v.comprometible > v.stockFisico) err('Lo comprometible no puede superar el stock físico.');
      if (ap > v.comprometible + v.pendienteIngreso) err('Aprobás ' + ap + ' u pero el respaldo es ' + (v.comprometible + v.pendienteIngreso) + ' u (comprometible + pendiente de ingreso).');
      if (ap > v.comprometible) {
        if (!v.respaldo) err('Lo que no está en stock necesita respaldo: OT, orden de compra o remito previsto.');
        if (!v.fechaRecepcion) err('Falta la fecha estimada de recepción.');
      }
      if (ap < s.recibido) err('Ya se recibieron ' + s.recibido + ' u para esta solicitud: no se puede aprobar menos.');
      if (res === 'APROBADO' && ap !== s.cantidad) err('APROBADO es por el total. Si aprobás menos, elegí APROBADO PARCIALMENTE.');
      if (res === 'APROBADO PARCIALMENTE' && ap === s.cantidad) err('Aprobaste el total: elegí APROBADO.');
      v.aprobada = ap;
      s.estado = EST.APROBADA;   // pasa sola al registro de pendientes de ingreso
      if (s.recibido > 0 && s.recibido >= ap) {   // revisión que ya tiene todo recibido
        var pls = db.placas.filter(function (p) { return p.solicitudVigente === s.id; });
        s.estado = pls.length && pls.every(function (p) { return p.estado === 'REGULARIZADA'; }) ? EST.REGULARIZADA : EST.PEND_CTB;
      } else if (s.recibido > 0) s.estado = EST.PARCIAL;
    }
    s.validacion = v;
    log(db, u, 'validacion', s.id, res + (v.aprobada ? ' ' + v.aprobada + ' u' : '') + (v.respaldo ? ' · respaldo ' + v.respaldo : ''), now);
    // si había unidades de un ingreso anterior sin comprometer, NO se asignan solas: se asignan con el próximo ingreso
    return s;
  }

  /* Revisión: aprobada no se edita. Se reemplaza por una nueva revisión que vuelve a Depósito. */
  function revisar(db, u, i, d, now) {
    puede(u, ['comercial', 'admin']);
    var s = sol(db, i);
    if (s.estado === EST.REEMPLAZADA) err('Esa solicitud ya tiene una revisión más nueva.');
    if (s.estado === EST.REGULARIZADA) err('Ya está regularizada: no se puede cambiar.');
    var cant = int(d.cantidad);
    if (!(cant > 0)) err('Cantidad inválida.');
    if (cant < s.recibido) err('Ya se recibieron ' + s.recibido + ' u para esta solicitud: la revisión no puede ser menor.');
    if (!txt(d.motivoRevision)) err('Escribí el motivo de la revisión.');
    d = { cantidad: cant, motivoRevision: txt(d.motivoRevision) };
    if (s.estado === EST.PEND_VAL) {           // todavía no aprobada: cambio directo, queda en el historial
      log(db, u, 'cantidad_cambiada', s.id, s.cantidad + ' → ' + cant + ' · ' + d.motivoRevision, now);
      s.cantidad = cant; return s;
    }
    var n = JSON.parse(JSON.stringify(s));
    n.id = s.id.replace(/\.R\d+$/, '') + '.R' + (s.rev + 1);
    n.rev = s.rev + 1; n.origen = s.id; n.cantidad = cant; n.estado = EST.PEND_VAL; n.validacion = null;
    n.creada = ts(now); n.motivoRevision = d.motivoRevision;
    s.estado = EST.REEMPLAZADA; s.reemplazadaPor = n.id;
    // las placas ya emitidas pasan a la revisión (no se duplica nada: se re-apuntan)
    db.placas.forEach(function (p) { if (p.solicitudVigente === s.id) p.solicitudVigente = n.id; });
    db.solicitudes.push(n);
    log(db, u, 'revision', n.id, 'reemplaza ' + s.id + ' · ' + s.cantidad + ' → ' + cant + ' · ' + d.motivoRevision, now);
    return n;
  }

  function vigente(db, s) { while (s && s.reemplazadaPor) s = sol(db, s.reemplazadaPor); return s; }
  function pendienteDe(s) { return s.validacion ? Math.max(0, s.validacion.aprobada - s.recibido) : 0; }

  /* 3 · Ingreso real (solo lo que recibe Depósito, regla 3) + 5 · cruce y placas automáticas. */
  function registrarIngreso(db, u, d, now) {
    puede(u, ['deposito', 'admin']);
    var c = cod(txt(d.codigo, 60)), cant = int(d.cantidad), rem = txt(d.remito, 60);
    if (!c) err('Falta el código.');
    if (!(cant > 0)) err('La cantidad recibida tiene que ser un entero mayor a 0.');
    if (!rem) err('Falta el número de remito o documento de ingreso.');
    var dup = db.ingresos.find(function (x) { return x.codigo === c && x.remito.toUpperCase() === rem.toUpperCase(); });
    if (dup) err('El remito ' + rem + ' para ' + c + ' ya se cargó (' + dup.id + '). No se carga dos veces.');
    var ing = {
      id: id(db, 'ING'), fecha: fecha(d.fecha, 'fecha de recepción', now || new Date()), codigo: c, descripcion: txt(d.descripcion, 160), temporada: txt(d.temporada, 20),
      cantidad: cant, remito: rem, observaciones: txt(d.observaciones, 300), responsable: u.nombre, creado: ts(now), asignado: 0, libre: 0, placas: []
    };
    // asignación FIFO a solicitudes aprobadas con saldo, la más vieja primero
    var cola = db.solicitudes.filter(function (s) {
      return s.codigo === c && (s.estado === EST.APROBADA || s.estado === EST.PARCIAL) && pendienteDe(s) > 0;
    }).sort(function (a, b) { return (a.fecha + a.creada).localeCompare(b.fecha + b.creada); });
    var resto = cant;
    cola.forEach(function (s) {
      if (resto <= 0) return;
      var pend = pendienteDe(s), asig = Math.min(pend, resto);
      resto -= asig; s.recibido += asig;
      s.estado = s.recibido >= s.validacion.aprobada ? EST.PEND_CTB : EST.PARCIAL;
      var p = {
        id: id(db, 'PLA'), fecha: ing.fecha, ingreso: ing.id, remito: rem, solicitud: s.id, solicitudVigente: s.id,
        cliente: s.cliente, codigo: c, descripcion: s.descripcion || ing.descripcion,
        solicitado: s.cantidad, aprobado: s.validacion.aprobada,
        ingresoTotal: cant,                   // lo que entró en este remito
        comprometido: asig,                   // de este ingreso, ya vendido a esta solicitud
        aRegularizar: asig,                   // lo que hay que descontar del disponible en Contabilium
        recibidoAcum: s.recibido, pendiente: Math.max(0, s.validacion.aprobada - s.recibido),
        estado: 'PENDIENTE', ctbRef: '', regularizadaPor: '', regularizadaEl: ''
      };
      db.placas.push(p); ing.placas.push(p.id);
    });
    ing.asignado = cant - resto; ing.libre = resto;
    db.ingresos.push(ing);
    log(db, u, 'ingreso', ing.id, cant + ' u ' + c + ' · remito ' + rem + ' · comprometidas ' + ing.asignado + ' · libres ' + ing.libre, now);
    return ing;
  }

  /* 8 · Solo Administración marca la regularización, una sola vez y con el número del movimiento en Contabilium. */
  function marcarRegularizada(db, u, placaId, ctbRef, now) {
    puede(u, ['admin']);
    var p = db.placas.find(function (x) { return x.id === placaId; });
    if (!p) err('No existe la placa ' + placaId);
    if (p.estado === 'REGULARIZADA') err('La placa ' + p.id + ' ya fue regularizada el ' + p.regularizadaEl.slice(0, 10) + ' por ' + p.regularizadaPor + ' (' + p.ctbRef + '). No se hace dos veces.');
    ctbRef = txt(ctbRef, 60);
    if (!ctbRef) err('Escribí el número del movimiento o ajuste hecho en Contabilium.');
    var usada = db.placas.find(function (x) { return x.ctbRef && x.ctbRef.toUpperCase() === ctbRef.toUpperCase() && x.codigo !== p.codigo; });
    if (usada) err('Ese movimiento de Contabilium ya está usado en ' + usada.id + ' (otro producto). Revisá el número.');
    p.estado = 'REGULARIZADA'; p.ctbRef = ctbRef; p.regularizadaPor = u.nombre; p.regularizadaEl = ts(now);
    var s = vigente(db, sol(db, p.solicitudVigente));
    var todas = db.placas.filter(function (x) { return x.solicitudVigente === s.id; });
    if (s.estado === EST.PEND_CTB && todas.every(function (x) { return x.estado === 'REGULARIZADA'; })) s.estado = EST.REGULARIZADA;
    log(db, u, 'regularizada', p.id, p.aRegularizar + ' u ' + p.codigo + ' · ' + s.id + ' · Contabilium ' + ctbRef, now);
    return p;
  }

  /* 9 · Diferencias: se detectan, nunca se corrigen solas. */
  function diferencias(db, now) {
    var out = [], d0 = hoy(now);
    db.solicitudes.forEach(function (s) {
      if (s.estado === EST.REEMPLAZADA || s.estado === EST.RECHAZADA) return;
      var pl = db.placas.filter(function (p) { return p.solicitudVigente === s.id; });
      var sumPl = pl.reduce(function (a, p) { return a + p.aRegularizar; }, 0);
      if (s.validacion && sumPl !== s.recibido) out.push({ tipo: 'Placas ≠ recibido', ref: s.id, detalle: 'placas ' + sumPl + ' u vs recibido ' + s.recibido + ' u' });
      if (s.validacion && s.recibido > s.validacion.aprobada) out.push({ tipo: 'Recibido de más', ref: s.id, detalle: s.recibido + ' > aprobado ' + s.validacion.aprobada });
      var fe = s.validacion && s.validacion.fechaRecepcion || s.fechaEstimada;
      if ((s.estado === EST.APROBADA || s.estado === EST.PARCIAL) && fe && fe < d0) out.push({ tipo: 'Vencida', ref: s.id, detalle: 'debía llegar ' + fe + ' · faltan ' + pendienteDe(s) + ' u' });
    });
    db.ingresos.forEach(function (i) {
      var sp = db.placas.filter(function (p) { return p.ingreso === i.id; }).reduce(function (a, p) { return a + p.comprometido; }, 0);
      if (sp + i.libre !== i.cantidad) out.push({ tipo: 'Ingreso descuadrado', ref: i.id, detalle: sp + ' + ' + i.libre + ' ≠ ' + i.cantidad });
    });
    var refs = {};
    db.placas.forEach(function (p) { if (p.ctbRef) { var k = p.ctbRef.toUpperCase(); if (refs[k] && refs[k] !== p.codigo) out.push({ tipo: 'Movimiento Contabilium repetido', ref: p.id, detalle: p.ctbRef }); refs[k] = p.codigo; } });
    return out;
  }

  function colorSolicitud(db, s, now) {
    if (diferencias(db, now).some(function (d) { return d.ref === s.id && d.tipo !== 'Vencida'; })) return 'rojo';
    return COLOR[s.estado] || 'gris';
  }

  function tablero(db, f, now) {
    f = f || {};
    var act = db.solicitudes.filter(function (s) { return s.estado !== EST.REEMPLAZADA; }).filter(function (s) {
      return (!f.codigo || s.codigo.indexOf(cod(f.codigo)) >= 0) && (!f.temporada || s.temporada === f.temporada) &&
        (!f.vendedor || s.vendedor === f.vendedor) && (!f.cliente || s.cliente === f.cliente) && (!f.estado || s.estado === f.estado);
    });
    var ids = act.map(function (s) { return s.id; });
    var pl = db.placas.filter(function (p) { return ids.indexOf(p.solicitudVigente) >= 0; });
    var dif = diferencias(db, now);
    var sum = function (a, fn) { return a.reduce(function (t, x) { return t + fn(x); }, 0); };
    return {
      total: act.length,
      pendAprob: act.filter(function (s) { return s.estado === EST.PEND_VAL; }).length,
      aprobadas: act.filter(function (s) { return s.validacion && s.validacion.aprobada > 0; }).length,
      productosPendIngreso: Array.from(new Set(act.filter(function (s) { return pendienteDe(s) > 0 && s.estado !== EST.RECHAZADA; }).map(function (s) { return s.codigo; }))).length,
      uComprometidas: sum(act, function (s) { return s.validacion ? s.validacion.aprobada : 0; }),
      uRecibidas: sum(act, function (s) { return s.recibido; }),
      uPendIngreso: sum(act, pendienteDe),
      uPendRegularizar: sum(pl.filter(function (p) { return p.estado !== 'REGULARIZADA'; }), function (p) { return p.aRegularizar; }),
      uRegularizadas: sum(pl.filter(function (p) { return p.estado === 'REGULARIZADA'; }), function (p) { return p.aRegularizar; }),
      uLibresIngresos: sum(db.ingresos, function (i) { return i.libre; }),
      diferencias: dif.filter(function (d) { return d.tipo !== 'Vencida'; }).length,
      vencidas: dif.filter(function (d) { return d.tipo === 'Vencida'; }).length,
      lista: act
    };
  }

  return { EST: EST, nuevoEstado: nuevoEstado, crearSolicitud: crearSolicitud, validar: validar, revisar: revisar,
    registrarIngreso: registrarIngreso, marcarRegularizada: marcarRegularizada, diferencias: diferencias,
    tablero: tablero, colorSolicitud: colorSolicitud, pendienteDe: pendienteDe, vigente: vigente };
})();
if (typeof module !== 'undefined') module.exports = SST;
