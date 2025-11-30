# RDOC01: Documentación para ejecutar la aplicación en un ambiente local 

El proyecto está compuesto por 3 partes:
- api principal
- auth-service
- frontend

Instalaciones necesarias para poder ejecutar el proyecto:
- npm (o yarn)
- PostgresSQL
- MQTT: npm install mqtt --save; npm install mqtt -g
- Docker

### 1. Variables de entorno:
Cada servicio tiene su propio `.env`, podrás copiarlo desde `.env-example` y completarlo con tus propios datos. 

proyecto-iic2173-g11\
/.env (api de properties)
```
HOST=<host>
BROKER_PORT=<8686>
USERNAME=<username>
PASSWORD=<pass>
TOPIC=<topic/topic>

DB_HOST=<'localhost'>
DB_NAME=db_name
DB_USER=db_user
DB_PASS=db_pass

PORT=<8686>
API_URL= <http://api:3001>

TOPIC=properties/info
TOPIC_REQUEST=properties/requests
GROUP_ID=g11

UF_API_URL=https://mindicador.cl/api/uf
UF_FALLBACK=40000
```

/auth-service/.env
```
DB_USER=db_user
DB_PASS=db_pass
DB_NAME=db_name
DB_HOST=<'localhost'>
JWT_SECRET=
PORT=4000

API_URL=http://localhost:4000
```

frontend-iic2173-g11/.env
```
VITE_AUTH_URL=https://api.propiedadesarquisis.me/auth
VITE_API_BASE_URL=https://api.propiedadesarquisis.me/api
```

### 2. Base de Datos:
1. Crear base de datos en PostgreSQL
```
sudo -u postgres psql
# Dentro del prompt de PostgreSQL ejecutar:
CREATE DATABASE nombre_base_de_datos;
CREATE USER nombre_de_usuario WITH ENCRYPTED PASSWORD 'contraseña_de_usuario';
GRANT ALL PRIVILEGES ON DATABASE nombre_base_de_datos TO nombre_de_usuario;
\q
```

2. Migrar modelos:\
`npx sequelize db:migrate`

### 3. Instalar Dependencias:
En cada uno de los servicios (api, auth-service y frontend) ejercutar el siguiente comando:
`npm install`

### 4. Ejectuar backend con Docker
```
docker compose build #construir
docker compose up #levantar
docker ps #ver estado
```

### 5. Ejectuar frontend
Dentro del repositorio de frontend `cd frontend-iic2173-g11`\
Ejecutar `npm run dev`\
Abrir http://localhost:5173