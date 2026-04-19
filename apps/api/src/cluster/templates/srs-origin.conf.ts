export interface SrsOriginSettings {
  hlsFragment: number;
  hlsWindow: number;
  hlsEncryption: boolean;
  rtmpPort: number;
  httpPort: number;
  apiPort: number;
}

export function generateOriginSrsConfig(settings: SrsOriginSettings): string {
  const hlsKeysBlock = settings.hlsEncryption
    ? `        hls_keys        on;
        hls_fragments_per_key 10;
        hls_key_file    [app]/[stream]-[seq].key;
        hls_key_file_path /usr/local/srs/objs/nginx/html;
        hls_key_url     /keys/[app]/[stream]-[seq].key;\n`
    : '';

  return `listen              ${settings.rtmpPort};
max_connections     1000;
daemon              off;
srs_log_tank        console;

http_server {
    enabled         on;
    listen          ${settings.httpPort};
}

http_api {
    enabled         on;
    listen          ${settings.apiPort};
}

stats {
    network         0;
}

vhost __defaultVhost__ {
    hls {
        enabled         on;
        hls_fragment    ${settings.hlsFragment};
        hls_window      ${settings.hlsWindow};
        hls_cleanup     on;
        hls_dispose     30;
        hls_wait_keyframe on;
${hlsKeysBlock}    }

    http_hooks {
        enabled         on;
        on_publish      http://api:3001/api/srs/callbacks/on-publish;
        on_unpublish    http://api:3001/api/srs/callbacks/on-unpublish;
        on_play         http://api:3001/api/srs/callbacks/on-play;
        on_stop         http://api:3001/api/srs/callbacks/on-stop;
        on_hls          http://api:3001/api/srs/callbacks/on-hls;
        on_dvr          http://api:3001/api/srs/callbacks/on-dvr;
    }

    rtc {
        enabled     on;
        rtmp_to_rtc on;
    }
}
`;
}
