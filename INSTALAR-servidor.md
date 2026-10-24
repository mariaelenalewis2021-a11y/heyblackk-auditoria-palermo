# Actualizar el servidor (Google Apps Script)

1. Abrí el proyecto de Apps Script de la cuenta dueña y reemplazá todo el contenido de `Código.gs` por `servidor-Code.gs`.
2. Guardá. **Implementar → Gestionar implementaciones → editar → Versión: nueva → Implementar** (la URL no cambia).
3. Primera vez en v3: al abrir la app aparece «Actualización a usuarios individuales». Se confirma con la **clave de jefes anterior**
   y se crea el primer usuario de administración. Las claves compartidas quedan retiradas y las auditorías se conservan.
4. Si hiciera falta un código de instalación: ejecutá `generarCodigoInstalacion` (vale 30 minutos, un solo uso).

Para volver atrás: Gestionar implementaciones → elegir la versión anterior.
