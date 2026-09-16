/* =========================================================
   MANIFY — sw.js
   Yalnızca uygulama kabuğunu (app shell) önbelleğe alır.
   YouTube medya akışları veya API yanıtları KESİNLİKLE cache'lenmez.
   ========================================================= */

var CACHE_VERSION = "manify-shell-v1";

var APP_SHELL_FILES = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.svg",
  "./icons/icon-512.svg",
  "./icons/apple-touch-icon.svg"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(function (cache) { return cache.addAll(APP_SHELL_FILES); })
      .catch(function (err) {
        // Kurulum bir dosya eksik olsa bile tamamen başarısız olmamalı.
        console.warn("[Manify SW] Bazı dosyalar önbelleğe alınamadı:", err);
      })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (key) { return key !== CACHE_VERSION; })
          .map(function (key) { return caches.delete(key); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  var url = new URL(event.request.url);

  // Yalnızca kendi origin'imizden gelen GET isteklerini yönetiyoruz.
  // YouTube, Google veya başka cross-origin istekler (arama, IFrame player,
  // medya akışları) asla bu Service Worker tarafından cache'lenmez veya
  // engellenmez — tarayıcıya doğrudan bırakılır.
  if (event.request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(function (cached) {
      if (cached) return cached;
      return fetch(event.request).then(function (response) {
        // Uygulama kabuğu dosyalarını fırsatçı biçimde güncel tut.
        if (response && response.ok) {
          var clone = response.clone();
          caches.open(CACHE_VERSION).then(function (cache) { cache.put(event.request, clone); });
        }
        return response;
      }).catch(function () {
        // Çevrimdışı ve önbellekte yoksa: ana sayfaya düş (app-shell fallback).
        if (event.request.mode === "navigate") {
          return caches.match("./index.html");
        }
        return new Response("", { status: 504, statusText: "Offline" });
      });
    })
  );
});
