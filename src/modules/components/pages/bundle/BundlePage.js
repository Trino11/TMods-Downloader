import { useCallback, useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import RefreshIcon from '@mui/icons-material/Refresh';
import Downloadspinner from '../../utils/Downloadspinner';
import Page from '../../utils/Page';
import { ItemList } from '../../utils/ItemList';
import VersionItem from './VersionItem';
import BackupList from './BackupList';
import { fetchVersions } from '../../../services/manifest';
import { installBundle, listBackups, readInstalledVersion, restoreBackup } from '../../../services/bundleInstaller';
import { formatDateTime, useTranslation } from '../../../i18n';

// `gameDir` is the active profile's game folder; App remounts the page when it changes.
function BundlePage({ category, gameDir }) {
    const { t } = useTranslation();
    const [versions, setVersions] = useState([]);
    const [installed, setInstalled] = useState(() => readInstalledVersion(category, gameDir));
    const [backups, setBackups] = useState(() => listBackups(category, gameDir));
    const [downloading, setDownloading] = useState(false);
    const [error, setError] = useState('');

    const refresh = useCallback(() => {
        fetchVersions(category.id)
            .then(list => {
                setVersions(list);
                setError('');
            })
            .catch(fetchError => setError(t('bundle.errors.loadVersions', { message: fetchError.message })));
    }, [category.id, t]);

    useEffect(refresh, [refresh]);

    async function handleDownload(version) {
        setDownloading(true);
        setError('');
        try {
            await installBundle(category, version, gameDir);
            setInstalled(version.id);
        } catch (installError) {
            setError(t('bundle.errors.install', { version: version.id, message: installError.message }));
        } finally {
            setBackups(listBackups(category, gameDir));
            setDownloading(false);
        }
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
        }
    }

    return (
        <Page title={category.label} description={category.description}>
            <Box>
                <Button
                    variant='contained'
                    startIcon={downloading ? <Downloadspinner /> : <RefreshIcon />}
                    onClick={refresh}
                >
                    {t('bundle.refresh')}
                </Button>
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
                            disabled={downloading}
                            onDownload={() => handleDownload(version)}
                        />
                    ))}
                </ItemList>
            )}
            {category.backupFolder && <BackupList backups={backups} disabled={downloading} onRestore={handleRestore} />}
        </Page>
    );
}

export default BundlePage;
