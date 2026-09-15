// ==UserScript==
// @name         New Script
// @version      1.0.0
// @description  Что делает скрипт
// @author       Cory
// @match        https://example.com/*
// @run-at       document-idle
// @noframes
// ==/UserScript==

// @namespace / @downloadURL / @updateURL / @homepageURL / @supportURL проставит GitHub Action.
// Скопируй файл в scripts/ под именем вида my-script.user.js.

(() => {
    'use strict';

    /* ------------------------------------------------------------------ *
     *  Хелперы: устойчивый поиск элементов, в том числе внутри Shadow DOM
     * ------------------------------------------------------------------ */

    /**
     * querySelector, проходящий сквозь open shadowRoot на любой глубине.
     * @param {string} selector
     * @param {Document|ShadowRoot|Element} [root=document]
     * @returns {Element|null}
     */
    const deepQuery = (selector, root = document) => {
        const direct = root.querySelector?.(selector);
        if (direct) return direct;

        const walkRoot = root.nodeType === Node.DOCUMENT_NODE ? root.documentElement : root;
        if (!walkRoot) return null;

        const walker = document.createTreeWalker(walkRoot, NodeFilter.SHOW_ELEMENT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const shadow = node.shadowRoot;
            if (!shadow) continue;
            const found = deepQuery(selector, shadow);
            if (found) return found;
        }
        return null;
    };

    /**
     * querySelectorAll, проходящий сквозь open shadowRoot на любой глубине.
     * @param {string} selector
     * @param {Document|ShadowRoot|Element} [root=document]
     * @returns {Element[]}
     */
    const deepQueryAll = (selector, root = document) => {
        const result = [...(root.querySelectorAll?.(selector) ?? [])];

        const walkRoot = root.nodeType === Node.DOCUMENT_NODE ? root.documentElement : root;
        if (!walkRoot) return result;

        const walker = document.createTreeWalker(walkRoot, NodeFilter.SHOW_ELEMENT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            if (node.shadowRoot) result.push(...deepQueryAll(selector, node.shadowRoot));
        }
        return result;
    };

    /**
     * Ждёт появления элемента. MutationObserver не видит внутрь shadowRoot,
     * поэтому дополнительно подстраховываемся коротким поллингом.
     * @param {string} selector
     * @param {{ timeout?: number, root?: Document|ShadowRoot|Element, poll?: number }} [options]
     * @returns {Promise<Element>}
     */
    const waitForElement = (selector, { timeout = 15_000, root = document, poll = 250 } = {}) =>
        new Promise((resolve, reject) => {
            const found = deepQuery(selector, root);
            if (found) return resolve(found);

            let observer = null;
            let interval = 0;
            let timer = 0;

            const cleanup = () => {
                observer?.disconnect();
                clearInterval(interval);
                clearTimeout(timer);
            };

            const check = () => {
                const el = deepQuery(selector, root);
                if (!el) return false;
                cleanup();
                resolve(el);
                return true;
            };

            const target = root.nodeType === Node.DOCUMENT_NODE ? root.documentElement : root;
            observer = new MutationObserver(check);
            observer.observe(target, { childList: true, subtree: true });
            interval = setInterval(check, poll);

            timer = setTimeout(() => {
                cleanup();
                reject(new Error(`waitForElement: "${selector}" не появился за ${timeout} мс`));
            }, timeout);
        });

    /**
     * Реагирует на появление новых элементов (SPA, бесконечные списки).
     * @param {string} selector
     * @param {(el: Element) => void} callback
     * @returns {MutationObserver}
     */
    const observeElements = (selector, callback) => {
        const seen = new WeakSet();

        const scan = () => {
            for (const el of deepQueryAll(selector)) {
                if (seen.has(el)) continue;
                seen.add(el);
                try {
                    callback(el);
                } catch (error) {
                    console.error('[userscript] callback error:', error);
                }
            }
        };

        const observer = new MutationObserver(scan);
        observer.observe(document.documentElement, { childList: true, subtree: true });
        scan();
        return observer;
    };

    /** Реагирует на смену URL в SPA (history API + popstate). */
    const onUrlChange = (callback) => {
        let last = location.href;
        const fire = () => {
            if (location.href === last) return;
            last = location.href;
            callback(location.href);
        };

        for (const method of ['pushState', 'replaceState']) {
            const original = history[method];
            history[method] = function (...args) {
                const result = original.apply(this, args);
                queueMicrotask(fire);
                return result;
            };
        }
        addEventListener('popstate', fire);
    };

    /* ------------------------------------------------------------------ *
     *  Логика
     * ------------------------------------------------------------------ */

    const init = async () => {
        // const target = await waitForElement('.some-selector');
        // ...
    };

    init().catch((error) => console.error('[userscript] init failed:', error));
})();
