/* 公壇圖片在目前已登入頁面的記憶體產生，不上傳資料。 */
(function () {
  'use strict';
  let file = null, imageUrl = '', sequence = 0, opener = null, bound = false;
  function element(id) { return document.getElementById('responsibilityShare' + id); }
  function message(value) { element('Status').textContent = value; }
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
    element('Dialog').addEventListener('close', function () { if (!element('Dialog').open) close(); });
    element('Send').addEventListener('click', share);
    element('Download').addEventListener('click', download);
  }
  async function open(chunk, data, majorGroup, trigger) {
    bind();
    clearImage();
    opener = trigger;
    const token = sequence, dialog = element('Dialog');
    element('Title').textContent = '公壇圖片預覽';
    message('正在產生高解析圖片…');
    if (!dialog.open) dialog.showModal();
    document.documentElement.classList.add('responsibility-share-open');
    try {
      // 僅複製這一塊已篩選的佛堂，不帶入責任人資訊。
      const snapshot = JSON.parse(JSON.stringify({
        temples:chunk.temples, caption:chunk.caption, start:chunk.start, end:chunk.end,
        year:data.year, month:data.month
      }));
      if (!snapshot.temples.length || snapshot.temples.length > 5) throw new Error('此區塊沒有可分享的佛堂。');
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      if (token !== sequence || !dialog.open) return;
      const canvas = drawReport(snapshot), dimensions = canvas.width + ' × ' + canvas.height;
      let blob;
      try {
        blob = await new Promise(function (resolve, reject) {
          canvas.toBlob(function (value) { if (value) resolve(value); else reject(new Error('圖片產生失敗，請重試。')); }, 'image/png');
        });
      } finally { canvas.width = 0; canvas.height = 0; }
      if (token !== sequence || !dialog.open) return;
      const name = (snapshot.year + '-' + String(snapshot.month).padStart(2,'0') + '_公壇_' +
        String(snapshot.start).padStart(2,'0') + '-' + String(snapshot.end).padStart(2,'0'))
        .replace(/[<>:"/\\|?*\x00-\x1f]/g,'_') + '.png';
      file = new File([blob], name, {type:'image/png'});
      imageUrl = URL.createObjectURL(file);
      element('Image').src = imageUrl;
      element('Image').alt = '第 ' + snapshot.start + ' 至 ' + snapshot.end + ' 壇的道務報表預覽';
      element('Image').hidden = false;
      element('Send').disabled = false;
      element('Download').disabled = false;
      message(dimensions + ' 像素 PNG，適合 LINE 或 PPT。');
    } catch (error) {
      if (token === sequence) { clearImage(); message('無法產生圖片：' + (error.message || '請稍後重試。')); }
    }
  }
  async function share() {
    if (!file) return;
    let supported = false;
    try { supported = !!(navigator.share && navigator.canShare && navigator.canShare({files:[file]})); } catch (_) {}
    if (!supported) { message('此瀏覽器不支援圖片分享，請下載 PNG 後在 LINE 選取這張圖片。'); return; }
    const token = sequence;
    element('Send').disabled = true;
    try {
      await navigator.share({files:[file]});
      if (token === sequence) message('已交給系統分享選單；是否傳送完成請在 LINE 確認。');
    } catch (error) {
      if (token === sequence) message(error.name === 'AbortError' ? '已取消分享，可重新分享或下載圖片。' : '分享未完成，請重試或下載 PNG 後自行傳送。');
    } finally { if (token === sequence && file) element('Send').disabled = false; }
  }
  function download() {
    if (!file || !imageUrl) return;
    const link = document.createElement('a');
    link.href = imageUrl; link.download = file.name;
    document.body.appendChild(link); link.click(); link.remove();
    message('已開始下載原始 PNG；可插入 PPT，或在 LINE 選擇這張圖片。');
  }
  function drawReport(snapshot) {
    const temples = snapshot.temples;
    const width = 1200, top = snapshot.caption ? 92 : 40, headerHeight = 64, templeHeight = 108;
    const height = top + headerHeight + temples.length * templeHeight + 24;
    const canvas = document.createElement('canvas');
    canvas.width = width * 2; canvas.height = height * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('此瀏覽器無法繪製圖片。');
    ctx.scale(2,2); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,width,height); ctx.textBaseline = 'middle';
    const ink = '#153f64', font = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft JhengHei", sans-serif';
    function text(value,x,y,size,color,align,maxWidth,weight) {
      ctx.fillStyle = color || ink; ctx.textAlign = align || 'center';
      let actual = size; const label = String(value == null ? '—' : value);
      do { ctx.font = (weight || 500) + ' ' + actual + 'px ' + font; if (!maxWidth || ctx.measureText(label).width <= maxWidth) break; actual -= 1; } while (actual > 12);
      ctx.fillText(label,x,y,maxWidth);
    }
    text(snapshot.year + ' 年 ' + (snapshot.month ? snapshot.month + ' 月資料' : '年度資料'),width/2,20,20,ink,'center',1136,500);
    if (snapshot.caption) text(snapshot.caption,width/2,64,30,ink,'center',1136,700);
    const columns = [220,85,130,130,90,130,351], starts = [];
    let cursor = 32; columns.forEach(function (size) { starts.push(cursor); cursor += size; });
    ctx.fillStyle = '#edf3fa'; ctx.fillRect(32,top,1136,headerHeight);
    ['佛堂','類別','去年實績','年度目標',snapshot.month ? snapshot.month+'月' : '本月','本年累計',getResponsibilityRateLabel_(snapshot.month)].forEach(function(label,i) {
      text(label,starts[i]+columns[i]/2,top+headerHeight/2,26,'#305572','center',columns[i]-10,700);
    });
    temples.forEach(function (temple,index) {
      const y = top + headerHeight + index * templeHeight;
      if (index % 2) { ctx.fillStyle = '#f8fafc'; ctx.fillRect(32,y,1136,templeHeight); }
      text(temple.formalTempleName,starts[0]+columns[0]-12-50,y+54,29,ink,'right',columns[0]-22-50,700);
      const metrics = Array.isArray(temple.metrics) ? temple.metrics : [];
      [0,1].forEach(function(row) {
        const metric = metrics[row] || {}, cy = y + 30 + row * 48;
        const values = [metric.category || (row ? '法會':'求道'),metric.previousActual,metric.annualTarget,metric.monthValue,metric.cumulative];
        values.forEach(function(value,i) {
          const label = i === 3 ? formatResponsibilityMonthValue_(value) : (i ? formatResponsibilityNumber_(value) : value);
          text(label,starts[i+1]+columns[i+1]/2,cy,31,i ? '#243b50':'#66788e','center',columns[i+1]-10,i ? 500:700);
        });
        const rate = metric.ratePercent, tone = getResponsibilityTone_(rate,snapshot.month), color = ({green:'#0b9a45',yellow:'#e59a00',red:'#df2424'})[tone];
        const rateStart = starts[6] + (columns[6]-263)/2;
        text(formatResponsibilityNumber_(rate)+(rate==null?'':'%'),rateStart+85,cy,29,rate==null?'#66788e':color,'right',87,700);
        const active = getResponsibilityProgressSegments_(rate);
        for(let i=0;i<10;i+=1){ctx.fillStyle=i<active?color:'#e1e7ef';ctx.fillRect(rateStart+96+i*17,cy-9,14,18);}
      });
      ctx.strokeStyle='#dce5ef';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(32,y+templeHeight);ctx.lineTo(1168,y+templeHeight);ctx.stroke();
    });
    return canvas;
  }
  window.ResponsibilityShare = {open:open,close:close};
})();
