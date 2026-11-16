// Text assets bundled by esbuild's "text" loader (scripts/build.mjs).
declare module '*.pem' {
  const text: string;
  export default text;
}

declare module '*.cfg' {
  const text: string;
  export default text;
}
