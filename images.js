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
        statusDiv.innerText = 'Initializing...';
        document.body.appendChild(statusDiv);
    }

    let gameFrame = document.getElementById('game_frame');
    if (!gameFrame) {
        gameFrame = document.createElement('div');
        gameFrame.id = 'game_frame';
        gameFrame.tabIndex = 0;
        gameFrame.style.cssText = 'width: 100vw; height: 100vh; background-color: #000; position: absolute; top: 0; left: 0; overflow: hidden;';
        document.body.appendChild(gameFrame);
    }
    gameFrame.innerHTML = '';

    let canvas = document.createElement('canvas');
    canvas.id = 'game-canvas';
    canvas.style.cssText = 'width: 100%; height: 100%; display: block;';
    gameFrame.appendChild(canvas);

    log('Canvas created and appended');

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

        log('=== STAGE 2: Decode Base64 ===');
        base64ToUint8ArrayAsync(rawBase64, 131072, function(p) {
            log('Decoding: ' + p + '%');
        }).then(function(gzipData) {
            log('Decoded ' + gzipData.length + ' bytes');
            log('=== STAGE 3: Decompress ===');

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

            log('=== STAGE 4: Installing patches ===');
            
            // Install patches BEFORE engine code
            console.log('[PATCHES] Initializing asset interception...');
            window.onerror = function(msg, url, line, col, err) { console.error('[ERROR]', msg); return true; };
            window.onunhandledrejection = function(evt) { console.error('[ERROR]', evt.reason); evt.preventDefault(); };
            
            let _nativeFetch = window.fetch;
            window.fetch = function(input, init) {
                let url = typeof input === 'string' ? input : (input && input.url ? input.url : String(input));
                if (url && url.indexOf('data:') === 0) {
                    return new Promise(function(resolve) {
                        try {
                            let commaIdx = url.indexOf(',');
                            let isBase64 = url.indexOf('base64') !== -1;
                            let dataPart = url.substring(commaIdx + 1);
                            let raw = isBase64 ? atob(dataPart) : decodeURIComponent(dataPart);
                            let arr = new Uint8Array(raw.length);
                            for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
                            let mimeMatch = url.match(/data:(.*?)[;,]/);
                            let mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
                            resolve(new Response(arr.buffer, { status: 200, headers: { 'Content-Type': mime } }));
                        } catch (e) {
                            console.error('[PATCHES] Fetch error:', e);
                            resolve(new Response(new ArrayBuffer(0), { status: 500 }));
                        }
                    });
                }
                return _nativeFetch.apply(this, arguments);
            };

            let origCreateElement = document.createElement;
            document.createElement = function(tagName, options) {
                if (tagName && tagName.toLowerCase && tagName.toLowerCase() === 'img') {
                    console.log('[PATCHES] Creating mock image');
                    let mockImg = {
                        _src: '', _bitmap: null, width: 0, height: 0, naturalWidth: 0, naturalHeight: 0, complete: false,
                        onload: null, onerror: null,
                        get src() { return this._src; },
                        set src(url) {
                            this._src = url;
                            let self = this;
                            if (!url) return;
                            fetch(url).then(function(r) { return r.blob(); }).then(function(blob) {
                                return createImageBitmap(blob);
                            }).then(function(bm) {
                                self._bitmap = bm; self.width = bm.width; self.height = bm.height;
                                self.naturalWidth = bm.width; self.naturalHeight = bm.height; self.complete = true;
                                if (self.onload) self.onload();
                            }).catch(function(err) {
                                console.error('[PATCHES] Mock image load failed:', err);
                                if (self.onerror) self.onerror(err);
                            });
                        },
                        __isMockImage: true,
                        addEventListener: function(t, cb) { },
                        removeEventListener: function(t, cb) { }
                    };
                    return mockImg;
                }
                return origCreateElement.call(this, tagName, options);
            };

            let _origDrawImage = CanvasRenderingContext2D.prototype.drawImage;
            CanvasRenderingContext2D.prototype.drawImage = function(img) {
                if (img && img.__isMockImage && img._bitmap) {
                    let args = Array.prototype.slice.call(arguments);
                    args[0] = img._bitmap;
                    return _origDrawImage.apply(this, args);
                }
                return _origDrawImage.apply(this, arguments);
            };

            function patchGL(proto) {
                if (!proto) return;
                let _origTex = proto.texImage2D;
                if (_origTex) {
                    proto.texImage2D = function() {
                        let args = Array.prototype.slice.call(arguments);
                        let last = args[args.length - 1];
                        if (last && last.__isMockImage && last._bitmap) args[args.length - 1] = last._bitmap;
                        return _origTex.apply(this, args);
                    };
                }
            }
            patchGL(WebGLRenderingContext.prototype);
            patchGL(WebGL2RenderingContext.prototype);

            console.log('[PATCHES] All patches installed successfully');

            log('=== STAGE 5: Injecting engine code ===');
            window.minecraftOpts = ['game_frame', ''];
            window.eaglercraftXOpts = {
                container: 'game_frame',
                canvas: canvas,
                assetsURI: '',
                localesURI: '',
                joinServer: ''
            };

            let engineScript = document.createElement('script');
            engineScript.textContent = codeText;
            document.body.appendChild(engineScript);

            log('Engine injected! Loading...');
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
        log('Asset pack loaded!');
        setTimeout(initEngine, 100);
    };
    assetScript.onerror = function() {
        log('ERROR: Asset script failed');
    };
    document.head.appendChild(assetScript);
})();
