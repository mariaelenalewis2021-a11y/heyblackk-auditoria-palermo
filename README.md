# Hey Blackk · Palermo y Lima — app de gestión (v3.6)

App interna (PWA) para Palermo: fichada de entrada y salida, personal, auditorías con fotos por punto,
cierre diario leído de la planilla (solo lectura), KPIs comerciales con recomendaciones, historial protegido y RR. HH.

- **Frontend:** `index.html`, `app.js`, `config.js`, `sw.js`, `manifest.webmanifest` (GitHub Pages).
- **Servidor:** `servidor-Code.gs` (Google Apps Script, ejecuta como la cuenta dueña). Ver `INSTALAR-servidor.md`.
- **Seguridad:** usuarios individuales con PIN (4 números empleados / 6 jefes), permisos validados en el servidor,
  sesiones revocables, bloqueo por intentos, historial encadenado, fotos privadas en Drive con retención.
- En este repositorio **no hay claves ni datos**: todo vive en el Drive de la cuenta dueña.
- **Rendimiento (3.1):** arranque inmediato con una sola llamada al servidor, fichada en una llamada, cámara cancelable,
  reintento automático de lecturas, aviso de conexión y service worker con tope de espera. El servidor memoriza lecturas
  por pedido, formatea la auditoría en lote y limpia fotos vencidas en lotes acotados.
- **Acceso de jefes (3.2):** tarjeta "Jefes y Administración" en el inicio; usuario y PIN una sola vez y se abre el panel
  de gestión, desde donde se navega entre módulos sin volver a ingresar. La sesión se guarda en el teléfono y se cierra
  sola tras 30 min sin uso (el servidor aplica la misma regla y un máximo de 10 h); "Cerrar sesión" la invalida al instante.
  Las operaciones sensibles (usuarios, PIN, roles, configuración, parámetros, aprobar correcciones, borrar) siguen pidiendo
  el PIN antes de ejecutarse. El fichaje del personal no cambia.
- **Feriados de Argentina (3.3):** se descargan solos (año actual y siguiente) de una API pública sin clave, con 3 fuentes
  en cadena (ArgentinaDatos → Nager.Date → nolaborables) y actualización semanal por activador; si ninguna responde se usa la
  última lista guardada y se avisa. Hoja "Feriados" con tipo (feriado nacional / trasladable / puente turístico / día no laborable)
  y excepciones manuales (feriado de CABA, inventario, evento = local cerrado). Un feriado en día de apertura sin caja no es un
  cierre pendiente: queda "Feriado: confirmar si abrió" y un jefe marca «Estuvo cerrado» (se excluye de promedios, días con cierre,
  proyección, regla de la 5.ª semana y comparaciones) o «Abrió» (queda pendiente de carga). Nunca se asume que el local cerró.
- **Planilla (3.3):** se leen todas las semanas que tenga cada hoja (4, 5 o más bloques) y un día cargado en $ 0 es un día
  cargado sin ventas (no un pendiente). Se avisa si una semana copiada repite fechas.
- **Resumen hablado (3.3):** botones arriba de los KPIs (resumen general, KPIs comerciales, KPIs de auditoría, acciones),
  Detener y velocidad recordada. Usa la voz del navegador (Web Speech API, es-AR) sin servicios pagos; nunca suena sola;
  el texto se arma en el servidor con datos reales, con los números dichos como se hablan, y se muestra en pantalla.
- **Acciones comerciales para meses bajos (3.3):** un mes es bajo si el promedio por día de apertura (o su proyección) queda
  por debajo del mes anterior o del promedio del año en más del umbral configurable (10 %). Si lo es: 3 a 5 acciones con qué
  hacer, por qué (dato), esfuerzo, plazo y cómo medir, tráfico antes que descuentos; si no: "Sin alertas: el mes viene en línea".
- **Vacaciones (3.3):** todo en la app, sin mails. El personal pide con el mismo usuario y PIN de la fichada (calendario con
  rango, validaciones, "Mis vacaciones", cancelación, novedades); los jefes resuelven desde el módulo Vacaciones (pendientes
  primero, aviso de cobertura informativo, resaltado a los 3 días, calendario del equipo e historial inmutable). El servidor
  valida dueño y permiso en cada llamada; en la hoja no hay PIN ni mail. Quien está de vacaciones aprobadas no cuenta como
  falta ni como fichada pendiente.
- **Ubicación obligatoria (3.3):** la fichada pide la ubicación antes de abrir la cámara, todas las veces; sin ubicación no se
  registra (el servidor también la rechaza y deja el intento en el historial). Configurable.
- **Fichaje y horas con sucursales (3.4):** hoja "Sucursales" editable por jefes (Palermo y Lima: dirección, latitud, longitud,
  radio en metros, días de apertura, activa). Cada persona tiene su sucursal (campo nuevo en Usuarios) y entra con el mismo usuario y PIN.
  Dos botones grandes (entrada / salida) con el estado actual; la ubicación se pide una sola vez al tocar, la distancia (Haversine)
  y la hora (Buenos Aires) las calcula el servidor. Fuera del radio, sin permiso o con precisión peor que 100 m no se registra:
  se muestra "Estás a X metros" y se ofrece un fichaje manual con motivo, que un jefe aprueba o rechaza (con motivo).
  Varios pares por día; sin dos entradas seguidas ni salida sin entrada; bloqueo anti doble toque; una entrada abierta de otro día
  pide corrección. Horas por día, semana y mes, con total, promedio, días incompletos aparte, vacaciones y feriados como tales,
  "Sin fichaje" para revisar, horas esperadas por persona y redondeo configurables (diferencia informativa, sin pagos ni horas extra).
  Sección de jefes: Hoy por sucursal, Pendientes, Horas (filtros y exportación a la hoja "Horas"), Fichadas (correcciones con motivo
  y original conservado) y Sucursales. Contador rojo de pendientes. Ubicación visible solo para jefes; sin PIN en las hojas.
  Si una sucursal tiene datos incompletos, se avisa en pantalla y no se ficha sin validar.
- **3.5 · Ubicación al fichar:** el pedido de ubicación se hace en el mismo toque del botón (gesto de la persona), con alta precisión
  y 15 s de espera; errores separados (1 permiso denegado, 2 GPS apagado/sin señal, 3 tiempo agotado) con pasos por caso;
  detecta permiso bloqueado (permissions.query), navegador interno de otras apps (WebView de Instagram, Facebook, WhatsApp…) con
  «Abrir en Chrome» y marcos (iframe) con «Abrir en pestaña propia». Botones «Reintentar» y «Probar mi ubicación» (no registra nada).
- **3.5 · Borrar registros de fichaje (solo Administración):** por empleado (incluye dados de baja), con rango o todos, vista previa
  de cuántos se borran, confirmación escribiendo BORRAR + PIN, y borrado individual desde Fichadas. En el Historial queda quién,
  cuándo, de quién y cuántos, sin los datos borrados.
- **3.5 · Audio y acciones comerciales:** voz femenina o masculina (se recuerda por usuario), días flojos vs. el promedio del mismo día
  de la semana con 3 acciones, fechas especiales de Argentina con 3-4 semanas de aviso y plan por etapas (y refuerzo del local).
- **3.5 · Panorama RRHH (jefes y administración):** alertas con semáforo (ausentismo, tardanzas/salidas anticipadas con tolerancia,
  incompletos, horas bajo lo pactado, exceso de horas, rechazos de ubicación, patrones) y positivas (cumplimiento, puntualidad, racha,
  ranking); resumen por persona con saldo de vacaciones; filtros por sucursal, empleado y período; umbrales editables. Informativo.
- **3.6 · Clientes y pedidos (jefes habilitados):** lee la planilla «Control ingreso Nueva temporada 27» (solo lectura): por cliente
  pedidas, entregadas (incluye lo separado en su depósito), pendientes, estado con semáforo (Completo, Parcial, Pendiente, Atrasado),
  monto del pedido y saldo sin facturar; detalle modelo por modelo; filtros, buscador, orden; alertas y prioridades; tipo Franquicia/Mayorista.
- **3.6 · Producción (jefes habilitados):** planificado, ingresado, en talleres, sin taller, falta fabricar y avance; por taller; artículos con
  semáforo y filtros; falta fabricar por talle; OTs en curso.
- **3.6 · Permisos de jefes (solo administración):** interruptor por sección y por jefe, validado en el servidor (sin permiso no viajan los
  datos); un jefe nuevo arranca sin Clientes ni Producción; cada cambio pide PIN y queda en el Historial.
- **3.6 · Actualizar datos:** relee las dos planillas (Control ingreso y Ventas Palermo) cualquier día, con fecha y hora de cada una.
- **3.5 · Resumen general:** comercial → auditoría → RRHH, en pantalla y en el audio; lo que no tiene datos no se menciona.
