/* 責任歸屬圖片：在已登入頁面的記憶體產生 PNG，不上傳資料至第三方服務。 */
(function () {
  'use strict';
  let file = null;
  let imageUrl = '';
  let sequence = 0;
  let opener = null;
  let bound = false;

  function element(id) { return document.getElementById('responsibilityShare' + id); }
  function message(text) { element('Status').textContent = text; }

  function clearImage() {
    sequence += 1;
    file = null;
    element('Image').hidden = true;
    element('Image').removeAttribute('src');
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    imageUrl = '';
    element('Send').disabled = true;
    element('Download').disabled = true;
  }

  function close() {
    const dialog = element('Dialog');
    if (!dialog) return;
    if (dialog.open) dialog.close();
    clearImage();
    document.documentElement.classList.remove('responsibility-share-open');
    if (opener && opener.isConnected) opener.focus({preventScroll:true});
    opener = null;
  }

  function bind() {
    if (bound) return;
    bound = true;
    element('Close').addEventListener('click', close);
    element('Dialog').addEventListener('close', function () {
      if (!element('Dialog').open) close();
    });
    element('Send').addEventListener('click', share);
    element('Download').addEventListener('click', download);
  }

  async function open(group, data, majorGroup, trigger) {
    bind();
    clearImage();
    opener = trigger;
    const token = sequence;
    const dialog = element('Dialog');
    message('正在產生高解析圖片…');
    element('Title').textContent = String(group.responsibleZhongZiClass || '責任區塊') + '・圖片預覽';
    if (!dialog.open) dialog.showModal();
    document.documentElement.classList.add('responsibility-share-open');
    try {
      // 只截取目前責任區塊；之後切月份、換組或關閉會作廢這次產圖。
      const snapshot = JSON.parse(JSON.stringify({group:group, year:data.year, month:data.month, majorGroup:majorGroup}));
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      if (token !== sequence || !dialog.open) return;
      const canvas = drawReport(snapshot);
      const blob = await new Promise(function (resolve, reject) {
        canvas.toBlob(function (value) {
          if (value) resolve(value); else reject(new Error('圖片產生失敗，請重試。'));
        }, 'image/png');
      });
      if (token !== sequence || !dialog.open) return;
      const caption = getResponsibilityGroupLabel_(snapshot.majorGroup);
      const name = (snapshot.year + '-' + String(snapshot.month).padStart(2,'0') + '_' + caption + '_' +
        snapshot.group.responsibleTransmitter + '_' + snapshot.group.responsibleZhongZiClass + '_道務歸屬')
        .replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,120) + '.png';
      file = new File([blob], name, {type:'image/png'});
      imageUrl = URL.createObjectURL(blob);
      element('Image').src = imageUrl;
      element('Image').hidden = false;
      element('Send').disabled = false;
      element('Download').disabled = false;
      message(canvas.width + ' × ' + canvas.height + ' 像素 PNG，適合 LINE 或 PPT。');
    } catch (error) {
      if (token === sequence) message('無法產生圖片：' + (error.message || '請稍後重試。'));
    }
  }

  async function share() {
    if (!file) return;
    // 先產圖、再由使用者按分享，保留手機瀏覽器要求的即時點擊權限。
    if (!navigator.share || !navigator.canShare || !navigator.canShare({files:[file]})) {
      message('此瀏覽器不支援圖片分享，請按「下載 PNG」，再從 LINE 傳送圖片。');
      return;
    }
    const token = sequence;
    element('Send').disabled = true;
    try {
      // 只交付圖片，避免 LINE 同時產生標題文字訊息。
      await navigator.share({files:[file]});
      if (token === sequence) message('已交給系統分享選單；是否傳送完成請在 LINE 確認。');
    } catch (error) {
      if (token === sequence) {
        message(error.name === 'AbortError' ? '已取消分享，可重新分享或下載圖片。' : '分享未完成，請重試或下載 PNG 後自行傳送。');
      }
    } finally {
      if (token === sequence && file) element('Send').disabled = false;
    }
  }

  function download() {
    if (!file || !imageUrl) return;
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    message('已開始下載原始 PNG；可插入 PPT，或在 LINE 選擇這張圖片。');
  }

  function drawReport(snapshot) {
    const temples = snapshot.group.temples || [];
    if (!temples.length) throw new Error('此區塊沒有可匯出的佛堂。');
    const width = 1200;
    const top = 80;
    const headerHeight = 64;
    const templeHeight = 108;
    const height = top + headerHeight + temples.length * templeHeight + 24;
    if (height * 2 > 8192) throw new Error('此區塊資料過多，請縮小範圍後再試。');
    const canvas = document.createElement('canvas');
    canvas.width = width * 2;
    canvas.height = height * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('此瀏覽器無法繪製圖片。');
    ctx.scale(2,2);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,width,height);
    ctx.textBaseline = 'middle';
    const ink = '#153f64';
    const font = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft JhengHei", sans-serif';
    function text(value, x, y, size, color, align, maxWidth, weight) {
      ctx.fillStyle = color || ink;
      ctx.textAlign = align || 'center';
      let actual = size;
      const label = String(value == null ? '—' : value);
      do { ctx.font = (weight || 500) + ' ' + actual + 'px ' + font; if (!maxWidth || ctx.measureText(label).width <= maxWidth) break; actual -= 1; } while (actual > 12);
      ctx.fillText(label,x,y,maxWidth);
    }
    // 年月、組別與責任人整行一起量測，確保同字型、同字級、不溢出。
    text(snapshot.year + ' 年 ' + snapshot.month + ' 月｜' + getResponsibilityGroupLabel_(snapshot.majorGroup) +
      '　　責任點傳師：' + (snapshot.group.responsibleTransmitter || '—') + '　　責任忠字班：' +
      (snapshot.group.responsibleZhongZiClass || '—'),width/2,44,30,ink,'center',1136,700);
    const columns = [220,85,130,130,90,130,351];
    const starts = []; let cursor = 32;
    columns.forEach(function (size) { starts.push(cursor); cursor += size; });
    ctx.fillStyle = '#edf3fa'; ctx.fillRect(32,top,1136,headerHeight);
    ['佛堂','類別','去年實績','年度目標',snapshot.month+'月','本年累計','達成率'].forEach(function (label,i) {
      text(label,starts[i]+columns[i]/2,top+headerHeight/2,26,'#305572','center',columns[i]-10,700);
    });
    temples.forEach(function (temple,index) {
      const y = top + headerHeight + index * templeHeight;
      // 每個佛堂兩列緊接，只在不同佛堂之間畫分隔線。
      if (index % 2) { ctx.fillStyle = '#f8fafc'; ctx.fillRect(32,y,1136,templeHeight); }
      // 保留前版左移位置，名稱放大並置於求道、法會兩列正中間。
      text(temple.formalTempleName,starts[0]+columns[0]-12-50,y+54,29,ink,'right',columns[0]-22-50,700);
      const metrics = Array.isArray(temple.metrics) ? temple.metrics : [];
      [0,1].forEach(function (row) {
        const metric = metrics[row] || {};
        const cy = y + 30 + row * 48;
        const values = [metric.category || (row ? '法會':'求道'),metric.previousActual,metric.annualTarget,metric.monthValue,metric.cumulative];
        values.forEach(function (value,i) {
          // 只有月份欄的已知零值留白；未知值保留「—」，其他欄的零值照常顯示。
          const monthZero = i === 3 && value !== null && value !== undefined && Number(value) === 0;
          text(monthZero ? '' : (i ? formatResponsibilityNumber_(value) : value),starts[i+1]+columns[i+1]/2,cy,31,i ? '#243b50':'#66788e','center',columns[i+1]-10,i ? 500:700);
        });
        const rate = metric.ratePercent;
        const tone = getResponsibilityTone_(rate);
        const color = ({green:'#0b9a45',yellow:'#e59a00',red:'#df2424'})[tone];
        const rateStart = starts[6] + (columns[6] - 263) / 2;
        text(formatResponsibilityNumber_(rate) + (rate == null ? '' : '%'),rateStart+85,cy,29,rate == null ? '#66788e' : color,'right',87,700);
        const active = getResponsibilityProgressSegments_(rate);
        for (let i=0;i<10;i+=1) {
          ctx.fillStyle = i<active ? color : '#e1e7ef';
          ctx.fillRect(rateStart+96+i*17,cy-9,14,18);
        }
      });
      ctx.strokeStyle = '#dce5ef'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(32,y+templeHeight); ctx.lineTo(1168,y+templeHeight); ctx.stroke();
    });
    return canvas;
  }

  window.ResponsibilityShare = {open:open, close:close};
})();
