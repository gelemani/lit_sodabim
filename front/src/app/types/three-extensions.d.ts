import { BufferGeometry, Vector3, Raycaster, Intersection, Object3D, Object3DEventMap, Event } from 'three';
import '../types/three-extensions';

declare module 'three' {
    interface BufferGeometry {
        computeBoundsTree: () => void;
        disposeBoundsTree: () => void;
        acceleratedRaycast: (raycaster: Raycaster, intersects: Intersection<Object3D<Event>>[]) => void;
    }
} 