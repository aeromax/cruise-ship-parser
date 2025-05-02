const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const dayjs = require('dayjs');
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');

const app = express();
const PORT = 3000;
const DATA_PATH = path.join(__dirname, 'data', 'schedule.json');
let lastUpdated = dayjs();

async function fetchCruiseDataAndSaveToFile() {
  try {
    const { data: html } = await axios.get(
      'https://cruisedig.com/ports/kings-wharf-bermuda'
    );
    const $ = cheerio.load(html);

    const today = dayjs();
    const schedule = [];

    for (let i = 0; i < 7; i++) {
      const currentDate = today.add(i, 'day');
      const dateStr = currentDate.format('DD MMMM YYYY');
      const displayDate = currentDate.format('M/DD');
      const dayName = currentDate.format('dddd');

      const shipSet = new Set();

      $('.view-port-schedule-arrivals li.list-group-item').each((i, el) => {
        const name = $(el)
          .find('.schedule .schedule__ship .name')
          .text()
          .trim();
        const datetimeText = $(el).find('.schedule__datetime').text().trim();

        if (datetimeText.includes(currentDate.format('DD MMMM'))) {
          shipSet.add(name);
        }
      });

      $('.view-port-schedule-departures li.list-group-item').each((i, el) => {
        const name = $(el)
          .find('.schedule .schedule__ship .name')
          .text()
          .trim();
        const datetimeText = $(el).find('.schedule__datetime').text().trim();

        if (datetimeText.includes(currentDate.format('DD MMMM'))) {
          shipSet.add(name);
        }
      });

      schedule.push({
        day: dayName,
        date: displayDate,
        ships: Array.from(shipSet),
      });
    }

    lastUpdated = dayjs();
    fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
    fs.writeFileSync(DATA_PATH, JSON.stringify(schedule, null, 2));
    console.log('Cruise data fetched and saved as JSON.');
  } catch (error) {
    console.error('Error fetching cruise data:', error);
  }
}

fetchCruiseDataAndSaveToFile();

// function scheduleDailyUpdateAt5AM() {
//   const now = new Date();
//   const next5am = new Date();
//   next5am.setHours(5, 0, 0, 0);
//   if (now >= next5am) {
//     next5am.setDate(next5am.getDate() + 1);
//   }
//   const delay = next5am - now;

//   setTimeout(() => {
//     fetchCruiseDataAndSaveToFile();
//     setInterval(fetchCruiseDataAndSaveToFile, 24 * 60 * 60 * 1000);
//   }, delay);
// }

// scheduleDailyUpdateAt5AM();

app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self'; font-src 'self';"
  );
  next();
});

app.use(
  '/static',
  express.static(path.join(__dirname, 'static'), {
    setHeaders: (res, filePath) => {
      const mimeType = mime.lookup(filePath);
      if (mimeType === 'text/css' || mimeType === 'application/javascript') {
        res.setHeader('X-Content-Type-Options', 'nosniff');
      }
    },
  })
);

app.get('/schedule', (req, res) => {
  try {
    const jsonData = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));

    const friendlyDate = lastUpdated.format('MMMM Dd, YYYY, HH:mm');

    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="X-Content-Type-Options" content="nosniff">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Cruise Schedule</title>
        <link rel="stylesheet" href="/static/style.css">
      </head>
      <body>
        <div id="schedule">
          ${jsonData
            .map(({ day, date, ships }) => {
              const entries = ships.map(
                (name) => `<div class="ship" data-status="active">${name}</div>`
              );
              return `
                <div class="day-entry">
                  <div class="day-header">${day}, ${date}</div>
                  <div class="ship-container">
                    ${
                      entries.length
                        ? entries.join('')
                        : '<div class="ship" data-status="none">No cruise ships in port today.</div>'
                    }
                  </div>
                </div>
              `;
            })
            .join('')}
            <div class="last-updated">Cruise ship schedule up to date as of ${friendlyDate}</div>
        </div>
      </body>
      </html>
    `;

    res.send(html);
  } catch (err) {
    console.error('Error generating HTML from JSON data:', err);
    res.status(500).send('Schedule not available.');
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
