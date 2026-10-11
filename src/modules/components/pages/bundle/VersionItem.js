function VersionItem({ version, showTarget, installed, disabled, onDownload }) {
    return <li className='listItem'>
        {showTarget
            ? <div className='versionsWrapper'>
                <code>{version.id}</code>
                <code>{version.target}</code>
            </div>
            : version.id}
        <p className='grow textDesc'>{version.description}</p>
        <button
            className={installed ? 'btn btn-secondary' : 'btn btn-success'}
            disabled={disabled}
            onClick={onDownload}
        >
            {installed ? 'Downloaded' : 'Download'}
        </button>
    </li>
}

export default VersionItem;
