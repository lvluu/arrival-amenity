// Registers the service worker and shows the update bar when a new version is waiting.
// The app checks for a new version on start, whenever it comes back to the screen, and every 30 minutes.
export async function watchUpdates(bar: HTMLElement, button: HTMLButtonElement): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.register("sw.js");
  // Reload only after "Update": on a first visit the new worker also takes control (clients.claim), and a reload
  // then would throw away a report that is still being read.
  let updating = false;
  const offer = (waiting: ServiceWorker) => {
    bar.hidden = false;
    button.onclick = () => {
      button.disabled = true;
      updating = true;
      waiting.postMessage("skipWaiting");
    };
  };
  if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
  reg.addEventListener("updatefound", () => {
    const next = reg.installing;
    next?.addEventListener("statechange", () => {
      if (next.state === "installed" && navigator.serviceWorker.controller) offer(next);
    });
  });
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!updating) return;
    updating = false;
    location.reload(); // the last report reopens from this device
  });
  const check = () => reg.update().catch(() => {}); // offline: try again later
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") check();
  });
  setInterval(check, 30 * 60 * 1000);
}
