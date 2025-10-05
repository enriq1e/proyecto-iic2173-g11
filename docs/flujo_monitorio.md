# RDOC02: Pasos necesarios para replicar la instalación y seguimiento de su flujo de Monitoreo


## 1. Objetivo 
El presente documento detalla los pasos necesarios para replicar la instalación del sistema de monitoreo implementado con New Relic, así como la estructura de seguimiento de métricas de rendimiento y disponibilidad de la aplicación desplegada en contenedores Docker.
## 2. Requisitos previos

Antes de iniciar, asegúrate de contar con los siguientes componentes instalados o configurados:
* Docker y Docker Compose
* Acceso al proyecto de la API (Node.js) 
* Cuenta activa en New Relic
* License Key de New Relic
* Permisos para modificar variables de entorno en el entorno de despliegue
## 3. Configuración de variables de entorno

Para que New Relic pueda conectarse y enviar métricas desde la aplicación, se deben definir dos variables principales:

````bash
NEW_RELIC_APP_NAME=API_ARQUI
NEW_RELIC_LICENSE_KEY=<TU_LICENSE_KEY>
````

Estas variables pueden configurarse de diferentes formas según el entorno:
- **En Windows** (modo local)
````bash

setx NEW_RELIC_APP_NAME "API_ARQUI"
setx NEW_RELIC_LICENSE_KEY "TU_LICENSE_KEY"
````
- **En Docker Compose**
Dentro del servicio que corresponde a la API, se agregan las variables al bloque environment:
````bash

environment:
  - NEW_RELIC_APP_NAME=API_ARQUI
  - NEW_RELIC_LICENSE_KEY=${NEW_RELIC_LICENSE_KEY}
````

## 4. Integración del agente de monitoreo

Para ejecutar la aplicación junto con el agente de New Relic (APM), se debe iniciar el proceso con el siguiente comando:
````bash
node -r newrelic YOUR_MAIN_FILENAME.js
````

    Nota: El parámetro -r newrelic permite que el agente se cargue antes de iniciar la aplicación, garantizando que las métricas se registren correctamente desde el arranque.

## 5. Verificación de funcionamiento
Una vez levantado el contenedor o el servidor local, se puede verificar si New Relic está activo, por ejemplo, revisando los logs del agente dentro del contenedor:

``docker exec api_service cat newrelic_agent.log``

Si el agente está correctamente configurado, se mostrará un mensaje indicando que el agente de New Relic está activo y enviando datos a la plataforma.

## 6. Estructura de monitoreo implementada

En el entorno EC2 donde corre la aplicación se configuraron dos niveles de monitoreo consolidados:
- **New Relic APM (Node.js)**: Para analizar el rendimiento y trazas de la API.
- **New Relic Infrastructure**: Para recopilar métricas del sistema operativo y los contenedores Docker.

## 7. Flujo de monitoreo

El flujo de monitoreo sigue la siguiente secuencia:La API (contenedor Node.js) inicia con el agente de New Relic APM.El agente APM envía métricas de transacciones, errores y throughput al panel de APM.El agente de Infraestructura, instalado en el EC2, monitorea CPU, memoria y red.Ambos envían información consolidada a la plataforma de New Relic, donde se visualizan dashboards de rendimiento.
## 8. Evidencia visual de métricas obtenidas
Se recomienda obtener y adjuntar capturas de pantalla de las siguientes secciones de New Relic:
- API (nivel aplicación): Gráficos de Throughput, Apdex y Tiempos de Respuesta.
![API - ERRORS](New%20Relic%20Screenshots/API%20-%20%25Errors.png)
![API - Apdex](New%20Relic%20Screenshots/API%20-%20Apdex.png)
![API - Throughput](New%20Relic%20Screenshots/API%20-%20Throughput.png)
![API - TSlug](New%20Relic%20Screenshots/API%20-%20Transactions%20Slug.png)
![API - Transactions](New%20Relic%20Screenshots/API%20-%20Transactions.png)
- Infraestructura (nivel contenedores): Uso de CPU, Memoria y Tráfico de Red por contenedor.
![Infrastructure - Containers](New%20Relic%20Screenshots/Infrastructure%20-%20Containers%20-%20CPU%20Metrics.png)
![Infrastructure - CPU](New%20Relic%20Screenshots/Infrastructure%20-%20CPU%20.%20Memory%20-%20Network%20Traffic.png)
![Infrastructure - Process Running](New%20Relic%20Screenshots/Infrastructure%20-%20Load%20Average%20-%20Process%20Running.png)

## 9. Resultados observados

Gracias a la integración con New Relic se pudo:
* Identificar métricas clave de rendimiento en tiempo real.
* Detectar posibles errores y tiempos de respuesta elevados en endpoints específicos.
* Analizar el consumo de CPU, memoria y tráfico de red por contenedor.
* Obtener una visión completa del estado operativo de la infraestructura y de la API.