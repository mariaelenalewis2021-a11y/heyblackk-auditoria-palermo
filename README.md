# Hey Blackk · Palermo — app de gestión (v3.1)

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
