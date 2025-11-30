
---

# 📄 Documentación del Pipeline CI/CD para Backend

Este pipeline unificado implementa **CI (Integración Continua)** y **CD (Despliegue Continuo)** para el backend utilizando GitHub Actions.
Su objetivo es garantizar:

* **Calidad del código** (lint + tests)
* **Construcción y publicación automática de la imagen Docker** en Amazon ECR Public
* **Despliegue solo cuando el código en `main` es válido**

El workflow está definido en un único archivo:
`.github/workflows/backend.yml`

---

# ¿Cuándo se ejecuta el pipeline?

El workflow define los siguientes activadores:

```yaml
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]
```

### El comportamiento final es:

| Acción               | CI   | CD               |
| -------------------- | ---- | ---------------- |
| **Push a develop**   | ✅ Sí | ❌ No             |
| **Push a main**      | ✅ Sí | ✅ Sí, si CI pasa |
| **PR hacia develop** | ✅ Sí | ❌ No             |
| **PR hacia main**    | ✅ Sí | ❌ No             |

**CD nunca se ejecuta en pull requests**, solo en push directo a la rama `main`.

---

# 1. Job: `ci` — *Continuous Integration*

### Objetivo

Validar que el código del backend está correcto antes de cualquier despliegue.

### Qué hace

1. Clona el código
2. Instala dependencias (`npm ci`)
3. Ejecuta el linter (`npm run lint`)
4. Corre los tests (`npm test`)

### Configuración

```yaml
jobs:
  ci:
    name: Backend CI
    runs-on: ubuntu-latest

    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Set Up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install Dependencies
        run: npm ci

      - name: Run Linter
        run: npm run lint

      - name: Run Tests
        run: npm test
```

### Notas importantes

* Si **lint o tests fallan**, el job falla.
* Si este job falla → **se detiene el pipeline**.
* El job de despliegue (`deploy`) solo se ejecuta si `ci` terminó exitosamente.

---

# 2. Job: `deploy` — *Continuous Deployment*

### Objetivo

Construir y publicar la imagen Docker del backend en **AWS ECR Public**, solo si:

* El commit es un **push a la rama main**
* El job `ci` completó correctamente

### Condiciones del job

```yaml
needs: ci
if: github.event_name == 'push' && github.ref == 'refs/heads/main'
```

Esto garantiza:

* CD nunca se ejecuta sin CI
* CD nunca se ejecuta en PRs
* CD solo se ejecuta en push a `main`

---

# Qué hace el job de despliegue

1. Descarga el código
2. Configura QEMU para builds multiplataforma
3. Activa Docker Buildx
4. Configura credenciales de AWS (usando secretos)
5. Inicia sesión en Amazon ECR Public
6. Construye la imagen Docker
7. Publica la imagen a ECR con dos tags:

   * `latest`
   * `<commit-sha>` (inmutable)

### Configuración del job

```yaml
  deploy:
    name: Build & Deploy to ECR
    runs-on: ubuntu-latest
    needs: ci

    if: github.event_name == 'push' && github.ref == 'refs/heads/main'

    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Set up QEMU
        uses: docker/setup-qemu-action@v3

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ secrets.AWS_REGION }}

      - name: Login to Amazon ECR Public
        run: |
          aws ecr-public get-login-password --region ${{ secrets.AWS_REGION }} \
            | docker login --username AWS --password-stdin ${{ secrets.ECR_PUBLIC_URI }}

      - name: Build and push Docker image
        uses: docker/build-push-action@v4
        with:
          context: .
          push: true
          tags: |
            ${{ secrets.ECR_PUBLIC_URI }}:${{ github.sha }}
            ${{ secrets.ECR_PUBLIC_URI }}:latest
```

---

# 3. Uso de secretos

El workflow utiliza los siguientes secretos almacenados en **GitHub → Settings → Secrets → Actions**:

| Secreto                 | Uso                                     |
| ----------------------- | --------------------------------------- |
| `AWS_ACCESS_KEY_ID`     | Autenticación AWS                       |
| `AWS_SECRET_ACCESS_KEY` | Autenticación AWS                       |
| `AWS_REGION`            | Región de ECR Public                    |
| `ECR_PUBLIC_URI`        | URL de tu repositorio de contenedor ECR |

---

# 4. Propósito del pipeline

Este pipeline garantiza que:

* El backend **siempre es testeado** antes de ser publicado.
* La imagen Docker en ECR **siempre corresponde a código funcional**.
* Los despliegues a producción (o staging) siempre se basan en la rama `main` y están **validados por CI**.

---
