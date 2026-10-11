import React, { useCallback, useEffect, useState } from 'react';
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

// `gameDir` is the active profile's game folder; App remounts the page when it changes.
function BundlePage({ category, gameDir }) {
    const [versions, setVersions] = useState([]);
    const [installed, setInstalled] = useState(() => readInstalledVersion(category, gameDir));
    const [backups, setBackups] = useState(() => listBackups(category, gameDir));
    const [downloading, setDownloading] = useState(false);

    const refresh = useCallback(() => {
        fetchVersions(category.id)
            .then(setVersions)
            .catch(error => console.error('There was an error fetching the data:', error));
    }, [category.id]);

    useEffect(refresh, [refresh]);

    async function handleDownload(version) {
        setDownloading(true);
        try {
            await installBundle(category, version, gameDir);
            setInstalled(version.id);
        } catch (error) {
            console.error(`Error installing ${category.id} ${version.id}:`, error);
        } finally {
            setBackups(listBackups(category, gameDir));
            setDownloading(false);
        }
    }

    function handleRestore(backup) {
        const label = backup.version ? `version ${backup.version}` : 'the backup';
        if (!window.confirm(`Replace your current ${category.label.toLowerCase()} with ${label} from ${new Date(backup.createdAt).toLocaleString()}? Your current files are backed up first.`)) {
            return;
        }
        try {
            restoreBackup(category, backup.id, gameDir);
            setInstalled(readInstalledVersion(category, gameDir));
        } catch (error) {
            console.error(`Error restoring ${category.id} backup ${backup.id}:`, error);
        } finally {
            setBackups(listBackups(category, gameDir));
        }
    }

    return <Page title={category.label} description={category.description}>
        <Box>
            <Button variant='contained' startIcon={downloading ? <Downloadspinner /> : <RefreshIcon />} onClick={refresh}>Refresh</Button>
        </Box>
        {versions.length > 0 &&
            <ItemList>
                {versions.map(version =>
                    <VersionItem
                        key={version.id}
                        version={version}
                        showTarget={category.showTarget}
                        installed={installed === version.id}
                        disabled={downloading}
                        onDownload={() => handleDownload(version)}
                    />
                )}
            </ItemList>}
        {category.backupFolder &&
            <BackupList backups={backups} disabled={downloading} onRestore={handleRestore} />}
    </Page>
}

export default BundlePage;
