// Storybook Detail View - Component demos with sidebar navigation
// Route: /storybook and /storybook/:component

import { store } from '../../state/store.js';
import { navigateTo } from '../../utils/router.js';
import {
  componentRegistry,
  getCategories,
  getComponentById,
  getFirstComponent,
} from '../../utils/storybook-registry.js';

// Import components that will be demoed
import '../app-breadcrumb.js';
import '../app-header.js';
import '../code-editor-pane.js';
import '../console-pane.js';
import '../annotated-pane.js';
import '../docs-panel.js';
import '../playground-footer.js';
import '../playground-header.js';
import '../shared/error-panel.js';
import '../shared/copy-button.js';
import '../shared/log-entry.js';
import '../shared/control-group.js';
import '../svg-preview-pane.js';

const styles = `
  :host {
    display: flex;
    height: 100%;
    overflow: hidden;
    background: var(--bg-secondary, #f5f5f5);
  }

  /* Sidebar */
  .sidebar {
    width: 240px;
    min-width: 240px;
    background: var(--bg-primary, #ffffff);
    border-right: 1px solid var(--border-color, #e0e0e0);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .sidebar-header {
    padding: 1rem;
    border-bottom: 1px solid var(--border-color, #e0e0e0);
  }

  .sidebar-header h1 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary, #1a1a1a);
  }

  .sidebar-header .badge {
    display: inline-block;
    padding: 0.125rem 0.375rem;
    background: #ff6b6b;
    color: white;
    font-size: 0.625rem;
    font-weight: 600;
    text-transform: uppercase;
    border-radius: 3px;
    margin-left: 0.5rem;
    vertical-align: middle;
  }

  .sidebar-nav {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem 0;
  }

  .category {
    margin-bottom: 0.25rem;
  }

  .category-header {
    padding: 0.5rem 1rem;
    font-size: 0.6875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-tertiary, #999);
  }

  .component-link {
    display: block;
    padding: 0.5rem 1rem 0.5rem 1.5rem;
    font-size: 0.8125rem;
    color: var(--text-secondary, #666);
    text-decoration: none;
    cursor: pointer;
    border: none;
    background: none;
    width: 100%;
    text-align: left;
    font-family: inherit;
    transition: background-color 0.15s, color 0.15s;
  }

  .component-link:hover {
    background: var(--bg-secondary, #f5f5f5);
    color: var(--text-primary, #1a1a1a);
  }

  .component-link.active {
    background: var(--accent-bg, #e6f0ff);
    color: var(--accent-color, #0066cc);
    font-weight: 500;
  }

  /* Main content */
  .main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 0;
  }

  .content-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem;
  }

  /* Component header */
  .component-header {
    margin-bottom: 1.5rem;
  }

  .component-header h2 {
    margin: 0 0 0.25rem 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary, #1a1a1a);
  }

  .component-header .description {
    margin: 0;
    color: var(--text-secondary, #666);
    font-size: 0.875rem;
  }

  /* Demo area */
  .demo-section {
    background: var(--bg-primary, #ffffff);
    border: 1px solid var(--border-color, #e0e0e0);
    border-radius: 8px;
    overflow: hidden;
    margin-bottom: 1.5rem;
  }

  .demo-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border-color, #e0e0e0);
    background: var(--bg-secondary, #f5f5f5);
  }

  .demo-header h3 {
    margin: 0;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary, #1a1a1a);
  }

  .story-tabs {
    display: flex;
    gap: 0.25rem;
  }

  .story-tab {
    padding: 0.375rem 0.75rem;
    font-size: 0.75rem;
    font-family: inherit;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
    cursor: pointer;
    color: var(--text-secondary, #666);
    transition: all 0.15s;
  }

  .story-tab:hover {
    background: var(--bg-primary, #ffffff);
  }

  .story-tab.active {
    background: var(--bg-primary, #ffffff);
    border-color: var(--border-color, #e0e0e0);
    color: var(--text-primary, #1a1a1a);
  }

  .demo-content {
    padding: 1.5rem;
    min-height: 200px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .demo-container {
    width: 100%;
  }

  /* Controls section */
  .controls-section {
    background: var(--bg-primary, #ffffff);
    border: 1px solid var(--border-color, #e0e0e0);
    border-radius: 8px;
    overflow: hidden;
  }

  .controls-header {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border-color, #e0e0e0);
    background: var(--bg-secondary, #f5f5f5);
  }

  .controls-header h3 {
    margin: 0;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary, #1a1a1a);
  }

  .controls-content {
    padding: 1rem;
  }

  .control-row {
    display: flex;
    align-items: flex-start;
    margin-bottom: 0.75rem;
    gap: 0.75rem;
  }

  .control-row:last-child {
    margin-bottom: 0;
  }

  .control-label {
    min-width: 100px;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-secondary, #666);
    padding-top: 0.375rem;
  }

  .control-input {
    flex: 1;
  }

  .control-input input[type="text"],
  .control-input input[type="number"] {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid var(--border-color, #e0e0e0);
    border-radius: 4px;
    font-size: 0.875rem;
    font-family: inherit;
  }

  .control-input input:focus {
    outline: none;
    border-color: var(--accent-color, #0066cc);
  }

  .control-input textarea {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid var(--border-color, #e0e0e0);
    border-radius: 4px;
    font-size: 0.8125rem;
    font-family: var(--font-mono, monospace);
    min-height: 80px;
    resize: vertical;
  }

  .control-input textarea:focus {
    outline: none;
    border-color: var(--accent-color, #0066cc);
  }

  .toggle-button {
    padding: 0.375rem 0.75rem;
    font-size: 0.8125rem;
    font-family: inherit;
    border: 1px solid var(--border-color, #e0e0e0);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .toggle-button.off {
    background: var(--bg-primary, #ffffff);
    color: var(--text-secondary, #666);
  }

  .toggle-button.on {
    background: var(--accent-color, #0066cc);
    border-color: var(--accent-color, #0066cc);
    color: var(--accent-text, #ffffff);
  }

  .no-controls {
    color: var(--text-tertiary, #999);
    font-size: 0.8125rem;
    font-style: italic;
  }

  /* Mobile responsive */
  @media (max-width: 768px) {
    :host {
      flex-direction: column;
    }

    .sidebar {
      width: 100%;
      min-width: 100%;
      max-height: 200px;
      border-right: none;
      border-bottom: 1px solid var(--border-color, #e0e0e0);
    }

    .sidebar-nav {
      display: flex;
      flex-wrap: wrap;
      padding: 0.5rem;
      gap: 0.25rem;
    }

    .category {
      margin-bottom: 0;
    }

    .category-header {
      display: none;
    }

    .component-link {
      padding: 0.375rem 0.625rem;
      border-radius: 4px;
      border: 1px solid var(--border-color, #e0e0e0);
    }

    .content-scroll {
      padding: 1rem;
    }
  }
`;

class StorybookDetailView extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.unsubscribe = null;
    this.currentComponent = null;
    this.currentStoryIndex = 0;
    this.controlCallbacks = new Map();
    this.controlValues = new Map();
  }

  connectedCallback() {
    this.render();
    this.subscribeToStore();
  }

  disconnectedCallback() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }

  subscribeToStore() {
    this.unsubscribe = store.subscribe(['routeParams', 'currentView'], () => {
      if (store.get('currentView') === 'storybook-detail') {
        this.updateFromRoute();
      }
    });
    // Only update from route if we're actually on the storybook view
    if (store.get('currentView') === 'storybook-detail') {
      this.updateFromRoute();
    }
  }

  updateFromRoute() {
    const params = store.get('routeParams') || {};
    const componentId = params.component;

    if (componentId) {
      const component = getComponentById(componentId);
      if (component) {
        this.selectComponent(component);
      } else {
        // Component not found, redirect to first
        const first = getFirstComponent();
        navigateTo(`/storybook/${first.id}`, { replace: true });
      }
    } else {
      // No component specified, show first
      const first = getFirstComponent();
      if (first) {
        navigateTo(`/storybook/${first.id}`, { replace: true });
      }
    }
  }

  selectComponent(component) {
    if (this.currentComponent?.id === component.id) return;

    this.currentComponent = component;
    this.currentStoryIndex = 0;
    this.controlCallbacks.clear();
    this.controlValues.clear();

    // Initialize control values from first story or defaults
    if (component.controls) {
      const story = component.stories[0];
      for (const control of component.controls) {
        const storyValue = story?.props?.[control.name];
        this.controlValues.set(control.name, storyValue !== undefined ? storyValue : control.default);
      }
    }

    this.updateSidebar();
    this.renderDemo();
  }

  selectStory(index) {
    if (index === this.currentStoryIndex) return;
    this.currentStoryIndex = index;

    // Update control values from story props
    const story = this.currentComponent.stories[index];
    if (story?.props && this.currentComponent.controls) {
      for (const control of this.currentComponent.controls) {
        if (story.props[control.name] !== undefined) {
          this.controlValues.set(control.name, story.props[control.name]);
        }
      }
    }

    this.renderDemo();
  }

  updateSidebar() {
    const links = this.shadowRoot.querySelectorAll('.component-link');
    links.forEach((link) => {
      link.classList.toggle('active', link.dataset.id === this.currentComponent?.id);
    });
  }

  // Simple event emitter for controls
  createControlsEmitter() {
    return {
      on: (name, callback) => {
        if (!this.controlCallbacks.has(name)) {
          this.controlCallbacks.set(name, []);
        }
        this.controlCallbacks.get(name).push(callback);
      },
      emit: (name, value) => {
        const callbacks = this.controlCallbacks.get(name) || [];
        callbacks.forEach((cb) => cb(value));
      },
    };
  }

  renderDemo() {
    const component = this.currentComponent;
    if (!component) return;

    const mainContent = this.shadowRoot.querySelector('.main-content');
    if (!mainContent) return;

    const story = component.stories[this.currentStoryIndex];

    mainContent.innerHTML = `
      <div class="content-scroll">
        <div class="component-header">
          <h2>${component.name}</h2>
          <p class="description">${component.description}</p>
        </div>

        <div class="demo-section">
          <div class="demo-header">
            <h3>Demo</h3>
            ${
              component.stories.length > 1
                ? `
              <div class="story-tabs">
                ${component.stories
                  .map(
                    (s, i) => `
                  <button class="story-tab ${i === this.currentStoryIndex ? 'active' : ''}" data-story="${i}">
                    ${s.name}
                  </button>
                `,
                  )
                  .join('')}
              </div>
            `
                : ''
            }
          </div>
          <div class="demo-content">
            <div class="demo-container" id="demo-container"></div>
          </div>
        </div>

        ${
          component.controls && component.controls.length > 0
            ? `
          <div class="controls-section">
            <div class="controls-header">
              <h3>Controls</h3>
            </div>
            <div class="controls-content" id="controls-content"></div>
          </div>
        `
            : ''
        }
      </div>
    `;

    // Setup story tab listeners
    mainContent.querySelectorAll('.story-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const index = parseInt(tab.dataset.story, 10);
        this.selectStory(index);
      });
    });

    // Render controls
    this.renderControls();

    // Render the component demo
    const container = mainContent.querySelector('#demo-container');
    if (container && component.render) {
      // Build props from control values or story defaults
      const props = { ...story.props };
      for (const [key, value] of this.controlValues) {
        props[key] = value;
      }

      const controls = this.createControlsEmitter();
      component.render(container, props, controls);
    }
  }

  renderControls() {
    const component = this.currentComponent;
    if (!component?.controls || component.controls.length === 0) return;

    const controlsContent = this.shadowRoot.querySelector('#controls-content');
    if (!controlsContent) return;

    controlsContent.innerHTML = component.controls
      .map((control) => {
        const value = this.controlValues.get(control.name);

        let inputHtml = '';
        switch (control.type) {
          case 'textarea':
            inputHtml = `<textarea data-control="${control.name}">${value || ''}</textarea>`;
            break;
          case 'toggle':
            inputHtml = `<button class="toggle-button ${value ? 'on' : 'off'}" data-control="${control.name}">${value ? 'On' : 'Off'}</button>`;
            break;
          case 'number':
            inputHtml = `<input type="number" data-control="${control.name}" value="${value || ''}" ${control.min !== undefined ? `min="${control.min}"` : ''} ${control.max !== undefined ? `max="${control.max}"` : ''}>`;
            break;
          case 'text':
          default:
            inputHtml = `<input type="text" data-control="${control.name}" value="${value || ''}">`;
            break;
        }

        return `
        <div class="control-row">
          <label class="control-label">${control.label}</label>
          <div class="control-input">${inputHtml}</div>
        </div>
      `;
      })
      .join('');

    // Setup control listeners
    controlsContent.querySelectorAll('[data-control]').forEach((input) => {
      const controlName = input.dataset.control;
      const control = component.controls.find((c) => c.name === controlName);

      if (control.type === 'toggle') {
        input.addEventListener('click', () => {
          const newValue = !this.controlValues.get(controlName);
          this.controlValues.set(controlName, newValue);
          input.classList.toggle('on', newValue);
          input.classList.toggle('off', !newValue);
          input.textContent = newValue ? 'On' : 'Off';

          // Emit to component
          const callbacks = this.controlCallbacks.get(controlName) || [];
          callbacks.forEach((cb) => cb(newValue));
        });
      } else if (control.type === 'number') {
        input.addEventListener('input', () => {
          const value = parseInt(input.value, 10);
          if (!isNaN(value)) {
            this.controlValues.set(controlName, value);
            const callbacks = this.controlCallbacks.get(controlName) || [];
            callbacks.forEach((cb) => cb(value));
          }
        });
      } else {
        input.addEventListener('input', () => {
          this.controlValues.set(controlName, input.value);
          const callbacks = this.controlCallbacks.get(controlName) || [];
          callbacks.forEach((cb) => cb(input.value));
        });
      }
    });
  }

  handleNavClick(e) {
    const link = e.target.closest('.component-link');
    if (!link) return;

    e.preventDefault();
    const componentId = link.dataset.id;
    navigateTo(`/storybook/${componentId}`);
  }

  render() {
    const categories = getCategories();

    this.shadowRoot.innerHTML = `
      <style>${styles}</style>

      <aside class="sidebar">
        <div class="sidebar-header">
          <h1>Storybook <span class="badge">Dev</span></h1>
        </div>
        <nav class="sidebar-nav">
          ${Array.from(categories.entries())
            .map(
              ([categoryName, components]) => `
            <div class="category">
              <div class="category-header">${categoryName}</div>
              ${components
                .map(
                  (comp) => `
                <button class="component-link ${comp.id === this.currentComponent?.id ? 'active' : ''}" data-id="${comp.id}">
                  ${comp.name}
                </button>
              `,
                )
                .join('')}
            </div>
          `,
            )
            .join('')}
        </nav>
      </aside>

      <main class="main-content">
        <div class="content-scroll">
          <p style="color: var(--text-secondary);">Select a component from the sidebar.</p>
        </div>
      </main>
    `;

    // Setup navigation listeners
    this.shadowRoot.querySelector('.sidebar-nav').addEventListener('click', (e) => this.handleNavClick(e));
  }
}

customElements.define('storybook-detail-view', StorybookDetailView);

export default StorybookDetailView;
