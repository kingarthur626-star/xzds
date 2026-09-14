/* 責任歸屬圖片：在已登入頁面的記憶體產生 PNG，不上傳資料至第三方服務。 */
(function () {
  'use strict';
  let files = [];
  let imageUrls = [];
  let downloadUrl = '';
  let downloadName = '';
  let sequence = 0;
  let opener = null;
  let bound = false;

  function element(id) { return document.getElementById('responsibilityShare' + id); }
  function message(text) { element('Status').textContent = text; }

  function clearImage() {
    sequence += 1;
    files = [];
    element('Image').hidden = true;
    element('Image').removeAttribute('src');
    element('Gallery').replaceChildren();
    element('Gallery').hidden = true;
    imageUrls.forEach(function (url) { URL.revokeObjectURL(url); });
    if (downloadUrl && !imageUrls.includes(downloadUrl)) URL.revokeObjectURL(downloadUrl);
    imageUrls = [];
    downloadUrl = '';
    downloadName = '';
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

  function open(group, data, majorGroup, trigger) {
    return openMany([group], data, majorGroup, trigger, false);
  }

  function openAll(groups, data, majorGroup, trigger) {
    return openMany(groups, data, majorGroup, trigger, true);
  }

  async function openMany(groups, data, majorGroup, trigger, batch) {
    bind();
    clearImage();
    opener = trigger;
    const token = sequence;
    const dialog = element('Dialog');
    message('正在產生高解析圖片…');
    const caption = getResponsibilityGroupLabel_(majorGroup);
    element('Title').textContent = batch ? caption + '・全部圖片' : String(groups[0].responsibleZhongZiClass || '責任區塊') + '・圖片預覽';
    element('Send').textContent = batch ? '分享全部圖片' : '分享圖片';
    element('Download').textContent = batch ? '下載全部 ZIP' : '下載 PNG';
    if (!dialog.open) dialog.showModal();
    document.documentElement.classList.add('responsibility-share-open');
    try {
      // 固定這次的組別／月份快照，依原始順序逐張產圖，關閉後作廢整批。
      const snapshot = JSON.parse(JSON.stringify({groups:groups, year:data.year, month:data.month, majorGroup:majorGroup}));
      if (!snapshot.groups.length) throw new Error('沒有可分享的責任區塊。');
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      if (token !== sequence || !dialog.open) return;
      const readyFiles = [], sizes = [];
      for (let index = 0; index < snapshot.groups.length; index += 1) {
        if (token !== sequence || !dialog.open) return;
        message('正在產生第 ' + (index + 1) + '／' + snapshot.groups.length + ' 張圖片…');
        const group = snapshot.groups[index];
        const canvas = drawReport({group:group, year:snapshot.year, month:snapshot.month, majorGroup:snapshot.majorGroup});
        sizes.push(canvas.width + ' × ' + canvas.height);
        let blob;
        try {
          blob = await new Promise(function (resolve, reject) {
            canvas.toBlob(function (value) {
              if (value) resolve(value); else reject(new Error('圖片產生失敗，請重試。'));
            }, 'image/png');
          });
        } finally { canvas.width = 0; canvas.height = 0; }
        if (token !== sequence || !dialog.open) return;
        const name = ((batch ? String(index + 1).padStart(2,'0') + '_' : '') +
          snapshot.year + '-' + String(snapshot.month).padStart(2,'0') + '_' + caption + '_' +
          group.responsibleTransmitter + '_' + group.responsibleZhongZiClass + '_道務歸屬')
          .replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,120) + '.png';
        readyFiles.push(new File([blob], name, {type:'image/png'}));
      }
      const downloadBlob = batch ? await window.ResponsibilityZip.create(readyFiles) : readyFiles[0];
      if (token !== sequence || !dialog.open) return;
      files = readyFiles;
      imageUrls = files.map(function (file) { return URL.createObjectURL(file); });
      downloadUrl = batch ? URL.createObjectURL(downloadBlob) : imageUrls[0];
      downloadName = batch ? snapshot.year + '-' + String(snapshot.month).padStart(2,'0') + '_' + caption + '_全部圖片.zip' : files[0].name;
      if (batch) {
        files.forEach(function (file,index) {
          const figure = document.createElement('figure');
          const title = document.createElement('figcaption');
          title.textContent = (index + 1) + '／' + files.length + '　' + (snapshot.groups[index].responsibleZhongZiClass || '責任區塊');
          const img = document.createElement('img');
          img.src = imageUrls[index]; img.alt = title.textContent + '道務報表';
          const link = document.createElement('a');
          link.href = imageUrls[index]; link.download = file.name; link.textContent = '下載這張 PNG';
          figure.append(title, img, link); element('Gallery').appendChild(figure);
        });
        element('Gallery').hidden = false;
      } else {
        element('Image').src = imageUrls[0];
        element('Image').hidden = false;
      }
      element('Send').disabled = false;
      element('Download').disabled = false;
      message(batch ? '已產生 ' + files.length + ' 張圖片，每張寬 2400 像素。按「分享全部圖片」後選 LINE；不支援時可下載 ZIP，解壓縮後選取圖片傳送。' : sizes[0] + ' 像素 PNG，適合 LINE 或 PPT。');
    } catch (error) {
      if (token === sequence) {
        clearImage();
        message('無法產生圖片：' + (error.message || '請稍後重試。'));
      }
    }
  }

  async function share() {
    if (!files.length) return;
    // 先產圖、再由使用者按分享，保留手機瀏覽器要求的即時點擊權限。
    let supported = false;
    try { supported = !!(navigator.share && navigator.canShare && navigator.canShare({files:files})); } catch (_) {}
    if (!supported) {
      message('此瀏覽器不支援這批圖片分享，請按下載；若為 ZIP，解壓縮後在 LINE 選取圖片傳送。');
      return;
    }
    const token = sequence;
    element('Send').disabled = true;
    try {
      // 只交付圖片，避免 LINE 同時產生標題文字訊息。
      await navigator.share({files:files.slice()});
      if (token === sequence) message('已交給系統分享選單；是否傳送完成請在 LINE 確認。');
    } catch (error) {
      if (token === sequence) {
        message(error.name === 'AbortError' ? '已取消分享，可重新分享或下載圖片。' : '分享未完成，請重試或下載 PNG 後自行傳送。');
      }
    } finally {
      if (token === sequence && files.length) element('Send').disabled = false;
    }
  }

  function download() {
    if (!files.length || !downloadUrl) return;
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = downloadName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    message(downloadName.endsWith('.zip') ? '已開始下載整批 ZIP；解壓縮後可選取全部 PNG 傳送 LINE 或插入 PPT。' : '已開始下載原始 PNG；可插入 PPT，或在 LINE 選擇這張圖片。');
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
    ['佛堂','類別','去年實績','年度目標',snapshot.month+'月','本年累計',getResponsibilityRateLabel_(snapshot.month)].forEach(function (label,i) {
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
          // 與手機畫面共用月份零值規則，避免兩種呈現不一致。
          const label = i === 3 ? formatResponsibilityMonthValue_(value) : (i ? formatResponsibilityNumber_(value) : value);
          text(label,starts[i+1]+columns[i+1]/2,cy,31,i ? '#243b50':'#66788e','center',columns[i+1]-10,i ? 500:700);
        });
        const rate = metric.ratePercent;
        const tone = getResponsibilityTone_(rate, snapshot.month);
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

  window.ResponsibilityShare = {open:open, openAll:openAll, close:close};
})();
