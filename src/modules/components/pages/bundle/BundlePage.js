import React, { useCallback, useEffect, useState } from 'react';
import Downloadspinner from '../../utils/Downloadspinner';
import VersionItem from './VersionItem';
import BackupList from './BackupList';
import { fetchVersions } from '../../../services/manifest';
import { installBundle, listBackups, readInstalledVersion, restoreBackup } from '../../../services/bundleInstaller';

function BundlePage({ category }) {
    const [versions, setVersions] = useState([]);
    const [installed, setInstalled] = useState(() => readInstalledVersion(category));
    const [backups, setBackups] = useState(() => listBackups(category));
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
            await installBundle(category, version);
            setInstalled(version.id);
        } catch (error) {
            console.error(`Error installing ${category.id} ${version.id}:`, error);
        } finally {
            setBackups(listBackups(category));
            setDownloading(false);
        }
    }

    function handleRestore(backup) {
        const label = backup.version ? `version ${backup.version}` : 'the backup';
        if (!window.confirm(`Replace your current ${category.label.toLowerCase()} with ${label} from ${new Date(backup.createdAt).toLocaleString()}? Your current files are backed up first.`)) {
            return;
        }
        try {
            restoreBackup(category, backup.id);
            setInstalled(readInstalledVersion(category));
        } catch (error) {
            console.error(`Error restoring ${category.id} backup ${backup.id}:`, error);
        } finally {
            setBackups(listBackups(category));
        }
    }

    return <div className='centered'>
        <h1>{category.label}</h1>
        <p className='card-c'>{category.description}</p>
        <div>
            <button className="btn btn-primary" onClick={refresh}>{downloading ? <Downloadspinner /> : 'Refresh'}</button>
        </div>
        <div className='grow'>
            <ul className='grow'>
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
            </ul>
        </div>
        {category.backupFolder &&
            <BackupList backups={backups} disabled={downloading} onRestore={handleRestore} />}
    </div>
}

export default BundlePage;
