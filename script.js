const useLocationBtn = document.getElementById("use-location-btn");
const connectSpotifyBtn = document.getElementById("connect-spotify-btn");
const cityForm = document.getElementById("city-form");
const cityInput = document.getElementById("city-input");
const statusMessage = document.getElementById("status-message");
const shuffleBtn = document.getElementById("shuffle-btn");
let latestSongs = [];

const SPOTIFY_CLIENT_ID = "ebc367ab357842ac8fb9453ece7e9e02";
const SPOTIFY_SCOPES = "user-read-email user-top-read";
const SPOTIFY_REDIRECT_URI = "https://cassie-phan.github.io/webite2/";
const spotifyTokenState = {
  accessToken: localStorage.getItem("spotify_access_token") || "",
  refreshToken: localStorage.getItem("spotify_refresh_token") || "",
  expiresAt: Number(localStorage.getItem("spotify_expires_at") || "0"),
};

initializeSpotifyAuth();

// ----------------------
// LOCATION
// ----------------------
useLocationBtn.addEventListener("click", () => {
  setStatus("Getting location...");

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      await loadWeatherAndMusic(pos.coords.latitude, pos.coords.longitude);
    },
    () => setStatus("Location denied")
  );
});

// ----------------------
// CITY SEARCH
// ----------------------
cityForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const city = cityInput.value.trim();
  if (!city) return setStatus("Enter a city");

  try {
    setStatus("Finding city...");
    const coords = await resolveCityCoordinates(city);
    if (!coords) return setStatus("City not found. Try 'Tokyo, Japan'");

    await loadWeatherAndMusic(coords.lat, coords.lng);

  } catch (err) {
    console.error(err);
    setStatus("Error loading city");
  }
});

shuffleBtn.addEventListener("click", () => {
  if (!latestSongs.length) return;
  renderSongs(latestSongs);
});

connectSpotifyBtn.addEventListener("click", async () => {
  if (SPOTIFY_CLIENT_ID === "REPLACE_WITH_SPOTIFY_CLIENT_ID") {
    setStatus("Add your Spotify client ID in script.js first");
    return;
  }
  await startSpotifyLogin();
});

// ----------------------
// MAIN
// ----------------------
async function loadWeatherAndMusic(lat, lng) {
  try {
    setStatus("Loading new location...");

    // reverse geocode (get city name)
    const geoRes = await fetch(
        `https://cse2004.com/api/geocode?latlng=${lat},${lng}`
    );
    const geoData = await geoRes.json();

    let city = "Unknown";

    if (geoData.results && geoData.results.length > 0) {
    const components = geoData.results[0].address_components || [];

    const cityObj = components.find(c =>
        c.types.includes("locality")
    );

    const altCityObj = components.find(c =>
        c.types.includes("administrative_area_level_1")
    );

    city = cityObj?.long_name || altCityObj?.long_name || "Unknown";
    }

    const weather = await resolveWeatherAtCoords(lat, lng);
    if (!weather) return setStatus("Weather data unavailable");

    const temp = weather.tempF;
    const desc = weather.description;

    const vibe = getVibe(desc, temp);

    const songs = await fetchSongs(vibe);
    latestSongs = songs;

    renderSongs(songs);

    setStatus(`${city} • ${desc} • ${Math.round(temp)}°F`);
  } catch (err) {
    console.error(err);
    setStatus("Failed to load data");
  }
}

// ----------------------
// VIBE
// ----------------------
function getVibe(desc, temp) {
  desc = desc.toLowerCase();

  // seed_genres must be from Spotify’s genre-seed list (see Recommendations API)
  if (desc.includes("rain")) {
    return { query: "lofi chill", seedGenres: ["chill", "study"] };
  }
  if (desc.includes("cloud")) {
    return { query: "dream pop", seedGenres: ["indie-pop", "ambient"] };
  }
  if (desc.includes("snow")) {
    return { query: "acoustic", seedGenres: ["acoustic", "folk"] };
  }
  if (desc.includes("storm")) {
    return { query: "rock", seedGenres: ["rock", "alt-rock"] };
  }

  if (temp > 75) {
    return { query: "summer pop", seedGenres: ["pop", "summer"] };
  }
  return { query: "indie pop", seedGenres: ["indie", "indie-pop"] };
}

// ----------------------
// MUSIC
// ----------------------
async function fetchSongs(vibe) {
  const spotifyTracks = await fetchSpotifySongs(vibe);
  return spotifyTracks;
}

// ----------------------
// RENDER GRID
// ----------------------
function renderSongs(songs) {
  const results = document.getElementById("results");
  const grid = document.getElementById("songs-grid");

  results.classList.remove("hidden");
  grid.innerHTML = "";
  shuffleBtn.classList.toggle("hidden", !songs.length);

  if (!songs.length) return;

  songs = songs.filter(isSongCardItem);

  if (!songs.length) {
    results.classList.add("hidden");
    shuffleBtn.classList.add("hidden");
    return;
  }

  songs = shuffleArray([...songs]);

  // 🔥 limit to 8
  songs = songs.slice(0, 8);

  songs.forEach(song => {
    const div = document.createElement("div");
    div.className = "song-card";

    const img = (song.artworkUrl100 || "").replace("100x100", "500x500");

    const title = song.trackName || song.collectionName || "Unknown";
    const artist = song.artistName || "Unknown Artist";

    div.innerHTML = `
      <div class="img-wrapper">
        <img src="${img}">
      </div>
      <p class="title">${title}</p>
      <p class="artist">${artist}</p>
    `;

    grid.appendChild(div);
  });
}

// ----------------------
function setStatus(msg) {
  statusMessage.textContent = msg;
}

// ----------------------
// CITY GEOCODING (with fallback)
// ----------------------
async function resolveCityCoordinates(city) {
  const cseQueryOptions = [city, `${city}, Japan`];

  for (const query of cseQueryOptions) {
    try {
      const res = await fetch(
        `https://cse2004.com/api/geocode?address=${encodeURIComponent(query)}`
      );
      if (!res.ok) continue;

      const data = await res.json();
      const first = data?.results?.[0]?.geometry?.location;
      if (first?.lat != null && first?.lng != null) {
        return { lat: first.lat, lng: first.lng };
      }
    } catch (_) {
      // Keep trying fallbacks.
    }
  }

  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`
    );
    if (!res.ok) return null;

    const data = await res.json();
    const first = data?.results?.[0];
    if (first?.latitude != null && first?.longitude != null) {
      return { lat: first.latitude, lng: first.longitude };
    }
  } catch (_) {
    return null;
  }

  return null;
}

// ----------------------
// WEATHER (with fallback)
// ----------------------
async function resolveWeatherAtCoords(lat, lng) {
  try {
    const res = await fetch(
      `https://cse2004.com/api/weather?latitude=${lat}&longitude=${lng}`
    );
    if (res.ok) {
      const data = await res.json();
      const temp = data?.temperature?.degrees;
      const desc = data?.weatherCondition?.description?.text;
      if (typeof temp === "number" && typeof desc === "string" && desc.trim()) {
        return { tempF: temp, description: desc };
      }
    }
  } catch (_) {
    // Continue to fallback.
  }

  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code&temperature_unit=fahrenheit`
    );
    if (!res.ok) return null;

    const data = await res.json();
    const temp = data?.current?.temperature_2m;
    const code = data?.current?.weather_code;
    if (typeof temp !== "number" || typeof code !== "number") return null;

    return {
      tempF: temp,
      description: weatherCodeToText(code),
    };
  } catch (_) {
    return null;
  }
}

function weatherCodeToText(code) {
  if (code === 0) return "Clear sky";
  if ([1, 2, 3].includes(code)) return "Cloudy";
  if ([45, 48].includes(code)) return "Foggy";
  if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow";
  if ([95, 96, 99].includes(code)) return "Storm";
  return "Mixed conditions";
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Drops iTunes-style audiobooks/movies if old scripts mixed catalog; Spotify items set kind: "song". */
function isSongCardItem(song) {
  if (song.kind != null && song.kind !== "song") return false;
  const t = (song.trackName || "").toLowerCase();
  if (/\b(unabridged|audiobook)\b/i.test(t)) return false;
  if (t.includes("only from audible")) return false;
  return true;
}

function isSpotifyMusicTrack(track) {
  if (!track || track.type !== "track") return false;
  const name = (track.name || "").toLowerCase();
  if (/\b(unabridged|audiobook)\b/i.test(name)) return false;
  if (name.includes("only from audible")) return false;
  return true;
}

function mapSpotifyTracksToSongs(tracks) {
  return (tracks || [])
    .filter(isSpotifyMusicTrack)
    .map(track => ({
      kind: "song",
      artworkUrl100: track?.album?.images?.[0]?.url || "",
      trackName: track?.name || "Unknown",
      artistName: (track?.artists || []).map(a => a.name).join(", ") || "Unknown Artist",
    }));
}

async function fetchUserTopTrackIds(token) {
  try {
    const res = await fetch(
      "https://api.spotify.com/v1/me/top/tracks?time_range=medium_term&limit=15",
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    const ids = (data.items || []).map(t => t.id).filter(Boolean);
    shuffleArray(ids);
    return ids.slice(0, 2);
  } catch (_) {
    return [];
  }
}

async function fetchSpotifyRecommendations(token, seedTrackIds, seedGenres) {
  const tracks = (seedTrackIds || []).slice(0, 2);
  const maxGenres = Math.max(0, 5 - tracks.length);
  let genres = (seedGenres || []).slice(0, maxGenres || 5);
  if (tracks.length === 0 && genres.length === 0) {
    genres = ["pop", "indie"];
  }
  if (tracks.length > 0 && genres.length === 0 && maxGenres > 0) {
    genres = ["pop"];
  }

  const params = new URLSearchParams({
    limit: "20",
    market: "from_token",
  });
  if (tracks.length) params.set("seed_tracks", tracks.join(","));
  if (genres.length) params.set("seed_genres", genres.join(","));

  const res = await fetch(
    `https://api.spotify.com/v1/recommendations?${params.toString()}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.tracks || [];
}

async function fetchSpotifySearchTracks(token, query) {
  const res = await fetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=25&market=from_token`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data?.tracks?.items || [];
}

async function fetchSpotifySongs(vibe) {
  const token = await getValidSpotifyAccessToken();
  if (!token) {
    setStatus("Connect Spotify to load recommendations");
    return [];
  }

  const seedGenres = vibe.seedGenres || ["pop", "indie"];
  const query = vibe.query || "indie pop";

  try {
    const seedTrackIds = await fetchUserTopTrackIds(token);
    let tracks = [];

    if (seedTrackIds.length) {
      const genreBudget = Math.min(seedGenres.length, 5 - seedTrackIds.length);
      const genresForRec = seedGenres.slice(0, Math.max(1, genreBudget));
      tracks = await fetchSpotifyRecommendations(token, seedTrackIds, genresForRec);
    }

    if (!tracks.length) {
      tracks = await fetchSpotifyRecommendations(
        token,
        [],
        seedGenres.slice(0, 5)
      );
    }

    if (!tracks.length) {
      tracks = await fetchSpotifySearchTracks(token, query);
    }

    return mapSpotifyTracksToSongs(tracks);
  } catch (_) {
    return [];
  }
}

async function getValidSpotifyAccessToken() {
  const now = Date.now();
  if (spotifyTokenState.accessToken && now < spotifyTokenState.expiresAt - 60000) {
    return spotifyTokenState.accessToken;
  }

  if (spotifyTokenState.refreshToken) {
    const refreshed = await refreshSpotifyToken();
    if (refreshed) return spotifyTokenState.accessToken;
  }

  return "";
}

function initializeSpotifyAuth() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const authError = params.get("error");
  const storedVerifier = sessionStorage.getItem("spotify_code_verifier");

  if (authError) {
    setStatus(`Spotify auth failed: ${authError}`);
    updateSpotifyButton();
    return;
  }

  if (!code || !storedVerifier) {
    updateSpotifyButton();
    return;
  }

  exchangeSpotifyCodeForToken(code, storedVerifier)
    .then((ok) => {
      if (ok) {
        const cleanUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, "", cleanUrl);
        setStatus("Spotify connected");
      } else {
        setStatus("Spotify token exchange failed. Check redirect URI settings.");
      }
      updateSpotifyButton();
    })
    .catch(() => {
      setStatus("Spotify login failed. Check browser console for details.");
      updateSpotifyButton();
    });
}

async function startSpotifyLogin() {
  const verifier = randomString(64);
  const challenge = await sha256Base64Url(verifier);
  sessionStorage.setItem("spotify_code_verifier", verifier);

  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: "code",
    redirect_uri: SPOTIFY_REDIRECT_URI,
    code_challenge_method: "S256",
    code_challenge: challenge,
    scope: SPOTIFY_SCOPES,
  });

  window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

async function exchangeSpotifyCodeForToken(code, verifier) {
  if (SPOTIFY_CLIENT_ID === "REPLACE_WITH_SPOTIFY_CLIENT_ID") return false;

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: SPOTIFY_REDIRECT_URI,
    client_id: SPOTIFY_CLIENT_ID,
    code_verifier: verifier,
  });

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const details = await res.text();
    console.error("Spotify token exchange error:", details);
    return false;
  }
  const data = await res.json();
  saveSpotifyTokenData(data);
  sessionStorage.removeItem("spotify_code_verifier");
  return true;
}

async function refreshSpotifyToken() {
  if (!spotifyTokenState.refreshToken || SPOTIFY_CLIENT_ID === "REPLACE_WITH_SPOTIFY_CLIENT_ID") {
    return false;
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: spotifyTokenState.refreshToken,
    client_id: SPOTIFY_CLIENT_ID,
  });
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) return false;

  const data = await res.json();
  saveSpotifyTokenData({
    ...data,
    refresh_token: data.refresh_token || spotifyTokenState.refreshToken,
  });
  return true;
}

function saveSpotifyTokenData(data) {
  spotifyTokenState.accessToken = data.access_token || "";
  spotifyTokenState.refreshToken = data.refresh_token || spotifyTokenState.refreshToken;
  spotifyTokenState.expiresAt = Date.now() + (Number(data.expires_in || 0) * 1000);

  localStorage.setItem("spotify_access_token", spotifyTokenState.accessToken);
  localStorage.setItem("spotify_refresh_token", spotifyTokenState.refreshToken);
  localStorage.setItem("spotify_expires_at", String(spotifyTokenState.expiresAt));
}

function updateSpotifyButton() {
  if (spotifyTokenState.accessToken && Date.now() < spotifyTokenState.expiresAt - 60000) {
    connectSpotifyBtn.textContent = "Spotify connected (click to re-auth)";
    connectSpotifyBtn.disabled = false;
    return;
  }
  connectSpotifyBtn.textContent = "Connect Spotify";
  connectSpotifyBtn.disabled = false;
}

function randomString(length) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i += 1) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function sha256Base64Url(input) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const base64 = btoa(String.fromCharCode(...new Uint8Array(digest)));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}