/*
 * XZDS Local QR v1.0.0R1
 * - 完全在瀏覽器本機產生 QR Code，不呼叫第三方 QR API。
 * - 固定 QR Version 1 / Error Correction L / Byte mode。
 * - 適用最多 17 bytes 的道親編號。
 */
(function (root) {
  'use strict';

  const SIZE = 21;
  const DATA_CODEWORDS = 19;
  const ECC_CODEWORDS = 7;
  const TOTAL_CODEWORDS = 26;
  const G15 = 0x0537;
  const G15_MASK = 0x5412;

  const GF_EXP = new Array(512);
  const GF_LOG = new Array(256);
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) GF_EXP[i] = GF_EXP[i - 255];

  function gfMul(a, b) {
    if (!a || !b) return 0;
    return GF_EXP[GF_LOG[a] + GF_LOG[b]];
  }

  function polyMultiply(a, b) {
    const out = new Array(a.length + b.length - 1).fill(0);
    for (let i = 0; i < a.length; i += 1) {
      for (let j = 0; j < b.length; j += 1) {
        out[i + j] ^= gfMul(a[i], b[j]);
      }
    }
    return out;
  }

  function generatorPolynomial(degree) {
    let poly = [1];
    for (let i = 0; i < degree; i += 1) {
      poly = polyMultiply(poly, [1, GF_EXP[i]]);
    }
    return poly;
  }

  const RS_GENERATOR = generatorPolynomial(ECC_CODEWORDS);

  function appendBits(target, value, length) {
    for (let i = length - 1; i >= 0; i -= 1) {
      target.push(((value >>> i) & 1) === 1 ? 1 : 0);
    }
  }

  function textToAsciiBytes(text) {
    const value = String(text == null ? '' : text);
    const bytes = [];
    for (let i = 0; i < value.length; i += 1) {
      const code = value.charCodeAt(i);
      if (code > 0xff) {
        throw new Error('QR 內容需為英數道親編號。');
      }
      bytes.push(code);
    }
    if (bytes.length < 1) throw new Error('QR 內容不可空白。');
    if (bytes.length > 17) throw new Error('道親編號過長，無法使用目前 QR 格式。');
    return bytes;
  }

  function buildDataCodewords(text) {
    const bytes = textToAsciiBytes(text);
    const bits = [];

    appendBits(bits, 0x4, 4); // Byte mode
    appendBits(bits, bytes.length, 8); // Version 1 byte-count indicator
    bytes.forEach(function (byte) {
      appendBits(bits, byte, 8);
    });

    const capacity = DATA_CODEWORDS * 8;
    const terminator = Math.min(4, capacity - bits.length);
    for (let i = 0; i < terminator; i += 1) bits.push(0);
    while (bits.length % 8) bits.push(0);

    const data = [];
    for (let i = 0; i < bits.length; i += 8) {
      let value = 0;
      for (let j = 0; j < 8; j += 1) value = (value << 1) | bits[i + j];
      data.push(value);
    }

    let pad = true;
    while (data.length < DATA_CODEWORDS) {
      data.push(pad ? 0xec : 0x11);
      pad = !pad;
    }

    return data;
  }

  function buildEcc(data) {
    const work = data.slice();
    for (let i = 0; i < ECC_CODEWORDS; i += 1) work.push(0);

    for (let i = 0; i < data.length; i += 1) {
      const factor = work[i];
      if (!factor) continue;
      for (let j = 0; j < RS_GENERATOR.length; j += 1) {
        work[i + j] ^= gfMul(RS_GENERATOR[j], factor);
      }
    }

    return work.slice(data.length);
  }

  function createEmptyMatrix() {
    return Array.from({ length: SIZE }, function () {
      return new Array(SIZE).fill(null);
    });
  }

  function setupFinder(matrix, row, col) {
    for (let r = -1; r <= 7; r += 1) {
      if (row + r < 0 || row + r >= SIZE) continue;
      for (let c = -1; c <= 7; c += 1) {
        if (col + c < 0 || col + c >= SIZE) continue;
        const black =
          r >= 0 && r <= 6 && c >= 0 && c <= 6 &&
          (r === 0 || r === 6 || c === 0 || c === 6 ||
            (r >= 2 && r <= 4 && c >= 2 && c <= 4));
        matrix[row + r][col + c] = !!black;
      }
    }
  }

  function setupTiming(matrix) {
    for (let i = 8; i < SIZE - 8; i += 1) {
      if (matrix[i][6] === null) matrix[i][6] = i % 2 === 0;
      if (matrix[6][i] === null) matrix[6][i] = i % 2 === 0;
    }
  }

  function bchDigit(value) {
    let digit = 0;
    let v = value;
    while (v !== 0) {
      digit += 1;
      v >>>= 1;
    }
    return digit;
  }

  function formatBits(mask) {
    const data = (1 << 3) | mask; // EC level L = 01
    let d = data << 10;
    while (bchDigit(d) - bchDigit(G15) >= 0) {
      d ^= G15 << (bchDigit(d) - bchDigit(G15));
    }
    return ((data << 10) | d) ^ G15_MASK;
  }

  function setupFormat(matrix, mask, test) {
    const bits = formatBits(mask);
    for (let i = 0; i < 15; i += 1) {
      const black = !test && (((bits >>> i) & 1) === 1);

      if (i < 6) matrix[i][8] = black;
      else if (i < 8) matrix[i + 1][8] = black;
      else matrix[SIZE - 15 + i][8] = black;

      if (i < 8) matrix[8][SIZE - i - 1] = black;
      else if (i < 9) matrix[8][15 - i] = black;
      else matrix[8][15 - i - 1] = black;
    }
    matrix[SIZE - 8][8] = !test;
  }

  function maskBit(mask, row, col) {
    switch (mask) {
      case 0: return (row + col) % 2 === 0;
      case 1: return row % 2 === 0;
      case 2: return col % 3 === 0;
      case 3: return (row + col) % 3 === 0;
      case 4: return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
      case 5: return ((row * col) % 2) + ((row * col) % 3) === 0;
      case 6: return ((((row * col) % 2) + ((row * col) % 3)) % 2) === 0;
      case 7: return ((((row * col) % 3) + ((row + col) % 2)) % 2) === 0;
      default: return false;
    }
  }

  function mapData(matrix, codewords, mask) {
    let row = SIZE - 1;
    let direction = -1;
    let byteIndex = 0;
    let bitIndex = 7;

    for (let col = SIZE - 1; col > 0; col -= 2) {
      if (col === 6) col -= 1;

      while (true) {
        for (let offset = 0; offset < 2; offset += 1) {
          const c = col - offset;
          if (matrix[row][c] !== null) continue;

          let dark = false;
          if (byteIndex < codewords.length) {
            dark = (((codewords[byteIndex] >>> bitIndex) & 1) === 1);
          }
          if (maskBit(mask, row, c)) dark = !dark;
          matrix[row][c] = dark;

          bitIndex -= 1;
          if (bitIndex < 0) {
            byteIndex += 1;
            bitIndex = 7;
          }
        }

        row += direction;
        if (row < 0 || row >= SIZE) {
          row -= direction;
          direction = -direction;
          break;
        }
      }
    }
  }

  function makeMatrix(codewords, mask, test) {
    const matrix = createEmptyMatrix();
    setupFinder(matrix, 0, 0);
    setupFinder(matrix, SIZE - 7, 0);
    setupFinder(matrix, 0, SIZE - 7);
    setupTiming(matrix);
    setupFormat(matrix, mask, test);
    mapData(matrix, codewords, mask);
    return matrix;
  }

  function lostPoint(matrix) {
    let lost = 0;

    for (let row = 0; row < SIZE; row += 1) {
      for (let col = 0; col < SIZE; col += 1) {
        let sameCount = 0;
        const dark = matrix[row][col];
        for (let r = -1; r <= 1; r += 1) {
          if (row + r < 0 || row + r >= SIZE) continue;
          for (let c = -1; c <= 1; c += 1) {
            if (col + c < 0 || col + c >= SIZE || (r === 0 && c === 0)) continue;
            if (dark === matrix[row + r][col + c]) sameCount += 1;
          }
        }
        if (sameCount > 5) lost += 3 + sameCount - 5;
      }
    }

    for (let row = 0; row < SIZE - 1; row += 1) {
      for (let col = 0; col < SIZE - 1; col += 1) {
        let count = 0;
        if (matrix[row][col]) count += 1;
        if (matrix[row + 1][col]) count += 1;
        if (matrix[row][col + 1]) count += 1;
        if (matrix[row + 1][col + 1]) count += 1;
        if (count === 0 || count === 4) lost += 3;
      }
    }

    for (let row = 0; row < SIZE; row += 1) {
      for (let col = 0; col < SIZE - 6; col += 1) {
        if (
          matrix[row][col] && !matrix[row][col + 1] && matrix[row][col + 2] &&
          matrix[row][col + 3] && matrix[row][col + 4] && !matrix[row][col + 5] &&
          matrix[row][col + 6]
        ) lost += 40;
      }
    }

    for (let col = 0; col < SIZE; col += 1) {
      for (let row = 0; row < SIZE - 6; row += 1) {
        if (
          matrix[row][col] && !matrix[row + 1][col] && matrix[row + 2][col] &&
          matrix[row + 3][col] && matrix[row + 4][col] && !matrix[row + 5][col] &&
          matrix[row + 6][col]
        ) lost += 40;
      }
    }

    let darkCount = 0;
    for (let row = 0; row < SIZE; row += 1) {
      for (let col = 0; col < SIZE; col += 1) {
        if (matrix[row][col]) darkCount += 1;
      }
    }
    const ratio = Math.abs(100 * darkCount / (SIZE * SIZE) - 50) / 5;
    lost += ratio * 10;
    return lost;
  }

  function createMatrix(text) {
    const data = buildDataCodewords(text);
    const ecc = buildEcc(data);
    const codewords = data.concat(ecc);
    if (codewords.length !== TOTAL_CODEWORDS) throw new Error('QR codeword 長度錯誤。');

    let bestMask = 0;
    let bestScore = Infinity;
    for (let mask = 0; mask < 8; mask += 1) {
      const testMatrix = makeMatrix(codewords, mask, true);
      const score = lostPoint(testMatrix);
      if (score < bestScore) {
        bestScore = score;
        bestMask = mask;
      }
    }
    return makeMatrix(codewords, bestMask, false);
  }

  function drawMatrix(canvas, matrix, options) {
    if (!canvas || !matrix) return;
    const opts = options || {};
    const quiet = Number.isFinite(opts.quiet) ? opts.quiet : 4;
    const pixels = Number.isFinite(opts.size) ? opts.size : 480;
    const moduleCount = matrix.length + quiet * 2;
    const scale = Math.max(1, Math.floor(pixels / moduleCount));
    const actual = moduleCount * scale;
    canvas.width = actual;
    canvas.height = actual;

    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, actual, actual);
    ctx.fillStyle = '#000000';

    matrix.forEach(function (row, r) {
      row.forEach(function (dark, c) {
        if (!dark) return;
        ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
      });
    });
  }

  root.XZDSLocalQR = {
    version: 'v1.0.0R1',
    createMatrix: createMatrix,
    drawMatrix: drawMatrix
  };
})(typeof window !== 'undefined' ? window : globalThis);
