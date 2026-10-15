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
    integrity: {
        unchanged: 'Sin cambios',
        unchangedHelp: 'Los archivos del disco son idénticos, byte a byte, a los que se descargaron.',
        modified: 'Modificado',
        modifiedBecause: 'No es igual a la descarga: {reasons}.',
        untracked: 'Sin comprobar',
        untrackedHelp:
            'Se instaló antes de que TMods guardara registro de los archivos que descarga. Descarga esta versión de nuevo para comprobarla a partir de ahora.',
        andMore: 'y {count} más',
        reasons: {
            merged: {
                one: 'se añadió a {count} archivo que ya tenías',
                other: 'se añadió a {count} archivos que ya tenías',
            },
            changed: { one: '{count} archivo cambiado', other: '{count} archivos cambiados' },
            added: { one: '{count} archivo añadido', other: '{count} archivos añadidos' },
            removed: { one: '{count} archivo eliminado', other: '{count} archivos eliminados' },
        },
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
