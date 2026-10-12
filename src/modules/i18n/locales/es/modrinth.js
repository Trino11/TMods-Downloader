// The Modrinth page: search, installed content and modpacks.
const modrinth = {
    title: 'Modrinth',
    tabs: {
        mod: 'Mods',
        resourcepack: 'Paquetes de recursos',
        shader: 'Shaders',
        installed: 'Instalado',
        installedCount: 'Instalado ({count})',
        modpacks: 'Modpacks',
    },
    // Per kind of content (see KINDS in services/modrinth.js).
    kinds: {
        mod: {
            label: 'Mods',
            noun: 'mod',
            search: 'Buscar mods',
            empty: 'Todavía no hay mods de Modrinth en este perfil. Busca alguno en Mods.',
            adopted: {
                one: 'Se reconoció {count} mod de Modrinth.',
                other: 'Se reconocieron {count} mods de Modrinth.',
            },
        },
        resourcepack: {
            label: 'Paquetes de recursos',
            noun: 'paquete de recursos',
            search: 'Buscar paquetes de recursos',
            pickVersion: 'Elige arriba la versión de Minecraft para buscar paquetes de recursos.',
            empty: 'Todavía no hay paquetes de recursos de Modrinth en este perfil. Busca alguno en Paquetes de recursos.',
            adopted: {
                one: 'Se reconoció {count} paquete de recursos de Modrinth.',
                other: 'Se reconocieron {count} paquetes de recursos de Modrinth.',
            },
        },
        shader: {
            label: 'Shaders',
            noun: 'shader',
            search: 'Buscar shaders',
            pickVersion: 'Elige arriba la versión de Minecraft para buscar shaders.',
            empty: 'Todavía no hay shaders de Modrinth en este perfil. Busca alguno en Shaders.',
            adopted: {
                one: 'Se reconoció {count} shader de Modrinth.',
                other: 'Se reconocieron {count} shaders de Modrinth.',
            },
        },
    },
    target: {
        describe: '{loader} {loaderVersion} · Minecraft {gameVersion}',
        picked: 'El contenido se elige para {target}.',
        noLoader:
            'Este perfil juega Minecraft {gameVersion}, que no tiene cargador de mods, así que solo se ofrecen paquetes de recursos y shaders. Para usar mods, instala Fabric, Forge, NeoForge o Quilt con su instalador y luego elige esa versión para el perfil en Perfiles.',
        unknownVersion:
            'TMods todavía no sabe qué versión de Minecraft es {versionId}. Abre Perfiles una vez para que cargue la lista de versiones, o elige una versión concreta para este perfil.',
        noVersions:
            'Todavía no hay ninguna versión de Minecraft instalada. Juega una vez con el Minecraft Launcher, o instala Fabric, Forge, NeoForge o Quilt para usar mods, y luego vuelve aquí.',
        question: '¿Con qué versión instalada juegas esta carpeta?',
        pick: 'Elige una versión',
        use: 'Usar',
    },
    shaders: {
        loader: 'Mod de shaders',
        helpWithLoader:
            'Los shaders solo funcionan con un mod de shaders instalado: Iris en Fabric, Quilt o NeoForge (búscalo en Mods), Oculus en Forge, u OptiFine.',
        helpNoLoader:
            'Los shaders solo funcionan con un mod de shaders: OptiFine, o Iris en un cargador de mods como Fabric.',
    },
    install: {
        button: 'Instalar',
        installed: 'Instalado',
        ariaLabel: 'Instalar {title} ({noun})',
        warningTitle: '¿Instalar {title} de todos modos?',
        anyway: 'Instalar de todos modos',
        done: 'Se instaló {title}.',
        doneWith: 'Se instaló {title} con {dependencies}.',
        needsLoader: 'Configura arriba un cargador de mods para buscar mods.',
    },
    updates: {
        available: {
            one: 'Hay {count} actualización disponible.',
            other: 'Hay {count} actualizaciones disponibles.',
        },
        upToDate: 'Todo está al día.',
        updated: 'Se actualizó {titles}.',
    },
    remove: {
        confirm: '¿Quitar {title}?',
        done: 'Se quitó {titles}.',
    },
    adoptNone: 'No se encontró ninguno en Modrinth.',
    installed: {
        checkUpdates: 'Buscar actualizaciones',
        checkCompat: 'Comprobar compatibilidad',
        checkingCompat: 'Comprobando compatibilidad…',
        updateAll: 'Actualizar todo ({count})',
        whatsNew: 'Novedades de {title}',
        update: 'Actualizar',
        enable: 'Activar',
        disable: 'Desactivar',
        remove: 'Quitar',
        asDependency: '(lo necesita otro mod)',
        updateAvailable: 'Actualización disponible: {version}',
        byHand: 'Añadidos a mano',
        recognise: 'Reconocer',
        byHandHelp:
            'TMods no toca estos archivos. Si vienen de Modrinth, puede reconocerlos para que los actualices desde aquí.',
    },
    compat: {
        error: 'No se pudo comprobar la compatibilidad: {error}',
        none: 'No se encontraron problemas de compatibilidad.',
        found: {
            one: 'Se encontró {count} problema de compatibilidad. Aparece debajo de su mod.',
            other: 'Se encontraron {count} problemas de compatibilidad. Aparecen debajo de cada mod.',
        },
    },
    search: {
        error: 'No se pudo buscar en Modrinth: {error}',
        byline: 'de {author} · {downloads} descargas',
        nothing: 'No se encontró nada.',
        more: 'Más',
    },
    modpacks: {
        search: 'Buscar modpacks',
        packsHint: 'Para exportar, importar o publicar un archivo .mrpack, usa la página {link}.',
        packsLink: 'Packs',
    },
};

export default modrinth;
