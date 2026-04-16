import { Scene, Camera, WebGLRenderer, GridHelper, AxesHelper, BufferGeometry } from 'three';

declare global {
    interface BufferGeometry {
        computeBoundsTree: () => void;
        disposeBoundsTree: () => void;
        acceleratedRaycast: (box: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }) => boolean;
    }
}

declare module 'web-ifc-three/IFCViewer' {
    export class IFCViewer {
        constructor(container: HTMLElement);
        context: {
            getScene: () => Scene;
            getCamera: () => Camera;
            getRenderer: () => WebGLRenderer;
            items: {
                pickableIfcModels: any[];
            };
        };
        IFC: {
            loader: {
                ifcManager: {
                    getAllItemsOfType: (modelID: number, type: number, verbose: boolean) => Promise<any[]>;
                    createSubset: (config: {
                        modelID: number;
                        ids: number[];
                        scene: Scene;
                        removePrevious: boolean;
                        customID: string;
                    }) => Promise<any>;
                    setWasmPath: (path: string) => void;
                    loadIfcUrl: (url: string) => Promise<number>;
                    getSpatialStructure: (modelID: number) => Promise<any>;
                };
            };
            selector: {
                highlightIfcItemsByID: (modelID: number, ids: number[], highlight: boolean, removePrevious: boolean) => Promise<void>;
            };
        };
        grid: GridHelper & {
            setGrid: (visible: boolean) => void;
        };
        axes: AxesHelper & {
            setAxes: (visible: boolean) => void;
        };
        ifcCamera: {
            controls: {
                target: { x: number; y: number; z: number };
                update: () => void;
            };
        };
        dispose: () => void;
    }
}

declare module 'web-ifc-three/IFCLoader' {
    export class IFCLoader {
        constructor();
        ifcManager: {
            getAllItemsOfType: (modelID: number, type: number, verbose: boolean) => Promise<any[]>;
            createSubset: (config: {
                modelID: number;
                ids: number[];
                scene: Scene;
                removePrevious: boolean;
                customID: string;
            }) => Promise<any>;
            setWasmPath: (path: string) => void;
            loadIfcUrl: (url: string) => Promise<number>;
            getSpatialStructure: (modelID: number) => Promise<any>;
        };
    }
} 