# Kestrel Live

Estudio de transmisión en vivo y grabación multidestino con IA, con la marca de Kestrel IA. Es una réplica propia de las funciones de StreamYard (planes Core/Advanced), **de uso personal y para correr en la laptop**.

- **Backend:** Flask + PostgreSQL (login, destinos, transmisiones).
- **Frontend:** React (Vite), responsivo para celular.
- **Video en vivo:** [LiveKit](https://livekit.io) (WebRTC) en Docker. Su servicio **Egress** compone la escena y la manda por RTMP a YouTube, Facebook, LinkedIn, Instagram, TikTok u otro servidor, o la graba en MP4.
- Prototipo visual y hallazgos de StreamYard: [`docs/`](docs/).

## Requisitos

- Windows con **Docker Desktop** (o Linux/macOS con Docker).
- Python 3.12 o más nuevo.
- Node.js 22.

## Instalación

```bash
# 1. Variables de entorno
cp .env.example .env
#    Llena SECRET_KEY, FERNET_KEY, POSTGRES_PASSWORD, DATABASE_URL y LIVEKIT_API_SECRET.
#    Los comandos para generarlas vienen dentro de .env.example.

# 2. Servicios de apoyo (PostgreSQL, Redis, LiveKit y Egress)
docker compose up -d

# 3. Backend
cd backend
python -m venv .venv
.venv\Scripts\activate          # en Linux/macOS: source .venv/bin/activate
pip install -r requirements-dev.txt
flask --app wsgi create-user gonza --name "Gonza"   # pide la contraseña sin mostrarla
flask --app wsgi run                                # http://127.0.0.1:5000

# 4. Frontend (en otra terminal)
cd frontend
npm install
npm run dev                                         # http://localhost:5173
```

Entra a http://localhost:5173 con tu usuario. Agrega tus destinos con la clave de transmisión que te da cada red, crea una transmisión y entra al estudio.

### Lo que sale al aire

Egress (en Docker) abre la página `/salida` de Vite y transmite exactamente el lienzo del estudio: diseño, nombres, temas, color, logo y banners. Por eso **Vite tiene que estar corriendo** mientras transmites. Si Egress no logra abrir la página (por ejemplo en Linux, donde Docker no ve el `localhost` de la laptop), arranca el frontend con `npm run dev:red` o deja `EGRESS_TEMPLATE_URL` vacía para volver a la plantilla genérica de LiveKit.

Tus banners, el estilo y el guion del teleprompter se guardan en tu cuenta, así que los tienes en cualquier transmisión y en cualquier navegador.

### Comentarios en escena

1. Pon tus llaves en `.env`: `YOUTUBE_API_KEY` (Google Cloud, *YouTube Data API v3*) y/o `FACEBOOK_PAGE_TOKEN` (token de tu Página).
2. Ya en vivo, en el estudio abre **Comentarios** y pega el link del video en vivo de YouTube y/o el id del video de Facebook.
3. Los comentarios llegan solos cada 5 s o más (respetando lo que pide YouTube para no gastar tu cuota). Toca uno para mostrarlo en escena; vuelve a tocarlo para quitarlo. Sale al aire, y tus invitados también lo ven.

Las llaves solo viven en `.env`: nunca se guardan en la base ni llegan al navegador.

### Kestrel IA

En el estudio, pestaña **Kestrel IA**:

- **Subtítulos en vivo** (Chrome o Edge, gratis): transcribe tu voz y la de tus invitados, la muestra en escena (sale al aire) y la guarda con sus tiempos. Chrome manda el audio a Google para transcribirlo.
- **Moderación del chat**: oculta comentarios con insultos, links o spam. Son reglas locales: no se manda el chat a nadie.
- **Pregunta destacada** (pestaña Comentarios): Claude elige la mejor pregunta del chat y la pone en escena.

Al terminar, en **Biblioteca → Ver** tienes los subtítulos `.srt` y, con `ANTHROPIC_API_KEY`, el botón **Generar con Kestrel IA**: resumen, descripción para YouTube con capítulos, post para LinkedIn y clips verticales sugeridos. Cada clip se recorta a 1080×1920 en tu laptop con **ffmpeg** (en Windows: `winget install ffmpeg`).

La transcripción y los comentarios se le pasan a Claude como datos, nunca como instrucciones, y su respuesta se valida (esquema JSON y tiempos dentro de la duración).

### Invitados

En el estudio, **Tras bastidores → Copiar link de invitado**. Quien abra el link escribe su nombre y entra tras bastidores; tú decides cuándo sale en escena. El invitado ve el mismo lienzo que el público, tiene mic, cámara, presentar pantalla y el chat privado.

- **Crear link nuevo** anula el anterior; **Desactivar** impide que entre alguien más.
- **Sacar del estudio** expulsa a un invitado que ya entró.
- Al terminar la transmisión, el link deja de servir.
- Para invitar a alguien fuera de tu red, la laptop debe ser alcanzable desde internet (ver *Publicación*).

## Variables de entorno

| Variable | Para qué sirve |
|---|---|
| `SECRET_KEY` | Firma la cookie de sesión de Flask. |
| `FERNET_KEY` | Cifra las claves de transmisión en la base de datos. |
| `DATABASE_URL` | Conexión a PostgreSQL. |
| `POSTGRES_*` | Usuario, contraseña y base que crea docker compose. |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | Llaves compartidas entre Flask, LiveKit y Egress. |
| `LIVEKIT_URL` / `LIVEKIT_WS_URL` | Dónde está LiveKit (API y WebSocket). |
| `SESSION_COOKIE_SECURE`, `SESSION_HOURS`, `LOGIN_MAX_ATTEMPTS`, `LOGIN_LOCK_MINUTES` | Ajustes de sesión y bloqueo de login. |
| `YOUTUBE_API_KEY` / `FACEBOOK_PAGE_TOKEN` | Opcionales: leer los comentarios en vivo para ponerlos en escena. |
| `RECORDINGS_DIR`, `RECORD_LIVE` | Carpeta de los MP4 (por defecto `recordings/`) y si las transmisiones en vivo también se graban (por defecto sí). |
| `ANTHROPIC_API_KEY`, `AI_MODEL` | Opcionales: Kestrel IA (resumen, capítulos, clips, pregunta destacada) con Claude. |
| `EGRESS_TEMPLATE_URL` | Página que Egress abre para que lo que sale al aire sea igual al lienzo. Vacía = plantilla de LiveKit. |

## Seguridad incluida

- Login obligatorio. Contraseñas con **bcrypt** y bloqueo temporal tras 5 intentos fallidos.
- Cookies de sesión `HttpOnly`, `Secure` y `SameSite=Lax`, con expiración.
- Protección CSRF: las peticiones que cambian datos exigen el encabezado `X-Requested-With`.
- Claves de transmisión **cifradas** (Fernet). Nunca se regresan al navegador.
- Links de invitado de 192 bits: en la base se guardan su hash SHA-256 (para buscarlos) y una copia cifrada. El invitado recibe un token de LiveKit que solo sirve 15 minutos para conectarse y una identidad `guest-…` que no puede mover el lienzo ni usar la API del anfitrión.
- SQLAlchemy: todas las consultas son parametrizadas. Además, se validan todas las entradas.
- Los errores técnicos van a `logs/kestrel-live.log` y el usuario solo ve un mensaje genérico.
- Ningún secreto vive en el código; `.env` está en `.gitignore`.

## Pruebas

```bash
cd backend && python -m pytest -q
```

GitHub Actions corre las pruebas, `pip-audit` y el build del frontend en cada push. Dependabot revisa las dependencias cada semana.

## Publicación

Por ahora es **solo local**. El video necesita puertos UDP (50000-50100) que Railway no ofrece. Si después se quiere usar desde internet, la opción es LiveKit Cloud o un VPS para la parte de video, y Railway para Flask.

## Hoja de ruta

- [x] Login, destinos RTMP cifrados, transmisiones y grabaciones (API + pruebas)
- [x] Estudio con LiveKit y botón Salir en vivo / Grabar
- [x] Invitados por link (token de solo-invitado)
- [x] Escenas, banners, logo y temas de nombres (como en el prototipo), guardados en el servidor y idénticos al aire
- [x] Comentarios del chat de YouTube y Facebook en pantalla
- [x] IA: subtítulos en vivo, moderación del chat, pregunta destacada, resumen, capítulos y clips verticales
- [ ] Traducción de subtítulos en vivo
- [ ] Publicar clips directo en Reels, Shorts y TikTok
- [x] Biblioteca de grabaciones
