if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/app-v3/sw.js', { updateViaCache: 'none' }).catch(() => {});
  });
}
