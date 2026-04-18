/// <reference types="vite/client" />

// Build identifier injected by Vite at build time. Used by the deploy watcher
// to detect when a newer build has been shipped.
declare const __BUILD_ID__: string;
