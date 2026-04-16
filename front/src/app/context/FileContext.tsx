import React, { createContext, useState, ReactNode } from 'react';

interface FileContextType {
    currentFileId: number | null;
    setCurrentFileId: (id: number | null) => void;
}

export const FileContext = createContext<FileContextType>({
    currentFileId: null,
    setCurrentFileId: () => {},
});

interface FileProviderProps {
    children: ReactNode;
}

export const FileProvider: React.FC<FileProviderProps> = ({ children }) => {
    const [currentFileId, setCurrentFileId] = useState<number | null>(null);

    return (
        <FileContext.Provider value={{ currentFileId, setCurrentFileId }}>
            {children}
        </FileContext.Provider>
    );
}; 