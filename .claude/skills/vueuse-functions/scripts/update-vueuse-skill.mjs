#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_OWNER = 'vueuse';
const DEFAULT_REPO = 'vueuse';
const DEFAULT_REF = 'main';
const START_MARKER = '<!-- BEGIN GENERATED VUEUSE CATALOGUE -->';
const END_MARKER = '<!-- END GENERATED VUEUSE CATALOGUE -->';
const CATALOGUE_HEADING = '## Vendored VueUse function catalogue';
const SCRIPT_PATH = '.claude/skills/vueuse-functions/scripts/update-vueuse-skill.mjs';

function main() {
    const options = parseArgs(process.argv.slice(2));
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    const skillDir = path.resolve(scriptDir, '..');
    const skillPath = path.join(skillDir, 'SKILL.md');
    const referencesDir = path.join(skillDir, 'references');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vueuse-skill-'));

    try {
        const upstreamRepoDir = checkoutSparseRepo(tempDir, options);
        const upstreamSkillPath = path.join(upstreamRepoDir, 'skills', 'vueuse-functions', 'SKILL.md');
        const upstreamReferencesDir = path.join(upstreamRepoDir, 'skills', 'vueuse-functions', 'references');

        const upstreamSkill = fs.readFileSync(upstreamSkillPath, 'utf8');
        const upstreamReferences = loadUpstreamReferences(upstreamReferencesDir);
        const { generatedBody, referencedReferenceNames } = buildGeneratedCatalogue(
            stripFrontmatterAndTitle(upstreamSkill),
            upstreamReferences,
            options,
        );

        writeReferences(referencesDir, upstreamReferences, referencedReferenceNames);
        rewriteSkill(skillPath, generatedBody, options);

        console.log(`Updated ${skillPath}`);
        console.log(`Vendored upstream references written: ${referencedReferenceNames.length}`);
    }
    finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
}

function parseArgs(args) {
    const options = {
        owner: DEFAULT_OWNER,
        repo: DEFAULT_REPO,
        ref: DEFAULT_REF,
    };

    for (let index = 0; index < args.length; index++) {
        const arg = args[index];

        if (arg === '-h' || arg === '--help') {
            printHelp();
            process.exit(0);
        }

        if (arg.startsWith('--owner=')) {
            options.owner = arg.slice('--owner='.length);
            continue;
        }

        if (arg.startsWith('--repo=')) {
            options.repo = arg.slice('--repo='.length);
            continue;
        }

        if (arg.startsWith('--ref=')) {
            options.ref = arg.slice('--ref='.length);
            continue;
        }

        if (arg === '--owner' || arg === '--repo' || arg === '--ref') {
            const next = args[index + 1];
            if (!next || next.startsWith('-')) {
                throw new Error(`Missing value for ${arg}.`);
            }

            if (arg === '--owner') {
                options.owner = next;
            }
            else if (arg === '--repo') {
                options.repo = next;
            }
            else {
                options.ref = next;
            }

            index++;
            continue;
        }

        throw new Error(`Unknown argument: ${arg}`);
    }

    return options;
}

function printHelp() {
    console.log(`Usage: node ${SCRIPT_PATH} [--owner <owner>] [--repo <repo>] [--ref <ref>]

Refresh the vendored vueuse-functions skill and references from vueuse/vueuse.

Options:
  --owner <owner>  GitHub owner to fetch from. Default: ${DEFAULT_OWNER}
  --repo <repo>    GitHub repository to fetch from. Default: ${DEFAULT_REPO}
  --ref <ref>      Git ref to vendor (branch, tag, or other fetchable ref). Default: ${DEFAULT_REF}

Notes:
  - The script preserves Symprex guidance outside the generated markers.
  - The generated section keeps only supported catalogue entries.
  - Unsupported external pointer targets are stripped instead of being vendored as placeholders.
`);
}

function checkoutSparseRepo(tempDir, options) {
    const repoDir = path.join(tempDir, 'upstream');
    fs.mkdirSync(repoDir, { recursive: true });

    runGit(['init'], repoDir);
    runGit(['remote', 'add', 'origin', `https://github.com/${options.owner}/${options.repo}.git`], repoDir);
    runGit(['sparse-checkout', 'init', '--cone'], repoDir);
    runGit(['sparse-checkout', 'set', 'skills/vueuse-functions'], repoDir);
    runGit(['fetch', '--depth', '1', 'origin', options.ref], repoDir);
    runGit(['checkout', '--detach', 'FETCH_HEAD'], repoDir);

    return repoDir;
}

function runGit(args, cwd) {
    try {
        execFileSync('git', args, {
            cwd,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
    }
    catch (error) {
        const stderr = error.stderr?.toString?.() ?? '';
        const stdout = error.stdout?.toString?.() ?? '';
        const details = [stderr.trim(), stdout.trim()].filter(Boolean).join('\n');
        throw new Error(`Git command failed: git ${args.join(' ')}\n${details}`.trim());
    }
}

function loadUpstreamReferences(referencesDir) {
    const references = {};

    for (const entry of fs.readdirSync(referencesDir, { withFileTypes: true })) {
        if (entry.isFile() === false || path.extname(entry.name) !== '.md') {
            continue;
        }

        const content = fs.readFileSync(path.join(referencesDir, entry.name), 'utf8');
        references[entry.name] = sanitizeMarkdown(rewriteReferenceLinks(content));
    }

    return Object.fromEntries(
        Object.entries(references).sort(([left], [right]) => left.localeCompare(right)),
    );
}

function buildGeneratedCatalogue(upstreamBody, upstreamReferences, options) {
    const availableReferenceNames = Object.keys(upstreamReferences);
    const filteredBody = filterExternalCatalogueSections(upstreamBody);
    const rewrittenBody = rewriteCatalogueLinks(rewriteSkillLinks(filteredBody), availableReferenceNames);
    const sanitizedBody = sanitizeMarkdown(rewrittenBody).trimEnd() + '\n';
    const referencedReferenceNames = extractReferencedReferenceNames(sanitizedBody);

    const generatedNote = [
        `> Generated from \`${options.owner}/${options.repo}@${options.ref}\` by \`${SCRIPT_PATH}\`.`,
        '> Edit the Symprex guidance outside the generated markers; rerun the script to refresh this catalogue.',
        '',
    ].join('\n');

    return {
        generatedBody: generatedNote + sanitizedBody,
        referencedReferenceNames,
    };
}

function filterExternalCatalogueSections(text) {
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    const output = [];

    for (let index = 0; index < lines.length;) {
        if (lines[index].includes('`EXTERNAL`:')) {
            index++;
            continue;
        }

        if (
            lines[index].startsWith('### ')
            && lines[index + 1] === ''
            && lines[index + 2]?.startsWith('| Function | Description | Invocation |')
            && lines[index + 3]?.startsWith('|----------|-------------|------------|')
        ) {
            const heading = lines[index];
            const tableHeader = lines[index + 2];
            const tableSeparator = lines[index + 3];
            const rows = [];
            let cursor = index + 4;

            while (cursor < lines.length && lines[cursor].startsWith('|')) {
                if (isExternalInvocationRow(lines[cursor]) == false) {
                    rows.push(lines[cursor]);
                }

                cursor++;
            }

            while (cursor < lines.length && lines[cursor] === '') {
                cursor++;
            }

            if (rows.length > 0) {
                output.push(
                    heading,
                    '',
                    tableHeader,
                    tableSeparator,
                    ...rows,
                    '',
                );
            }

            index = cursor;
            continue;
        }

        output.push(lines[index]);
        index++;
    }

    return output.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

function isExternalInvocationRow(line) {
    return /\|\s*EXTERNAL\s*\|$/.test(line.trim());
}

function rewriteCatalogueLinks(text, availableReferenceNames) {
    const available = new Set(availableReferenceNames);

    return text.replace(/\[([^\]]+)\]\((?:\.\/)?references\/([^)]+)\)/g, (_match, label, referenceTarget) => {
        const referenceName = path.posix.basename(referenceTarget);
        if (available.has(referenceName)) {
            return `[${label}](./references/${referenceName})`;
        }

        return label;
    });
}

function extractReferencedReferenceNames(text) {
    const references = new Set();

    for (const match of text.matchAll(/\]\((?:\.\/)?references\/([^)]+)\)/g)) {
        references.add(path.posix.basename(match[1]));
    }

    return [...references].sort((left, right) => left.localeCompare(right));
}

function writeReferences(referencesDir, upstreamReferences, referencedReferenceNames) {
    fs.mkdirSync(referencesDir, { recursive: true });

    for (const entry of fs.readdirSync(referencesDir, { withFileTypes: true })) {
        if (entry.isFile() && path.extname(entry.name) === '.md') {
            fs.rmSync(path.join(referencesDir, entry.name), { force: true });
        }
    }

    const allReferences = {};
    for (const name of referencedReferenceNames) {
        if (!(name in upstreamReferences)) {
            throw new Error(`Missing vendored reference for ${name}.`);
        }

        allReferences[name] = upstreamReferences[name];
    }

    for (const [name, content] of Object.entries(allReferences)) {
        fs.writeFileSync(path.join(referencesDir, name), toCrLf(content), 'utf8');
    }
}

function rewriteSkill(skillPath, generatedBody, options) {
    const current = fs.readFileSync(skillPath, 'utf8');
    const maintainerNote = buildMaintainerNote(options);

    if (current.includes(START_MARKER) && current.includes(END_MARKER)) {
        const startIndex = current.indexOf(START_MARKER) + START_MARKER.length;
        const updated = `${current.slice(0, startIndex)}\n\n${generatedBody}\n${END_MARKER}\n\n${maintainerNote}\n`;
        fs.writeFileSync(skillPath, toCrLf(updated), 'utf8');
        return;
    }

    if (current.includes(CATALOGUE_HEADING) === false) {
        throw new Error(`Could not find "${CATALOGUE_HEADING}" in ${skillPath}. Add the heading or generation markers before rerunning.`);
    }

    const prefix = current.slice(0, current.indexOf(CATALOGUE_HEADING));
    const updated = `${prefix}${CATALOGUE_HEADING}\n\n${START_MARKER}\n\n${generatedBody}\n${END_MARKER}\n\n${maintainerNote}\n`;
    fs.writeFileSync(skillPath, toCrLf(updated), 'utf8');
}

function buildMaintainerNote(options) {
    return [
        '## Maintainer note',
        '',
        `- Refresh the vendored catalogue with \`node ${SCRIPT_PATH} --ref <ref>\`.`,
        `- If you omit \`--ref\`, the script fetches the latest \`${DEFAULT_REF}\` from \`${options.owner}/${options.repo}\`.`,
        '- Review `git diff -- .claude/skills/vueuse-functions` after updates.',
        '- Run `git diff --check -- .claude/skills/vueuse-functions` before committing regenerated files.',
        `- The generated section is sourced from \`${options.owner}/${options.repo}\`, filters out unsupported catalogue entries, and keeps only vendored local references that are still linked.`,
    ].join('\n');
}

function stripFrontmatterAndTitle(text) {
    return text
        .replace(/^---\n[\s\S]*?\n---\n+/, '')
        .replace(/^#\s+VueUse Functions\s*\n+/, '');
}

function rewriteSkillLinks(text) {
    return text.replace(/\]\(\.\.\/([^/]+)\/index\.md\)/g, (_match, name) => `](./references/${name}.md)`);
}

function rewriteReferenceLinks(text) {
    return text.replace(/\]\(\.\.\/([^/]+)\/index\.md\)/g, (_match, name) => `](./${name}.md)`);
}

function sanitizeMarkdown(text) {
    let sanitized = text;
    sanitized = sanitized.replace(/<CourseLink\b[^>]*>(.*?)<\/CourseLink>/gs, (_match, inner) => inner.trim());
    sanitized = sanitized.replace(/<([A-Za-z][A-Za-z0-9]*)\b[^>]*href="https?:\/\/[^"]+"[^>]*>(.*?)<\/\1>/gs, (_match, _tag, inner) => inner);
    sanitized = sanitized.replace(/!\[([^\]]*)\]\(https?:\/\/[^)]+\)/g, '$1');
    sanitized = sanitized.replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, '$1');
    sanitized = sanitized.replace(/<https?:\/\/[^>]+>/g, '');
    sanitized = sanitized.replace(/@see https?:\/\/\S+/g, '@see vendored reference');
    sanitized = sanitized.replace(/https?:\/\/\S+/g, '');
    sanitized = sanitized.replace(/[ \t]+$/gm, '');
    sanitized = sanitized.replace(/\n{3,}/g, '\n\n');
    return `${sanitized.trim()}\n`;
}

function toCrLf(text) {
    return text.replace(/\r?\n/g, '\r\n');
}

try {
    main();
}
catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
}
