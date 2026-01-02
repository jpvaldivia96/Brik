import { useState, useCallback } from 'react';
import { faceService } from '@/services/FaceService';

export function useFace() {
    const [modelLoaded, setModelLoaded] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadModels = useCallback(async () => {
        if (modelLoaded) return;
        setLoading(true);
        try {
            await faceService.loadModels();
            setModelLoaded(true);
        } catch (err) {
            setError('Error cargando modelos de IA');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [modelLoaded]);

    const getDescriptor = useCallback(async (imageElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement) => {
        try {
            return await faceService.getDescriptor(imageElement);
        } catch (err) {
            console.error(err);
            return undefined;
        }
    }, []);

    const findMatch = useCallback(async (
        imageElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
        people: { id: string; face_descriptor: string | null }[]
    ) => {
        try {
            await faceService.loadLabeledDescriptors(people);
            return await faceService.findMatch(imageElement);
        } catch (err) {
            console.error(err);
            return null;
        }
    }, []);

    return {
        loadModels,
        getDescriptor,
        findMatch,
        modelLoaded,
        loading,
        error
    };
}
