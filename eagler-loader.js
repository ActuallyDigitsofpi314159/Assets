(function() {
    let logs = [];
    function log(msg) {
        logs.push(msg);
        console.log(msg);
        let el = document.getElementById('status-log');
        if (el) {
            el.innerText = logs.slice(-6).join('\n');
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

            let htmlPart1 = '<!DOCTYPE html>' +
                '<html lang="en">' +
                '<head>' +
                '<meta charset="UTF-8">' +
                '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
                '<title>EaglercraftX Sandbox</title>' +
                '<style>' +
                '* { margin: 0; padding: 0; box-sizing: border-box; overflow: hidden; }' +
                'html, body, #game_frame { width: 100vw; height: 100vh; background-color: #000; position: relative; }' +
                '#game-canvas { width: 100%; height: 100%; display: block; touch-action: none; }' +
                '</style>' +
                '</head>' +
                '<body>' +
                '<div id="game_frame" tabindex="0">' +
                '<canvas id="game-canvas"></canvas>' +
                '</div>' +
                '<script>' +
                // Robust helper to convert data: image URLs to blob: URLs dynamically
                'function _convertDataUrl(url) {' +
                '    if (typeof url !== "string" || url.indexOf("data:") !== 0) return url;' +
                '    try {' +
                '        let commaIdx = url.indexOf(",");' +
                '        let dataPart = url.substring(commaIdx + 1);' +
                '        let mimeMatch = url.match(new RegExp("data:(.*?);"));' +
                '        let mime = mimeMatch ? mimeMatch[1] : "image/png";' +
                '        let isBase64 = url.indexOf("base64") !== -1;' +
                '        let raw = isBase64 ? atob(dataPart) : decodeURIComponent(dataPart);' +
                '        let arr = new Uint8Array(raw.length);' +
                '        let i = 0;' +
                '        while (i < raw.length) {' +
                '            arr[i] = raw.charCodeAt(i);' +
                '            i++;' +
                '        }' +
                '        let blob = new Blob([arr], { type: mime });' +
                '        return URL.createObjectURL(blob);' +
                '    } catch (e) { return url; }' +
                '}' +
                // Intercept HTMLImageElement .src property setter
                'let _imgDesc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");' +
                'if (_imgDesc && _imgDesc.set) {' +
                '    Object.defineProperty(HTMLImageElement.prototype, "src", {' +
                '        set: function(url) {' +
                '            return _imgDesc.set.call(this, _convertDataUrl(url));' +
                '        },' +
                '        get: function() {' +
                '            return _imgDesc.get.call(this);' +
                '        }' +
                '    });' +
                '}' +
                // Intercept setAttribute for img elements
                'let _origSetAttribute = Element.prototype.setAttribute;' +
                'Element.prototype.setAttribute = function(name, value) {' +
                '    if (name === "src" && this.tagName === "IMG") {' +
                '        value = _convertDataUrl(value);' +
                '    }' +
                '    return _origSetAttribute.call(this, name, value);' +
                '};' +
                'window.minecraftOpts = ["game_frame", ""];' +
                'window.eaglercraftXOpts = {' +
                '    container: "game_frame",' +
                '    canvas: document.getElementById("game-canvas"),' +
                '    assetsURI: "",' +
                '    localesURI: "",' +
                '    joinServer: ""' +
                '};' +
                'let _nativeFetch = window.fetch;' +
                'window.fetch = function(input, init) {' +
                '    let url = typeof input === "string" ? input : (input && input.url ? input.url : String(input));' +
                '    if (url && url.indexOf("data:") === 0) {' +
                '        return new Promise(function(resolve) {' +
                '            try {' +
                '                let commaIdx = url.indexOf(",");' +
                '                let isBase64 = url.indexOf("base64") !== -1;' +
                '                let dataPart = url.substring(commaIdx + 1);' +
                '                let raw = isBase64 ? atob(dataPart) : decodeURIComponent(dataPart);' +
                '                let arr = new Uint8Array(raw.length);' +
                '                let i = 0;' +
                '                while (i < raw.length) {' +
                '                    arr[i] = raw.charCodeAt(i);' +
                '                    i++;' +
                '                }' +
                '                let mimeMatch = url.match(new RegExp("data:(.*?);"));' +
                '                let mime = mimeMatch ? mimeMatch[1] : "application/octet-stream";' +
                '                resolve(new Response(arr.buffer, { status: 200, statusText: "OK", headers: {"Content-Type": mime} }));' +
                '            } catch (e) { resolve(new Response(new ArrayBuffer(0), { status: 500 })); }' +
                '        });' +
                '    }' +
                '    return _nativeFetch.apply(this, arguments);' +
                '};' +
                'let _xopen = XMLHttpRequest.prototype.open;' +
                'XMLHttpRequest.prototype.open = function(method, url) {' +
                '    this._isDataBlob = (typeof url === "string" && url.indexOf("data:") === 0);' +
                '    if (this._isDataBlob) { this._targetDataUrl = url; arguments[1] = window.location.pathname + "?_mock=1"; }' +
                '    return _xopen.apply(this, arguments);' +
                '};' +
                'let _xsend = XMLHttpRequest.prototype.send;' +
                'XMLHttpRequest.prototype.send = function() {' +
                '    if (!this._isDataBlob) return _xsend.apply(this, arguments);' +
                '    let self = this; let u = this._targetDataUrl;' +
                '    setTimeout(function() {' +
                '        fetch(u).then(function(res) { return res.arrayBuffer(); }).then(function(buf) {' +
                '            Object.defineProperty(self, "readyState", { value: 4, writable: true });' +
                '            Object.defineProperty(self, "status", { value: 200, writable: true });' +
                '            Object.defineProperty(self, "response", { value: buf, writable: true });' +
                '            Object.defineProperty(self, "responseText", { value: new TextDecoder().decode(buf), writable: true });' +
                '            if (self.onload) self.onload();' +
                '            if (self.onreadystatechange) self.onreadystatechange();' +
                '        }).catch(function(err) { if (self.onerror) self.onerror(err); });' +
                '    }, 0);' +
                '};' +
                '<\/script>' +
                '<script>';

            let htmlPart2 = '<\/script>' +
                '</body>' +
                '</html>';

            let blob = new Blob([htmlPart1, codeText, htmlPart2], { type: 'text/html' });
            let blobUrl = URL.createObjectURL(blob);

            log('=== STAGE 5: Launching Sandbox Frame ===');
            let container = document.getElementById('game_frame');
            container.innerHTML = '';
            let iframe = document.createElement('iframe');
            iframe.src = blobUrl;
            iframe.style.width = '100%';
            iframe.style.height = '100%';
            iframe.style.border = 'none';
            iframe.allow = 'autoplay; fullscreen; xr-spatial-tracking';
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
