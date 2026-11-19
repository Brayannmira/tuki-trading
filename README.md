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
- Portal opcional de clientes con acceso por código temporal de correo, perfil básico, historial de pedidos y consulta de estados sin el código de seguimiento.
- Panel administrativo con cuentas individuales, roles, segundo factor TOTP, gestión de pedidos y catálogo, e importación CSV.
- Control de inventario al completar pedidos y validación de existencias antes de aceptar o completar un pedido.
- Registro de auditoría consultable para cambios de pedidos, precios, inventario y cuentas administrativas; las copias SQLite solo están disponibles para el propietario.

## Funciones y recorrido del cliente

1. En `/catalogo`, selecciona una categoría. Los paquetes de platino pueden agregarse al formulario; en las demás categorías se pueden buscar productos y, cuando estén disponibles en los datos, filtrar por rareza, estado o tipo. La búsqueda no distingue mayúsculas ni acentos y también encuentra piezas asociadas a Warframes.
2. Usa la estrella para guardar o quitar favoritos. El filtro **Mostrar solo favoritos** reduce la lista a los artículos guardados en ese navegador.
3. En Warframes, abre el detalle para consultar y seleccionar componentes individuales. No se permite añadir un Warframe completo y una de sus piezas al mismo tiempo.
4. Selecciona **Ir al formulario**. El carrito guarda sus artículos y cantidades en `localStorage`, por lo que se conserva al navegar o recargar en el mismo navegador.
5. En `/formulario`, introduce el nombre real, el nickname y la forma de pago (`Platino` o `Dinero (COP)`). Cambia cantidades entre 1 y 99, quita artículos y revisa los subtotales y el total estimado.
6. Al enviar, el servidor valida el catálogo y el inventario, determina los precios guardados en el servidor y crea el pedido. Si el precio de algún artículo no está definido para la moneda elegida, el total queda pendiente por cotizar. El carrito se vacía solo cuando la solicitud se crea correctamente.
7. Guarda el número del pedido y el código de seguimiento mostrados al confirmar. En `/consultar-pedido` puedes consultar el estado y su historial; el código no se vuelve a mostrar.
8. En `/mi-cuenta`, verifica el correo usado en tus pedidos con un código temporal, guarda tu nickname del juego y consulta el historial y los avisos de estado. Al iniciar sesión, esos datos se sugieren en el formulario. El registro como cliente es opcional; el flujo de pedidos como invitado se conserva.

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
| `ADMIN_MFA_ENCRYPTION_KEY` | Recomendado | Vacío; usa `SESSION_SECRET` | Clave estable de al menos 32 caracteres para cifrar secretos TOTP en SQLite. No la rotes sin restablecer el segundo factor de las cuentas. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Para enviar correos | Sin configurar | Servidor y credenciales SMTP. Si configuras SMTP, completa todos estos valores. |
| `SMTP_SECURE` | No | `false` cuando se configura SMTP | Usa `true` para TLS implícito, normalmente puerto 465; usa `false` para STARTTLS, normalmente puerto 587. |
| `DATABASE_PATH` | No | `server/data/orders.sqlite` | Ruta opcional de la base de datos SQLite. Si se configura, se resuelve como ruta absoluta desde el directorio de trabajo. |

Usa una contraseña única y secretos aleatorios. No compartas ni subas `.env`; contiene credenciales y debe permanecer fuera del control de versiones. El servidor detiene el arranque si faltan `ADMIN_USERNAME`, `ADMIN_PASSWORD` o `SESSION_SECRET`, si la contraseña tiene menos de 12 caracteres o si un secreto configurado tiene menos de 32. En producción, configura `ADMIN_MFA_ENCRYPTION_KEY` como un secreto estable e independiente; si no se define, se deriva de `SESSION_SECRET`. Si configuras SMTP, completa todas las variables SMTP requeridas; el servidor valida el puerto y `SMTP_SECURE`. Sin SMTP configurado, los pedidos se pueden crear, pero los avisos quedan pendientes, el panel permite reintentarlos y el acceso de clientes por correo responde `503` hasta que SMTP esté disponible. Cambiar `ADMIN_PASSWORD` después de que ya existe la cuenta inicial en SQLite no cambia su contraseña; utiliza el cambio de contraseña del panel.

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
| `/mi-cuenta` | Acceso por correo e historial privado de pedidos. |
| `/admin` | Panel administrativo. |

El carrito se guarda con la clave `tuki-trading-cart` y los favoritos con `tuki-trading-favorites` en el almacenamiento local del navegador. No se sincronizan entre dispositivos, perfiles o navegadores y no sustituyen el registro persistido del pedido. Si el navegador bloquea o borra `localStorage`, el carrito y favoritos pueden perderse.

## API pública

Todas las rutas usan el prefijo `/api`. Los cuerpos JSON inválidos responden `400`. El límite general de los cuerpos JSON es 25 KB; la ruta administrativa de importación del catálogo admite hasta 1 MB.

### Pedidos públicos

#### Crear un pedido

`POST /api/orders`

Ejemplo de cuerpo:

```json
{
  "realName": "Nombre del cliente",
  "gameNickname": "Nickname",
  "email": "cliente@example.com",
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

`paymentMethod` admite `Platino` o `Dinero (COP)`. El nombre real y el nickname deben tener de 1 a 100 caracteres; `email` es obligatorio, debe tener formato válido y no puede superar 254 caracteres. Si la solicitud incluye una sesión de cliente válida, el servidor usa el correo verificado de la cuenta en lugar del correo enviado en el cuerpo. Debe enviarse entre 1 y 100 artículos, cada uno con nombre de hasta 120 caracteres y categoría de hasta 80. `id` es opcional y, si se envía, debe tener hasta 180 caracteres; la cantidad, si se envía, debe ser un entero entre 1 y 99. Los textos no pueden quedar vacíos después de quitar espacios. Para un ID de catálogo existente, el servidor rechaza artículos con estado `Agotado` o cantidad mayor a las existencias conocidas y obtiene los precios del catálogo, sin confiar en precios del navegador. Los demás estados se muestran como información y no impiden por sí solos crear el pedido.

La respuesta `201` contiene `id`, `status`, `createdAt`, `trackingToken`, `currency` y `totalAmount`. `id` es un UUID generado por el servidor. Si algún artículo no tiene precio configurado en la moneda elegida, `totalAmount` es `null` y queda pendiente por cotizar. El código de seguimiento se genera a partir de 32 bytes aleatorios y se presenta como 43 caracteres Base64URL.

Para hacer seguros los reintentos, envía el encabezado opcional `Idempotency-Key` con una clave aleatoria de 22 a 128 caracteres Base64URL (por ejemplo, un UUID). Reutiliza la misma clave únicamente al reintentar el mismo cuerpo: la API devuelve el mismo pedido y el mismo código de seguimiento, sin insertar otro pedido. Si se reutiliza la clave con datos diferentes, responde `409`. Sin este encabezado, se mantiene el comportamiento compatible anterior y no se deduplican reintentos. El formulario envía la clave automáticamente y la conserva en `sessionStorage` hasta recibir una respuesta exitosa.

La base de datos conserva un hash de la clave y el código de seguimiento cifrado, nunca la clave ni el código en texto plano. Guarda el código de seguimiento que devuelve la respuesta junto con el identificador.

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

#### Avisos de cambios de estado

El correo ingresado al crear el pedido se usa para avisar cuando su estado cambia a `En proceso` o `Completado`. El mensaje incluye el identificador, el nuevo estado y un enlace a la consulta; no incluye el código secreto de seguimiento. El cambio de estado se guarda aunque el envío de correo falle.

`PATCH /api/admin/orders/:id/status` incluye el resultado del aviso en `notification`. Si SMTP no está configurado, queda `pending`; si falla el proveedor, queda `failed`. El administrador puede reintentar desde el panel o con `POST /api/admin/notifications/:notificationId/retry`. Los pedidos creados antes de agregar el correo pueden seguir gestionándose, pero no generan notificaciones.

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

### Portal de clientes

El portal `/mi-cuenta` permite iniciar sesión sin contraseña. El cliente solicita un código de 8 dígitos, lo recibe en el correo y lo verifica en la página. Los códigos vencen en 10 minutos, son de un solo uso, se guardan como HMAC (no en texto plano), y quedan bloqueados después de cinco intentos incorrectos. Hay un intervalo de 60 segundos entre envíos al mismo correo y límites por IP.

| Método y ruta | Acceso | Comportamiento |
| --- | --- | --- |
| `POST /api/customer/auth/request-code` | Público; `Origin` requerido | Recibe `{ "email": "cliente@example.com" }`. Devuelve siempre el mismo mensaje `202` para correos válidos, para no revelar si ya existen pedidos. Responde `503` si SMTP no está configurado o no se pudo enviar el código. |
| `POST /api/customer/auth/verify-code` | Público; `Origin` requerido | Recibe `{ "email": "cliente@example.com", "code": "12345678" }`; al verificarlo, crea la cuenta si hace falta y establece una cookie de sesión `HttpOnly`. |
| `GET /api/customer/session` | Público | Indica si la cookie actual corresponde a una sesión válida; si es válida, incluye el correo verificado y el nickname guardado. |
| `POST /api/customer/logout` | Público; `Origin` requerido | Revoca la sesión actual, elimina la cookie y responde `204`. |
| `PATCH /api/customer/profile` | Sesión y `Origin` requerido | Guarda `gameNickname`, con entre 1 y 100 caracteres. El correo verificado no se puede cambiar desde esta ruta. |
| `GET /api/customer/orders?page=1&limit=10` | Sesión de cliente | Devuelve pedidos paginados asociados al correo verificado, con artículos, total, estados, historial y estado del último aviso. `limit` admite hasta 50. |

La propiedad del historial se determina comparando el correo normalizado y verificado con el correo guardado en cada pedido. Por eso también aparecen pedidos anteriores y pedidos enviados como invitado que usaron esa misma dirección. La cuenta no permite consultar pedidos asociados a otros correos. El endpoint del historial no incluye códigos ni hashes de seguimiento. El nickname se guarda en el perfil y se sugiere junto con el correo verificado al crear un pedido; el nombre real continúa siendo un dato del pedido y no se conserva en el perfil.

El código de acceso se envía por SMTP, igual que los avisos de estado. Si SMTP no está configurado, solicitar un código responde `503`; no se crea una sesión de respaldo ni se muestra el código en la respuesta. Configura SMTP antes de habilitar el portal. Las cuentas de correo compartidas permiten que cualquiera con acceso a esa bandeja vea los pedidos asociados a ella.

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

El acceso administrativo usa cuentas individuales, cookie firmada `HttpOnly` y un segundo factor TOTP obligatorio. Las acciones de escritura validan el `Origin` exacto configurado en `APP_ORIGIN`; el servidor también comprueba permisos por rol, independientemente de lo que muestre la interfaz.

| Rol | Permisos |
| --- | --- |
| `owner` | Acceso completo, respaldos y gestión de administradores. |
| `orders` | Consultar y gestionar pedidos, avisos e historial de auditoría. |
| `catalog` | Consultar y modificar catálogo/precios/inventario, e historial de auditoría. |
| `viewer` | Solo lectura de pedidos, catálogo e historial de auditoría. |

El rol `viewer` puede ver datos de pedidos, incluidos nombre y correo de contacto. Asigna ese permiso solo a personas autorizadas. Solo el propietario puede crear administradores, cambiar roles, restablecer el segundo factor de otra cuenta o desactivarla.

| Método y ruta | Acceso | Comportamiento |
| --- | --- | --- |
| `POST /api/admin/login` | Público; `Origin` requerido | Recibe `username`, `password` y, si ya está activado, `code`. Puede responder `{ "twoFactorRequired": true }`, `{ "mfaSetupRequired": true }` o una sesión autenticada. |
| `GET /api/admin/session` | Público | Devuelve el estado de sesión, rol y permisos; identifica una configuración TOTP pendiente. |
| `POST /api/admin/logout` | Público; `Origin` requerido | Borra la cookie de sesión si está presente; responde `204`. |
| `GET /api/admin/mfa/setup`, `POST /api/admin/mfa/verify` | Sesión temporal tras validar contraseña | Proporcionan y verifican la clave TOTP; después de activarla, la API muestra diez códigos de recuperación una sola vez. |
| `POST /api/admin/password` | Sesión y `Origin` requerido | Cambia la contraseña usando `currentPassword` y `newPassword`; se invalidan las sesiones anteriores. |
| `GET /api/admin/orders` | `owner`, `orders`, `viewer` | Lista pedidos paginados y métricas globales. |
| `PATCH /api/admin/orders/:id/status`, `DELETE /api/admin/orders/:id` | `owner`, `orders`; `Origin` requerido | Cambia o elimina pedidos. |
| `POST /api/admin/notifications/:notificationId/retry` | `owner`, `orders`; `Origin` requerido | Reintenta el aviso de correo del pedido. |
| `GET /api/admin/catalog` | `owner`, `catalog`, `viewer` | Consulta el catálogo para administración. |
| `PATCH /api/admin/catalog/:id`, `POST /api/admin/catalog/import` | `owner`, `catalog`; `Origin` requerido | Actualiza por versión un artículo o importa hasta 1.000 artículos de forma atómica. |
| `GET /api/admin/audit?page=1&limit=10&category=all&entityId=...` | Cualquier rol autenticado | Consulta el registro, con filtros `all`, `orders`, `catalog`, `admin` y opcionalmente un artículo (`entityId`). |
| `GET/POST /api/admin/users`, `PATCH /api/admin/users/:id/role`, `POST /api/admin/users/:id/mfa-reset`, `DELETE /api/admin/users/:id` | `owner` | Lista, crea, modifica y desactiva cuentas administrativas. |
| `POST /api/admin/backup` | `owner`; `Origin` requerido | Crea y descarga una copia SQLite. |

`POST /api/admin/users` recibe `{ "username": "operador", "password": "contraseña-temporal-segura", "role": "orders" }`. El usuario debe tener de 3 a 32 caracteres ASCII alfanuméricos, punto, guion o guion bajo; la contraseña inicial debe tener de 12 a 128 caracteres. Los roles válidos son `owner`, `orders`, `catalog` y `viewer`. `PATCH /api/admin/users/:id/role` recibe `{ "role": "catalog" }`. La desactivación es lógica y conserva las entradas de auditoría. El propietario no puede cambiar su propio rol ni desactivar su propia cuenta; siempre debe quedar al menos un propietario activo.

El panel permite editar artículos individualmente y descargar una plantilla CSV con el catálogo. La plantilla incluye `id`, `name`, `category`, `type`, `rarity`, `priceCop`, `pricePlatinum`, `stockQuantity` y `availability`; los campos `type` y `rarity` son informativos, mientras que los precios, existencias y disponibilidad se importan. Los precios y las existencias pueden dejarse vacíos para indicar que no están confirmados. Antes de importar, el panel valida el archivo y muestra una vista previa de hasta ocho filas con los valores actuales y los nuevos, además del total de artículos nuevos, modificados o sin cambios. La interfaz rechaza IDs que no correspondan a un producto del catálogo ni coincidan con su nombre y categoría. La importación requiere confirmación y se aplica en una sola transacción: si una fila o escritura falla, se revierten todos los cambios. El archivo puede tener hasta 512 KB y 1.000 artículos.

El catálogo también permite filtrar por existencias, pocas existencias (hasta 3 unidades), agotados y existencias sin confirmar, y ordenar por existencias, popularidad o fecha de actualización. Cada artículo muestra su estado y el resultado del guardado individual. Los cambios sin guardar se pueden descartar explícitamente y el panel pide confirmación antes de cerrar el editor o cambiar la lista. El historial de cada artículo muestra actor, fecha y cambios anteriores/nuevos. La expansión del editor, la actualización de la lista y la carga inicial usan transiciones sutiles y respetan la preferencia del sistema por movimiento reducido.

Al marcar un pedido como `Completado`, el servidor descuenta del inventario las cantidades solicitadas dentro de la misma transacción; si no hay existencias suficientes, responde `409` y conserva el pedido sin completar. Al cambiar un pedido completado a otro estado o eliminarlo, restaura las unidades dentro de la transacción. La selección de un pedido no reserva inventario antes de completarlo.

### Uso del panel

1. Actualiza la aplicación y conserva la misma base SQLite. La cuenta administrativa previa se migra como `owner`; sus cookies anteriores dejan de ser válidas.
2. Abre `/admin`, inicia sesión con `ADMIN_USERNAME` y la contraseña guardada, y registra el segundo factor con una app autenticadora. Guarda los diez códigos de recuperación fuera del servidor: solo se muestran una vez.
3. Como `owner`, usa **Administradores y permisos** para crear cuentas. Comparte la contraseña inicial por un canal seguro; cada nuevo administrador debe registrar TOTP y cambiar esa contraseña antes de usar las funciones del panel.
4. Asigna el rol mínimo necesario. **Catálogo e inventario** permite al rol `catalog` editar valores; `viewer` lo muestra en modo lectura. Pedidos, auditoría y respaldos también se filtran por permisos.
5. El **Registro de auditoría** permite filtrar por categoría y paginar. Muestra el actor y valores antes/después de precios, existencias y disponibilidad; los cambios de inventario por completar, reabrir o eliminar pedidos también aparecen.
6. Descarga una copia de seguridad antes de cambios importantes y almacénala fuera del servidor. Solo el propietario puede descargarla.

### Edición e importación del catálogo

`PATCH /api/admin/catalog/:id` recibe los campos que se guardan (el ID se toma de la ruta):

```json
{
  "name": "Ash Prime",
  "category": "Warframes",
  "priceCop": 12000,
  "pricePlatinum": 20,
  "stockQuantity": 5,
  "availability": "Disponible",
  "expectedVersion": 3
}
```

`expectedVersion` debe ser `null` al crear un artículo nuevo o la versión numérica devuelta por `GET /api/admin/catalog`. `priceCop` y `pricePlatinum` aceptan enteros entre 0 y 1.000.000.000 o `null`; `stockQuantity` acepta enteros de 0 a 1.000.000 o `null`. El nombre debe tener hasta 120 caracteres, la categoría hasta 80 y el ID hasta 180. La disponibilidad debe ser una de las cinco opciones listadas en la sección de [catálogo público](#catálogo-público). Un dato inválido o sin versión responde `400`.

La operación es un `upsert` condicionado por versión: crea un registro si no existe o actualiza solo si `expectedVersion` coincide con la versión almacenada. Si otro administrador ya lo modificó, responde `409` sin sobrescribir sus cambios. El panel conserva el borrador y permite cargar la versión actual para resolver el conflicto; no reintenta la escritura automáticamente. Para que el artículo aparezca asociado a las tarjetas del frontend, utiliza un ID de la plantilla del catálogo; un ID inventado no crea por sí mismo una tarjeta visual.

La importación directa por API usa `POST /api/admin/catalog/import`. Cada producto debe incluir también `expectedVersion` (o `null` si aún no existe); si algún artículo está desactualizado, se rechaza el lote completo con `409`:

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
      "availability": "Disponible",
      "expectedVersion": 3
    }
  ]
}
```

La respuesta correcta indica `importedCount`. La solicitud acepta de 1 a 1.000 registros, sin IDs repetidos, y valida el conjunto completo antes de guardarlo en una sola transacción junto con sus entradas de auditoría. La importación es un `upsert`: crea el ID si no existe o reemplaza sus datos si ya existe. El límite de cuerpo JSON de esta ruta es 1 MB; los demás endpoints conservan su límite de 25 KB.

Para usar la plantilla CSV del panel:

- Guárdala como CSV UTF-8 delimitado por comas. El importador no acepta archivos delimitados por punto y coma.
- Conserva los valores de `id`, `name` y `category`; deben corresponder exactamente a un artículo del catálogo para que el panel pueda asociar los cambios con una tarjeta visible.
- Las columnas requeridas son `id`, `name`, `category`, `priceCop`, `pricePlatinum` y `stockQuantity`. `availability` es opcional; si se omite o queda vacío, se importa como `Por confirmar`.
- `type` y `rarity` describen el catálogo visual; no se guardan en la tabla de inventario ni se usan para fijar precios.
- Para precios y existencias, deja la celda vacía para enviar `null`. Usa enteros sin separadores de miles ni decimales (por ejemplo, `12000`, no `12.000`).
- Cada disponibilidad debe coincidir exactamente con `Disponible`, `En Bóveda`, `Oferta Especial`, `Agotado` o `Por confirmar`.
- Los encabezados no distinguen mayúsculas/minúsculas ni espacios y guiones bajos, pero deben representar el nombre de la columna. El archivo debe tener encabezado y al menos una fila con datos.
- Antes de guardar, revisa la comparación de valores y confirma con **Aplicar artículos**. Un error de validación o escritura impide que se aplique el archivo parcialmente.

Ejemplo de fila:

```csv
"id","name","category","type","rarity","priceCop","pricePlatinum","stockQuantity","availability"
"warframes:Ash Prime","Ash Prime","Warframes","Prime","","12000","20","5","Disponible"
```

El inicio de sesión recibe JSON con `username`, `password` y, cuando el segundo factor ya está activado, `code`. La primera autenticación válida de cada cuenta obliga a registrar una app compatible con TOTP. La sesión temporal solo autoriza consultar y verificar esa configuración; no da acceso al panel. El cambio de contraseña recibe:

```json
{
  "currentPassword": "contraseña actual",
  "newPassword": "nueva contraseña de al menos 12 caracteres"
}
```

La actualización de estado recibe, por ejemplo, `{ "status": "En proceso" }`. Para operaciones desde Postman u otro cliente, conserva la cookie emitida al iniciar sesión y envía `Origin` con el valor configurado en `APP_ORIGIN` en las solicitudes que lo requieren.

La contraseña nueva debe tener entre 12 y 128 caracteres y ser distinta de la actual. Las contraseñas se almacenan con hash `scrypt`. La cuenta `owner` inicial se migra desde la credencial antigua o se crea con `ADMIN_USERNAME` y `ADMIN_PASSWORD`; cambiar esas variables después no reemplaza la cuenta guardada. Las cuentas creadas desde el panel requieren cambiar la contraseña inicial. Cambios de contraseña o rol, restablecimientos MFA y desactivaciones incrementan la versión de sesión e invalidan sus sesiones anteriores.

Las sesiones duran hasta ocho horas. La cookie `tuki_admin_session` usa `HttpOnly` y `SameSite=Strict`; también usa el atributo `Secure` cuando `NODE_ENV=production`. Los códigos TOTP de seis dígitos duran 30 segundos, se admite un desfase de una ventana y cada ventana solo se puede usar una vez. Los códigos de recuperación son de un solo uso y se almacenan como HMAC, no como texto. La clave TOTP se cifra con AES-256-GCM. La API administrativa envía `Cache-Control: no-store`; el límite de inicio de sesión/cambio de contraseña es 10 solicitudes cada 15 minutos en desarrollo y 5 en producción; la verificación del alta MFA tiene un límite propio.

Un propietario puede restablecer el MFA de otra cuenta desde el panel; esa cuenta deberá volver a inscribirse. Si el único propietario pierde tanto el autenticador como sus códigos de recuperación, un operador con acceso al archivo SQLite debe hacer primero un respaldo y restablecer su fila en `admin_users` (`mfa_enabled = 0`, `totp_secret_encrypted = NULL`, `last_totp_step = -1`, incrementar `session_version`) y borrar sus filas de `admin_recovery_codes`. Al iniciar sesión de nuevo, deberá configurar TOTP. Protege el archivo de base de datos y la clave `ADMIN_MFA_ENCRYPTION_KEY` con el mismo cuidado que las credenciales; perder esa clave impide descifrar los autenticadores existentes.

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

La eliminación de un pedido inexistente devuelve `404`; al borrar uno existente, SQLite elimina también sus artículos e historial mediante `ON DELETE CASCADE`, registra la acción y, si estaba completado, restaura las existencias en la misma transacción. Una sesión ausente o inválida devuelve `401`, una cuenta sin permiso devuelve `403`, y un `Origin` no permitido devuelve `403`.

#### Respuestas de error

| HTTP | Significado habitual |
| --- | --- |
| `400` | JSON inválido, campos fuera de formato, estado o parámetros de paginación no válidos. |
| `401` | Credenciales incorrectas o sesión administrativa ausente/expirada. |
| `403` | `Origin` ausente o diferente del configurado para la operación. |
| `404` | Pedido no encontrado o credenciales de seguimiento inválidas. |
| `409` | Conflicto de versión del catálogo o existencias insuficientes para aceptar/completar un pedido. |
| `429` | Se superó el límite de solicitudes. |
| `500` | Error interno no esperado; la respuesta no incluye detalles internos. |

Cuando una ruta devuelve un error JSON, su forma es `{ "error": "..." }`. Los cuerpos JSON están limitados a 25 KB por Express, excepto `/api/admin/catalog/import`, cuyo límite es 1 MB.

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
- Cada administrador debe validar TOTP; la configuración inicial usa una sesión temporal sin acceso al resto de la API. Los roles se verifican en el servidor y los cambios de rol/desactivaciones revocan sesiones.
- Los secretos TOTP se cifran con AES-256-GCM; códigos TOTP usados no se pueden reutilizar y los códigos de recuperación se consumen una sola vez.
- La cookie administrativa es `HttpOnly`, `SameSite=Strict`, limitada a `/` y `Secure` cuando `NODE_ENV=production`. El navegador no expone el token de sesión a JavaScript ni lo guarda en `localStorage`.
- El acceso de clientes requiere verificar un código aleatorio de un solo uso enviado por correo. El código se almacena como HMAC, vence en diez minutos, permite hasta cinco intentos y tiene un intervalo de reenvío. Las sesiones de cliente duran siete días, se guardan en SQLite mediante un hash del token y se revocan al cerrar sesión.
- La cookie de cliente también es `HttpOnly`, `SameSite=Strict`, limitada a `/` y `Secure` en producción. Las rutas del portal responden `Cache-Control: no-store`; el historial se filtra en el servidor por el correo verificado y no contiene códigos ni hashes de seguimiento.
- Cada operación protegida requiere una sesión válida y el permiso apropiado, excepto los endpoints públicos de inicio/cierre de sesión y consulta de sesión. La configuración TOTP pendiente solo autoriza sus rutas de inscripción. Las escrituras administrativas también verifican que `Origin` coincida con `APP_ORIGIN`.
- Todas las rutas `/api/admin` responden con `Cache-Control: no-store`; los cuerpos JSON tienen un límite de 25 KB, excepto `/api/admin/catalog/import`, que admite hasta 1 MB.
- Cada solicitud incluye un `X-Request-ID` generado por el servidor. El servidor emite logs JSON con fecha, nivel, evento, ID de solicitud, método, ruta sin parámetros de consulta, estado HTTP y duración. Los errores internos y eventos de correo se pueden correlacionar con ese identificador; no se registran cuerpos de solicitud.
- Las rutas de pedidos e inicio de sesión/cambio de contraseña tienen límites por IP. Si la API se coloca detrás de un proxy inverso, configura el proxy y la confianza de IP de manera explícita y segura antes de basar los límites en la dirección del cliente.

### Recomendaciones para producción

1. Define `NODE_ENV=production`, usa HTTPS y configura `APP_ORIGIN` como el origen público exacto del frontend.
2. Usa secretos aleatorios y únicos para `ADMIN_PASSWORD`, `SESSION_SECRET` y `ADMIN_MFA_ENCRYPTION_KEY`; guarda `.env` en el sistema de secretos del proveedor, nunca en el repositorio.
3. Sirve el frontend y enruta `/api` hacia Express mediante el proxy/reverse proxy del despliegue. Esta aplicación no configura CORS para un frontend en otro origen.
4. Usa almacenamiento persistente para `DATABASE_PATH`; si el contenedor o servidor se reemplaza sin preservar su disco, se perderán pedidos y catálogo.
5. Descarga y guarda fuera del servidor las copias de seguridad. Las siete copias conservadas por la aplicación son una rotación local, no una estrategia de recuperación ante la pérdida completa del servidor.
6. Cambia las credenciales de ejemplo y limita el acceso operativo a `/admin` y a los archivos de respaldo.

### Registro de auditoría administrativa

`GET /api/admin/audit?page=1&limit=10&category=all` consulta el registro. `limit` admite de 1 a 50 y `category` acepta `all`, `orders`, `catalog` o `admin`. La pantalla `/admin` ofrece los mismos filtros y paginación.

Los cambios efectivos se escriben en `admin_audit_log` dentro de la misma transacción SQLite que modifica los datos:

- Pedidos: cambios de estado con valor anterior/nuevo y eliminaciones.
- Catálogo: cambios manuales/importados de nombre, categoría, precio COP, precio en platino, existencias y disponibilidad.
- Inventario: descuentos/restauraciones automáticos por completar, reabrir o eliminar un pedido, con el ID del pedido relacionado.
- Administración: inicios de sesión, cambios de contraseña, alta TOTP, uso de código de recuperación, creación/cambio de rol/restablecimiento MFA/desactivación de cuentas.

Cada entrada registra el nombre de usuario actor, acción, entidad, detalles mínimos y fecha. No guarda contraseñas, secretos TOTP, códigos de recuperación, tokens de seguimiento ni detalles personales del pedido. Las migraciones amplían la restricción de acciones y conservan entradas de auditoría existentes.

## Base de datos y respaldos

SQLite se guarda por defecto en `server/data/orders.sqlite`; `DATABASE_PATH` puede reemplazar esa ubicación. La base está pensada para una instancia de la API con almacenamiento persistente. No borres ni edites el archivo mientras el servidor lo está usando.

| Tabla | Contenido |
| --- | --- |
| `orders` | Identificador, hash del token de seguimiento, datos de contacto, forma de pago, estado, moneda, total y fechas. |
| `order_items` | Artículos, IDs del catálogo cuando están disponibles, cantidades y precios unitarios COP/platino copiados al crear el pedido. |
| `catalog_products` | IDs, nombres, categorías, precios, existencias, disponibilidad y fecha de actualización. |
| `order_status_history` | Estado inicial y cada cambio real de estado, ordenados por fecha. |
| `admin_users` | Cuentas, rol, hash `scrypt`, estado MFA y versión de sesión. |
| `admin_recovery_codes` | HMAC de los códigos de recuperación de un solo uso. |
| `admin_audit_log` | Usuario administrador, tipo de acción, entidad, detalles mínimos y fecha. |

`admin_credentials` se conserva como fuente de migración de la cuenta única de versiones anteriores; las nuevas sesiones y cambios de contraseña usan `admin_users`.

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

Las pruebas de integración del servidor usan una base SQLite temporal que se elimina al terminar; no modifican la base local del proyecto. Cubren pedidos, precios e inventario, actualizaciones concurrentes y conflictos de versión del catálogo, atomicidad de importaciones, seguimiento e historial, acceso administrativo, auditoría, validaciones y respaldos.

Las pruebas frontend usan Vitest y Testing Library. Para ejecutarlas junto con las pruebas del servidor:

```powershell
npm.cmd test
```

Para ejecutar por separado las pruebas del servidor o frontend:

```powershell
npm.cmd run test:server
npm.cmd run test:frontend
```

### Prueba E2E con Playwright

El recorrido E2E verifica el flujo de pedido en Chromium de escritorio y móvil (viewport de 390 × 844): buscar un artículo, agregarlo al pedido, completar y enviar el formulario, y consultar el estado con el código de seguimiento. También comprueba que la página no exceda el ancho del viewport.

Instala el navegador de Playwright una vez por entorno:

```powershell
npx.cmd playwright install chromium
```

Ejecuta la prueba:

```powershell
npm.cmd run test:e2e
```

Playwright inicia automáticamente Vite y una API exclusiva para las pruebas. Esta API usa una base SQLite temporal independiente y la elimina al finalizar; no se requieren credenciales reales ni se modifica la base de datos de desarrollo. Los reportes y resultados se guardan en `playwright-report/` y `test-results/`, carpetas excluidas de Git.

## Integración continua

GitHub Actions audita las dependencias con `npm audit --audit-level=moderate` y falla si encuentra vulnerabilidades moderadas o superiores. También ejecuta las pruebas del servidor y frontend, instala Chromium para Playwright, ejecuta el recorrido E2E de escritorio y móvil, ESLint y la compilación del frontend al subir cambios a `main` o abrir/actualizar un Pull Request hacia `main`. El workflow está en `.github/workflows/ci.yml`, usa Ubuntu, Node.js 22 y `npm ci`; no requiere credenciales reales ni escribe en la base local. Para proteger `main`, configura en GitHub una regla de protección que exija el chequeo `Tests, lint, and build`.

## Estructura del proyecto

```text
src/
  app/              Enrutamiento y composición general de la aplicación
  features/         Funcionalidad organizada por dominio
    account/        Cuenta del cliente
    admin/          Panel y administración
      catalog/      Edición, importación y auditoría del catálogo
    catalog/        Catálogo público y datos de Warframe
    checkout/       Carrito y creación de pedidos
    duviri/         Página de Duviri
    home/           Página de inicio
    orders/         Consulta de pedidos
  shared/           Componentes, estado y estilos realmente compartidos
  assets/           Recursos importados por el frontend
  test/             Configuración global de pruebas
e2e/                Pruebas de flujo completo con Playwright
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
  playwright.js     Servidor aislado usado por las pruebas E2E
public/             Recursos públicos servidos por Vite
imagenes-warframe/  Imágenes importadas por el catálogo
.github/workflows/  Automatización CI con GitHub Actions
```

El frontend importa módulos internos mediante el alias `@/` configurado en Vite. Cada dominio mantiene sus componentes, datos y pruebas cerca de la funcionalidad; `shared/` se reserva para código usado por más de un dominio. La capa `app/` compone las páginas y no contiene reglas de negocio.

El backend conserva una arquitectura por capas: las rutas conectan con controladores, los servicios contienen reglas de negocio y los repositorios encapsulan el acceso a SQLite. Evita que una ruta o controlador consulte directamente la base de datos o que un dominio dependa de la implementación interna de otro.
