# Documentación del Pipeline CI/CD para Backend

El pipeline de CI/CD está definido en GitHub Actions y tiene como objetivo principal garantizar la calidad del código del backend y mantener actualizada la imagen Docker en AWS ECR público. El flujo se ejecuta en los siguientes eventos:

* Push a las ramas `main` y `dev`.
* Pull request dirigido a `main` o `dev`.
* Ejecución manual mediante `workflow_dispatch`.

El pipeline consta de dos jobs principales: `build-and-test` y `push-to-ecr`.

---

## 1. Job: `build-and-test`

**Objetivo:** Validar que el código del backend funciona correctamente a nivel básico mediante la instalación de dependencias y la ejecución de tests antes de construir o publicar cualquier imagen.

**Steps del job:**

1. **Checkout Code**

   * Acción: `actions/checkout@v4`
   * Función: Clona el repositorio para tener acceso al código fuente.

2. **Set Up Node.js**

   * Acción: `actions/setup-node@v4`
   * Función: Configura Node.js versión 20 y habilita cache de dependencias npm para acelerar instalaciones futuras.

3. **Install Dependencies**

   * Comando: `npm ci`
   * Función: Instala todas las dependencias del proyecto de manera reproducible.

4. **Run tests**

   * Comando: `npm test`
   * Función: Ejecuta los tests unitarios Jest para asegurar funcionamiento del backend.

**Notas importantes:**

* Este job se ejecuta en un runner `ubuntu-latest`.
* Si alguno de los tests falla, el job falla y el siguiente job (`push-to-ecr`) **no se ejecuta**, evitando subir imágenes con errores.

---

## 2. Job: `push-to-ecr`

**Objetivo:** Construir la imagen Docker del backend y subirla al ECR público en AWS.

**Condiciones de ejecución:**

* Se ejecuta **solo en la rama `main`**, gracias a la condición:

  ```yaml
  if: github.ref == 'refs/heads/main' || github.base_ref == 'main'
  ```
* Depende del job `build-and-test` (`needs: build-and-test`), asegurando que los tests hayan pasado antes de construir y subir la imagen.

**Steps del job:**

1. **Checkout Code**

   * Igual que en `build-and-test`, clona el repositorio para construir la imagen Docker.

2. **Set up QEMU (for multi-platform builds)**

   * Acción: `docker/setup-qemu-action@v3`
   * Función: Prepara emulación de arquitectura múltiple para construir imágenes Docker multiplataforma.

3. **Set up Docker Buildx**

   * Acción: `docker/setup-buildx-action@v3`
   * Función: Habilita Buildx, herramienta avanzada de Docker para builds y push de imágenes.

4. **Configure AWS credentials**

   * Acción: `aws-actions/configure-aws-credentials@v4`
   * Función: Configura las credenciales de AWS usando secretos de GitHub (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`) para autenticar operaciones en ECR.

5. **Debug AWS credentials**

   * Comando: `echo ...`
   * Función: Verifica que las variables de entorno se hayan configurado correctamente.

6. **Login to Amazon ECR Public**

   * Comando:

     ```bash
     aws ecr-public get-login-password --region ${{ secrets.AWS_REGION }} \
       | docker login --username AWS --password-stdin ${{ secrets.ECR_PUBLIC_URI }}
     ```
   * Función: Autentica Docker con el repositorio público de ECR, permitiendo subir imágenes.

7. **Build and push Docker image**

   * Acción: `docker/build-push-action@v4`
   * Función: Construye la imagen Docker usando el contexto actual (`.`) y la sube a ECR público.
   * Etiquetas de la imagen:

     * `${{ secrets.ECR_PUBLIC_URI }}:${{ github.sha }}` (versionado con hash del commit)
     * `${{ secrets.ECR_PUBLIC_URI }}:latest` (siempre apunta a la última versión)

---

## 3. Configuraciones especiales

* **Uso de secretos de GitHub:**

  * `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `ECR_PUBLIC_URI` para seguridad y autenticación.
* **Dependencias de jobs:**

  * `push-to-ecr` depende de `build-and-test` para asegurar que solo se publiquen imágenes de código que pasó tests.
* **Entorno de ejecución:**

  * Ambos jobs corren en `ubuntu-latest`.

---

## 4. Propósito general

* Garantizar **calidad del código** mediante tests antes de cualquier build.
* Mantener un **registro público de la imagen Docker del backend** actualizado con cada push o pull_request a `main`.
* Facilitar la futura integración con despliegues de producción mediante ECR.
