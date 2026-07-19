// Vendor shim: svg2pdf.js declares jspdf as a peer dependency, so bundling it
// standalone would inline a private jsPDF copy the app can't construct. This
// entry re-exports both from one module so esbuild resolves a single shared
// jsPDF instance in the bundled output (public/vendor/pdf-export.js).
export { jsPDF } from 'jspdf';
export { svg2pdf } from 'svg2pdf.js';
