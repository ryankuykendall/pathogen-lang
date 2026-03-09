// Reactive SVG — interactive blog demo element
// Wraps a pre-compiled SVG with color picker controls
// Changing a picker sets CSS custom properties on the container,
// and the SVG updates reactively via var() references.

class ReactiveSvg extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    const vars = this.parseVars();
    const caption = this.getAttribute('caption') || '';
    const widthAttr = this.getAttribute('width');

    // Capture inner HTML before we replace it
    const svgContent = this.innerHTML;

    const controlsHTML = vars
      .map(
        (v) =>
          `<label class="control">
        <span class="var-name">${v.name}</span>
        <input type="color" value="${v.defaultValue}" data-var="${v.name}">
      </label>`,
      )
      .join('');

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          margin: 1.5rem 0;
        }

        .card {
          border: 1px solid var(--border-color, #e0e0e0);
          border-radius: 8px;
          overflow: hidden;
          background: var(--bg-secondary, #f9f9f9);
        }

        .controls {
          display: flex;
          flex-wrap: wrap;
          gap: 1rem;
          padding: 0.75rem 1rem;
          border-bottom: 1px solid var(--border-color, #e0e0e0);
          background: var(--bg-elevated, #fff);
          align-items: center;
        }

        .control {
          display: flex;
          align-items: center;
          gap: 0.375rem;
          cursor: pointer;
        }

        .var-name {
          font-family: var(--font-mono, monospace);
          font-size: 0.75rem;
          color: var(--text-secondary, #666);
        }

        input[type="color"] {
          -webkit-appearance: none;
          appearance: none;
          width: 28px;
          height: 28px;
          border: 2px solid var(--border-color, #ddd);
          border-radius: 4px;
          padding: 0;
          cursor: pointer;
          background: none;
        }

        input[type="color"]::-webkit-color-swatch-wrapper {
          padding: 2px;
        }

        input[type="color"]::-webkit-color-swatch {
          border: none;
          border-radius: 2px;
        }

        .svg-container {
          display: flex;
          justify-content: center;
          padding: 1rem;
          overflow-x: auto;
        }

        .svg-container svg {
          max-width: 100%;
          height: auto;
        }

        .caption {
          padding: 0.5rem 1rem;
          font-size: 0.8125rem;
          color: var(--text-tertiary, #999);
          text-align: center;
          font-style: italic;
        }
      </style>

      <div class="card">
        <div class="controls">${controlsHTML}</div>
        <div class="svg-container"${widthAttr ? ` style="max-width:${widthAttr}"` : ''}>${svgContent}</div>
        ${caption ? `<div class="caption">${caption}</div>` : ''}
      </div>
    `;

    // Set initial CSS custom properties on the SVG container
    const container = this.shadowRoot.querySelector('.svg-container');
    for (const v of vars) {
      container.style.setProperty(v.name, v.defaultValue);
    }

    // Listen for color picker changes
    this.shadowRoot.querySelector('.controls').addEventListener('input', (e) => {
      if (e.target.type === 'color') {
        const varName = e.target.dataset.var;
        container.style.setProperty(varName, e.target.value);
      }
    });
  }

  parseVars() {
    const raw = this.getAttribute('vars') || '';
    if (!raw) return [];
    return raw
      .split(';')
      .filter(Boolean)
      .map((pair) => {
        const colonIdx = pair.indexOf(':');
        if (colonIdx === -1) return null;
        return {
          name: pair.slice(0, colonIdx).trim(),
          defaultValue: pair.slice(colonIdx + 1).trim(),
        };
      })
      .filter(Boolean);
  }
}

customElements.define('reactive-svg', ReactiveSvg);

export default ReactiveSvg;
