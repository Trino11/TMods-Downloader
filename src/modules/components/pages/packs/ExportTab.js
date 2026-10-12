import { useState } from 'react';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import IosShareIcon from '@mui/icons-material/IosShare';
import PackPicker from './PackPicker';
import { exportMrpack } from '../../../services/mrpack';
import { formatSize } from '../../../services/packKinds';
import { useTranslation } from '../../../i18n';

// Saves bytes through the browser's download, which Electron turns into a save dialog.
function saveFile(data, fileName) {
    const url = URL.createObjectURL(new Blob([data], { type: 'application/zip' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
}

// Saves the picked files of the profile as a .mrpack file. `items` and `selected` are
// shared with the Publish tab.
function ExportTab({ profile, gameDir, target, items, selected, onSelect, busy, run }) {
    const { t } = useTranslation();
    const [name, setName] = useState(profile.name);
    const [version, setVersion] = useState('1.0.0');

    function handleExport(event) {
        event.preventDefault();
        run(async () => {
            const picked = items.filter(item => selected.has(item.id));
            const result = exportMrpack(gameDir, target, { name: name.trim(), version: version.trim(), items: picked });
            const fileName = `${name.trim().replace(/[^\w.-]+/g, '_') || 'modpack'}.mrpack`;
            saveFile(result.data, fileName);
            return t('packs.export.saved', {
                file: fileName,
                size: formatSize(result.data.length),
                links: result.links,
                copies: result.copies,
            });
        });
    }

    return (
        <Stack component='form' spacing={2} onSubmit={handleExport}>
            <Stack direction='row' spacing={1}>
                <TextField
                    id='exportName'
                    label={t('packs.export.name')}
                    fullWidth
                    value={name}
                    onChange={event => setName(event.target.value)}
                    slotProps={{ htmlInput: { required: true } }}
                />
                <TextField
                    id='exportVersion'
                    label={t('packs.export.version')}
                    value={version}
                    onChange={event => setVersion(event.target.value)}
                    slotProps={{ htmlInput: { required: true } }}
                    sx={{ maxWidth: 160 }}
                />
            </Stack>
            <PackPicker items={items} selected={selected} onChange={onSelect} disabled={busy} />
            <Stack direction='row' sx={{ justifyContent: 'flex-end' }}>
                <Button
                    type='submit'
                    variant='contained'
                    startIcon={<IosShareIcon />}
                    disabled={busy || selected.size === 0}
                >
                    {t('packs.export.save')}
                </Button>
            </Stack>
        </Stack>
    );
}

export default ExportTab;
