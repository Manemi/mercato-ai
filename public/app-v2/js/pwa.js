if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/app-v2/sw.js').catch(() => {});
  });
}
