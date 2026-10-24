# Hey Blackk · Palermo — app de gestión (v3)

App interna (PWA) para Palermo: fichada de entrada y salida, personal, auditorías con fotos por punto,
cierre diario leído de la planilla (solo lectura), KPIs comerciales con recomendaciones, historial protegido y RR. HH.

- **Frontend:** `index.html`, `app.js`, `config.js`, `sw.js`, `manifest.webmanifest` (GitHub Pages).
- **Servidor:** `servidor-Code.gs` (Google Apps Script, ejecuta como la cuenta dueña). Ver `INSTALAR-servidor.md`.
- **Seguridad:** usuarios individuales con PIN (4 números empleados / 6 jefes), permisos validados en el servidor,
  sesiones revocables, bloqueo por intentos, historial encadenado, fotos privadas en Drive con retención.
- En este repositorio **no hay claves ni datos**: todo vive en el Drive de la cuenta dueña.
