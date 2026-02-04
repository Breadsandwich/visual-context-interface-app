/**
 * Visual Context Interface - Inspector Script
 * Injected into target applications to enable DOM inspection and screenshot capture
 */

(function() {
  'use strict';

  // Prevent multiple initializations
  if (window.__INSPECTOR__?.initialized) {
    return;
  }

  // Constants
  const ROUTE_CHANGE_POLL_MS = 500;
  const MAX_SELECTOR_LENGTH = 500;
  const MAX_OUTER_HTML_LENGTH = 2000;
  const MAX_SCREENSHOT_WIDTH = 1920;
  const MAX_SCREENSHOT_HEIGHT = 1080;
  const SCREENSHOT_QUALITY = 0.8;

  // Inspector state
  const state = {
    mode: 'interaction', // 'interaction' | 'inspection' | 'screenshot'
    hoveredElement: null,
    selectedElement: null,
    initialized: false,
    parentOrigin: window.location.origin,
    routeCheckInterval: null
  };

  // Create overlay element for highlighting
  const overlay = document.createElement('div');
  overlay.id = '__inspector_overlay__';
  overlay.style.cssText = `
    position: fixed;
    pointer-events: none;
    border: 2px solid #646cff;
    background-color: rgba(100, 108, 255, 0.1);
    z-index: 999999;
    display: none;
    transition: all 0.05s ease-out;
  `;

  // Create tooltip for element info
  const tooltip = document.createElement('div');
  tooltip.id = '__inspector_tooltip__';
  tooltip.style.cssText = `
    position: fixed;
    background-color: #1a1a2e;
    color: #ffffff;
    padding: 6px 10px;
    border-radius: 4px;
    font-family: monospace;
    font-size: 12px;
    z-index: 1000000;
    display: none;
    pointer-events: none;
    max-width: 400px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  `;

  // Create selection indicator
  const selectionIndicator = document.createElement('div');
  selectionIndicator.id = '__inspector_selection__';
  selectionIndicator.style.cssText = `
    position: fixed;
    pointer-events: none;
    border: 3px solid #22c55e;
    background-color: rgba(34, 197, 94, 0.1);
    z-index: 999998;
    display: none;
  `;

  /**
   * Generate a unique CSS selector for an element
   */
  function generateSelector(element) {
    if (element.id) {
      return `#${CSS.escape(element.id)}`;
    }

    const path = [];
    let current = element;

    while (current && current !== document.body && current !== document.documentElement) {
      let selector = current.tagName.toLowerCase();

      if (current.id) {
        selector = `#${CSS.escape(current.id)}`;
        path.unshift(selector);
        break;
      }

      if (current.className && typeof current.className === 'string') {
        const classes = current.className.trim().split(/\s+/).filter(c => c);
        if (classes.length > 0) {
          selector += '.' + classes.map(c => CSS.escape(c)).join('.');
        }
      }

      // Add nth-child if needed for uniqueness
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          child => child.tagName === current.tagName
        );
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += `:nth-child(${index})`;
        }
      }

      path.unshift(selector);
      current = current.parentElement;
    }

    return path.join(' > ');
  }

  /**
   * Get element context data
   */
  function getElementContext(element) {
    const rect = element.getBoundingClientRect();
    const classes = element.className && typeof element.className === 'string'
      ? element.className.trim().split(/\s+/).filter(c => c)
      : [];

    return {
      tagName: element.tagName.toLowerCase(),
      id: element.id || '',
      classes: classes,
      selector: generateSelector(element),
      outerHTML: element.outerHTML.substring(0, MAX_OUTER_HTML_LENGTH),
      boundingRect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left
      }
    };
  }

  /**
   * Position overlay on element
   */
  function positionOverlay(element, overlayEl) {
    const rect = element.getBoundingClientRect();
    overlayEl.style.top = `${rect.top}px`;
    overlayEl.style.left = `${rect.left}px`;
    overlayEl.style.width = `${rect.width}px`;
    overlayEl.style.height = `${rect.height}px`;
    overlayEl.style.display = 'block';
  }

  /**
   * Update tooltip content and position
   */
  function updateTooltip(element, x, y) {
    const tagName = element.tagName.toLowerCase();
    const id = element.id ? `#${element.id}` : '';
    const classes = element.className && typeof element.className === 'string'
      ? '.' + element.className.trim().split(/\s+/).filter(c => c).join('.')
      : '';

    tooltip.textContent = `${tagName}${id}${classes}`;
    tooltip.style.left = `${x + 10}px`;
    tooltip.style.top = `${y + 10}px`;
    tooltip.style.display = 'block';

    // Keep tooltip in viewport
    const tooltipRect = tooltip.getBoundingClientRect();
    if (tooltipRect.right > window.innerWidth) {
      tooltip.style.left = `${x - tooltipRect.width - 10}px`;
    }
    if (tooltipRect.bottom > window.innerHeight) {
      tooltip.style.top = `${y - tooltipRect.height - 10}px`;
    }
  }

  /**
   * Hide overlay and tooltip
   */
  function hideOverlay() {
    overlay.style.display = 'none';
    tooltip.style.display = 'none';
  }

  /**
   * Send message to parent window with origin restriction
   */
  function sendToParent(action, payload) {
    // Use same origin for security - content is served through proxy at same origin
    window.parent.postMessage({
      type: 'INSPECTOR_EVENT',
      action: action,
      payload: payload
    }, state.parentOrigin);
  }

  /**
   * Validate selector before using it
   */
  function validateSelector(selector) {
    if (!selector || typeof selector !== 'string') {
      return false;
    }
    if (selector.length > MAX_SELECTOR_LENGTH) {
      return false;
    }
    // Test that it's a valid selector
    try {
      document.createDocumentFragment().querySelector(selector);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if browser supports WebP format (memoized)
   */
  const supportsWebP = (() => {
    let cached = null;
    return () => {
      if (cached === null) {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 1;
          canvas.height = 1;
          cached = canvas.toDataURL('image/webp').startsWith('data:image/webp');
        } catch {
          cached = false;
        }
      }
      return cached;
    };
  })();

  /**
   * Resize canvas while preserving aspect ratio
   */
  function resizeCanvas(sourceCanvas, maxWidth, maxHeight) {
    const originalWidth = sourceCanvas.width;
    const originalHeight = sourceCanvas.height;

    // Return original if dimensions are invalid
    if (originalWidth <= 0 || originalHeight <= 0) {
      return sourceCanvas;
    }

    // Calculate constrained dimensions while preserving aspect ratio
    let targetWidth = originalWidth;
    let targetHeight = originalHeight;

    if (targetWidth > maxWidth) {
      const ratio = maxWidth / targetWidth;
      targetWidth = maxWidth;
      targetHeight = Math.round(targetHeight * ratio);
    }
    if (targetHeight > maxHeight) {
      const ratio = maxHeight / targetHeight;
      targetHeight = maxHeight;
      targetWidth = Math.round(targetWidth * ratio);
    }

    // If no resize needed, return original
    if (targetWidth === originalWidth && targetHeight === originalHeight) {
      return sourceCanvas;
    }

    // Create resized canvas
    const resizedCanvas = document.createElement('canvas');
    resizedCanvas.width = targetWidth;
    resizedCanvas.height = targetHeight;

    const ctx = resizedCanvas.getContext('2d');
    if (!ctx) {
      return sourceCanvas;
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(sourceCanvas, 0, 0, targetWidth, targetHeight);

    return resizedCanvas;
  }

  /**
   * Capture screenshot of element or region with compression
   */
  async function captureScreenshot(options = {}) {
    if (typeof html2canvas === 'undefined') {
      sendToParent('SCREENSHOT_ERROR', { error: 'html2canvas not loaded' });
      return;
    }

    try {
      let target = document.body;
      let captureOptions = {
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: null
      };

      if (options.selector) {
        if (!validateSelector(options.selector)) {
          sendToParent('SCREENSHOT_ERROR', { error: 'Invalid selector' });
          return;
        }
        const element = document.querySelector(options.selector);
        if (element) {
          target = element;
        }
      }

      if (options.region) {
        captureOptions.x = options.region.x;
        captureOptions.y = options.region.y;
        captureOptions.width = options.region.width;
        captureOptions.height = options.region.height;
      }

      // Capture the canvas
      const canvas = await html2canvas(target, captureOptions);

      // Resize while preserving aspect ratio
      const resizedCanvas = resizeCanvas(canvas, MAX_SCREENSHOT_WIDTH, MAX_SCREENSHOT_HEIGHT);

      // Use WebP with fallback to JPEG for older browsers
      const format = supportsWebP() ? 'image/webp' : 'image/jpeg';
      const imageData = resizedCanvas.toDataURL(format, SCREENSHOT_QUALITY);

      sendToParent('SCREENSHOT_CAPTURED', {
        imageData: imageData,
        region: options.region || null,
        selector: options.selector || null
      });

    } catch (error) {
      sendToParent('SCREENSHOT_ERROR', { error: error.message, stack: error.stack });
    }
  }

  /**
   * Handle mouse move in inspection mode
   */
  function handleMouseMove(event) {
    if (state.mode !== 'inspection') return;

    // Ignore our own elements
    if (event.target.id?.startsWith('__inspector_')) return;

    state.hoveredElement = event.target;
    positionOverlay(event.target, overlay);
    updateTooltip(event.target, event.clientX, event.clientY);
  }

  /**
   * Handle click in inspection mode
   */
  function handleClick(event) {
    if (state.mode !== 'inspection') return;

    // Ignore our own elements
    if (event.target.id?.startsWith('__inspector_')) return;

    event.preventDefault();
    event.stopPropagation();

    state.selectedElement = event.target;
    const context = getElementContext(event.target);

    // Show selection indicator
    positionOverlay(event.target, selectionIndicator);

    // Send selection to parent
    sendToParent('ELEMENT_SELECTED', { element: context });
  }

  /**
   * Handle commands from parent window with origin validation
   */
  function handleCommand(event) {
    // Validate origin - only accept commands from same origin
    if (event.origin !== state.parentOrigin) {
      return;
    }

    if (event.data?.type !== 'INSPECTOR_COMMAND') return;

    const { action, payload } = event.data;

    switch (action) {
      case 'SET_MODE':
        if (payload && typeof payload.mode === 'string') {
          state.mode = payload.mode;
          if (state.mode !== 'inspection') {
            hideOverlay();
          }
        }
        break;

      case 'CAPTURE_SCREENSHOT':
        captureScreenshot(payload || {});
        break;

      case 'CAPTURE_ELEMENT':
        if (state.selectedElement) {
          captureScreenshot({ selector: generateSelector(state.selectedElement) });
        }
        break;

      case 'CLEAR_SELECTION':
        state.selectedElement = null;
        selectionIndicator.style.display = 'none';
        break;

      case 'GET_ROUTE':
        sendToParent('ROUTE_CHANGED', {
          route: window.location.pathname + window.location.search,
          title: document.title
        });
        break;
    }
  }

  /**
   * Cleanup function
   */
  function cleanup() {
    if (state.routeCheckInterval) {
      clearInterval(state.routeCheckInterval);
      state.routeCheckInterval = null;
    }
  }

  /**
   * Initialize inspector
   */
  function init() {
    // Add elements to DOM
    document.body.appendChild(overlay);
    document.body.appendChild(tooltip);
    document.body.appendChild(selectionIndicator);

    // Add event listeners
    document.addEventListener('mousemove', handleMouseMove, true);
    document.addEventListener('click', handleClick, true);
    window.addEventListener('message', handleCommand);

    // Track route changes
    let lastRoute = window.location.pathname;
    const checkRouteChange = () => {
      const currentRoute = window.location.pathname;
      if (currentRoute !== lastRoute) {
        lastRoute = currentRoute;
        sendToParent('ROUTE_CHANGED', {
          route: currentRoute + window.location.search,
          title: document.title
        });
      }
    };

    // Check for route changes periodically (for SPA navigation)
    state.routeCheckInterval = setInterval(checkRouteChange, ROUTE_CHANGE_POLL_MS);

    // Listen for popstate
    window.addEventListener('popstate', () => {
      setTimeout(() => {
        sendToParent('ROUTE_CHANGED', {
          route: window.location.pathname + window.location.search,
          title: document.title
        });
      }, 100);
    });

    state.initialized = true;

    // Notify parent that inspector is ready
    sendToParent('READY', { version: '1.0.0' });

    // Send initial route
    sendToParent('ROUTE_CHANGED', {
      route: window.location.pathname + window.location.search,
      title: document.title
    });
  }

  // Export to window for debugging
  window.__INSPECTOR__ = {
    version: '1.0.0',
    initialized: true,
    state: state,
    getElementContext: getElementContext,
    generateSelector: generateSelector,
    captureScreenshot: captureScreenshot,
    cleanup: cleanup
  };

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
