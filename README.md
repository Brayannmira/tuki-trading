# Tuki Trading

Aplicación para explorar artículos de Warframe y enviar solicitudes de pedido. Incluye un frontend React con Vite, una API REST con Express y almacenamiento SQLite.

## Contenido

- [Funciones y recorrido del cliente](#funciones-y-recorrido-del-cliente)
- [Requisitos e instalación](#requisitos-e-instalación-local)
- [Configuración](#configuración)
- [Páginas del frontend](#páginas-del-frontend)
- [API pública](#api-pública)
- [Administración y catálogo](#administración-y-catálogo)
- [Seguridad](#seguridad)
- [Base de datos y respaldos](#base-de-datos-y-respaldos)
- [Comandos npm](#comandos-npm), [pruebas](#pruebas) e [integración continua](#integración-continua)
- [Estructura del proyecto](#estructura-del-proyecto)

## Funcionalidades

- Catálogo de platino, warframes y armas primarias, secundarias y melé.
- Búsqueda por nombre, filtros por tipo, rareza y disponibilidad, orden alfabético, por precio COP ascendente o por popularidad descendente, y favoritos guardados localmente.
- Precio en COP y platino, existencias y disponibilidad configurables para cada producto y pieza.
- Carrito persistente con cantidades, subtotal por artículo y total estimado en la moneda seleccionada.
- Consulta pública del estado del pedido mediante número y código de seguimiento, con una línea de tiempo de los cambios.
- Panel administrativo para iniciar sesión, revisar pedidos paginados, filtrar por estado, consultar métricas, cambiar estados, eliminar pedidos, administrar el catálogo e importar CSV.
- Control de inventario al completar pedidos y validación de existencias antes de aceptar o completar un pedido.
- Descarga manual de copias de seguridad SQLite y registro de auditoría para cambios de estado y eliminaciones.

## Funciones y recorrido del cliente

1. En `/catalogo`, selecciona una categoría. Los paquetes de platino pueden agregarse al formulario; en las demás categorías se pueden buscar productos y, cuando estén disponibles en los datos, filtrar por rareza, estado o tipo. La búsqueda no distingue mayúsculas ni acentos y también encuentra piezas asociadas a Warframes.
2. Usa la estrella para guardar o quitar favoritos. El filtro **Mostrar solo favoritos** reduce la lista a los artículos guardados en ese navegador.
3. En Warframes, abre el detalle para consultar y seleccionar componentes individuales. No se permite añadir un Warframe completo y una de sus piezas al mismo tiempo.
4. Selecciona **Ir al formulario**. El carrito guarda sus artículos y cantidades en `localStorage`, por lo que se conserva al navegar o recargar en el mismo navegador.
5. En `/formulario`, introduce el nombre real, el nickname y la forma de pago (`Platino` o `Dinero (COP)`). Cambia cantidades entre 1 y 99, quita artículos y revisa los subtotales y el total estimado.
6. Al enviar, el servidor valida el catálogo y el inventario, determina los precios guardados en el servidor y crea el pedido. Si el precio de algún artículo no está definido para la moneda elegida, el total queda pendiente por cotizar. El carrito se vacía solo cuando la solicitud se crea correctamente.
7. Guarda el número del pedido y el código de seguimiento mostrados al confirmar. En `/consultar-pedido` puedes consultar el estado y su historial; el código no se vuelve a mostrar.

El catálogo contiene datos estáticos para nombres, categorías, piezas, rarezas e imágenes, mientras que precios, existencias, disponibilidad y popularidad provienen de la API. El orden por precio se habilita cuando la categoría tiene precios configurados; el de popularidad, cuando hay unidades en pedidos completados. Los precios de los paquetes de platino se presentan como sugeridos en la interfaz y deben verificarse antes de usarlos como una lista comercial definitiva.

El proyecto no consulta precios de mercado externos. Los artículos sin registro administrado aparecen con precio o existencias por confirmar; carga los datos reales desde Administración cuando estén disponibles.

## Requisitos e instalación local

- Node.js 22.16 o superior (se usa `node:sqlite` y su API de respaldo).
- npm.

### Instalación

1. Instala las dependencias del proyecto:

   ```powershell
   npm.cmd install
   ```

2. Copia `.env.example` como `.env` y completa la [configuración](#configuración):

   ```powershell
   Copy-Item .env.example .env
   ```

3. Inicia la API en una terminal:

   ```powershell
   npm.cmd run server
   ```

4. Inicia el frontend en otra terminal:

   ```powershell
   npm.cmd run dev
   ```

5. Abre la dirección local indicada por Vite, normalmente `http://localhost:5173`.

Vite reenvía `/api` a `http://localhost:3001`. La API crea el directorio de datos, la base SQLite y el esquema al iniciar. `npm.cmd run server` reinicia el proceso cuando detecta cambios; `npm.cmd run start:server` ejecuta la API sin el modo watch.

Si aparece un error de conexión, confirma que la API siga ejecutándose, que `PORT` coincida con el proxy configurado en `vite.config.js` y que `APP_ORIGIN` coincida exactamente con el origen del frontend.

## Configuración

El archivo `.env.example` contiene los nombres y valores de ejemplo. Copia ese archivo como `.env` en la raíz y reemplaza las credenciales de ejemplo:

| Variable | Requerida | Valor local predeterminado | Descripción |
| --- | --- | --- | --- |
| `PORT` | No | `3001` | Puerto de la API. |
| `APP_ORIGIN` | No | `http://localhost:5173` | Origen exacto permitido para solicitudes administrativas que modifican datos. En producción, usa el origen del frontend, sin ruta. |
| `ADMIN_USERNAME` | Sí | `admin` en el ejemplo | Usuario administrador. |
| `ADMIN_PASSWORD` | Sí | Debe reemplazarse | Contraseña inicial, de 12 caracteres como mínimo. |
| `SESSION_SECRET` | Sí | Debe reemplazarse | Secreto para firmar sesiones; debe tener al menos 32 caracteres aleatorios. |
| `DATABASE_PATH` | No | `server/data/orders.sqlite` | Ruta opcional de la base de datos SQLite. Si se configura, se resuelve como ruta absoluta desde el directorio de trabajo. |

Usa una contraseña única y un secreto aleatorio. No compartas ni subas `.env`; contiene credenciales y debe permanecer fuera del control de versiones. El servidor detiene el arranque si faltan `ADMIN_USERNAME`, `ADMIN_PASSWORD` o `SESSION_SECRET`, si la contraseña tiene menos de 12 caracteres o si el secreto tiene menos de 32. Cambiar `ADMIN_PASSWORD` después de que ya existe la credencial en SQLite no cambia la contraseña guardada; utiliza el cambio de contraseña del panel.

Puedes generar un secreto desde PowerShell con Node:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Configura `NODE_ENV=production` en el entorno del servidor para activar la cookie `Secure` y el límite de inicio de sesión más estricto. No uses las credenciales de `.env.example` en un despliegue real.

## Páginas del frontend

| Ruta | Página |
| --- | --- |
| `/` | Inicio. |
| `/duviri` | Contenido de Duviri. |
| `/catalogo` | Catálogo, búsqueda y selección de productos. |
| `/formulario` | Formulario para enviar una solicitud. |
| `/consultar-pedido` | Consulta del estado con número y código de seguimiento. |
| `/admin` | Panel administrativo. |

El carrito se guarda con la clave `tuki-trading-cart` y los favoritos con `tuki-trading-favorites` en el almacenamiento local del navegador. No se sincronizan entre dispositivos, perfiles o navegadores y no sustituyen el registro persistido del pedido. Si el navegador bloquea o borra `localStorage`, el carrito y favoritos pueden perderse.

## API pública

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
      "id": "warframes:Warframe Prime",
      "name": "Warframe Prime",
      "category": "Warframes",
      "quantity": 1
    }
  ]
}
```

`paymentMethod` admite `Platino` o `Dinero (COP)`. El nombre real y el nickname deben tener de 1 a 100 caracteres; debe enviarse entre 1 y 100 artículos, cada uno con nombre de hasta 120 caracteres y categoría de hasta 80. `id` es opcional para compatibilidad con clientes anteriores y, si se envía, debe tener hasta 180 caracteres; la cantidad, si se envía, debe ser un entero entre 1 y 99. Los textos no pueden quedar vacíos después de quitar espacios. Para un ID de catálogo existente, el servidor rechaza artículos con estado `Agotado` o cantidad mayor a las existencias conocidas y obtiene los precios del catálogo, sin confiar en precios del navegador. Los demás estados se muestran como información y no impiden por sí solos crear el pedido.

La respuesta `201` contiene `id`, `status`, `createdAt`, `trackingToken`, `currency` y `totalAmount`. `id` es un UUID generado por el servidor. Si algún artículo no tiene precio configurado en la moneda elegida, `totalAmount` es `null` y queda pendiente por cotizar. El código de seguimiento se genera a partir de 32 bytes aleatorios, se presenta como 43 caracteres Base64URL y se devuelve una sola vez; la base de datos conserva su hash SHA-256, no el código original. Guárdalo junto con el identificador.

Ejemplo de respuesta (los identificadores y token se generan en cada solicitud):

```json
{
  "id": "id-generado",
  "status": "Pendiente",
  "createdAt": "2026-01-01T12:00:00.000Z",
  "trackingToken": "token-de-seguimiento-de-un-solo-uso",
  "currency": "COP",
  "totalAmount": 24000
}
```

El total se calcula en el servidor a partir de los precios vigentes al crear el pedido y las cantidades. Los precios unitarios COP y platino quedan copiados en cada artículo del pedido; cambios futuros del catálogo no modifican esa cotización histórica. Una solicitud inválida responde `400`; si el artículo está agotado o la cantidad supera las existencias conocidas, responde `409`.

#### Consultar el estado

`GET /api/orders/:id/status`

Envía el código en el encabezado `Authorization`, con el formato `Bearer <código-de-43-caracteres>`.

La respuesta correcta incluye `id`, `status`, `createdAt`, `updatedAt` e `history`, con cada estado y fecha de cambio. No expone los datos personales ni los artículos. Un pedido inexistente, un código incorrecto o un código con formato inválido responden con el mismo `404`.

Ejemplo de respuesta:

```json
{
  "id": "id-generado",
  "status": "En proceso",
  "createdAt": "2026-01-01T12:00:00.000Z",
  "updatedAt": "2026-01-02T09:30:00.000Z",
  "history": [
    { "status": "Pendiente", "changedAt": "2026-01-01T12:00:00.000Z" },
    { "status": "En proceso", "changedAt": "2026-01-02T09:30:00.000Z" }
  ]
}
```

#### Catálogo público

`GET /api/catalog` devuelve los artículos con `id`, `name`, `category`, `priceCop`, `pricePlatinum`, `stockQuantity`, `availability`, `updatedAt` y `popularity`. Los precios y las existencias pueden ser `null` mientras no se hayan confirmado. La popularidad corresponde al total de unidades en pedidos completados.

Valores permitidos para `availability`: `Disponible`, `En Bóveda`, `Oferta Especial`, `Agotado` y `Por confirmar`. `stockQuantity: null` significa que no se conoce o no se administra el inventario; `stockQuantity: 0` significa que no hay existencias. Los IDs son claves estables del catálogo, por ejemplo `warframes:Ash Prime` o `warframes:Chasis de Ash Prime`; los clientes deben usar el ID retornado por esta ruta.

Ejemplo de producto:

```json
{
  "id": "warframes:Ash Prime",
  "name": "Ash Prime",
  "category": "Warframes",
  "priceCop": 12000,
  "pricePlatinum": 20,
  "stockQuantity": 5,
  "availability": "Disponible",
  "updatedAt": "2026-01-01T12:00:00.000Z",
  "popularity": 3
}
```

Una conexión fallida al endpoint no impide cargar el contenido estático del catálogo, pero no se podrán mostrar precios, cantidades ni disponibilidad actualizados.

## Administración y catálogo

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
| `GET /api/admin/catalog` | Sesión | Consulta el catálogo para administración. |
| `PATCH /api/admin/catalog/:id` | Sesión y `Origin` requerido | Actualiza los precios, existencias y disponibilidad de un artículo. |
| `POST /api/admin/catalog/import` | Sesión y `Origin` requerido | Importa hasta 100 artículos por lote desde datos JSON. |
| `POST /api/admin/backup` | Sesión y `Origin` requerido | Crea y descarga una copia SQLite. |

El panel permite editar artículos individualmente y descargar una plantilla CSV con el catálogo. La plantilla incluye `id`, `name`, `category`, `type`, `rarity`, `priceCop`, `pricePlatinum`, `stockQuantity` y `availability`; los campos `type` y `rarity` son informativos, mientras que los precios, existencias y disponibilidad se importan. Los precios y las existencias pueden dejarse vacíos para indicar que no están confirmados. La interfaz envía lotes de 25 artículos (máximo 100 por solicitud); si falla un lote posterior, el panel informa cuántos ya se guardaron.

Al marcar un pedido como `Completado`, el servidor descuenta del inventario las cantidades solicitadas dentro de la misma transacción; si no hay existencias suficientes, responde `409` y conserva el pedido sin completar. Al cambiar un pedido completado a otro estado, restaura las unidades. La selección de un pedido no reserva inventario antes de completarlo.

### Uso del panel

1. Abre `/admin` y autentícate con `ADMIN_USERNAME` y la contraseña inicial configurada, o con la contraseña vigente almacenada en la base.
2. En la administración de pedidos, filtra por estado, revisa el detalle de artículos, cantidades, moneda y total; navega entre páginas y cambia el estado.
3. En **Catálogo e inventario**, busca por nombre, categoría, tipo o rareza. La lista muestra 30 artículos por página; abre un artículo para editar precio COP, precio en platino, existencias y disponibilidad, y guarda los cambios.
4. Para actualizar muchos registros, descarga la plantilla del panel, completa sus valores e impórtala. Comprueba el mensaje final: si un lote falla después de otros exitosos, los lotes previos ya quedaron aplicados.
5. Descarga una copia de seguridad antes de cambios importantes y almacénala fuera del servidor.
6. Cambia la contraseña desde el panel cuando sea necesario. Al hacerlo, se invalida la sesión actual y será necesario iniciar sesión de nuevo.

### Edición e importación del catálogo

`PATCH /api/admin/catalog/:id` recibe los campos que se guardan (el ID se toma de la ruta):

```json
{
  "name": "Ash Prime",
  "category": "Warframes",
  "priceCop": 12000,
  "pricePlatinum": 20,
  "stockQuantity": 5,
  "availability": "Disponible"
}
```

`priceCop` y `pricePlatinum` aceptan enteros entre 0 y 1.000.000.000 o `null`; `stockQuantity` acepta enteros de 0 a 1.000.000 o `null`. El nombre debe tener hasta 120 caracteres, la categoría hasta 80 y el ID hasta 180. La disponibilidad debe ser una de las cinco opciones listadas en la sección de [catálogo público](#catálogo-público). Un dato inválido responde `400`.

La operación es un `upsert`: crea un registro si el ID no existe o reemplaza sus campos si ya existe. Para que el artículo aparezca asociado a las tarjetas del frontend, utiliza un ID de la plantilla del catálogo; un ID inventado no crea por sí mismo una tarjeta visual.

La importación directa por API usa `POST /api/admin/catalog/import`:

```json
{
  "products": [
    {
      "id": "warframes:Ash Prime",
      "name": "Ash Prime",
      "category": "Warframes",
      "priceCop": 12000,
      "pricePlatinum": 20,
      "stockQuantity": 5,
      "availability": "Disponible"
    }
  ]
}
```

La respuesta correcta indica `importedCount`. Cada lote debe contener de 1 a 100 registros, sin IDs repetidos, y se valida completo antes de guardarse en una transacción. La importación es un `upsert`: crea el ID si no existe o reemplaza sus datos si ya existe.

Para usar la plantilla CSV del panel:

- Guárdala como CSV UTF-8 delimitado por comas. El importador no acepta archivos delimitados por punto y coma.
- Conserva los valores de la columna `id`; el frontend utiliza esos IDs para asociar precios e inventario con los artículos.
- Las columnas requeridas son `id`, `name`, `category`, `priceCop`, `pricePlatinum` y `stockQuantity`. `availability` es opcional; si se omite o queda vacío, se importa como `Por confirmar`.
- `type` y `rarity` describen el catálogo visual; no se guardan en la tabla de inventario ni se usan para fijar precios.
- Para precios y existencias, deja la celda vacía para enviar `null`. Usa enteros sin separadores de miles ni decimales (por ejemplo, `12000`, no `12.000`).
- Cada disponibilidad debe coincidir exactamente con `Disponible`, `En Bóveda`, `Oferta Especial`, `Agotado` o `Por confirmar`.
- Los encabezados no distinguen mayúsculas/minúsculas ni espacios y guiones bajos, pero deben representar el nombre de la columna. El archivo debe tener encabezado y al menos una fila con datos.
- El navegador divide el archivo en grupos de 25 y muestra el número de artículos guardados. Un error en un grupo no revierte los grupos anteriores.

Ejemplo de fila:

```csv
"id","name","category","type","rarity","priceCop","pricePlatinum","stockQuantity","availability"
"warframes:Ash Prime","Ash Prime","Warframes","Prime","","12000","20","5","Disponible"
```

El inicio de sesión recibe JSON con `username` y `password`. El cambio de contraseña recibe:

```json
{
  "currentPassword": "contraseña actual",
  "newPassword": "nueva contraseña de al menos 12 caracteres"
}
```

La actualización de estado recibe, por ejemplo, `{ "status": "En proceso" }`. Para operaciones desde Postman u otro cliente, conserva la cookie emitida al iniciar sesión y envía `Origin` con el valor configurado en `APP_ORIGIN` en las solicitudes que lo requieren.

La contraseña nueva debe tener entre 12 y 128 caracteres, ser distinta de la actual y confirmarse con la contraseña vigente. Las contraseñas se almacenan con hash `scrypt`. La credencial inicial se crea desde `ADMIN_PASSWORD` solo si aún no existe en la base; cambiar esa variable después no reemplaza la contraseña guardada. Un cambio de contraseña incrementa la versión de sesión e invalida las sesiones anteriores.

Las sesiones duran hasta ocho horas. La cookie `tuki_admin_session` usa `HttpOnly` y `SameSite=Strict`; también usa el atributo `Secure` cuando `NODE_ENV=production`. La API administrativa envía `Cache-Control: no-store`; el límite de inicio de sesión/cambio de contraseña es 10 solicitudes cada 15 minutos en desarrollo y 5 en producción.

Para clientes externos, envía el `Origin` exacto en las operaciones protegidas y conserva la cookie de sesión entre solicitudes. No copies credenciales o cookies en repositorios, reportes o registros públicos. En el navegador, el panel gestiona la cookie automáticamente.

#### Listado administrativo y paginación

`GET /api/admin/orders?page=1&limit=10&status=Todos`

- `page`: entero positivo, predeterminado `1`.
- `limit`: entero positivo, predeterminado `10`, máximo `50`.
- `status`: opcional; admite `Todos`, `Pendiente`, `En proceso`, `Completado` o `Cancelado`.

La respuesta contiene:

- `data`: pedidos de la página con `id`, `realName`, `gameNickname`, `paymentMethod`, `status`, `totalAmount`, `currency`, `createdAt`, `updatedAt` e `items`.
- Cada artículo incluye `productId`, `name`, `category`, `quantity`, `unitPriceCop` y `unitPricePlatinum`. Los precios unitarios pueden ser `null` si no estaban configurados al crear el pedido.
- `pagination`: `page`, `limit`, `total` y `totalPages`.
- `summary`: métricas globales no limitadas por la página ni el filtro: pedidos creados en el mes (`thisMonth`), activos (`active`, estados `Pendiente` o `En proceso`), completados, cancelados y `chartData` para los últimos siete días (`dateKey` y cantidad `pedidos`).

Si se solicita una página posterior a la última, se devuelve la última disponible. Los parámetros no válidos responden `400`.

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

Los estados permitidos para actualizar un pedido son `Pendiente`, `En proceso`, `Completado` y `Cancelado`. El cambio responde con `id`, `status` y `updatedAt`; un estado inválido devuelve `400` y un pedido inexistente `404`. Un cambio a `Completado` con inventario insuficiente devuelve `409` sin actualizar el estado ni descontar unidades. Reenviar el estado actual no duplica el historial ni el evento de auditoría.

La eliminación de un pedido inexistente devuelve `404`; al borrar uno existente, SQLite elimina también sus artículos e historial mediante `ON DELETE CASCADE`, y se registra la acción administrativa. La eliminación de un pedido completado no restituye automáticamente su inventario. Una sesión ausente o inválida devuelve `401`, y un `Origin` no permitido devuelve `403`.

#### Respuestas de error

| HTTP | Significado habitual |
| --- | --- |
| `400` | JSON inválido, campos fuera de formato, estado o parámetros de paginación no válidos. |
| `401` | Credenciales incorrectas o sesión administrativa ausente/expirada. |
| `403` | `Origin` ausente o diferente del configurado para la operación. |
| `404` | Pedido no encontrado o credenciales de seguimiento inválidas. |
| `409` | Existencias insuficientes para aceptar/completar un pedido. |
| `429` | Se superó el límite de solicitudes. |
| `500` | Error interno no esperado; la respuesta no incluye detalles internos. |

Cuando una ruta devuelve un error JSON, su forma es `{ "error": "..." }`. Los cuerpos JSON están limitados a 25 KB por Express.

#### Límites de solicitudes

Los límites se aplican por dirección IP usando el middleware `express-rate-limit`:

- Crear pedidos: 10 solicitudes cada 10 minutos.
- Consultar estado: 30 solicitudes cada 15 minutos; al exceder el límite responde `429`.
- Iniciar sesión o cambiar contraseña: 10 solicitudes cada 15 minutos en desarrollo y 5 en producción.

Los límites se aplican por dirección IP con `express-rate-limit`. En despliegues con varios servidores detrás de un proxy, revisa la configuración del proxy y de `trust proxy` antes de usar la IP del cliente para límites; no se configura automáticamente en esta aplicación.

#### Salud de la API

`GET /api/health` responde `200` con `{ "status": "ok" }` cuando la ruta de salud está disponible. Este endpoint comprueba que la API responde; no realiza una prueba integral de lectura y escritura de la base.

## Seguridad

- Helmet agrega encabezados de seguridad y Express no expone el encabezado `X-Powered-By`.
- Las contraseñas se guardan mediante `scrypt`; nunca se almacena el texto de la contraseña. Las sesiones son tokens firmados con HMAC-SHA-256, tienen vencimiento de ocho horas y se comparan de forma segura.
- La cookie administrativa es `HttpOnly`, `SameSite=Strict`, limitada a `/` y `Secure` cuando `NODE_ENV=production`. El navegador no expone el token de sesión a JavaScript ni lo guarda en `localStorage`.
- Cada solicitud de administración requiere una sesión válida, excepto los endpoints públicos de inicio/cierre de sesión y consulta de sesión. Las escrituras administrativas también verifican que `Origin` coincida con `APP_ORIGIN`.
- Todas las rutas `/api/admin` responden con `Cache-Control: no-store`; los cuerpos JSON tienen un límite de 25 KB.
- Las rutas de pedidos e inicio de sesión/cambio de contraseña tienen límites por IP. Si la API se coloca detrás de un proxy inverso, configura el proxy y la confianza de IP de manera explícita y segura antes de basar los límites en la dirección del cliente.

### Recomendaciones para producción

1. Define `NODE_ENV=production`, usa HTTPS y configura `APP_ORIGIN` como el origen público exacto del frontend.
2. Usa secretos aleatorios y únicos para `ADMIN_PASSWORD` y `SESSION_SECRET`; guarda `.env` en el sistema de secretos del proveedor, nunca en el repositorio.
3. Sirve el frontend y enruta `/api` hacia Express mediante el proxy/reverse proxy del despliegue. Esta aplicación no configura CORS para un frontend en otro origen.
4. Usa almacenamiento persistente para `DATABASE_PATH`; si el contenedor o servidor se reemplaza sin preservar su disco, se perderán pedidos y catálogo.
5. Descarga y guarda fuera del servidor las copias de seguridad. Las siete copias conservadas por la aplicación son una rotación local, no una estrategia de recuperación ante la pérdida completa del servidor.
6. Cambia las credenciales de ejemplo y limita el acceso operativo a `/admin` y a los archivos de respaldo.

### Registro de auditoría administrativa

Los cambios de estado efectivos y las eliminaciones se insertan en `admin_audit_log` dentro de la misma transacción SQLite que modifica el pedido. Cada entrada conserva el usuario administrador, acción (`order.status_changed` o `order.deleted`), ID del pedido, fecha y, para cambios de estado, los valores anterior y nuevo. Un intento fallido no genera entrada; volver a guardar el mismo estado tampoco genera un evento.

El registro no contiene contraseñas, códigos de seguimiento, datos personales ni una copia del pedido eliminado. Los cambios de precio/inventario no se agregan a este registro. Actualmente no hay una ruta de API ni una pantalla para consultar la auditoría.

## Base de datos y respaldos

SQLite se guarda por defecto en `server/data/orders.sqlite`; `DATABASE_PATH` puede reemplazar esa ubicación. La base está pensada para una instancia de la API con almacenamiento persistente. No borres ni edites el archivo mientras el servidor lo está usando.

| Tabla | Contenido |
| --- | --- |
| `orders` | Identificador, hash del token de seguimiento, datos de contacto, forma de pago, estado, moneda, total y fechas. |
| `order_items` | Artículos, IDs del catálogo cuando están disponibles, cantidades y precios unitarios COP/platino copiados al crear el pedido. |
| `catalog_products` | IDs, nombres, categorías, precios, existencias, disponibilidad y fecha de actualización. |
| `order_status_history` | Estado inicial y cada cambio real de estado, ordenados por fecha. |
| `admin_credentials` | Hash `scrypt` de la contraseña y versión de sesión. |
| `admin_audit_log` | Usuario administrador, tipo de acción, entidad, detalles mínimos y fecha. |

`popularity` se calcula con las cantidades de `order_items` de pedidos cuyo estado actual es `Completado`; no es una columna editable del catálogo. La aplicación crea las tablas e índices al iniciar y añade las columnas nuevas que falten en bases anteriores. Los pedidos existentes sin historial reciben una entrada inicial con su estado y fecha actuales. Los pedidos históricos que no tienen hash de token no pueden consultarse con el flujo público actual.

Los paquetes de platino se insertan al iniciar si todavía no existen sus IDs (`INSERT OR IGNORE`): 100 platinos por COP 12.000, 250 por COP 22.000 y 600 por COP 50.000. Esos valores son sugeridos y pueden editarse desde el panel; el precio en platino y las existencias comienzan sin confirmar. El sembrado no reemplaza valores que ya se hayan guardado.

### Descargar y restaurar respaldos

El botón de respaldo del panel llama a `POST /api/admin/backup`. La API crea una copia consistente con la utilidad SQLite de Node en el directorio `backups/` al lado del archivo de base de datos y la devuelve como descarga. El servidor conserva las siete copias más recientes que coinciden con su patrón de nombres.

La creación/descarga es manual; no hay una tarea programada ni almacenamiento remoto. Descarga periódicamente el archivo y guárdalo de forma segura fuera del servidor. La copia contiene datos personales de pedidos y hashes de credenciales, así que debe protegerse como la base original.

Para restaurar una copia local:

1. Detén la API y conserva una copia del archivo SQLite actual antes de reemplazarlo.
2. Copia el respaldo elegido a la ruta configurada en `DATABASE_PATH` (o a `server/data/orders.sqlite` si no configuraste esa variable).
3. Confirma los permisos del archivo y vuelve a iniciar la API.
4. Verifica `/api/health`, inicia sesión en `/admin` y comprueba pedidos y catálogo.

No copies un respaldo encima de una base que el proceso tenga abierta. Para restauración en producción, sigue el procedimiento de mantenimiento del entorno y verifica también que el archivo restaurado tenga permisos adecuados.

## Producción

Para ejecutar el proyecto completo desde Express:

```powershell
npm.cmd run build
$env:NODE_ENV="production"
npm.cmd run start:server
```

Express sirve `dist/` y todas las rutas de React en producción. `/api` continúa siendo atendido por la API.

## Comandos npm

| Comando | Uso |
| --- | --- |
| `npm.cmd install` | Instala dependencias locales. |
| `npm.cmd run dev` | Inicia el frontend Vite en desarrollo. |
| `npm.cmd run server` | Inicia la API con reinicio al detectar cambios. |
| `npm.cmd run start:server` | Inicia la API sin modo watch. |
| `npm.cmd run test:server` | Ejecuta las pruebas de integración de la API. |
| `npm.cmd run test:frontend` | Ejecuta las pruebas de componentes React con Vitest y Testing Library. |
| `npm.cmd run test:e2e` | Ejecuta el flujo de pedido en Chromium de escritorio y móvil con Playwright. |
| `npm.cmd test` | Ejecuta las pruebas del servidor y del frontend. |
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

Las pruebas levantan la aplicación en un puerto local temporal y usan una base SQLite temporal que se elimina al terminar. Cubren creación y validación de pedidos, precios e inventario, seguimiento e historial, acceso administrativo, cambio de contraseña, protección de origen, actualización y eliminación, paginación, auditoría e integridad de respaldos. No necesitan credenciales reales ni modifican la base local del proyecto.

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
