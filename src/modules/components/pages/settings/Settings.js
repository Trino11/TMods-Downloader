import ManifestUrlForm from '../../settings/ManifestUrlForm';

function Settings({ onManifestUrlChange }) {
    return <div className='centered'>
        <h1>Settings</h1>
        <p className='card-c'>The manifest lists the mods, configs and packs you can download. Changing it is checked before saving.</p>
        <ManifestUrlForm onSaved={onManifestUrlChange} />
    </div>
}

export default Settings;
