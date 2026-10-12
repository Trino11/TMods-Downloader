import { useState } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Link as RouterLink } from 'react-router';
import ProjectSearch from './ProjectSearch';
import PackImporter from '../packs/PackImporter';
import { downloadModrinthModpack } from '../../../services/mrpack';
import { useTranslation } from '../../../i18n';

const modpackFilters = { projectType: 'modpack' };

// Modpacks on Modrinth. Install downloads one and shows the same import step as the
// Packs page, where the player picks what goes in and which profile it goes into.
// `run` performs an action with the page's busy state and messages.
function Modpacks({ profile, busy, run, onProfileCreated }) {
    const { t } = useTranslation();
    const [pending, setPending] = useState(null);
    // The link sits wherever the language puts it in the sentence.
    const [hintBefore, hintAfter] = t('modrinth.modpacks.packsHint').split('{link}');

    function install(hit) {
        run(async () => {
            setPending(await downloadModrinthModpack(hit.project_id, hit.title));
            return '';
        });
    }

    return (
        <Stack spacing={2}>
            <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                {hintBefore}
                <Link component={RouterLink} to='/packs'>
                    {t('modrinth.modpacks.packsLink')}
                </Link>
                {hintAfter}
            </Typography>
            <ProjectSearch
                filters={modpackFilters}
                placeholder={t('modrinth.modpacks.search')}
                action={hit => (
                    <Button variant='contained' disabled={busy} onClick={() => install(hit)}>
                        {t('modrinth.install.button')}
                    </Button>
                )}
            />
            <Dialog open={Boolean(pending)} onClose={() => setPending(null)} maxWidth='md' fullWidth>
                <DialogContent sx={{ p: 0 }}>
                    {pending && (
                        <PackImporter
                            data={pending}
                            activeProfile={profile}
                            busy={busy}
                            run={run}
                            onImported={() => {
                                setPending(null);
                                onProfileCreated();
                            }}
                            onCancel={() => setPending(null)}
                        />
                    )}
                </DialogContent>
            </Dialog>
        </Stack>
    );
}

export default Modpacks;
