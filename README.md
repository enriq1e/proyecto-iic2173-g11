## Entregar en .zip:
- Llave .pem
- Credenciales IAM
- Copia de este README.md

## README.md:
- Niveles de logro
- Link a la API
- IP de su instancia

## Link API
- http://3.15.179.230:3001/properties

## IP Instancia
- ec2-3-15-179-230.us-east-2.compute.amazonaws.com
- Conectarse por medio de ssh 

## Niveles de Logro - Parte Mínima:

### Requisitos Funcionales:
- RF1: Logrado 
- RF2: Logrado
- RF3: Logrado
- RF4: Logrado

***Consideraciones: Para guardar las propiedades agregé el campo "offers", este representa la cantidad de ofertas que tiene esa propiedad, de esta forma no guardo repeditos teniendo en cuenta lo que se dijo en el Slack del curso: https://arqui-software.slack.com/archives/C038D7UC07M/p1755186133654859***

### Requisitos No Funcionales:
- RNF1: Logrado
- RNF2: No Logrado
- RNF3: Logrado
- RNF4: Logrado
- RNF5: Logrado*
- RNF6: Logrado

***Consideración: Para el RNF2 necesitaba un dominio gratis, pero activé el GithubStudens el Domingo, y el Lunes aún no se activaban las promociones y aparecia el siguiente mensaje: "We're still processing your application. Once this is complete you will have access to the student developer pack offers.", por lo que no pude asignarle un dominio de Namecheap.***

***Consideración: Para el RNF5 se indica que "debe haber una base de datos Postgres o Mongo externa", esto lo entendí como que la base de datos debia estar en su propio contenedor de docker y eso es lo que hice, habiendo 3 contenedores: el de la API, el de la conexión al Broker y el de la Base de Datos. Esto teniendo en cuenta lo que se dijo en el Slack del curso: https://arqui-software.slack.com/archives/C038D7UC07M/p1755029024037739***

### Docker-Compose
- RNF1: Logrado
- RNF2: Logrado
- RNF3: Logrado

## Niveles de Logro - Parte Variable - Balanceo de Carga con Nginx

- RF1: Logrado
- RF2: Logrado
