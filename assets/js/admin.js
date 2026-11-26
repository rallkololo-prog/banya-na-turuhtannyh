/* ==========================================================================
   Админка «Баня на Турухтанных»
   Правит assets/data/content.json и публикует его в GitHub через API.
   ========================================================================== */
(function () {
  'use strict';

  var OWNER = 'rallkololo-prog';
  var REPO = 'banya-na-turuhtannyh';
  var BRANCH = 'main';
  var CONTENT_PATH = 'assets/data/content.json';
  var DRAFT_KEY = 'banya_content_draft';
  var PENDING_KEY = 'banya_pending_files';
  var TOKEN_KEY = 'banya_gh_token';

  var content = null;
  var pending = {};        // путь файла → base64 (новые фото, ещё не в репозитории)
  var dirty = false;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ------------------------------------------------------------------ */
  /* Утилиты                                                             */
  /* ------------------------------------------------------------------ */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function getPath(obj, path) {
    return path.split('.').reduce(function (o, k) {
      if (o == null) return undefined;
      var idx = Number(k);
      return (Array.isArray(o) && !isNaN(idx)) ? o[idx] : o[k];
    }, obj);
  }

  function setPath(obj, path, val) {
    var parts = path.split('.');
    var last = parts.pop();
    var cur = obj;
    parts.forEach(function (k) {
      var idx = Number(k);
      if (Array.isArray(cur)) {
        if (cur[idx] == null) cur[idx] = {};
        cur = cur[idx];
      } else {
        if (cur[k] == null) cur[k] = {};
        cur = cur[k];
      }
    });
    if (Array.isArray(cur) && !isNaN(Number(last))) cur[Number(last)] = val;
    else cur[last] = val;
  }

  function rub(n) {
    return new Intl.NumberFormat('ru-RU').format(Math.round(Number(n) || 0)) + '\u00A0₽';
  }

  var toastTimer;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('is-visible'); }, 2600);
  }

  function status(msg, isError) {
    var s = $('#status');
    if (!msg) { s.hidden = true; return; }
    s.hidden = false;
    s.classList.toggle('is-error', !!isError);
    s.textContent = msg;
  }

  function b64encode(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  /* ------------------------------------------------------------------ */
  /* Загрузка и черновик                                                 */
  /* ------------------------------------------------------------------ */

  function load() {
    var draft = null;
    try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (e) { draft = null; }

    try { pending = JSON.parse(localStorage.getItem(PENDING_KEY) || '{}') || {}; } catch (e) { pending = {}; }

    return fetch(CONTENT_PATH, { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (json) {
        content = draft || json;
        if (!content) {
          status('Не удалось загрузить content.json. Откройте админку через сервер (не двойным щелчком по файлу).', true);
          content = { tariffs: { rows: [], slots: {} }, extras: [], menu: [], gallery: [], categories: [] };
          return;
        }

        // фотографии, которые не успели опубликовать: если данных нет — убираем
        var lost = 0;
        (content.gallery || []).forEach(function (g) {
          if (g._pending && !pending[g.src]) lost++;
        });
        if (lost) {
          content.gallery = (content.gallery || []).filter(function (g) { return !(g._pending && !pending[g.src]); });
        }

        if (draft) {
          dirty = true;
          status(lost
            ? 'Черновик загружен. ' + lost + ' неопубликованн(ых) фото пропало — загрузите заново.'
            : 'Загружен ваш черновик из этого браузера. Изменения увидят посетители только после «Опубликовать».');
        }
        renderAll();
      })
      .catch(function (err) {
        status('Ошибка сети: ' + err.message, true);
      });
  }

  /* --- черновик и неопубликованные файлы ------------------------------ */

  function savePending() {
    try {
      localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    } catch (e) {
      status('Фото не помещается в черновик браузера. Нажмите «Опубликовать» сразу, не перезагружая страницу.', true);
    }
  }

  var draftTimer;
  function markDirty() {
    dirty = true;
    clearTimeout(draftTimer);
    draftTimer = setTimeout(function () {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify(content)); } catch (e) {}
      status('Черновик сохранён в этом браузере. Чтобы изменения увидели посетители, нажмите «Опубликовать».');
    }, 350);
    setPublishState();
  }

  function setPublishState() {
    var btn = $('#publish-btn');
    btn.textContent = dirty ? 'Опубликовать •' : 'Опубликовать';
  }

  /* ------------------------------------------------------------------ */
  /* Вкладки                                                             */
  /* ------------------------------------------------------------------ */

  $('#tabs').addEventListener('click', function (e) {
    var b = e.target.closest('[data-tab]');
    if (!b) return;
    $$('.admin-tab').forEach(function (t) {
      var on = t === b;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    $$('.admin-panel').forEach(function (p) {
      p.classList.toggle('is-active', p.id === 'panel-' + b.dataset.tab);
    });
  });

  /* ------------------------------------------------------------------ */
  /* Привязка полей                                                      */
  /* ------------------------------------------------------------------ */

  function syncInputs(root) {
    $$('[data-bind]', root || document).forEach(function (inp) {
      var v = getPath(content, inp.dataset.bind);
      if (inp.type === 'number') inp.value = v == null ? '' : v;
      else inp.value = v == null ? '' : v;
      if (!inp._bound) {
        inp._bound = true;
        inp.addEventListener('input', onInput);
        inp.addEventListener('change', onInput);
      }
    });
  }

  function onInput(e) {
    var inp = e.target;
    var path = inp.dataset.bind;
    if (!path) return;

    var v;
    if (inp.type === 'number') v = inp.value === '' ? 0 : Number(inp.value);
    else if (inp.type === 'checkbox') v = inp.checked;
    else v = inp.value;

    setPath(content, path, v);
    markDirty();
  }

  /* ------------------------------------------------------------------ */
  /* Цены                                                                */
  /* ------------------------------------------------------------------ */

  function field(label, path, opts) {
    opts = opts || {};
    var wrap = el('label', 'admin-field' + (opts.full ? ' admin-field--full' : ''));
    wrap.appendChild(el('span', null, label));
    var input = document.createElement('input');
    input.type = opts.type || 'text';
    if (opts.type === 'number') {
      input.min = opts.min != null ? opts.min : 0;
      input.step = opts.step || 50;
    }
    if (opts.placeholder) input.placeholder = opts.placeholder;
    input.dataset.bind = path;
    wrap.appendChild(input);
    return wrap;
  }

  function renderPrices() {
    var T = content.tariffs || {};
    var rows = T.rows || [];
    var box = $('#price-rows');
    box.innerHTML = '';

    rows.forEach(function (row, i) {
      var card = el('div', 'admin-row');

      var head = el('div', 'admin-row__head');
      head.appendChild(field('Дни', 'tariffs.rows.' + i + '.label'));
      card.appendChild(head);

      var slots = el('div', 'admin-row__slots');
      ['am', 'pm'].forEach(function (slot) {
        var cfg = (T.slots && T.slots[slot]) || {};
        var s = el('div', 'admin-slot');
        var title = el('div', 'admin-slot__title');
        title.appendChild(el('span', null, slot === 'am' ? 'Дневное время' : 'Вечернее время'));
        title.appendChild(el('span', null, cfg.label || ''));
        s.appendChild(title);

        var grid = el('div', 'admin-slot__grid');
        grid.appendChild(field('Ставка, ₽/час', 'tariffs.rows.' + i + '.' + slot + '.rate', { type: 'number' }));
        grid.appendChild(field('Плашка', 'tariffs.rows.' + i + '.' + slot + '.tag', { placeholder: 'Акция' }));
        grid.appendChild(field('Акция: оплатить ч', 'tariffs.rows.' + i + '.' + slot + '.promo.need', { type: 'number', step: 1 }));
        grid.appendChild(field('Акция: дать ч', 'tariffs.rows.' + i + '.' + slot + '.promo.gift', { type: 'number', step: 1 }));
        grid.appendChild(field('Подпись под ценой', 'tariffs.rows.' + i + '.' + slot + '.note', { full: true }));
        s.appendChild(grid);
        slots.appendChild(s);
      });

      card.appendChild(slots);
      box.appendChild(card);
    });

    syncInputs(box);
  }

  /* ------------------------------------------------------------------ */
  /* Допуслуги                                                           */
  /* ------------------------------------------------------------------ */

  function renderExtras() {
    var list = $('#extras-list');
    list.innerHTML = '';

    (content.extras || []).forEach(function (ex, i) {
      var card = el('div', 'admin-item');

      var head = el('div', 'admin-item__head');
      head.appendChild(el('div', 'admin-item__title', ex.name || 'Без названия'));
      head.appendChild(el('div', 'admin-item__tools'));

      var tools = head.querySelector('.admin-item__tools');
      tools.appendChild(iconBtn('↑', 'Выше', function () { move(content.extras, i, -1); renderExtras(); }));
      tools.appendChild(iconBtn('↓', 'Ниже', function () { move(content.extras, i, 1); renderExtras(); }));
      tools.appendChild(iconBtn('×', 'Удалить', function () {
        if (confirm('Удалить услугу «' + (ex.name || '') + '»? Она исчезнет с сайта и из калькулятора.')) {
          content.extras.splice(i, 1);
          markDirty();
          renderExtras();
          renderGallery();
        }
      }, true));
      card.appendChild(head);

      var grid = el('div', 'admin-item__grid');
      grid.appendChild(field('Название', 'extras.' + i + '.name'));
      grid.appendChild(field('Цена, ₽', 'extras.' + i + '.price', { type: 'number', step: 10 }));

      var unit = el('label', 'admin-field');
      unit.appendChild(el('span', null, 'Единица'));
      unit.appendChild(selectEl(['', 'шт', 'компл', 'чел'], 'extras.' + i + '.unit'));
      grid.appendChild(unit);

      var kind = el('label', 'admin-field');
      kind.appendChild(el('span', null, 'В калькуляторе'));
      kind.appendChild(selectEl([['toggle', 'Галочка'], ['qty', 'Количество']], 'extras.' + i + '.kind'));
      grid.appendChild(kind);

      grid.appendChild(field('Обязательно от гостей (0 — никогда)', 'extras.' + i + '.mandatoryFrom', { type: 'number', step: 1 }));
      grid.appendChild(field('Описание', 'extras.' + i + '.desc', { full: true }));
      card.appendChild(grid);

      list.appendChild(card);
    });

    syncInputs(list);
  }

  function selectEl(options, bind) {
    var sel = document.createElement('select');
    sel.dataset.bind = bind;
    options.forEach(function (o) {
      var opt = document.createElement('option');
      if (Array.isArray(o)) { opt.value = o[0]; opt.textContent = o[1]; }
      else { opt.value = o; opt.textContent = o || '— без единицы —'; }
      sel.appendChild(opt);
    });
    return sel;
  }

  function iconBtn(text, title, handler, danger) {
    var b = el('button', 'icon-btn' + (danger ? ' is-danger' : ''), text);
    b.type = 'button';
    b.title = title;
    b.setAttribute('aria-label', title);
    b.addEventListener('click', handler);
    return b;
  }

  function move(arr, i, dir) {
    var j = i + dir;
    if (j < 0 || j >= arr.length) return;
    var tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
    markDirty();
  }

  $('#add-extra').addEventListener('click', function () {
    content.extras = content.extras || [];
    content.extras.push({ id: 'extra' + Date.now(), name: 'Новая услуга', price: 0, unit: '', kind: 'qty', desc: '' });
    markDirty();
    renderExtras();
  });

  /* ------------------------------------------------------------------ */
  /* Меню                                                                */
  /* ------------------------------------------------------------------ */

  function renderMenu() {
    var list = $('#menu-list');
    list.innerHTML = '';

    (content.menu || []).forEach(function (item, i) {
      var card = el('div', 'admin-item');
      var head = el('div', 'admin-item__head');
      head.appendChild(el('div', 'admin-item__title', item.label || 'Пункт'));

      var tools = el('div', 'admin-item__tools');
      tools.appendChild(iconBtn('↑', 'Выше', function () { move(content.menu, i, -1); markDirty(); renderMenu(); }));
      tools.appendChild(iconBtn('↓', 'Ниже', function () { move(content.menu, i, 1); markDirty(); renderMenu(); }));
      tools.appendChild(iconBtn('×', 'Удалить', function () {
        if (confirm('Удалить пункт «' + (item.label || '') + '» из меню?')) {
          content.menu.splice(i, 1);
          markDirty();
          renderMenu();
        }
      }, true));
      head.appendChild(tools);
      card.appendChild(head);

      var grid = el('div', 'admin-item__grid');
      grid.appendChild(field('Название', 'menu.' + i + '.label'));
      grid.appendChild(field('Ссылка (#prices или https://…)', 'menu.' + i + '.href'));
      card.appendChild(grid);

      list.appendChild(card);
    });

    syncInputs(list);
  }

  $('#add-menu').addEventListener('click', function () {
    content.menu = content.menu || [];
    content.menu.push({ label: 'Новый пункт', href: '#calc' });
    markDirty();
    renderMenu();
  });

  /* ------------------------------------------------------------------ */
  /* Фотографии                                                          */
  /* ------------------------------------------------------------------ */

  function categoryOptions(selected) {
    var sel = document.createElement('select');
    (content.categories || []).forEach(function (c) {
      var o = document.createElement('option');
      o.value = c;
      o.textContent = c;
      if (c === selected) o.selected = true;
      sel.appendChild(o);
    });
    return sel;
  }

  function renderGallery() {
    var box = $('#gallery-list');
    if (!box) return;
    box.innerHTML = '';

    // категории в поле и в селект загрузки
    var catsInput = $('#categories-input');
    if (catsInput && document.activeElement !== catsInput) {
      catsInput.value = (content.categories || []).join(', ');
    }
    var upSel = $('#upload-category');
    if (upSel) {
      var prev = upSel.value;
      upSel.innerHTML = '';
      (content.categories || []).forEach(function (c) {
        var o = document.createElement('option');
        o.value = c;
        o.textContent = c;
        upSel.appendChild(o);
      });
      if (prev) upSel.value = prev;
    }

    (content.gallery || []).forEach(function (g, i) {
      var card = el('div', 'admin-photo' + (g._pending ? ' is-pending' : ''));

      var img = el('div', 'admin-photo__img');
      img.style.backgroundImage = 'url("' + (g._pending ? g.thumb : g.thumb) + '")';
      if (g._pending) img.appendChild(el('span', 'admin-photo__badge', 'Новое'));
      card.appendChild(img);

      var body = el('div', 'admin-photo__body');
      body.appendChild(field('Подпись', 'gallery.' + i + '.caption'));

      var catWrap = el('label', 'admin-field');
      catWrap.appendChild(el('span', null, 'Категория'));
      var sel = categoryOptions(g.category);
      sel.dataset.bind = 'gallery.' + i + '.category';
      catWrap.appendChild(sel);
      body.appendChild(catWrap);
      card.appendChild(body);

      var foot = el('div', 'admin-photo__foot');
      foot.appendChild(iconBtn('↑', 'Выше', function () { move(content.gallery, i, -1); markDirty(); renderGallery(); }));
      foot.appendChild(iconBtn('↓', 'Ниже', function () { move(content.gallery, i, 1); markDirty(); renderGallery(); }));
      foot.appendChild(iconBtn('×', 'Удалить', function () {
        if (confirm('Удалить фото «' + (g.caption || '') + '» из галереи?')) {
          content.gallery.splice(i, 1);
          markDirty();
          renderGallery();
        }
      }, true));
      card.appendChild(foot);

      box.appendChild(card);
    });

    syncInputs(box);
  }

  $('#categories-input').addEventListener('change', function () {
    content.categories = this.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    markDirty();
    renderGallery();
  });

  /* ---------- Загрузка фото ---------- */

  var zone = $('#upload-zone');
  var fileInput = $('#upload-input');

  zone.addEventListener('click', function (e) {
    if (e.target.closest('select, option, label')) return;
    fileInput.click();
  });

  ['dragenter', 'dragover'].forEach(function (ev) {
    zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.add('is-over'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.remove('is-over'); });
  });
  zone.addEventListener('drop', function (e) {
    if (e.dataTransfer && e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  });

  fileInput.addEventListener('change', function () {
    if (fileInput.files.length) handleFiles(fileInput.files);
    fileInput.value = '';
  });

  function handleFiles(files) {
    var category = $('#upload-category').value || (content.categories || [])[0] || 'Отдых';
    var list = Array.prototype.slice.call(files);
    var done = 0;

    status('Готовлю фотографии: 0 из ' + list.length + '…');

    list.forEach(function (file, idx) {
      if (!/^image\//.test(file.type)) { done++; return; }

      var reader = new FileReader();
      reader.onload = function () {
        var img = new Image();
        img.onload = function () {
          var stamp = Date.now() + '-' + idx;
          var fullName = 'up-' + stamp + '.jpg';
          var thumbName = 'up-' + stamp + '-t.jpg';

          var full = resize(img, 1600, 0.82);
          var thumb = resize(img, 640, 0.78);

          var fullPath = 'assets/img/gallery/' + fullName;
          var thumbPath = 'assets/img/gallery/thumbs/' + thumbName;

          pending[fullPath] = full.split(',')[1];
          pending[thumbPath] = thumb.split(',')[1];

          content.gallery = content.gallery || [];
          content.gallery.unshift({
            src: fullPath,
            thumb: thumbPath,
            caption: 'Новая фотография',
            category: category,
            alt: 'Фотография комплекса',
            _pending: true
          });

          markDirty();
          savePending();
          renderGallery();

          done++;
          if (done >= list.length) {
            status('Добавлено фото: ' + list.length + '. Не забудьте нажать «Опубликовать».');
          }
        };
        img.onerror = function () { done++; };
        img.src = reader.result;
      };
      reader.onerror = function () { done++; };
      reader.readAsDataURL(file);
    });
  }

  function resize(img, maxSize, quality) {
    var k = Math.min(1, maxSize / Math.max(img.width, img.height));
    var w = Math.round(img.width * k);
    var h = Math.round(img.height * k);
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', quality);
  }

  /* ------------------------------------------------------------------ */
  /* Публикация в GitHub                                                 */
  /* ------------------------------------------------------------------ */

  var modal = $('#modal');
  var logBox = $('#publish-log');

  function log(msg, cls) {
    logBox.hidden = false;
    var line = el('div', cls || null, msg);
    logBox.appendChild(line);
    logBox.scrollTop = logBox.scrollHeight;
  }

  $('#publish-btn').addEventListener('click', function () {
    if (!content) { toast('Данные ещё не загрузились'); return; }
    var saved = localStorage.getItem(TOKEN_KEY);
    logBox.innerHTML = '';
    logBox.hidden = true;
    if (saved) {
      $('#token-input').value = saved;
      startPublish(saved);
    } else {
      modal.hidden = false;
      $('#token-input').focus();
    }
  });

  $('#modal-cancel').addEventListener('click', function () { modal.hidden = true; });
  modal.addEventListener('click', function (e) { if (e.target === modal) modal.hidden = true; });

  $('#modal-go').addEventListener('click', function () {
    var token = $('#token-input').value.trim();
    if (!token) { toast('Вставьте ключ GitHub'); return; }
    if ($('#token-remember').checked) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
    startPublish(token);
  });

  function api(path, token, opts) {
    opts = opts || {};
    return fetch('https://api.github.com/repos/' + OWNER + '/' + REPO + path, {
      method: opts.method || 'GET',
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json'
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
  }

  function ghGetSha(path, token) {
    return api('/contents/' + encodeURI(path) + '?ref=' + BRANCH, token)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return j && j.sha ? j.sha : null; })
      .catch(function () { return null; });
  }

  function ghPut(path, base64, message, token) {
    return ghGetSha(path, token).then(function (sha) {
      var body = { message: message, content: base64, branch: BRANCH };
      if (sha) body.sha = sha;
      return api('/contents/' + encodeURI(path), token, { method: 'PUT', body: body }).then(function (r) {
        if (r.ok) return r.json();
        return r.text().then(function (t) {
          var msg;
          try { msg = JSON.parse(t).message; } catch (e) { msg = t; }
          throw new Error(path + ': ' + (msg || r.status));
        });
      });
    });
  }

  var publishing = false;

  function startPublish(token) {
    if (publishing) return;
    publishing = true;
    $('#modal-go').disabled = true;
    $('#publish-btn').disabled = true;

    log('Проверяю ключ…');

    fetch('https://api.github.com/user', {
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' }
    })
      .then(function (r) {
        if (!r.ok) throw new Error(r.status === 401 ? 'ключ неверный или истёк' : 'GitHub ответил ' + r.status);
        return r.json();
      })
      .then(function (user) {
        log('Ключ принят: ' + user.login, 'ok');

        var files = Object.keys(pending);
        var chain = Promise.resolve();

        files.forEach(function (path) {
          chain = chain.then(function () {
            log('Загружаю фото ' + path.split('/').pop() + '…');
            return ghPut(path, pending[path], 'Фото из админки: ' + path.split('/').pop(), token);
          });
        });

        return chain
          .then(function () { return prepareJson(); })
          .then(function (json) {
            log('Записываю цены и меню…');
            return ghPut(CONTENT_PATH, b64encode(json), 'Обновление цен и содержания из админки', token);
          })
          .then(function () {
            pending = {};
            try { localStorage.removeItem(PENDING_KEY); } catch (e) {}
            (content.gallery || []).forEach(function (g) { delete g._pending; });
            localStorage.setItem(DRAFT_KEY, JSON.stringify(content));
            log('Готово. GitHub Pages обновит сайт в течение минуты.', 'ok');
            log('→ https://rallkololo-prog.github.io/banya-na-turuhtannyh/');
            modal.hidden = true;
            dirty = false;
            setPublishState();
            status('Опубликовано. Через 30–60 секунд откройте сайт и обновите страницу с Ctrl+F5.');
            toast('Опубликовано');
          });
      })
      .catch(function (err) {
        log('Ошибка: ' + err.message, 'err');
        log('Проверьте, что у ключа есть право Contents: Read and write.', 'err');
        modal.hidden = false;
        logBox.hidden = false;
        status('Не удалось опубликовать: ' + err.message, true);
      })
      .then(function () {
        publishing = false;
        $('#modal-go').disabled = false;
        $('#publish-btn').disabled = false;
      });
  }

  function prepareJson() {
    var copy = JSON.parse(JSON.stringify(content));
    (copy.gallery || []).forEach(function (g) { delete g._pending; });
    copy.updated = new Date().toISOString().slice(0, 10);
    return Promise.resolve(JSON.stringify(copy, null, 2));
  }

  /* ---------- Скачать и сбросить ---------- */

  function downloadJson() {
    prepareJson().then(function (text) {
      var blob = new Blob([text], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'content.json';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
      toast('Файл content.json скачан');
    });
  }

  var dlBtn = $('#download-btn');
  if (dlBtn) dlBtn.addEventListener('click', downloadJson);

  var resetBtn = $('#reset-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', function () {
      if (!confirm('Сбросить черновик в браузере и загрузить данные с сайта?')) return;
      localStorage.removeItem(DRAFT_KEY);
      localStorage.removeItem(PENDING_KEY);
      location.reload();
    });
  }

  /* ------------------------------------------------------------------ */
  /* Старт                                                               */
  /* ------------------------------------------------------------------ */

  function renderAll() {
    renderPrices();
    renderExtras();
    renderMenu();
    renderGallery();
    syncInputs(document);
    setPublishState();
  }

  // статические поля (праздники, общие правила) — сразу
  var started = false;
  function startOnce() {
    if (started) return;
    started = true;
    load();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startOnce);
  else startOnce();
})();
