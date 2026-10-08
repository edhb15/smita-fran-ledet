'use strict';
// Hämtar vädret i Göteborg just nu från Open-Meteo (gratis, ingen nyckel).
// Testa annat väder med t.ex. ?vader=sno, ?vader=regn&natt eller ?vader=aska.
window.Weather = (function () {
  const LAT = 57.7072, LON = 11.9668;
  const KINDS = {
    clear: { n: 'Klart', e: '☀️', night: '🌙', sight: 1, tip: 'Solen skiner! Läraren ser långt, så håll dig gömd bakom husen.' },
    partly: { n: 'Halvklart', e: '⛅', night: '☁️', sight: 1, tip: 'Lite moln. Läraren ser bra idag.' },
    cloudy: { n: 'Mulet', e: '☁️', sight: 0.95, tip: 'Typiskt Göteborgsgrått.' },
    fog: { n: 'Dimma', e: '🌫️', sight: 0.55, tip: 'Dimma! Läraren ser nästan ingenting – perfekt för att smita.' },
    drizzle: { n: 'Duggregn', e: '🌦️', sight: 0.9, tip: 'Duggregn. Läraren har paraply och ser lite sämre.' },
    rain: { n: 'Regn', e: '🌧️', sight: 0.8, tip: 'Regn! Läraren ser sämre. Plaska i vattenpölarna.' },
    heavy: { n: 'Ösregn', e: '🌧️', sight: 0.7, tip: 'Ösregn! Läraren ser dåligt genom regnet.' },
    snow: { n: 'Snö', e: '🌨️', sight: 0.8, tip: 'Snö! Det är halt, så du glider lite när du stannar.' },
    storm: { n: 'Åska', e: '⛈️', sight: 0.7, tip: 'Åskväder! Blixtarna lyser upp staden.' }
  };
  const ALIAS = { klart: 'clear', sol: 'clear', halvklart: 'partly', mulet: 'cloudy', dimma: 'fog', dugg: 'drizzle', duggregn: 'drizzle',
    regn: 'rain', osregn: 'heavy', ösregn: 'heavy', sno: 'snow', snö: 'snow', aska: 'storm', åska: 'storm' };
  function fromCode(c) {
    if (c === 0) return 'clear';
    if (c <= 2) return 'partly';
    if (c === 3) return 'cloudy';
    if (c === 45 || c === 48) return 'fog';
    if (c >= 51 && c <= 57) return 'drizzle';
    if (c === 65 || c === 67 || c === 82) return 'heavy';
    if ((c >= 61 && c <= 67) || (c >= 80 && c <= 82)) return 'rain';
    if ((c >= 71 && c <= 77) || c === 85 || c === 86) return 'snow';
    if (c >= 95) return 'storm';
    return 'cloudy';
  }
  const info = { kind: 'cloudy', temp: null, wind: 4, windDir: 240, day: true, dusk: 0, live: false, loaded: false };
  function guessDay() { const h = new Date().getHours(); return h >= 7 && h < 19; }

  async function load() {
    const q = new URLSearchParams(location.search), ov = q.get('vader') || q.get('weather');
    if (ov) {
      info.kind = KINDS[ov] ? ov : ALIAS[ov] || 'cloudy';
      info.day = !q.has('natt'); info.temp = info.kind === 'snow' ? -2 : 12; info.wind = info.kind === 'storm' ? 14 : 5;
      info.loaded = true; return info;
    }
    try {
      const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 7000);
      const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + LAT + '&longitude=' + LON +
        '&current=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,is_day' +
        '&daily=sunrise,sunset&wind_speed_unit=ms&timezone=Europe%2FStockholm&forecast_days=1';
      const r = await fetch(url, { signal: ctl.signal });
      clearTimeout(tm);
      const j = await r.json(), c = j.current;
      info.kind = fromCode(c.weather_code); info.temp = c.temperature_2m;
      info.wind = c.wind_speed_10m; info.windDir = c.wind_direction_10m; info.day = c.is_day === 1;
      if (j.daily && j.daily.sunrise) {
        // Skymning inom 45 minuter från soluppgång eller solnedgång (tiderna är svensk tid)
        const now = Date.now(), sr = Date.parse(j.daily.sunrise[0]), ss = Date.parse(j.daily.sunset[0]);
        const m = Math.min(Math.abs(now - sr), Math.abs(now - ss)) / 60000;
        if (isFinite(m) && m < 45) info.dusk = 1 - m / 45;
      }
      info.live = true;
    } catch (e) {
      info.kind = 'cloudy'; info.day = guessDay();
    }
    info.loaded = true;
    return info;
  }
  function describe() {
    const k = KINDS[info.kind];
    const e = !info.day && k.night ? k.night : k.e;
    const t = info.temp === null ? '' : ' ' + Math.round(info.temp) + '°';
    return { emoji: e, name: k.n, short: e + t, tip: k.tip, sight: k.sight * (info.day ? 1 : 0.75) };
  }
  return { load, info, describe, KINDS };
})();
