import { useState, useCallback, useEffect } from 'react';
import { faceService } from '@/services/FaceService';
import { useSite } from '@/contexts/SiteContext';

export function useFace() {
    const { currentSite } = useSite();
    const [modelLoaded, setModelLoaded] = useState(faceService.isModelsLoaded());
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(faceService.getLoadError());

    // Check if enhanced mode is enabled for this site
    const enhancedMode = currentSite?.enhanced_face_recognition ?? false;

    // Check initial state
    useEffect(() => {
        setModelLoaded(faceService.isModelsLoaded());
        setError(faceService.getLoadError());
    }, []);

    const loadModels = useCallback(async () => {
        // Load appropriate models based on mode
        if (enhancedMode) {
            if (faceService.isEnhancedModelsLoaded()) {
                setModelLoaded(true);
                return true;
            }
        } else {
            if (faceService.isModelsLoaded()) {
                setModelLoaded(true);
                return true;
            }
        }

        setLoading(true);
        setError(null);

        try {
            if (enhancedMode) {
                console.log('useFace: Loading ENHANCED models (SsdMobilenetv1)...');
                await faceService.loadEnhancedModels();
            } else {
                console.log('useFace: Loading STANDARD models (TinyFaceDetector)...');
                await faceService.loadModels();
            }
            setModelLoaded(true);
            console.log('useFace: Models loaded successfully');
            return true;
        } catch (err: unknown) {
            const errorMsg = err instanceof Error ? err.message : 'Error cargando modelos de IA';
            setError(errorMsg);
            console.error('useFace: Load failed:', errorMsg);
            return false;
        } finally {
            setLoading(false);
        }
    }, [enhancedMode]);

    const getDescriptor = useCallback(async (imageElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement) => {
        try {
            if (enhancedMode) {
                return await faceService.getEnhancedDescriptor(imageElement);
            }
            return await faceService.getDescriptor(imageElement);
        } catch (err: unknown) {
            const errorMsg = err instanceof Error ? err.message : 'Error obteniendo descriptor facial';
            console.error('useFace: getDescriptor error:', errorMsg);
            setError(errorMsg);
            return undefined;
        }
    }, [enhancedMode]);

    const findMatch = useCallback(async (
        imageElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
        people: { id: string; face_descriptor: string | null }[]
    ): Promise<{ id: string; distance: number } | null> => {
        // Ensure models are loaded first
        const isLoaded = enhancedMode
            ? faceService.isEnhancedModelsLoaded()
            : faceService.isModelsLoaded();

        if (!isLoaded) {
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
            // Pass enhancedMode flag to findMatch
            return await faceService.findMatch(imageElement, enhancedMode);
        } catch (err: unknown) {
            const errorMsg = err instanceof Error ? err.message : 'Error en reconocimiento facial';
            console.error('useFace: findMatch error:', errorMsg);
            setError(errorMsg);
            throw err;
        }
    }, [loadModels, enhancedMode]);

    return {
        loadModels,
        getDescriptor,
        findMatch,
        modelLoaded,
        loading,
        error,
        enhancedMode, // Expose so UI can show indicator if needed
        clearError: () => setError(null)
    };
}
