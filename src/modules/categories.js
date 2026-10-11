import BuildIcon from '@mui/icons-material/Build';
import ArchitectureIcon from '@mui/icons-material/Architecture';
import PaletteIcon from '@mui/icons-material/Palette';
import TuneIcon from '@mui/icons-material/Tune';
import WbSunnyIcon from '@mui/icons-material/WbSunny';

// Every content type the manifest ships as a zip bundle. `id` is both the
// manifest key and the name of the local state folder under .tmods_loader.
//
// `icon`: Material icon shown in the sidebar.
// `backupFolder`: folder inside .minecraft backed up (last 5 kept, restorable from the page) before installing.
// `clearFolder`: remove that folder after backing it up, so the bundle replaces it entirely.
const categories = [
    {
        id: 'mods',
        label: 'Mods',
        icon: BuildIcon,
        description: 'Here you can enable and disable your mods and update them.',
        backupFolder: 'mods',
        clearFolder: true,
        showTarget: true,
    },
    {
        id: 'schematics',
        label: 'Schematics',
        icon: ArchitectureIcon,
        description: 'Here update your schematics.',
        backupFolder: 'schematics',
        clearFolder: true,
    },
    {
        id: 'resourcepacks',
        label: 'Resource packs',
        icon: PaletteIcon,
        description: 'Here you can enable and disable your resourcepacks and update them.',
    },
    {
        id: 'configs',
        label: 'Configs',
        icon: TuneIcon,
        description: 'Here you can update your configs files.',
        backupFolder: 'config',
    },
    {
        id: 'shaderpacks',
        label: 'Shaderpacks',
        icon: WbSunnyIcon,
        description: 'Here you can enable and disable your shaderpacks and update them.',
    },
];

export default categories;
