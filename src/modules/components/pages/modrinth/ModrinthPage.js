import { useMemo, useState } from 'react';
import Downloadspinner from '../../utils/Downloadspinner';
import ProjectSearch from './ProjectSearch';
import InstalledMods from './InstalledMods';
import Modpacks from './Modpacks';
import { LOADERS } from '../../../services/modrinth';
import { detectTarget } from '../../../services/gameTarget';
import { DEFAULT_PROFILE_ID, listGameVersions } from '../../../services/profiles';
import {
    adoptUnmanaged,
    checkUpdates,
    installMod,
    listUnmanaged,
    readModList,
    removeMod,
    setModEnabled,
    setTargetVersion,
    updateMod,
} from '../../../services/modrinthMods';

const TABS = [
    { id: 'search', label: 'Search mods' },
    { id: 'installed', label: 'Installed' },
    { id: 'modpacks', label: 'Modpacks' },
];

function describeTarget(target) {
    return `${LOADERS[target.loader]} ${target.loaderVersion} · Minecraft ${target.gameVersion}`;
}

// Which loader the folder plays with. The default profile can be played with any
// launcher version, so the player picks one here; other profiles set it in Profiles.
function TargetBar({ profile, versionId, target, onPick }) {
    const [choice, setChoice] = useState('');
    if (target) {
        return <p className='card-c'>Mods are picked for <strong>{describeTarget(target)}</strong>.</p>;
    }
    if (profile.id !== DEFAULT_PROFILE_ID) {
        return <p className='card-c text-warning'>
            This profile plays {versionId}, which has no mod loader. Install Fabric, Forge, NeoForge or Quilt with its
            installer, then pick that version for the profile in Profiles.
        </p>;
    }
    const loaderVersions = listGameVersions().filter(id => detectTarget(id));
    if (loaderVersions.length === 0) {
        return <p className='card-c text-warning'>
            No mod loader is installed. Install Fabric, Forge, NeoForge or Quilt with its installer, then come back here.
        </p>;
    }
    return <div className='settingsForm'>
        <label htmlFor='loaderVersion' className='form-label'>Which installed version do you play this folder with?</label>
        <div className='settingsRow'>
            <select id='loaderVersion' className='form-select' value={choice} onChange={event => setChoice(event.target.value)}>
                <option value=''>Pick a version</option>
                {loaderVersions.map(id => <option key={id} value={id}>{id}</option>)}
            </select>
            <button className='btn btn-primary' disabled={!choice} onClick={() => onPick(choice)}>Use</button>
        </div>
    </div>;
}

// Single mods and modpacks from Modrinth for the active profile. App remounts the page
// when the profile changes.
function ModrinthPage({ profile, gameDir, onProfilesChange }) {
    const [tab, setTab] = useState('search');
    const [list, setList] = useState(() => readModList(gameDir));
    const [unmanaged, setUnmanaged] = useState(() => listUnmanaged(gameDir));
    const [updates, setUpdates] = useState([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    const versionId = profile.id === DEFAULT_PROFILE_ID ? list.target?.versionId : profile.gameVersion;
    const target = useMemo(() => detectTarget(versionId), [versionId]);
    const searchFilters = useMemo(() => target && { projectType: 'mod', loader: target.loader, gameVersion: target.gameVersion }, [target]);
    const installedIds = new Set(list.mods.map(mod => mod.projectId));

    function reload() {
        setList(readModList(gameDir));
        setUnmanaged(listUnmanaged(gameDir));
    }

    // Runs one action at a time; it returns the message to show when it succeeds.
    async function run(action) {
        setBusy(true);
        setError('');
        setNotice('');
        try {
            setNotice(await action() || '');
        } catch (actionError) {
            setError(actionError.message);
        } finally {
            reload();
            setBusy(false);
        }
    }

    function install(hit) {
        run(async () => {
            const titles = await installMod(gameDir, target, hit.project_id, hit.title);
            return titles.length > 1
                ? `Installed ${titles[0]} with ${titles.slice(1).join(', ')}.`
                : `Installed ${titles[0]}.`;
        });
    }

    function handleCheckUpdates() {
        run(async () => {
            const found = await checkUpdates(gameDir, target);
            setUpdates(found);
            return found.length ? `${found.length} update(s) available.` : 'Everything is up to date.';
        });
    }

    function applyUpdates(selected) {
        run(async () => {
            for (const { mod, version } of selected) {
                await updateMod(gameDir, mod.projectId, version);
            }
            const done = new Set(selected.map(update => update.mod.projectId));
            setUpdates(updates.filter(update => !done.has(update.mod.projectId)));
            return `Updated ${selected.map(update => update.mod.title).join(', ')}.`;
        });
    }

    function handleRemove(mod) {
        if (!window.confirm(`Remove ${mod.title}?`)) {
            return;
        }
        run(async () => `Removed ${removeMod(gameDir, mod.projectId).join(', ')}.`);
    }

    function handleAdopt() {
        run(async () => {
            const count = await adoptUnmanaged(gameDir);
            return count ? `Recognised ${count} mod(s) from Modrinth.` : 'None of them were found on Modrinth.';
        });
    }

    function handlePickTarget(id) {
        setTargetVersion(gameDir, id);
        reload();
    }

    return <div className='centered'>
        <h1>Modrinth</h1>
        <TargetBar profile={profile} versionId={versionId} target={target} onPick={handlePickTarget} />
        <ul className='nav nav-tabs mb-2'>
            {TABS.map(({ id, label }) =>
                <li key={id} className='nav-item'>
                    <button className={`nav-link ${tab === id ? 'active' : 'text-white'}`} onClick={() => setTab(id)}>
                        {id === 'installed' ? `${label} (${list.mods.length})` : label}
                    </button>
                </li>
            )}
        </ul>
        {busy && <Downloadspinner />}
        {error && <div className='text-danger text-center'>{error}</div>}
        {notice && <div className='text-success text-center'>{notice}</div>}

        {tab === 'search' && (target
            ? <ProjectSearch
                filters={searchFilters}
                placeholder='Search mods'
                action={hit => installedIds.has(hit.project_id)
                    ? <button className='btn btn-secondary' disabled>Installed</button>
                    : <button className='btn btn-success' disabled={busy} onClick={() => install(hit)}>Install</button>}
            />
            : <p>Set up a mod loader above to search for mods.</p>)}

        {tab === 'installed' &&
            <InstalledMods
                mods={list.mods}
                unmanaged={unmanaged}
                updates={updates}
                busy={busy}
                canCheckUpdates={Boolean(target)}
                onCheckUpdates={handleCheckUpdates}
                onUpdate={(mod, version) => applyUpdates([{ mod, version }])}
                onUpdateAll={() => applyUpdates(updates)}
                onToggle={mod => run(async () => setModEnabled(gameDir, mod.projectId, !mod.enabled))}
                onRemove={handleRemove}
                onAdopt={handleAdopt}
            />}

        {tab === 'modpacks' &&
            <Modpacks
                profile={profile}
                gameDir={gameDir}
                target={target}
                busy={busy}
                run={run}
                onProfileCreated={onProfilesChange}
            />}
    </div>
}

export default ModrinthPage;
