# Mi Audioship

Tu propia página para subir música a YouTube:

1. Entras con tu cuenta de Google.
2. Arrastras tus audios y una imagen o un video. El video se repite en bucle durante toda la canción.
3. Pulsas un botón y cada canción se sube como video a tu canal, en orden y con playlist.

Los videos se arman **dentro de tu navegador**, así que no hay servidor ni costos.
Sirve para cualquier álbum, EP o single, y para lanzamientos futuros.

Para que funcione hay que hacer tres cosas, cada una **una sola vez**: publicar la página, configurar Google y escribir tu ID de cliente en la página.

---

## 1. Publicar la página (gratis, con GitHub Pages)

1. Crea una cuenta en https://github.com si no tienes.
2. Pulsa **New repository**, ponle de nombre `audioship`, déjalo en **Public** y pulsa **Create repository**.
3. Pulsa **uploading an existing file** y arrastra **todo el contenido** de esta carpeta: `index.html`, `app.js` y la carpeta `vendor`. Luego pulsa **Commit changes**.
4. Ve a **Settings → Pages**. En "Branch" elige `main` y la carpeta `/ (root)`, y pulsa **Save**.
5. En uno o dos minutos tu página queda en:
   `https://TU-USUARIO.github.io/audioship/`

No hace falta subir `servidor-local.ps1`, `abrir-local.bat` ni este archivo LEEME.

> Tu página no guarda contraseñas ni datos de Google en el código. El ID de cliente y la sesión quedan solo en tu navegador.

## 2. Configurar Google

1. Entra a https://console.cloud.google.com y crea un proyecto, por ejemplo "audioship".
2. Ve a **APIs y servicios → Biblioteca**, busca **YouTube Data API v3** y pulsa **Habilitar**.
3. Ve a **Google Auth Platform**:
   - Tipo de usuario: **Externo**. Pon el nombre de la app y tu correo.
   - En **Público** (Audience), agrega como **usuario de prueba** el correo con el que manejas tu canal.
4. Ve a **Clientes → Crear cliente → Aplicación web**.
   En **Orígenes de JavaScript autorizados** agrega:
   - `https://TU-USUARIO.github.io`
   - `http://localhost:8080` (solo si también la vas a usar en tu PC)
5. Copia el **ID de cliente**. Termina en `.apps.googleusercontent.com`.

## 3. Usar la página

1. Abre tu página, pulsa **⚙**, pega el ID de cliente y pulsa **Guardar**.
2. Pulsa **Entrar con Google**, elige tu cuenta y acepta.
3. Escribe el artista y el álbum, arrastra el visual y los audios, revisa los títulos y el orden, y pulsa **Crear y subir a YouTube**.

Los campos se recuerdan para la próxima vez. Si se corta la subida, vuelve a arrastrar los mismos audios: los que ya se subieron salen como **«Ya subido»** y se saltan.

**«Solo descargar videos»** crea los MP4 y los descarga a tu PC, sin subir nada.

### Detalles

- **Títulos.** Se toman de la etiqueta del MP3 o del nombre del archivo, sin el número. Puedes editarlos en la lista.
- **Orden.** Las canciones se ordenan por nombre de archivo. Usa ↑ ↓ para cambiar el orden.
- **Plantillas.** En los textos puedes usar `{artista}` `{album}` `{titulo}` `{pista}` `{total}`.
- **Programar.** Elige fecha y hora y, si quieres, «cada X horas» para escalonar los lanzamientos.
- **Miniatura.** Se usa un fotograma del visual. YouTube solo la aplica si tu canal está verificado por teléfono.
- **Tiempo.** Preparar el visual tarda alrededor de un minuto, una vez por lanzamiento. Después, cada canción tarda segundos en armarse y lo que tarde en subir con tu internet.
- **Tamaño.** Cada canción ocupa unos 100 MB en 1080p. Con 720p ocupa menos y se sube más rápido.
- **Mantén la pestaña abierta** mientras sube.

## Límites de Google

- **Videos privados hasta que Google apruebe la app.** Mientras tu proyecto de Google Cloud no pase la revisión de YouTube, todos los videos que se suben por API quedan **privados** y no se pueden hacer públicos.
  Para quitar ese límite, pide la revisión gratis en el formulario "YouTube API Services – Audit and Quota Extension Form": https://support.google.com/youtube/contact/yt_api_form
  Audioship no tiene este límite porque ya pasó esa revisión.
- **Cuota diaria.** La cuota inicial alcanza para unos **6 videos por día**. Al llegar al límite, la página se detiene y te avisa. Al día siguiente vuelves a arrastrar los mismos audios y sigue. En el mismo formulario puedes pedir más cuota.
- **Sesión.** La sesión de Google dura una hora. Si vence a mitad de la subida, la página se detiene y basta con pulsar **Continuar**.

## Probarla en tu PC

Haz doble clic en `abrir-local.bat`. Se abre en http://localhost:8080. Para esto, `http://localhost:8080` tiene que estar en los orígenes autorizados de Google (paso 2.4).
