function formatDate(iso) {
    const date = new Date(iso);
    return isNaN(date) ? iso : date.toLocaleString();
}

function BackupList({ backups, disabled, onRestore }) {
    return <div className='grow'>
        <h4 className='backupsTitle'>Backups</h4>
        {backups.length === 0
            ? <p className='card-c'>No backups yet. One is made every time you install a version.</p>
            : <ul className='grow'>
                {backups.map(backup =>
                    <li key={backup.id} className='listItem'>
                        <div className='versionsWrapper'>
                            <span>{formatDate(backup.createdAt)}</span>
                            <code>{backup.version || 'No version installed'}</code>
                        </div>
                        <span className='grow' />
                        <button
                            className='btn btn-warning'
                            disabled={disabled}
                            onClick={() => onRestore(backup)}
                        >
                            Restore
                        </button>
                    </li>
                )}
            </ul>}
    </div>
}

export default BackupList;
