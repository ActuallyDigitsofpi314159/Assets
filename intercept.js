// ============================================================
// KA CSP INTERCEPTOR SHIM (Inject before eagler-loader-2.js)
// ============================================================
(function() {
  // 1. IN-MEMORY ASSET STORE
  // Place your base64 EPK or assets here
  window.EAGLER_EPK_DATA = window.EAGLER_EPK_DATA || null; 

  // Utility: Convert Base64 string to Uint8Array/ArrayBuffer
  window.base64ToBuffer = function(base64) {
    var binary = window.atob(base64);
    var buffer = new ArrayBuffer(binary.length);
    var bytes = new Uint8Array(buffer);
    for (var i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i) & 0xFF;
    }
    return buffer;
  };

  // 2. INTERCEPT XHR REQUESTS (Bypasses network fetch for assets.epk)
  var OriginalXHR = window.XMLHttpRequest;
  function PatchedXHR() {
    var xhr = new OriginalXHR();
    var targetUrl = '';

    var origOpen = xhr.open;
    xhr.open = function(method, url) {
      targetUrl = url;
      return origOpen.apply(this, arguments);
    };

    var origSend = xhr.send;
    xhr.send = function(body) {
      // Intercept requests targeting assets.epk or local asset endpoints
      if (targetUrl.indexOf('assets.epk') !== -1 && window.EAGLER_EPK_DATA) {
        var buffer = (typeof window.EAGLER_EPK_DATA === 'string') 
          ? window.base64ToBuffer(window.EAGLER_EPK_DATA) 
          : window.EAGLER_EPK_DATA;

        // Simulate successful local network completion
        Object.defineProperty(xhr, 'status', { value: 200 });
        Object.defineProperty(xhr, 'readyState', { value: 4 });
        Object.defineProperty(xhr, 'response', { value: buffer });
        Object.defineProperty(xhr, 'responseText', { value: '' });

        setTimeout(function() {
          if (typeof xhr.onload === 'function') xhr.onload();
          if (typeof xhr.onreadystatechange === 'function') xhr.onreadystatechange();
        }, 10);
        return;
      }
      return origSend.apply(this, arguments);
    };

    return xhr;
  }
  window.XMLHttpRequest = PatchedXHR;

  // 3. INTERCEPT WEBGL TEXTURE BINDING (Bypasses HTMLImageElement decoding)
  if (window.WebGLRenderingContext) {
    var origTexImage2D = WebGLRenderingContext.prototype.texImage2D;
    WebGLRenderingContext.prototype.texImage2D = function() {
      var args = Array.prototype.slice.call(arguments);
      
      // If TeaVM passes an HTMLImageElement that failed CSP loading, replace with fallback buffer
      var lastArg = args[args.length - 1];
      if (lastArg && (lastArg instanceof HTMLImageElement) && (!lastArg.complete || lastArg.naturalWidth === 0)) {
        // Fallback: 1x1 magenta placeholder pixel buffer [R, G, B, A]
        var placeholderPixels = new Uint8Array([255, 0, 255, 255]);
        
        // Re-route call signature to raw byte upload: texImage2D(target, level, internalformat, width, height, border, format, type, pixels)
        return origTexImage2D.call(
          this, 
          args[0], // target (gl.TEXTURE_2D)
          args[1], // level
          this.RGBA, // internalformat
          1, 1, 0,  // width, height, border
          this.RGBA, // format
          this.UNSIGNED_BYTE, // type
          placeholderPixels
        );
      }
      
      return origTexImage2D.apply(this, args);
    };
  }

  console.log('[KA Interceptor] Network & WebGL hooks active.');
})();
