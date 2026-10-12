import TextField from '@mui/material/TextField';
import { useTranslation } from '../../i18n';

// Sidebar dropdown that picks which profile the content pages install into.
function ProfileSelector({ profiles, activeId, onSelect }) {
    const { t } = useTranslation();
    return (
        <TextField
            id='activeProfile'
            label={t('nav.profile')}
            select
            fullWidth
            value={activeId}
            onChange={event => onSelect(event.target.value)}
            slotProps={{ select: { native: true } }}
        >
            {profiles.map(profile => (
                <option key={profile.id} value={profile.id}>
                    {profile.name}
                </option>
            ))}
        </TextField>
    );
}

export default ProfileSelector;
