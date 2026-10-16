# StreamYard → Kestrel Live: hallazgos de ingeniería inversa (15 oct 2026)

Revisión de la cuenta propia de Gonza en StreamYard, que está en el plan gratuito (con oferta para pasar a Advanced).
Prototipo visual (Claude Design): https://claude.ai/artifact/34EDaWG54JCRH8zBAtK2md

## Panel (dashboard)
- Menú lateral: Inicio, Biblioteca, Destinos, Miembros. Abajo: medidor de "Clips de IA" (0/2 generaciones) y de Almacenamiento (24 s de 5 h).
- Selector de tema: automático, claro y oscuro.
- Crear: Transmisión en vivo (+10 destinos), Grabación (sin salir en vivo), Seminario web On-Air.
- Estudios: pestañas Activos y Usados. Tabla con título, fecha de inicio, duración y botón "Ver".
- Destinos: YouTube, Facebook, LinkedIn, X, Twitch, Instagram Live, Kick, Vimeo, Brightcove, Hopin y Otras plataformas (RTMP). Pestaña aparte "Reutilizar".
- Detalle de video: reproductor; botones Descargar / Editar / Generar clips; pestañas Clips de IA, Grabaciones locales y Ediciones. Los clips de IA requieren una grabación de entre 30 s y 6 h.

## Estudio
- Barra superior: logo, título, "Agregar destino" con íconos de redes y botón Grabar (o Salir en vivo).
- Panel de escenas a la izquierda (se puede plegar). Lienzo a 720p en el plan gratis.
- 8 diseños: Individual, Ligero, Grupo, Líder, Pantalla pequeña, Pantalla grande, Imagen en imagen y Pantalla completa. Además: Editar diseño, Nuevo diseño y Gestionar layouts.
- Fila de participantes (tras bastidores) con la tarjeta "Presentar o invitar".
- Controles: mic, cámara, presentar, agregar invitados, teleprompter (con insignia de IA), configuración y salir.
- Riel lateral derecho: Comentarios, Banners, Activos multimedia, Estilo, Widgets, Notas, Personas, Chat privado y Grabación.
  - Estilo: marcas preestablecidas, color de marca, tema (Bubble, Classic, Minimal, Block), mostrar nombres y títulos, tamaño de texto.
  - Widgets: encuestas y código QR.
  - Banners: se agrupan en carpetas y se reordenan arrastrando.
- Sin cámara ni micrófono se puede entrar con "Únete sin micrófono/cámara".

## Diferenciadores de Kestrel Live (prototipo)
- Subtítulos en vivo y traducción, moderación del chat con IA, pregunta destacada y encuesta sugerida por IA.
- Al terminar: resumen, capítulos y clips verticales sin límite, porque corren en local, y publicación en varias redes a la vez.

## Marca Kestrel (tokens tomados de kestrel-ia.up.railway.app)
- accent #C9702F · accent-strong #A85A22 · accent-tint #F3E2D2
- navy #1F3A4D · ok #3D8361
- bg #F4F5F7 · surface #FFFFFF · surface-2 #ECEEF2 · border #DBDFE6
- text #171A21 · text-muted #5B6272
- Títulos: Georgia (serif) · Texto: system-ui

## Ficha del proyecto
- **Nombre:** Kestrel Live. Estudio de transmisión en vivo y grabación multidestino con IA, de uso propio.
- **Stack:** Flask + React + PostgreSQL. LiveKit (servidor WebRTC + Egress para RTMP y grabación) corriendo en Docker en la laptop. No se usa Railway porque es solo para pruebas locales.
- **Funcionalidades clave (MVP):**
  1. Estudio con invitados por link, escenas, diseños, banners y logo.
  2. Transmitir por RTMP a YouTube, Facebook, LinkedIn, Instagram, TikTok y otros (pegando la clave de transmisión).
  3. Grabación local y biblioteca de videos.
  4. IA: subtítulos en vivo y, al terminar, resumen y clips.
- **Punto de partida:** desde cero; solo existe el prototipo visual.
- **Entrega esperada:** primero el scaffold del MVP (estudio + 1–2 destinos), después las funciones de IA.

Nota: se creó en la cuenta el estudio de prueba "Prueba Kestrel" (grabación, sin transmitir) para revisar la interfaz. Se puede borrar.
