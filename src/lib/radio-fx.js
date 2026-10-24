/*!
 * RadioFX: звук старого лампового радио для карточки на сайте. Без зависимостей, Web Audio API.
 *
 * Идея: звук собирается из положения стрелки на шкале.
 *   - Между станциями идёт шум, треск и «рябь»; пока стрелка движется, он громче.
 *   - У каждой несущей слышен свист: он ныряет от высоких тонов к низкому рыку и пропадает в точке настройки.
 *   - На станции помехи схлопываются и звучит её музыка. Когда стрелка только проезжает мимо, слышен обрывок.
 *   - Кнопки, клавиши и ручка настройки щёлкают по-разному (WAV-образцы в clicks/).
 *   - Режим «Помехи»: сплошной шум, жужжание, цифровые чирики, станция прорывается обрывками.
 *
 * Минимум для карточки:
 *
 *   var radio = new RadioFX({
 *     baseUrl: '/audio/radio/',
 *     stations: [
 *       { mhz: 92.3,  src: '/audio/radio/stations/act1.mp3' },
 *       { mhz: 96.6,  src: '/audio/radio/stations/act2.mp3' },
 *       { mhz: 101.4, src: '/audio/radio/stations/act3.mp3' }
 *     ],
 *     onSignal: function (s, i) { ... }     // s: 0..1 уровень сигнала, i: номер станции или -1
 *   });
 *   openBtn.onclick = function () { radio.open(); };                 // только из клика
 *   presetBtn.onclick = function () { radio.pressPreset(1, { onFrame: moveNeedle }); };
 *
 * Все методы, которые двигают звук во времени, принимают необязательное время `at`
 * (секунды AudioContext). Это нужно для офлайн-рендера; в обычной работе его не передают.
 */
(function (root) {
  'use strict';

  /* ------------------------------------------------------------------ утилиты */
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function smooth(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function ease(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
  function defaultDuration(dist) { return clamp(0.75 + 0.42 * Math.abs(dist), 1.2, 3.2); }   // секунды

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function fetchBuffer(url) {
    if (url.indexOf('data:') === 0) {
      var bin = atob(url.slice(url.indexOf(',') + 1));
      var u8 = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      return Promise.resolve(u8.buffer);
    }
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' для ' + url);
      return r.arrayBuffer();
    });
  }

  function decode(ctx, ab) {
    return new Promise(function (resolve, reject) {
      var p = ctx.decodeAudioData(ab, resolve, reject);     // старый Safari: колбэки; остальные: промис
      if (p && p.then) p.then(resolve, reject);
    });
  }

  function readMuted(key) { try { return root.localStorage.getItem(key) === '1'; } catch (e) { return false; } }
  function writeMuted(key, m) { try { root.localStorage.setItem(key, m ? '1' : '0'); } catch (e) { /* приватный режим */ } }
  function set(param, v, t, tc) { if (isFinite(v)) param.setTargetAtTime(v, t, tc); }

  var SAMPLES = {
    preset_down: ['preset_down_1', 'preset_down_2'],
    preset_up: ['preset_up_1'],
    key_down: ['key_down_1', 'key_down_2', 'key_down_3'],
    key_up: ['key_up_1'],
    seek_down: ['seek_down_1'],
    seek_up: ['seek_up_1'],
    knob_tick: ['knob_tick_1', 'knob_tick_2', 'knob_tick_3']
  };

  // Базовые уровни слоёв (1.0 = полная шкала до общего регулятора громкости)
  var LEVEL = { hiss: 0.075, robot: 0.30, crackle: 0.25, cord: 0.03, whistle: 0.14, buzz: 0.08, chirp: 0.08, hum: 0.04 };

  /* ------------------------------------------------------------------ закон управления
   * f: частота под стрелкой (МГц), act: активность стрелки 0..1 (сглаженная скорость).
   * Чистая функция: её можно проверять без звука.
   */
  function controls(f, act, cfg) {
    var st = cfg.stations, per = [], sMax = 0, nearest = -1, i;
    for (i = 0; i < st.length; i++) {
      var d = (f - st[i].mhz) / cfg.lockWidth;
      var s = Math.exp(-d * d);
      per.push(s);
      if (s > sMax) { sMax = s; nearest = i; }
    }
    var capture = smooth(0.12, 0.75, sMax);          // 0: чистый шум, 1: станция поймана
    var stat = 1 - capture;

    var whistles = [];
    for (i = 0; i < cfg.carriers.length; i++) {
      var c = cfg.carriers[i], dd = Math.abs(f - c.mhz);
      var zone = smooth(1.1, 0.4, dd);               // слышно в пределах ±1,1 МГц, ближе громче
      var dive = smooth(0.012, 0.06, dd);            // в точке нулевых биений свист исчезает
      whistles.push({ freq: Math.min(4800, dd * 4200 + 55), gain: c.amp * zone * dive * act });
    }
    var pos = clamp((f - cfg.range[0]) / (cfg.range[1] - cfg.range[0]), 0, 1);
    var gate = smooth(0.03, 0.2, act);               // шум включается ступенькой, а не раздувается плавной волной
    return {
      signal: capture,
      nearest: nearest,
      per: per,
      hiss: stat * (cfg.idleStatic + (1 - cfg.idleStatic) * gate) + 0.03 * capture,
      robot: stat * gate,
      robotF: 220 * Math.pow(740 / 220, pos),        // тон «робота» едет вслед за стрелкой, Гц
      crackle: stat * (0.25 + 0.75 * gate),
      cord: Math.pow(act, 0.8),
      whistles: whistles,
      stGain: per.map(function (s) { return smooth(0.05, 0.65, s); }),
      stCut: per.map(function (s) { return 650 + 4300 * smooth(0.08, 0.95, s); })
    };
  }

  /* ------------------------------------------------------------------ класс */
  function RadioFX(opts) {
    opts = opts || {};
    var stations = (opts.stations || [{ mhz: 92.3 }, { mhz: 96.6 }, { mhz: 101.4 }]).map(function (s) {
      return typeof s === 'number' ? { mhz: s } : s;
    });
    var ghosts = opts.ghosts || [89.6, 94.5, 99.0, 104.2, 106.8];       // слабые несущие: только свист
    this.cfg = {
      stations: stations,
      carriers: stations.map(function (s) { return { mhz: s.mhz, amp: 1 }; })
        .concat(ghosts.map(function (g) { return { mhz: g, amp: 0.5 }; })),
      range: opts.range || [88, 108],
      lockWidth: opts.lockWidth || 0.16,                                 // МГц: ширина захвата станции
      idleStatic: opts.idleStatic != null ? clamp(opts.idleStatic, 0, 1) : 0.5,   // шум, когда стрелка стоит между станциями
      tickStep: opts.tickStep || 0.2                                     // МГц между щелчками ручки
    };
    this.baseUrl = opts.baseUrl || '';
    this.sources = opts.sources || {};                                   // имя -> url, если файлы лежат не по умолчанию
    this.volume = opts.volume != null ? clamp(opts.volume, 0, 1) : 0.4;
    this.stationVolume = opts.stationVolume != null ? opts.stationVolume : 0.65;
    this.storageKey = opts.storageKey || 'radioFxMuted';
    this.muted = readMuted(this.storageKey);
    this.onSignal = opts.onSignal || null;

    this.ctx = opts.context || null;
    this.offline = !!(opts.context && root.OfflineAudioContext && opts.context instanceof root.OfflineAudioContext);

    this._rand = mulberry32(opts.seed != null ? opts.seed : 1953);
    this._f = stations[0].mhz;
    this._tickF = this._f;
    this._act = 0;
    this._actT = 0;
    this._lastMoveT = -10;
    this._applyT = 0;
    this._intTarget = 0;
    this._intLevel = 0;
    this._nextEvT = 0;
    this._buzzOn = false;
    this._nextChatT = 0;
    this._robotF = 300;
    this._signal = 0;
    this._built = false;
    this._running = false;
    this._wantOpen = false;
    this._samples = null;
    this._lastPick = {};
    this._stBufs = [];
    this._stLoading = null;
    this._srcs = [];
    this._anim = null;
    this._timer = null;
    this._fadeTimer = null;
    this.stationsReady = Promise.resolve();

    var self = this;
    if (!this.offline && root.document && root.document.addEventListener) {
      root.document.addEventListener('visibilitychange', function () {
        if (!self.ctx || !self._running) return;
        if (root.document.hidden) self.ctx.suspend();
        else if (self._wantOpen) self.ctx.resume();
      });
    }
  }

  RadioFX.controls = controls;
  RadioFX.ease = ease;
  RadioFX.defaultDuration = defaultDuration;
  RadioFX.version = '1.0';

  RadioFX.prototype._now = function (at) {
    return at != null ? at : (this.ctx ? this.ctx.currentTime : 0);
  };

  /* ------------------------------------------------------------------ граф */
  RadioFX.prototype._build = function () {
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!this.ctx) {
      if (!AC) throw new Error('Web Audio API не поддерживается');
      this.ctx = new AC();
    }
    var ctx = this.ctx, sr = ctx.sampleRate, i, rnd = this._rand;
    function gain(v) { var g = ctx.createGain(); g.gain.value = v; return g; }
    function filt(type, f, q) {
      var b = ctx.createBiquadFilter();
      b.type = type; b.frequency.value = f;
      if (q != null) b.Q.value = q;
      return b;
    }

    // выход: общий регулятор и мягкий ограничитель пиков (не компрессор: у него в браузерах есть автоусиление)
    this.master = gain(0);
    var pre = gain(0.5), lim = ctx.createWaveShaper(), lc = new Float32Array(4097);
    for (i = 0; i < 4097; i++) {
      var av = (i / 2048 - 1) * 2, m = Math.abs(av);
      lc[i] = (av < 0 ? -1 : 1) * (m < 0.6 ? m : 0.6 + 0.35 * Math.tanh((m - 0.6) / 0.35));
    }
    lim.curve = lc;
    lim.oversample = 'none';                // выход строго не выше 0,95
    this.master.connect(pre); pre.connect(lim); lim.connect(ctx.destination);
    this.clickBus = gain(0.8);
    this.clickBus.connect(this.master);

    // шум (почти гауссов) и треск (редкие импульсы)
    var nLen = Math.floor(sr * 4);
    this._noiseBuf = ctx.createBuffer(1, nLen, sr);
    var nd = this._noiseBuf.getChannelData(0);
    for (i = 0; i < nLen; i++) nd[i] = (rnd() + rnd() + rnd() + rnd() - 2) * 1.7;
    // «цифровой» шум: то же самое, но с пониженной частотой дискретизации (~9 кГц) и грубым квантованием.
    // Даёт зернистую, песочную фактуру вместо мягкого шипения прибоя.
    var hold = 0, D = Math.max(2, Math.round(sr / 9000));
    this._robotBuf = ctx.createBuffer(1, nLen, sr);
    var rd = this._robotBuf.getChannelData(0);
    for (i = 0; i < nLen; i++) {
      if (i % D === 0) hold = clamp(Math.round(nd[i] / 0.45) * 0.45, -1.8, 1.8);
      rd[i] = hold;
    }
    var cLen = Math.floor(sr * 6);
    this._crackBuf = ctx.createBuffer(1, cLen, sr);
    var cd = this._crackBuf.getChannelData(0), pop = 22 / sr;
    for (i = 0; i < cLen - 1; i++) {
      if (rnd() < pop) {
        var a = Math.min(2.0, -Math.log(1 - rnd())) * (rnd() < 0.5 ? -1 : 1);
        cd[i] = a; cd[i + 1] = -a * 0.5;
      }
    }

    // шум эфира с медленными «замираниями»
    this._hissIn = filt('highpass', 350, 0.7);
    var hissLP = filt('lowpass', 6800, 0.7);
    this.hissGain = gain(0);
    this.hissGate = gain(1);        // ступенчатый «стрёкот» уровня шума (см. _chatter)
    this.hissDip = gain(1);         // короткие «окна» в шуме во время помех
    this._hissIn.connect(hissLP); hissLP.connect(this.hissGain); this.hissGain.connect(this.hissGate);
    this.hissGate.connect(this.hissDip); this.hissDip.connect(this.master);

    // «рябь»: полосовой шум, центр которого едет вслед за стрелкой по спектру
    this._robotIn = gain(1);
    this.robotGain = gain(0);
    this._robotBP = [1, 2.01, 3.02].map(function (ratio, k) {
      var bp = filt('bandpass', 300 * ratio, 18), g = gain([1, 0.6, 0.4][k]);
      this._robotIn.connect(bp); bp.connect(g); g.connect(this.robotGain);
      return bp;
    }, this);
    this.robotGain.connect(this.master);

    // треск
    this.crackleHP = filt('highpass', 1500, 0.7);
    this.crackleGain = gain(0);
    this.crackleBurst = gain(1);
    this.crackleHP.connect(this.crackleGain); this.crackleGain.connect(this.crackleBurst); this.crackleBurst.connect(this.master);

    // трение шнура шкалы
    this.cordBP = filt('bandpass', 950, 1.4);
    this.cordGain = gain(0);
    this.cordBP.connect(this.cordGain); this.cordGain.connect(this.master);

    // свисты биений: по одному генератору на несущую
    var wBus = gain(1), wLP = filt('lowpass', 5200, 0.7);
    wBus.connect(wLP); wLP.connect(this.master);
    this.wGain = this.cfg.carriers.map(function () { var g = gain(0); g.connect(wBus); return g; });

    // помехи
    this.buzzBP = filt('bandpass', 450, 0.6);
    this.buzzGain = gain(0);
    this.buzzBP.connect(this.buzzGain); this.buzzGain.connect(this.master);
    this.humLP = filt('lowpass', 300, 0.7);
    this.humGain = gain(0);
    this.humLP.connect(this.humGain); this.humGain.connect(this.master);
    this.chirpBP = filt('bandpass', 1800, 0.8);
    this.chirpGain = gain(0);
    this.chirpBP.connect(this.chirpGain); this.chirpGain.connect(this.master);

    // станции: общий фильтр «радио» плюс мягкая ламповая перегрузка
    var curve = new Float32Array(1024);
    for (i = 0; i < 1024; i++) curve[i] = Math.tanh(1.8 * (i / 511.5 - 1)) / 1.8;    // единичное усиление на малых уровнях
    this.stBus = gain(this.stationVolume);
    this.stDuck = gain(1);          // приглушение во время помех
    this.stPeek = gain(1);          // станция на миг пробивается сквозь помехи
    this.stBus.connect(this.stDuck); this.stDuck.connect(this.stPeek); this.stPeek.connect(this.master);
    this._wowDepth = gain(7);       // «плавание» ленты, центы
    this._stChain = this.cfg.stations.map(function () {
      var hp = filt('highpass', 240, 0.7), lp = filt('lowpass', 650, 0.7), sh = ctx.createWaveShaper(), g = gain(0);
      sh.curve = curve;
      hp.connect(lp); lp.connect(sh); sh.connect(g); g.connect(this.stBus);
      return { hp: hp, lp: lp, gain: g };
    }, this);
  };

  RadioFX.prototype._startSources = function (t) {
    var ctx = this.ctx, self = this, srcs = this._srcs = [];
    function loop(buf, dest, offset) {
      var s = ctx.createBufferSource();
      s.buffer = buf; s.loop = true; s.connect(dest); s.start(t, offset || 0);
      srcs.push(s);
    }
    function osc(type, f, dest) {
      var o = ctx.createOscillator();
      o.type = type; o.frequency.value = f; o.connect(dest); o.start(t);
      srcs.push(o);
      return o;
    }
    var dur = this._noiseBuf.duration;
    loop(this._robotBuf, this._hissIn, this._rand() * dur);
    loop(this._robotBuf, this._robotIn, this._rand() * dur);
    loop(this._noiseBuf, this.cordBP, this._rand() * dur);
    loop(this._crackBuf, this.crackleHP, 0);
    osc('sine', 0.63, this._wowDepth);
    this._whistleOsc = this.cfg.carriers.map(function (c, i) { return osc('sine', 1000, self.wGain[i]); });
    this._chirpOsc = osc('square', 1500, this.chirpBP);
    osc('sawtooth', 100, this.buzzBP);
    osc('sawtooth', 50, this.humLP);
    for (var i = 0; i < this.cfg.stations.length; i++) this._startStation(i, t);
  };

  RadioFX.prototype._startStation = function (i, t) {
    var b = this._stBufs[i];
    if (!b || !this._running) return;
    var s = this.ctx.createBufferSource();
    s.buffer = b; s.loop = true;
    s.connect(this._stChain[i].hp);
    this._wowDepth.connect(s.detune);
    s.start(t != null ? t : this.ctx.currentTime);
    this._srcs.push(s);
  };

  /* ------------------------------------------------------------------ загрузка */
  RadioFX.prototype._loadClicks = function () {
    if (this._samples) return Promise.resolve();
    var self = this, names = [];
    Object.keys(SAMPLES).forEach(function (g) { SAMPLES[g].forEach(function (n) { names.push(n); }); });
    return Promise.all(names.map(function (n) {
      var url = self.sources[n] || (self.baseUrl + 'clicks/' + n + '.wav');
      return fetchBuffer(url).then(function (ab) { return decode(self.ctx, ab); }).then(function (b) { return [n, b]; })
        .catch(function (e) { console.warn('RadioFX: щелчок ' + n + ' не загрузился:', e.message || e); return null; });
    })).then(function (pairs) {
      var o = {};
      pairs.forEach(function (p) { if (p) o[p[0]] = p[1]; });
      self._samples = o;
    });
  };

  RadioFX.prototype._loadStations = function () {
    var self = this;
    if (this._stLoading) return this._stLoading;
    this._stLoading = Promise.all(this.cfg.stations.map(function (s, i) {
      if (!s.src) return null;
      return fetchBuffer(s.src).then(function (ab) { return decode(self.ctx, ab); }).then(function (b) {
        self._stBufs[i] = b;
        self._startStation(i);
      }).catch(function (e) { console.warn('RadioFX: станция ' + s.mhz + ' не загрузилась:', e.message || e); });
    }));
    return this._stLoading;
  };

  /* ------------------------------------------------------------------ жизненный цикл */
  RadioFX.prototype.open = function () {
    var self = this;
    this._wantOpen = true;
    if (this._fadeTimer) { clearTimeout(this._fadeTimer); this._fadeTimer = null; }
    try {
      if (!this._built) { this._build(); this._built = true; }
    } catch (e) {
      console.warn('RadioFX:', e.message);
      return Promise.resolve();
    }
    var resumed = this.offline ? Promise.resolve() : this.ctx.resume();    // вызывается синхронно, внутри клика
    if (this._running) { this._applyMaster(true); return Promise.resolve(); }
    return Promise.resolve(resumed)
      .then(function () { return self._loadClicks(); })
      .then(function () {
        if (!self._wantOpen || self._running) return;
        var t = self.ctx.currentTime;
        self._running = true;
        self._startSources(t);
        self._act = 0; self._actT = t; self._lastMoveT = t - 10;
        self._apply(t);
        self._applyMaster(true);
        if (!self.offline) self._timer = setInterval(function () { self.tick(); }, 60);
        self.stationsReady = self._loadStations();
      })
      .catch(function (e) { console.warn('RadioFX:', e); });
  };

  RadioFX.prototype.close = function (at) {
    var self = this;
    this._wantOpen = false;
    if (this._anim) this._anim.cancel();
    if (!this._running) return;
    var t = this._now(at);
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(0, t, 0.12);
    if (this.offline) return;
    this._fadeTimer = setTimeout(function () { self._stopRuntime(); }, 900);
  };

  RadioFX.prototype._stopRuntime = function () {
    clearInterval(this._timer);
    this._timer = null;
    this._srcs.forEach(function (s) {
      try { s.stop(); } catch (e) { /* уже остановлен */ }
      try { s.disconnect(); } catch (e) { /* уже отключён */ }
    });
    this._srcs = [];
    this._running = false;
    this._fadeTimer = null;
    this._intTarget = 0; this._intLevel = 0; this._buzzOn = false; this._nextChatT = 0;
    if (this.ctx && this.ctx.suspend) this.ctx.suspend();
  };

  RadioFX.prototype._applyMaster = function (slow) {
    if (!this.ctx || !this.master) return;
    var t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, t, slow ? 0.4 : 0.08);
  };

  RadioFX.prototype.setVolume = function (v) {
    this.volume = clamp(v, 0, 1);
    if (this._running && this._wantOpen) this._applyMaster(false);
  };

  RadioFX.prototype.setMuted = function (m) {
    this.muted = !!m;
    writeMuted(this.storageKey, this.muted);
    if (this._running && this._wantOpen) this._applyMaster(false);
    return this.muted;
  };

  RadioFX.prototype.toggleMuted = function () { return this.setMuted(!this.muted); };
  RadioFX.prototype.isPlaying = function () { return this._running && this._wantOpen; };
  RadioFX.prototype.getDial = function () { return this._f; };

  RadioFX.prototype.getSignal = function (mhz) {
    var c = controls(mhz != null ? mhz : this._f, 0, this.cfg);
    return c.signal;
  };

  /* ------------------------------------------------------------------ стрелка */
  // Поставить стрелку без звука движения (например, при открытии карточки)
  RadioFX.prototype.jump = function (f, at) {
    var t = this._now(at);
    this._f = clamp(f, this.cfg.range[0], this.cfg.range[1]);
    this._tickF = this._f;
    this._act = 0; this._actT = t; this._lastMoveT = t - 10;
    if (this._running) this._apply(t);
  };

  // Сообщить звуку, где сейчас стрелка. Вызывать на каждом кадре движения.
  // mode: 'motor' (по умолчанию: стрелку ведёт кнопка) или 'knob' (вращает ручка: добавляются щелчки)
  RadioFX.prototype.setDial = function (f, at, mode) {
    f = clamp(f, this.cfg.range[0], this.cfg.range[1]);
    var t = this._now(at), dt = t - this._lastMoveT;
    if (dt > 0.003) {
      var target = 0;
      if (dt <= 0.3) target = Math.min(1, Math.pow(Math.abs(f - this._f) / dt / 1.6, 0.6));
      var k = 1 - Math.exp(-dt / (target > this._act ? 0.05 : 0.2));
      this._act += (target - this._act) * k;
      this._actT = t;
      this._lastMoveT = t;
    }
    var prev = this._f;
    this._f = f;
    if (this._running && mode === 'knob') this._ticks(prev, f, t);
    if (this._running) this._apply(t);
  };

  RadioFX.prototype._ticks = function (a, b, t) {
    var step = this.cfg.tickStep, n = 0;
    while (n < 3 && Math.abs(b - this._tickF) >= step) {
      this._tickF += (b > this._tickF ? 1 : -1) * step;
      n++;
      this._playSample('knob_tick', t + n * 0.002, 0.18 + 0.35 * this._act, 0.94 + this._rand() * 0.12);
    }
    if (Math.abs(b - this._tickF) >= step) this._tickF = b;        // был скачок: не догонять очередью щелчков
  };

  // Остановить автоматическое движение стрелки (например, когда пользователь взялся за ручку)
  RadioFX.prototype.cancelTune = function () {
    if (this._anim) this._anim.cancel();
    this._anim = null;
  };

  // Плавно перевести стрелку на частоту. duration в миллисекундах.
  // Возвращает объект { cancel(), promise }.
  RadioFX.prototype.tuneTo = function (target, opts) {
    opts = opts || {};
    var self = this;
    if (this._anim) this._anim.cancel();
    target = clamp(target, this.cfg.range[0], this.cfg.range[1]);
    var from = this._f, dist = target - from;
    var dur = opts.duration != null ? opts.duration : defaultDuration(dist) * 1000;
    var raf = root.requestAnimationFrame ? root.requestAnimationFrame.bind(root)
      : function (fn) { return setTimeout(function () { fn(Date.now()); }, 16); };
    var anim = { cancelled: false, cancel: function () { this.cancelled = true; } };
    anim.promise = new Promise(function (res) { anim._done = res; });
    var t0 = null;
    function step(now) {
      if (anim.cancelled) { anim._done(false); return; }
      if (t0 == null) t0 = now;
      var p = dur > 0 ? clamp((now - t0) / dur, 0, 1) : 1;
      var f = from + dist * ease(p);
      self.setDial(f, undefined, opts.mode || 'motor');
      if (opts.onFrame) opts.onFrame(f, p);
      if (p < 1) raf(step);
      else {
        if (self._anim === anim) self._anim = null;
        anim._done(true);
        if (opts.onDone) opts.onDone(f);
      }
    }
    this._anim = anim;
    raf(step);
    return anim;
  };

  /* ------------------------------------------------------------------ кнопки */
  RadioFX.prototype._playSample = function (group, t, gain, rate) {
    var names = SAMPLES[group], bufs = this._samples;
    if (!bufs || !names || !this._running) return;
    var avail = names.filter(function (n) { return bufs[n]; });
    if (!avail.length) return;
    var pick = avail[Math.floor(this._rand() * avail.length)];
    if (avail.length > 1 && pick === this._lastPick[group]) pick = avail[(avail.indexOf(pick) + 1) % avail.length];
    this._lastPick[group] = pick;
    var ctx = this.ctx, s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = bufs[pick];
    s.playbackRate.value = rate || 1;
    g.gain.value = gain;
    s.connect(g); g.connect(this.clickBus);
    s.onended = function () { try { s.disconnect(); g.disconnect(); } catch (e) { /* ок */ } };
    s.start(Math.max(t, ctx.currentTime));
  };

  // kind: 'preset' (красные I/II/III), 'key' (клавиши 1-6), 'seek' (◄◄ ►►)
  RadioFX.prototype.click = function (kind, at) {
    this._playSample(kind + '_down', this._now(at), 0.95, 0.97 + this._rand() * 0.06);
  };
  RadioFX.prototype.release = function (kind, at) {
    this._playSample(kind + '_up', this._now(at), 0.9, 0.97 + this._rand() * 0.06);
  };

  // Нажали станцию I/II/III (index 0..2): щелчок и переезд стрелки
  RadioFX.prototype.pressPreset = function (index, opts) {
    var st = this.cfg.stations[index], self = this;
    if (!st) return null;
    this.click('preset');
    setTimeout(function () { self.release('preset'); }, 110);
    return this.tuneTo(st.mhz, opts);
  };

  // Нажали клавишу 1-6
  RadioFX.prototype.pressKey = function () {
    var self = this;
    this.click('key');
    setTimeout(function () { self.release('key'); }, 90);
  };

  // Нажали ◄◄ (dir -1) или ►► (dir +1): стрелка уезжает к ближайшей станции в эту сторону
  RadioFX.prototype.seek = function (dir, opts) {
    dir = dir < 0 ? -1 : 1;
    var f = this._f, self = this, next = null;
    var list = this.cfg.stations.map(function (s, i) { return { i: i, m: s.mhz }; })
      .sort(function (a, b) { return a.m - b.m; });
    for (var k = 0; k < list.length; k++) {
      if (dir > 0 ? list[k].m > f + 0.25 : list[k].m < f - 0.25) { next = list[k]; if (dir > 0) break; }
    }
    if (!next) next = dir > 0 ? list[0] : list[list.length - 1];           // дошли до края шкалы: по кругу
    this.click('seek');
    setTimeout(function () { self.release('seek'); }, 120);
    var anim = this.tuneTo(next.m, opts);
    anim.index = next.i;
    anim.mhz = next.m;
    return anim;
  };

  /* ------------------------------------------------------------------ помехи */
  // level 0..1: 0 помехи выключены, 1 полная буря
  RadioFX.prototype.setInterference = function (level, at) {
    this._intTarget = clamp(level, 0, 1);
    if (this._running) this._apply(this._now(at));
  };

  RadioFX.prototype.interferenceBurst = function (ms) {
    var self = this;
    this.setInterference(1);
    setTimeout(function () { self.setInterference(0); }, ms != null ? ms : 3500);
  };

  RadioFX.prototype._interfere = function (t) {
    var L = this._intTarget, d;
    if (L < 0.05) {
      if (this._buzzOn) {
        set(this.buzzGain.gain, 0, t, 0.1);
        set(this.humGain.gain, 0, t, 0.1);
        this._buzzOn = false;
      }
      return;
    }
    if (!this._buzzOn) {
      this._buzzOn = true;
      set(this.buzzGain.gain, LEVEL.buzz * L * 0.35, t, 0.1);
    }
    set(this.humGain.gain, LEVEL.hum * L, t, 0.1);
    if (t < this._nextEvT) return;
    var r = this._rand();
    if (r < 0.34) {                       // цифровой чирик
      d = 0.04 + this._rand() * 0.2;
      var f1 = 350 + this._rand() * 2900, f2 = f1 * (0.6 + this._rand() * 1.2);
      var fr = this._chirpOsc.frequency, g = this.chirpGain.gain, pk = LEVEL.chirp * L;
      fr.setValueAtTime(f1, t); fr.setValueAtTime(f2, t + d * 0.5);
      g.setValueAtTime(0, t); g.linearRampToValueAtTime(pk, t + 0.004);
      g.setValueAtTime(pk, t + d); g.linearRampToValueAtTime(0, t + d + 0.012);
    } else if (r < 0.58) {                // окно в шуме: станция на миг пробивается
      d = 0.08 + this._rand() * 0.22;
      var pg = this.stPeek.gain, hd = this.hissDip.gain;
      pg.setValueAtTime(1, t); pg.linearRampToValueAtTime(2.6, t + 0.008);
      pg.setValueAtTime(2.6, t + d); pg.linearRampToValueAtTime(1, t + d + 0.03);
      hd.setValueAtTime(1, t); hd.linearRampToValueAtTime(0.2, t + 0.008);
      hd.setValueAtTime(0.2, t + d); hd.linearRampToValueAtTime(1, t + d + 0.03);
    } else if (r < 0.82) {                // всплеск треска
      d = 0.1 + this._rand() * 0.25;
      var bg = this.crackleBurst.gain;
      bg.setValueAtTime(1, t); bg.linearRampToValueAtTime(1.7, t + 0.01);
      bg.setValueAtTime(1.7, t + d); bg.linearRampToValueAtTime(1, t + d + 0.05);
    } else {                              // всплеск жужжания
      d = 0.15 + this._rand() * 0.35;
      var zg = this.buzzGain.gain;
      zg.setTargetAtTime(LEVEL.buzz * L * (0.7 + this._rand() * 0.6), t, 0.03);
      zg.setTargetAtTime(LEVEL.buzz * L * 0.35, t + d, 0.08);
    }
    this._nextEvT = t + d + 0.04 + this._rand() * 0.22;
  };

  // «Стрёкот»: уровень шума меняется ступеньками по 35-95 мс, как на цифровой линии. Это вместо плавных замираний,
  // которые на слух давали эффект морского прибоя. При помехах ступеньки глубже и дёргают высоту тона «робота».
  // Шаги планируются на 0,14 с вперёд, поэтому темп не зависит от частоты вызовов tick().
  RadioFX.prototype._chatter = function (t) {
    var L = this._intLevel, g = this.hissGate.gain;
    if (this._nextChatT < t) this._nextChatT = t;
    while (this._nextChatT < t + 0.14) {
      var s = this._nextChatT, d = 0.035 + this._rand() * 0.06;
      var lo = Math.max(0.15, 0.7 - 0.3 * this._act - 0.35 * L);
      g.setTargetAtTime(lo + (1 - lo) * this._rand(), s, 0.002);
      if (L > 0.05) {
        var jit = 0.65 + 0.9 * this._rand();
        for (var i = 0; i < this._robotBP.length; i++) {
          this._robotBP[i].frequency.setTargetAtTime(this._robotF * [1, 2.01, 3.02][i] * jit, s, 0.003);
        }
      }
      this._nextChatT = s + d;
    }
  };

  /* ------------------------------------------------------------------ применить состояние к звуку */
  RadioFX.prototype.tick = function (at) {
    if (!this._running) return;
    var t = this._now(at);
    if (t - this._lastMoveT > 0.09) {                // стрелка стоит: активность затухает
      this._act *= Math.exp(-(t - this._actT) / 0.2);
      this._actT = t;
    }
    this._chatter(t);
    this._interfere(t);
    this._apply(t);
  };

  RadioFX.prototype._apply = function (t) {
    var dtA = Math.max(0, t - this._applyT);
    this._applyT = t;
    this._intLevel += (this._intTarget - this._intLevel) * (1 - Math.exp(-dtA / (this._intTarget > this._intLevel ? 0.15 : 0.35)));
    var L = this._intLevel, c = controls(this._f, this._act, this.cfg), i;

    set(this.hissGain.gain, Math.max(c.hiss, 1.35 * L) * LEVEL.hiss, t, 0.03);
    set(this.robotGain.gain, Math.max(c.robot, 0.9 * L) * LEVEL.robot, t, 0.04);
    this._robotF = c.robotF;
    if (L <= 0.05) {                                  // при помехах высотой тона управляет _chatter
      for (i = 0; i < this._robotBP.length; i++) set(this._robotBP[i].frequency, c.robotF * [1, 2.01, 3.02][i], t, 0.04);
    }
    set(this.crackleGain.gain, Math.max(c.crackle, 0.8 * L) * LEVEL.crackle, t, 0.03);
    set(this.cordGain.gain, c.cord * LEVEL.cord, t, 0.03);
    for (i = 0; i < c.whistles.length; i++) {
      set(this._whistleOsc[i].frequency, c.whistles[i].freq, t, 0.012);
      set(this.wGain[i].gain, c.whistles[i].gain * LEVEL.whistle * (1 - 0.6 * L), t, 0.02);
    }
    set(this.stDuck.gain, 1 - 0.82 * L, t, 0.05);
    for (i = 0; i < this._stChain.length; i++) {
      set(this._stChain[i].gain.gain, c.stGain[i], t, 0.05);
      set(this._stChain[i].lp.frequency, c.stCut[i], t, 0.05);
    }

    if (Math.abs(c.signal - this._signal) > 0.02) {
      this._signal = c.signal;
      if (this.onSignal) this.onSignal(c.signal, c.signal > 0.5 ? c.nearest : -1);
    }
  };

  root.RadioFX = RadioFX;
})(typeof window !== 'undefined' ? window : globalThis);

// Подключение как ES-модуль (остальной файл — готовый RadioFX без изменений): класс попадает и в window.RadioFX, и в экспорт.
export default (typeof window !== 'undefined' ? window : globalThis).RadioFX;
