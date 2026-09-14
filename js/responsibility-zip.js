/* 將瀏覽器記憶體中的 PNG 包成標準 ZIP（不壓縮）；不使用第三方服務。 */
(function () {
  'use strict';
  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) {
      crc ^= bytes[i];
      for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }
  async function create(files) {
    if (!files.length || files.length > 100 || files.reduce((sum, file) => sum + file.size, 0) > 64 * 1024 * 1024) {
      throw new Error('整批圖片過大，請改用各區塊的單張分享。');
    }
    const encoder = new TextEncoder();
    const localParts = [], directory = [];
    let offset = 0, directorySize = 0;
    for (const file of files) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const name = encoder.encode(file.name.replace(/[\\/]/g, '_'));
      const crc = crc32(bytes);
      const local = new Uint8Array(30 + name.length);
      const l = new DataView(local.buffer);
      l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true);
      l.setUint16(6, 0x0800, true); // UTF-8 檔名。
      l.setUint16(12, 33, true); // 1980-01-01，固定有效 DOS 日期，避免受裝置時區影響。
      l.setUint32(14, crc, true); l.setUint32(18, bytes.length, true); l.setUint32(22, bytes.length, true);
      l.setUint16(26, name.length, true); local.set(name, 30);
      localParts.push(local, bytes);
      const central = new Uint8Array(46 + name.length);
      const c = new DataView(central.buffer);
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true);
      c.setUint16(8, 0x0800, true); c.setUint16(14, 33, true);
      c.setUint32(16, crc, true); c.setUint32(20, bytes.length, true); c.setUint32(24, bytes.length, true);
      c.setUint16(28, name.length, true); c.setUint32(42, offset, true); central.set(name, 46);
      directory.push(central); directorySize += central.length; offset += local.length + bytes.length;
    }
    const end = new Uint8Array(22);
    const e = new DataView(end.buffer);
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, directorySize, true); e.setUint32(16, offset, true);
    return new Blob([...localParts, ...directory, end], {type:'application/zip'});
  }
  window.ResponsibilityZip = {create:create};
})();
