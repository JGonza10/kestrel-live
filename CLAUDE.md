# Kestrel Live — guía para Claude

- Responde siempre en **español (México)**, con explicaciones simples y ejemplos prácticos.
- Stack: Flask + SQLAlchemy + PostgreSQL (`backend/`), React + Vite (`frontend/`), LiveKit + Egress en Docker (`docker-compose.yml`).
- Marca Kestrel: usa los tokens de `frontend/src/theme.css`. El diseño de referencia está en `docs/prototipo/*.dc.html` y los hallazgos de StreamYard en `docs/streamyard-ingenieria-inversa.md`.
- Seguridad (no negociable):
  - Toda ruta nueva de `/api` lleva `@login_required`, salvo las de login.
  - Valida cada entrada y usa solo consultas parametrizadas, nada de SQL armado con texto.
  - Ningún secreto va en el código: van en `.env`.
  - Las claves de transmisión se cifran con `encrypt()`.
  - Al usuario nunca le muestres errores técnicos.
- Toda pantalla debe funcionar a 375 px de ancho; botones y campos de al menos 44 px de alto.
- Antes de terminar un cambio, corre `cd backend && python -m pytest -q` y `cd frontend && npm run build`. Agrega pruebas para lo nuevo.
- Commits con mensajes claros; usa una rama por feature.
