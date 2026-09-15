#!/usr/bin/env node
/**
 * Сборка userscripts-репозитория:
 *  1. подставляет @downloadURL / @updateURL / @homepageURL / @supportURL из GITHUB_REPOSITORY;
 *  2. поднимает @version (последний сегмент), если файл изменился, а версию не тронули руками;
 *  3. генерирует *.meta.js рядом с каждым *.user.js;
 *  4. пересобирает таблицу скриптов в README.md между маркерами.
 *
 * Зависимостей нет — только Node 18+ и git.
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const SCRIPTS_DIR = 'scripts';
const README = 'README.md';
const REPO = process.env.GITHUB_REPOSITORY ?? 'OWNER/REPO';
const BRANCH = process.env.GITHUB_REF_NAME ?? 'main';

const HOME_URL = `https://github.com/${REPO}`;
const rawUrl = (file) =>
    `https://raw.githubusercontent.com/${REPO}/${BRANCH}/` +
    file.split('/').map(encodeURIComponent).join('/');

const META_RE = /^\/\/ ==UserScript==[ \t]*\r?\n[\s\S]*?^\/\/ ==\/UserScript==[ \t]*$/m;

const getMeta = (block, key) =>
    block.match(new RegExp(`^// @${key}[ \\t]+(.*)$`, 'm'))?.[1]?.trim() ?? null;

const setMeta = (block, key, value) => {
    const line = `// @${key}`.padEnd(17, ' ') + value;
    const re = new RegExp(`^// @${key}[ \\t]+.*$`, 'm');
    return re.test(block)
        ? block.replace(re, line)
        : block.replace(/^\/\/ ==\/UserScript==[ \t]*$/m, `${line}\n// ==/UserScript==`);
};

const bumpVersion = (version) => {
    const parts = String(version).trim().split('.');
    const last = Number.parseInt(parts.at(-1), 10);
    if (!Number.isFinite(last)) return null;
    parts[parts.length - 1] = String(last + 1);
    return parts.join('.');
};

/* ---------- git ---------- */

const git = (cmd) => {
    try {
        return execSync(`git ${cmd}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
        return null;
    }
};

const hasParent = git('rev-parse --verify HEAD~1') !== null;
const changedFiles = new Set(
    hasParent ? (git('diff --name-only HEAD~1 HEAD') ?? '').split('\n').filter(Boolean) : [],
);
const fileAtParent = (file) => (hasParent ? git(`show HEAD~1:"${file}"`) : null);

/* ---------- сборка ---------- */

if (!existsSync(SCRIPTS_DIR)) {
    console.error(`Папка ${SCRIPTS_DIR}/ не найдена`);
    process.exit(0);
}

const userscripts = readdirSync(SCRIPTS_DIR)
    .filter((name) => name.endsWith('.user.js'))
    .sort();

const index = [];

for (const name of userscripts) {
    const file = `${SCRIPTS_DIR}/${name}`;
    const metaFile = file.replace(/\.user\.js$/, '.meta.js');
    const source = readFileSync(file, 'utf8');
    const match = source.match(META_RE);

    if (!match) {
        console.error(`⚠️  ${file}: не найден блок ==UserScript== — пропускаю`);
        continue;
    }

    let block = match[0];

    if (!getMeta(block, 'name')) console.error(`⚠️  ${file}: нет @name`);
    if (!getMeta(block, 'match') && !getMeta(block, 'include')) {
        console.error(`⚠️  ${file}: нет @match/@include`);
    }

    /* --- версия --- */
    let version = getMeta(block, 'version') ?? '1.0.0';
    const prevSource = fileAtParent(file);
    const prevVersion = prevSource ? getMeta(prevSource.match(META_RE)?.[0] ?? '', 'version') : null;

    if (changedFiles.has(file) && prevVersion !== null && prevVersion === version) {
        const next = bumpVersion(version);
        if (next) {
            console.log(`⬆️  ${name}: ${version} → ${next}`);
            version = next;
        } else {
            console.error(`⚠️  ${file}: не смог распарсить @version "${version}"`);
        }
    }
    block = setMeta(block, 'version', version);

    /* --- служебные поля --- */
    if (!getMeta(block, 'namespace')) block = setMeta(block, 'namespace', HOME_URL);
    if (!getMeta(block, 'author')) block = setMeta(block, 'author', 'Cory');
    block = setMeta(block, 'homepageURL', HOME_URL);
    block = setMeta(block, 'supportURL', `${HOME_URL}/issues`);
    block = setMeta(block, 'downloadURL', rawUrl(file));
    block = setMeta(block, 'updateURL', rawUrl(metaFile));

    const updated = source.replace(META_RE, block);
    if (updated !== source) writeFileSync(file, updated);

    const metaContent = `${block}\n`;
    if (!existsSync(metaFile) || readFileSync(metaFile, 'utf8') !== metaContent) {
        writeFileSync(metaFile, metaContent);
    }

    index.push({
        name: getMeta(block, 'name') ?? name,
        description: (getMeta(block, 'description') ?? '').replaceAll('|', '\\|'),
        version,
        install: rawUrl(file),
        source: `${HOME_URL}/blob/${BRANCH}/${file}`,
    });
}

/* ---------- README ---------- */

if (existsSync(README)) {
    const readme = readFileSync(README, 'utf8');
    const table = [
        '| Скрипт | Описание | Версия | |',
        '| --- | --- | --- | --- |',
        ...index.map(
            (s) =>
                `| [${s.name}](${s.source}) | ${s.description} | \`${s.version}\` | [⬇️ Установить](${s.install}) |`,
        ),
    ].join('\n');

    const body = index.length ? table : '_Пока пусто._';
    const next = readme.replace(
        /(<!-- SCRIPTS:START -->)[\s\S]*?(<!-- SCRIPTS:END -->)/,
        `$1\n\n${body}\n\n$2`,
    );
    if (next !== readme) writeFileSync(README, next);
}

console.log(`Готово: ${index.length} скрипт(ов), repo=${REPO}, branch=${BRANCH}`);
