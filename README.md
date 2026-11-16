# Tuki Trading

Aplicación React con Vite y una API de pedidos hecha en Node.js, Express y SQLite.

## Requisitos

- Node.js 22.5 o superior (`node:sqlite` es parte de Node).
- npm.

## Configuración local

1. Instala dependencias:

   ```powershell
   npm.cmd install
   ```

2. Copia `.env.example` a `.env` y define `ADMIN_USERNAME`, una contraseña única de al menos 12 caracteres y `SESSION_SECRET` con al menos 32 caracteres aleatorios.

3. En una terminal, inicia la API:

   ```powershell
   npm.cmd run server
   ```

4. En otra terminal, inicia React:

   ```powershell
   npm.cmd run dev
   ```

Vite reenvía las solicitudes `/api` a la API local. La base SQLite se crea automáticamente en `server/data/orders.sqlite`.

## API

- `POST /api/orders`: registra una solicitud y sus artículos.
- `POST /api/admin/login`: inicia la sesión administrativa.
- `GET /api/admin/session`: comprueba si hay una sesión activa.
- `POST /api/admin/logout`: cierra la sesión.
- `GET /api/admin/orders`: lista los pedidos (requiere sesión).
- `PATCH /api/admin/orders/:id/status`: actualiza el estado (requiere sesión).
- `GET /api/health`: comprueba que la API está activa.

El panel privado está en `/admin`. El formulario público no necesita login. Las sesiones del administrador usan una cookie `HttpOnly`, y el acceso a la lista y modificación de pedidos está protegido en el servidor.

## Estructura por capas

```text
src/                         Frontend React
  Components/                Pantallas y componentes
  Services/                  Catálogos estáticos del frontend
server/
  config/                    Variables de entorno
  controllers/               Traduce peticiones HTTP a respuestas
  db/                        Conexión y esquema SQLite
  middleware/                Sesión, límites de peticiones y errores
  repositories/              Consultas SQL
  routes/                    Métodos y URLs de la API
  services/                  Validaciones y reglas del negocio
  app.js                     Configura Express y conecta las rutas
  index.js                   Punto de entrada; inicia el servidor
```
