/**
 * Grounded Saves — image-util.js
 * 客户端 Canvas 图片压缩工具（PNG → WebP）
 * 暴露 window.ImageUtil.compressImage(file, options)
 */
(function () {
  'use strict';

  /**
   * 加载图片文件为 HTMLImageElement
   */
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('无法加载图片: ' + file.name));
      img.src = URL.createObjectURL(file);
    });
  }

  /**
   * Canvas 导出为 Blob
   */
  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), type, quality);
    });
  }

  /**
   * Blob 转 Base64 字符串
   */
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        // 去掉 data:image/webp;base64, 前缀
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = () => reject(new Error('读取文件失败'));
      reader.readAsDataURL(blob);
    });
  }

  /**
   * 压缩图片为 WebP，生成完整图和缩略图两个版本。
   *
   * @param {File} file - 原始图片文件
   * @param {Object} options
   * @param {number} [options.fullMax=1920] - 完整图最长边像素
   * @param {number} [options.fullQuality=0.85] - 完整图 WebP 质量 (0-1)
   * @param {number} [options.thumbWidth=400] - 缩略图宽度像素
   * @param {number} [options.thumbQuality=0.82] - 缩略图 WebP 质量 (0-1)
   * @returns {Promise<{fullBlob: Blob, thumbBlob: Blob, fullBase64: string, thumbBase64: string, width: number, height: number}>}
   */
  async function compressImage(file, options) {
    const fullMax = options?.fullMax || 1920;
    const fullQuality = options?.fullQuality ?? 0.85;
    const thumbWidth = options?.thumbWidth || 400;
    const thumbQuality = options?.thumbQuality ?? 0.82;

    const img = await loadImage(file);
    const origW = img.naturalWidth;
    const origH = img.naturalHeight;

    // --- 完整图：最长边缩放到 fullMax ---
    const scale = Math.min(fullMax / origW, fullMax / origH, 1);
    const fullW = Math.round(origW * scale);
    const fullH = Math.round(origH * scale);

    const fullCanvas = document.createElement('canvas');
    fullCanvas.width = fullW;
    fullCanvas.height = fullH;
    const fCtx = fullCanvas.getContext('2d');
    fCtx.imageSmoothingEnabled = true;
    fCtx.imageSmoothingQuality = 'high';
    fCtx.drawImage(img, 0, 0, fullW, fullH);
    const fullBlob = await canvasToBlob(fullCanvas, 'image/webp', fullQuality);

    // --- 缩略图：固定宽度，16:9 居中裁剪 ---
    const thumbScale = thumbWidth / fullW;
    const thumbH = Math.round(fullH * thumbScale);
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = thumbWidth;
    // 使用 16:10 比例（更适合游戏截图）
    const tAspect = 16 / 10;
    const tH = Math.round(thumbWidth / tAspect);
    thumbCanvas.height = Math.min(thumbH, tH);
    const tCtx = thumbCanvas.getContext('2d');
    tCtx.imageSmoothingEnabled = true;
    tCtx.imageSmoothingQuality = 'high';

    // 居中裁剪
    const sw = fullW;
    const sh = Math.round(fullW / tAspect);
    const syOffset = Math.max(0, Math.round((fullH - sh) / 2));
    tCtx.drawImage(fullCanvas, 0, syOffset, sw, sh, 0, 0, thumbWidth, tH);
    const thumbBlob = await canvasToBlob(thumbCanvas, 'image/webp', thumbQuality);

    // --- 转 Base64 ---
    const fullBase64 = await blobToBase64(fullBlob);
    const thumbBase64 = await blobToBase64(thumbBlob);

    // 清理
    URL.revokeObjectURL(img.src);

    return {
      fullBlob,
      thumbBlob,
      fullBase64,
      thumbBase64,
      width: fullW,
      height: fullH,
    };
  }

  // 暴露到全局
  window.ImageUtil = { compressImage, blobToBase64 };
})();
