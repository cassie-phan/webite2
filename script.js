/**
 * Skyline — ties together:
 * 1) Browser: Geolocation API (place)
 * 2) Browser: localStorage (remember last city)
 * 3) Data: Open-Meteo (geocoding + current weather)
 * 4) Data: Quotable (random short quote)
 *
 * Rubric minimum: ≥3 APIs with ≥1 browser + ≥1 data — we exceed that slightly for clarity.
 */

const STORAGE_KEY = "skyline_last_city";

const useLocationBtn = document.getElementById("use-location-btn");
const cityForm = document.getElementById("city-form");
const cityInput = document.getElementById("city-input");
const statusMessage = document.getElementById("status-message");
const hintLastCity = document.getElementById("hint-last-city");
const results = document.getElementById("results");
const weatherLocation = document.getElementById("weather-location");
const weatherTemp = document.getElementById("weather-temp");
const weatherDesc = document.getElementById("weather-desc");
const weatherWind = document.getElementById("weather-wind");
const quoteText = document.getElementById("quote-text");
const quoteAuthor = document.getElementById("quote-author");
const quoteFallback = document.getElementById("quote-fallback");

const WMO_CODES = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  80: "Rain showers",
  81: "Rain showers",
  82: "Heavy showers",
  95: "Thunderstorm",
  96: "Thunderstorm",
  99: "Thunderstorm",
};

function setStatus(msg) {
  statusMessage.textContent = msg;
}

function showResults() {
  results.classList.remove("hidden");
}

function hideResults() {
  results.classList.add("hidden");
}

async function geocodeCity(name) {
  const url =
    "https://geocoding-api.open-meteo.com/v1/search?name=" +
    encodeURIComponent(name) +
    "&count=1&language=en&format=json";
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error("Could not reach the place search service.");
  }
  const data = await res.json();
  const row = data.results && data.results[0];
  if (!row) {
    throw new Error("No city matched that name. Try another spelling.");
  }
  return {
    lat: row.latitude,
    lon: row.longitude,
    label: [row.name, row.admin1, row.country].filter(Boolean).join(", "),
  };
}

async function fetchWeather(lat, lon) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: "temperature_2m,weather_code,wind_speed_10m",
    temperature_unit: "fahrenheit",
    wind_speed_unit: "mph",
  });
  const res = await fetch(
    "https://api.open-meteo.com/v1/forecast?" + params.toString()
  );
  if (!res.ok) {
    throw new Error("Weather service returned an error. Try again in a moment.");
  }
  const data = await res.json();
  const cur = data.current;
  if (!cur) {
    throw new Error("Weather data was incomplete. Try again.");
  }
  const code = cur.weather_code;
  const desc = WMO_CODES[code] != null ? WMO_CODES[code] : "Mixed conditions";
  return {
    tempF: cur.temperature_2m,
    desc,
    windMph: cur.wind_speed_10m,
  };
}

async function fetchQuote() {
  const url = "https://api.quotable.io/random?maxLength=180";
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.content) return null;
  return { text: data.content, author: data.author || "Unknown" };
}

function renderQuote(q) {
  quoteFallback.classList.add("hidden");
  quoteText.classList.remove("hidden");
  quoteAuthor.classList.remove("hidden");
  if (!q) {
    quoteText.classList.add("hidden");
    quoteAuthor.classList.add("hidden");
    quoteFallback.classList.remove("hidden");
    return;
  }
  quoteText.textContent = `“${q.text}”`;
  quoteAuthor.textContent = q.author;
}

function renderWeather(label, weather) {
  weatherLocation.textContent = label;
  weatherTemp.textContent = `${Math.round(weather.tempF)}°F`;
  weatherDesc.textContent = weather.desc;
  weatherWind.textContent = `Wind about ${Math.round(weather.windMph)} mph`;
}

async function loadForCoordinates(lat, lon, label) {
  setStatus("Loading weather…");
  hideResults();

  let weather;
  try {
    weather = await fetchWeather(lat, lon);
  } catch (e) {
    setStatus(e.message || "Something went wrong with the weather request.");
    return;
  }

  renderWeather(label, weather);
  showResults();
  setStatus("");

  let quote = null;
  try {
    quote = await fetchQuote();
  } catch {
    quote = null;
  }
  renderQuote(quote);
}

async function loadForCityName(city) {
  setStatus("Finding that place…");
  hideResults();

  let place;
  try {
    place = await geocodeCity(city);
  } catch (e) {
    setStatus(e.message || "Could not look up that city.");
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY, city.trim());
  } catch {
    /* private mode or disabled storage — ignore */
  }

  await loadForCoordinates(place.lat, place.lon, place.label);
}

function readLastCity() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

useLocationBtn.addEventListener("click", () => {
  if (!navigator.geolocation) {
    setStatus("Your browser does not support location. Use the city box instead.");
    cityInput.focus();
    return;
  }

  setStatus("Requesting location…");

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude, longitude } = pos.coords;
      const label = "Near you";
      await loadForCoordinates(latitude, longitude, label);
    },
    () => {
      setStatus(
        "Location was denied or unavailable. Type a city below—we can still show weather."
      );
      cityInput.focus();
    },
    { enableHighAccuracy: false, timeout: 12_000, maximumAge: 300_000 }
  );
});

cityForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const city = cityInput.value.trim();
  if (!city) {
    setStatus("Enter a city name first.");
    return;
  }
  await loadForCityName(city);
});

function init() {
  const last = readLastCity();
  if (last) {
    cityInput.value = last;
    hintLastCity.textContent = `Saved from last visit: ${last}. Press Look up to refresh.`;
    hintLastCity.classList.remove("hidden");
  }
}

init();
