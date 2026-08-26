(function() {
    let logs = [];
    function log(msg) {
        logs.push(msg);
        console.log(msg);
        let el = document.getElementById('status-log');
        if (el) {
            el.innerText = logs.slice(-8).join('\n');
        }
    }

    if (!document.getElementById('status-log')) {
        let statusDiv = document.createElement('div');
        statusDiv.id = 'status-log';
        statusDiv.style.cssText = 'position: absolute; top: 10px; left: 10px; color: #00ff00; font-family: monospace; font-size: 12px; z-index: 99999; background: rgba(0, 0, 0, 0.9); padding: 10px 12px; border-radius: 4px; max-width: 90vw; word-break: break-all;';
        statusDiv.innerText = 'Initializing external loader...';
        document.body.appendChild(statusDiv);
    }

    if (!document.getElementById('game_frame')) {
        let frameDiv = document.createElement('div');
        frameDiv.id = 'game_frame';
        frameDiv.tabIndex = 0;
        frameDiv.style.cssText = 'width: 100vw; height: 100vh; background-color: #000; position: relative; overflow: hidden;';
        document.body.style.margin = '0';
        document.body.style.overflow = 'hidden';
        document.body.appendChild(frameDiv);
    }

    function base64ToUint8ArrayAsync(base64, chunkSize, onProgress) {
        return new Promise(function(resolve, reject) {
            try {
                let binaryString = window.atob(base64);
                let len = binaryString.length;
                let bytes = new Uint8Array(len);
                let offset = 0;
                let step = chunkSize || 131072;

                function processChunk() {
                    let end = Math.min(offset + step, len);
                    let i = offset;
                    while (i < end) {
                        bytes[i] = binaryString.charCodeAt(i);
                        i++;
                    }
                    offset = end;
                    if (onProgress) {
                        onProgress(Math.floor((offset / len) * 100));
                    }
                    if (offset < len) {
                        setTimeout(processChunk, 4);
                    } else {
                        resolve(bytes);
                    }
                }
                processChunk();
            } catch (err) {
                reject(err);
            }
        });
    }

    function initEngine() {
        log('=== STAGE 1: Check payload ===');
        let rawBase64 = window.EAGLER_GZ_BASE64;
        if (!rawBase64) {
            log('ERROR: No EAGLER_GZ_BASE64 found');
            return;
        }

        log('=== STAGE 2: Decode Base64 (Chunked) ===');
        base64ToUint8ArrayAsync(rawBase64, 131072, function(p) {
            log('Decoding payload: ' + p + '%');
        }).then(function(gzipData) {
            log('Decoded ' + gzipData.length + ' bytes');
            log('=== STAGE 3: Decompress Gzip ===');

            if (typeof DecompressionStream === 'undefined') {
                log('ERROR: DecompressionStream not supported');
                return;
            }

            let ds = new DecompressionStream('gzip');
            let writer = ds.writable.getWriter();
            writer.write(gzipData);
            writer.close();
            
            return new Response(ds.readable).arrayBuffer();
        }).then(function(decompressedBuffer) {
            log('Decompressed to ' + decompressedBuffer.byteLength + ' bytes');
            
            let codeText = new TextDecoder('utf-8').decode(decompressedBuffer);

            let patchCode = '(function setupPatches() { ' +
                'console.log("[PATCHES] Initializing asset interception..."); ' +
                'window.onerror = function(msg, url, line, col, err) { console.error("[PATCHES-ERROR] Global error:", msg); return true; }; ' +
                'window.onunhandledrejection = function(evt) { console.error("[PATCHES-ERROR] Unhandled rejection:", evt.reason); evt.preventDefault(); }; ' +
                'let _nativeFetch = window.fetch; ' +
                'window.fetch = function(input, init) { ' +
                '  let url = typeof input === "string" ? input : (input && input.url ? input.url : String(input)); ' +
                '  if (url && url.indexOf("data:") === 0) { ' +
                '    console.log("[PATCHES] Intercepting data URL fetch"); ' +
                '    return new Promise(function(resolve) { ' +
                '      try { ' +
                '        let commaIdx = url.indexOf(","); ' +
                '        let isBase64 = url.indexOf("base64") !== -1; ' +
                '        let dataPart = url.substring(commaIdx + 1); ' +
                '        let raw = isBase64 ? atob(dataPart) : decodeURIComponent(dataPart); ' +
                '        let arr = new Uint8Array(raw.length); ' +
                '        for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i); ' +
                '        let mimeMatch = url.match(/data:(.*?)[;,]/); ' +
                '        let mime = mimeMatch ? mimeMatch[1] : "application/octet-stream"; ' +
                '        console.log("[PATCHES] Data URL fetch successful, size:", arr.length); ' +
                '        resolve(new Response(arr.buffer, { status: 200, headers: { "Content-Type": mime } })); ' +
                '      } catch (e) { ' +
                '        console.error("[PATCHES] Data URL fetch failed:", e); ' +
                '        resolve(new Response(new ArrayBuffer(0), { status: 500 })); ' +
                '      } ' +
                '    }); ' +
                '  } ' +
                '  return _nativeFetch.apply(this, arguments); ' +
                '}; ' +
                'console.log("[PATCHES] All patches installed successfully"); ' +
                '})();';

            let htmlPart1 = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>EaglercraftX Sandbox</title><style>* { margin: 0; padding: 0; box-sizing: border-box; overflow: hidden; }html, body, #game_frame { width: 100vw; height: 100vh; background-color: #000; position: relative; }#game-canvas { width: 100%; height: 100%; display: block; touch-action: none; }</style></head><body><div id="game_frame" tabindex="0"><canvas id="game-canvas"></canvas></div><script>';

            let htmlPart2 = '</script><script>window.minecraftOpts = ["game_frame", ""]; window.eaglercraftXOpts = { container: "game_frame", canvas: document.getElementById("game-canvas"), assetsURI: "", localesURI: "", joinServer: "" };</script><script>';

            let htmlPart3 = '</script></body></html>';

            let fullHtml = htmlPart1 + patchCode + htmlPart2 + codeText + htmlPart3;
            let blob = new Blob([fullHtml], { type: 'text/html' });
            let blobUrl = URL.createObjectURL(blob);

            log('=== STAGE 5: Launching Sandbox Frame ===');
            let container = document.getElementById('game_frame');
            container.innerHTML = '';
            let iframe = document.createElement('iframe');
            iframe.src = blobUrl;
            iframe.style.width = '100%';
            iframe.style.height = '100%';
            iframe.style.border = 'none';
            iframe.allow = 'autoplay; fullscreen; microphone; camera; xr-spatial-tracking';
            container.appendChild(iframe);

            log('Engine started in isolated sandbox!');
            setTimeout(function() {
                let el = document.getElementById('status-log');
                if (el) el.style.display = 'none';
            }, 3000);
        }).catch(function(err) {
            log('ERROR: ' + (err.message || err));
            console.error(err);
        });
    }

    log('=== Loading asset pack ===');
    let assetScript = document.createElement('script');
    assetScript.src = 'https://cdn.jsdelivr.net/gh/ActuallyDigitsofpi314159/Assets@main/eagler_assets.js';
    assetScript.onload = function() {
        log('Asset pack loaded, unpacking...');
        setTimeout(initEngine, 100);
    };
    assetScript.onerror = function() {
        log('ERROR: Asset script failed to load');
    };
    document.head.appendChild(assetScript);
})();
