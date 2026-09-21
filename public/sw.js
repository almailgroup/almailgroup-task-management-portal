/**
 * The service worker.
 *
 * It exists for two things the app could not do without it: behave like an
 * app when the connection drops, and be able to buzz the phone it is
 * installed on.
 *
 * What it deliberately does NOT do is cache pages. Every page here is
 * somebody's private workspace, and a cache is shared by everyone who uses
 * the device: cache /today and the next person to open the app on a shared
 * phone reads it, signed in or not. So only two things are kept — the
 * offline page and the immutable build assets — and a page is always
 * fetched from the network.
 *
 * Bumping CACHE retires everything from the previous one on activate.
 */
const CACHE = "almail-v1";
const OFFLINE_URL = "/offline";

/** Immutable, content-hashed, and safe to serve to anybody. */
const CACHEABLE = [/^\/_next\/static\//, /^\/icon-\d+\.png$/, /^\/icon\.svg$/];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // `reload` so an update is not itself served from the HTTP cache.
      await cache.add(new Request(OFFLINE_URL, { cache: "reload" }));
      // A new worker should take over at the next navigation rather than
      // waiting for every tab to close; nothing here is version-coupled to
      // the page.
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name !== CACHE) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // A page: always from the network, and the offline page when there is
  // none. `preloadResponse` is the navigation the browser started before
  // this worker woke up; ignoring it would throw that work away.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const preloaded = await event.preloadResponse;
          if (preloaded) return preloaded;
          return await fetch(request);
        } catch {
          const cache = await caches.open(CACHE);
          const offline = await cache.match(OFFLINE_URL);
          return (
            offline ??
            new Response("Offline", { status: 503, headers: { "content-type": "text/plain" } })
          );
        }
      })(),
    );
    return;
  }

  if (!CACHEABLE.some((pattern) => pattern.test(url.pathname))) return;

  // Content-hashed: if it is in the cache it is still correct.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(request);
      if (hit) return hit;

      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    })(),
  );
});

/**
 * A reminder, arriving while the app is closed.
 *
 * The payload is what the dispatcher encrypted for this device. A push with
 * no payload still shows something rather than nothing: a silent push that
 * displays no notification costs the site its permission on some browsers.
 */
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "Almailgroup";
  const options = {
    body: payload.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    // Same tag replaces rather than stacks: three reminders about one task
    // should be one line in the shade, not three.
    tag: payload.tag || "almail",
    data: { url: payload.url || "/today" },
    lang: payload.lang || "en",
    dir: payload.dir || "auto",
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/today";

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Reuse the window that is already open rather than stacking another.
      for (const client of clients) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(target);
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
