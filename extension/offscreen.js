chrome.runtime.onMessage.addListener(async (request) => {
  if (request.target !== 'offscreen') {
    return;
  }
  if (request.type === 'scan-qr-code') {
    if (typeof jsQR === 'undefined') {
      chrome.runtime.sendMessage({ type: 'qr-code-scan-failed', error: 'jsQR not loaded' });
      return;
    }

    const imageData = request.data;
    const canvas = document.getElementById('qr-canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext('2d');
    ctx.putImageData(imageData, 0, 0);
    const code = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
    
    if (code) {
      chrome.runtime.sendMessage({ type: 'qr-code-scanned', data: code.data });
    } else {
      chrome.runtime.sendMessage({ type: 'qr-code-scan-failed' });
    }
  }
});
