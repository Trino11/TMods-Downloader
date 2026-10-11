// Sidebar dropdown that picks which profile the content pages install into.
function ProfileSelector({ profiles, activeId, onSelect }) {
    return <div className='profileSelector'>
        <label htmlFor='activeProfile' className='form-label'>Profile</label>
        <select
            id='activeProfile'
            className='form-select'
            value={activeId}
            onChange={event => onSelect(event.target.value)}
        >
            {profiles.map(profile =>
                <option key={profile.id} value={profile.id}>{profile.name}</option>
            )}
        </select>
    </div>
}

export default ProfileSelector;
