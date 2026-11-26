/* ==========================================================================
   Баня на Турухтанных — логика сайта и калькулятор
   Все цены и правила взяты с turuhtan.ru без изменений.
   ========================================================================== */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Прайс                                                               */
  /* ------------------------------------------------------------------ */

  // Ставка ₽/час: [день недели 0=Пн … 6=Вс][слот]
  var RATES = {
    0: { am: 3000, pm: 3000 }, // Пн
    1: { am: 3000, pm: 3000 }, // Вт
    2: { am: 3000, pm: 3000 }, // Ср
    3: { am: 3000, pm: 3000 }, // Чт
    4: { am: 3000, pm: 3500 }, // Пт
    5: { am: 3500, pm: 3500 }, // Сб
    6: { am: 3500, pm: 3500 }  // Вс
  };

  // Акции «плюс часы в подарок»: сколько часов оплатить → сколько в подарок
  var PROMOS = {
    0: { am: { need: 4, gift: 1 }, pm: { need: 5, gift: 2 } },
    1: { am: { need: 4, gift: 1 }, pm: { need: 5, gift: 2 } },
    2: { am: { need: 4, gift: 1 }, pm: { need: 5, gift: 2 } },
    3: { am: { need: 4, gift: 1 }, pm: { need: 5, gift: 2 } },
    4: { am: { need: 4, gift: 1 }, pm: { need: 5, gift: 2 } },
    5: { am: { need: 5, gift: 2 }, pm: { need: 5, gift: 2 } },
    6: { am: { need: 5, gift: 2 }, pm: { need: 5, gift: 2 } }
  };

  var HOLIDAY_RATE = 3500;

  var SLOTS = {
    am: { start: 9, max: 7, label: '09:00–16:00' },
    pm: { start: 16, max: 17, label: '16:00–09:00' }
  };

  var EXTRAS = {
    ofuro: { price: 4500, name: 'Офуро' },
    pech: { price: 2000, name: 'Печь' },
    mangal: { price: 2000, name: 'Мангал' },
    venik: { price: 500, name: 'Веники' },
    towel: { price: 200, name: 'Полотенце' },
    sheet: { price: 200, name: 'Простыня' },
    set: { price: 400, name: 'Комплект: полотенце + простыня' },
    coal: { price: 300, name: 'Дополнительный уголь' },
    car: { price: 1000, name: 'Автомобиль на ночь' }
  };

  var QTY_KEYS = ['venik', 'towel', 'sheet', 'set', 'coal', 'car'];
  var TOGGLE_KEYS = ['ofuro', 'pech', 'mangal'];

  var DAYS_SHORT = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
  var DAYS_LONG = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
  var DAYS_TARIFF = ['Пн–Чт', 'Пн–Чт', 'Пн–Чт', 'Пн–Чт', 'Пт', 'Сб', 'Вс'];

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

  TOGGLE_KEYS.concat(QTY_KEYS).forEach(function (k) { state.extras[k] = 0; });

  /* ------------------------------------------------------------------ */
  /* Утилиты                                                             */
  /* ------------------------------------------------------------------ */

  var fmt = new Intl.NumberFormat('ru-RU');
  var dateFmt = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' });

  function rub(n) { return fmt.format(Math.round(n)) + '\u00A0₽'; }
  function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function weekdayIndex(d) { return (d.getDay() + 6) % 7; }
  function isoDate(d) {
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
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

  function inNewYearPeriod(d) {
    var m = d.getMonth() + 1, day = d.getDate();
    return (m === 12 && day >= 15) || (m === 1 && day <= 13);
  }

  /* ------------------------------------------------------------------ */
  /* Расчёт                                                              */
  /* ------------------------------------------------------------------ */

  function compute() {
    var wd = weekdayIndex(state.date);
    var slot = state.slot;
    var ny = inNewYearPeriod(state.date);
    var noPromo = state.holiday || ny;

    var rate = state.holiday || ny ? HOLIDAY_RATE : RATES[wd][slot];
    var maxHours = SLOTS[slot].max;

    var hours = Math.min(Math.max(state.hours, 4), maxHours);
    var promo = noPromo ? null : PROMOS[wd][slot];
    var gift = 0;

    if (promo && hours >= promo.need) {
      gift = Math.min(promo.gift, maxHours - hours);
    }

    var base = hours * rate;
    var totalHours = hours + gift;

    var extraPeople = Math.max(0, state.adults - 10);
    var perPersonRate = state.adults > 12 ? 300 : 200;
    var guestsFee = extraPeople * perPersonRate * hours;

    var extrasSum = 0;
    var extrasList = [];

    TOGGLE_KEYS.forEach(function (k) {
      var on = state.extras[k] || (k === 'ofuro' && state.adults >= 10);
      if (on) {
        extrasList.push({ name: EXTRAS[k].name, qty: 1, sum: EXTRAS[k].price });
        extrasSum += EXTRAS[k].price;
      }
    });

    QTY_KEYS.forEach(function (k) {
      var q = state.extras[k] || 0;
      if (q > 0) {
        extrasList.push({ name: EXTRAS[k].name, qty: q, sum: q * EXTRAS[k].price });
        extrasSum += q * EXTRAS[k].price;
      }
    });

    var birthdayAllowed = !state.holiday && !ny && wd !== 4 && wd !== 5;
    var discount = state.birthday && birthdayAllowed ? Math.round(base * 0.2) : 0;

    var total = base + guestsFee + extrasSum - discount;

    var startHour = SLOTS[slot].start;
    var endHour = startHour + totalHours;
    var endsNextDay = endHour >= 24;
    var endClock = endsNextDay ? endHour - 24 : endHour;

    return {
      wd: wd,
      slot: slot,
      ny: ny,
      noPromo: noPromo,
      rate: rate,
      hours: hours,
      maxHours: maxHours,
      promo: promo,
      gift: gift,
      totalHours: totalHours,
      base: base,
      extraPeople: extraPeople,
      perPersonRate: perPersonRate,
      guestsFee: guestsFee,
      extrasSum: extrasSum,
      extrasList: extrasList,
      birthdayAllowed: birthdayAllowed,
      discount: discount,
      total: total,
      timeText: pad(startHour) + ':00 – ' + pad(endClock) + ':00' + (endsNextDay ? ' следующего дня' : '')
    };
  }

  /* ------------------------------------------------------------------ */
  /* DOM                                                                 */
  /* ------------------------------------------------------------------ */

  var $ = function (id) { return document.getElementById(id); };

  var el = {
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
    ofuroHint: $('ofuro-hint'),
    summaryDate: $('summary-date'),
    summaryLines: $('summary-lines'),
    total: $('total'),
    totalNote: $('total-note'),
    mobileTotal: $('mobile-total'),
    copyBtn: $('copy-btn'),
    toast: $('toast'),
    year: $('year'),
    summaryCard: document.querySelector('.summary-card')
  };

  /* ------------------------------------------------------------------ */
  /* Рендер                                                              */
  /* ------------------------------------------------------------------ */

  function renderWeekdays() {
    var wd = weekdayIndex(state.date);
    Array.prototype.forEach.call(el.weekdays.children, function (b) {
      var on = Number(b.dataset.wd) === wd;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function renderSlots(r) {
    Array.prototype.forEach.call(el.slots.children, function (b) {
      var on = b.dataset.slot === state.slot;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });

    var wd = weekdayIndex(state.date);
    var ny = r.ny;
    var am = state.holiday || ny ? HOLIDAY_RATE : RATES[wd].am;
    var pm = state.holiday || ny ? HOLIDAY_RATE : RATES[wd].pm;
    el.slotRateAm.textContent = rub(am) + '/час';
    el.slotRatePm.textContent = rub(pm) + '/час';
  }

  function renderHours(r) {
    el.hours.max = String(r.maxHours);
    el.hours.value = String(r.hours);
    el.hoursValue.textContent = hoursWord(r.hours);
    el.rangeMax.textContent = hoursWord(r.maxHours);

    var pct = (r.hours / Math.max(1, r.maxHours)) * 100;
    el.hours.style.setProperty('--pct', pct + '%');

    var text;
    if (r.noPromo) {
      text = state.holiday
        ? 'Праздничный день: скидки и акции не действуют, оплачиваются все часы.'
        : 'С 15 декабря по 13 января скидки и акции не действуют — 3 500 ₽/час.';
    } else if (r.promo) {
      var need = r.promo.need, gift = r.promo.gift;
      var giftText = gift === 1 ? '5-й час' : '2 часа';
      if (r.hours >= need) {
        text = 'Акция применена: <b>' + giftText + '</b> в подарок. Всего времени — ' +
          hoursWord(r.totalHours) + '.';
      } else {
        var left = need - r.hours;
        text = 'Добавьте ещё <b>' + hoursWord(left) + '</b> — и ' + giftText + ' будет в подарок.';
      }
    } else {
      text = 'Минимальный заказ — 4 часа.';
    }
    el.hoursHint.innerHTML = text;
  }

  function renderGuests(r) {
    el.adultsValue.textContent = String(state.adults);
    el.kidsValue.textContent = String(state.kids);

    var doc = '';
    if (state.adults > 12) {
      doc = 'Гостей больше 12 — такие компании принимаются только по согласованию с администратором. ' +
        'Доплата: 300 ₽/час с каждого гостя свыше 10.';
    } else if (state.adults > 10) {
      doc = 'До 10 гостей включено в стоимость. За ' + (state.adults - 10) + ' ' +
        plural(state.adults - 10, 'гостя', 'гостей', 'гостей') + ' — 200 ₽/час с каждого.';
    } else {
      doc = 'До 10 гостей включено в стоимость. Свыше 10 до 12 — по 200 ₽/час с каждого, свыше 12 — по 300 ₽/час.';
    }
    if (state.kids > 0) {
      doc += ' Дети до 8 лет — бесплатно, количество согласуйте с администратором.';
    }
    el.guestsHint.innerHTML = doc;

    el.ofuroHint.hidden = state.adults < 10;
  }

  function renderBirthday(r) {
    var disabled = !r.birthdayAllowed;
    el.birthday.disabled = disabled;
    if (disabled && state.birthday) { state.birthday = false; el.birthday.checked = false; }

    if (state.holiday) {
      el.birthdayHint.textContent = 'В праздничные и предпраздничные дни скидка не действует.';
    } else if (r.ny) {
      el.birthdayHint.textContent = 'С 15 декабря по 13 января скидки и акции не действуют.';
    } else if (r.wd === 4 || r.wd === 5) {
      el.birthdayHint.textContent = 'По пятницам и субботам скидка в день рождения не действует.';
    } else if (state.birthday) {
      el.birthdayHint.textContent = 'Скидка 20 % применена только к основной услуге (для 10 человек). ' +
        'Дополнительные услуги и гости свыше 10 человек не скидываются.';
    } else {
      el.birthdayHint.textContent = 'Скидка 20 % на основную услугу для 10 человек при предъявлении паспорта. ' +
        'Скидки не суммируются.';
    }

    var wrap = el.birthday.closest('.switch');
    if (wrap) wrap.classList.toggle('is-muted', disabled);
  }

  function line(label, value, cls, sub) {
    var li = document.createElement('li');
    if (cls) li.className = cls;
    var l = document.createElement('span');
    l.className = 'sl-label';
    l.textContent = label;
    if (sub) {
      var small = document.createElement('small');
      small.textContent = sub;
      l.appendChild(small);
    }
    var v = document.createElement('span');
    v.className = 'sl-value';
    v.textContent = value;
    li.appendChild(l);
    li.appendChild(v);
    return li;
  }

  function renderSummary(r) {
    el.summaryDate.textContent = dateFmt.format(state.date).replace('.', '') + ', ' + SLOTS[r.slot].label;

    var frag = document.createDocumentFragment();

    frag.appendChild(line(
      'Тариф · ' + (state.holiday ? 'праздничный день' : DAYS_LONG[r.wd]),
      rub(r.rate) + '/час'
    ));

    frag.appendChild(line(
      'Часы к оплате',
      r.hours + '\u00A0ч × ' + rub(r.rate),
      null,
      r.timeText
    ));

    if (r.gift > 0) {
      frag.appendChild(line('В подарок по акции', '+' + hoursWord(r.gift), 'is-free',
        'Всего времени: ' + hoursWord(r.totalHours)));
    }

    if (r.extraPeople > 0) {
      frag.appendChild(line(
        'Гости свыше 10',
        '+' + rub(r.guestsFee),
        null,
        r.extraPeople + ' ' + plural(r.extraPeople, 'гость', 'гостя', 'гостей') +
        ' × ' + r.perPersonRate + ' ₽/час × ' + r.hours + ' ч'
      ));
    } else {
      frag.appendChild(line('Гости', state.adults + ' ' + plural(state.adults, 'человек', 'человека', 'человек') + ' — включено'));
    }

    r.extrasList.forEach(function (e) {
      frag.appendChild(line(
        e.name,
        rub(e.sum),
        null,
        e.qty > 1 ? e.qty + ' шт × ' + rub(e.sum / e.qty) : null
      ));
    });

    if (r.discount > 0) {
      frag.appendChild(line('Скидка в день рождения −20 %', '−' + rub(r.discount), 'is-discount',
        'Только на основную услугу'));
    }

    el.summaryLines.innerHTML = '';
    el.summaryLines.appendChild(frag);
    el.total.textContent = rub(r.total);
    el.mobileTotal.textContent = rub(r.total);

    var note;
    if (state.adults > 12) {
      note = 'Компании свыше 12 человек принимаются только по согласованию с администратором.';
    } else if (state.adults >= 10) {
      note = 'От 10 гостей аренда офуро обязательна — она уже в расчёте.';
    } else if (r.gift > 0) {
      note = 'Итог предварительный: точную стоимость и свободное время подтверждает администратор.';
    } else {
      note = 'Итог предварительный: точную стоимость и свободное время подтверждает администратор.';
    }
    el.totalNote.textContent = note;
  }

  function renderDateHint(r) {
    var parts = [];
    if (r.ny) {
      parts.push('15 декабря – 13 января: скидки и акции не действуют, 3 500 ₽/час.');
    }
    if (state.holiday) {
      parts.push('Праздничный тариф действует весь день.');
    }
    if (!r.noPromo && r.promo) {
      parts.push('Акция дня: ' + (r.promo.gift === 1 ? '4 ч + 5-й час' : '5 ч + 2 часа') + ' в подарок.');
    }
    if (!parts.length) {
      parts.push('Выберите дату или день недели — тариф подставится автоматически.');
    }
    el.dateHint.innerHTML = parts.join(' ');
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

    el.date.value = isoDate(state.date);
  }

  /* ------------------------------------------------------------------ */
  /* События                                                             */
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

  el.date.min = isoDate(today);
  el.date.addEventListener('change', function () {
    var d = parseISO(el.date.value);
    if (d) setDate(d);
    else { el.date.value = isoDate(state.date); }
    state.birthday = el.birthday.checked;
    render();
  });

  el.weekdays.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-wd]');
    if (!b) return;
    setDate(nextWeekday(Number(b.dataset.wd)));
  });

  el.slots.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-slot]');
    if (!b) return;
    state.slot = b.dataset.slot;
    var max = SLOTS[state.slot].max;
    if (state.hours > max) state.hours = max;
    render();
  });

  el.hours.addEventListener('input', function () {
    state.hours = Number(el.hours.value);
    render();
  });

  document.addEventListener('click', function (e) {
    var step = e.target.closest('[data-step]');
    if (step) {
      var key = step.dataset.step;
      var dir = Number(step.dataset.dir);
      var min = key === 'hours' ? 4 : key === 'adults' ? 1 : 0;
      var max = key === 'hours' ? SLOTS[state.slot].max : key === 'adults' ? 20 : 8;
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
      row.querySelector('output').textContent = String(state.extras[k]);
      render();
    }
  });

  el.birthday.addEventListener('change', function () {
    state.birthday = el.birthday.checked;
    render();
  });

  el.holiday.addEventListener('change', function () {
    state.holiday = el.holiday.checked;
    render();
  });

  document.querySelectorAll('[data-extra]').forEach(function (input) {
    input.addEventListener('change', function () {
      state.extras[input.dataset.extra] = input.checked ? 1 : 0;
      render();
    });
  });

  // Клик по тарифу в таблице цен → подставить в калькулятор
  document.querySelectorAll('.price-cell').forEach(function (cell) {
    cell.addEventListener('click', function () {
      if (cell.dataset.holiday) {
        state.holiday = true;
        el.holiday.checked = true;
        state.date = today;
      } else {
        state.holiday = false;
        el.holiday.checked = false;
        state.date = nextWeekday(Number(cell.dataset.day));
        state.slot = cell.dataset.slot;
        if (state.hours > SLOTS[state.slot].max) state.hours = SLOTS[state.slot].max;
      }
      render();

      document.getElementById('calc').scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.summaryCard.classList.add('is-flash');
      setTimeout(function () { el.summaryCard.classList.remove('is-flash'); }, 1200);
    });
  });

  /* ------------------------------------------------------------------ */
  /* Копирование расчёта                                                 */
  /* ------------------------------------------------------------------ */

  function buildSummaryText() {
    var r = compute();
    var lines = [];
    lines.push('Баня на Турухтанных — предварительный расчёт');
    lines.push(dateFmt.format(state.date).replace('.', '') +
      (state.holiday ? ', праздничный день' : '') + ' · ' + r.timeText);
    lines.push('Тариф: ' + rub(r.rate) + '/час, часов к оплате: ' + r.hours +
      (r.gift ? ', в подарок: +' + r.gift + ' ч (всего ' + r.totalHours + ' ч)' : ''));
    lines.push('Гостей: ' + state.adults + (state.kids ? ' + детей до 8 лет: ' + state.kids : ''));
    if (r.extraPeople > 0) lines.push('Доплата за гостей свыше 10: ' + rub(r.guestsFee));
    if (r.extrasList.length) {
      lines.push('Дополнительно: ' + r.extrasList.map(function (e) {
        return e.name + ' — ' + rub(e.sum);
      }).join('; '));
    }
    if (r.discount > 0) lines.push('Скидка в день рождения −20 %: −' + rub(r.discount));
    lines.push('ИТОГО: ' + rub(r.total));
    lines.push('Предоплата 5 000 ₽ и залог 5 000 ₽ — отдельно. Телефон: +7 (812) 642-69-72');
    return lines.join('\n');
  }

  function showToast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('is-visible');
    clearTimeout(showToast.t);
    showToast.t = setTimeout(function () { el.toast.classList.remove('is-visible'); }, 2600);
  }

  el.copyBtn.addEventListener('click', function () {
    var text = buildSummaryText();
    var ok = function () { showToast('Расчёт скопирован — вставьте его в VK, Telegram или Max'); };
    var fail = function () { showToast('Не удалось скопировать. Позвоните: +7 (812) 642-69-72'); };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(ok).catch(function () {
        legacyCopy(text) ? ok() : fail();
      });
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
  /* Шапка, меню, прокрутка                                              */
  /* ------------------------------------------------------------------ */

  var header = document.getElementById('site-header');
  var burger = document.getElementById('burger');
  var mobileMenu = document.getElementById('mobile-menu');

  // Подсветка активного пункта меню по секции, которая сейчас на экране
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.nav a[href^="#"]'));
  var navTargets = navLinks.map(function (a) {
    return { link: a, section: document.querySelector(a.getAttribute('href')) };
  }).filter(function (t) { return !!t.section; });

  var activeId = null;
  function markActive() {
    var line = window.innerHeight * 0.32;
    var current = null;
    navTargets.forEach(function (t) {
      var r = t.section.getBoundingClientRect();
      if (r.top <= line && r.bottom > line) current = t.section.id;
    });
    if (current === activeId) return;
    activeId = current;
    navTargets.forEach(function (t) {
      t.link.classList.toggle('is-active', t.section.id === current);
    });
  }

  function onScroll() {
    header.classList.toggle('is-scrolled', window.scrollY > 24);
    markActive();
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  onScroll();

  // Клик по пункту меню — сразу подсветить его, не дожидаясь прокрутки
  navLinks.forEach(function (a) {
    a.addEventListener('click', function () {
      navLinks.forEach(function (x) { x.classList.remove('is-active'); });
      a.classList.add('is-active');
    });
  });

  burger.addEventListener('click', function () {
    var open = !mobileMenu.hidden;
    mobileMenu.hidden = open;
    burger.classList.toggle('is-open', !open);
    burger.setAttribute('aria-expanded', String(!open));
  });

  mobileMenu.addEventListener('click', function (e) {
    if (e.target.tagName === 'A') {
      mobileMenu.hidden = true;
      burger.classList.remove('is-open');
      burger.setAttribute('aria-expanded', 'false');
    }
  });

  /* ------------------------------------------------------------------ */
  /* Галерея: фильтр + лайтбокс                                          */
  /* ------------------------------------------------------------------ */

  var grid = document.getElementById('gallery-grid');
  var shots = Array.prototype.slice.call(grid.querySelectorAll('.shot'));
  var filters = document.getElementById('filters');

  filters.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-filter]');
    if (!b) return;
    var f = b.dataset.filter;
    Array.prototype.forEach.call(filters.children, function (x) {
      var on = x === b;
      x.classList.toggle('is-active', on);
      x.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    shots.forEach(function (s) {
      var show = f === 'all' || s.dataset.cat === f;
      s.classList.toggle('is-hidden', !show);
    });
  });

  var lb = {
    root: document.getElementById('lightbox'),
    img: document.getElementById('lb-img'),
    cap: document.getElementById('lb-cap'),
    counter: document.getElementById('lb-counter'),
    list: [],
    index: 0
  };

  function visibleShots() {
    return shots.filter(function (s) { return !s.classList.contains('is-hidden'); });
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
    var img = s.querySelector('img');
    var big = img.src.replace('/thumbs/', '/');
    lb.img.src = big;
    lb.img.alt = img.alt;
    lb.cap.textContent = s.dataset.cap || '';
    lb.counter.textContent = (lb.index + 1) + ' / ' + lb.list.length;
  }

  function closeLightbox() {
    lb.root.hidden = true;
    document.body.classList.remove('is-locked');
    lb.img.src = '';
  }

  function stepSlide(dir) {
    if (!lb.list.length) return;
    lb.index = (lb.index + dir + lb.list.length) % lb.list.length;
    showSlide();
  }

  shots.forEach(function (s) {
    s.querySelector('.shot__btn').addEventListener('click', function () { openLightbox(s); });
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

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add('is-in');
          io.unobserve(en.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

    document.querySelectorAll('.reveal').forEach(function (n) { io.observe(n); });
  } else {
    document.querySelectorAll('.reveal').forEach(function (n) { n.classList.add('is-in'); });
  }

  /* ------------------------------------------------------------------ */
  /* Старт                                                               */
  /* ------------------------------------------------------------------ */

  el.year.textContent = String(new Date().getFullYear());
  el.date.value = isoDate(state.date);
  render();
})();
