/* ==========================================================================
   Баня на Турухтанных — логика сайта и калькулятор
   Цены берутся из assets/data/content.json (его правит админка).
   Если файл недоступен — работают значения по умолчанию и статичная разметка.
   ========================================================================== */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Данные по умолчанию (полные — только для расчёта)                    */
  /* ------------------------------------------------------------------ */

  var DATA = {
    tariffs: {
      minHours: 4,
      holidayRate: 3500,
      newYear: { fromMonth: 12, fromDay: 15, toMonth: 1, toDay: 13 },
      slots: {
        am: { start: 9, max: 7, label: '09:00 – 16:00' },
        pm: { start: 16, max: 17, label: '16:00 – 09:00' }
      },
      rows: [
        { id: 'mon-thu', label: 'Пн – Чт', days: [0, 1, 2, 3],
          am: { rate: 3000, promo: { need: 4, gift: 1 } },
          pm: { rate: 3000, promo: { need: 5, gift: 2 } } },
        { id: 'fri', label: 'Пт', days: [4],
          am: { rate: 3000, promo: { need: 4, gift: 1 } },
          pm: { rate: 3500, promo: { need: 5, gift: 2 } } },
        { id: 'sat', label: 'Сб', days: [5],
          am: { rate: 3500, promo: { need: 5, gift: 2 } },
          pm: { rate: 3500, promo: { need: 5, gift: 2 } } },
        { id: 'sun', label: 'Вс', days: [6],
          am: { rate: 3500, promo: { need: 5, gift: 2 } },
          pm: { rate: 3500, promo: { need: 5, gift: 2 } } }
      ],
      holiday: { label: 'Праздничные* и предпраздничные', rate: 3500 }
    },
    guests: {
      included: 10,
      tier1: { upTo: 12, rate: 200 },
      tier2: { rate: 300 },
      kidsFreeAge: 8,
      ofuroFrom: 10
    },
    discount: { birthdayPercent: 20, birthdayGuests: 10, birthdayBlockedDays: [4, 5] },
    extras: [
      { id: 'ofuro', name: 'Офуро', price: 4500, unit: '', kind: 'toggle', mandatoryFrom: 10 },
      { id: 'pech', name: 'Печь', price: 2000, unit: '', kind: 'toggle' },
      { id: 'mangal', name: 'Мангал', price: 2000, unit: '', kind: 'toggle' },
      { id: 'venik', name: 'Веники', price: 500, unit: 'шт', kind: 'qty' },
      { id: 'towel', name: 'Полотенце', price: 200, unit: 'шт', kind: 'qty' },
      { id: 'sheet', name: 'Простыня', price: 200, unit: 'шт', kind: 'qty' },
      { id: 'set', name: 'Комплект', price: 400, unit: 'шт', kind: 'qty' },
      { id: 'coal', name: 'Дополнительный уголь', price: 300, unit: 'шт', kind: 'qty' },
      { id: 'car', name: 'Автомобиль на ночь', price: 1000, unit: '', kind: 'qty' }
    ]
  };

  var DAYS_LONG = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];

  /* ------------------------------------------------------------------ */
  /* Состояние                                                           */
  /* ------------------------------------------------------------------ */

  var today = startOfDay(new Date());

  var state = {
    date: today,
    slot: 'pm',
    hours: 4,
    adults: 6,
    kids: 0,
    birthday: false,
    holiday: false,
    extras: {}
  };

  function resetExtras() {
    state.extras = {};
    (DATA.extras || []).forEach(function (e) { state.extras[e.id] = 0; });
  }
  resetExtras();

  /* ------------------------------------------------------------------ */
  /* Утилиты                                                             */
  /* ------------------------------------------------------------------ */

  var fmt = new Intl.NumberFormat('ru-RU');
  var dateFmt = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' });

  function $(id) { return document.getElementById(id); }
  function rub(n) { return fmt.format(Math.round(n)) + '\u00A0₽'; }
  function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function weekdayIndex(d) { return (d.getDay() + 6) % 7; }
  function isoDate(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function parseISO(v) {
    if (!v) return null;
    var p = v.split('-').map(Number);
    if (p.length !== 3 || !p[0]) return null;
    var d = new Date(p[0], p[1] - 1, p[2]);
    return isNaN(d.getTime()) ? null : startOfDay(d);
  }
  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
    return many;
  }
  function hoursWord(n) { return n + '\u00A0' + plural(n, 'час', 'часа', 'часов'); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function inNewYearPeriod(d) {
    var ny = DATA.tariffs.newYear || {};
    var m = d.getMonth() + 1, day = d.getDate();
    if (!ny.fromMonth) return false;
    var afterFrom = m === ny.fromMonth ? day >= ny.fromDay : m > ny.fromMonth;
    var beforeTo = m === ny.toMonth ? day <= ny.toDay : m < ny.toMonth;
    return afterFrom && beforeTo;
  }

  function rowForDay(wd) {
    var rows = DATA.tariffs.rows || [];
    for (var i = 0; i < rows.length; i++) {
      if ((rows[i].days || []).indexOf(wd) !== -1) return rows[i];
    }
    return rows[0];
  }

  /* ------------------------------------------------------------------ */
  /* Расчёт                                                              */
  /* ------------------------------------------------------------------ */

  function compute() {
    var T = DATA.tariffs, G = DATA.guests, D = DATA.discount;
    var wd = weekdayIndex(state.date);
    var slot = state.slot;
    var slotCfg = T.slots[slot];
    var ny = inNewYearPeriod(state.date);
    var noPromo = state.holiday || ny;

    var row = rowForDay(wd);
    var slotData = row[slot] || {};
    var rate = state.holiday || ny ? T.holidayRate : (slotData.rate || T.holidayRate);
    var maxHours = Math.max(T.minHours, slotCfg.max);

    var hours = Math.min(Math.max(state.hours, T.minHours), maxHours);
    var promo = noPromo ? null : slotData.promo;
    var gift = 0;

    if (promo && hours >= promo.need) gift = Math.min(promo.gift, maxHours - hours);

    var base = hours * rate;
    var totalHours = hours + gift;

    var extraPeople = Math.max(0, state.adults - G.included);
    var perPersonRate = state.adults > G.tier1.upTo ? G.tier2.rate : G.tier1.rate;
    var guestsFee = extraPeople * perPersonRate * hours;

    var extrasSum = 0;
    var extrasList = [];

    (DATA.extras || []).forEach(function (e) {
      var qty = state.extras[e.id] || 0;
      var mandatory = e.mandatoryFrom && state.adults >= e.mandatoryFrom;
      if (qty > 0 || mandatory) {
        var q = mandatory ? Math.max(qty, 1) : qty;
        extrasList.push({ id: e.id, name: e.name, qty: q, unit: e.unit, sum: q * e.price, mandatory: !!mandatory });
        extrasSum += q * e.price;
      }
    });

    var blocked = D.birthdayBlockedDays || [];
    var birthdayAllowed = !state.holiday && !ny && blocked.indexOf(wd) === -1;
    var discount = state.birthday && birthdayAllowed ? Math.round(base * D.birthdayPercent / 100) : 0;

    var total = base + guestsFee + extrasSum - discount;

    var startHour = slotCfg.start;
    var endHour = startHour + totalHours;
    var nextDay = endHour >= 24;
    var endClock = nextDay ? endHour - 24 : endHour;

    return {
      wd: wd, row: row, slot: slot, slotCfg: slotCfg, ny: ny, noPromo: noPromo,
      rate: rate, hours: hours, maxHours: maxHours, promo: promo, gift: gift,
      totalHours: totalHours, base: base, extraPeople: extraPeople,
      perPersonRate: perPersonRate, guestsFee: guestsFee,
      extrasSum: extrasSum, extrasList: extrasList,
      birthdayAllowed: birthdayAllowed, discount: discount, total: total,
      timeText: pad(startHour) + ':00 – ' + pad(endClock) + ':00' + (nextDay ? ' следующего дня' : '')
    };
  }

  /* ------------------------------------------------------------------ */
  /* DOM                                                                 */
  /* ------------------------------------------------------------------ */

  var el_ = {
    date: $('date'),
    weekdays: $('weekdays'),
    dateHint: $('date-hint'),
    slots: $('slots'),
    slotRateAm: $('slot-rate-am'),
    slotRatePm: $('slot-rate-pm'),
    hours: $('hours'),
    hoursValue: $('hours-value'),
    hoursHint: $('hours-hint'),
    rangeMax: $('range-max-label'),
    adultsValue: $('adults-value'),
    kidsValue: $('kids-value'),
    guestsHint: $('guests-hint'),
    birthday: $('birthday'),
    birthdayHint: $('birthday-hint'),
    holiday: $('holiday'),
    holidayHintText: document.querySelector('#holiday ~ .switch__text small, .switch .switch__text small'),
    ofuroHint: $('ofuro-hint'),
    summaryDate: $('summary-date'),
    summaryLines: $('summary-lines'),
    total: $('total'),
    totalNote: $('total-note'),
    mobileTotal: $('mobile-total'),
    copyBtn: $('copy-btn'),
    toast: $('toast'),
    year: $('year'),
    summaryCard: document.querySelector('.summary-card'),
    nav: $('nav'),
    mobileMenu: $('mobile-menu'),
    table: document.querySelector('.price-table'),
    extrasGrid: document.querySelector('.extras-grid'),
    options: document.querySelector('.options'),
    qtyList: document.querySelector('.qty-list'),
    grid: $('gallery-grid'),
    filters: $('filters')
  };

  /* ------------------------------------------------------------------ */
  /* Рендер: меню, цены, допуслуги, галерея                              */
  /* ------------------------------------------------------------------ */

  function renderMenu() {
    if (!DATA.menu || !DATA.menu.length) return;

    if (el_.nav) {
      el_.nav.innerHTML = '';
      DATA.menu.forEach(function (m) {
        var a = el('a', null, m.label);
        a.href = m.href;
        el_.nav.appendChild(a);
      });
    }

    if (el_.mobileMenu) {
      var phones = el_.mobileMenu.querySelectorAll('.mobile-menu__phone');
      el_.mobileMenu.innerHTML = '';
      DATA.menu.forEach(function (m) {
        var a = el('a', null, m.label);
        a.href = m.href;
        el_.mobileMenu.appendChild(a);
      });
      Array.prototype.forEach.call(phones, function (p) {
        var c = p.cloneNode(true);
        el_.mobileMenu.appendChild(c);
      });
    }
    bindNav();
  }

  function renderPrices() {
    var T = DATA.tariffs;
    if (!el_.table) return;

    var head = el('div', 'price-table__head');
    head.setAttribute('role', 'row');
    [ 'День', T.slots.am.label, T.slots.pm.label ].forEach(function (t) {
      var c = el('div', null, t);
      c.setAttribute('role', 'columnheader');
      head.appendChild(c);
    });

    var frag = document.createDocumentFragment();
    frag.appendChild(head);

    (T.rows || []).forEach(function (row) {
      var r = el('div', 'price-row');
      r.setAttribute('role', 'row');
      var day = el('div', 'price-row__day', row.label);
      day.setAttribute('role', 'rowheader');
      r.appendChild(day);
      ['am', 'pm'].forEach(function (slot) {
        r.appendChild(priceCell(row[slot] || {}, row.id, slot, row.label + ', ' + T.slots[slot].label));
      });
      frag.appendChild(r);
    });

    var hol = el('div', 'price-row price-row--holiday');
    hol.setAttribute('role', 'row');
    var holDay = el('div', 'price-row__day');
    holDay.setAttribute('role', 'rowheader');
    var span = el('span');
    span.innerHTML = (T.holiday.label || 'Праздничные').replace('*', '<span class="mark">*</span>').replace(/\s+и\s+/, '<br>и ');
    holDay.appendChild(span);
    hol.appendChild(holDay);
    ['am', 'pm'].forEach(function () {
      hol.appendChild(priceCell({ rate: T.holiday.rate, note: T.holiday.note, noTag: true }, rowForDay(0).id, 'am', T.holiday.label, true));
    });
    frag.appendChild(hol);

    el_.table.innerHTML = '';
    el_.table.appendChild(frag);
  }

  function priceCell(cell, dayId, slot, ariaLabel, isHoliday) {
    var b = el('button', 'price-cell');
    b.type = 'button';
    b.setAttribute('role', 'cell');
    if (isHoliday) b.dataset.holiday = '1';
    else {
      var row = (DATA.tariffs.rows || []).filter(function (r) { return r.id === dayId; })[0];
      var wd = row && row.days ? row.days[0] : 0;
      b.dataset.day = String(wd);
      b.dataset.slot = slot;
    }
    b.setAttribute('aria-label', ariaLabel + ', ' + cell.rate + ' рублей в час: подставить в калькулятор');

    var time = el('span', 'price-cell__time', isHoliday ? 'весь день' : DATA.tariffs.slots[slot].label);
    b.appendChild(time);

    var val = el('span', 'price-cell__value');
    val.innerHTML = fmt.format(cell.rate) + '\u00A0₽<em>/час</em>';
    b.appendChild(val);

    if (cell.tag && !isHoliday) b.appendChild(el('span', 'price-cell__tag', cell.tag));
    if (cell.note) b.appendChild(el('span', 'price-cell__note', cell.note));
    return b;
  }

  function renderExtrasCards() {
    if (!el_.extrasGrid) return;
    el_.extrasGrid.innerHTML = '';
    (DATA.extras || []).forEach(function (e) {
      var art = el('article', 'extra');
      var top = el('div', 'extra__top');
      top.appendChild(el('h4', null, e.name));
      var price = el('span', 'extra__price');
      price.innerHTML = rub(e.price).replace('\u00A0₽', '\u00A0₽') + (e.unit ? ' <em>/' + e.unit + '</em>' : '');
      top.appendChild(price);
      art.appendChild(top);
      if (e.desc) art.appendChild(el('p', null, e.desc));
      el_.extrasGrid.appendChild(art);
    });
  }

  function renderCalcExtras() {
    if (el_.options) {
      el_.options.innerHTML = '';
      (DATA.extras || []).filter(function (e) { return e.kind === 'toggle'; }).forEach(function (e) {
        var label = el('label', 'option');
        var input = document.createElement('input');
        input.type = 'checkbox';
        input.dataset.extra = e.id;
        if (state.extras[e.id]) input.checked = true;
        label.appendChild(input);

        var box = el('span', 'option__box');
        box.appendChild(el('span', 'option__name', e.name));
        box.appendChild(el('span', 'option__price', rub(e.price)));
        var mark = el('span', 'option__mark');
        mark.setAttribute('aria-hidden', 'true');
        box.appendChild(mark);
        label.appendChild(box);
        el_.options.appendChild(label);
      });
    }

    if (el_.qtyList) {
      el_.qtyList.innerHTML = '';
      (DATA.extras || []).filter(function (e) { return e.kind === 'qty'; }).forEach(function (e) {
        var row = el('div', 'qty');
        row.dataset.qty = e.id;
        row.dataset.price = String(e.price);
        row.appendChild(el('span', 'qty__name', e.name));
        row.appendChild(el('span', 'qty__price', rub(e.price) + (e.unit ? '/' + e.unit : '')));

        var st = el('div', 'stepper stepper--sm');
        st.setAttribute('role', 'group');
        st.setAttribute('aria-label', e.name);
        ['-1', '1'].forEach(function (dir, i) {
          var btn = el('button', 'stepper__btn', i === 0 ? '−' : '+');
          btn.type = 'button';
          btn.dataset.qtyStep = dir;
          btn.setAttribute('aria-label', (i === 0 ? 'Меньше: ' : 'Больше: ') + e.name);
          if (i === 0) st.appendChild(btn);
          else {
            var out = el('output', 'stepper__value', String(state.extras[e.id] || 0));
            st.appendChild(out);
            st.appendChild(btn);
          }
        });
        row.appendChild(st);
        el_.qtyList.appendChild(row);
      });
    }
  }

  function renderGallery() {
    if (!el_.grid) return;

    var cats = DATA.categories && DATA.categories.length
      ? DATA.categories
      : (DATA.gallery || []).map(function (g) { return g.category; }).filter(function (v, i, a) { return a.indexOf(v) === i; });

    if (el_.filters) {
      var counts = {};
      (DATA.gallery || []).forEach(function (g) { counts[g.category] = (counts[g.category] || 0) + 1; });

      el_.filters.innerHTML = '';
      var all = el('button', 'chip is-active', 'Все ');
      all.type = 'button';
      all.dataset.filter = 'all';
      all.setAttribute('role', 'tab');
      all.setAttribute('aria-selected', 'true');
      all.appendChild(el('span', null, String((DATA.gallery || []).length)));
      el_.filters.appendChild(all);

      cats.forEach(function (c) {
        if (!counts[c]) return;
        var b = el('button', 'chip', c + ' ');
        b.type = 'button';
        b.dataset.filter = c;
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-selected', 'false');
        b.appendChild(el('span', null, String(counts[c])));
        el_.filters.appendChild(b);
      });
    }

    el_.grid.innerHTML = '';
    (DATA.gallery || []).forEach(function (g) {
      var fig = el('figure', 'shot');
      fig.dataset.cat = g.category;
      fig.dataset.cap = g.caption;

      var btn = el('button', 'shot__btn');
      btn.type = 'button';
      btn.setAttribute('aria-label', 'Открыть фото: ' + g.caption);
      btn.dataset.full = g.src;

      var img = document.createElement('img');
      img.src = g.thumb;
      img.alt = g.alt || g.caption;
      img.width = 640;
      img.height = 427;
      img.loading = 'lazy';
      img.decoding = 'async';
      btn.appendChild(img);

      fig.appendChild(btn);
      fig.appendChild(el('figcaption', null, g.caption));
      el_.grid.appendChild(fig);
    });
  }

  function renderAll() {
    renderMenu();
    renderPrices();
    renderExtrasCards();
    renderCalcExtras();
    renderGallery();
    resetExtras(true);
    bindGallery();
    render();
  }

  /* ------------------------------------------------------------------ */
  /* Рендер расчёта                                                      */
  /* ------------------------------------------------------------------ */

  function renderWeekdays() {
    var wd = weekdayIndex(state.date);
    Array.prototype.forEach.call(el_.weekdays.children, function (b) {
      var on = Number(b.dataset.wd) === wd;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function renderSlots(r) {
    Array.prototype.forEach.call(el_.slots.children, function (b) {
      var on = b.dataset.slot === state.slot;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });

    var row = r.row;
    var am = state.holiday || r.ny ? DATA.tariffs.holidayRate : row.am.rate;
    var pm = state.holiday || r.ny ? DATA.tariffs.holidayRate : row.pm.rate;

    if (el_.slotRateAm) el_.slotRateAm.textContent = rub(am) + '/час';
    if (el_.slotRatePm) el_.slotRatePm.textContent = rub(pm) + '/час';

    var amTime = el_.slots.querySelector('[data-slot="am"] .slot__time');
    var pmTime = el_.slots.querySelector('[data-slot="pm"] .slot__time');
    if (amTime) amTime.textContent = DATA.tariffs.slots.am.label;
    if (pmTime) pmTime.textContent = 'с ' + pad(DATA.tariffs.slots.pm.start) + ':00';
  }

  function renderHours(r) {
    el_.hours.max = String(r.maxHours);
    el_.hours.value = String(r.hours);
    el_.hoursValue.textContent = hoursWord(r.hours);
    el_.rangeMax.textContent = hoursWord(r.maxHours);

    var pct = (r.hours / Math.max(1, r.maxHours)) * 100;
    el_.hours.style.setProperty('--pct', pct + '%');

    var text;
    if (r.noPromo) {
      text = state.holiday
        ? 'Праздничный день: скидки и акции не действуют, оплачиваются все часы.'
        : 'С 15 декабря по 13 января скидки и акции не действуют — ' + rub(DATA.tariffs.holidayRate) + '/час.';
    } else if (r.promo) {
      var need = r.promo.need, gift = r.promo.gift;
      var giftText = gift === 1 ? '5-й час' : gift + ' часа';
      if (r.hours >= need) {
        text = 'Акция применена: <b>' + giftText + '</b> в подарок. Всего времени — ' + hoursWord(r.totalHours) + '.';
      } else {
        text = 'Добавьте ещё <b>' + hoursWord(need - r.hours) + '</b> — и ' + giftText + ' будет в подарок.';
      }
    } else {
      text = 'Минимальный заказ — ' + hoursWord(DATA.tariffs.minHours) + '.';
    }
    el_.hoursHint.innerHTML = text;
  }

  function renderGuests(r) {
    var G = DATA.guests;
    el_.adultsValue.textContent = String(state.adults);
    el_.kidsValue.textContent = String(state.kids);

    var doc;
    if (state.adults > G.tier1.upTo) {
      doc = 'Гостей больше ' + G.tier1.upTo + ' — такие компании принимаются только по согласованию с администратором. ' +
        'Доплата: ' + G.tier2.rate + ' ₽/час с каждого гостя свыше ' + G.included + '.';
    } else if (state.adults > G.included) {
      doc = 'До ' + G.included + ' гостей включено в стоимость. За ' + (state.adults - G.included) + ' ' +
        plural(state.adults - G.included, 'гостя', 'гостей', 'гостей') + ' — ' + G.tier1.rate + ' ₽/час с каждого.';
    } else {
      doc = 'До ' + G.included + ' гостей включено в стоимость. Свыше ' + G.included + ' до ' + G.tier1.upTo +
        ' — по ' + G.tier1.rate + ' ₽/час с каждого, свыше ' + G.tier1.upTo + ' — по ' + G.tier2.rate + ' ₽/час.';
    }
    if (state.kids > 0) {
      doc += ' Дети до ' + G.kidsFreeAge + ' лет — бесплатно, количество согласуйте с администратором.';
    }
    el_.guestsHint.innerHTML = doc;
    if (el_.ofuroHint) el_.ofuroHint.hidden = state.adults < G.ofuroFrom;
  }

  function renderBirthday(r) {
    var D = DATA.discount;
    var disabled = !r.birthdayAllowed;
    el_.birthday.disabled = disabled;
    if (disabled && state.birthday) { state.birthday = false; el_.birthday.checked = false; }

    if (state.holiday) {
      el_.birthdayHint.textContent = 'В праздничные и предпраздничные дни скидка не действует.';
    } else if (r.ny) {
      el_.birthdayHint.textContent = 'С 15 декабря по 13 января скидки и акции не действуют.';
    } else if ((D.birthdayBlockedDays || []).indexOf(r.wd) !== -1) {
      el_.birthdayHint.textContent = 'По пятницам и субботам скидка в день рождения не действует.';
    } else if (state.birthday) {
      el_.birthdayHint.textContent = 'Скидка ' + D.birthdayPercent + ' % применена только к основной услуге (для ' +
        D.birthdayGuests + ' человек). Дополнительные услуги и гости свыше ' + D.birthdayGuests + ' человек не скидываются.';
    } else {
      el_.birthdayHint.textContent = 'Скидка ' + D.birthdayPercent + ' % на основную услугу для ' + D.birthdayGuests +
        ' человек при предъявлении паспорта. Скидки не суммируются.';
    }

    var wrap = el_.birthday.closest('.switch');
    if (wrap) wrap.classList.toggle('is-muted', disabled);
  }

  function line(label, value, cls, sub) {
    var li = document.createElement('li');
    if (cls) li.className = cls;
    var l = el('span', 'sl-label', label);
    if (sub) l.appendChild(el('small', null, sub));
    var v = el('span', 'sl-value', value);
    li.appendChild(l);
    li.appendChild(v);
    return li;
  }

  function renderSummary(r) {
    el_.summaryDate.textContent = dateFmt.format(state.date).replace('.', '') + ', ' + r.timeText;

    var frag = document.createDocumentFragment();
    frag.appendChild(line('Тариф · ' + (state.holiday ? 'праздничный день' : DAYS_LONG[r.wd]), rub(r.rate) + '/час'));
    frag.appendChild(line('Часы к оплате', r.hours + '\u00A0ч × ' + rub(r.rate), null, r.timeText));

    if (r.gift > 0) {
      frag.appendChild(line('В подарок по акции', '+' + hoursWord(r.gift), 'is-free', 'Всего времени: ' + hoursWord(r.totalHours)));
    }

    if (r.extraPeople > 0) {
      frag.appendChild(line('Гости свыше ' + DATA.guests.included, '+' + rub(r.guestsFee), null,
        r.extraPeople + ' ' + plural(r.extraPeople, 'гость', 'гостя', 'гостей') + ' × ' + r.perPersonRate + ' ₽/час × ' + r.hours + ' ч'));
    } else {
      frag.appendChild(line('Гости', state.adults + ' ' + plural(state.adults, 'человек', 'человека', 'человек') + ' — включено'));
    }

    r.extrasList.forEach(function (e) {
      frag.appendChild(line(e.name + (e.mandatory ? ' (обязательно)' : ''), rub(e.sum), e.mandatory ? 'is-required' : null,
        e.qty > 1 ? e.qty + ' ' + (e.unit || 'шт') + ' × ' + rub(e.sum / e.qty) : null));
    });

    if (r.discount > 0) {
      frag.appendChild(line('Скидка в день рождения −' + DATA.discount.birthdayPercent + ' %', '−' + rub(r.discount), 'is-discount', 'Только на основную услугу'));
    }

    el_.summaryLines.innerHTML = '';
    el_.summaryLines.appendChild(frag);
    el_.total.textContent = rub(r.total);
    if (el_.mobileTotal) el_.mobileTotal.textContent = rub(r.total);

    var note;
    if (state.adults > DATA.guests.tier1.upTo) {
      note = 'Компании свыше ' + DATA.guests.tier1.upTo + ' человек принимаются только по согласованию с администратором.';
    } else if (state.adults >= DATA.guests.ofuroFrom) {
      note = 'От ' + DATA.guests.ofuroFrom + ' гостей аренда офуро обязательна — она уже в расчёте.';
    } else {
      note = 'Итог предварительный: точную стоимость и свободное время подтверждает администратор.';
    }
    el_.totalNote.textContent = note;
  }

  function renderDateHint(r) {
    var parts = [];
    if (r.ny) parts.push('15 декабря – 13 января: скидки и акции не действуют, ' + rub(DATA.tariffs.holidayRate) + '/час.');
    if (state.holiday) parts.push('Праздничный тариф действует весь день.');
    if (!r.noPromo && r.promo) parts.push('Акция дня: ' + r.promo.need + ' ч + ' + r.promo.gift + ' ч в подарок.');
    if (!parts.length) parts.push('Выберите дату или день недели — тариф подставится автоматически.');
    el_.dateHint.innerHTML = parts.join(' ');
  }

  function render() {
    var r = compute();
    state.hours = r.hours;

    renderWeekdays();
    renderSlots(r);
    renderHours(r);
    renderGuests(r);
    renderBirthday(r);
    renderSummary(r);
    renderDateHint(r);

    el_.date.value = isoDate(state.date);
    markActive(r);
  }

  /* ------------------------------------------------------------------ */
  /* Навигация: активный пункт                                           */
  /* ------------------------------------------------------------------ */

  var navLinks = [];
  var navTargets = [];

  function bindNav() {
    navLinks = Array.prototype.slice.call(document.querySelectorAll('.nav a[href^="#"]'));
    navTargets = navLinks.map(function (a) {
      var id = a.getAttribute('href').slice(1);
      return document.getElementById(id);
    });

    navLinks.forEach(function (a) {
      a.addEventListener('click', function () {
        navLinks.forEach(function (x) { x.classList.toggle('is-active', x === a); });
      });
    });
  }

  function markActive(r) {
    if (!navLinks.length) return;
    var line = window.innerHeight * 0.32;
    var found = -1;
    navTargets.forEach(function (t, i) {
      if (!t) return;
      var b = t.getBoundingClientRect();
      if (b.top <= line && b.bottom > line) found = i;
    });
    if (found === -1) return;
    navLinks.forEach(function (a, i) { a.classList.toggle('is-active', i === found); });
  }

  window.addEventListener('scroll', function () {
    if (navLinks.length) markActive();
  }, { passive: true });

  /* ------------------------------------------------------------------ */
  /* События калькулятора                                                */
  /* ------------------------------------------------------------------ */

  function setDate(d) {
    state.date = startOfDay(d);
    render();
  }

  function nextWeekday(wd) {
    var d = new Date(state.date);
    var diff = (wd - weekdayIndex(d) + 7) % 7;
    if (diff > 0) d.setDate(d.getDate() + diff);
    if (startOfDay(d) < today) d.setDate(d.getDate() + 7);
    return d;
  }

  el_.date.min = isoDate(today);
  el_.date.addEventListener('change', function () {
    var d = parseISO(el_.date.value);
    if (d) setDate(d); else el_.date.value = isoDate(state.date);
    render();
  });

  el_.weekdays.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-wd]');
    if (!b) return;
    setDate(nextWeekday(Number(b.dataset.wd)));
  });

  el_.slots.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-slot]');
    if (!b) return;
    state.slot = b.dataset.slot;
    var max = DATA.tariffs.slots[state.slot].max;
    if (state.hours > max) state.hours = max;
    render();
  });

  el_.hours.addEventListener('input', function () {
    state.hours = Number(el_.hours.value);
    render();
  });

  document.addEventListener('click', function (e) {
    var step = e.target.closest('[data-step]');
    if (step) {
      var key = step.dataset.step;
      var dir = Number(step.dataset.dir);
      var min = key === 'hours' ? DATA.tariffs.minHours : key === 'adults' ? 1 : 0;
      var max = key === 'hours' ? DATA.tariffs.slots[state.slot].max : key === 'adults' ? 20 : 8;
      state[key] = Math.min(max, Math.max(min, state[key] + dir));
      render();
      return;
    }

    var qBtn = e.target.closest('[data-qty-step]');
    if (qBtn) {
      var row = qBtn.closest('.qty');
      if (!row) return;
      var k = row.dataset.qty;
      var d = Number(qBtn.dataset.qtyStep);
      var maxQ = k === 'car' ? 5 : 20;
      state.extras[k] = Math.min(maxQ, Math.max(0, (state.extras[k] || 0) + d));
      var out = row.querySelector('output');
      if (out) out.textContent = String(state.extras[k]);
      render();
    }
  });

  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t && t.dataset && t.dataset.extra) {
      state.extras[t.dataset.extra] = t.checked ? 1 : 0;
      render();
    }
  });

  el_.birthday.addEventListener('change', function () {
    state.birthday = el_.birthday.checked;
    render();
  });

  el_.holiday.addEventListener('change', function () {
    state.holiday = el_.holiday.checked;
    render();
  });

  // Клик по тарифу в таблице цен
  if (el_.table) {
    el_.table.addEventListener('click', function (e) {
      var cell = e.target.closest('.price-cell');
      if (!cell) return;

      if (cell.dataset.holiday) {
        state.holiday = true;
        el_.holiday.checked = true;
        state.date = today;
      } else {
        state.holiday = false;
        el_.holiday.checked = false;
        state.date = nextWeekday(Number(cell.dataset.day));
        state.slot = cell.dataset.slot;
        if (state.hours > DATA.tariffs.slots[state.slot].max) state.hours = DATA.tariffs.slots[state.slot].max;
      }
      render();

      var calc = document.getElementById('calc');
      if (calc) calc.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el_.summaryCard.classList.add('is-flash');
      setTimeout(function () { el_.summaryCard.classList.remove('is-flash'); }, 1200);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Копирование расчёта                                                 */
  /* ------------------------------------------------------------------ */

  function buildSummaryText() {
    var r = compute();
    var lines = [];
    lines.push('Баня на Турухтанных — предварительный расчёт');
    lines.push(dateFmt.format(state.date).replace('.', '') + (state.holiday ? ', праздничный день' : '') + ' · ' + r.timeText);
    lines.push('Тариф: ' + rub(r.rate) + '/час, часов к оплате: ' + r.hours +
      (r.gift ? ', в подарок: +' + r.gift + ' ч (всего ' + r.totalHours + ' ч)' : ''));
    lines.push('Гостей: ' + state.adults + (state.kids ? ' + детей до 8 лет: ' + state.kids : ''));
    if (r.extraPeople > 0) lines.push('Доплата за гостей свыше ' + DATA.guests.included + ': ' + rub(r.guestsFee));
    if (r.extrasList.length) {
      lines.push('Дополнительно: ' + r.extrasList.map(function (e) { return e.name + ' — ' + rub(e.sum); }).join('; '));
    }
    if (r.discount > 0) lines.push('Скидка в день рождения −' + DATA.discount.birthdayPercent + ' %: −' + rub(r.discount));
    lines.push('ИТОГО: ' + rub(r.total));
    lines.push('Предоплата 5 000 ₽ и залог 5 000 ₽ — отдельно. Телефон: +7 (812) 642-69-72');
    return lines.join('\n');
  }

  function showToast(msg) {
    el_.toast.textContent = msg;
    el_.toast.classList.add('is-visible');
    clearTimeout(showToast.t);
    showToast.t = setTimeout(function () { el_.toast.classList.remove('is-visible'); }, 2800);
  }

  el_.copyBtn.addEventListener('click', function () {
    var text = buildSummaryText();
    var ok = function () { showToast('Расчёт скопирован — вставьте его в VK, Telegram или Max'); };
    var fail = function () { showToast('Не удалось скопировать. Позвоните: +7 (812) 642-69-72'); };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(ok).catch(function () { legacyCopy(text) ? ok() : fail(); });
    } else {
      legacyCopy(text) ? ok() : fail();
    }
  });

  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-1000px;left:-1000px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  /* ------------------------------------------------------------------ */
  /* Шапка, меню                                                         */
  /* ------------------------------------------------------------------ */

  var header = document.getElementById('site-header');
  var burger = document.getElementById('burger');

  function onScroll() { header.classList.toggle('is-scrolled', window.scrollY > 24); }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  burger.addEventListener('click', function () {
    var open = !el_.mobileMenu.hidden;
    el_.mobileMenu.hidden = open;
    burger.classList.toggle('is-open', !open);
    burger.setAttribute('aria-expanded', String(!open));
  });

  el_.mobileMenu.addEventListener('click', function (e) {
    if (e.target.tagName === 'A') {
      el_.mobileMenu.hidden = true;
      burger.classList.remove('is-open');
      burger.setAttribute('aria-expanded', 'false');
    }
  });

  /* ------------------------------------------------------------------ */
  /* Галерея: фильтр + лайтбокс                                          */
  /* ------------------------------------------------------------------ */

  var lb = {
    root: document.getElementById('lightbox'),
    img: document.getElementById('lb-img'),
    cap: document.getElementById('lb-cap'),
    counter: document.getElementById('lb-counter'),
    list: [],
    index: 0
  };

  function allShots() {
    return Array.prototype.slice.call(el_.grid.querySelectorAll('.shot'));
  }
  function visibleShots() {
    return allShots().filter(function (s) { return !s.classList.contains('is-hidden'); });
  }

  function openLightbox(shot) {
    lb.list = visibleShots();
    lb.index = Math.max(0, lb.list.indexOf(shot));
    showSlide();
    lb.root.hidden = false;
    document.body.classList.add('is-locked');
    document.getElementById('lb-close').focus();
  }

  function showSlide() {
    var s = lb.list[lb.index];
    if (!s) return;
    var btn = s.querySelector('.shot__btn');
    var img = s.querySelector('img');
    lb.img.src = btn.dataset.full || img.src;
    lb.img.alt = img.alt;
    lb.cap.textContent = s.dataset.cap || '';
    lb.counter.textContent = (lb.index + 1) + ' / ' + lb.list.length;
  }

  function closeLightbox() {
    lb.root.hidden = true;
    document.body.classList.remove('is-locked');
    lb.img.removeAttribute('src');
  }

  function stepSlide(dir) {
    if (!lb.list.length) return;
    lb.index = (lb.index + dir + lb.list.length) % lb.list.length;
    showSlide();
  }

  function bindGallery() {
    el_.grid.addEventListener('click', function (e) {
      var btn = e.target.closest('.shot__btn');
      if (!btn) return;
      openLightbox(btn.closest('.shot'));
    });
  }

  el_.filters.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-filter]');
    if (!b) return;
    var f = b.dataset.filter;
    Array.prototype.forEach.call(el_.filters.children, function (x) {
      var on = x === b;
      x.classList.toggle('is-active', on);
      x.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    allShots().forEach(function (s) {
      s.classList.toggle('is-hidden', !(f === 'all' || s.dataset.cat === f));
    });
  });

  document.getElementById('lb-close').addEventListener('click', closeLightbox);
  document.getElementById('lb-prev').addEventListener('click', function () { stepSlide(-1); });
  document.getElementById('lb-next').addEventListener('click', function () { stepSlide(1); });
  lb.root.addEventListener('click', function (e) {
    if (e.target === lb.root || e.target.classList.contains('lightbox__figure')) closeLightbox();
  });

  document.addEventListener('keydown', function (e) {
    if (lb.root.hidden) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') stepSlide(-1);
    if (e.key === 'ArrowRight') stepSlide(1);
  });

  /* ------------------------------------------------------------------ */
  /* Появление блоков                                                    */
  /* ------------------------------------------------------------------ */

  function observeReveals() {
    if (!('IntersectionObserver' in window)) {
      document.querySelectorAll('.reveal').forEach(function (n) { n.classList.add('is-in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    document.querySelectorAll('.reveal').forEach(function (n) { io.observe(n); });
  }

  /* ------------------------------------------------------------------ */
  /* Загрузка данных                                                     */
  /* ------------------------------------------------------------------ */

  function applyData(json) {
    if (!json || typeof json !== 'object') return false;
    if (json.tariffs) DATA.tariffs = json.tariffs;
    if (json.guests) DATA.guests = json.guests;
    if (json.discount) DATA.discount = json.discount;
    if (json.extras) DATA.extras = json.extras;
    if (json.menu) DATA.menu = json.menu;
    if (json.categories) DATA.categories = json.categories;
    if (json.gallery) DATA.gallery = json.gallery;
    return true;
  }

  function loadContent() {
    if (!window.fetch) return;

    // Черновик из админки (если открыт предпросмотр)
    try {
      var draft = localStorage.getItem('banya_content_draft');
      if (draft && /[?&]preview=1/.test(location.search)) {
        if (applyData(JSON.parse(draft))) { renderAll(); return; }
      }
    } catch (e) {}

    fetch('assets/data/content.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (json) {
        if (json && applyData(json)) renderAll();
      })
      .catch(function () { /* остаются значения по умолчанию и статичная разметка */ });
  }

  /* ------------------------------------------------------------------ */
  /* Старт                                                               */
  /* ------------------------------------------------------------------ */

  el_.year.textContent = String(new Date().getFullYear());
  el_.date.value = isoDate(state.date);
  bindGallery();
  bindNav();
  observeReveals();
  render();
  loadContent();

  window.BanyaCalc = { get data() { return DATA; }, recompute: render };
})();
