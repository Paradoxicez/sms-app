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
    # SettingsService reload endpoint needs raw_api → allow_reload to succeed;
    # without it the POST /api/v1/raw?rpc=reload returns code=1061 and SRS keeps
    # running with its cold-boot config until restart.
    raw_api {
        enabled         on;
        allow_reload    on;
    }
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

    # Phase 19.1 D-18: RTMP push → live remap via backend hook.
    # SRS posts to this URL for every publish and expects
    # { code: 0, data: { urls: ["rtmp://..."] } } in response.
    # Backend returns:
    #   app=push + passthrough → rtmp://127.0.0.1:1935/live/{orgId}/{cameraId}
    #   app=push + transcode   → empty (FFmpeg handles forward)
    #   app=live               → empty (recursion guard)
    forward {
        enabled         on;
        backend         http://api:3001/api/srs/callbacks/on-forward;
    }

    rtc {
        enabled     on;
        rtmp_to_rtc on;
    }
}
`;
}
