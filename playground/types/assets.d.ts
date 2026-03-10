declare module '*.css' {
  const content: string;
  export default content;
}

// CDN-loaded CodeMirror modules (runtime imports from esm.sh)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare module 'https://esm.sh/*' {
  const mod: any;
  export = mod;
}
