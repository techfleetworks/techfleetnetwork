/**
 * Custom Service Worker push event handler.
 * This file is imported by vite-plugin-pwa's generated SW.
 *
 * Handles:
 * - push: display notification
 * - notificationclick: open/focus the app at the notification URL
 */

// Listen for push events
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: "Tech Fleet", body: event.data.text() };
  }

  const title = data.title || "Tech Fleet Notification";
  const options = {
    body: data.body || "",
    icon: data.icon || "/pwa-192x192.png",
    badge: data.badge || "/pwa-192x192.png",
    tag: data.notification_type || "general",
    data: {
      url: data.url || "/dashboard",
    },
    // Renotify if same tag so user sees new notifications of same type
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Handle notification click — open/focus the app
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const urlPath = event.notification.data?.url || "/dashboard";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // If the app is already open, focus it and navigate
        for (const client of clientList) {
          if ("focus" in client) {
            client.focus();
            client.navigate(urlPath);
            return;
          }
        }
        // Otherwise open a new window
        if (self.clients.openWindow) {
          return self.clients.openWindow(urlPath);
        }
      }),
  );
});
