# Secretaría Nebrija

Herramienta interna de secretaría del Colegio Mayor Universitario Antonio de Nebrija: censo, plano de habitaciones, certificados de residencia, carteles con QR, puntos y créditos, anuario, sorteos, mensajes de WhatsApp, altas de clubes (Clupik) y **pasar lista desde el móvil** con sincronización con Google Sheets.

Es una página estática (HTML + CSS + JavaScript, sin servidor) que se instala en el móvil como una aplicación y funciona sin conexión.

## Privacidad: este repositorio no contiene datos personales

- No hay ningún colegial, DNI, teléfono ni correo en el código.
- El censo se carga desde tu Excel/CSV o desde tu hoja de Google y se guarda **solo en el navegador del dispositivo** (`localStorage`).
- La conexión con Google Sheets (dirección y clave) también se guarda solo en cada dispositivo; nunca está en el repositorio.
- El repositorio tiene que ser público para usar GitHub Pages gratis. Por eso mismo no debe subirse nunca un fichero con datos de personas.

## Publicarla en GitHub Pages (una vez)

1. En GitHub: **New repository** → nombre `secretaria-nebrija` → **Public** → *Create repository*.
2. En la página del repositorio vacío: **uploading an existing file**. Arrastra **el contenido** de esta carpeta (`index.html`, `app.js`, `app.css`, `sw.js`, `manifest.webmanifest`, `.nojekyll` y las carpetas `img`, `lib` y `apps-script`) → *Commit changes*.
   - Si el navegador no te deja arrastrar carpetas, usa Chrome o Edge, o súbelo por terminal:
     ```
     git init
     git add .
     git commit -m "Secretaría Nebrija"
     git branch -M main
     git remote add origin https://github.com/TU-USUARIO/secretaria-nebrija.git
     git push -u origin main
     ```
3. **Settings → Pages → Build and deployment**: *Source* = *Deploy from a branch*, *Branch* = `main`, carpeta `/ (root)` → *Save*.
4. En uno o dos minutos la página estará en `https://TU-USUARIO.github.io/secretaria-nebrija/`.

## Instalarla en el móvil

- **iPhone (Safari):** abre la dirección → botón Compartir → **Añadir a pantalla de inicio**.
- **Android (Chrome):** menú ⋮ → **Instalar aplicación** (o el botón «Instalar en el móvil» del menú de la propia app).

Conviene instalarla: en iPhone, Safari puede borrar los datos de las páginas que no se usan durante una semana, pero no los de las apps instaladas. Aun así, la hoja de Google es la copia de seguridad.

## Conectar la hoja de Google (pasar lista y censo)

1. Crea una hoja de cálculo nueva en Google Sheets. Si ya tienes el censo en ella, ponle a la pestaña el nombre **Censo** y cabeceras como *Apellido 1, Apellido 2, Nombre, Teléfono, Habitación, DNI, Email, Estudios*.
2. **Extensiones → Apps Script**. Borra el contenido y pega el de [`apps-script/Code.gs`](apps-script/Code.gs) (la app tiene un botón «Copiar el código del script» en *Pasar lista → Categorías y hoja*).
3. **Configuración del proyecto (⚙) → Propiedades de la secuencia de comandos → Añadir propiedad**: nombre `CLAVE`, valor una contraseña larga que inventes.
4. **Implementar → Nueva implementación → Aplicación web**. *Ejecutar como*: **Yo**. *Quién tiene acceso*: **Cualquier usuario**. Autoriza los permisos que pide Google.
5. Copia la dirección que acaba en `/exec`.
6. En la app: **Pasar lista → Categorías y hoja**: pega la dirección y la clave → *Probar conexión*.
7. Si el censo está ya en la hoja: *Traer el censo de la hoja*. Si lo tienes en la app: *Subir el censo a la hoja*.

La hoja crea sola las pestañas **Categorías, Sesiones, Asistencia y Totales**. *Totales* se recalcula en cada sincronización.

La dirección `/exec` es pública, pero solo responde si se envía la clave. Si cambias el código del script, hay que crear una **nueva versión** de la implementación (*Implementar → Gestionar implementaciones → Editar → Nueva versión*).

### Cómo se sincroniza

- Cada marca se guarda al instante en el dispositivo (funciona sin cobertura).
- Con «Sincronizar solo» activado, a los 3 segundos de marcar (o al volver la conexión) se descarga lo nuevo de la hoja y se sube lo pendiente.
- Si dos móviles editan la **misma sesión a la vez**, gana el último que sincroniza para esa sesión. Para evitarlo, que cada persona pase lista de sesiones distintas.
- Las sesiones borradas en un móvil se borran en los demás en su siguiente sincronización.

## Pasar lista

- **Categorías libres**: tú las creas y decides cuántos puntos da cada asistencia (puede ser 0).
- **Sesiones**: categoría + fecha + título opcional. Tres marcas por persona: **P** presente, **A** ausente, **J** justificado (no suma puntos).
- **Totales**: por persona y categoría; botón *Usar en Puntos y créditos* para calcular los créditos con los tramos del Colegio (10 / 20 / 25 puntos).
- **Excel**: *Descargar Excel* genera `asistencia-AAAA-MM-DD.xlsx` con las pestañas Totales, Matriz y Asistencia.
- **Copia de seguridad**: descarga/recupera un `.json` con todo lo de pasar lista.

## Qué cambia respecto a la versión de Claude

Esta versión es independiente de Claude, así que no incluye lo que dependía de él:

- **Archivo en Drive** (navegar/renombrar/mover archivos del Drive).
- **Actualizar documentos** (cambios por instrucción en Word).
- **Lectura de fotos y de listas libres con IA** en Clupik (ahora el texto se separa con reglas simples: `Apellidos, Nombre — DNI — fecha`).
- El buscador de Drive dentro de *Unificar listados* (sigue funcionando con ficheros del dispositivo).

Los datos que antes venían incluidos (firma del certificado, enlaces de los carteles, correo de Clupik) ahora se escriben una vez en cada campo y se recuerdan en el dispositivo.

## Publicar cambios

Edita los ficheros en GitHub (o súbelos de nuevo) y cambia el número de `VERSION` en `sw.js` (`secretaria-v2` → `secretaria-v3`) para que los móviles descarguen la versión nueva.

## Estructura

```
index.html            la aplicación
app.css / app.js      estilos y lógica
sw.js                 funcionamiento sin conexión
manifest.webmanifest  instalación como app
img/                  escudo e iconos
lib/                  SheetJS (Excel), qrcode.js y JSZip (MIT / Apache-2.0), incluidas para no depender de internet
apps-script/Code.gs   script de Google Sheets
```
