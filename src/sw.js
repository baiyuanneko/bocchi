const cacheName = 'cache_v1';

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(cacheName).then((cache) => {
            return cache.addAll([
                '/bootstrap.min.css',
                '/{{BUNDLED_JS_FILENAME}}',
                '/icon.png',
                '/manifest.json',
                '/tesseract-worker.js',
                '/tesseract-core.wasm',
                '/tesseract-core-fallback.wasm'
            ]);
        })
    );
});


self.addEventListener('fetch', (event) => {
    if (event.request.mode === 'navigate') {
        event.respondWith(
            caches.open(cacheName).then((cache) => {
                return fetch(event.request).then((fetchedResponse) => {
                    cache.put(event.request, fetchedResponse.clone());
                    return fetchedResponse;
                }).catch(() => {
                    return cache.match(event.request);
                });
            })
        );
    } else {
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                return cachedResponse || fetch(event.request);
            })
        );
    }
});
