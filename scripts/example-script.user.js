// ==UserScript==
// @name         Example — Version Badge
// @version      1.0.0
// @description  Демо-скрипт: показывает текущую версию в углу страницы — удобно проверить, что автообновление из GitHub работает
// @author       Cory
// @match        https://example.com/*
// @run-at       document-idle
// @noframes
// @grant        none
// ==/UserScript==

(() => {
    'use strict';

    const BADGE_ID = 'cory-userscript-version-badge';

    const render = () => {
        if (document.getElementById(BADGE_ID)) return;

        const { name, version } = GM_info?.script ?? {};

        const badge = document.createElement('div');
        badge.id = BADGE_ID;
        badge.textContent = `${name ?? 'userscript'} v${version ?? '?'}`;
        Object.assign(badge.style, {
            position: 'fixed',
            right: '12px',
            bottom: '12px',
            zIndex: '2147483647',
            padding: '6px 10px',
            borderRadius: '6px',
            font: '12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace',
            color: '#fff',
            background: 'rgba(17, 17, 17, .85)',
            pointerEvents: 'none',
            userSelect: 'none',
        });

        document.body?.append(badge);
    };

    render();

    // Страница может перерисоваться (SPA) — возвращаем бейдж на место.
    const observer = new MutationObserver(() => {
        if (!document.getElementById(BADGE_ID)) render();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
})();
