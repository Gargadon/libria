/** Mammoth's browser bundle exposes the same API as its typed Node entry point. */
declare module 'mammoth/mammoth.browser' {
  import mammoth = require('mammoth');
  export = mammoth;
}
