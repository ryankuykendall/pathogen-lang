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
import '../docs-panel.js';
import '../playground-footer.js';
import '../playground-header.js';
import '../shared/error-panel.js';
import '../shared/copy-button.js';
import '../shared/log-entry.js';
import '../shared/control-group.js';
import '../shared/pathogen-color-input.js';
import '../svg-preview-pane.js';

import styles from './storybook-detail-view.css';

interface StoryControl {
  name: string;
  type: string;
  label: string;
  default?: unknown;
  min?: number;
  max?: number;
}

interface Story {
  name: string;
  props: Record<string, unknown>;
}

interface ComponentSpec {
  id: string;
  name: string;
  category: string;
  description: string;
  stories: Story[];
  controls: StoryControl[];
  notes?: string;
  render: (container: HTMLElement, props: Record<string, unknown>, controls: ControlsEmitter) => void;
}

interface ControlsEmitter {
  on(name: string, callback: (value: unknown) => void): void;
  emit(name: string, value: unknown): void;
}

class StorybookDetailView extends HTMLElement {
  private unsubscribe: (() => void) | null = null;
  private currentComponent: ComponentSpec | null = null;
  private currentStoryIndex: number = 0;
  private controlCallbacks: Map<string, Array<(value: unknown) => void>> = new Map();
  private controlValues: Map<string, unknown> = new Map();

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    this.render();
    this.subscribeToStore();
  }

  disconnectedCallback(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }

  private subscribeToStore(): void {
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

  private updateFromRoute(): void {
    const params = (store.get('routeParams') as Record<string, string>) || {};
    const componentId = params.component;

    if (componentId) {
      const component = getComponentById(componentId) as ComponentSpec | undefined;
      if (component) {
        this.selectComponent(component);
      } else {
        // Component not found, redirect to first
        const first = getFirstComponent() as ComponentSpec;
        navigateTo(`/storybook/${first.id}`, { replace: true });
      }
    } else {
      // No component specified, show first
      const first = getFirstComponent() as ComponentSpec | undefined;
      if (first) {
        navigateTo(`/storybook/${first.id}`, { replace: true });
      }
    }
  }

  private selectComponent(component: ComponentSpec): void {
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

  private selectStory(index: number): void {
    if (index === this.currentStoryIndex) return;
    this.currentStoryIndex = index;

    // Update control values from story props
    const story = this.currentComponent!.stories[index];
    if (story?.props && this.currentComponent!.controls) {
      for (const control of this.currentComponent!.controls) {
        if (story.props[control.name] !== undefined) {
          this.controlValues.set(control.name, story.props[control.name]);
        }
      }
    }

    this.renderDemo();
  }

  private updateSidebar(): void {
    const links = this.shadowRoot!.querySelectorAll('.component-link');
    links.forEach((link) => {
      const el = link as HTMLElement;
      el.classList.toggle('active', el.dataset.id === this.currentComponent?.id);
    });
  }

  // Simple event emitter for controls
  private createControlsEmitter(): ControlsEmitter {
    return {
      on: (name: string, callback: (value: unknown) => void): void => {
        if (!this.controlCallbacks.has(name)) {
          this.controlCallbacks.set(name, []);
        }
        this.controlCallbacks.get(name)!.push(callback);
      },
      emit: (name: string, value: unknown): void => {
        const callbacks = this.controlCallbacks.get(name) || [];
        callbacks.forEach((cb) => cb(value));
      },
    };
  }

  private renderDemo(): void {
    const component = this.currentComponent;
    if (!component) return;

    const mainContent = this.shadowRoot!.querySelector('.main-content');
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
        const index = parseInt((tab as HTMLElement).dataset.story!, 10);
        this.selectStory(index);
      });
    });

    // Render controls
    this.renderControls();

    // Render the component demo
    const container = mainContent.querySelector('#demo-container') as HTMLElement | null;
    if (container && component.render) {
      // Build props from control values or story defaults
      const props: Record<string, unknown> = { ...story.props };
      for (const [key, value] of this.controlValues) {
        props[key] = value;
      }

      const controls = this.createControlsEmitter();
      component.render(container, props, controls);
    }
  }

  private renderControls(): void {
    const component = this.currentComponent;
    if (!component?.controls || component.controls.length === 0) return;

    const controlsContent = this.shadowRoot!.querySelector('#controls-content');
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
      const el = input as HTMLElement;
      const controlName = el.dataset.control!;
      const control = component.controls.find((c) => c.name === controlName);
      if (!control) return;

      if (control.type === 'toggle') {
        el.addEventListener('click', () => {
          const newValue = !this.controlValues.get(controlName);
          this.controlValues.set(controlName, newValue);
          el.classList.toggle('on', newValue);
          el.classList.toggle('off', !newValue);
          el.textContent = newValue ? 'On' : 'Off';

          // Emit to component
          const callbacks = this.controlCallbacks.get(controlName) || [];
          callbacks.forEach((cb) => cb(newValue));
        });
      } else if (control.type === 'number') {
        el.addEventListener('input', () => {
          const value = parseInt((el as HTMLInputElement).value, 10);
          if (!isNaN(value)) {
            this.controlValues.set(controlName, value);
            const callbacks = this.controlCallbacks.get(controlName) || [];
            callbacks.forEach((cb) => cb(value));
          }
        });
      } else {
        el.addEventListener('input', () => {
          this.controlValues.set(controlName, (el as HTMLInputElement).value);
          const callbacks = this.controlCallbacks.get(controlName) || [];
          callbacks.forEach((cb) => cb((el as HTMLInputElement).value));
        });
      }
    });
  }

  private handleNavClick(e: Event): void {
    const target = e.target as HTMLElement;
    const link = target.closest('.component-link') as HTMLElement | null;
    if (!link) return;

    e.preventDefault();
    const componentId = link.dataset.id!;
    navigateTo(`/storybook/${componentId}`);
  }

  private render(): void {
    const categories = getCategories() as Map<string, ComponentSpec[]>;

    this.shadowRoot!.innerHTML = `
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
    (this.shadowRoot!.querySelector('.sidebar-nav') as HTMLElement).addEventListener('click', (e: Event) =>
      this.handleNavClick(e),
    );
  }
}

customElements.define('storybook-detail-view', StorybookDetailView);

export default StorybookDetailView;
