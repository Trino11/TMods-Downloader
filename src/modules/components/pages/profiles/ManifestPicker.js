import TextField from '@mui/material/TextField';
import { useTranslation } from '../../../i18n';

// Picks one of the saved manifests (Settings) for a profile to follow.
function ManifestPicker({ id, manifests, value, onChange, size }) {
    const { t } = useTranslation();
    return (
        <TextField
            id={id}
            label={t('profiles.manifest')}
            select
            size={size}
            value={value}
            onChange={event => onChange(event.target.value)}
            slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
            sx={{ minWidth: 200, maxWidth: 280 }}
        >
            {manifests.map(manifest => (
                <option key={manifest.id} value={manifest.id}>
                    {manifest.name}
                </option>
            ))}
        </TextField>
    );
}

export default ManifestPicker;
