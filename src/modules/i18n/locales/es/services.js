// Mensajes de los servicios (src/modules/services): errores, avisos y etiquetas que las
// páginas muestran tal cual.
const services = {
    manifest: {
        notFound:
            'No se encontró nada en esa dirección (404). Revisa el enlace y que el repositorio de bundles haya publicado una release.',
        serverError:
            'El servidor no respondió bien (estado {status}). Suele ser algo pasajero, así que vuelve a intentarlo en un minuto.',
        invalidUrl: 'Esa no es una URL válida.',
        badProtocol: 'La URL debe empezar por http:// o https://.',
        loadFailed: 'No se pudo cargar el manifiesto: {reason}',
        notManifest: 'La URL cargó, pero no es un manifiesto de TMods (no tiene el campo "versions").',
    },
    manifests: {
        urlRequired: 'Escribe la URL del manifiesto.',
        gone: 'Ese manifiesto ya no está guardado.',
        lastOne: 'Añade otro manifiesto antes de quitar este. TMods necesita al menos uno.',
    },
    modCompat: {
        versionRange: '{from} a {to}',
        or: ' o ',
        wrongLoaderAndGame: 'Hecho para {loaders} en Minecraft {versions}, pero este perfil juega {target}.',
        wrongLoader: 'Hecho para {loaders}, pero este perfil usa {loader}.',
        wrongGame: 'Hecho para Minecraft {versions}, pero este perfil juega {gameVersion}.',
        noVersionYet: 'Todavía no tiene versión para {target}.',
        needsDisabled: 'Necesita {title}, que está desactivado.',
        needsMissing: 'Necesita {title}, que no está instalado.',
        maybeHandAdded: 'Si lo añadiste a mano desde otro sitio, puedes ignorar esto.',
        needsUnavailable: 'Necesita {title}, que no está instalado y no tiene versión para {target}.',
        incompatible: 'No funciona junto con {title}.',
        clashesWithInstalled: 'Dice que no funciona junto con {title}, que está instalado.',
        installedClashes: '{title}, que está instalado, dice que no funciona junto con este mod.',
        refuseRename: 'No se cambiará el nombre de "{fileName}".',
        unknownFix: 'Arreglo desconocido "{type}".',
        fix: {
            disable: 'Desactivar',
            enable: 'Activar {title}',
            install: 'Instalar {title}',
            switchVersion: 'Cambiar a {version}',
        },
        done: {
            switched: 'Se cambió {title} a {version}.',
            installed: 'Se instaló {titles}.',
            enabled: 'Se activó {title}.',
            disabled: 'Se desactivó {title}.',
        },
    },
    modrinth: {
        kinds: {
            mod: { label: 'Mods', noun: 'mod' },
            resourcepack: { label: 'Paquetes de recursos', noun: 'paquete de recursos' },
            shader: { label: 'Shaders', noun: 'shader' },
        },
    },
    modrinthMods: {
        refuseFileName: 'No se guardará un archivo llamado "{name}".',
        checksumMismatch: 'El archivo de {url} no coincide con su checksum.',
        noDownloadLink: 'El archivo no tiene enlace de descarga.',
        aMod: 'un mod',
        dependencyUnavailable: 'Necesita {name}, que no tiene versión para {target}.',
        incompatible: 'No funciona junto con {name}.',
        thisKind: {
            mod: 'Este mod',
            resourcepack: 'Este paquete de recursos',
            shader: 'Este shader',
        },
        alreadyInstalled: '{name} ya está instalado.',
        noVersion: '{name} no tiene versión para {target}.',
        notInstalledAnymore: 'Eso ya no está instalado.',
    },
    mrpack: {
        unsafePath: 'El pack contiene una ruta de archivo no segura: {path}',
        stateFolderPath: 'El pack contiene un archivo en la carpeta propia de TMods: {path}',
        noIndex: 'Esto no es un modpack de Modrinth (no contiene modrinth.index.json).',
        badIndexJson: 'El modrinth.index.json del modpack no es un JSON válido.',
        unknownFormat: 'Este modpack está en un formato que TMods no conoce.',
        noGameVersion: 'El modpack no dice para qué versión de Minecraft es.',
        notZip: 'Este archivo no es un modpack (no es un zip).',
        noChecksum: 'El pack incluye {path} sin checksum.',
        untrustedHost: 'El pack descarga {path} desde un sitio en el que TMods no confía.',
        warnings: {
            gameVersion: 'El pack es para Minecraft {packVersion}, pero {profile} juega {gameVersion}.',
            otherLoader: 'El pack necesita {loader}, pero {profile} usa {profileLoader}.',
            noLoader: 'El pack necesita {loader}, pero {profile} no tiene cargador de mods.',
        },
        backupGone: 'Esa copia de seguridad ya no existe.',
        loaderWanted: '{loader} {loaderVersion} para Minecraft {gameVersion}',
        loaderNote: {
            usedInstalled: 'El pack pide {wanted}; TMods usó la versión de {loader} que ya tienes instalada.',
            install: 'Instala {wanted} y luego elígelo para este perfil en Perfiles.',
        },
        profileGone: 'Ese perfil ya no existe.',
        noVersionToDownload: '{title} no tiene ninguna versión para descargar.',
        corruptDownload: 'La descarga de {id} está dañada (su checksum no coincide).',
        unknownGameVersion:
            'TMods no sabe qué versión de Minecraft juega este perfil. Elígela en la página de Modrinth.',
        pickLoaderVersion: 'Elige la versión del cargador con la que juega este perfil antes de exportar mods.',
    },
    bundleInstaller: {
        corruptDownload: 'La descarga de {id} está dañada (su checksum no coincide).',
        notZip: 'La descarga de {id} no es un zip válido.',
        backupNotFound: 'No se encontró la copia de seguridad {id} de {category}',
    },
    bundlePublish: {
        packsCategory: 'Packs (pack completo)',
        nothingFor: 'El pack no tiene nada que vaya en {category}.',
        tooLarge:
            'El pack ocupa {size} MB y GitHub acepta archivos de hasta 100 MB. Deja fuera los archivos grandes que se copian en vez de enlazarse desde Modrinth.',
    },
    profiles: {
        defaultName: 'Predeterminado (.minecraft)',
        nameRequired: 'Ponle un nombre al perfil.',
        defaultNotEditable: 'El perfil predeterminado no se puede cambiar.',
        defaultNotDeletable: 'El perfil predeterminado no se puede eliminar.',
        profileGone: 'Ese perfil ya no existe.',
        unreadableLauncherFile: 'No se pudo leer {file}: {reason}',
    },
    gameVersions: {
        badFormat: 'La lista de versiones de Minecraft tiene un formato inesperado.',
        latestRelease: 'Última versión',
        latestSnapshot: 'Última snapshot',
        installed: 'instalada',
        types: {
            snapshot: 'snapshot',
            old_beta: 'beta',
            old_alpha: 'alfa',
        },
    },
    fabric: {
        noStableLoader: 'Fabric no tiene un cargador estable para Minecraft {gameVersion}.',
        invalidGameVersion: 'Versión de Minecraft no válida: {version}',
        invalidLoaderVersion: 'Versión del cargador de Fabric no válida: {version}',
        unexpectedProfile: 'Fabric envió un perfil de launcher inesperado para Minecraft {gameVersion}.',
    },
};

export default services;
