const common = {
    save: 'Guardar',
    saved: 'Guardado.',
    cancel: 'Cancelar',
    close: 'Cerrar',
    keepVersion: {
        keep: 'Mantener esta versión',
        allow: 'Permitir actualizaciones',
        keepHelp:
            'Quédate en la versión que tienes. Las más nuevas no se ofrecen ni se instalan hasta que vuelvas a permitir actualizaciones.',
        allowHelp: 'Volver a ofrecer e instalar versiones más nuevas.',
        kept: 'Versión fijada',
        keeping: 'Se mantiene {version}',
        keepingNewer: 'Se mantiene {version} (ya salió {latest})',
    },
    replaceContent: {
        title: '¿Reemplazar lo que tienes?',
        intro: 'Esto se instala en {folders}.',
        replace: 'Reemplazar el contenido existente',
        replaceHelp:
            'Primero se quita lo que hay ahora en esas carpetas, así que solo quedan los archivos nuevos. Se hace una copia de seguridad para poder deshacerlo.',
        keepHelp:
            'Los archivos nuevos se añaden junto a lo que tienes. Los que tengan el mismo nombre se sobrescriben, y antes se hace una copia de seguridad.',
        confirm: 'Instalar',
    },
    changelog: {
        whatsNew: 'Novedades',
        noneForUpdate: 'No se publicó ningún registro de cambios para esta actualización.',
        noneForVersion: 'No hay registro de cambios para esta versión.',
        loadFailed: 'No se pudo cargar el registro de cambios: {message}',
    },
};

export default common;
