import { useCallback, useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import RefreshIcon from '@mui/icons-material/Refresh';
import Downloadspinner from '../../utils/Downloadspinner';
import Page from '../../utils/Page';
import { ItemList } from '../../utils/ItemList';
import { KeepVersionButton } from '../../utils/KeepVersion';
import ReplaceContentDialog from '../../utils/ReplaceContent';
import VersionItem from './VersionItem';
import BackupList from './BackupList';
import { fetchVersions } from '../../../services/manifest';
import { installBundle, listBackups, readInstalledVersion, restoreBackup } from '../../../services/bundleInstaller';
import { isPinned, setPinned } from '../../../services/pins';
import { safeCheckIntegrity } from '../../../services/integrity';
import { formatDateTime, useTranslation } from '../../../i18n';

// `gameDir` is the active profile's game folder; App remounts the page when it changes.
function BundlePage({ category, gameDir }) {
    const { t } = useTranslation();
    const [versions, setVersions] = useState([]);
    const [installed, setInstalled] = useState(() => readInstalledVersion(category, gameDir));
    const [pinned, setPinnedState] = useState(() => isPinned(gameDir, category.id));
    const [backups, setBackups] = useState(() => listBackups(category, gameDir));
    // Whether the installed files are still the downloaded ones (services/integrity.js).
    const [integrity, setIntegrity] = useState(() =>
        safeCheckIntegrity(category, gameDir, readInstalledVersion(category, gameDir)),
    );
    const [downloading, setDownloading] = useState(false);
    // The version waiting for the player to say whether it replaces what's there.
    const [asking, setAsking] = useState(null);
    const [error, setError] = useState('');

    function recheck() {
        setIntegrity(safeCheckIntegrity(category, gameDir, readInstalledVersion(category, gameDir)));
    }

    const refresh = useCallback(() => {
        fetchVersions(category.id)
            .then(list => {
                setVersions(list);
                setError('');
            })
            .catch(fetchError => setError(t('bundle.errors.loadVersions', { message: fetchError.message })));
    }, [category.id, t]);

    useEffect(refresh, [refresh]);

    async function handleDownload(version, replace) {
        setAsking(null);
        setDownloading(true);
        setError('');
        try {
            await installBundle(category, version, gameDir, { replace });
            setInstalled(version.id);
        } catch (installError) {
            setError(t('bundle.errors.install', { version: version.id, message: installError.message }));
        } finally {
            setBackups(listBackups(category, gameDir));
            recheck();
            setDownloading(false);
        }
    }

    function handleKeepChange(keep) {
        setPinned(gameDir, category.id, keep);
        setPinnedState(keep);
    }

    function handleRestore(backup) {
        const vars = {
            content: category.label.toLowerCase(),
            version: backup.version,
            date: formatDateTime(backup.createdAt),
        };
        const question = backup.version
            ? t('bundle.restore.confirmVersion', vars)
            : t('bundle.restore.confirmBackup', vars);
        if (!window.confirm(question)) {
            return;
        }
        setError('');
        try {
            restoreBackup(category, backup.id, gameDir);
            setInstalled(readInstalledVersion(category, gameDir));
        } catch (restoreError) {
            setError(t('bundle.errors.restore', { message: restoreError.message }));
        } finally {
            setBackups(listBackups(category, gameDir));
            recheck();
        }
    }

    return (
        <Page title={category.label} description={category.description}>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                <Button
                    variant='contained'
                    startIcon={downloading ? <Downloadspinner /> : <RefreshIcon />}
                    onClick={() => {
                        recheck();
                        refresh();
                    }}
                >
                    {t('bundle.refresh')}
                </Button>
                {installed && <KeepVersionButton pinned={pinned} disabled={downloading} onChange={handleKeepChange} />}
            </Box>
            {error && <Alert severity='error'>{error}</Alert>}
            {versions.length > 0 && (
                <ItemList>
                    {versions.map(version => (
                        <VersionItem
                            key={version.id}
                            version={version}
                            showTarget={category.showTarget}
                            installed={installed === version.id}
                            integrity={installed === version.id ? integrity : null}
                            disabled={downloading}
                            onDownload={() => setAsking(version)}
                        />
                    ))}
                </ItemList>
            )}
            <ReplaceContentDialog
                open={Boolean(asking)}
                folders={[category.backupFolder]}
                onConfirm={replace => handleDownload(asking, replace)}
                onCancel={() => setAsking(null)}
            />
            {category.backupFolder && <BackupList backups={backups} disabled={downloading} onRestore={handleRestore} />}
        </Page>
    );
}

export default BundlePage;
