export function generateEdgeNginxConfig(originHlsUrl: string, listenPort: number): string {
  return `worker_processes auto;
events {
    worker_connections 10240;
}
http {
    proxy_cache_path /tmp/nginx-cache levels=1:2 keys_zone=srs_cache:8m max_size=1000m inactive=600m;
    proxy_temp_path /tmp/nginx-cache/tmp;

    server {
        listen ${listenPort};

        location /health {
            access_log off;
            return 200 'ok';
            add_header Content-Type text/plain;
        }

        location /nginx_status {
            stub_status on;
            access_log off;
            allow 172.16.0.0/12;
            allow 10.0.0.0/8;
            allow 127.0.0.0/8;
            deny all;
        }

        location ~ /.+/.*\\.(m3u8)$ {
            proxy_pass ${originHlsUrl}$request_uri;
            proxy_cache srs_cache;
            proxy_cache_key $scheme$proxy_host$uri$args;
            proxy_cache_valid 200 302 10s;
            proxy_cache_valid 404 10s;
            proxy_cache_lock on;
            proxy_cache_lock_age 5s;
            proxy_cache_lock_timeout 5s;
        }

        location ~ /.+/.*\\.(ts|m4s|mp4)$ {
            proxy_pass ${originHlsUrl}$request_uri;
            proxy_cache srs_cache;
            proxy_cache_key $scheme$proxy_host$uri;
            proxy_cache_valid 200 302 60m;
            proxy_cache_lock on;
        }

        location ~ /keys/.+\\.key$ {
            proxy_pass ${originHlsUrl}$request_uri;
            proxy_cache off;
        }
    }
}`;
}
