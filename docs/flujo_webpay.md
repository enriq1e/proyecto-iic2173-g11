# Flujo de integración con Webpay (Transbank)

Este documento describe cómo se integra el sistema con Webpay (Transbank Webpay Plus) en el proyecto:

- Endpoints principales de la API implicados
- Formatos de petición/respuesta
- Qué ocurre en cada paso (create, redirect, commit)
- Manejo de errores, idempotencia y pruebas en sandbox

## Resumen breve

1. Cliente solicita la creación de una transacción (checkout) hacia la API: POST /purchases/transaction
2. La API llama al SDK/servicio Transbank: tx.create(...). Transbank devuelve { token, url }
3. La API devuelve al cliente la `deposit_url` (url) y `deposit_token` (token) — el cliente redirige al usuario a Webpay
4. Usuario paga en Webpay; Transbank redirige al `RETURN_URL` configurado con parámetros (o token) y/o realiza notificación al `FINAL_URL` según configuración
5. Backend llama a tx.commit(token_ws) para confirmar la transacción (se puede hacer desde un endpoint `/commit` o desde el callback del frontend)
6. Si la confirmación es exitosa, el backend debe: 1) marcar/actualizar la PurchaseIntent asociada (o crearla si no existía), 2) publicar la solicitud RF05 al topic compartido `properties/requests` para que el broker reduzca ofertas y se inicie el proceso de validación.

## Endpoints (implementación recomendada en este proyecto)

- POST /purchases/transaction
	- Descripción: inicio de pago. Crea transacción con Transbank (tx.create).
	- Request body: { property_url: string } (o property_id)
	- Respuesta 201: { message, deposit_token: string, deposit_url: string, property_url, property_name, available_offers }
	- Acciones internas:
		- Validar propiedad y que `offers > 0`.
		- Calcular monto a pagar (por ejemplo 10% del precio).
		- Llamar `tx.create(buyOrder, sessionId, amount, returnUrl)` y devolver `token` y `url`.
		- Opcional: crear una `PurchaseIntent` PENDING con `request_id` o dejar que el cliente la cree explícitamente con `/create-intent`.

- POST /purchases/create-intent
	- Descripción: crear (o reutilizar) una intención de compra en la base de datos sin confirmar aún.
	- Request body: { property_url|string, property_id|number }
	- Respuesta 201: { request_id, status: 'pending', ... }
	- Comportamiento: busca PurchaseIntent PENDING existente para usuario+propiedad; si no existe, crea una con `request_id = UUIDv4`.

- POST /purchases/commit
	- Descripción: confirmar transacción usando `token_ws` devuelto por Webpay. Después de confirmar, publicar RF05.
	- Request body: { token_ws: string, property_id: number }
	- Flujo interno:
		1. Llamar `tx.commit(token_ws)`.
		2. Si la respuesta indica `response_code === 0` (aprobado): asociar el `token_ws` a la `PurchaseIntent` existente (si existe) o crear una nueva intención PENDING (recomendado: actualizar el registro con `transaction_token` para trazabilidad), y publicar el RF05 con `request_id` para la fase de validación compartida.
		3. Si `tx.commit` no aprueba: devolver 400/appropriate error, no publicar RF05.

## Estructura y datos clave

- RF05 (mensaje publicado al topic `properties/requests`):

```json
{
	"request_id": "uuid-v4",
	"group_id": "g11",
	"timestamp": "2025-11-02T12:00:00Z",
	"url": "https://..., propiedad...",
	"origin": 0,
	"operation": "BUY"
}
```

- PurchaseIntent (sugerencia de campos útiles):
	- request_id: string (UUID, unique)
	- propertieId: integer (FK)
	- email: string (usuario)
	- status: 'PENDING' | 'SETTLED' | 'CANCELLED' | ...
	- transaction_token: string (token_ws / buyOrder) — opcional pero recomendado
	- price_amount, price_currency
	- createdAt, updatedAt

## Idempotencia y protección contra duplicados

- Al crear intenciones, usar `findOne` por (propertieId, email, status: 'PENDING') para reutilizar una intención existente.
- La columna `request_id` en `PurchaseIntent` debe ser única (constraint DB). Si por algún motivo se generan requests duplicados, el broker y los endpoints idempotentes (`reserve-from-request`, `settle-from-validation`) usan `request_id` para evitar aplicar la misma reserva dos veces.
- Cuando se recibe la llamada de confirmación (`/commit`) asociar el `token_ws` con la intención ya existente en la DB (update), en vez de crear otra fila nueva.

## Manejo de errores y códigos HTTP

- `tx.create` falla: devolver 502 (Bad Gateway) o 500 con mensaje explicativo. No crear intención si la transacción no se puede iniciar.
- `tx.commit` falla o devuelve `response_code !== 0`: devolver 400 con detalles; no publicar RF05.
- Publicación MQTT falla: deberías reintentar (retries exponenciales) y/o colocar la intención en estado `PENDING` y programar reintentos. Informar al usuario que la confirmación fue recibida pero la publicación falló.

## Pasos de integración / secuencia completa

1. Cliente pide crear intención (opcional, `POST /purchases/create-intent`) — guarda `request_id`.
2. Cliente solicita iniciar transacción (`POST /purchases/transaction`) y recibe `deposit_url` y `deposit_token`.
3. Cliente redirige al usuario a `deposit_url` (Webpay) para que complete el pago.
4. Webpay redirige al `RETURN_URL` con parámetros o token; cliente recoge `token_ws` (o el frontend lo recibe y lo envía al backend).
5. Backend recibe `token_ws` y llama `POST /purchases/commit` con `{ token_ws, property_id }`.
6. Backend hace `tx.commit(token_ws)`:
	 - Si aprobado: actualizar `PurchaseIntent` (set `transaction_token`, status PENDING/CONFIRMED según modelo), publicar RF05 (con `request_id`) y devolver 201.
	 - Si rechazado: devolver error y no publicar RF05.
7. Broker recibe RF05 y llama `POST /purchases/reserve-from-request` para descontar `offers` localmente de forma idempotente.
8. El validador/operador (otro servicio o grupo) validará la compra y publicará un `properties/validation` con `request_id` y `status` (APPROVED/REJECTED/ERROR).
9. Broker o API recibe `validation` y llama `POST /purchases/settle-from-validation` para asentar y, en caso de REJECTED, restaurar las `offers` si se había reservado.

## Pruebas en sandbox y recomendaciones

- Usa las credenciales/sandbox de Transbank para pruebas (Webpay Plus sandbox). Configura `src/api/utils/transactions.js` con las credenciales de testing.
- Flujo de prueba mínimo:
	1. Crear intención (opcional) y anotar `request_id`.
	2. Llamar a `POST /purchases/transaction` para obtener `deposit_url` y `deposit_token`.
	3. Simular pago en sandbox (Webpay) o usar `deposit_url` proporcionada por Transbank.
	4. Obtener `token_ws` y llamar a `POST /purchases/commit`.
	5. Verificar que se publicó RF05 y que el broker restó `offers`.

## Casos límite y recomendaciones de robustez

- Conexiones MQTT: implementar reintentos y persistencia eventual si la publicación falla (guardar en tabla `OutgoingMessages` y reintentar).
- Condiciones de carrera: asegurar que la operación de reservar ofertas sea idempotente y protegida (DB transaction/row lock si hace falta) — actualmente se usa EventLog para idempotencia.
- Seguridad: proteger `/commit` y `/create-intent` con autenticación (JWT) y validar que `email` del token coincide con la intención antes de reasignar o reutilizar.
- Auditoría: guardar `raw` (payloads de Transbank, respuestas, request_id) en `EventLog` para trazabilidad.

## Ejemplos rápidos (PowerShell / curl)

1) Crear intención (opcional):

```powershell
curl -X POST \
	-H "Authorization: Bearer <TU_JWT>" \
	-H "Content-Type: application/json" \
	-d '{"property_url":"https://..."}' \
	http://api.propiedadesarquisis.me/purchases/create-intent | ConvertFrom-Json
```

2) Iniciar transacción (tx.create):

```powershell
curl -X POST \
	-H "Authorization: Bearer <TU_JWT>" \
	-H "Content-Type: application/json" \
	-d '{"property_url":"https://..."}' \
	http://api.propiedadesarquisis.me/purchases/transaction | ConvertFrom-Json
```

3) Confirmar transacción (tx.commit):

```powershell
curl -X POST \
	-H "Authorization: Bearer <TU_JWT>" \
	-H "Content-Type: application/json" \
	-d '{"token_ws":"<TOKEN_WS>","property_id":123}' \
	http://api.propiedadesarquisis.me/purchases/commit | ConvertFrom-Json
```

## Resumen / Siguientes pasos recomendados

- Asegurar que `PurchaseIntent` tenga un campo `transaction_token` (token_ws / buyOrder) para ligar intención ↔ transacción.
- En `/commit`, en lugar de crear nuevas filas, buscar y actualizar la `PurchaseIntent` existente con el `token_ws` en vez de crear una nueva.
- Implementar reintentos y cola de mensajes si la publicación MQTT pudiera fallar.

Si quieres, hago las siguientes acciones ahora:
- Añadir `transaction_token` al modelo y migración de `PurchaseIntent`.
- Hacer que `/commit` actualice la `PurchaseIntent` existente con el `token_ws` en vez de crear una nueva.
- Añadir tests automáticos (unidad/integración) para el flujo completo en modo sandbox.

Indica cuál de estas tres acciones quieres que haga ahora y la implemento.

