import BuildIcon from '@mui/icons-material/Build';
import ArchitectureIcon from '@mui/icons-material/Architecture';
import PaletteIcon from '@mui/icons-material/Palette';
import TuneIcon from '@mui/icons-material/Tune';
import WbSunnyIcon from '@mui/icons-material/WbSunny';
import { t } from './i18n';

// Every content type the manifest ships as a zip bundle. `id` is both the
// manifest key and the name of the local state folder under .tmods_loader.
//
// `label` and `description` are getters so they follow the chosen language.
// `icon`: Material icon shown in the sidebar.
// `backupFolder`: folder inside .minecraft backed up (last 5 kept, restorable from the page) before installing.
// `clearFolder`: remove that folder after backing it up, so the bundle replaces it entirely.
const categories = [
    {
        id: 'mods',
        get label() {
            return t('nav.categories.mods.label');
        },
        icon: BuildIcon,
        get description() {
            return t('nav.categories.mods.description');
        },
        backupFolder: 'mods',
        clearFolder: true,
        showTarget: true,
    },
    {
        id: 'schematics',
        get label() {
            return t('nav.categories.schematics.label');
        },
        icon: ArchitectureIcon,
        get description() {
            return t('nav.categories.schematics.description');
        },
        backupFolder: 'schematics',
        clearFolder: true,
    },
    {
        id: 'resourcepacks',
        get label() {
            return t('nav.categories.resourcepacks.label');
        },
        icon: PaletteIcon,
        get description() {
            return t('nav.categories.resourcepacks.description');
        },
    },
    {
        id: 'configs',
        get label() {
            return t('nav.categories.configs.label');
        },
        icon: TuneIcon,
        get description() {
            return t('nav.categories.configs.description');
        },
        backupFolder: 'config',
    },
    {
        id: 'shaderpacks',
        get label() {
            return t('nav.categories.shaderpacks.label');
        },
        icon: WbSunnyIcon,
        get description() {
            return t('nav.categories.shaderpacks.description');
        },
    },
];

export default categories;
