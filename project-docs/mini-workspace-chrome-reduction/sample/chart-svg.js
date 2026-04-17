// Shared SVG + source asset for all mini-workspace chrome explorations.
// Loaded by each prototype via <script src="../sample/chart-svg.js"></script>.
// Works over file:// (no fetch/CORS required).

window.CHART_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 700" preserveAspectRatio="xMidYMid meet">
  <style>
    @property --bg-color { syntax: "<color>"; inherits: true; initial-value: #f6efe6; }
    @property --bar-all  { syntax: "<color>"; inherits: true; initial-value: #cc3333; }
    @property --bar-top  { syntax: "<color>"; inherits: true; initial-value: #1a1a2e; }
  </style>
  <g id="all">
    <path id="bg" d="M 0 0 L 700 0 L 700 700 L 0 700 Z" fill="var(--bg-color, #f6efe6)" stroke="none"/>
    <path id="grid" d="M 274.44 360 A 75.56 75.56 0 1 1 425.56 360 A 75.56 75.56 0 1 1 274.44 360 M 218.89 360 A 131.11 131.11 0 1 1 481.11 360 A 131.11 131.11 0 1 1 218.89 360" fill="none" stroke="#d4c9b8" stroke-width="0.5" stroke-dasharray="3 4"/>
    <path id="center" d="M 330 360 A 20 20 0 1 1 370 360 A 20 20 0 1 1 330 360" fill="none" stroke="#d4c9b8" stroke-width="0.6"/>
    <path id="bars-all" d="M 350 360 m -19.72 -3.33 a 20 20 0 0 1 3.48 -8.34 a 4 4 0 0 0 -0.64 -5.39 l -116.29 -117.52 a 4 4 0 0 0 -5.69 0.06 a 193.33 193.33 0 0 0 -54.43 130.43 a 4 4 0 0 0 3.96 4.08 l 165.33 0 a 4 4 0 0 0 4.28 -3.33 z M 350 360 m -11.59 -16.3 a 20 20 0 0 1 8.36 -3.44 a 4 4 0 0 0 3.36 -4.26 l 0.76 -145.33 a 4 4 0 0 0 -4.07 -3.97 a 173.33 173.33 0 0 0 -116.45 47.88 a 4 4 0 0 0 -0.1 5.69 l 102.77 102.77 a 4 4 0 0 0 5.38 0.67 z M 350 360 m 3.33 -19.72 a 20 20 0 0 1 8.34 3.48 a 4 4 0 0 0 5.39 -0.64 l 64.6 -63.93 a 4 4 0 0 0 -0.12 -5.71 a 118.89 118.89 0 0 0 -77.4 -32.3 a 4 4 0 0 0 -4.14 3.93 l 0 90.89 a 4 4 0 0 0 3.33 4.28 z M 350 360 m 16.3 -11.59 a 20 20 0 0 1 3.44 8.36 a 4 4 0 0 0 4.26 3.36 l 58.67 0.31 a 4 4 0 0 0 3.92 -4.17 a 86.67 86.67 0 0 0 -22.41 -54.51 a 4 4 0 0 0 -5.72 -0.21 l -41.48 41.48 a 4 4 0 0 0 -0.67 5.38 z M 350 360 m 19.72 3.33 a 20 20 0 0 1 -3.48 8.34 a 4 4 0 0 0 0.64 5.39 l 45.17 45.65 a 4 4 0 0 0 5.72 -0.17 a 92.22 92.22 0 0 0 24.35 -58.36 a 4 4 0 0 0 -3.91 -4.18 l -64.22 0 a 4 4 0 0 0 -4.28 3.33 z M 350 360 m 11.59 16.3 a 20 20 0 0 1 -8.36 3.44 a 4 4 0 0 0 -3.36 4.26 l -0.13 25.33 a 4 4 0 0 0 4.3 3.85 a 53.33 53.33 0 0 0 30.48 -12.53 a 4 4 0 0 0 0.35 -5.76 l -17.91 -17.91 a 4 4 0 0 0 -5.38 -0.67 z M 350 360 m -3.33 19.72 a 20 20 0 0 1 -8.34 -3.48 a 4 4 0 0 0 -5.39 0.64 l -16.43 16.26 a 4 4 0 0 0 0.34 5.77 a 51.11 51.11 0 0 0 28.81 12.02 a 4 4 0 0 0 4.34 -3.82 l 0 -23.11 a 4 4 0 0 0 -3.33 -4.28 z M 350 360 m -16.3 11.59 a 20 20 0 0 1 -3.44 -8.36 a 4 4 0 0 0 -4.26 -3.36 l -7.56 -0.04 a 4 4 0 0 0 -3.74 4.49 a 35.56 35.56 0 0 0 7.17 17.43 a 4 4 0 0 0 5.81 0.56 l 5.34 -5.34 a 4 4 0 0 0 0.67 -5.38 z" fill="var(--bar-all, #cc3333)" stroke="var(--bg-color, #f6efe6)" stroke-width="0.5"/>
    <path id="bars-top" d="M 350 360 m -18.68 -7.14 a 20 20 0 0 1 0.47 -1.12 a 4 4 0 0 0 -1.69 -5.16 l -63.39 -42.72 a 4 4 0 0 0 -5.57 1.26 a 104.44 104.44 0 0 0 -12.64 30.3 a 4 4 0 0 0 3.02 4.85 l 74.96 15.01 a 4 4 0 0 0 4.85 -2.43 z M 350 360 m -8.16 -18.26 a 20 20 0 0 1 1.12 -0.46 a 4 4 0 0 0 2.45 -4.84 l -3.14 -16.14 a 4 4 0 0 0 -5.04 -2.87 a 44.44 44.44 0 0 0 -8.09 3.33 a 4 4 0 0 0 -1.56 5.58 l 9.12 13.69 a 4 4 0 0 0 5.15 1.71 z M 350 360 m 7.14 -18.68 a 20 20 0 0 1 1.12 0.47 a 4 4 0 0 0 5.16 -1.69 l 30.92 -45.89 a 4 4 0 0 0 -1.31 -5.58 a 83.33 83.33 0 0 0 -22.56 -9.41 a 4 4 0 0 0 -4.88 2.99 l -10.87 54.26 a 4 4 0 0 0 2.43 4.85 z M 350 360 m 18.26 -8.16 a 20 20 0 0 1 0.46 1.12 a 4 4 0 0 0 4.84 2.45 l 97.94 -19.08 a 4 4 0 0 0 3.07 -4.81 a 127.78 127.78 0 0 0 -15.99 -38.9 a 4 4 0 0 0 -5.56 -1.26 l -83.03 55.32 a 4 4 0 0 0 -1.71 5.15 z M 350 360 m 18.68 7.14 a 20 20 0 0 1 -0.47 1.12 a 4 4 0 0 0 1.69 5.16 l 38.52 25.95 a 4 4 0 0 0 5.58 -1.34 a 74.44 74.44 0 0 0 8.05 -19.29 a 4 4 0 0 0 -2.97 -4.91 l -45.54 -9.12 a 4 4 0 0 0 -4.85 2.43 z M 350 360 m 8.16 18.26 a 20 20 0 0 1 -1.12 0.46 a 4 4 0 0 0 -2.45 4.84 l 7.61 39.04 a 4 4 0 0 0 4.91 2.98 a 67.78 67.78 0 0 0 16.86 -6.93 a 4 4 0 0 0 1.39 -5.57 l -22.06 -33.1 a 4 4 0 0 0 -5.15 -1.71 z M 350 360 m -7.14 18.68 a 20 20 0 0 1 -1.12 -0.47 a 4 4 0 0 0 -5.16 1.69 l -19.12 28.38 a 4 4 0 0 0 1.39 5.58 a 62.22 62.22 0 0 0 14.76 6.16 a 4 4 0 0 0 4.95 -2.94 l 6.72 -33.56 a 4 4 0 0 0 -2.43 -4.85 z M 350 360 m -18.26 8.16 a 20 20 0 0 1 -0.46 -1.12 a 4 4 0 0 0 -4.84 -2.45 l -18.32 3.57 a 4 4 0 0 0 -2.89 5.02 a 46.67 46.67 0 0 0 3.68 8.94 a 4 4 0 0 0 5.58 1.54 l 15.53 -10.35 a 4 4 0 0 0 1.71 -5.15 z" fill="var(--bar-top, #1a1a2e)" stroke="var(--bg-color, #f6efe6)" stroke-width="0.5"/>
    <text x="162.52" y="286.51" transform="rotate(382.5 162.52 286.51)" font-size="11" fill="#2f2f2f" font-family="Georgia, serif" font-weight="bold" text-anchor="end">Fantasy<tspan fill="var(--bar-all,#cc3333)" font-size="8.8"> · </tspan><tspan fill="var(--bar-all,#cc3333)" font-weight="normal" font-size="8.8">15.6%</tspan><tspan fill="var(--bar-top,#1a1a2e)" font-size="8.8"> · </tspan><tspan fill="var(--bar-top,#1a1a2e)" font-weight="normal" font-size="8.8">7.6%</tspan></text>
    <text x="277.05" y="193.94" transform="rotate(427.5 277.05 193.94)" font-size="11" fill="#2f2f2f" font-family="Georgia, serif" font-weight="bold" text-anchor="end">Wargame<tspan fill="var(--bar-all,#cc3333)" font-size="8.8"> · </tspan><tspan fill="var(--bar-all,#cc3333)" font-weight="normal" font-size="8.8">13.8%</tspan><tspan fill="var(--bar-top,#1a1a2e)" font-size="8.8"> · </tspan><tspan fill="var(--bar-top,#1a1a2e)" font-weight="normal" font-size="8.8">2.2%</tspan></text>
    <text x="402.12" y="244.24" transform="rotate(292.5 402.12 244.24)" font-size="11" fill="#2f2f2f" font-family="Georgia, serif" font-weight="bold" text-anchor="start">Sci-Fi<tspan fill="var(--bar-all,#cc3333)" font-size="8.8"> · </tspan><tspan fill="var(--bar-all,#cc3333)" font-weight="normal" font-size="8.8">8.9%</tspan><tspan fill="var(--bar-top,#1a1a2e)" font-size="8.8"> · </tspan><tspan fill="var(--bar-top,#1a1a2e)" font-weight="normal" font-size="8.8">5.7%</tspan></text>
    <text x="476.92" y="311.6" transform="rotate(337.5 476.92 311.6)" font-size="11" fill="#2f2f2f" font-family="Georgia, serif" font-weight="bold" text-anchor="start">Economic<tspan fill="var(--bar-all,#cc3333)" font-size="8.8"> · </tspan><tspan fill="var(--bar-all,#cc3333)" font-weight="normal" font-size="8.8">6%</tspan><tspan fill="var(--bar-top,#1a1a2e)" font-size="8.8"> · </tspan><tspan fill="var(--bar-top,#1a1a2e)" font-weight="normal" font-size="8.8">9.7%</tspan></text>
    <text x="441.12" y="401.91" transform="rotate(382.5 441.12 401.91)" font-size="11" fill="#2f2f2f" font-family="Georgia, serif" font-weight="bold" text-anchor="start">Adventure<tspan fill="var(--bar-all,#cc3333)" font-size="8.8"> · </tspan><tspan fill="var(--bar-all,#cc3333)" font-weight="normal" font-size="8.8">6.5%</tspan><tspan fill="var(--bar-top,#1a1a2e)" font-size="8.8"> · </tspan><tspan fill="var(--bar-top,#1a1a2e)" font-weight="normal" font-size="8.8">4.9%</tspan></text>
    <text x="375.44" y="431.48" transform="rotate(427.5 375.44 431.48)" font-size="11" fill="#2f2f2f" font-family="Georgia, serif" font-weight="bold" text-anchor="start">Exploration<tspan fill="var(--bar-all,#cc3333)" font-size="8.8"> · </tspan><tspan fill="var(--bar-all,#cc3333)" font-weight="normal" font-size="8.8">3%</tspan><tspan fill="var(--bar-top,#1a1a2e)" font-size="8.8"> · </tspan><tspan fill="var(--bar-top,#1a1a2e)" font-weight="normal" font-size="8.8">4.3%</tspan></text>
    <text x="326.68" y="426.35" transform="rotate(652.5 326.68 426.35)" font-size="11" fill="#2f2f2f" font-family="Georgia, serif" font-weight="bold" text-anchor="end">Medieval<tspan fill="var(--bar-all,#cc3333)" font-size="8.8"> · </tspan><tspan fill="var(--bar-all,#cc3333)" font-weight="normal" font-size="8.8">2.8%</tspan><tspan fill="var(--bar-top,#1a1a2e)" font-size="8.8"> · </tspan><tspan fill="var(--bar-top,#1a1a2e)" font-weight="normal" font-size="8.8">3.8%</tspan></text>
    <text x="300.97" y="384.48" transform="rotate(697.5 300.97 384.48)" font-size="11" fill="#2f2f2f" font-family="Georgia, serif" font-weight="bold" text-anchor="end">Farming<tspan fill="var(--bar-all,#cc3333)" font-size="8.8"> · </tspan><tspan fill="var(--bar-all,#cc3333)" font-weight="normal" font-size="8.8">1.4%</tspan><tspan fill="var(--bar-top,#1a1a2e)" font-size="8.8"> · </tspan><tspan fill="var(--bar-top,#1a1a2e)" font-weight="normal" font-size="8.8">2.4%</tspan></text>
    <path d="M 272 672 L 278 672 Q 280 672 280 674 L 280 680 Q 280 682 278 682 L 272 682 Q 270 682 270 680 L 270 674 Q 270 672 272 672 Z" fill="var(--bar-all, #cc3333)" stroke="none"/>
    <path d="M 382 672 L 388 672 Q 390 672 390 674 L 390 680 Q 390 682 388 682 L 382 682 Q 380 682 380 680 L 380 674 Q 380 672 382 672 Z" fill="var(--bar-top, #1a1a2e)" stroke="none"/>
    <text x="284" y="682" font-size="10" fill="#2f2f2f" font-family="system-ui, sans-serif" text-anchor="start">All BGG games</text>
    <text x="394" y="682" font-size="10" fill="#2f2f2f" font-family="system-ui, sans-serif" text-anchor="start">Top 100 games</text>
    <text x="350" y="28" font-size="13" fill="#2f2f2f" font-family="system-ui, sans-serif" font-weight="bold" text-anchor="middle">radialProject + VerticalAnchor.Midline &#x2014; one TextLayer, no branching</text>
  </g>
</svg>`;

window.CHART_SOURCE_LINES = [
  { ln: 1,  tok: [['com', '// viewBox="0 0 700 700"']] },
  { ln: 2,  tok: [['com', '// Radial labels \u2014 radialProject with VerticalAnchor.Midline']] },
  { ln: 3,  tok: [] },
  { ln: 4,  tok: [['kw','let'],[' '],['id','bgColor'],[' '],['op','='],[' '],['fn','Color'],['p','('],['fn','CSSVar'],['p','('],['str',"'--bg-color'"],['p',', '],['hex','#f6efe6'],['p','));']] },
  { ln: 5,  tok: [['kw','let'],[' '],['id','allBarColor'],[' '],['op','='],[' '],['fn','Color'],['p','('],['fn','CSSVar'],['p','('],['str',"'--bar-all'"],['p',', '],['hex','#cc3333'],['p','));']] },
  { ln: 6,  tok: [['kw','let'],[' '],['id','topBarColor'],[' '],['op','='],[' '],['fn','Color'],['p','('],['fn','CSSVar'],['p','('],['str',"'--bar-top'"],['p',', '],['hex','#1a1a2e'],['p','));']] },
  { ln: 7,  tok: [['kw','let'],[' '],['id','textColor'],[' '],['op','='],[' '],['fn','Color'],['p','('],['str',"'#2f2f2f'"],['p',');']] },
  { ln: 8,  tok: [['kw','let'],[' '],['id','gridColor'],[' '],['op','='],[' '],['fn','Color'],['p','('],['str',"'#d4c9b8'"],['p',');']] },
  { ln: 9,  tok: [['kw','let'],[' '],['id','pctColor'],[' '],['op','='],[' '],['fn','Color'],['p','('],['str',"'#6b7280'"],['p',');']] },
  { ln: 10, tok: [] },
  { ln: 11, tok: [['kw','let'],[' '],['id','bg'],[' '],['op','='],[' '],['fn','PathLayer'],['p','('],['str',"'bg'"],['p',') '],['op','${'],[' '],['attr','fill'],['p',': '],['id','bgColor'],['p','; '],['attr','stroke'],['p',': '],['str','none'],['p','; };']] },
  { ln: 12, tok: [['id','bg'],['op','.apply'],[' '],['p','{ '],['fn','rect'],['p','('],['num','0'],['p',', '],['num','0'],['p',', '],['num','700'],['p',', '],['num','700'],['p',') }']] },
  { ln: 13, tok: [] },
  { ln: 14, tok: [['com','// === Chart parameters ===']] },
  { ln: 15, tok: [['kw','let'],[' '],['id','cx'],[' '],['op','='],[' '],['num','350'],['p',';']] },
  { ln: 16, tok: [['kw','let'],[' '],['id','cy'],[' '],['op','='],[' '],['num','360'],['p',';']] },
  { ln: 17, tok: [['kw','let'],[' '],['id','innerR'],[' '],['op','='],[' '],['num','20'],['p',';']] }
];

window.CHART_TITLE = 'radialProject with VerticalAnchor.Midline \u2014 one TextLayer, no branching';
window.CHART_CAPTION = 'radialProject with VerticalAnchor.Midline \u2014 one TextLayer, automatic rotation and hemisphere flip';
window.CHART_DEFAULTS = { '--bg-color': '#f6efe6', '--bar-all': '#cc3333', '--bar-top': '#1a1a2e' };

window.renderCodeLines = function(containerEl, opts) {
  opts = opts || {};
  const classes = Object.assign({
    line: 'line', ln: 'ln', kw: 'tok-kw', fn: 'tok-fn', str: 'tok-str',
    num: 'tok-num', com: 'tok-com', hex: 'tok-hex', op: 'tok-op', id: 'tok-id',
    attr: 'tok-attr', p: 'tok-p'
  }, opts.classes || {});
  const lines = window.CHART_SOURCE_LINES.map((L, idx) => {
    const content = L.tok.map(t => {
      if (t.length === 1) return escapeHtml(t[0]);
      const [typ, txt] = t;
      return '<span class="' + (classes[typ] || '') + '">' + escapeHtml(txt) + '</span>';
    }).join('');
    const active = idx === 0 ? ' ' + (opts.activeClass || 'line-active') : '';
    return '<div class="' + classes.line + active + '">' +
      '<span class="' + classes.ln + '">' + L.ln + '</span>' +
      '<span class="line-content">' + content + '</span>' +
      '</div>';
  });
  containerEl.innerHTML = lines.join('');
};

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}
