# https://docs.nginx.com/nginx/admin-guide/web-server/reverse-proxy/

# Example of NGINX configured as a reverse-proxy server with load balancer.
upstream api_balancer {
    # https://www.nginx.com/blog/choosing-nginx-plus-load-balancing-techniques
    server localhost:3000;
    server localhost:3001;
    server localhost:3002;
}

server {
    listen 80;
    server_name _;
    location / {
        # To pass a request to an HTTP proxied server
        proxy_pass http://api_balancer;

        # NGINX redefines two header fields in proxied requests,
        # “Host” and “Connection”, and eliminates the header
        # fields whose values are empty strings

        # https://www.nginx.com/resources/wiki/start/topics/examples/forwarded/
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        # http://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_redirect
        # To not redirect, but to proxy
        proxy_redirect off;
    }
}

# Este es el archivo que configura Nginx en la EC2, lo copio aqui para que sea mas facil de ver, pero esta 
# donde debe estar en el EC2 /etc/nginx/sites-enabled/ y con el nombre api.conf