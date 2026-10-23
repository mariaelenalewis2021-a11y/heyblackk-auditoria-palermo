# Instalar el servidor (una sola vez)

Hacelo con la **cuenta de Google de Hey Blackk** que va a ser dueña de los datos.

1. Entrá a <https://script.google.com> → **Nuevo proyecto** → nombre: `Hey Blackk Auditoría Palermo`.
2. Pegá todo el contenido de `servidor-Code.gs` reemplazando el código que trae.
3. Guardá. Arriba elegí la función **generarCodigoInstalacion** y tocá **▶ Ejecutar**. Autorizá los permisos (crear la planilla y la carpeta de fotos en tu Drive). En el registro de ejecución aparece un **código de 8 caracteres** (vence en 30 min).
4. **Implementar → Nueva implementación → Aplicación web**. Ejecutar como: **Yo**. Acceso: **Cualquier usuario**. Copiá la URL que termina en `/exec`.
5. Esa URL va en `config.js` → `BACKEND_URL`. Las apps ya instaladas se actualizan solas.
6. Abrí la app: pide el código de instalación y que crees la **clave de jefes** y la **clave de auditor**.

Nada de esto requiere poner claves en el código ni en chats.
