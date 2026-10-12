const settings = {
    title: 'Ajustes',
    description:
        'El manifiesto indica los mods, configuraciones y packs que puedes descargar. Al cambiarlo se comprueba antes de guardar.',
    language: {
        title: 'Idioma',
        label: 'Idioma',
        system: 'Idioma del sistema ({name})',
    },
    firstRun: {
        title: 'Te damos la bienvenida a TMods Loader',
        description: 'Escribe la URL de tu manifiesto para empezar. Puedes cambiarla más tarde en Ajustes.',
    },
    manifest: {
        label: 'URL del manifiesto',
    },
    bundlesRepo: {
        title: 'Tu repositorio de bundles',
        descriptionBefore:
            'Publica perfiles desde la pestaña Modpacks de la página de Modrinth directamente en tu repositorio de bundles de GitHub. Crea un',
        tokenLink: 'token de acceso detallado (fine-grained)',
        descriptionAfter:
            'solo para ese repositorio, con el permiso Contents en lectura y escritura. TMods lo guarda cifrado en este equipo.',
        repository: 'Repositorio',
        token: 'Token de GitHub',
        tokenSaved: 'Token de GitHub (guardado; pega uno nuevo para reemplazarlo)',
        save: 'Guardar y comprobar',
        forget: 'Olvidar token',
        needToken: 'Añade un token de GitHub para publicar.',
        ready: 'Listo para publicar en {repo}.',
    },
    logs: {
        title: 'Registros',
        description: 'Adjunta el archivo de registro cuando informes de un error.',
        location: 'Ubicación del archivo de registro',
        finding: 'Buscando el archivo de registro…',
        open: 'Abrir registro',
        openFolder: 'Abrir carpeta de registros',
    },
};

export default settings;
