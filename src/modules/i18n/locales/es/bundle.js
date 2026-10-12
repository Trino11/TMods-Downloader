const bundle = {
    refresh: 'Actualizar',
    download: 'Descargar',
    downloaded: 'Descargado',
    whatsNewIn: 'Novedades de {version}',
    backups: {
        title: 'Copias de seguridad',
        empty: 'Aún no hay copias de seguridad. Se hace una cada vez que instalas una versión.',
        restore: 'Restaurar',
        noVersion: 'Sin versión instalada',
    },
    restore: {
        confirmVersion:
            '¿Reemplazar tus {content} actuales por la versión {version} del {date}? Antes se hace una copia de seguridad de tus archivos actuales.',
        confirmBackup:
            '¿Reemplazar tus {content} actuales por la copia de seguridad del {date}? Antes se hace una copia de seguridad de tus archivos actuales.',
    },
    errors: {
        loadVersions: 'No se pudo cargar la lista de versiones: {message}',
        install: 'No se pudo instalar {version}: {message}',
        restore: 'No se pudo restaurar la copia de seguridad: {message}',
    },
};

export default bundle;
