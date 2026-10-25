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

7. **3.5:** no requiere permisos nuevos. Al primer uso el servidor agrega en Usuarios las columnas «horario» y «vacacionesAnuales»
   (sin mover datos). Los umbrales del Panorama RRHH se guardan en la configuración (se editan en Fichaje y horas → Panorama RRHH).
   El borrado de fichajes es solo para el rol Administración, pide escribir BORRAR y el PIN, y deja constancia en el Historial.

8. **3.6:** no requiere permisos nuevos (la planilla «Control ingreso Nueva temporada 27» se abre en solo lectura con SpreadsheetApp,
   ID 1ecqEsW9ZILcGxYjAqWvSTqJAgOtaBA7lhSZ5hnf8zP0; se puede cambiar en la configuración `controlFileId`). En el primer ingreso
   después de desplegar se aplica una sola vez el caso inicial de permisos: Thomás con Clientes y pedidos, Víctor con Producción.
   El comando «actualizar las planillas» es `actualizarApp` (relee las dos planillas).

Para volver atrás: Gestionar implementaciones → elegir la versión anterior.
