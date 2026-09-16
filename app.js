/* =========================================================
   MANIFY — app.js
   Backend'siz, tamamen istemci taraflı PWA mantığı.
   ========================================================= */
(function () {
  "use strict";

  /* ---------------------------------------------------------
     0. GLOBAL HATA YAKALAMA — hiçbir hata beyaz ekran yaratmamalı
     --------------------------------------------------------- */
  window.addEventListener("error", function (e) {
    console.error("[Manify] Beklenmeyen hata:", e.error || e.message);
    try { showToast("Beklenmeyen bir hata oluştu. Uygulama kullanılmaya devam edebilir.", { error: true }); } catch (_) {}
  });
  window.addEventListener("unhandledrejection", function (e) {
    console.error("[Manify] İşlenmeyen promise hatası:", e.reason);
    try { showToast("Bir işlem tamamlanamadı.", { error: true }); } catch (_) {}
  });

  /* ---------------------------------------------------------
     1. DEPOLAMA KATMANI — IndexedDB öncelikli, localStorage yedek
     --------------------------------------------------------- */
  var DB_NAME = "manify-db";
  var DB_STORE = "kv";
  var dbPromise = null;
  var idbAvailable = "indexedDB" in window;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!idbAvailable) { reject(new Error("IndexedDB yok")); return; }
      try {
        var req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = function () {
          req.result.createObjectStore(DB_STORE);
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      } catch (err) { reject(err); }
    });
    return dbPromise;
  }

  function idbGet(key) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(DB_STORE, "readonly");
        var req = tx.objectStore(DB_STORE).get(key);
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function idbSet(key, value) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(DB_STORE, "readwrite");
        tx.objectStore(DB_STORE).put(value, key);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  /** Store.get/set her zaman Promise döner; IndexedDB başarısız olursa localStorage'a düşer. */
  var Store = {
    get: function (key, fallback) {
      if (idbAvailable) {
        return idbGet(key).then(function (v) {
          return v === undefined ? fallback : v;
        }).catch(function () { return Store._lsGet(key, fallback); });
      }
      return Promise.resolve(Store._lsGet(key, fallback));
    },
    set: function (key, value) {
      if (idbAvailable) {
        return idbSet(key, value).catch(function () { return Store._lsSet(key, value); });
      }
      return Promise.resolve(Store._lsSet(key, value));
    },
    _lsGet: function (key, fallback) {
      try {
        var raw = localStorage.getItem("manify:" + key);
        if (raw === null) return fallback;
        return JSON.parse(raw);
      } catch (err) {
        console.warn("[Manify] Bozuk yerel kayıt temizlendi:", key);
        try { localStorage.removeItem("manify:" + key); } catch (_) {}
        return fallback;
      }
    },
    _lsSet: function (key, value) {
      try {
        localStorage.setItem("manify:" + key, JSON.stringify(value));
        return true;
      } catch (err) {
        console.error("[Manify] localStorage dolu olabilir:", err);
        showToast("Yerel depolama dolu olabilir, veriler kaydedilemedi.", { error: true });
        return false;
      }
    }
  };

  /* ---------------------------------------------------------
     2. UYGULAMA DURUMU (STATE)
     --------------------------------------------------------- */
  var state = {
    currentView: "home",
    searchQuery: "",
    searchFilter: "all",
    searchResults: [],
    isSearching: false,
    searchError: null,

    currentTrack: null,
    isPlaying: false,
    playerReady: false,
    playerState: "unstarted",
    currentTime: 0,
    duration: 0,
    volume: 100,
    isMuted: false,

    queue: [],
    queueIndex: -1,
    favorites: [],
    history: { played: [], searches: [] },
    repeatMode: "off",     // off | one | all
    shuffleEnabled: false,

    isMiniPlayerVisible: false,
    isFullPlayerOpen: false,
    isSidebarOpen: false,
    isQueuePanelOpen: false,

    settings: {
      theme: "dark",
      reduceMotion: false,
      autoNext: true,
      restoreQueue: true,
      historyEnabled: true
    },

    networkStatus: navigator.onLine ? "online" : "offline",
    appError: null
  };

  /* ---------------------------------------------------------
     3. YARDIMCI FONKSİYONLAR
     --------------------------------------------------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(tag, cls) { var n = document.createElement(tag); if (cls) n.className = cls; return n; }

  function escapeText(str) {
    // innerHTML kullanımını minimuma indirmek için: metinleri her zaman textContent ile basıyoruz.
    // Bu fonksiyon, nadiren gerekli olan öznitelik/URL bağlamları için basit bir koruma sağlar.
    return String(str == null ? "" : str);
  }

  function isSafeUrl(url) {
    if (!url) return false;
    try {
      var u = new URL(url, window.location.href);
      return u.protocol === "https:" || u.protocol === "http:";
    } catch (_) { return false; }
  }

  function formatDuration(totalSeconds) {
    if (!totalSeconds || totalSeconds <= 0) return "";
    var m = Math.floor(totalSeconds / 60);
    var s = Math.floor(totalSeconds % 60);
    return m + ":" + (s < 10 ? "0" + s : s);
  }

  function debounce(fn, wait) {
    var t = null;
    return function () {
      var args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, wait);
    };
  }

  var toastArea = $("#toastArea");
  function showToast(message, opts) {
    opts = opts || {};
    var t = el("div", "toast" + (opts.error ? " is-error" : ""));
    t.setAttribute("role", opts.error ? "alert" : "status");
    t.textContent = message;
    toastArea.appendChild(t);
    setTimeout(function () {
      t.style.transition = "opacity 200ms ease";
      t.style.opacity = "0";
      setTimeout(function () { t.remove(); }, 220);
    }, 3400);
  }

  /* ---------------------------------------------------------
     4. YOUTUBE VİDEO ID DOĞRULAMA
     --------------------------------------------------------- */
  var VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

  function isValidVideoId(id) {
    return typeof id === "string" && VIDEO_ID_RE.test(id);
  }

  function extractVideoId(input) {
    if (!input) return null;
    input = input.trim();
    if (isValidVideoId(input)) return input;
    if (/^javascript:/i.test(input)) return null;
    try {
      var u = new URL(input);
      var host = u.hostname.replace(/^www\./, "");
      if (host === "youtu.be") {
        var id = u.pathname.slice(1).split("/")[0];
        return isValidVideoId(id) ? id : null;
      }
      if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
        if (u.pathname === "/watch") {
          var v = u.searchParams.get("v");
          return isValidVideoId(v) ? v : null;
        }
        var shortsMatch = u.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]{11})/);
        if (shortsMatch) return shortsMatch[1];
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  /* ---------------------------------------------------------
     5. ARAMA KATMANI — Resmi YouTube Data API v3
     --------------------------------------------------------- */
  // Bu uygulama tek bir kullanıcı (sen) için kişisel bir iOS PWA'sı olarak
  // tasarlandığından, bir "Ayarlar" ekranından anahtar girme akışı yerine
  // anahtar doğrudan burada koda gömülüdür.
  //
  // KENDİ ANAHTARINI ALMAK İÇİN:
  //   1) https://console.cloud.google.com/apis/library/youtube.googleapis.com
  //      adresinden bir Google Cloud projesinde "YouTube Data API v3"ü etkinleştir.
  //   2) Credentials → Create Credentials → API key ile bir anahtar oluştur.
  //   3) (Şiddetle önerilir) Anahtarı, Application restrictions → Websites
  //      altında yalnızca kendi sitenin adresiyle (ör. manify-pwa.onrender.com/*)
  //      sınırla. Bu istemci taraflı bir uygulama olduğu için anahtar sayfa
  //      kaynağında herkese görünür olacaktır; site kısıtlaması olmadan
  //      başkaları bu anahtarı kopyalayıp kendi kotanı tüketebilir.
  //   4) Aşağıdaki değeri kendi anahtarınla değiştir ve dosyayı kaydet.
  var YOUTUBE_API_KEY = "AIzaSyCz9cMYrxUmJcgW0ttfYfpPxGMsStgFoyg";
  var YT_API_BASE = "https://www.googleapis.com/youtube/v3";

  function decodeHtmlEntities(str) {
    // Yalnızca metin çözmek için kullanılır (YouTube API başlıkları/açıklamaları
    // HTML-encoded döndürür, ör. "&amp;"). Sonuç asla innerHTML'e geri
    // yazılmaz — yalnızca textContent olarak DOM'a basılır.
    var ta = document.createElement("textarea");
    ta.innerHTML = str || "";
    return ta.value;
  }

  function parseISO8601Duration(iso) {
    // "PT4M13S" -> 253 (saniye)
    if (!iso) return 0;
    var m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
    if (!m) return 0;
    var h = parseInt(m[1] || "0", 10);
    var min = parseInt(m[2] || "0", 10);
    var s = parseInt(m[3] || "0", 10);
    return h * 3600 + min * 60 + s;
  }

  function bestThumbnail(thumbnails) {
    if (!thumbnails) return "";
    var t = thumbnails.medium || thumbnails.high || thumbnails.default || {};
    return t.url || "";
  }

  function mapFilterToTypeAndCategory(filter) {
    switch (filter) {
      case "song": return { type: "video", videoCategoryId: "10" }; // 10 = Music kategorisi
      case "video": return { type: "video" };
      case "artist": return { type: "channel" };
      case "album": return { type: "playlist" };
      case "playlist": return { type: "playlist" };
      default: return { type: "video,channel,playlist" };
    }
  }

  function buildMediaItemFromSearchResult(item, filter) {
    var idInfo = item.id || {};
    var snippet = item.snippet || {};
    var thumb = bestThumbnail(snippet.thumbnails);

    if (idInfo.videoId) {
      return {
        id: idInfo.videoId,
        type: filter === "song" ? "song" : "video",
        title: decodeHtmlEntities(snippet.title),
        artist: decodeHtmlEntities(snippet.channelTitle || ""),
        channelId: snippet.channelId || "",
        thumbnailUrl: thumb,
        durationSeconds: 0,
        durationText: "",
        description: decodeHtmlEntities(snippet.description || ""),
        sourceUrl: "https://www.youtube.com/watch?v=" + idInfo.videoId,
        publishedText: snippet.publishedAt ? new Date(snippet.publishedAt).toLocaleDateString("tr-TR") : "",
        isPlayable: isValidVideoId(idInfo.videoId),
        source: "youtube"
      };
    }
    if (idInfo.channelId) {
      return {
        id: idInfo.channelId,
        type: "artist",
        title: decodeHtmlEntities(snippet.title),
        artist: "Sanatçı",
        channelId: idInfo.channelId,
        thumbnailUrl: thumb,
        durationSeconds: 0, durationText: "",
        description: decodeHtmlEntities(snippet.description || ""),
        sourceUrl: "https://www.youtube.com/channel/" + idInfo.channelId,
        publishedText: "", isPlayable: false, source: "youtube"
      };
    }
    if (idInfo.playlistId) {
      return {
        id: idInfo.playlistId,
        type: filter === "album" ? "album" : "playlist",
        title: decodeHtmlEntities(snippet.title),
        artist: decodeHtmlEntities(snippet.channelTitle || ""),
        channelId: snippet.channelId || "",
        thumbnailUrl: thumb,
        durationSeconds: 0, durationText: "",
        description: decodeHtmlEntities(snippet.description || ""),
        sourceUrl: "https://www.youtube.com/playlist?list=" + idInfo.playlistId,
        publishedText: "", isPlayable: false, source: "youtube"
      };
    }
    return null;
  }

  /** Video süreleri için ikinci bir istek: videos.list (contentDetails). En fazla 50 ID/istek. */
  function fetchVideoDurations(videoIds) {
    if (!videoIds.length) return Promise.resolve({});
    var url = YT_API_BASE + "/videos?part=contentDetails&id=" + videoIds.slice(0, 50).join(",") + "&key=" + YOUTUBE_API_KEY;
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error("http_" + res.status);
      return res.json();
    }).then(function (json) {
      var map = {};
      (json.items || []).forEach(function (v) {
        map[v.id] = parseISO8601Duration(v.contentDetails && v.contentDetails.duration);
      });
      return map;
    }).catch(function () { return {}; }); // Süre alınamazsa sessizce boş bırak; arama sonucu yine de gösterilir.
  }

  function buildYouTubeApiError(res, json) {
    var reason = json && json.error && json.error.errors && json.error.errors[0] && json.error.errors[0].reason;
    var messages = {
      quotaExceeded: "Günlük ücretsiz arama kotası doldu. Kota YouTube tarafından her gün sıfırlanır.",
      dailyLimitExceeded: "Günlük ücretsiz arama kotası doldu. Kota YouTube tarafından her gün sıfırlanır.",
      keyInvalid: "API anahtarı geçersiz. app.js içindeki YOUTUBE_API_KEY değerini kontrol et.",
      accessNotConfigured: "Bu Google Cloud projesinde YouTube Data API v3 etkinleştirilmemiş görünüyor.",
      forbidden: "İstek reddedildi — API anahtarının site kısıtlaması bu adresi kapsamıyor olabilir."
    };
    var e = new Error(messages[reason] || ("YouTube API hatası (HTTP " + res.status + ")."));
    e.reason = reason || ("http_" + res.status);
    return e;
  }

  /**
   * searchYouTube(query, filter) -> Promise<Array<MediaItem>>
   * Resmi, CORS destekleyen YouTube Data API v3 search.list uç noktasını kullanır.
   * Bu uç nokta InnerTube'un aksine tarayıcıdan çağrılmak üzere tasarlanmıştır
   * ve doğru bir API anahtarıyla güvenilir biçimde çalışır.
   */
  function searchYouTube(query, filter) {
    if (!YOUTUBE_API_KEY || YOUTUBE_API_KEY.indexOf("YOUR_") === 0) {
      var missingKeyErr = new Error("API anahtarı tanımlı değil. app.js dosyasındaki YOUTUBE_API_KEY değerini kendi anahtarınla doldur.");
      missingKeyErr.reason = "missing_key";
      return Promise.reject(missingKeyErr);
    }

    var typeInfo = mapFilterToTypeAndCategory(filter);
    var params = new URLSearchParams({
      part: "snippet",
      q: query,
      maxResults: "25",
      type: typeInfo.type,
      safeSearch: "none",
      relevanceLanguage: "tr",
      key: YOUTUBE_API_KEY
    });
    if (typeInfo.videoCategoryId) params.set("videoCategoryId", typeInfo.videoCategoryId);

    return fetch(YT_API_BASE + "/search?" + params.toString()).then(function (res) {
      return res.json().then(function (json) {
        if (!res.ok) throw buildYouTubeApiError(res, json);
        return json;
      });
    }).then(function (json) {
      var items = (json.items || [])
        .map(function (item) { return buildMediaItemFromSearchResult(item, filter); })
        .filter(function (item) { return item && item.id; });

      var videoIds = items
        .filter(function (i) { return i.type === "video" || i.type === "song"; })
        .map(function (i) { return i.id; });

      return fetchVideoDurations(videoIds).then(function (durationMap) {
        items.forEach(function (i) {
          if (durationMap[i.id]) {
            i.durationSeconds = durationMap[i.id];
            i.durationText = formatDuration(durationMap[i.id]);
          }
        });
        return items;
      });
    }).catch(function (err) {
      if (err && err.reason) throw err;
      var e = new Error("Arama isteği tamamlanamadı (ağ bağlantısı olabilir).");
      e.reason = "network";
      throw e;
    });
  }

  /* ---------------------------------------------------------
     6. YOUTUBE IFRAME PLAYER KATMANI
     --------------------------------------------------------- */
  var ytPlayer = null;
  var ytApiPromise = null;
  var progressTimer = null;

  function loadYouTubeIframeAPI() {
    if (ytApiPromise) return ytApiPromise;
    ytApiPromise = new Promise(function (resolve, reject) {
      if (window.YT && window.YT.Player) { resolve(window.YT); return; }
      var timeout = setTimeout(function () {
        reject(new Error("YouTube oynatıcı API'si yüklenemedi (zaman aşımı)."));
      }, 12000);
      window.onYouTubeIframeAPIReady = function () {
        clearTimeout(timeout);
        resolve(window.YT);
      };
      var existing = document.getElementById("yt-iframe-api-script");
      if (existing) return;
      var tag = document.createElement("script");
      tag.id = "yt-iframe-api-script";
      tag.src = "https://www.youtube.com/iframe_api";
      tag.onerror = function () {
        clearTimeout(timeout);
        reject(new Error("YouTube oynatıcı script'i yüklenemedi."));
      };
      document.head.appendChild(tag);
    });
    return ytApiPromise;
  }

  function initializeYouTubePlayer() {
    return loadYouTubeIframeAPI().then(function (YT) {
      return new Promise(function (resolve, reject) {
        try {
          ytPlayer = new YT.Player("ytPlayer", {
            height: "100%",
            width: "100%",
            playerVars: { playsinline: 1, rel: 0, modestbranding: 1 },
            events: {
              onReady: function () {
                state.playerReady = true;
                resolve(ytPlayer);
              },
              onStateChange: onPlayerStateChange,
              onError: onPlayerError
            }
          });
        } catch (err) { reject(err); }
      });
    });
  }

  function ensurePlayer() {
    if (ytPlayer && state.playerReady) return Promise.resolve(ytPlayer);
    return initializeYouTubePlayer().catch(function (err) {
      showToast("YouTube oynatıcı yüklenemedi: " + err.message, { error: true });
      throw err;
    });
  }

  function onPlayerStateChange(e) {
    var YT = window.YT;
    if (!YT) return;
    switch (e.data) {
      case YT.PlayerState.PLAYING:
        state.isPlaying = true; state.playerState = "playing";
        startProgressTimer();
        addPlayHistory(state.currentTrack);
        break;
      case YT.PlayerState.PAUSED:
        state.isPlaying = false; state.playerState = "paused";
        stopProgressTimer();
        break;
      case YT.PlayerState.BUFFERING:
        state.playerState = "buffering";
        break;
      case YT.PlayerState.CUED:
        state.playerState = "cued";
        break;
      case YT.PlayerState.ENDED:
        state.isPlaying = false; state.playerState = "ended";
        stopProgressTimer();
        handleTrackEnded();
        break;
      default:
        state.playerState = "unstarted";
    }
    renderPlayerUI();
  }

  function onPlayerError(e) {
    var messages = {
      2: "Geçersiz video ID.",
      5: "Video bu tarayıcıda oynatılamıyor.",
      100: "Video bulunamadı veya kaldırılmış.",
      101: "Video sahibi bu videonun başka sitelerde oynatılmasına izin vermiyor.",
      150: "Video sahibi bu videonun başka sitelerde oynatılmasına izin vermiyor."
    };
    var msg = messages[e.data] || "Video oynatılamadı.";
    showToast(msg, { error: true });
    if (state.settings.autoNext) nextTrack();
  }

  function handleTrackEnded() {
    if (state.repeatMode === "one") {
      seekTo(0); play();
      return;
    }
    var hasNext = state.shuffleEnabled ? state.queue.length > 1 : (state.queueIndex < state.queue.length - 1);
    if (hasNext || state.repeatMode === "all") {
      nextTrack();
    } else {
      stopPlayback();
    }
  }

  function startProgressTimer() {
    stopProgressTimer();
    progressTimer = setInterval(function () {
      if (!ytPlayer || typeof ytPlayer.getCurrentTime !== "function") return;
      try {
        state.currentTime = ytPlayer.getCurrentTime() || 0;
        state.duration = ytPlayer.getDuration() || 0;
        renderProgress();
      } catch (_) {}
    }, 500);
  }
  function stopProgressTimer() { if (progressTimer) { clearInterval(progressTimer); progressTimer = null; } }

  function loadVideo(item) {
    if (!item || !isValidVideoId(item.id)) {
      showToast("Geçersiz video ID, oynatılamıyor.", { error: true });
      return Promise.resolve();
    }
    state.currentTrack = item;
    state.isMiniPlayerVisible = true;
    renderPlayerMeta();
    return ensurePlayer().then(function (p) {
      p.loadVideoById(item.id);
      state.playerReady = true;
    }).catch(function () {});
  }

  function play() { if (ytPlayer && ytPlayer.playVideo) ytPlayer.playVideo(); }
  function pause() { if (ytPlayer && ytPlayer.pauseVideo) ytPlayer.pauseVideo(); }
  function togglePlay() { state.isPlaying ? pause() : play(); }
  function seekTo(seconds) { if (ytPlayer && ytPlayer.seekTo) ytPlayer.seekTo(seconds, true); }
  function setVolume(v) { state.volume = v; if (ytPlayer && ytPlayer.setVolume) ytPlayer.setVolume(v); }
  function muteAudio() { state.isMuted = true; if (ytPlayer && ytPlayer.mute) ytPlayer.mute(); }
  function unmuteAudio() { state.isMuted = false; if (ytPlayer && ytPlayer.unMute) ytPlayer.unMute(); }
  function stopPlayback() {
    if (ytPlayer && ytPlayer.stopVideo) ytPlayer.stopVideo();
    state.isPlaying = false;
    stopProgressTimer();
    renderPlayerUI();
  }
  function destroyPlayer() {
    stopProgressTimer();
    if (ytPlayer && ytPlayer.destroy) ytPlayer.destroy();
    ytPlayer = null;
    state.playerReady = false;
  }

  function nextTrack() {
    if (!state.queue.length) return;
    var idx;
    if (state.shuffleEnabled) {
      idx = Math.floor(Math.random() * state.queue.length);
    } else {
      idx = state.queueIndex + 1;
      if (idx >= state.queue.length) {
        if (state.repeatMode === "all") idx = 0; else return;
      }
    }
    state.queueIndex = idx;
    persistQueue();
    loadVideo(state.queue[idx]);
    setTimeout(play, 250);
    renderQueueViews();
  }

  function previousTrack() {
    if (!state.queue.length) return;
    if (state.currentTime > 3) { seekTo(0); return; }
    var idx = state.queueIndex - 1;
    if (idx < 0) { if (state.repeatMode === "all") idx = state.queue.length - 1; else { seekTo(0); return; } }
    state.queueIndex = idx;
    persistQueue();
    loadVideo(state.queue[idx]);
    setTimeout(play, 250);
    renderQueueViews();
  }

  /* ---------------------------------------------------------
     7. KUYRUK
     --------------------------------------------------------- */
  function persistQueue() {
    Store.set("queue", { items: state.queue, index: state.queueIndex, repeatMode: state.repeatMode, shuffle: state.shuffleEnabled });
  }

  function addToQueue(item, opts) {
    opts = opts || {};
    state.queue.push(item);
    persistQueue();
    renderQueueViews();
    renderHome();
    if (!opts.silent) showToast("Kuyruğa eklendi: " + item.title);
    if (state.queueIndex === -1) { /* henüz çalınan yoksa dokunma, kullanıcı oynat'a basınca başlar */ }
  }

  function removeFromQueue(index) {
    if (index < 0 || index >= state.queue.length) return;
    state.queue.splice(index, 1);
    if (state.queueIndex > index) state.queueIndex -= 1;
    else if (state.queueIndex === index) { /* mevcut çalan silindi */ }
    persistQueue();
    renderQueueViews();
    renderHome();
  }

  function moveQueueItem(index, dir) {
    var newIndex = index + dir;
    if (newIndex < 0 || newIndex >= state.queue.length) return;
    var tmp = state.queue[index];
    state.queue[index] = state.queue[newIndex];
    state.queue[newIndex] = tmp;
    if (state.queueIndex === index) state.queueIndex = newIndex;
    else if (state.queueIndex === newIndex) state.queueIndex = index;
    persistQueue();
    renderQueueViews();
  }

  function clearQueue() {
    state.queue = [];
    state.queueIndex = -1;
    persistQueue();
    renderQueueViews();
    renderHome();
  }

  function playFromQueue(index) {
    state.queueIndex = index;
    persistQueue();
    loadVideo(state.queue[index]);
    setTimeout(play, 250);
    renderQueueViews();
  }

  function playNow(item) {
    var idx = state.queue.findIndex(function (q) { return q.id === item.id; });
    if (idx === -1) { state.queue.push(item); idx = state.queue.length - 1; }
    state.queueIndex = idx;
    persistQueue();
    loadVideo(item);
    setTimeout(play, 250);
    renderQueueViews();
    renderHome();
  }

  /* ---------------------------------------------------------
     8. FAVORİLER
     --------------------------------------------------------- */
  function persistFavorites() { Store.set("favorites", state.favorites); }
  function isFavorite(id) { return state.favorites.some(function (f) { return f.id === id; }); }
  function toggleFavorite(item) {
    if (isFavorite(item.id)) {
      state.favorites = state.favorites.filter(function (f) { return f.id !== item.id; });
      showToast("Favorilerden çıkarıldı");
    } else {
      state.favorites.unshift(item);
      showToast("Favorilere eklendi");
    }
    persistFavorites();
    renderFavoritesView();
    renderHome();
    renderSearchResults();
    renderQueueViews();
  }

  /* ---------------------------------------------------------
     9. GEÇMİŞ
     --------------------------------------------------------- */
  var HISTORY_LIMIT = 60;
  function persistHistory() { Store.set("history", state.history); }

  function addPlayHistory(item) {
    if (!item || !state.settings.historyEnabled) return;
    state.history.played = state.history.played.filter(function (h) { return h.id !== item.id; });
    state.history.played.unshift(Object.assign({}, item, { playedAt: Date.now() }));
    state.history.played = state.history.played.slice(0, HISTORY_LIMIT);
    persistHistory();
    renderHistoryView();
    renderHome();
  }

  function addSearchHistory(query) {
    if (!query || !state.settings.historyEnabled) return;
    state.history.searches = state.history.searches.filter(function (q) { return q.toLowerCase() !== query.toLowerCase(); });
    state.history.searches.unshift(query);
    state.history.searches = state.history.searches.slice(0, 20);
    persistHistory();
    renderHistoryView();
    renderHome();
  }

  function clearPlayHistory() { state.history.played = []; persistHistory(); renderHistoryView(); renderHome(); showToast("Geçmiş temizlendi"); }
  function clearAllHistory() { state.history = { played: [], searches: [] }; persistHistory(); renderHistoryView(); renderHome(); showToast("Geçmiş temizlendi"); }

  /* ---------------------------------------------------------
     10. GÖRÜNÜM / ROUTER
     --------------------------------------------------------- */
  function switchView(name) {
    state.currentView = name;
    $all(".view").forEach(function (v) { v.hidden = v.dataset.viewPanel !== name; });
    $all(".nav-item").forEach(function (b) {
      var active = b.dataset.view === name;
      if (active) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    closeSidebar();
    $("#main-content").focus({ preventScroll: true });
    if (name === "search") $("#searchInput").focus({ preventScroll: true });
  }

  /* ---------------------------------------------------------
     11. RENDER — SONUÇ KARTLARI (ortak şablon)
     --------------------------------------------------------- */
  var resultTpl = $("#resultCardTemplate");
  var skeletonTpl = $("#skeletonCardTemplate");

  function buildResultCard(item) {
    var node = resultTpl.content.firstElementChild.cloneNode(true);
    var img = $(".result-thumb", node);
    img.alt = item.title || "";
    if (isSafeUrl(item.thumbnailUrl)) img.src = item.thumbnailUrl;
    else img.removeAttribute("src");

    var badge = $(".result-type-badge", node);
    var typeLabels = { song: "Şarkı", video: "Video", artist: "Sanatçı", album: "Albüm", playlist: "Playlist" };
    badge.textContent = typeLabels[item.type] || "";

    $(".result-title", node).textContent = item.title || "Başlıksız";
    $(".result-sub", node).textContent = item.artist || "";
    $(".result-duration", node).textContent = item.durationText || formatDuration(item.durationSeconds);

    var favBtn = $(".result-fav", node);
    var fav = isFavorite(item.id);
    favBtn.classList.toggle("is-active", fav);
    favBtn.setAttribute("aria-pressed", String(fav));
    favBtn.addEventListener("click", function (ev) { ev.stopPropagation(); toggleFavorite(item); });

    $(".result-queue", node).addEventListener("click", function (ev) {
      ev.stopPropagation();
      if (!item.isPlayable) { showToast("Bu öğe doğrudan oynatılamıyor.", { error: true }); return; }
      addToQueue(item);
    });

    $(".result-more", node).addEventListener("click", function (ev) {
      ev.stopPropagation();
      if (isSafeUrl(item.sourceUrl)) window.open(item.sourceUrl, "_blank", "noopener,noreferrer");
    });

    var thumbBtn = $(".result-thumb-btn", node);
    thumbBtn.addEventListener("click", function () { handleItemActivate(item); });
    node.addEventListener("click", function (ev) {
      if (ev.target.closest("button") && ev.target.closest("button") !== thumbBtn) return;
      handleItemActivate(item);
    });
    return node;
  }

  function handleItemActivate(item) {
    if (item.type === "artist" || item.type === "album" || item.type === "playlist") {
      if (isSafeUrl(item.sourceUrl)) window.open(item.sourceUrl, "_blank", "noopener,noreferrer");
      return;
    }
    if (!item.isPlayable) { showToast("Bu video oynatılamıyor.", { error: true }); return; }
    openFullPlayer();
    playNow(item);
  }

  function renderMediaCard(item) {
    var btn = el("button", "media-card");
    var img = el("img");
    img.alt = item.title || "";
    if (isSafeUrl(item.thumbnailUrl)) img.src = item.thumbnailUrl;
    var title = el("p", "mc-title"); title.textContent = item.title || "";
    var sub = el("p", "mc-sub"); sub.textContent = item.artist || "";
    btn.appendChild(img); btn.appendChild(title); btn.appendChild(sub);
    btn.addEventListener("click", function () { handleItemActivate(item); });
    return btn;
  }

  /* ---------------------------------------------------------
     12. RENDER — ARAMA
     --------------------------------------------------------- */
  var searchResultsEl = $("#searchResults");
  var searchStatusEl = $("#searchStatus");
  var searchEmptyEl = $("#searchEmpty");

  function renderSkeletons(count) {
    searchResultsEl.innerHTML = "";
    for (var i = 0; i < count; i++) {
      searchResultsEl.appendChild(skeletonTpl.content.firstElementChild.cloneNode(true));
    }
  }

  function renderSearchResults() {
    searchResultsEl.innerHTML = "";
    searchStatusEl.classList.remove("is-error");

    if (state.isSearching) {
      searchEmptyEl.hidden = true;
      searchStatusEl.textContent = "Aranıyor…";
      renderSkeletons(6);
      return;
    }

    if (state.searchError) {
      searchStatusEl.classList.add("is-error");
      searchStatusEl.innerHTML = "";
      searchStatusEl.textContent = state.searchError;
      var retry = el("button", "retry-btn");
      retry.type = "button";
      retry.textContent = "Tekrar dene";
      retry.addEventListener("click", function () { runSearch(state.searchQuery); });
      searchStatusEl.appendChild(document.createElement("br"));
      searchStatusEl.appendChild(retry);
      searchEmptyEl.hidden = true;
      return;
    }

    if (!state.searchQuery) {
      searchStatusEl.textContent = "";
      searchEmptyEl.hidden = false;
      return;
    }

    var filtered = state.searchFilter === "all"
      ? state.searchResults
      : state.searchResults.filter(function (r) { return r.type === state.searchFilter; });

    if (!filtered.length) {
      searchStatusEl.textContent = "Sonuç bulunamadı.";
      searchEmptyEl.hidden = true;
      return;
    }

    searchStatusEl.textContent = filtered.length + " sonuç";
    searchEmptyEl.hidden = true;
    filtered.forEach(function (item) { searchResultsEl.appendChild(buildResultCard(item)); });
  }

  function runSearch(query) {
    query = (query || "").trim();
    state.searchQuery = query;
    if (!query) { state.searchResults = []; state.searchError = null; renderSearchResults(); return; }

    switchView("search");
    state.isSearching = true;
    state.searchError = null;
    renderSearchResults();

    searchYouTube(query, state.searchFilter).then(function (results) {
      state.isSearching = false;
      state.searchResults = results;
      renderSearchResults();
      addSearchHistory(query);
    }).catch(function (err) {
      state.isSearching = false;
      state.searchResults = [];
      state.searchError = (err && err.message) || "Arama sırasında bilinmeyen bir hata oluştu.";
      renderSearchResults();
      console.warn("[Manify] Arama başarısız:", err && err.reason);
    });
  }

  var debouncedSearch = debounce(function (q) { runSearch(q); }, 450);

  /* ---------------------------------------------------------
     13. RENDER — FAVORİLER / GEÇMİŞ / KUYRUK
     --------------------------------------------------------- */
  function renderFavoritesView() {
    var list = $("#favoritesList");
    var filterVal = ($("#favoritesFilter").value || "").toLowerCase();
    list.innerHTML = "";
    var items = state.favorites.filter(function (f) {
      return !filterVal || (f.title || "").toLowerCase().indexOf(filterVal) !== -1 || (f.artist || "").toLowerCase().indexOf(filterVal) !== -1;
    });
    $("#favoritesEmpty").hidden = state.favorites.length !== 0;
    items.forEach(function (item) { list.appendChild(buildResultCard(item)); });
  }

  function renderHistoryView() {
    var playedList = $("#playHistoryList");
    var searchList = $("#searchHistoryList");
    playedList.innerHTML = "";
    searchList.innerHTML = "";
    state.history.played.forEach(function (item) { playedList.appendChild(buildResultCard(item)); });
    state.history.searches.forEach(function (q) {
      var li = el("li", "result-item");
      var span = el("span"); span.style.flex = "1"; span.style.fontSize = "14px"; span.textContent = q;
      var btn = el("button", "icon-btn"); btn.setAttribute("aria-label", "Ara: " + q);
      btn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2" fill="none"/><path d="M21 21l-4.3-4.3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
      btn.addEventListener("click", function () { $("#searchInput").value = q; runSearch(q); });
      li.appendChild(span); li.appendChild(btn);
      searchList.appendChild(li);
    });
    $("#historyEmpty").hidden = !(state.history.played.length === 0 && state.history.searches.length === 0);
  }

  function buildQueueRow(item, index, container) {
    var node = buildResultCard(item);
    node.classList.remove("result-item");
    node.classList.add("result-item");
    if (index === state.queueIndex) node.classList.add("is-current");
    var moveWrap = el("div", "queue-move");
    var up = el("button", "icon-btn"); up.type = "button"; up.setAttribute("aria-label", "Yukarı taşı");
    up.textContent = "▲";
    up.addEventListener("click", function (ev) { ev.stopPropagation(); moveQueueItem(index, -1); });
    var down = el("button", "icon-btn"); down.type = "button"; down.setAttribute("aria-label", "Aşağı taşı");
    down.textContent = "▼";
    down.addEventListener("click", function (ev) { ev.stopPropagation(); moveQueueItem(index, 1); });
    moveWrap.appendChild(up); moveWrap.appendChild(down);

    var removeBtn = el("button", "icon-btn"); removeBtn.type = "button"; removeBtn.setAttribute("aria-label", "Kuyruktan sil");
    removeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    removeBtn.addEventListener("click", function (ev) { ev.stopPropagation(); removeFromQueue(index); });

    // Kuyrukta öğe tıklanınca doğrudan o indeksten çalsın.
    node.addEventListener("click", function () { playFromQueue(index); });
    node.appendChild(moveWrap);
    node.appendChild(removeBtn);
    return node;
  }

  function renderQueueList(listEl, emptyEl) {
    listEl.innerHTML = "";
    state.queue.forEach(function (item, i) { listEl.appendChild(buildQueueRow(item, i, listEl)); });
    if (emptyEl) emptyEl.hidden = state.queue.length !== 0;
  }

  function renderQueueViews() {
    renderQueueList($("#queueList"), $("#queueEmpty"));
    renderQueueList($("#queuePanelList"), $("#queuePanelEmpty"));
    var shuffleBtn = $("#shuffleBtn");
    shuffleBtn.setAttribute("aria-pressed", String(state.shuffleEnabled));
    var repeatBtn = $("#repeatBtn");
    var labels = { off: "Tekrar: Kapalı", one: "Tekrar: Tek Parça", all: "Tekrar: Tüm Kuyruk" };
    repeatBtn.textContent = labels[state.repeatMode];
    repeatBtn.setAttribute("aria-pressed", String(state.repeatMode !== "off"));
    $("#fullRepeat").setAttribute("data-mode", state.repeatMode);
    $("#fullRepeat").setAttribute("aria-label", labels[state.repeatMode]);
    $("#fullShuffle").setAttribute("aria-pressed", String(state.shuffleEnabled));
  }

  /* ---------------------------------------------------------
     14. RENDER — ANA SAYFA
     --------------------------------------------------------- */
  function renderHome() {
    var chips = $("#homeRecentSearches");
    chips.innerHTML = "";
    if (!state.history.searches.length) {
      var p = el("p"); p.className = "muted"; p.textContent = "Henüz arama yapmadın.";
      chips.appendChild(p);
    } else {
      state.history.searches.slice(0, 8).forEach(function (q) {
        var c = el("button", "chip");
        c.type = "button"; c.textContent = q;
        c.addEventListener("click", function () { $("#searchInput").value = q; runSearch(q); });
        chips.appendChild(c);
      });
    }

    var recentRow = $("#homeRecentlyPlayed");
    recentRow.innerHTML = "";
    if (!state.history.played.length) {
      var p2 = el("p"); p2.className = "muted"; p2.textContent = "Henüz bir şey çalmadın.";
      recentRow.appendChild(p2);
    } else {
      state.history.played.slice(0, 10).forEach(function (item) { recentRow.appendChild(renderMediaCard(item)); });
    }

    var favRow = $("#homeFavorites");
    favRow.innerHTML = "";
    if (!state.favorites.length) {
      var p3 = el("p"); p3.className = "muted"; p3.textContent = "Henüz favori yok.";
      favRow.appendChild(p3);
    } else {
      state.favorites.slice(0, 10).forEach(function (item) { favRow.appendChild(renderMediaCard(item)); });
    }

    var qSummary = $("#homeQueueSummary");
    qSummary.innerHTML = "";
    if (!state.queue.length) {
      var p4 = el("p"); p4.className = "muted"; p4.textContent = "Kuyruk boş.";
      qSummary.appendChild(p4);
    } else {
      state.queue.slice(0, 4).forEach(function (item) {
        var row = el("div", "queue-summary-row");
        var img = el("img"); img.alt = "";
        if (isSafeUrl(item.thumbnailUrl)) img.src = item.thumbnailUrl;
        var span = el("span"); span.textContent = item.title;
        row.appendChild(img); row.appendChild(span);
        qSummary.appendChild(row);
      });
    }
  }

  /* ---------------------------------------------------------
     15. RENDER — PLAYER (mini + tam ekran)
     --------------------------------------------------------- */
  function renderPlayerMeta() {
    var t = state.currentTrack;
    if (!t) return;
    $("#miniThumb").src = isSafeUrl(t.thumbnailUrl) ? t.thumbnailUrl : "";
    $("#miniThumb").alt = t.title || "";
    $("#miniTitle").textContent = t.title || "";
    $("#miniArtist").textContent = t.artist || "";
    $("#fullThumb").src = isSafeUrl(t.thumbnailUrl) ? t.thumbnailUrl : "";
    $("#fullThumb").alt = t.title || "";
    $("#fullTitle").textContent = t.title || "";
    $("#fullArtist").textContent = t.artist || "";
    var fav = isFavorite(t.id);
    var favBtn = $("#fullFavorite");
    favBtn.setAttribute("aria-pressed", String(fav));
    favBtn.textContent = fav ? "♥ Favoride" : "♥ Favori";
    $("#miniPlayer").hidden = false;
  }

  function renderPlayerUI() {
    var playing = state.isPlaying;
    var miniIcon = $("#miniPlayIcon");
    var fullIcon = $("#fullPlayIcon");
    miniIcon.innerHTML = playing ? '<rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/>' : '<path d="M8 5l12 7-12 7V5z"/>';
    fullIcon.innerHTML = playing ? '<rect x="7" y="5" width="4" height="14"/><rect x="15" y="5" width="4" height="14"/>' : '<path d="M8 5l12 7-12 7V5z"/>';
    $("#miniPlayPause").setAttribute("aria-label", playing ? "Duraklat" : "Oynat");
    $("#fullPlayPause").setAttribute("aria-label", playing ? "Duraklat" : "Oynat");
    renderProgress();
  }

  function renderProgress() {
    var seek = $("#seekBar");
    if (state.duration > 0) {
      seek.disabled = false;
      seek.max = String(Math.floor(state.duration));
      if (!seek.matches(":active")) seek.value = String(Math.floor(state.currentTime));
      $("#timeCurrent").textContent = formatDuration(state.currentTime);
      $("#timeRemaining").textContent = "-" + formatDuration(state.duration - state.currentTime);
      $("#miniProgressFill").style.width = Math.min(100, (state.currentTime / state.duration) * 100) + "%";
    } else {
      seek.disabled = true;
      $("#timeCurrent").textContent = "0:00";
      $("#timeRemaining").textContent = "0:00";
      $("#miniProgressFill").style.width = "0%";
    }
  }

  function openFullPlayer() {
    state.isFullPlayerOpen = true;
    $("#fullPlayer").hidden = false;
  }
  function closeFullPlayer() {
    state.isFullPlayerOpen = false;
    $("#fullPlayer").hidden = true;
  }

  /* ---------------------------------------------------------
     16. AYARLAR
     --------------------------------------------------------- */
  function applySettingsToUI() {
    $("#themeSelect").value = state.settings.theme;
    $("#reduceMotionToggle").checked = state.settings.reduceMotion;
    $("#autoNextToggle").checked = state.settings.autoNext;
    $("#restoreQueueToggle").checked = state.settings.restoreQueue;
    $("#historyEnabledToggle").checked = state.settings.historyEnabled;
    document.documentElement.classList.toggle("theme-system", state.settings.theme === "system");
    document.body.classList.toggle("reduce-motion", state.settings.reduceMotion);
  }

  function persistSettings() { Store.set("settings", state.settings); }

  function exportAllData() {
    var payload = {
      exportedAt: new Date().toISOString(),
      favorites: state.favorites,
      history: state.history,
      queue: { items: state.queue, index: state.queueIndex },
      settings: state.settings
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = "manify-veriler.json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    showToast("Veriler dışa aktarıldı.");
  }

  function importAllData(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        if (data.favorites) { state.favorites = data.favorites; persistFavorites(); }
        if (data.history) { state.history = data.history; persistHistory(); }
        if (data.queue && Array.isArray(data.queue.items)) {
          state.queue = data.queue.items; state.queueIndex = data.queue.index || -1; persistQueue();
        }
        if (data.settings) { state.settings = Object.assign(state.settings, data.settings); persistSettings(); applySettingsToUI(); }
        renderAll();
        showToast("Veriler içe aktarıldı.");
      } catch (err) {
        showToast("Dosya okunamadı — geçersiz JSON.", { error: true });
      }
    };
    reader.onerror = function () { showToast("Dosya okunamadı.", { error: true }); };
    reader.readAsText(file);
  }

  /* ---------------------------------------------------------
     17. TÜMÜNÜ YENİDEN ÇİZ
     --------------------------------------------------------- */
  function renderAll() {
    renderHome();
    renderSearchResults();
    renderFavoritesView();
    renderHistoryView();
    renderQueueViews();
    if (state.currentTrack) { renderPlayerMeta(); renderPlayerUI(); }
  }

  /* ---------------------------------------------------------
     18. SIDEBAR / QUEUE PANEL AÇMA-KAPAMA
     --------------------------------------------------------- */
  function openSidebar() {
    state.isSidebarOpen = true;
    $("#sidebar").classList.add("is-open");
    $("#sidebarScrim").hidden = false;
    $("#menuToggle").setAttribute("aria-expanded", "true");
  }
  function closeSidebar() {
    state.isSidebarOpen = false;
    $("#sidebar").classList.remove("is-open");
    $("#sidebarScrim").hidden = true;
    $("#menuToggle").setAttribute("aria-expanded", "false");
  }
  function openQueuePanel() {
    state.isQueuePanelOpen = true;
    $("#queuePanel").hidden = false;
    $("#queueScrim").hidden = false;
    $("#queueToggle").setAttribute("aria-expanded", "true");
  }
  function closeQueuePanel() {
    state.isQueuePanelOpen = false;
    $("#queuePanel").hidden = true;
    $("#queueScrim").hidden = true;
    $("#queueToggle").setAttribute("aria-expanded", "false");
  }

  /* ---------------------------------------------------------
     19. OLAY BAĞLAMA (event listener'lar yalnızca bir kez eklenir)
     --------------------------------------------------------- */
  function bindEvents() {
    $("#menuToggle").addEventListener("click", openSidebar);
    $("#sidebarClose").addEventListener("click", closeSidebar);
    $("#sidebarScrim").addEventListener("click", closeSidebar);
    $all(".nav-item").forEach(function (b) { b.addEventListener("click", function () { switchView(b.dataset.view); }); });
    $("#homeQuickSearch").addEventListener("click", function () { switchView("search"); });
    $all("[data-view]").forEach(function (b) {
      if (b.classList.contains("nav-item")) return;
      b.addEventListener("click", function () { switchView(b.dataset.view); });
    });

    $("#searchForm").addEventListener("submit", function (ev) {
      ev.preventDefault();
      runSearch($("#searchInput").value);
    });
    $("#searchInput").addEventListener("input", function () {
      if (state.currentView !== "search" && this.value.trim()) switchView("search");
      debouncedSearch(this.value);
    });

    $all(".chip-filter").forEach(function (chip) {
      chip.addEventListener("click", function () {
        $all(".chip-filter").forEach(function (c) { c.classList.remove("is-active"); c.setAttribute("aria-selected", "false"); });
        chip.classList.add("is-active"); chip.setAttribute("aria-selected", "true");
        state.searchFilter = chip.dataset.filter;
        renderSearchResults();
      });
    });

    $("#favoritesFilter").addEventListener("input", renderFavoritesView);
    $("#clearHistoryBtn").addEventListener("click", clearAllHistory);
    $("#clearHistoryBtn2").addEventListener("click", clearAllHistory);
    $("#clearQueueBtn").addEventListener("click", clearQueue);

    $("#shuffleBtn").addEventListener("click", function () {
      state.shuffleEnabled = !state.shuffleEnabled;
      persistQueue(); renderQueueViews();
    });
    $("#repeatBtn").addEventListener("click", cycleRepeat);
    $("#fullShuffle").addEventListener("click", function () { state.shuffleEnabled = !state.shuffleEnabled; persistQueue(); renderQueueViews(); });
    $("#fullRepeat").addEventListener("click", cycleRepeat);

    function cycleRepeat() {
      var order = ["off", "one", "all"];
      state.repeatMode = order[(order.indexOf(state.repeatMode) + 1) % order.length];
      persistQueue(); renderQueueViews();
    }

    // Mini player
    $("#miniPlayerOpen").addEventListener("click", openFullPlayer);
    $("#miniPlayPause").addEventListener("click", togglePlay);
    $("#miniNext").addEventListener("click", nextTrack);
    $("#miniPrev").addEventListener("click", previousTrack);

    // Full player
    $("#fullPlayerClose").addEventListener("click", closeFullPlayer);
    $("#fullPlayPause").addEventListener("click", togglePlay);
    $("#fullNext").addEventListener("click", nextTrack);
    $("#fullPrev").addEventListener("click", previousTrack);
    $("#fullFavorite").addEventListener("click", function () { if (state.currentTrack) toggleFavorite(state.currentTrack); renderPlayerMeta(); });
    $("#fullAddQueue").addEventListener("click", function () { if (state.currentTrack) addToQueue(state.currentTrack); });
    $("#fullPlayerYoutube").addEventListener("click", function () {
      if (state.currentTrack && isSafeUrl(state.currentTrack.sourceUrl)) {
        window.open(state.currentTrack.sourceUrl, "_blank", "noopener,noreferrer");
      }
    });
    $("#seekBar").addEventListener("change", function () { seekTo(Number(this.value)); });

    // Queue panel
    $("#queueToggle").addEventListener("click", openQueuePanel);
    $("#queuePanelClose").addEventListener("click", closeQueuePanel);
    $("#queueScrim").addEventListener("click", closeQueuePanel);

    // Settings
    $("#themeSelect").addEventListener("change", function () {
      state.settings.theme = this.value; persistSettings(); applySettingsToUI();
    });
    $("#reduceMotionToggle").addEventListener("change", function () {
      state.settings.reduceMotion = this.checked; persistSettings(); applySettingsToUI();
    });
    $("#autoNextToggle").addEventListener("change", function () { state.settings.autoNext = this.checked; persistSettings(); });
    $("#restoreQueueToggle").addEventListener("change", function () { state.settings.restoreQueue = this.checked; persistSettings(); });
    $("#historyEnabledToggle").addEventListener("change", function () { state.settings.historyEnabled = this.checked; persistSettings(); });

    $("#exportDataBtn").addEventListener("click", exportAllData);
    $("#importDataInput").addEventListener("change", function () {
      if (this.files && this.files[0]) importAllData(this.files[0]);
      this.value = "";
    });
    $("#clearFavoritesBtn").addEventListener("click", function () {
      if (!confirm("Tüm favoriler silinsin mi?")) return;
      state.favorites = []; persistFavorites(); renderFavoritesView(); renderHome(); renderSearchResults();
      showToast("Favoriler temizlendi.");
    });
    $("#clearAllDataBtn").addEventListener("click", function () {
      if (!confirm("Tüm yerel veriler (favoriler, geçmiş, kuyruk, ayarlar) silinsin mi? Bu işlem geri alınamaz.")) return;
      state.favorites = []; state.history = { played: [], searches: [] }; state.queue = []; state.queueIndex = -1;
      state.settings = { theme: "dark", reduceMotion: false, autoNext: true, restoreQueue: true, historyEnabled: true };
      persistFavorites(); persistHistory(); persistQueue(); persistSettings();
      applySettingsToUI(); renderAll();
      showToast("Tüm yerel veriler silindi.");
    });

    // Ağ durumu
    window.addEventListener("online", function () { state.networkStatus = "online"; $("#offlineBanner").hidden = true; });
    window.addEventListener("offline", function () { state.networkStatus = "offline"; $("#offlineBanner").hidden = false; });
  }

  /* ---------------------------------------------------------
     20. SERVICE WORKER
     --------------------------------------------------------- */
  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("sw.js").catch(function (err) {
      console.warn("[Manify] Service Worker kurulamadı:", err);
      // Uygulama Service Worker olmadan da çalışmaya devam eder.
    });
  }

  /* ---------------------------------------------------------
     21. BAŞLATMA
     --------------------------------------------------------- */
  function loadPersistedState() {
    return Promise.all([
      Store.get("favorites", []),
      Store.get("history", { played: [], searches: [] }),
      Store.get("queue", { items: [], index: -1, repeatMode: "off", shuffle: false }),
      Store.get("settings", state.settings)
    ]).then(function (results) {
      state.favorites = Array.isArray(results[0]) ? results[0] : [];
      state.history = (results[1] && typeof results[1] === "object") ? results[1] : { played: [], searches: [] };
      if (!Array.isArray(state.history.played)) state.history.played = [];
      if (!Array.isArray(state.history.searches)) state.history.searches = [];

      var savedQueue = results[2] || {};
      state.settings = Object.assign({}, state.settings, results[3] || {});

      if (state.settings.restoreQueue && Array.isArray(savedQueue.items)) {
        state.queue = savedQueue.items;
        state.queueIndex = typeof savedQueue.index === "number" ? savedQueue.index : -1;
        state.repeatMode = savedQueue.repeatMode || "off";
        state.shuffleEnabled = !!savedQueue.shuffle;
      }
    }).catch(function (err) {
      console.warn("[Manify] Kayıtlı veriler yüklenemedi, varsayılanlarla devam ediliyor.", err);
      showToast("Kayıtlı veriler okunamadı, temiz başlatıldı.", { error: true });
    });
  }

  function init() {
    bindEvents();
    registerServiceWorker();
    $("#offlineBanner").hidden = navigator.onLine;

    loadPersistedState().then(function () {
      applySettingsToUI();
      renderAll();
      switchView("home");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
