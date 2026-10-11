import ManifestUrlForm from '../settings/ManifestUrlForm';

// Shown instead of the app until a manifest URL has been saved.
function FirstRunSetup({ onDone }) {
    return <div className='content centered justify-content-center'>
        <h1>Welcome to TMods Loader</h1>
        <p className='card-c'>Enter the URL of your manifest to get started. You can change it later in Settings.</p>
        <ManifestUrlForm onSaved={onDone} />
    </div>
}

export default FirstRunSetup;
