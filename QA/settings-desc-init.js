window.__LUDUS_NATIVE__ = true; window.__LUDUS_LOGIN__ = false; window.__LUDUS_DOCK__ = false; window.__LUDUS_INVISIBLE__ = false;
window.__LUDUS_PLATFORM__ = window.__PLAT || 'mac'; window.__LUDUS_ORIGINAL_NAMES__ = { climb: 'Getting Over It' };
window.webkit = { messageHandlers: { ludus: { postMessage() {} } } }; window.chrome = window.chrome || {}; window.chrome.webview = { postMessage() {}, addEventListener() {} };
