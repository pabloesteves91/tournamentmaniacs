const CACHE_NAME = "maniacs-tcg-v1";
const getBasePath = () => {
  const scope = self.registration?.scope ?? "/";
  const url = new URL(scope);
  return url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
};

self.addEventListener("install", (event) => {
  const base = getBasePath();
  const urlsToCache = [base, `${base}index.html`, `${base}manifest.webmanifest`, `${base}logo.png`];
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache)));
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(event.request)
        .then((response) => {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
          return response;
        })
        .catch(() => caches.match(`${getBasePath()}index.html`));
    }),
  );
});
