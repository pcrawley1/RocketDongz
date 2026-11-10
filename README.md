# RocketDongz

A fantasy football dashboard built on the public [Sleeper API](https://docs.sleeper.com). No API key and no build step.

## Run
    ./start.sh          # then open http://localhost:8000

## What's in it
- **Standings**: record, PF/PA, PPG, all-play record, luck, streak, playoff cut line
- **Power rankings**: 50% all-play + 30% PPG + 20% last-3-weeks form, compared with standings
- **Matchups**: any week with starters and their points (live for the current week)
- **Weekly scores**: heatmap of every team's score each week, plus season high and low

Switch the username, season, or league in the header. Your choices are saved in the browser.

## Files
- `js/sleeper.js`: API client (in-memory cache; the 5MB player DB is cached in IndexedDB for 24h)
- `js/stats.js`: pure league math (all-play, luck, power)
- `js/app.js`: UI and rendering

## Deploying
Run `python3 stamp.py` before committing. It version-stamps every JS/CSS reference (so browsers never mix cached old and new files) and regenerates the short-link pages (/spuds, /spuds/rankings, /chugs), which are full copies of the app with their own link-preview cards.
