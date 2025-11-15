# RDOC3 — Cómo subir la función Serverless con **AWS SAM** (Boletas PDF)

A continuación se muestra el paso a paso de cómo desplegar la función Serverless de generación de boletas PDF en AWS Lambda, se indica cómo se publican los PDFs en S3 y se exponen en un endpoint por API Gateway para que el backend la llame después de un pago exitoso.
 **Objetivo:** generar la **boleta PDF** después del pago y dejarla disponible vía URL.
 - **Servicios AWS que usamos:** **Lambda** (Node.js), **API Gateway** (HTTP), **S3** para guardar los PDF.
- **Región:** `us-east-2` (Ohio).
- **Buckets involucrados:**
  - `grupo11-boletas` → almacena los PDF generados.
  - `serverless-framework-deployments-us-east-2` → bucket de artefactos que crea automáticamente **Serverless Framework** cuando se hace el deploy. Esto se realiza Serverless para minimizar los costso, al mismo tiempo con un despliegue sencillo y reproducible. 

---

## 1) Estructura del proyecto
- **`template.yaml`**: declara recursos de AWS de forma reproducible (IaC).
- **`handler.js`**: lógica de generar PDF, subir a S3 y retornar URL.

---

## 2) Plantilla **SAM** mínima
> Declara una función Node.js, le da permisos a S3 y expone un **endpoint HTTP** en API Gateway (`POST /boleta`):

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Description: Boleta PDF Service (Lambda + API Gateway + S3) — Grupo 11

Parameters:
  BucketName:
    Type: String
    Description: Nombre del bucket S3 donde se guardarán las boletas

Globals:
  Function:
    Runtime: nodejs20.x
    Timeout: 30            # generar PDF puede tardar; ajusta según tu lib
    MemorySize: 512        # si usas render HTML→PDF puede requerir más memoria
    Tracing: Active
    Environment:
      Variables:
        BOLETAS_BUCKET: !Ref BucketName

Resources:
  BoletaFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: boleta-pdf-g11
      Handler: src/handler.generate
      Description: Genera boleta PDF y la sube a S3; retorna URL pública
      Policies:
        - S3CrudPolicy:
            BucketName: !Ref BucketName
      Events:
        BoletaApi:
          Type: Api
          Properties:
            Path: /boleta
            Method: POST

  # Es posible permitir lectura pública de objetos nuevos con una Policy del bucket
  # Recomendamos servir vía CloudFront+OAC y firmar URLs en vez de público total.

Outputs:
  BoletaEndpoint:
    Description: Endpoint HTTP para invocar la función
    Value: !Sub 'https://${ServerlessRestApi}.execute-api.${AWS::Region}.amazonaws.com/Prod/boleta'
  BucketNameOut:
    Description: Bucket S3 usado para boletas
    Value: !Ref BucketName
```

---

## 3) Función (handler)
>  Muestra el contrato esperado: recibe datos de la compra, genera PDF, sube a S3 y retorna URL.

---

## 4) Comandos SAM

### 4.1 Inicializar
```bash
sam init  # selecciona Node.js, zip, "Hello World"
```
- Genera un esqueleto válido de SAM con `template.yaml` y handler base.

### 4.2 Construir
```bash
sam build
```
- Empaqueta dependencias según el runtime y prepara la carpeta `.aws-sam/`.

### 4.3 Desplegar
```bash
sam deploy --guided
```
Responde:
- **Stack name**: `boleta-pdf-g11`
- **AWS Region**: `us-east-2`
- **Parameter Overrides** → `BucketName=boletas-g11-prod`
- **Confirm changes before deploy** → `y`
- **Allow SAM CLI IAM role creation** → `y`
- **Save arguments to configuration file** → `y`

Luego, los siguientes deploys quedan simplificados:
```bash
sam deploy
```

### 4.4 Outputs
Al terminar, SAM muestra el **endpoint HTTP** (`BoletaEndpoint`) y confirma el bucket.

---

## 5) Pruebas locales y remotas

### 5.1 Invoke local
```bash
sam local invoke BoletaFunction \
  -e events/payload.json
```
`events/payload.json` (ejemplo):
```json
{
  "groupName": "Grupo 11",
  "user": { "email": "u@ejemplo.com", "name": "Usuario" },
  "purchase": {
    "id": "req-123",
    "amount": 10000,
    "currency": "CLP",
    "propertyName": "Depto Prueba"
  }
}
```
- Sirve para validar contratos y errores sin subir a la nube.

### 5.2 Invocar por HTTP
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d @events/payload.json \
  "https://<api-id>.execute-api.<region>.amazonaws.com/Prod/boleta"
```
- Permite hacer prueba end to end de API Gateway → Lambda → S3.

---

## 6) Permisos, CORS y seguridad
- **Permisos S3**: `S3CrudPolicy` ya otorga `PutObject`.
- **CORS** en API Gateway: si tu backend/FRONT la invoca desde otro dominio, habilita `Access-Control-Allow-Origin` apropiado.
- **Principio de mínimo privilegio**: no uses políticas `*FullAccess`.

---

## 7) Integración con el backend
- **Input** (JSON): datos del usuario y de la compra validada (ID, monto, moneda, propiedad, fecha).
- **Output** (JSON): `{ url: "https://.../boletas/<id>.pdf", key: "boletas/<id>.pdf" }`
- **Poosibles Errores**: HTTP 400 (faltan campos), 500 (fallo interno), entre otros.
- **Cuándo llamarla**: después de confirmar el pago WebPay (RF03) y al mostrar el detalle (RF05).

> De esta manera se separan las responsabilidades: el backend orquesta y valida; la Lambda solo genera boletas.

---

## 8) Troubleshooting
- **`AccessDenied` al subir a S3**: revisa que la Policy incluya `s3:PutObject` para `BOLETAS_BUCKET`.
- **PDF vacío o corrupto**: cierra el stream (`doc.end()`) y acumula los chunks antes de subir.
- **Timeout**: aumenta `Timeout`/`MemorySize` o usa librería PDF más liviana.
- **Binarios (puppeteer/wkhtmltopdf)**: usa **Lambda Layer** o **Imagen de Lambda** con dependencias.
- **CORS**: habilita OPTIONS y encabezados en API Gateway si invocas desde el front.

---

## 9) (Opcional) CI/CD para el servicio Serverless
- Para reproducir `sam build` + `sam deploy` en GitHub Actions.
- Secrets: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`.
- Paso de `sam deploy --no-confirm-changeset` con parámetros guardados del `--guided`.

---

## 10) Limpieza
- `sam delete` para borrar el stack y evitar costos.
- Revisa CloudWatch Logs si necesitas investigar errores en producción.

---

### Resumen
1. Declaramos con **SAM** los recursos: **Lambda + API Gateway + permisos S3** (Infra como código).
2. Implementamos `handler` que **genera PDF** y **lo sube a S3** y retorna una **URL**.
3. **Construimos y desplegamos** con `sam build` / `sam deploy`.
4. Probamos local y remoto para validar el flujo fin a fin.
5. Dejamos consideraciones de **seguridad**, **CORS** y **CI/CD** opcional.
