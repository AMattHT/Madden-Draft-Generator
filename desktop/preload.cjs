/**
 * The only bridge between the update logic in the main process and the styled
 * banner in the page.
 *
 * The window runs with contextIsolation on and nodeIntegration off, so the page
 * cannot reach electron at all -- which is what we want, since it is served over
 * HTTP by the local API. This exposes four named calls and nothing else: no
 * ipcRenderer, no channel names, no way for page script to reach a channel this
 * file does not list.
 */
const { contextBridge, ipcRenderer } = require('electron');

const CHANNEL = 'update:state';

contextBridge.exposeInMainWorld('desktopUpdater', {
  /** Subscribe to update state. Returns an unsubscribe function. */
  subscribe(cb) {
    const handler = (_event, state) => cb(state);
    ipcRenderer.on(CHANNEL, handler);
    return () => ipcRenderer.removeListener(CHANNEL, handler);
  },
  /** Current state, for a page that loaded after the check already ran. */
  current: () => ipcRenderer.invoke('update:current'),
  /** Check now (the banner's retry / manual check). */
  check: () => ipcRenderer.invoke('update:check'),
  /** Quit and install a downloaded update. */
  install: () => ipcRenderer.invoke('update:install'),
  /** Portable builds cannot replace themselves; open the releases page. */
  openReleases: () => ipcRenderer.invoke('update:open-releases'),
});
