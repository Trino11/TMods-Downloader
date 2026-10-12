// The Profiles page, the profile form and the Fabric installer.
const profiles = {
    title: 'Perfiles',
    description:
        'Cada perfil tiene sus propios mods, configuraciones y packs, y aparece en el Minecraft Launcher oficial, donde le das a Jugar. Puedes instalar Fabric más abajo. Para Forge o NeoForge, ejecuta primero el instalador del loader y luego elige su versión aquí.',
    editTitle: 'Editar perfil',
    newTitle: 'Nuevo perfil',
    name: 'Nombre',
    namePlaceholder: 'Nombre del perfil',
    create: 'Crear',
    versionsOffline:
        'No se pudo cargar la lista completa de versiones de Minecraft; se muestran las versiones conocidas sin conexión.',
    saved: 'Perfil guardado. Reinicia el Minecraft Launcher si está abierto para ver el cambio.',
    created: 'Perfil creado. Reinicia el Minecraft Launcher si está abierto para verlo.',
    fabricSelected: 'Se instaló {version}. Ya está seleccionada para este perfil.',
    confirmDelete:
        '¿Borrar el perfil "{name}"? Se quita de TMods y del Minecraft Launcher. Sus archivos se quedan en {folder}.',
    deleted: 'Perfil borrado. Sus archivos siguen en {folder}.',
    active: 'Activo',
    use: 'Usar',
    edit: 'Editar',
    delete: 'Borrar',
    launcherProfiles: 'Tus perfiles habituales del launcher',
    manifest: 'Manifiesto',
    manifestChanged: '{name} ahora sigue {manifest}.',
    servers: {
        title: 'Servidores de {profile}',
        description:
            'La lista de Multijugador del perfil activo. Los servidores que publica tu canal se añaden solos, y los tuyos se quedan como están.',
        empty: 'Todavía no hay servidores.',
        fromChannel: 'De tu canal',
        addTitle: 'Añadir un servidor',
        editTitle: 'Editar servidor',
        name: 'Nombre del servidor',
        address: 'Dirección del servidor',
        add: 'Añadir servidor',
        remove: 'Quitar',
        moveUp: 'Subir {name}',
        moveDown: 'Bajar {name}',
        confirmRemove: '¿Quitar "{name}" de la lista de servidores?',
        closeGame: 'Cierra Minecraft antes de cambiar los servidores, o el juego puede deshacer el cambio.',
        resourcePack: {
            label: 'Paquetes de recursos del servidor',
            prompt: 'Preguntar',
            enabled: 'Usarlos',
            disabled: 'No usarlos',
        },
    },
    fabric: {
        title: 'Instalar Fabric',
        versionLabel: 'Versión de Minecraft para Fabric',
        install: 'Instalar Fabric',
        installing: 'Instalando...',
        willInstall: 'Instala Fabric {loaderVersion} para Minecraft {gameVersion}.',
        listFailed: 'No se pudo conectar con Fabric para listar las versiones de Minecraft.',
        installFailed: 'No se pudo instalar Fabric: {error}',
    },
};

export default profiles;
