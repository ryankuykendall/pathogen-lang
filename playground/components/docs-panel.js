// Documentation slide-out panel component
import { cli, debug, hljsThemeDark, layers, pathBlocks, stdlib, syntax } from '../utils/docs-content.js';

export class DocsPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._activeTab = 'syntax';
  }

  connectedCallback() {
    this.render();
    this.setupEventListeners();
  }

  open() {
    this.classList.add('open');
    this.dispatchEvent(new CustomEvent('open'));
  }

  close() {
    this.classList.remove('open');
    this.dispatchEvent(new CustomEvent('close'));
  }

  toggle() {
    if (this.classList.contains('open')) {
      this.close();
    } else {
      this.open();
    }
  }

  setupEventListeners() {
    // Close button
    this.shadowRoot.querySelector('#close-btn').addEventListener('click', () => this.close());

    // Tab switching
    this.shadowRoot.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        this.switchTab(tabName);
      });
    });

    // Escape key closes panel
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.classList.contains('open')) {
        this.close();
      }
    });
  }

  switchTab(tabName) {
    this._activeTab = tabName;

    // Update tab buttons
    this.shadowRoot.querySelectorAll('.tab').forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    // Update sections
    this.shadowRoot.querySelectorAll('.section').forEach((section) => {
      section.classList.toggle('active', section.id === `doc-${tabName}`);
    });
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          position: fixed;
          top: 0;
          right: 0;
          width: 420px;
          max-width: 100vw;
          height: 100vh;
          background: var(--bg-primary, #ffffff);
          border-left: 1px solid var(--border-color, #ddd);
          box-shadow: -4px 0 20px rgba(0, 0, 0, 0.1);
          transform: translateX(100%);
          transition: transform 0.3s ease;
          z-index: 1000;
          display: flex;
          flex-direction: column;
        }

        :host(.open) {
          transform: translateX(0);
        }

        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          border-bottom: 1px solid var(--border-color, #ddd);
          background: var(--bg-secondary, #f5f5f5);
        }

        .header h2 {
          font-size: 1rem;
          font-weight: 600;
          margin: 0;
        }

        .close-btn {
          background: none;
          border: none;
          font-size: 1.5rem;
          cursor: pointer;
          padding: 4px 8px;
          color: var(--text-secondary, #666);
          line-height: 1;
        }

        .close-btn:hover {
          color: var(--text-primary, #1a1a1a);
          background: var(--bg-tertiary, #e8e8e8);
        }

        .tabs {
          display: flex;
          border-bottom: 1px solid var(--border-color, #ddd);
        }

        .tab {
          flex: 1;
          padding: 10px 16px;
          border: none;
          background: var(--bg-secondary, #f5f5f5);
          cursor: pointer;
          font-size: 0.875rem;
          font-family: inherit;
          color: var(--text-secondary, #666);
          border-bottom: 2px solid transparent;
          transition: all 0.15s;
        }

        .tab:hover {
          background: var(--bg-tertiary, #e8e8e8);
        }

        .tab.active {
          background: var(--bg-primary, #ffffff);
          color: var(--accent-color, #0066cc);
          border-bottom-color: var(--accent-color, #0066cc);
        }

        .content {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
        }

        .section {
          display: none;
        }

        .section.active {
          display: block;
        }

        /* Hide h1 titles in compact panel - the tab name serves this purpose */
        h1 {
          display: none;
        }

        h2 {
          font-size: 1rem;
          font-weight: 600;
          margin: 20px 0 10px 0;
          color: var(--text-primary, #1a1a1a);
          padding-bottom: 6px;
          border-bottom: 1px solid var(--border-color, #ddd);
        }

        h2:first-child {
          margin-top: 0;
        }

        h3 {
          font-size: 0.9375rem;
          font-weight: 600;
          margin: 16px 0 8px 0;
          color: var(--text-primary, #1a1a1a);
        }

        h4 {
          font-size: 0.875rem;
          font-weight: 600;
          margin: 16px 0 8px 0;
          color: var(--text-primary, #1a1a1a);
        }

        p {
          font-size: 0.8125rem;
          line-height: 1.5;
          color: var(--text-secondary, #666);
          margin: 8px 0;
        }

        code {
          font-family: var(--font-mono, 'SF Mono', Monaco, monospace);
          font-size: 0.75rem;
          background: var(--bg-secondary, #f5f5f5);
          padding: 2px 5px;
          border-radius: 3px;
        }

        pre {
          border-radius: 6px;
          font-size: 0.75rem;
          line-height: 1.5;
          margin: 10px 0;
        }

        pre code {
          background: none;
          padding: 12px;
          display: block;
          font-size: inherit;
        }

        /* highlight.js theme */
        ${hljsThemeDark}

        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.75rem;
          margin: 10px 0;
        }

        th, td {
          text-align: left;
          padding: 6px 8px;
          border-bottom: 1px solid var(--border-color, #ddd);
        }

        th {
          background: var(--bg-secondary, #f5f5f5);
          font-weight: 600;
        }

        ul, ol {
          margin: 8px 0;
          padding-left: 1.5rem;
          font-size: 0.8125rem;
          color: var(--text-secondary, #666);
        }

        li {
          margin-bottom: 4px;
          line-height: 1.5;
        }

        hr {
          border: none;
          border-top: 1px solid var(--border-color, #ddd);
          margin: 20px 0;
        }
      </style>

      <div class="header">
        <h2>Documentation</h2>
        <button id="close-btn" class="close-btn">&times;</button>
      </div>

      <div class="tabs">
        <button class="tab active" data-tab="syntax">Syntax</button>
        <button class="tab" data-tab="stdlib">Stdlib</button>
        <button class="tab" data-tab="layers">Layers</button>
        <button class="tab" data-tab="pathBlocks">Path Blocks</button>
        <button class="tab" data-tab="debug">Debug</button>
        <button class="tab" data-tab="cli">CLI</button>
      </div>

      <div class="content">
        <div class="section active" id="doc-syntax">${syntax}</div>
        <div class="section" id="doc-stdlib">${stdlib}</div>
        <div class="section" id="doc-layers">${layers}</div>
        <div class="section" id="doc-pathBlocks">${pathBlocks}</div>
        <div class="section" id="doc-debug">${debug}</div>
        <div class="section" id="doc-cli">${cli}</div>
      </div>
    `;
  }
}

customElements.define('docs-panel', DocsPanel);
