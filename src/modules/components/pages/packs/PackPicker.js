import { useState } from 'react';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { OTHER_KIND, PACK_KINDS, formatSize } from '../../../services/packKinds';

function describe(item) {
    const parts = [];
    if (item.link) {
        parts.push('Linked from Modrinth');
    } else {
        parts.push(item.files.length > 1 ? `Folder, ${item.files.length} files, copied` : 'Copied');
        parts.push(formatSize(item.size));
    }
    if (!item.enabled) {
        parts.push('turned off');
    }
    return parts.join(' · ');
}

// The size a pack grows by for these items: links cost almost nothing.
export function copiedSize(items) {
    return items.filter(item => !item.link).reduce((total, item) => total + item.size, 0);
}

// One kind's items, folded away until opened, with a box that picks or drops them all.
function KindGroup({ kind, items, selected, onChange, disabled }) {
    const [open, setOpen] = useState(false);
    const picked = items.filter(item => selected.has(item.id));
    const all = picked.length === items.length;

    function setAll(on) {
        const next = new Set(selected);
        for (const item of items) {
            if (on) {
                next.add(item.id);
            } else {
                next.delete(item.id);
            }
        }
        onChange(next);
    }

    function toggle(item) {
        const next = new Set(selected);
        if (next.has(item.id)) {
            next.delete(item.id);
        } else {
            next.add(item.id);
        }
        onChange(next);
    }

    return (
        <Accordion disableGutters variant='outlined' expanded={open} onChange={(event, expanded) => setOpen(expanded)}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />} aria-label={`Show ${kind.label.toLowerCase()}`}>
                <Stack direction='row' spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
                    <Checkbox
                        checked={all}
                        indeterminate={picked.length > 0 && !all}
                        disabled={disabled}
                        onClick={event => event.stopPropagation()}
                        onChange={event => setAll(event.target.checked)}
                        slotProps={{ input: { 'aria-label': `Include all ${kind.label.toLowerCase()}` } }}
                        sx={{ p: 0.5 }}
                    />
                    <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 500 }}>{kind.label}</Typography>
                        <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                            {picked.length} of {items.length} picked
                            {copiedSize(picked) > 0 && ` · ${formatSize(copiedSize(picked))} copied`}
                        </Typography>
                    </Box>
                </Stack>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 0 }}>
                <List dense disablePadding>
                    {items.map(item => (
                        <ListItem key={item.id} divider sx={{ gap: 1 }}>
                            <Checkbox
                                edge='start'
                                checked={selected.has(item.id)}
                                disabled={disabled}
                                onChange={() => toggle(item)}
                                slotProps={{ input: { 'aria-label': `Include ${item.id}` } }}
                            />
                            <Box sx={{ minWidth: 0 }}>
                                <Typography sx={{ overflowWrap: 'anywhere' }}>{item.title || item.name}</Typography>
                                <Typography variant='body2' sx={{ color: 'text.secondary', overflowWrap: 'anywhere' }}>
                                    {item.title && item.title !== item.name ? `${item.name} · ` : ''}
                                    {describe(item)}
                                </Typography>
                            </Box>
                        </ListItem>
                    ))}
                </List>
            </AccordionDetails>
        </Accordion>
    );
}

// Lists `items` (packScan.js or readPack) grouped by kind, each with a checkbox.
// `selected` is a Set of item ids; `onChange` gets the new Set.
function PackPicker({ items, selected, onChange, disabled = false }) {
    const groups = [...PACK_KINDS, OTHER_KIND]
        .map(kind => ({ kind, items: items.filter(item => item.kind === kind.id) }))
        .filter(group => group.items.length > 0);
    if (groups.length === 0) {
        return <Typography sx={{ color: 'text.secondary' }}>There are no files to pick here.</Typography>;
    }
    const picked = items.filter(item => selected.has(item.id));
    return (
        <Stack spacing={1}>
            <div>
                {groups.map(group => (
                    <KindGroup
                        key={group.kind.id}
                        kind={group.kind}
                        items={group.items}
                        selected={selected}
                        onChange={onChange}
                        disabled={disabled}
                    />
                ))}
            </div>
            <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                {picked.length} of {items.length} picked. Copied files add {formatSize(copiedSize(picked))}; files
                linked from Modrinth add almost nothing.
            </Typography>
        </Stack>
    );
}

export default PackPicker;
