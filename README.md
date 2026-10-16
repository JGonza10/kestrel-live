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

## Seguridad incluida

- Login obligatorio. Contraseñas con **bcrypt** y bloqueo temporal tras 5 intentos fallidos.
- Cookies de sesión `HttpOnly`, `Secure` y `SameSite=Lax`, con expiración.
- Protección CSRF: las peticiones que cambian datos exigen el encabezado `X-Requested-With`.
- Claves de transmisión **cifradas** (Fernet). Nunca se regresan al navegador.
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
- [ ] Invitados por link (token de solo-invitado)
- [ ] Escenas, banners, logo y temas de nombres (como en el prototipo)
- [ ] Comentarios del chat de YouTube y Facebook en pantalla
- [ ] IA: subtítulos en vivo, moderación del chat, resumen, capítulos y clips verticales
- [ ] Biblioteca de grabaciones
