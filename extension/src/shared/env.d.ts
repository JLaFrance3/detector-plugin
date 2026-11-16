/** True in `--dev` builds; replaced at build time by esbuild (scripts/build.mjs). */
declare const __DEV__: boolean;

/**
 * Base URL of the second-opinion backend, set at build time from the AID_BACKEND_URL
 * environment variable. Empty when the build has no backend (REQ-NF-002).
 */
declare const __BACKEND_URL__: string;
