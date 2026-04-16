'use client';

import { useRouter } from 'next/navigation';

const useFileViewer = () => {
    const router = useRouter();

    const openFileInViewer = ({ file, url, fileId, projectId }: { file: File; url: string; fileId: number; projectId?: number }) => {
        console.log('Opening file in viewer:', { name: file.name, type: file.type, url, fileId, projectId });
        const ext = file.name.split('.').pop()?.toLowerCase();
        const target = ['ifc'].includes(ext || '') ? 'viewer' : 'docsViewer';

        // Сохраняем в sessionStorage сначала
        sessionStorage.setItem('viewerFileUrl', url);
        sessionStorage.setItem('viewerFileName', file.name);
        sessionStorage.setItem('viewerFileType', file.type);
        sessionStorage.setItem('viewerFileId', String(fileId));
        if (projectId != null) sessionStorage.setItem('viewerProjectId', String(projectId));

        // Потом открываем окно
        // router.push(`/${target}`);
        const viewerWindow = window.open(`/${target}`);
        // const viewerWindow = router.push(`/${target}`);
        if (!viewerWindow) {
            alert("Браузер заблокировал всплывающее окно. Разрешите его вручную.");
        }
    };

    return { openFileInViewer };
};

export default useFileViewer;
