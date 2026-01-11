/**
 * Gemini Navigator - Chrome Extension
 * Content script for gemini.google.com
 * 
 * Provides a floating navigation menu to quickly jump to messages
 * in Gemini AI conversations.
 */

(function () {
    'use strict';

    // Chrome compatibility shim
    if (typeof browser === 'undefined') {
        var browser = chrome;
    }

    // ============================================
    // Configuration
    // ============================================
    const CONFIG = {
        // Minimum messages before showing menu
        minMessages: 3,

        // Debounce delay for DOM updates (ms)
        debounceDelay: 300,

        // Default menu position
        defaultPosition: { x: 20, y: 100 },

        // Default menu size
        defaultSize: { width: 320, height: 450 },

        // CSS selectors to find user messages in Gemini
        userMessageSelectors: [
            '[data-message-author-role="user"]',
            '.user-query',
            '.query-text',
            '.user-message',
            'message-content[data-role="user"]',
            '.conversation-turn.user-turn',
            '[class*="user"][class*="message"]',
            '[class*="query"]'
        ],

        // CSS selectors to find AI/model messages in Gemini
        aiMessageSelectors: [
            '[data-message-author-role="model"]',
            '[data-message-author-role="assistant"]',
            '.model-response',
            '.assistant-message',
            'message-content[data-role="model"]',
            '.conversation-turn.model-turn',
            '[class*="model"][class*="response"]',
            '[class*="response"]'
        ],

        // Container for conversation
        conversationContainerSelectors: [
            '.conversation-container',
            '.chat-container',
            'main',
            '[role="main"]'
        ]
    };

    // ============================================
    // State
    // ============================================
    let menuElement = null;
    let menuListElement = null;
    let isResizing = false;
    let isMenuClosed = false;  // Track if user manually closed the menu
    let isMinimized = true;    // Default to minimized mode
    let currentQuestions = [];
    let observer = null;
    let debounceTimer = null;

    // ============================================
    // Storage Helpers (Promise-based for Firefox)
    // ============================================
    const Storage = {
        async get(keys) {
            try {
                return await browser.storage.local.get(keys);
            } catch (e) {
                console.warn('[Gemini Navigator] Storage get error:', e);
                return {};
            }
        },

        async set(data) {
            try {
                await browser.storage.local.set(data);
            } catch (e) {
                console.warn('[Gemini Navigator] Storage set error:', e);
            }
        }
    };

    // ============================================
    // Message Detection (Both User and AI)
    // ============================================
    function findMessages(selectors, role) {
        const elements = [];

        for (const selector of selectors) {
            try {
                const found = document.querySelectorAll(selector);
                found.forEach(el => {
                    // Check if this element is not already added or is not a child of an already added element
                    const isDuplicate = elements.some(existing =>
                        existing === el || existing.contains(el) || el.contains(existing)
                    );
                    if (!isDuplicate) {
                        elements.push(el);
                    }
                });
            } catch (e) {
                // Invalid selector, skip
            }
        }

        return elements.map(el => ({ element: el, role: role }));
    }

    function findAllMessages() {
        const userMessages = findMessages(CONFIG.userMessageSelectors, 'user');
        const aiMessages = findMessages(CONFIG.aiMessageSelectors, 'ai');

        // Combine all messages
        let allMessages = [...userMessages, ...aiMessages];

        // Remove duplicates by checking if elements are nested or have same text
        const seenTexts = new Set();
        allMessages = allMessages.filter(msg => {
            const text = msg.element.textContent?.trim().substring(0, 100) || '';
            if (text.length < 5 || seenTexts.has(text)) {
                return false;
            }
            seenTexts.add(text);
            return true;
        });

        // Sort by document order
        allMessages.sort((a, b) => {
            const position = a.element.compareDocumentPosition(b.element);
            if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
            if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
            return 0;
        });

        return allMessages;
    }

    function extractMessageText(element) {
        let text = element.textContent?.trim() || '';

        // Truncate long text
        if (text.length > 60) {
            text = text.substring(0, 57) + '...';
        }

        return text;
    }

    function updateMessages() {
        const messageElements = findAllMessages();

        currentQuestions = messageElements.map((msg, index) => ({
            element: msg.element,
            text: extractMessageText(msg.element),
            role: msg.role,
            index: index + 1
        })).filter(q => q.text.length > 0);

        updateMenuUI();
    }

    // ============================================
    // Menu UI
    // ============================================
    function createMenu() {
        // Remove existing menu if any
        if (menuElement) {
            menuElement.remove();
        }

        // Create menu container
        menuElement = document.createElement('div');
        menuElement.id = 'gemini-navigator-menu';
        menuElement.innerHTML = `
      <div class="gemini-nav-header">
        <span class="gemini-nav-title">📍 Navigator</span>
        <div class="gemini-nav-controls">
          <button class="gemini-nav-btn gemini-nav-minimize" title="Minimize">−</button>
          <button class="gemini-nav-btn gemini-nav-close" title="Close">×</button>
        </div>
      </div>
      <div class="gemini-nav-content">
        <ul class="gemini-nav-list"></ul>
      </div>
      <div class="gemini-nav-resize-handle"></div>
    `;

        document.body.appendChild(menuElement);

        // Get references
        menuListElement = menuElement.querySelector('.gemini-nav-list');

        // Setup event listeners
        setupMenuEvents();

        return menuElement;
    }

    function setupMenuEvents() {
        const closeBtn = menuElement.querySelector('.gemini-nav-close');
        const minimizeBtn = menuElement.querySelector('.gemini-nav-minimize');
        const resizeHandle = menuElement.querySelector('.gemini-nav-resize-handle');

        // Resize functionality
        resizeHandle.addEventListener('mousedown', startResize);
        document.addEventListener('mousemove', onResize);
        document.addEventListener('mouseup', stopResize);

        // Close button
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            isMenuClosed = true;
            menuElement.style.display = 'none';
        });

        // Minimize button
        minimizeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMinimize();
        });
    }

    function toggleMinimize() {
        const content = menuElement.querySelector('.gemini-nav-content');
        const resizeHandle = menuElement.querySelector('.gemini-nav-resize-handle');
        const minimizeBtn = menuElement.querySelector('.gemini-nav-minimize');
        const closeBtn = menuElement.querySelector('.gemini-nav-close');
        const title = menuElement.querySelector('.gemini-nav-title');

        isMinimized = !isMinimized;

        if (isMinimized) {
            // Save current size before minimizing
            saveMenuState();

            // Transform into floating icon
            menuElement.classList.add('minimized');
            content.style.display = 'none';
            resizeHandle.style.display = 'none';
            closeBtn.style.display = 'none';
            title.style.display = 'none';
            minimizeBtn.textContent = '📍';
            minimizeBtn.title = 'Expand Navigator';

            // Move to right side center
            menuElement.style.width = 'auto';
            menuElement.style.height = 'auto';
            menuElement.style.right = '10px';
            menuElement.style.top = '50%';
            menuElement.style.transform = 'translateY(-50%)';
        } else {
            // Restore full menu
            menuElement.classList.remove('minimized');
            content.style.display = '';
            resizeHandle.style.display = '';
            closeBtn.style.display = '';
            title.style.display = '';
            minimizeBtn.textContent = '−';
            minimizeBtn.title = 'Minimize';

            // Reset to normal position (fixed right side)
            menuElement.style.right = '10px';
            menuElement.style.top = '100px';
            menuElement.style.transform = 'none';

            // Restore saved size
            loadMenuState();
        }
    }

    function updateMenuUI() {
        if (!menuElement) {
            createMenu();
        }

        // Don't reopen if user manually closed it
        if (isMenuClosed) {
            return;
        }

        // Check if we should show the menu
        if (currentQuestions.length < CONFIG.minMessages) {
            menuElement.style.display = 'none';
            return;
        }

        menuElement.style.display = 'flex';

        // Update list with role indicators
        menuListElement.innerHTML = currentQuestions.map(q => `
      <li class="gemini-nav-item gemini-nav-${q.role}" data-index="${q.index - 1}">
        <span class="gemini-nav-role gemini-nav-role-${q.role}">${q.role === 'user' ? 'U' : 'A'}</span>
        <span class="gemini-nav-text">${escapeHtml(q.text)}</span>
      </li>
    `).join('');

        // Add click handlers
        menuListElement.querySelectorAll('.gemini-nav-item').forEach(item => {
            item.addEventListener('click', () => {
                const index = parseInt(item.dataset.index);
                scrollToQuestion(index);
            });
        });
    }

    function scrollToQuestion(index) {
        const question = currentQuestions[index];
        if (!question || !question.element) return;

        // Scroll to element
        question.element.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
        });

        // Highlight briefly
        question.element.classList.add('gemini-nav-highlight');
        setTimeout(() => {
            question.element.classList.remove('gemini-nav-highlight');
        }, 2000);
    }

    // ============================================
    // Resize
    // ============================================

    function startResize(e) {
        isResizing = true;
        menuElement.classList.add('resizing');
        e.preventDefault();
    }

    function onResize(e) {
        if (!isResizing) return;

        const rect = menuElement.getBoundingClientRect();
        const width = Math.max(200, e.clientX - rect.left);
        const height = Math.max(150, e.clientY - rect.top);

        menuElement.style.width = width + 'px';
        menuElement.style.height = height + 'px';
    }

    function stopResize() {
        if (isResizing) {
            isResizing = false;
            menuElement.classList.remove('resizing');
            saveMenuState();
        }
    }

    // ============================================
    // State Persistence
    // ============================================
    async function saveMenuState() {
        if (!menuElement) return;

        const rect = menuElement.getBoundingClientRect();
        await Storage.set({
            geminiNavSize: { width: rect.width, height: rect.height }
        });
    }

    async function loadMenuState() {
        const data = await Storage.get(['geminiNavSize']);
        const size = data.geminiNavSize || CONFIG.defaultSize;

        menuElement.style.width = size.width + 'px';
        menuElement.style.height = size.height + 'px';
    }

    // ============================================
    // DOM Observation
    // ============================================
    function setupObserver() {
        if (observer) {
            observer.disconnect();
        }

        observer = new MutationObserver(() => {
            // Debounce updates
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(updateMessages, CONFIG.debounceDelay);
        });

        // Observe the entire document for changes
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    function setupURLObserver() {
        let lastUrl = location.href;

        // Check for URL changes periodically (for SPA navigation)
        setInterval(() => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                console.log('[Gemini Navigator] URL changed, refreshing...');

                // Reset and re-scan
                currentQuestions = [];
                setTimeout(updateMessages, 500);
            }
        }, 1000);
    }

    // ============================================
    // Utilities
    // ============================================
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ============================================
    // Initialization
    // ============================================
    function init() {
        console.log('[Gemini Navigator] Initializing...');

        // Wait a bit for page to load
        setTimeout(() => {
            createMenu();
            updateMessages();
            setupObserver();
            setupURLObserver();

            // Apply minimized state by default
            applyMinimizedState();

            console.log('[Gemini Navigator] Ready!');
        }, 1000);
    }

    function applyMinimizedState() {
        if (!menuElement) return;

        const content = menuElement.querySelector('.gemini-nav-content');
        const resizeHandle = menuElement.querySelector('.gemini-nav-resize-handle');
        const minimizeBtn = menuElement.querySelector('.gemini-nav-minimize');
        const closeBtn = menuElement.querySelector('.gemini-nav-close');
        const title = menuElement.querySelector('.gemini-nav-title');

        if (isMinimized) {
            menuElement.classList.add('minimized');
            content.style.display = 'none';
            resizeHandle.style.display = 'none';
            closeBtn.style.display = 'none';
            title.style.display = 'none';
            minimizeBtn.textContent = '📍';
            minimizeBtn.title = 'Expand Navigator';

            menuElement.style.width = 'auto';
            menuElement.style.height = 'auto';
            menuElement.style.right = '10px';
            menuElement.style.left = 'auto';
            menuElement.style.top = '50%';
            menuElement.style.transform = 'translateY(-50%)';
        }
    }

    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
