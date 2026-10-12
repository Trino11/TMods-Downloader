// Checks that the mods in a game folder fit the profile: built for its loader and
// Minecraft version, with every required mod present and enabled, and no two mods that
// say they don't work together. Uses the Modrinth data of each jar, found by checksum,
// so it covers the mods TMods installed and the hand-added jars Modrinth recognises.
import { LOADERS, getProjects, getProjectVersions, pickVersion, versionsFromHashes } from './modrinth';
import { installMod, listUnmanaged, modsDir, readModList, setModEnabled, sha1, updateMod } from './modrinthMods';
import { fs, path } from './node';
import { t } from '../i18n';

const DISABLED_SUFFIX = '.disabled';

function loaderName(loader) {
    return LOADERS[loader] || loader;
}

function targetLabel(target) {
    return `${loaderName(target.loader)} ${target.gameVersion}`;
}

// Whether a mod built for `loaders` runs on the profile's loader. Quilt also loads Fabric
// mods, and NeoForge for 1.20.1 still loads Forge ones.
function runsOnLoader(loaders, target) {
    return (
        loaders.includes(target.loader) ||
        (target.loader === 'quilt' && loaders.includes('fabric')) ||
        (target.loader === 'neoforge' && target.gameVersion === '1.20.1' && loaders.includes('forge'))
    );
}

function formatGameVersions(versions) {
    return versions.length <= 3
        ? versions.join(', ')
        : t('services.modCompat.versionRange', { from: versions[0], to: versions[versions.length - 1] });
}

// Why a version doesn't fit `target`, or null when it does. Versions Modrinth sends
// without loaders or game versions are given the benefit of the doubt.
function mismatch(version, target) {
    const loaders = version.loaders || [];
    const gameVersions = version.game_versions || [];
    const loaderOk = loaders.length === 0 || runsOnLoader(loaders, target);
    const gameOk = gameVersions.length === 0 || gameVersions.includes(target.gameVersion);
    const madeFor = loaders.map(loaderName).join(t('services.modCompat.or'));
    if (!loaderOk && !gameOk) {
        return t('services.modCompat.wrongLoaderAndGame', {
            loaders: madeFor,
            versions: formatGameVersions(gameVersions),
            target: targetLabel(target),
        });
    }
    if (!loaderOk) {
        return t('services.modCompat.wrongLoader', { loaders: madeFor, loader: loaderName(target.loader) });
    }
    if (!gameOk) {
        return t('services.modCompat.wrongGame', {
            versions: formatGameVersions(gameVersions),
            gameVersion: target.gameVersion,
        });
    }
    return null;
}

function hashUnmanaged(gameDir) {
    return listUnmanaged(gameDir).map(fileName => ({
        fileName,
        sha1: sha1(fs.readFileSync(path.join(modsDir(gameDir), fileName))),
        enabled: !fileName.endsWith(DISABLED_SUFFIX),
    }));
}

// Every jar in the folder that Modrinth knows, with the Modrinth version it is:
// [{ projectId, title, enabled, tracked, fileName, version }]. Also returns how many
// hand-added jars Modrinth doesn't know, since one of those may be a "missing" mod.
async function readInstalled(gameDir) {
    // Resource packs and shaders need no mod loader, so only mods are checked.
    const tracked = readModList(gameDir).mods.filter(mod => mod.kind === 'mod');
    const unmanaged = hashUnmanaged(gameDir);
    const versions = await versionsFromHashes([...tracked, ...unmanaged].map(mod => mod.sha1));

    const installed = tracked.map(mod => ({
        projectId: mod.projectId,
        title: mod.title,
        enabled: mod.enabled,
        tracked: true,
        fileName: mod.fileName,
        version: versions[mod.sha1] || null,
    }));
    const trackedIds = new Set(tracked.map(mod => mod.projectId));
    const recognised = unmanaged.filter(file => versions[file.sha1]);
    for (const file of recognised) {
        const version = versions[file.sha1];
        if (!trackedIds.has(version.project_id)) {
            installed.push({
                projectId: version.project_id,
                title: null,
                enabled: file.enabled,
                tracked: false,
                fileName: file.fileName,
                version,
            });
        }
    }
    return { installed, unknownJars: unmanaged.length - recognised.length };
}

async function fetchTitles(projectIds) {
    if (projectIds.length === 0) {
        return new Map();
    }
    try {
        return new Map((await getProjects(projectIds)).map(project => [project.id, project.title]));
    } catch {
        return new Map();
    }
}

function dependenciesOf(version, type) {
    return (version?.dependencies || [])
        .filter(dep => dep.dependency_type === type && dep.project_id)
        .map(dep => dep.project_id);
}

function disableFix(mod) {
    return mod.tracked
        ? { type: 'disable', label: t('services.modCompat.fix.disable'), projectId: mod.projectId }
        : { type: 'disableFile', label: t('services.modCompat.fix.disable'), fileName: mod.fileName };
}

// Lists what is wrong with the enabled mods for `target` ({ loader, gameVersion }).
// Each problem: { mod: { projectId, fileName, tracked }, kind, message, fix }, where kind
// is 'mismatch', 'missing', 'disabled' or 'incompatible', and fix (when there is one) is
// what applyFix() does in one click: { type, label, ... }.
export async function checkCompatibility(gameDir, target) {
    const { installed, unknownJars } = await readInstalled(gameDir);
    const enabled = installed.filter(mod => mod.enabled);
    const byProject = new Map(installed.map(mod => [mod.projectId, mod]));
    const enabledIds = new Set(enabled.map(mod => mod.projectId));

    const missingIds = [...new Set(enabled.flatMap(mod => dependenciesOf(mod.version, 'required')))].filter(
        id => !byProject.has(id),
    );
    const titles = await fetchTitles([
        ...new Set([...installed.filter(mod => !mod.title).map(mod => mod.projectId), ...missingIds]),
    ]);
    const titleOf = id => byProject.get(id)?.title || titles.get(id) || id;
    for (const mod of installed) {
        mod.title = mod.title || titles.get(mod.projectId) || mod.fileName;
    }

    // Whether each missing mod has a version for this profile, so the fix can be offered.
    const installable = new Map();
    for (const id of missingIds) {
        try {
            installable.set(id, Boolean(pickVersion(await getProjectVersions(id, target))));
        } catch {
            installable.set(id, true);
        }
    }

    const problems = [];
    const add = (mod, kind, message, fix = null) =>
        problems.push({
            mod: { projectId: mod.projectId, fileName: mod.fileName, tracked: mod.tracked, title: mod.title },
            kind,
            message,
            fix,
        });

    for (const mod of enabled) {
        if (!mod.version) {
            continue;
        }
        const reason = mismatch(mod.version, target);
        if (reason) {
            let fix = disableFix(mod);
            let message = reason;
            if (mod.tracked) {
                const better = pickVersion(await getProjectVersions(mod.projectId, target).catch(() => []));
                if (better && better.id !== mod.version.id) {
                    fix = {
                        type: 'switchVersion',
                        label: t('services.modCompat.fix.switchVersion', { version: better.version_number }),
                        projectId: mod.projectId,
                        version: better,
                    };
                } else {
                    message += ` ${t('services.modCompat.noVersionYet', { target: targetLabel(target) })}`;
                }
            }
            add(mod, 'mismatch', message, fix);
        }

        for (const depId of dependenciesOf(mod.version, 'required')) {
            const dep = byProject.get(depId);
            if (dep && dep.enabled) {
                continue;
            }
            if (dep) {
                add(
                    mod,
                    'disabled',
                    t('services.modCompat.needsDisabled', { title: dep.title }),
                    dep.tracked
                        ? {
                              type: 'enable',
                              label: t('services.modCompat.fix.enable', { title: dep.title }),
                              title: dep.title,
                              projectId: dep.projectId,
                          }
                        : {
                              type: 'enableFile',
                              label: t('services.modCompat.fix.enable', { title: dep.title }),
                              title: dep.title,
                              fileName: dep.fileName,
                          },
                );
            } else if (installable.get(depId)) {
                const handAdded = unknownJars > 0 ? ` ${t('services.modCompat.maybeHandAdded')}` : '';
                add(mod, 'missing', t('services.modCompat.needsMissing', { title: titleOf(depId) }) + handAdded, {
                    type: 'install',
                    label: t('services.modCompat.fix.install', { title: titleOf(depId) }),
                    projectId: depId,
                    title: titleOf(depId),
                });
            } else {
                add(
                    mod,
                    'missing',
                    t('services.modCompat.needsUnavailable', { title: titleOf(depId), target: targetLabel(target) }),
                    disableFix(mod),
                );
            }
        }

        for (const otherId of dependenciesOf(mod.version, 'incompatible')) {
            if (enabledIds.has(otherId) && otherId !== mod.projectId) {
                add(
                    mod,
                    'incompatible',
                    t('services.modCompat.incompatible', { title: titleOf(otherId) }),
                    disableFix(mod),
                );
            }
        }
    }
    return problems;
}

// Renames a hand-added jar to turn it on or off, the way TMods does for its own mods.
function setFileEnabled(gameDir, fileName, enabled) {
    if (!fileName || fileName !== path.basename(fileName)) {
        throw new Error(t('services.modCompat.refuseRename', { fileName }));
    }
    const isEnabled = !fileName.endsWith(DISABLED_SUFFIX);
    if (isEnabled === enabled) {
        return;
    }
    const to = enabled ? fileName.slice(0, -DISABLED_SUFFIX.length) : fileName + DISABLED_SUFFIX;
    fs.renameSync(path.join(modsDir(gameDir), fileName), path.join(modsDir(gameDir), to));
}

// Carries out a problem's fix. Returns a message saying what was done.
export async function applyFix(gameDir, target, problem) {
    const { fix, mod } = problem;
    switch (fix.type) {
        case 'switchVersion':
            await updateMod(gameDir, fix.projectId, fix.version);
            return t('services.modCompat.done.switched', { title: mod.title, version: fix.version.version_number });
        case 'install': {
            const titles = await installMod(gameDir, target, fix.projectId, fix.title, { asDependency: true });
            return t('services.modCompat.done.installed', { titles: titles.join(', ') });
        }
        case 'enable':
            setModEnabled(gameDir, fix.projectId, true);
            return t('services.modCompat.done.enabled', { title: fix.title });
        case 'enableFile':
            setFileEnabled(gameDir, fix.fileName, true);
            return t('services.modCompat.done.enabled', { title: fix.title });
        case 'disable':
            setModEnabled(gameDir, fix.projectId, false);
            return t('services.modCompat.done.disabled', { title: mod.title });
        case 'disableFile':
            setFileEnabled(gameDir, fix.fileName, false);
            return t('services.modCompat.done.disabled', { title: mod.title });
        default:
            throw new Error(t('services.modCompat.unknownFix', { type: fix.type }));
    }
}

// Reasons to think twice before installing `projectId`: it says it doesn't work with a
// mod in the folder, or a mod in the folder says it doesn't work with it. Returns a list
// of messages, empty when nothing stands out.
export async function checkBeforeInstall(gameDir, target, projectId) {
    const version = pickVersion(await getProjectVersions(projectId, target));
    if (!version) {
        // installMod explains this itself.
        return [];
    }
    const { installed } = await readInstalled(gameDir);
    const enabled = installed.filter(mod => mod.enabled && mod.projectId !== projectId);
    const clashes = new Set(dependenciesOf(version, 'incompatible'));
    const conflicting = enabled.filter(
        mod => clashes.has(mod.projectId) || dependenciesOf(mod.version, 'incompatible').includes(projectId),
    );
    const titles = await fetchTitles(conflicting.filter(mod => !mod.title).map(mod => mod.projectId));
    const warnings = conflicting.map(mod => {
        const title = mod.title || titles.get(mod.projectId) || mod.fileName;
        return clashes.has(mod.projectId)
            ? t('services.modCompat.clashesWithInstalled', { title })
            : t('services.modCompat.installedClashes', { title });
    });
    const reason = mismatch(version, target);
    if (reason) {
        warnings.unshift(reason);
    }
    return warnings;
}
