import { useState, useCallback, useEffect } from 'react';
import { faceService } from '@/services/FaceService';

export function useFace() {
    const [modelLoaded, setModelLoaded] = useState(faceService.isModelsLoaded());
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(faceService.getLoadError());

    // Check initial state
    useEffect(() => {
        setModelLoaded(faceService.isModelsLoaded());
        setError(faceService.getLoadError());
    }, []);

    const loadModels = useCallback(async () => {
        if (faceService.isModelsLoaded()) {
            setModelLoaded(true);
            return true;
        }

        setLoading(true);
        setError(null);

        try {
            console.log('useFace: Loading models...');
            await faceService.loadModels();
            setModelLoaded(true);
            console.log('useFace: Models loaded successfully');
            return true;
        } catch (err: any) {
            const errorMsg = err?.message || 'Error cargando modelos de IA';
            setError(errorMsg);
            console.error('useFace: Load failed:', errorMsg);
            return false;
        } finally {
            setLoading(false);
        }
    }, []);

    const getDescriptor = useCallback(async (imageElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement) => {
        try {
            return await faceService.getDescriptor(imageElement);
        } catch (err: any) {
            console.error('useFace: getDescriptor error:', err);
            setError(err?.message || 'Error obteniendo descriptor facial');
            return undefined;
        }
    }, []);

    const findMatch = useCallback(async (
        imageElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
        people: { id: string; face_descriptor: string | null }[]
    ): Promise<{ id: string; distance: number } | null> => {
        // Ensure models are loaded first
        if (!faceService.isModelsLoaded()) {
            console.log('useFace: Models not loaded, loading now...');
            const loaded = await loadModels();
            if (!loaded) {
                const errorMsg = faceService.getLoadError() || 'No se pudieron cargar los modelos de IA';
                console.error('useFace: Could not load models:', errorMsg);
                setError(errorMsg);
                throw new Error(errorMsg);
            }
        }

        try {
            await faceService.loadLabeledDescriptors(people);
            return await faceService.findMatch(imageElement);
        } catch (err: any) {
            const errorMsg = err?.message || 'Error en reconocimiento facial';
            console.error('useFace: findMatch error:', errorMsg);
            setError(errorMsg);
            throw err;
        }
    }, [loadModels]);

    return {
        loadModels,
        getDescriptor,
        findMatch,
        modelLoaded,
        loading,
        error,
        clearError: () => setError(null)
    };
}
