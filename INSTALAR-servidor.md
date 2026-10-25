# Actualizar el servidor (Google Apps Script)

1. Abrí el proyecto de Apps Script de la cuenta dueña y reemplazá todo el contenido de `Código.gs` por `servidor-Code.gs`.
2. Guardá. **Implementar → Gestionar implementaciones → editar → Versión: nueva → Implementar** (la URL no cambia).
3. Primera vez en v3: al abrir la app aparece «Actualización a usuarios individuales». Se confirma con la **clave de jefes anterior**
   y se crea el primer usuario de administración. Las claves compartidas quedan retiradas y las auditorías se conservan.
4. Si hiciera falta un código de instalación: ejecutá `generarCodigoInstalacion` (vale 30 minutos, un solo uso).
5. **3.3 (una sola vez):** ejecutá `instalarActivadores` desde el editor (Ejecutar). Pide dos permisos nuevos —conectarse a
   servicios externos (para descargar los feriados) y administrar activadores— y crea el activador semanal (lunes 6 h) que
   actualiza los feriados; además hace la primera descarga. Si no se ejecuta, la app igual intenta actualizar los feriados
   sola cuando pasaron más de 7 días, pero el permiso de conexión externa tiene que estar aceptado.

6. **3.4:** no requiere permisos nuevos. Al primer uso el servidor agrega solo las columnas nuevas (sucursal en Usuarios; sucursal,
   modo, latitud, longitud, precisión y distancia en Ingresos; clase y sucursal en Correcciones) sin mover datos, y crea la hoja
   «Sucursales» con Palermo (con la ubicación ya configurada) y Lima. Revisá que las dos figuren «Completa» en Fichaje y horas → Sucursales.

Para volver atrás: Gestionar implementaciones → elegir la versión anterior.
