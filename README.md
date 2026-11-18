# Tuki Trading

Aplicación para explorar artículos de Warframe y enviar solicitudes de pedido. Incluye un frontend React con Vite, una API REST con Express y almacenamiento SQLite.

## Funcionalidades

- Catálogo de platino, warframes y armas primarias, secundarias y melé.
- Búsqueda de artículos; en warframes también se pueden explorar piezas y rarezas.
- Selección de artículos para preparar una solicitud, con exclusión entre un artículo completo y sus piezas.
- Formulario para enviar nombre, nickname, forma de pago y artículos.
- Consulta pública del estado del pedido mediante número y código de seguimiento.
- Panel administrativo para iniciar sesión, revisar pedidos paginados, filtrar por estado, consultar métricas, cambiar estados, eliminar pedidos y cambiar la contraseña.
- Registro interno de cambios de estado efectivos y eliminaciones administrativas.

La selección de paquetes de platino se muestra en el catálogo, pero no se envía en el pedido como artículo seleccionado. El formulario envía únicamente los artículos añadidos a la selección.

## Requisitos

- Node.js 22.5 o superior (`node:sqlite` es parte de Node).
- npm.

## Instalación y configuración local

1. Instala las dependencias:

   ```powershell
   npm.cmd install
   ```

2. Copia `.env.example` a `.env` y completa la configuración:

   | Variable | Requerida | Valor local predeterminado | Descripción |
   | --- | --- | --- | --- |
   | `PORT` | No | `3001` | Puerto de la API. |
   | `APP_ORIGIN` | No | `http://localhost:5173` | Origen exacto permitido para solicitudes administrativas que modifican datos. En producción, usa el origen del frontend, sin ruta. |
   | `ADMIN_USERNAME` | Sí | `admin` en el ejemplo | Usuario administrador. |
   | `ADMIN_PASSWORD` | Sí | Debe reemplazarse | Contraseña inicial, de 12 caracteres como mínimo. |
   | `SESSION_SECRET` | Sí | Debe reemplazarse | Secreto para firmar sesiones; debe tener al menos 32 caracteres aleatorios. |
   | `DATABASE_PATH` | No | `server/data/orders.sqlite` | Ruta opcional de la base de datos SQLite. Si se configura, se resuelve como ruta absoluta desde el directorio de trabajo. |

   Usa una contraseña única y un secreto aleatorio. No compartas ni subas `.env`; el archivo está excluido de Git. `.env.example` solo contiene valores de ejemplo.

3. Inicia la API en una terminal:

   ```powershell
   npm.cmd run server
   ```

4. Inicia el frontend en otra terminal:

   ```powershell
   npm.cmd run dev
   ```

5. Abre la dirección local que muestra Vite, normalmente `http://localhost:5173`. Vite reenvía `/api` a `http://localhost:3001`.

La base de datos y sus tablas se crean al iniciar la API. Para ejecutar la API sin el modo de recarga automática de desarrollo, usa `npm.cmd run start:server`.

Si el panel informa que la API respondió sin contenido o presenta un error de conexión, confirma que `npm.cmd run server` siga ejecutándose en otra terminal y que Vite pueda acceder al puerto de API configurado (localmente, `3001`).

## Páginas del frontend

| Ruta | Página |
| --- | --- |
| `/` | Inicio. |
| `/duviri` | Contenido de Duviri. |
| `/catalogo` | Catálogo, búsqueda y selección de productos. |
| `/formulario` | Formulario para enviar una solicitud. |
| `/consultar-pedido` | Consulta del estado con número y código de seguimiento. |
| `/admin` | Panel administrativo. |

La selección de artículos se mantiene en el estado de React mientras se navega dentro de la aplicación; no se guarda en la base de datos hasta enviar el formulario.

## API

Todas las rutas usan el prefijo `/api`. Los cuerpos JSON inválidos responden `400`. La API limita el tamaño de los cuerpos JSON a 25 KB.

### Pedidos públicos

#### Crear un pedido

`POST /api/orders`

Ejemplo de cuerpo:

```json
{
  "realName": "Nombre del cliente",
  "gameNickname": "Nickname",
  "paymentMethod": "Platino",
  "items": [
    {
      "name": "Warframe Prime",
      "category": "Warframes"
    }
  ]
}
```

`paymentMethod` admite `Platino` o `Dinero (COP)`. El nombre real y el nickname deben tener de 1 a 100 caracteres; debe enviarse entre 1 y 100 artículos, cada uno con nombre de hasta 120 caracteres y categoría de hasta 80. Los textos no pueden quedar vacíos después de quitar espacios.

La respuesta `201` contiene `id`, `status`, `createdAt` y `trackingToken`. El identificador y el código se generan al crear el pedido. El código de seguimiento se devuelve una sola vez; la base de datos conserva su hash, no el código original. Guárdalo junto con el identificador.

Una solicitud inválida responde `400`.

#### Consultar el estado

`GET /api/orders/:id/status`

Envía el código en el encabezado `Authorization`, usando el esquema `Bearer` seguido del código de seguimiento.

La respuesta correcta incluye `id`, `status`, `createdAt` y `updatedAt`; no expone los datos personales ni los artículos. Un pedido inexistente, un código incorrecto o un código con formato inválido responden con el mismo `404`.

### Administración

Las rutas administrativas requieren una sesión donde se indique. Inicia sesión enviando el `Origin` exacto configurado en `APP_ORIGIN`; el navegador conserva la cookie de sesión `HttpOnly`. Las rutas administrativas que modifican datos también validan `Origin`.

| Método y ruta | Acceso | Comportamiento |
| --- | --- | --- |
| `POST /api/admin/login` | Público; `Origin` requerido | Inicia sesión. Recibe `username` y `password`; responde `{ "authenticated": true }` o `401` si las credenciales no coinciden. |
| `GET /api/admin/session` | Público | Responde `{ "authenticated": true/false }` según la sesión. |
| `POST /api/admin/logout` | Público; `Origin` requerido | Borra la cookie de sesión si está presente; responde `204`. |
| `POST /api/admin/password` | Sesión y `Origin` requerido | Cambia la contraseña usando `currentPassword` y `newPassword`; responde `{ "passwordChanged": true }`. |
| `GET /api/admin/orders` | Sesión | Lista pedidos paginados y métricas globales del panel. |
| `PATCH /api/admin/orders/:id/status` | Sesión y `Origin` requerido | Cambia el estado del pedido. |
| `DELETE /api/admin/orders/:id` | Sesión y `Origin` requerido | Elimina el pedido y sus artículos relacionados; responde `204`. |

El inicio de sesión recibe JSON con `username` y `password`. El cambio de contraseña recibe:

```json
{
  "currentPassword": "contraseña actual",
  "newPassword": "nueva contraseña de al menos 12 caracteres"
}
```

La actualización de estado recibe, por ejemplo, `{ "status": "En proceso" }`. Para operaciones desde Postman u otro cliente, conserva la cookie emitida al iniciar sesión y envía `Origin` con el valor configurado en `APP_ORIGIN` en las solicitudes que lo requieren.

La contraseña nueva debe tener entre 12 y 128 caracteres, ser distinta de la actual y confirmarse con la contraseña vigente. Las contraseñas se almacenan con hash `scrypt`. La credencial inicial se crea desde `ADMIN_PASSWORD` solo si aún no existe en la base; cambiar esa variable después no reemplaza la contraseña guardada. Un cambio de contraseña incrementa la versión de sesión e invalida las sesiones anteriores.

Las sesiones duran hasta ocho horas. La cookie `tuki_admin_session` usa `HttpOnly` y `SameSite=Strict`; también usa el atributo `Secure` cuando `NODE_ENV=production`.

#### Listado administrativo y paginación

`GET /api/admin/orders?page=1&limit=10&status=Todos`

- `page`: entero positivo, predeterminado `1`.
- `limit`: entero positivo, predeterminado `10`, máximo `50`.
- `status`: opcional; admite `Todos`, `Pendiente`, `En proceso`, `Completado` o `Cancelado`.

La respuesta incluye `data` (pedidos de la página, con `id`, `realName`, `gameNickname`, `paymentMethod`, `status`, `createdAt`, `updatedAt` e `items`, cada uno con `name` y `category`), `pagination` (`page`, `limit`, `total`, `totalPages`) y `summary`. El resumen es global, no se limita a la página ni al filtro, y contiene los totales del mes actual, pedidos activos (`Pendiente` o `En proceso`), completados, cancelados y `chartData`, con `dateKey` y `pedidos` para los últimos siete días. Si se solicita una página posterior a la última, se devuelve la última disponible. Los parámetros no válidos responden `400`.

Ejemplo de respuesta vacía:

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 0,
    "totalPages": 0
  },
  "summary": {
    "thisMonth": 0,
    "active": 0,
    "completed": 0,
    "cancelled": 0,
    "chartData": []
  }
}
```

Los estados permitidos para actualizar un pedido son `Pendiente`, `En proceso`, `Completado` y `Cancelado`. El cambio responde con `id`, `status` y `updatedAt`; un estado inválido devuelve `400` y un pedido inexistente `404`. La eliminación de un pedido inexistente también devuelve `404`. Una sesión ausente o inválida devuelve `401`, y un `Origin` no permitido devuelve `403`.

#### Límites de solicitudes

Los límites se aplican por dirección IP usando el middleware `express-rate-limit`:

- Crear pedidos: 10 solicitudes cada 10 minutos.
- Consultar estado: 30 solicitudes cada 15 minutos; al exceder el límite responde `429`.
- Iniciar sesión o cambiar contraseña: 10 solicitudes cada 15 minutos.

#### Salud de la API

`GET /api/health` responde `200` con `{ "status": "ok" }` cuando la ruta de salud está disponible. Este endpoint comprueba que la API responde; no realiza una prueba integral de lectura y escritura de la base.

### Registro de auditoría administrativa

Los cambios de estado efectivos y las eliminaciones se insertan en `admin_audit_log` dentro de la misma transacción SQLite que modifica el pedido. Cada entrada conserva el usuario administrador, acción (`order.status_changed` o `order.deleted`), ID del pedido, fecha y, para cambios de estado, los valores anterior y nuevo. Un intento fallido no genera entrada; volver a guardar el mismo estado tampoco genera un evento.

El registro no contiene contraseñas, códigos de seguimiento, datos personales ni una copia del pedido eliminado. Actualmente el proyecto no ofrece una ruta de API ni una pantalla para consultar el historial.

## Base de datos

SQLite se guarda por defecto en `server/data/orders.sqlite`:

- `orders`: nombre, nickname, forma de pago, estado, fechas y hash del código de seguimiento.
- `order_items`: artículos asociados; se eliminan al borrar el pedido mediante la relación `ON DELETE CASCADE`.
- `admin_credentials`: hash de contraseña y versión para invalidar sesiones.
- `admin_audit_log`: registro mínimo de acciones administrativas.

El servidor crea las tablas si no existen y añade la columna `tracking_token_hash` a bases anteriores que aún no la tengan. Los pedidos antiguos pueden no disponer de un código de seguimiento, por lo que no se podrán consultar con el flujo público actual.

## Comandos npm

| Comando | Uso |
| --- | --- |
| `npm.cmd install` | Instala dependencias locales. |
| `npm.cmd run dev` | Inicia el frontend Vite en desarrollo. |
| `npm.cmd run server` | Inicia la API con reinicio al detectar cambios. |
| `npm.cmd run start:server` | Inicia la API sin modo watch. |
| `npm.cmd run test:server` | Ejecuta las pruebas de integración de la API. |
| `npm.cmd run lint` | Ejecuta ESLint sobre el proyecto. |
| `npm.cmd run build` | Genera la compilación del frontend en `dist/`. |
| `npm.cmd run preview` | Sirve localmente la compilación de Vite para revisarla. |

## Tecnologías y dependencias

- **React** y **React DOM**: interfaz de usuario.
- **React Router**: navegación entre páginas.
- **Vite**: servidor de desarrollo y compilación del frontend; su configuración reenvía `/api` a Express.
- **Node.js y Express**: servidor HTTP y rutas de la API.
- **SQLite (`node:sqlite`)**: persistencia local síncrona, incluida en Node.js; no es un paquete npm independiente del proyecto.
- **dotenv**: carga variables desde `.env`.
- **express-rate-limit**: límites de solicitudes.
- **Helmet**: encabezados HTTP de seguridad.
- **Framer Motion**: animaciones de interfaz.
- **Lucide React**: iconos.
- **Recharts**: gráficos del panel administrativo.
- **ESLint** y sus complementos: análisis estático del código.
- **Babel, `@rolldown/plugin-babel` y el complemento React Compiler**: transformación del código React durante la compilación.

Las versiones instaladas y los rangos de versión están definidos en `package.json` y fijados para instalaciones reproducibles en `package-lock.json`.

## Pruebas

Ejecuta:

```powershell
npm.cmd run test:server
```

Las pruebas levantan la aplicación en un puerto local temporal y usan una base SQLite temporal que se elimina al terminar. Cubren creación y validación de pedidos, seguimiento, acceso administrativo, cambio de contraseña, protección de origen, actualización y eliminación, paginación, auditoría y fallos de escritura auditada. No necesitan credenciales reales ni modifican la base local del proyecto.

## Integración continua

GitHub Actions ejecuta las pruebas del servidor, ESLint y la compilación del frontend al subir cambios a `main` o abrir/actualizar un Pull Request hacia `main`. El workflow está en `.github/workflows/ci.yml`, usa Ubuntu, Node.js 22 y `npm ci`; no requiere credenciales ni escribe en la base local. Para proteger `main`, configura en GitHub una regla de protección que exija el chequeo `Tests, lint, and build`.

## Estructura del proyecto

```text
src/
  Components/       Páginas, formularios, catálogo y componentes React
  Services/         Datos estáticos de catálogo, piezas y rarezas
  assets/           Recursos importados por el frontend
server/
  config/           Lectura y validación de variables de entorno
  controllers/      Traduce solicitudes HTTP a respuestas
  db/               Conexión y esquema SQLite
  middleware/       Sesión, protección de origen, límites y errores
  repositories/     Consultas SQL y transacciones
  routes/           Métodos HTTP y rutas de la API
  services/         Validaciones y reglas del negocio
  tests/            Pruebas de integración del servidor
  app.js            Configura Express y conecta las rutas
  index.js          Punto de entrada de la API
public/             Recursos públicos servidos por Vite
imagenes-warframe/  Imágenes importadas por el catálogo
.github/workflows/  Automatización CI con GitHub Actions
```
