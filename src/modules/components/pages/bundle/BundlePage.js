import React, { useCallback, useEffect, useState } from 'react';
import Downloadspinner from '../../utils/Downloadspinner';
import VersionItem from './VersionItem';
import { fetchVersions } from '../../../services/manifest';
import { installBundle, readInstalledVersion } from '../../../services/bundleInstaller';

function BundlePage({ category }) {
    const [versions, setVersions] = useState([]);
    const [installed, setInstalled] = useState(() => readInstalledVersion(category));
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
            setDownloading(false);
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
    </div>
}

export default BundlePage;
