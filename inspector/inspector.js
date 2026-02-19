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
  const MAX_SELECTED_ELEMENTS = 10;

  // Matches modern CSS color functions unsupported by html2canvas v1.x
  // Covers: oklab(), oklch(), lab(), lch(), color-mix(), color() with up to 2 levels of nested parens
  const UNSUPPORTED_COLOR_RE = /\b(?:oklab|oklch|lab|lch|color-mix|color)\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)/gi;

  // Inspector state
  const state = {
    mode: 'interaction', // 'interaction' | 'inspection' | 'screenshot'
    hoveredElement: null,
    selectedElements: [], // Array of { element, context } objects
    initialized: false,
    parentOrigin: window.__INSPECTOR_PARENT_ORIGIN__ || window.location.origin,
    routeCheckInterval: null
  };

  const pendingEdits = new Map(); // selector → Map<property, { original, current }>

  // Create overlay element for highlighting
  const overlay = document.createElement('div');
  overlay.id = '__inspector_overlay__';
  overlay.style.cssText = `
    position: fixed;
    pointer-events: none;
    border: 2px solid #2D8AE1;
    background-color: rgba(45, 138, 225, 0.1);
    z-index: 999999;
    display: none;
    transition: all 0.05s ease-out;
  `;

  // Create tooltip for element info
  const tooltip = document.createElement('div');
  tooltip.id = '__inspector_tooltip__';
  tooltip.style.cssText = `
    position: fixed;
    background-color: #0C2739;
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
   * Find the React fiber node for a DOM element.
   * React attaches fibers via __reactFiber$ (React 17+) or __reactInternalInstance$ (React 16).
   * Returns null for non-React elements or production builds (no fiber attached).
   */
  function getReactFiber(domNode) {
    if (!domNode || typeof domNode !== 'object') return null;
    try {
      var keys = Object.keys(domNode);
      for (var i = 0; i < keys.length; i++) {
        if (keys[i].startsWith('__reactFiber$') || keys[i].startsWith('__reactInternalInstance$')) {
          return domNode[keys[i]];
        }
      }
    } catch (_e) {
      return null;
    }
    return null;
  }

  /**
   * Extract source location from a React fiber's _debugSource.
   * Walks up the fiber tree to find the nearest fiber with debug info.
   * Returns { sourceFile, sourceLine, componentName } or all-null if unavailable.
   */
  function getSourceLocation(domNode) {
    var result = { sourceFile: null, sourceLine: null, componentName: null };
    try {
      var fiber = getReactFiber(domNode);
      if (!fiber) return result;

      // Walk up the fiber tree looking for _debugSource
      var current = fiber;
      var maxDepth = 20;
      while (current && maxDepth-- > 0) {
        if (current._debugSource) {
          result.sourceFile = current._debugSource.fileName || null;
          result.sourceLine = current._debugSource.lineNumber || null;
          // columnNumber is sometimes available but not always useful
          break;
        }
        current = current.return;
      }

      // Walk up again to find the nearest named component
      current = fiber;
      maxDepth = 20;
      while (current && maxDepth-- > 0) {
        if (typeof current.type === 'function' && current.type.name) {
          result.componentName = current.type.name;
          break;
        }
        if (typeof current.type === 'object' && current.type !== null) {
          // ForwardRef, memo, etc. may have displayName
          var displayName = current.type.displayName || current.type.name;
          if (displayName) {
            result.componentName = displayName;
            break;
          }
        }
        current = current.return;
      }
    } catch (_e) {
      // Graceful fallback — fiber internals may vary across React versions
    }
    return result;
  }

  /**
   * Get element context data
   */
  function getElementContext(element) {
    const rect = element.getBoundingClientRect();
    const classes = element.className && typeof element.className === 'string'
      ? element.className.trim().split(/\s+/).filter(c => c)
      : [];

    var source = getSourceLocation(element);

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
      },
      sourceFile: source.sourceFile,
      sourceLine: source.sourceLine,
      componentName: source.componentName
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
   * Remove all selection indicator elements from the DOM
   */
  function removeAllSelectionIndicators() {
    document.querySelectorAll('[id^="__inspector_selection_"]').forEach(function(el) {
      el.remove();
    });
  }

  /**
   * Create and position selection indicators for all selected elements
   */
  function updateSelectionIndicators() {
    removeAllSelectionIndicators();

    state.selectedElements.forEach(function(entry, index) {
      if (!entry.element || !entry.element.isConnected) return;

      var indicator = document.createElement('div');
      indicator.id = '__inspector_selection_' + index;
      indicator.style.cssText = `
        position: fixed;
        pointer-events: none;
        border: 3px solid #00F26C;
        background-color: rgba(0, 242, 108, 0.08);
        z-index: 999998;
      `;
      document.body.appendChild(indicator);
      positionOverlay(entry.element, indicator);
    });
  }

  /**
   * Send message to parent window with origin restriction
   */
  function sendToParent(action, payload) {
    // Target the parent origin (injected by proxy, or same-origin fallback)
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
   * Replace unsupported CSS color functions with 'inherit' in a CSS text string.
   */
  function sanitizeCssText(cssText) {
    return cssText.replace(UNSUPPORTED_COLOR_RE, 'inherit');
  }

  /**
   * Pre-sanitize stylesheets in the ORIGINAL document before html2canvas runs.
   * html2canvas reads cssRules from the original document's stylesheets before
   * the onclone callback fires, so onclone-only sanitization is insufficient.
   *
   * Returns an array of restore operations to undo the changes.
   */
  function presanitizeStylesheets() {
    const restoreOps = [];

    // Sanitize <link rel="stylesheet"> elements by replacing with inline <style>
    document.querySelectorAll('link[rel="stylesheet"]').forEach(function(link) {
      try {
        const sheet = link.sheet;
        if (!sheet || !sheet.cssRules) return;

        const cssText = Array.from(sheet.cssRules)
          .map(function(rule) { return rule.cssText; })
          .join('\n');

        const sanitized = sanitizeCssText(cssText);
        if (sanitized === cssText) return;

        const inlineStyle = document.createElement('style');
        inlineStyle.textContent = sanitized;
        inlineStyle.dataset.inspectorReplace = 'true';

        if (link.media) {
          inlineStyle.setAttribute('media', link.media);
        }

        link.parentNode.insertBefore(inlineStyle, link);
        link.parentNode.removeChild(link);

        restoreOps.push({ type: 'link', replacement: inlineStyle, original: link });
      } catch (_e) {
        // Cross-origin stylesheets will throw on cssRules access -- skip them
      }
    });

    // Sanitize existing <style> elements in-place
    document.querySelectorAll('style:not([data-inspector-replace])').forEach(function(style) {
      if (!style.textContent) return;

      const original = style.textContent;
      const sanitized = sanitizeCssText(original);
      if (sanitized === original) return;

      style.textContent = sanitized;

      restoreOps.push({ type: 'style', element: style, original: original });
    });

    return restoreOps;
  }

  /**
   * Restore stylesheets to their original state after screenshot capture.
   */
  function restoreStylesheets(restoreOps) {
    restoreOps.forEach(function(op) {
      try {
        if (op.type === 'link') {
          const parent = op.replacement.parentNode;
          if (parent) {
            parent.insertBefore(op.original, op.replacement);
            parent.removeChild(op.replacement);
          } else {
            document.head.appendChild(op.original);
          }
        } else if (op.type === 'style') {
          op.element.textContent = op.original;
        }
      } catch (_e) {
        // Best-effort restore
      }
    });
  }

  /**
   * Sanitize CSS color functions not supported by html2canvas (oklab, oklch, etc.)
   * from the cloned document. Used as onclone safety net for inline styles.
   */
  function sanitizeUnsupportedColors(doc) {
    // Sanitize <style> elements
    doc.querySelectorAll('style').forEach(function(style) {
      if (style.textContent) {
        style.textContent = sanitizeCssText(style.textContent);
      }
    });

    // Sanitize inline styles
    doc.querySelectorAll('[style]').forEach(function(el) {
      const styleAttr = el.getAttribute('style');
      if (styleAttr) {
        el.setAttribute('style', sanitizeCssText(styleAttr));
      }
    });
  }

  /**
   * Capture screenshot of element or region with compression
   */
  async function captureScreenshot(options = {}) {
    if (typeof html2canvas === 'undefined') {
      sendToParent('SCREENSHOT_ERROR', { error: 'html2canvas not loaded' });
      return;
    }

    // Pre-sanitize original document stylesheets so html2canvas reads clean CSS
    const restoreOps = presanitizeStylesheets();

    try {
      let target = document.body;
      const captureOptions = {
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: null,
        onclone: function(clonedDoc) {
          // Safety net for inline styles and any rules missed by pre-sanitization
          sanitizeUnsupportedColors(clonedDoc);
        }
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

      const imageData = resizedCanvas.toDataURL('image/png');

      sendToParent('SCREENSHOT_CAPTURED', {
        imageData: imageData,
        region: options.region || null,
        selector: options.selector || null
      });

    } catch (error) {
      sendToParent('SCREENSHOT_ERROR', { error: error.message, stack: error.stack });
    } finally {
      restoreStylesheets(restoreOps);
    }
  }

  /**
   * Handle mouse move in inspection mode
   */
  function handleMouseMove(event) {
    if (state.mode !== 'inspection' && state.mode !== 'edit') return;

    // Ignore our own elements
    if (event.target.id?.startsWith('__inspector_')) return;

    state.hoveredElement = event.target;
    positionOverlay(event.target, overlay);
    updateTooltip(event.target, event.clientX, event.clientY);
  }

  /**
   * Handle click in inspection mode — toggle element selection
   */
  function handleClick(event) {
    // Ignore our own elements
    if (event.target.id?.startsWith('__inspector_')) return;

    if (state.mode === 'edit') {
      event.preventDefault();
      event.stopPropagation();
      var target = event.target;
      var selectedMatch = state.selectedElements.find(function(item) {
        return item.element === target || target.closest(item.context.selector);
      });
      if (selectedMatch) {
        sendToParent('EDIT_ELEMENT_CLICKED', { selector: selectedMatch.context.selector });
      } else {
        // Select the element first, then open editor
        var editContext = getElementContext(target);
        if (state.selectedElements.length < MAX_SELECTED_ELEMENTS) {
          state.selectedElements = state.selectedElements.concat([{ element: target, context: editContext }]);
          updateSelectionIndicators();
          sendToParent('ELEMENT_SELECTED', { element: editContext });
          sendToParent('EDIT_ELEMENT_CLICKED', { selector: editContext.selector });
        }
      }
      hideOverlay();
      return;
    }

    if (state.mode !== 'inspection') return;

    event.preventDefault();
    event.stopPropagation();

    var context = getElementContext(event.target);
    var existingIndex = state.selectedElements.findIndex(
      function(entry) { return entry.context.selector === context.selector; }
    );

    if (existingIndex !== -1) {
      // Toggle off — remove from selection (immutable)
      state.selectedElements = state.selectedElements.filter(
        function(entry) { return entry.context.selector !== context.selector; }
      );
    } else if (state.selectedElements.length < MAX_SELECTED_ELEMENTS) {
      // Toggle on — add to selection (immutable)
      state.selectedElements = state.selectedElements.concat([{ element: event.target, context: context }]);
    }

    updateSelectionIndicators();

    // Send the toggled element context to the parent
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
          if (state.mode !== 'inspection' && state.mode !== 'edit') {
            hideOverlay();
          }
          // Set cursor based on active mode
          var cursorMap = {
            interaction: 'default',
            inspection: 'crosshair',
            edit: 'crosshair',
            screenshot: 'crosshair'
          };
          document.body.style.cursor = cursorMap[state.mode] || 'default';
        }
        break;

      case 'CAPTURE_SCREENSHOT':
        captureScreenshot(payload || {});
        break;

      case 'CAPTURE_ELEMENT':
        if (state.selectedElements.length > 0) {
          var lastEntry = state.selectedElements[state.selectedElements.length - 1];
          captureScreenshot({ selector: lastEntry.context.selector });
        }
        break;

      case 'CLEAR_SELECTION':
        state.selectedElements = [];
        removeAllSelectionIndicators();
        break;

      case 'APPLY_EDIT': {
        if (!payload || !payload.selector || !payload.property) break;
        if (!validateSelector(payload.selector)) break;
        var el = document.querySelector(payload.selector);
        if (!el) break;

        // Initialize tracking for this selector if needed
        if (!pendingEdits.has(payload.selector)) {
          pendingEdits.set(payload.selector, new Map());
        }
        var propMap = pendingEdits.get(payload.selector);

        // Store original value on first edit of this property
        if (!propMap.has(payload.property)) {
          var originalValue = payload.property === 'textContent'
            ? el.textContent
            : el.style[payload.property];
          propMap.set(payload.property, { original: originalValue, current: payload.value });
        } else {
          var entry = propMap.get(payload.property);
          propMap.set(payload.property, { original: entry.original, current: payload.value });
        }

        // Apply the edit
        if (payload.property === 'textContent') {
          el.textContent = payload.value;
        } else {
          el.style[payload.property] = payload.value;
        }

        sendToParent('EDIT_APPLIED', {
          selector: payload.selector,
          property: payload.property,
          value: payload.value
        });
        break;
      }

      case 'REVERT_EDITS': {
        pendingEdits.forEach(function(propMap, selector) {
          if (!validateSelector(selector)) return;
          var el = document.querySelector(selector);
          if (!el) return;
          propMap.forEach(function(record, property) {
            if (property === 'textContent') {
              el.textContent = record.original;
            } else {
              el.style[property] = record.original || '';
            }
          });
        });
        pendingEdits.clear();
        sendToParent('EDITS_REVERTED', { all: true });
        break;
      }

      case 'REVERT_ELEMENT': {
        if (!payload || !payload.selector) break;
        var elementPropMap = pendingEdits.get(payload.selector);
        if (!elementPropMap) break;
        if (!validateSelector(payload.selector)) break;
        var revertEl = document.querySelector(payload.selector);
        if (revertEl) {
          elementPropMap.forEach(function(record, property) {
            if (property === 'textContent') {
              revertEl.textContent = record.original;
            } else {
              revertEl.style[property] = record.original || '';
            }
          });
        }
        pendingEdits.delete(payload.selector);
        sendToParent('EDITS_REVERTED', { selector: payload.selector });
        break;
      }

      case 'GET_COMPUTED_STYLES': {
        if (!payload || !payload.selector) break;
        if (!validateSelector(payload.selector)) break;
        var styleEl = document.querySelector(payload.selector);
        if (!styleEl) break;
        var computed = window.getComputedStyle(styleEl);
        var childContents = [];
        var directChildren = styleEl.children;
        if (directChildren.length > 0) {
          for (var ci = 0; ci < directChildren.length; ci++) {
            var child = directChildren[ci];
            var childText = child.textContent ? child.textContent.trim() : '';
            if (childText) {
              childContents.push({
                tag: child.tagName.toLowerCase(),
                text: childText,
                selector: generateSelector(child)
              });
            }
          }
        }
        var styles = {
          color: computed.color,
          backgroundColor: computed.backgroundColor,
          borderColor: computed.borderColor,
          fontFamily: computed.fontFamily,
          fontSize: computed.fontSize,
          fontWeight: computed.fontWeight,
          lineHeight: computed.lineHeight,
          letterSpacing: computed.letterSpacing,
          textContent: styleEl.textContent,
          childContents: childContents.length > 0 ? JSON.stringify(childContents) : '',
          marginTop: computed.marginTop,
          marginRight: computed.marginRight,
          marginBottom: computed.marginBottom,
          marginLeft: computed.marginLeft,
          paddingTop: computed.paddingTop,
          paddingRight: computed.paddingRight,
          paddingBottom: computed.paddingBottom,
          paddingLeft: computed.paddingLeft,
          display: computed.display,
          width: computed.width,
          height: computed.height,
          flexDirection: computed.flexDirection,
          alignItems: computed.alignItems,
          justifyContent: computed.justifyContent,
          gap: computed.gap,
          opacity: computed.opacity,
          backgroundImage: computed.backgroundImage,
          borderWidth: computed.borderWidth,
          borderStyle: computed.borderStyle,
          borderTopLeftRadius: computed.borderTopLeftRadius,
          borderTopRightRadius: computed.borderTopRightRadius,
          borderBottomRightRadius: computed.borderBottomRightRadius,
          borderBottomLeftRadius: computed.borderBottomLeftRadius,
          boxShadow: computed.boxShadow,
          filter: computed.filter,
          backdropFilter: computed.backdropFilter,
          mixBlendMode: computed.mixBlendMode,
          transform: computed.transform,
          transformOrigin: computed.transformOrigin,
          textAlign: computed.textAlign,
          textDecoration: computed.textDecoration,
          textTransform: computed.textTransform,
          whiteSpace: computed.whiteSpace,
          wordSpacing: computed.wordSpacing,
          position: computed.position,
          top: computed.top,
          right: computed.right,
          bottom: computed.bottom,
          left: computed.left,
          zIndex: computed.zIndex,
          overflowX: computed.overflowX,
          overflowY: computed.overflowY,
          cursor: computed.cursor,
          gridTemplateColumns: computed.gridTemplateColumns,
          gridTemplateRows: computed.gridTemplateRows,
          gridGap: computed.gridGap || computed.gap,
          flexWrap: computed.flexWrap,
          flexGrow: computed.flexGrow,
          flexShrink: computed.flexShrink,
          flexBasis: computed.flexBasis,
          minWidth: computed.minWidth,
          maxWidth: computed.maxWidth,
          minHeight: computed.minHeight,
          maxHeight: computed.maxHeight,
          transition: computed.transition
        };
        sendToParent('COMPUTED_STYLES', { selector: payload.selector, styles: styles });
        break;
      }

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
    getSourceLocation: getSourceLocation,
    getReactFiber: getReactFiber,
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
