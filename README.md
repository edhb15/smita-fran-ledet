# Smita från ledet

Ett 3D-spel i webbläsaren om en klassutflykt genom Göteborg. Klassen går i ett led uppför Avenyn, och du ska smita när läraren inte tittar.

## Spela

Öppna `index.html` via en webbserver (inte direkt som fil), till exempel:

```
python3 -m http.server
```

och gå till http://localhost:8000.

## Filer

| Fil | Innehåll |
| --- | --- |
| `index.html` | Sidan, menyer och knappar |
| `game.js` | Själva spelet: staden, figurerna, fordonen och spelreglerna |
| `map.js` | Kartdata för Göteborg (älven, kanaler, parker, gator, spårvagnslinjer och stadsdelar), avritad från OpenStreetMap |
| `audio.js` | Allt ljud: effekter, bakgrundsmusik och väderljud, skapat med Web Audio (inga ljudfiler) |
| `weather.js` | Hämtar vädret i Göteborg just nu från [Open-Meteo](https://open-meteo.com) |
| `lib/three.min.js` | three.js r149 |

## Vädret

Spelet visar samma väder som i Göteborg just nu: sol, moln, dimma, regn, snö eller åska, och mörker på kvällen. Om vädret inte går att hämta blir det mulet.

Testa annat väder med en parameter i adressen:

- `?vader=sno`
- `?vader=regn`
- `?vader=dimma`
- `?vader=aska`
- `?vader=klart&natt`

Det går också med en ankarlänk: `#sno`, `#regn-natt`, `#dimma`.

## Styrning

- Dra med fingret på skärmen, eller använd piltangenterna/WASD. Släpper du så stannar du.
- Den gula knappen, eller mellanslag, använder en grej.
- Den blå knappen, eller F, hoppar på eller av spårvagnar, båtar och bilar.
- Tryck på minikartan, eller K, för att se hela staden.
- 🔊-knappen, eller M, stänger av och sätter på ljudet.

Kartdata © OpenStreetMap-bidragsgivare.
