'use strict';
// Kartdata för Göteborg, avritad från OpenStreetMap (ca 13 m per kartpixel).
// Alla koordinater är kartpixlar. Spelet räknar om till världen med
//   x = (px - OX) * S,  z = (py - OY) * S
// så att Kungsportsplatsen hamnar i origo. Norr är uppåt (minus z).
window.GBG = (function () {
  const PX0 = 310, PY0 = 235, PX1 = 795, PY1 = 598, OX = 642, OY = 401, S = 1.5;

  // ---------- Vatten ----------
  // Göta älv: södra stranden öster→väster, norra stranden väster→öster.
  const southBank = [[800, 238], [760, 250], [700, 272], [660, 290], [640, 306], [628, 322], [612, 340], [602, 360], [596, 378],
    [590, 392], [575, 408], [556, 418], [520, 428], [480, 436], [450, 446], [420, 462], [395, 478], [370, 494], [345, 508], [300, 530]];
  const northBank = [[300, 462], [330, 452], [355, 440], [385, 425], [410, 415], [440, 404], [470, 398], [500, 393], [520, 388],
    [545, 378], [558, 360], [565, 330], [575, 305], [600, 292], [625, 282], [655, 268], [700, 252], [760, 232], [800, 222]];
  const river = southBank.concat([[290, 600], [290, 455]], northBank, [[810, 215], [810, 238]]);
  const moat = [[574, 412], [592, 422], [608, 424], [620, 421], [630, 415], [640, 408], [648, 401], [653, 392], [656, 382], [659, 372]];
  const fattighus = [[659, 372], [690, 371], [720, 371], [748, 373]];
  const hamnkanal = [[593, 386], [615, 383], [635, 380], [655, 378]];
  const water = [
    { poly: river },
    { poly: [[436, 404], [438, 372], [452, 372], [452, 402]] },   // Sannegårdshamnen
    { poly: [[506, 394], [506, 366], [518, 366], [518, 391]] },   // Lindholmshamnen
    { line: moat, w: 4.5 }, { line: fattighus, w: 3.5 }, { line: hamnkanal, w: 3 },
    { ell: [530, 561, 8, 5, 0.2] },                               // Stora dammen i Slottsskogen
    { ell: [686, 484, 3, 2, 0] }                                  // Näckrosdammen
  ];

  // ---------- Parker, torg, banområden ----------
  const parks = [
    { poly: [[492, 488], [530, 485], [560, 495], [568, 520], [566, 560], [560, 598], [510, 598], [490, 575], [484, 530]] }, // Slottsskogen
    { poly: [[598, 428], [612, 428], [624, 425], [634, 419], [644, 411], [651, 403], [656, 393], [659, 383], [662, 378], [665, 380], [663, 392], [657, 404], [647, 416], [634, 425], [620, 430], [604, 431]] }, // Kungsparken
    { poly: [[671, 376], [684, 376], [684, 396], [672, 398]] },   // Trädgårdsföreningen
    { poly: [[462, 268], [500, 262], [514, 290], [502, 318], [470, 320], [458, 300]] }, // Keillers park och Ramberget
    { circle: [582, 467, 6] },                                     // Skansen Kronan
    { circle: [478, 507, 8] },                                     // Godhemsberget
    { poly: [[600, 447], [612, 447], [614, 468], [600, 468]] },   // Hagaparken
    { poly: [[612, 512], [648, 505], [660, 540], [642, 572], [612, 562]] }, // Guldheden
    { poly: [[678, 474], [694, 474], [694, 492], [678, 492]] },   // Näckrosparken
    { poly: [[628, 432], [640, 428], [646, 440], [634, 446]] },   // Vasaparken
    { poly: [[372, 336], [396, 336], [396, 352], [372, 352]] },   // Lundby park
    { poly: [[318, 455], [338, 448], [345, 470], [330, 485], [318, 480]] }, // Färjenäsparken
    { poly: [[455, 330], [478, 326], [480, 345], [458, 348]] },   // Sannegårdsparken
    { circle: [370, 535, 9] },                                     // Röda sten/Kvarnberget
    { poly: [[760, 520], [776, 515], [784, 560], [770, 575]] }    // Örgryte
  ];
  const liseberg = [[736, 462], [766, 462], [770, 500], [742, 502]];
  const plazas = [
    { circle: [692, 467, 8.5] },  // Götaplatsen
    { circle: [567, 437, 5] },    // Järntorget
    { circle: [642, 400, 4] },    // Kungsportsplatsen
    { circle: [630, 371, 4] },    // Brunnsparken
    { circle: [652, 366, 4] },    // Drottningtorget
    { circle: [620, 398, 6.5] },  // Domkyrkoplan
    { circle: [629, 336, 5] },    // Lilla Bommen
    { poly: [[680, 398], [698, 398], [698, 432], [680, 434]] }, // Heden
    { poly: liseberg }
  ];
  const haga = [[574, 440], [600, 440], [602, 462], [576, 462]];
  const rail = [[672, 322], [770, 320], [772, 350], [674, 350]];

  // ---------- Gator ----------
  // k: hw = motorled, major = större gata, street = gata, avenue = Avenyn, bridge = bro
  const roads = [
    { n: 'Avenyn', k: 'avenue', w: 8, p: [[646, 408], [691, 465]] },
    { n: 'Kungsportsbron', k: 'avenue', w: 6, p: [[640, 397], [647, 410]] },
    { n: 'E45', k: 'hw', w: 4.5, p: [[300, 548], [335, 535], [362, 514], [395, 494], [430, 472], [470, 452], [510, 442], [550, 432], [566, 428]] },
    { n: 'Älvsborgsbron', k: 'bridge', w: 4, p: [[352, 522], [318, 440]] },
    { n: 'Hisingsbron', k: 'bridge', w: 5, p: [[640, 326], [606, 276]] },
    { n: 'Hisingsbron norr', k: 'major', w: 4, p: [[606, 276], [595, 255], [585, 235]] },
    { n: 'Hisingsbron söder', k: 'major', w: 4, p: [[640, 326], [648, 342], [650, 366]] },
    { n: 'Lundbyleden', k: 'hw', w: 5, p: [[300, 322], [380, 330], [430, 330], [470, 316], [510, 298], [545, 282], [565, 268], [590, 250], [610, 235]] },
    { n: 'Lindholmsallén', k: 'major', w: 3.5, p: [[318, 440], [340, 433], [385, 418], [440, 394], [470, 388], [500, 384], [540, 370], [555, 350], [560, 320], [570, 300], [595, 283], [606, 276]] },
    { n: 'Långgatan', k: 'major', w: 3.5, p: [[566, 437], [525, 452], [485, 463], [445, 478], [410, 500], [380, 522]] },
    { n: 'Linnégatan', k: 'street', w: 3.5, p: [[567, 437], [564, 470], [562, 496]] },
    { n: 'Övre Husargatan', k: 'major', w: 4, p: [[603, 440], [590, 470], [572, 505], [566, 540], [560, 598]] },
    { n: 'Allén', k: 'major', w: 4, p: [[566, 432], [600, 435], [625, 431], [645, 421], [659, 406], [665, 392], [667, 376], [667, 366]] },
    { n: 'Södra vägen', k: 'major', w: 4, p: [[680, 436], [700, 450], [722, 462]] },
    { n: 'Vasagatan', k: 'street', w: 4, p: [[612, 470], [664.5, 431.6], [680, 420]] },
    { n: 'Ullevigatan', k: 'street', w: 3.5, p: [[660, 378], [703, 378], [748, 379]] },
    { n: 'Drottningtorget', k: 'street', w: 3.5, p: [[650, 366], [700, 366], [760, 366]] },
    { n: 'Skånegatan', k: 'major', w: 4, p: [[703, 366], [703, 430], [712, 450], [722, 462]] },
    { n: 'Mölndalsvägen', k: 'major', w: 4.5, p: [[722, 462], [730, 500], [745, 560], [760, 598]] },
    { n: 'Örgrytevägen', k: 'major', w: 4, p: [[722, 462], [760, 456], [795, 452]] },
    { n: 'E6', k: 'hw', w: 6, p: [[780, 235], [768, 300], [764, 360], [768, 420], [778, 470], [790, 530], [795, 598]] },
    { n: 'Gibraltargatan', k: 'street', w: 3.5, p: [[686, 466], [677, 495], [665, 527], [650, 560], [640, 598]] },
    { n: 'Sannegårdsgatan', k: 'street', w: 3, p: [[440, 394], [430, 330]] },
    { n: 'Mariaplan', k: 'street', w: 3, p: [[445, 478], [455, 520], [470, 560]] },
    { n: 'Gullbergsvass', k: 'major', w: 3.5, p: [[648, 342], [660, 330], [700, 300], [750, 280]] },
    { n: 'Skeppsbron', k: 'street', w: 4, p: [[567, 437], [582, 425], [598, 400], [606, 385], [620, 374], [640, 368], [650, 366]] },
    { n: 'Haga Nygata', k: 'cobble', w: 2.6, p: [[567, 449], [603, 449]] },
    { n: 'Mölndalsån', k: 'street', w: 3, p: [[748, 379], [762, 388], [778, 400]] }
  ];

  // Spårvagnslinjer (kör fram och tillbaka på gatorna ovan)
  const trams = [
    { c: '#2d6fb7', p: [[445, 478], [485, 463], [525, 452], [566, 437], [600, 435], [625, 431], [645, 421], [659, 406], [665, 392], [667, 376], [667, 366], [700, 366], [758, 366]] },
    { c: '#2f9e44', p: [[562, 496], [564, 470], [567, 437], [582, 425], [598, 400], [606, 385], [620, 374], [640, 368], [650, 366]] },
    { c: '#c92a2a', p: [[586, 240], [595, 255], [606, 276], [640, 326], [648, 342], [650, 366], [703, 366], [703, 430], [712, 450], [722, 462], [730, 500], [745, 560], [757, 592]] }
  ];

  // ---------- Stadsdelar ----------
  // [namn, px, py, gatornas vinkel (grader), kvartersbredd (px), husstil]
  const seeds = [
    ['ivg', 622, 395, -6, 8, 'old'], ['bommen', 640, 340, -40, 10, 'office'], ['vasa', 618, 445, 52, 9, 'stone'],
    ['lorens', 668, 440, 52, 9, 'stone'], ['johanne', 702, 505, 65, 10, 'stone'], ['chalmers', 662, 528, 20, 12, 'campus'],
    ['guldh', 628, 545, 10, 13, 'tower'], ['haga', 586, 452, 0, 7, 'haga'], ['linne', 548, 478, 85, 8.5, 'stone'],
    ['masth', 505, 452, 15, 9, 'lands'], ['majorna', 455, 488, 30, 9, 'lands'], ['kungsl', 470, 560, 30, 9.5, 'lands'],
    ['rodasten', 395, 525, 35, 11, 'lands'], ['annedal', 600, 485, 70, 9, 'stone'], ['garda', 738, 410, 0, 10, 'office'],
    ['stampen', 700, 345, -10, 10, 'stone'], ['gullbergs', 700, 295, -20, 14, 'industry'], ['olskroken', 782, 320, 0, 10, 'stone'],
    ['lunden', 785, 420, 0, 10, 'villa'], ['krokslatt', 760, 560, 70, 10, 'stone'], ['orgryte', 790, 500, 0, 11, 'villa'],
    ['lindholmen', 490, 365, -20, 12, 'modern'], ['sanneg', 430, 365, -20, 10, 'stone'], ['eriksberg', 380, 410, -25, 11, 'modern'],
    ['lundby', 390, 330, -10, 10, 'lands'], ['volvo', 430, 295, -10, 16, 'industry'], ['ringon', 545, 260, -30, 14, 'industry'],
    ['backa', 620, 250, -30, 13, 'industry'], ['kvilleb', 500, 250, -10, 10, 'stone'], ['bracke', 340, 370, 0, 10, 'lands'],
    ['hisvast', 340, 300, -10, 11, 'villa'], ['dalheimer', 690, 585, 70, 12, 'tower'], ['heden-o', 735, 440, 10, 10, 'stone']
  ];

  const labels = [
    ['Inom Vallgraven', 612, 404, 1.2], ['Nordstan', 635, 355, 1], ['Haga', 590, 446, 1.3], ['Linné', 552, 470, 1.2],
    ['Masthugget', 505, 445, 1.1], ['Majorna', 455, 490, 1.3], ['Kungsladugård', 470, 560, 1.1], ['Vasastan', 620, 450, 1.1],
    ['Lorensberg', 668, 438, 1.1], ['Heden', 689, 415, 1], ['Gårda', 740, 405, 1.2], ['Gullbergsvass', 705, 295, 1.2],
    ['Johanneberg', 705, 512, 1.2], ['Guldheden', 632, 545, 1.2], ['Lindholmen', 480, 358, 1.3], ['Eriksberg', 382, 402, 1.3],
    ['Sannegården', 430, 360, 1.1], ['Lundby', 400, 318, 1.2], ['Göta älv', 470, 418, 1.6], ['Göta älv', 668, 270, 1.4],
    ['Vallgraven', 628, 420, 0.9], ['Slottsskogen', 520, 520, 1.5], ['Keillers park', 485, 290, 1.1], ['Kommendantsängen', 600, 488, 1],
    ['Olskroken', 780, 318, 1], ['Örgryte', 788, 470, 1], ['Krokslätt', 758, 565, 1], ['Chalmers', 662, 530, 1.1]
  ];

  // Ledet går uppför Avenyn från Götaplatsen mot Kungsportsplatsen.
  const line = { from: [682.5, 454.4], to: [654.7, 419] };

  return { PX0, PY0, PX1, PY1, OX, OY, S, southBank, northBank, moat, fattighus, water, parks, liseberg, plazas, haga, rail, roads, trams, seeds, labels, line };
})();
